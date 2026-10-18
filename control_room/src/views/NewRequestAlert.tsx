import { useCallback, useEffect, useRef, useState } from 'react'
import { dispatchSocket } from '../lib/dispatchSocket'
import type { DispatchEvent } from '../lib/dispatchSocket'
import './NewRequestAlert.css'

/**
 * Minimal shape of the `ride` payload carried on a `ride.created` dispatch
 * event (see backend/app/routers/rides.py: request_ride, which publishes
 * `{"event": "ride.created", "ride": clean_doc(ride)}` on the dispatch
 * channel). Only the fields this alert displays are declared here; the
 * full ride document has many more fields consumed by other views (16.1).
 */
interface RideCreatedRide {
  id: string
  passenger_name?: string
  pickup?: { address?: string }
  destination?: { address?: string }
}

interface AlertToast {
  id: string
  ride: RideCreatedRide
}

const AUTO_DISMISS_MS = 20000

/**
 * Toast/banner alert that fires whenever a `ride.created` dispatch event
 * arrives over the shared `/ws/dispatch` connection (see
 * `src/lib/dispatchSocket.ts`, task 15.3). Purely client-side UI per
 * design.md's Key views table (Requirement 10.1) -- not backend-testable.
 *
 * Mounted once inside `DashboardShell` so it is visible for the whole
 * duration of a logged-in dispatcher session. It calls `connect()` on
 * mount (a no-op if the socket is already connecting/connected) and
 * cleans up its own event subscription -- but not the shared connection,
 * which other views also depend on -- on unmount.
 */
export function NewRequestAlert() {
  const [toasts, setToasts] = useState<AlertToast[]>([])
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  useEffect(() => {
    dispatchSocket.connect()

    const unsubscribe = dispatchSocket.on('ride.created', (message: DispatchEvent) => {
      const ride = (message as { ride?: RideCreatedRide }).ride
      if (!ride || typeof ride.id !== 'string') return

      const toastId = `${ride.id}-${Date.now()}`
      setToasts((prev) => [...prev, { id: toastId, ride }])

      const timer = setTimeout(() => dismiss(toastId), AUTO_DISMISS_MS)
      timers.current.set(toastId, timer)
    })

    return () => {
      unsubscribe()
      for (const timer of timers.current.values()) clearTimeout(timer)
      timers.current.clear()
    }
  }, [dismiss])

  if (toasts.length === 0) return null

  return (
    <div className="new-request-alerts" role="region" aria-label="New ride request alerts">
      {toasts.map((toast) => (
        <div key={toast.id} className="new-request-alert" role="alert">
          <div className="new-request-alert-body">
            <strong>New ride request</strong>
            <span>
              {toast.ride.passenger_name ?? 'Passenger'} ·{' '}
              {toast.ride.pickup?.address ?? 'Unknown pickup'}
              {toast.ride.destination?.address ? ` → ${toast.ride.destination.address}` : ''}
            </span>
          </div>
          <button
            type="button"
            className="new-request-alert-dismiss"
            onClick={() => dismiss(toast.id)}
            aria-label="Dismiss alert"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
