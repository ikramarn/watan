import { useEffect, useState } from 'react'
import { apiRequest, ApiError } from '../lib/api'
import type { PendingRide } from './PendingRequestsTable'
import './ManualAssignModal.css'

interface AssignableDriver {
  driver_id: string
  name: string
  rating: number
  vehicle_make: string
  vehicle_plate: string
  vehicle_type: string
  distance_km?: number | null
  eta_min?: number | null
  online: boolean
  has_active_ride: boolean
  is_compliant?: boolean
  compliance_reason?: string
  phv_badge_number?: string
  badge_expiry?: string
  insurance_expiry?: string
}

interface DriversResponse {
  drivers: AssignableDriver[]
}

interface AssignRideResponse {
  id: string
  [key: string]: unknown
}

interface ManualAssignModalProps {
  ride: PendingRide
  onClose: () => void
  onAssigned: (ride: AssignRideResponse) => void
}

export function ManualAssignModal({ ride, onClose, onAssigned }: ManualAssignModalProps) {
  const [drivers, setDrivers] = useState<AssignableDriver[]>([])
  const [loadingDrivers, setLoadingDrivers] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedDriverId, setSelectedDriverId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoadingDrivers(true)
      setLoadError(null)
      try {
        const params = new URLSearchParams()
        if (ride.pickup?.lat != null && ride.pickup?.lng != null) {
          params.set('pickup_lat', String(ride.pickup.lat))
          params.set('pickup_lng', String(ride.pickup.lng))
        }
        const query = params.toString() ? `?${params.toString()}` : ''
        const data = await apiRequest<DriversResponse>(`/api/dispatch/drivers${query}`)
        if (cancelled) return
        const available = data.drivers.filter((d) => d.online && !d.has_active_ride)
        setDrivers(available)
        // Automatically select the nearest available driver so the Assign button is immediately ready
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
  }, [ride.pickup?.lat, ride.pickup?.lng])

  const handleAssign = async () => {
    const targetDriverId = selectedDriverId || (drivers.length > 0 ? drivers[0].driver_id : '')
    if (!targetDriverId) return

    const chosenDriver = drivers.find((d) => d.driver_id === targetDriverId)
    if (chosenDriver && chosenDriver.is_compliant === false) {
      setSubmitError(`Compliance Hard Stop (RTA): Cannot assign ${chosenDriver.name} because ${chosenDriver.compliance_reason || 'statutory documents have expired'}.`)
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      const assigned = await apiRequest<AssignRideResponse>(
        `/api/dispatch/rides/${ride.id}/assign`,
        { method: 'POST', body: { driver_id: targetDriverId } },
      )
      onAssigned(assigned)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSubmitError('Ride is no longer available — it was just assigned or cancelled.')
      } else if (err instanceof ApiError) {
        setSubmitError(err.message || 'Selected driver is not available — pick another driver.')
      } else {
        setSubmitError('Failed to assign ride.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const getEtaBadgeClass = (distanceKm?: number | null) => {
    if (distanceKm == null) return 'unknown'
    if (distanceKm <= 3.0) return 'near'
    if (distanceKm <= 7.0) return 'mid'
    return 'far'
  }

  return (
    <div className="manual-assign-overlay" role="dialog" aria-modal="true" aria-labelledby="manual-assign-title">
      <div className="manual-assign-modal">
        <h2 id="manual-assign-title">Assign Driver to Trip</h2>
        <p className="manual-assign-summary">
          Passenger: <strong>{ride.passenger_name ?? 'Guest Passenger'}</strong><br />
          Pickup: {ride.pickup?.address ?? 'Current Location'}
        </p>

        {loadingDrivers && <p style={{ color: '#94a3b8' }}>Calculating nearest drivers & travel ETAs…</p>}
        {loadError && (
          <p className="manual-assign-error" role="alert">
            {loadError}
          </p>
        )}

        {!loadingDrivers && !loadError && drivers.length === 0 && (
          <p style={{ color: '#94a3b8', padding: '12px 0' }}>No online, free drivers are available right now in this zone.</p>
        )}

        {!loadingDrivers && !loadError && drivers.length > 0 && (
          <div className="manual-assign-driver-list" role="radiogroup" aria-label="Select a driver">
            {drivers.map((driver) => {
              const isSelected = selectedDriverId === driver.driver_id
              const etaClass = getEtaBadgeClass(driver.distance_km)
              return (
                <div
                  key={driver.driver_id}
                  className={`manual-assign-driver-option ${isSelected ? 'selected' : ''}`}
                  onClick={() => setSelectedDriverId(driver.driver_id)}
                >
                  <input
                    type="radio"
                    name="manual-assign-driver"
                    value={driver.driver_id}
                    checked={isSelected}
                    onChange={() => setSelectedDriverId(driver.driver_id)}
                  />
                  <div className="driver-info-main">
                    <div className="driver-row-top" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong className="driver-name">{driver.name}</strong>
                      <span className="driver-rating">★ {driver.rating.toFixed(1)}</span>
                      {driver.is_compliant === false ? (
                        <span style={{ fontSize: '10px', background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', border: '1px solid #ef4444', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                          ⛔ Expired
                        </span>
                      ) : (
                        <span style={{ fontSize: '10px', background: 'rgba(16, 185, 129, 0.2)', color: '#34d399', border: '1px solid #10b981', padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>
                          ✓ RTA Compliant
                        </span>
                      )}
                    </div>
                    <div className="driver-row-sub">
                      <span>{driver.vehicle_make || 'Saloon'}</span>
                      <span className="driver-plate">{driver.vehicle_plate || 'CAB-001'}</span>
                      <span className="driver-tier">{driver.vehicle_type?.toUpperCase() || 'ECONOMY'}</span>
                      {driver.phv_badge_number && (
                        <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>RTA Lic: {driver.phv_badge_number}</span>
                      )}
                    </div>
                    {driver.is_compliant === false && driver.compliance_reason && (
                      <div style={{ fontSize: '11px', color: '#f87171', marginTop: '2px' }}>
                        ⚠️ {driver.compliance_reason}
                      </div>
                    )}
                  </div>

                  <div className={`driver-eta-badge ${etaClass}`}>
                    {driver.eta_min != null ? (
                      <>
                        <span className="eta-time">{driver.eta_min} min</span>
                        <span className="eta-dist">{driver.distance_km} km away</span>
                      </>
                    ) : (
                      <span className="eta-unknown">Location N/A</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {submitError && (
          <p className="manual-assign-error" role="alert">
            {submitError}
          </p>
        )}

        <div className="manual-assign-actions">
          <button type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAssign}
            disabled={submitting || (drivers.length === 0 && !selectedDriverId) || loadingDrivers}
          >
            {submitting ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  )
}
