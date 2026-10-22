/**
 * Low-level HTTP helpers for the control_room app.
 *
 * Builds request URLs from `env.apiBaseUrl` (see src/config/env.ts, task 15.1)
 * and provides a `refreshAccessToken` helper that calls `POST /api/auth/refresh`
 * exactly as the existing passenger/driver apps do, for reuse by later
 * dispatch API calls (task 15.3+).
 */

import { env } from '../config/env'
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshTokenValue,
} from './tokens'

export class ApiError extends Error {
  status: number
  data: unknown

  constructor(message: string, status: number, data: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

function buildUrl(path: string): string {
  const base = env.apiBaseUrl.replace(/\/$/, '')
  return `${base}${path}`
}

/**
 * Derives the WebSocket base URL (`ws://` or `wss://`) from `env.apiBaseUrl`,
 * mirroring `getWsBaseUrl` in the existing passenger_app/driver_app
 * (`src/lib/api.ts`): an `https://` API base becomes `wss://`, an `http://`
 * API base becomes `ws://`. Used by the `/ws/dispatch` client wrapper
 * (task 15.3).
 */
export function getWsBaseUrl(): string {
  const base = env.apiBaseUrl.replace(/\/$/, '')
  if (!base) throw new Error('VITE_API_BASE_URL is missing')
  if (base.startsWith('https://')) return `wss://${base.slice('https://'.length)}`
  if (base.startsWith('http://')) return `ws://${base.slice('http://'.length)}`
  return base
}

interface RequestOptions {
  method?: string
  body?: unknown
  auth?: boolean
}

async function parseResponse(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function requestOnce(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.auth !== false) {
    const token = getAccessToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }
  return fetch(buildUrl(path), {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  })
}

let refreshingPromise: Promise<string | null> | null = null

/**
 * Calls `POST /api/auth/refresh` with the stored refresh token, the same way
 * the existing passenger/driver apps do. On success, stores the rotated
 * access/refresh tokens and returns the new access token. On failure, clears
 * stored tokens and returns null.
 */
export async function refreshAccessToken(): Promise<string | null> {
  if (refreshingPromise) return refreshingPromise

  refreshingPromise = (async () => {
    const refreshToken = getRefreshToken()
    if (!refreshToken) return null

    const res = await fetch(buildUrl('/api/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
    if (!res.ok) {
      clearTokens()
      return null
    }
    const data = (await parseResponse(res)) as {
      access_token?: string
      token?: string
      refresh_token?: string
    } | null
    const newAccessToken = data?.access_token ?? data?.token ?? null
    setAccessToken(newAccessToken)
    setRefreshTokenValue(data?.refresh_token ?? null)
    return newAccessToken
  })()

  try {
    return await refreshingPromise
  } finally {
    refreshingPromise = null
  }
}

/**
 * Issues an authenticated (unless `auth: false`) request against the backend
 * API, transparently retrying once via `refreshAccessToken` on a 401.
 */
export async function apiRequest<T = unknown>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  let res = await requestOnce(path, opts)

  if (res.status === 401 && opts.auth !== false) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      res = await requestOnce(path, opts)
    }
  }

  const data = await parseResponse(res)
  if (!res.ok) {
    const detail =
      data && typeof data === 'object' && 'detail' in data
        ? (data as { detail: unknown }).detail
        : res.statusText
    const message = typeof detail === 'string' ? detail : JSON.stringify(detail)
    throw new ApiError(message, res.status, data)
  }
  return data as T
}

/**
 * Downloads the official Regional Transport Authority (RTA) / Punjab Transport statutory booking audit log in CSV format.
 */
export async function downloadTransportAuditCsv(start?: string, end?: string): Promise<void> {
  const token = getAccessToken()
  const params = new URLSearchParams()
  if (start) params.set('start', start)
  if (end) params.set('end', end)
  params.set('format', 'csv')
  const base = env.apiBaseUrl.replace(/\/$/, '')
  const url = `${base}/api/dispatch/compliance/transport-audit-export?${params.toString()}`

  const res = await fetch(url, {
    headers: {
      Authorization: token ? `Bearer ${token}` : '',
    },
  })
  if (!res.ok) {
    throw new Error(`Failed to download statutory audit log: ${res.statusText}`)
  }
  const blob = await res.blob()
  const downloadUrl = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = downloadUrl
  const today = new Date().toISOString().split('T')[0]
  a.download = `watan_transport_authority_audit_${today}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(downloadUrl)
}

