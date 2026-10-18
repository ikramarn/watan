import { useEffect, useState } from 'react'
import { apiRequest, ApiError } from '../lib/api'
import type { ActiveRide } from './ActiveRidesTable'
import './ReassignModal.css'

interface AssignableDriver {
  driver_id: string
  name: string
  rating: number
  vehicle_make: string
  vehicle_plate: string
  vehicle_type: string
  online: boolean
  has_active_ride: boolean
}

interface DriversResponse {
  drivers: AssignableDriver[]
}

interface ReassignRideResponse {
  outcome: 'reassigned' | 'cancelled'
  ride: {
    id: string
    [key: string]: unknown
  }
}

interface ReassignModalProps {
  ride: ActiveRide
  onClose: () => void
  onSuccess: (result: ReassignRideResponse) => void
}

export function ReassignModal({ ride, onClose, onSuccess }: ReassignModalProps) {
  const [drivers, setDrivers] = useState<AssignableDriver[]>([])
  const [loadingDrivers, setLoadingDrivers] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedDriverId, setSelectedDriverId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [cancelledNotice, setCancelledNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoadingDrivers(true)
      setLoadError(null)
      try {
        const data = await apiRequest<DriversResponse>('/api/dispatch/drivers')
        if (cancelled) return
        const available = data.drivers.filter(
          (d) => d.online && !d.has_active_ride && d.driver_id !== ride.driver_id,
        )
        setDrivers(available)
        if (available.length > 0) {
          setSelectedDriverId(available[0].driver_id)
        }
      } catch {
        if (!cancelled) setLoadError('Failed to load available drivers.')
      } finally {
        if (!cancelled) setLoadingDrivers(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [ride.driver_id])

  const handleReassign = async () => {
    const targetDriverId = selectedDriverId || (drivers.length > 0 ? drivers[0].driver_id : '')
    if (!targetDriverId) return

    setSubmitting(true)
    setSubmitError(null)
    setCancelledNotice(null)
    try {
      const result = await apiRequest<ReassignRideResponse>(
        `/api/dispatch/rides/${ride.id}/reassign`,
        { method: 'POST', body: { driver_id: targetDriverId } },
      )
      if (result.outcome === 'cancelled') {
        setCancelledNotice(
          'The ride could not be reassigned because the selected driver became unavailable, so it was cancelled instead.',
        )
        onSuccess(result)
      } else {
        onSuccess(result)
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSubmitError('Ride state has already changed — it may have been cancelled or reassigned already.')
      } else if (err instanceof ApiError && err.status === 400) {
        setSubmitError('Selected driver is not available — pick another driver.')
      } else if (err instanceof ApiError) {
        setSubmitError(err.message)
      } else {
        setSubmitError('Failed to reassign ride.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="reassign-overlay" role="dialog" aria-modal="true" aria-labelledby="reassign-title">
      <div className="reassign-modal">
        <h2 id="reassign-title">Reassign ride</h2>
        <p className="reassign-summary">
          {ride.passenger_name ?? 'Unknown passenger'} · {ride.pickup?.address ?? 'Unknown pickup'}
          {ride.driver_name ? ` · Currently with ${ride.driver_name}` : ''}
        </p>

        {loadingDrivers && <p style={{ color: '#94a3b8' }}>Loading available drivers…</p>}
        {loadError && (
          <p className="reassign-error" role="alert">
            {loadError}
          </p>
        )}

        {!loadingDrivers && !loadError && drivers.length === 0 && (
          <p style={{ color: '#94a3b8', padding: '12px 0' }}>No other online, free drivers are available right now.</p>
        )}

        {!loadingDrivers && !loadError && drivers.length > 0 && (
          <div className="reassign-driver-list" role="radiogroup" aria-label="Select a new driver">
            {drivers.map((driver) => {
              const isSelected = selectedDriverId === driver.driver_id
              return (
                <div
                  key={driver.driver_id}
                  className={`reassign-driver-option ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedDriverId(driver.driver_id)}
                >
                  <input
                    type="radio"
                    name="reassign-driver"
                    value={driver.driver_id}
                    checked={isSelected}
                    onChange={() => setSelectedDriverId(driver.driver_id)}
                  />
                  <span>
                    <strong style={{ color: '#fff' }}>{driver.name}</strong> · {driver.vehicle_make} ·{' '}
                    <span style={{ color: '#f59e0b', fontWeight: 600 }}>{driver.vehicle_plate}</span> · Rating{' '}
                    {driver.rating.toFixed(1)}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {cancelledNotice && <p className="reassign-cancelled-notice">{cancelledNotice}</p>}

        {submitError && (
          <p className="reassign-error" role="alert">
            {submitError}
          </p>
        )}

        <div className="reassign-actions">
          <button type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleReassign}
            disabled={submitting || (drivers.length === 0 && !selectedDriverId) || loadingDrivers}
          >
            {submitting ? 'Reassigning…' : 'Reassign'}
          </button>
        </div>
      </div>
    </div>
  )
}
