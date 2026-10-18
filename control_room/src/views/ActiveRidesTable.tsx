import { useEffect, useState, useCallback } from 'react'
import { apiRequest, ApiError } from '../lib/api'
import { dispatchSocket } from '../lib/dispatchSocket'
import type { DispatchEvent } from '../lib/dispatchSocket'
import { ReassignModal } from './ReassignModal'
import './ActiveRidesTable.css'

/**
 * Shape of a single entry in `GET /api/dispatch/rides/active`'s `rides`
 * array (backend/app/routers/dispatch.py: list_active_rides, task 5.2). The
 * endpoint returns a `clean_doc(ride)` for every ride with `status` in
 * `accepted`/`arrived`/`in_progress`; only the fields this table renders
 * are declared here.
 */
export interface ActiveRide {
  id: string
  passenger_name?: string
  passenger_rating?: number
  driver_id?: string | null
  driver_name?: string | null
  driver_rating?: number | null
  driver_lat?: number | null
  driver_lng?: number | null
  pickup?: { lat?: number; lng?: number; address?: string }
  destination?: { lat?: number; lng?: number; address?: string }
  ride_type?: string
  fare?: number
  status: string
}

interface ActiveRidesResponse {
  rides: ActiveRide[]
}

/**
 * Payload of a `ride.updated` dispatch event. Some emitters (driver.py:
 * accept_ride/complete_ride, dispatch.py: force_cancel_ride/reassign_ride)
 * publish the full `ride` document; others (driver.py: arrive_ride/
 * start_ride) publish only `{ride_id, status}`. Location-only updates
 * (driver.py: update_driver_location) publish `{ride_id, lat, lng}` on the
 * `driver.location` event instead.
 */
interface RideUpdatedPayload {
  ride?: ActiveRide
  ride_id?: string
  status?: string
}

interface DriverLocationPayload {
  ride_id?: string
  lat?: number
  lng?: number
}

const ACTIVE_STATUSES = new Set(['accepted', 'arrived', 'in_progress'])

/**
 * Renders `GET /api/dispatch/rides/active`, live-updated from
 * `ride.updated`/`driver.location` dispatch events over the shared
 * `/ws/dispatch` connection: a status/full-document update patches the
 * matching row (or removes it once the ride leaves the active-status set,
 * i.e. completed/cancelled), and a location update patches just the
 * driver's coordinates. Exposes a "Force cancel" row action calling
 * `POST /api/dispatch/rides/{id}/cancel`, surfacing errors inline per row.
 * "Reassign" is a disabled placeholder pending task 16.5's `ReassignModal`.
 *
 * _Requirements: 5.1, 5.2_
 */
