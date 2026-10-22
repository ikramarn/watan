import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../lib/api'
import { dispatchSocket } from '../lib/dispatchSocket'
import type { DispatchEvent } from '../lib/dispatchSocket'
import { ManualAssignModal } from './ManualAssignModal'
import './PendingRequestsTable.css'

/**
 * Shape of a single entry in `GET /api/dispatch/rides/pending`'s `rides`
 * array (backend/app/routers/dispatch.py: list_pending_rides, tasks
 * 5.1/5.3/5.4). Every ride document field is passed through by
 * `clean_doc(ride)` plus three computed fields (`wait_seconds`,
 * `reservation`, `is_aging`); only the fields this table renders are
 * declared here.
 */
export interface PendingRide {
  id: string
  passenger_name?: string
  pickup?: { lat?: number; lng?: number; address?: string }
  destination?: { lat?: number; lng?: number; address?: string }
  ride_type?: string
  fare?: number
  status: string
  created_at?: string
  wait_seconds: number
  reservation: { reserved_by: string; reserved_until: string } | null
  is_aging: boolean
  /** "automatic" | "manual", per design.md's Data Models section; absent on legacy docs. */
  assignment_type?: string
  /** Dispatcher user id who manually assigned this ride; null/absent for automatic. */
  assigned_by?: string | null
}

interface PendingRidesResponse {
  rides: PendingRide[]
}

type RideTypeFilter = 'all' | 'economy' | 'premium' | 'xl'
type SortMode = 'none' | 'wait_time' | 'distance'

/**
 * Payload of a `ride.created` dispatch event (rides.py: request_ride). The
 * published `ride` is a raw `clean_doc(ride)` -- it does not yet carry the
 * three computed fields (`wait_seconds`, `reservation`, `is_aging`) that
 * only `GET /api/dispatch/rides/pending` attaches, so they are typed as
 * optional here and defaulted when the row is inserted.
 */
interface RideCreatedPayload {
  ride?: Omit<PendingRide, 'wait_seconds' | 'reservation' | 'is_aging'> &
    Partial<Pick<PendingRide, 'wait_seconds' | 'reservation' | 'is_aging'>>
}

/**
 * Payload of a `ride.updated` dispatch event. Some emitters (rides.py:
 * cancel_ride, driver.py: accept_ride/complete_ride) publish the full
 * `ride` document; others (driver.py: arrive_ride/start_ride) publish only
 * `{ride_id, status}`. Either shape is enough to know the ride left the
 * pending list -- no `ride.updated` event is ever published for a ride
 * that stays pending.
 */
interface RideUpdatedPayload {
  ride?: PendingRide
  ride_id?: string
}

/**
 * Renders `GET /api/dispatch/rides/pending`, live-updated from
 * `ride.created`/`ride.updated` dispatch events over the shared
 * `/ws/dispatch` connection. Supports a ride-type filter, a wait-time/
 * distance sort toggle, a name/address search box (all forwarded to the
 * backend's query params so the server-side pure filter/sort/aging
 * helpers stay the single source of truth), visually flags aging rows,
 * and shows the reservation holder + assignment mechanism.
 *
 * _Requirements: 2.1, 2.4, 2.5, 2.6, 6.2, 10.1, 10.2_
 */
export interface PendingRequestsTableProps {
  autoDispatch?: boolean
}

