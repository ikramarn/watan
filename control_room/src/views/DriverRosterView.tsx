import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../lib/api'
import { dispatchSocket } from '../lib/dispatchSocket'
import type { DispatchEvent } from '../lib/dispatchSocket'
import { DriverProfileModal } from './DriverProfileModal'
import type { DriverProfileData } from './DriverProfileModal'
import './DriverRosterView.css'

interface DriversResponse {
  drivers: DriverProfileData[]
}

interface DriverStatusPayload {
  status?: {
    driver_id?: string
    online?: boolean
    lat?: number | null
    lng?: number | null
  }
}

interface DriverLocationPayload {
  ride_id?: string
  lat?: number
  lng?: number
}

export function DriverRosterView() {
  const [drivers, setDrivers] = useState<DriverProfileData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'available' | 'busy' | 'offline'>('all')
  const [selectedDriver, setSelectedDriver] = useState<DriverProfileData | null>(null)

  const loadDrivers = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiRequest<DriversResponse>('/api/dispatch/drivers?include_offline=true')
      setDrivers(data.drivers || [])
    } catch {
      setError('Failed to load driver roster.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDrivers()
  }, [])

  useEffect(() => {
    dispatchSocket.connect()

    const unsubscribeStatus = dispatchSocket.on('driver.status', (message: DispatchEvent) => {
      const status = (message as DriverStatusPayload).status
      const driverId = status?.driver_id
      if (!driverId) return

      setDrivers((prev) => {
        return prev.map((d) =>
          d.driver_id === driverId
            ? {
                ...d,
                online: status.online ?? d.online,
                lat: status.lat ?? d.lat,
                lng: status.lng ?? d.lng,
              }
            : d,
        )
      })
    })

    const unsubscribeLocation = dispatchSocket.on('driver.location', (message: DispatchEvent) => {
      const payload = message as DriverLocationPayload
      const rideId = payload.ride_id
      if (!rideId || payload.lat === undefined || payload.lng === undefined) return

      setDrivers((prev) =>
        prev.map((d) =>
          d.active_ride_id === rideId ? { ...d, lat: payload.lat!, lng: payload.lng! } : d,
        ),
      )
    })

    return () => {
      unsubscribeStatus()
      unsubscribeLocation()
    }
  }, [])

  const filtered = useMemo(() => {
    let list = drivers

    // Status filtering
    if (statusFilter === 'available') {
      list = list.filter((d) => d.online && !d.has_active_ride)
    } else if (statusFilter === 'busy') {
      list = list.filter((d) => d.online && d.has_active_ride)
    } else if (statusFilter === 'offline') {
      list = list.filter((d) => !d.online)
    }

    // Search filtering
    const term = search.trim().toLowerCase()
    if (!term) return list

    return list.filter(
      (d) =>
        d.name?.toLowerCase().includes(term) ||
        d.vehicle_plate?.toLowerCase().includes(term) ||
        d.email?.toLowerCase().includes(term) ||
        d.phv_badge_number?.toLowerCase().includes(term),
    )
  }, [drivers, search, statusFilter])

  const availableCount = drivers.filter((d) => d.online && !d.has_active_ride).length
  const busyCount = drivers.filter((d) => d.online && d.has_active_ride).length
  const offlineCount = drivers.filter((d) => !d.online).length

  return (
    <div className="driver-roster-view">
      <div className="driver-roster-header">
        <div>
          <h2>👥 Fleet Directory & Driver Profiles</h2>
          <p style={{ margin: '3px 0 0', fontSize: '13px', color: '#94a3b8' }}>
            Inspect full driver profiles, live GPS tracking, vehicle specifications, and Regional Transport Authority (RTA) statutory compliance.
          </p>
        </div>
        <button
          type="button"
          onClick={loadDrivers}
          disabled={loading}
          style={{
            background: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: '#e2e8f0',
            padding: '8px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {loading ? 'Refreshing…' : '🔄 Refresh Fleet'}
        </button>
      </div>

      {/* Filter Tabs and Search Bar */}
      <div className="driver-roster-controls">
        <div className="driver-filter-group">
          <button
            type="button"
            className={`driver-filter-pill ${statusFilter === 'all' ? 'active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All Fleet ({drivers.length})
          </button>
          <button
            type="button"
            className={`driver-filter-pill ${statusFilter === 'available' ? 'active' : ''}`}
            onClick={() => setStatusFilter('available')}
          >
            🟢 Available ({availableCount})
          </button>
          <button
            type="button"
            className={`driver-filter-pill ${statusFilter === 'busy' ? 'active' : ''}`}
            onClick={() => setStatusFilter('busy')}
          >
            🔵 On Trip ({busyCount})
          </button>
          <button
            type="button"
            className={`driver-filter-pill ${statusFilter === 'offline' ? 'active' : ''}`}
            onClick={() => setStatusFilter('offline')}
          >
            ⚫ Offline ({offlineCount})
          </button>
        </div>

        <input
          type="search"
          className="driver-roster-search"
          placeholder="Search by driver name, vehicle plate, or badge #…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search drivers by name or vehicle plate"
        />
      </div>

      {loading && <p style={{ color: '#94a3b8' }}>Loading fleet directory…</p>}
      {error && (
        <p className="driver-roster-error" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 16px', color: '#94a3b8' }}>
          No drivers match the current filter or search criteria.
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <ul className="driver-roster-list">
          {filtered.map((driver) => {
            const isBusy = driver.has_active_ride
            const isCompliant = driver.is_compliant ?? true

            return (
              <li
                key={driver.driver_id}
                className="driver-roster-item"
                onClick={() => setSelectedDriver(driver)}
                title="Click to view full driver profile"
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '130px' }}>
                  <span
                    className={`driver-status-badge ${!driver.online ? 'offline' : isBusy ? 'busy' : 'free'}`}
                  >
                    {!driver.online ? 'Offline' : isBusy ? 'Busy' : 'Available'}
                  </span>
                  <span className="driver-roster-name">{driver.name}</span>
                </div>

                <div className="driver-roster-detail" style={{ minWidth: '160px' }}>
                  <span style={{ color: '#f8fafc', fontWeight: 600 }}>{driver.vehicle_make}</span>
                  <span style={{ margin: '0 5px', opacity: 0.4 }}>•</span>
                  <span className="driver-inline-plate">{driver.vehicle_plate}</span>
                </div>

                <div className="driver-roster-detail">
                  ⭐ <strong>{driver.rating.toFixed(1)}</strong>
                </div>

                <div className="driver-roster-detail">
                  <span className={`driver-inline-compliance ${isCompliant ? 'compliant' : 'non-compliant'}`}>
                    {isCompliant ? '✓ RTA Compliant' : '⛔ Expired'}
                  </span>
                </div>

                <div style={{ flex: 1 }} />

                <button
                  type="button"
                  className="driver-view-profile-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedDriver(driver)
                  }}
                >
                  👤 View Profile
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {/* Full Driver Profile Dossier Modal */}
      {selectedDriver && (
        <DriverProfileModal
          driver={selectedDriver}
          onClose={() => setSelectedDriver(null)}
        />
      )}
    </div>
  )
}