export function ActiveRidesTable() {
  const [rides, setRides] = useState<ActiveRide[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Per-row state for the "Force cancel" action, keyed by ride id.
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})

  // The active ride currently being reassigned via `ReassignModal`, or null
  // when the modal is closed.
  const [reassigningRide, setReassigningRide] = useState<ActiveRide | null>(null)

  const load = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true)
    setError(null)
    try {
      const data = await apiRequest<ActiveRidesResponse>('/api/dispatch/rides/active')
      setRides(data.rides)
    } catch {
      if (!isBackground) setError('Failed to load active rides.')
    } finally {
      if (!isBackground) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), 4000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    dispatchSocket.connect()

    const unsubscribeUpdated = dispatchSocket.on('ride.updated', (message: DispatchEvent) => {
      const payload = message as RideUpdatedPayload
      const rideId = payload.ride?.id ?? payload.ride_id
      if (!rideId) return

      const nextStatus = payload.ride?.status ?? payload.status
      if (nextStatus && !ACTIVE_STATUSES.has(nextStatus)) {
        // The ride transitioned to completed/cancelled -- it's no longer
        // active, so drop the row.
        setRides((prev) => prev.filter((r) => r.id !== rideId))
        return
      }

      setRides((prev) => {
        const existing = prev.find((r) => r.id === rideId)
        if (payload.ride) {
          // Full document: an accept_ride transition (pending -> accepted)
          // moves a ride INTO this table for the first time, so insert it
          // if it isn't already present rather than only patching.
          if (existing) {
            return prev.map((r) => (r.id === rideId ? { ...r, ...payload.ride } : r))
          }
          return [...prev, payload.ride]
        }
        if (!existing) return prev
        // Partial {ride_id, status} update (arrive/start): patch status only.
        return prev.map((r) => (r.id === rideId ? { ...r, status: nextStatus ?? r.status } : r))
      })
    })

    const unsubscribeLocation = dispatchSocket.on('driver.location', (message: DispatchEvent) => {
      const payload = message as DriverLocationPayload
      const rideId = payload.ride_id
      if (!rideId || payload.lat === undefined || payload.lng === undefined) return
      setRides((prev) =>
        prev.map((r) => (r.id === rideId ? { ...r, driver_lat: payload.lat!, driver_lng: payload.lng! } : r)),
      )
    })

    return () => {
      unsubscribeUpdated()
      unsubscribeLocation()
    }
  }, [])

  const handleForceCancel = async (ride: ActiveRide) => {
    setCancellingId(ride.id)
    setRowErrors((prev) => {
      const next = { ...prev }
      delete next[ride.id]
      return next
    })
    try {
      await apiRequest(`/api/dispatch/rides/${ride.id}/cancel`, { method: 'POST', body: {} })
      // The dispatch fan-out (`ride.updated`) will also remove this row;
      // remove it immediately too so the UI doesn't wait on that event.
      setRides((prev) => prev.filter((r) => r.id !== ride.id))
    } catch (err) {
      let message = 'Failed to cancel ride.'
      if (err instanceof ApiError && err.status === 409) {
        message = 'Ride state has already changed — it may have just completed or been cancelled.'
      } else if (err instanceof ApiError) {
        message = err.message
      }
      setRowErrors((prev) => ({ ...prev, [ride.id]: message }))
    } finally {
      setCancellingId(null)
    }
  }

  return (
    <div className="active-rides-view">
      <h2>Active Rides</h2>

      {loading && <p>Loading active rides…</p>}
      {error && (
        <p className="active-rides-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && rides.length === 0 && <p>No active rides.</p>}

      {!loading && !error && rides.length > 0 && (
        <table className="active-rides-table">
          <thead>
            <tr>
              <th>Passenger</th>
              <th>Driver</th>
              <th>Status</th>
              <th>Driver location</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rides.map((ride) => (
              <tr key={ride.id}>
                <td>{ride.passenger_name ?? 'Unknown'}</td>
                <td>{ride.driver_name ?? 'Unknown'}</td>
                <td>
                  <span className={`active-ride-status-badge status-${ride.status}`}>{ride.status}</span>
                </td>
                <td>
                  {ride.driver_lat != null && ride.driver_lng != null
                    ? `${ride.driver_lat.toFixed(4)}, ${ride.driver_lng.toFixed(4)}`
                    : 'Unavailable'}
                </td>
                <td>
                  <div className="active-rides-actions">
                    <button
                      type="button"
                      onClick={() => handleForceCancel(ride)}
                      disabled={cancellingId === ride.id}
                    >
                      {cancellingId === ride.id ? 'Cancelling…' : 'Force cancel'}
                    </button>
                    <button type="button" onClick={() => setReassigningRide(ride)}>
                      Reassign
                    </button>
                  </div>
                  {rowErrors[ride.id] && (
                    <p className="active-rides-row-error" role="alert">
                      {rowErrors[ride.id]}
                    </p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {reassigningRide && (
        <ReassignModal
          ride={reassigningRide}
          onClose={() => setReassigningRide(null)}
          onSuccess={(result) => {
            // Both outcomes ("reassigned" and the Requirement 5.5
            // auto-cancel "cancelled" fallback) mean this ride is no longer
            // driven by its previous driver in the active list's current
            // form; the dispatch fan-out (`ride.updated`) will also patch/
            // remove the row, but update immediately so the UI doesn't wait.
            setRides((prev) => prev.filter((r) => r.id !== result.ride.id))
            setReassigningRide(null)
          }}
        />
      )}
    </div>
  )
}