export function PendingRequestsTable({ autoDispatch = true }: PendingRequestsTableProps) {
  const [rides, setRides] = useState<PendingRide[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [rideType, setRideType] = useState<RideTypeFilter>('all')
  const [sort, setSort] = useState<SortMode>('none')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // The pending ride currently open in the ManualAssignModal (task 16.4),
  // or null when no "Assign" row action has been clicked.
  const [assigningRide, setAssigningRide] = useState<PendingRide | null>(null)

  // Debounce the search box so every keystroke doesn't trigger a re-fetch.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const load = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (rideType !== 'all') params.set('ride_type', rideType)
      if (sort !== 'none') params.set('sort', sort)
      if (debouncedSearch) params.set('search', debouncedSearch)
      const query = params.toString()
      const data = await apiRequest<PendingRidesResponse>(
        `/api/dispatch/rides/pending${query ? `?${query}` : ''}`,
      )
      setRides(data.rides)
    } catch {
      if (!isBackground) setError('Failed to load pending requests.')
    } finally {
      if (!isBackground) setLoading(false)
    }
  }, [rideType, sort, debouncedSearch])

  useEffect(() => {
    load()
    const interval = setInterval(() => load(true), 4000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    dispatchSocket.connect()

    const unsubscribeCreated = dispatchSocket.on('ride.created', (message: DispatchEvent) => {
      const ride = (message as RideCreatedPayload).ride
      if (!ride || typeof ride.id !== 'string') return
      setRides((prev) => {
        if (prev.some((r) => r.id === ride.id)) return prev
        const withDefaults: PendingRide = {
          ...ride,
          wait_seconds: ride.wait_seconds ?? 0,
          reservation: ride.reservation ?? null,
          is_aging: ride.is_aging ?? false,
        }
        return [...prev, withDefaults]
      })
    })

    const unsubscribeUpdated = dispatchSocket.on('ride.updated', (message: DispatchEvent) => {
      const payload = message as RideUpdatedPayload
      const ride = payload.ride
      const rideId = ride?.id ?? payload.ride_id
      if (!rideId) return

      if (ride && ride.status === 'pending') {
        // If the ride is still pending (e.g. manual assignment or reservation lock), update it in place
        setRides((prev) => prev.map((r) => (r.id === rideId ? { ...r, ...ride } : r)))
      } else {
        // If the ride transitioned away from pending, drop it from the pending table
        setRides((prev) => prev.filter((r) => r.id !== rideId))
      }
    })

    return () => {
      unsubscribeCreated()
      unsubscribeUpdated()
    }
  }, [])

  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const handleCancelRide = async (rideId: string) => {
    if (!window.confirm('Cancel this pending trip request from dispatch?')) return
    setCancellingId(rideId)
    try {
      await apiRequest(`/api/dispatch/rides/${rideId}/cancel`, {
        method: 'POST',
        body: { reason: 'No available drivers in your area at the moment' },
      })
      setRides((prev) => prev.filter((r) => r.id !== rideId))
    } catch (err: any) {
      alert(err.message || 'Failed to cancel ride')
    } finally {
      setCancellingId(null)
    }
  }

  const reservationLabel = useMemo(
    () => (ride: PendingRide): string => {
      if (!ride.reservation) return '—'
      if (ride.assignment_type === 'manual' && ride.assigned_by) {
        return `Manual · dispatcher ${ride.assigned_by}`
      }
      return `Automatic · driver ${ride.reservation.reserved_by}`
    },
    [],
  )

  return (
    <div className="pending-requests-view">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h2>Pending Requests</h2>
        <span style={{
          fontSize: '11px',
          fontWeight: 700,
          padding: '3px 8px',
          borderRadius: '6px',
          background: autoDispatch ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
          color: autoDispatch ? '#34d399' : '#fbbf24',
          border: `1px solid ${autoDispatch ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`
        }}>
          {autoDispatch ? '⚡ Auto-Waterfall Active' : '✋ Manual Allocation Mode'}
        </span>
      </div>

      {!autoDispatch && (
        <div style={{
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '10px',
          padding: '10px 14px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#fbbf24',
          fontSize: '0.85rem'
        }}>
          <span style={{ fontSize: '18px' }}>✋</span>
          <span>
            <strong>Manual Mode Active:</strong> Incoming trips will wait in this table for your review. Click <strong>Assign</strong> on any trip to choose the driver.
          </span>
        </div>
      )}

      <div className="pending-requests-controls">
        <input
          type="search"
          className="pending-requests-search"
          placeholder="Search by name or address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search pending requests by passenger name or address"
        />

        <select
          className="pending-requests-select"
          value={rideType}
          onChange={(e) => setRideType(e.target.value as RideTypeFilter)}
          aria-label="Filter by ride type"
        >
          <option value="all">All ride types</option>
          <option value="economy">Economy</option>
          <option value="premium">Premium</option>
          <option value="xl">XL</option>
        </select>

        <select
          className="pending-requests-select"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortMode)}
          aria-label="Sort pending requests"
        >
          <option value="none">Default order</option>
          <option value="wait_time">Longest waiting first</option>
          <option value="distance">Nearest to a driver</option>
        </select>
      </div>

      {loading && <p>Loading pending requests…</p>}
      {error && (
        <p className="pending-requests-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && rides.length === 0 && <p>No pending requests.</p>}

      {!loading && !error && rides.length > 0 && (
        <table className="pending-requests-table">
          <thead>
            <tr>
              <th>Passenger</th>
              <th>Pickup</th>
              <th>Destination</th>
              <th>Type</th>
              <th>Fare</th>
              <th>Wait</th>
              <th>Reservation</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rides.map((ride) => (
              <tr key={ride.id} className={ride.is_aging ? 'pending-row-aging' : ''}>
                <td>{ride.passenger_name ?? 'Unknown'}</td>
                <td>{ride.pickup?.address ?? '—'}</td>
                <td>{ride.destination?.address ?? '—'}</td>
                <td>{ride.ride_type ?? '—'}</td>
                <td>{ride.fare != null ? `Rs. ${Math.round(ride.fare).toLocaleString()}` : '—'}</td>
                <td>
                  {Math.round(ride.wait_seconds)}s
                  {ride.is_aging && <span className="pending-aging-badge">Aging</span>}
                </td>
                <td>{reservationLabel(ride)}</td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button type="button" className="btn-assign" onClick={() => setAssigningRide(ride)}>
                      Assign
                    </button>
                    <button
                      type="button"
                      className="btn-cancel"
                      onClick={() => handleCancelRide(ride.id)}
                      disabled={cancellingId === ride.id}
                    >
                      {cancellingId === ride.id ? '…' : 'Cancel'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {assigningRide && (
        <ManualAssignModal
          ride={assigningRide}
          onClose={() => setAssigningRide(null)}
          onAssigned={(assigned) => {
            const assignedId = typeof assigned.id === 'string' ? assigned.id : assigningRide.id
            // The `ride.assigned` dispatch event (dispatch.py: assign_ride)
            // does not remove rows from this table -- only `ride.updated`
            // does (see the effect above) -- so drop the row immediately
            // on a successful assignment rather than waiting on an event
            // that never arrives for this transition.
            setRides((prev) => prev.filter((r) => r.id !== assignedId))
            setAssigningRide(null)
          }}
        />
      )}
    </div>
  )
}
