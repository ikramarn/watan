/**
 * WebSocket client wrapper + event bus for `/ws/dispatch`.
 *
 * Per design.md section 6 ("WebSocket client"): opens
 * `wss://.../ws/dispatch?token={access_token}` (or `ws://` in local http
 * dev), mirroring the query-param token pattern already used by
 * passenger_app/driver_app for `/ws/rides/{id}` and `/ws/driver/{id}` (see
 * `getWsBaseUrl` in those apps' `src/lib/api.ts`, reproduced here as
 * `getWsBaseUrl` in `./api.ts`).
 *
 * The backend `/ws/dispatch` handler (routers/ws.py, task 9.1) sends
 * `{"event": "connected", "channel": "dispatch"}` on connect and closes with
 * 4401 (bad/missing token) or 4403 (wrong role) otherwise. Every message the
 * server sends is a `{"event": string, ...}` JSON object; this module
 * dispatches each one onto a small client-side event bus so multiple views
 * (pending list, active list, roster, ...) can all subscribe to the same
 * single socket connection without each view managing its own WebSocket.
 *
 * This module intentionally does NOT know about any specific dispatch event
 * names or view components (PendingRequestsTable, etc.) -- those are wired
 * up by later tasks (16.x) via `dispatchSocket.on(eventName, handler)`.
 */

import { getAccessToken } from './tokens'
import { getWsBaseUrl } from './api'

export interface DispatchEvent {
  event: string
  [key: string]: unknown
}

type Handler = (message: DispatchEvent) => void

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'closed'

const WS_PATH = '/ws/dispatch'

const INITIAL_RETRY_DELAY_MS = 1000
const MAX_RETRY_DELAY_MS = 30000

/**
 * Thin wrapper around a single `/ws/dispatch` WebSocket connection, plus a
 * subscribe/publish event bus for incoming `{"event": ...}` messages.
 *
 * Usage:
 *   dispatchSocket.connect()
 *   const unsubscribe = dispatchSocket.on('ride.created', (msg) => { ... })
 *   const unsubscribeAll = dispatchSocket.onAny((msg) => { ... })
 *   dispatchSocket.disconnect()
 */
class DispatchSocket {
  private ws: WebSocket | null = null
  private state: ConnectionState = 'idle'
  private handlers = new Map<string, Set<Handler>>()
  private anyHandlers = new Set<Handler>()
  private stateHandlers = new Set<(state: ConnectionState) => void>()
  private retryDelayMs = INITIAL_RETRY_DELAY_MS
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  /** Set to true by disconnect() to suppress reconnection attempts. */
  private manuallyClosed = false

  /**
   * Opens the `/ws/dispatch` connection using the current access token. If a
   * connection is already open or in progress, this is a no-op. Call
   * `disconnect()` first to force a fresh connection with a new token.
   */
  connect(): void {
    if (this.ws && (this.state === 'connecting' || this.state === 'connected')) return

    this.manuallyClosed = false
    this.clearReconnectTimer()

    const token = getAccessToken()
    if (!token) {
      // No token to connect with (e.g. logged out); do nothing until a
      // caller invokes connect() again after login.
      this.setState('closed')
      return
    }

    let url: string
    try {
      url = `${getWsBaseUrl()}${WS_PATH}?token=${encodeURIComponent(token)}`
    } catch {
      this.setState('closed')
      return
    }

    this.setState('connecting')
    const ws = new WebSocket(url)
    this.ws = ws

    ws.onopen = () => {
      this.retryDelayMs = INITIAL_RETRY_DELAY_MS
      this.setState('connected')
    }

    ws.onmessage = (evt) => {
      this.handleMessage(evt.data)
    }

    ws.onclose = () => {
      this.ws = null
      this.setState('closed')
      if (!this.manuallyClosed) this.scheduleReconnect()
    }

    ws.onerror = () => {
      // The subsequent close event (if any) drives reconnection; onerror
      // alone does not schedule a retry to avoid double-scheduling.
    }
  }

  /**
   * Closes the connection (if open) and stops any pending reconnect
   * attempts. Safe to call multiple times.
   */
  disconnect(): void {
    this.manuallyClosed = true
    this.clearReconnectTimer()
    this.retryDelayMs = INITIAL_RETRY_DELAY_MS
    if (this.ws) {
      const ws = this.ws
      this.ws = null
      ws.onopen = null
      ws.onmessage = null
      ws.onclose = null
      ws.onerror = null
      ws.close()
    }
    this.setState('idle')
  }

  /** Subscribes to messages with a specific `event` name. Returns an unsubscribe function. */
  on(eventName: string, handler: Handler): () => void {
    let set = this.handlers.get(eventName)
    if (!set) {
      set = new Set()
      this.handlers.set(eventName, set)
    }
    set.add(handler)
    return () => set!.delete(handler)
  }

  /** Subscribes to every incoming message regardless of `event` name. Returns an unsubscribe function. */
  onAny(handler: Handler): () => void {
    this.anyHandlers.add(handler)
    return () => this.anyHandlers.delete(handler)
  }

  /** Subscribes to connection state changes (idle/connecting/connected/closed). */
  onStateChange(handler: (state: ConnectionState) => void): () => void {
    this.stateHandlers.add(handler)
    return () => this.stateHandlers.delete(handler)
  }

  getState(): ConnectionState {
    return this.state
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as { event?: unknown }).event !== 'string') {
      return
    }
    const message = parsed as DispatchEvent

    for (const handler of this.anyHandlers) handler(message)

    const named = this.handlers.get(message.event)
    if (named) {
      for (const handler of named) handler(message)
    }
  }

  private setState(state: ConnectionState): void {
    this.state = state
    for (const handler of this.stateHandlers) handler(state)
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer()
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.retryDelayMs = Math.min(this.retryDelayMs * 2, MAX_RETRY_DELAY_MS)
      this.connect()
    }, this.retryDelayMs)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

/**
 * Singleton instance: the design calls for a single shared `/ws/dispatch`
 * connection feeding all dashboard views, so views import and subscribe to
 * this instance rather than constructing their own `DispatchSocket`.
 */
export const dispatchSocket = new DispatchSocket()
