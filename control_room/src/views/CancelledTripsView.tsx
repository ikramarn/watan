import { useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'

interface TripRecord {
  id: string
  passenger_id?: string
  passenger_name?: string
  passenger_phone?: string
  passenger_rating?: number
  driver_id?: string
  driver_name?: string
  driver_phone?: string
  vehicle_make?: string
  vehicle_plate?: string
  pickup?: { address?: string; lat?: number; lng?: number }
  destination?: { address?: string; lat?: number; lng?: number }
  ride_type?: string
  status: string
  fare?: number
  cancellation_fee?: number
  cancelled_by?: string
  created_at: string
  updated_at?: string
  distance_km?: number
  duration_min?: number
}

interface RidesResponse {
  rides: TripRecord[]
}

export function CancelledTripsView() {
  const [rides, setRides] = useState<TripRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterByRole, setFilterByRole] = useState<'all' | 'passenger' | 'driver' | 'dispatcher'>('all')
  const [selectedTrip, setSelectedTrip] = useState<TripRecord | null>(null)

  const fetchCancelled = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await apiRequest<RidesResponse>('/api/dispatch/rides/history?status=cancelled')
      setRides(data.rides)
    } catch {
      setError('Failed to load cancelled trips from server.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCancelled()
  }, [fetchCancelled])

  const filtered = rides.filter((r) => {
    if (filterByRole !== 'all') {
      if ((r.cancelled_by || '').toLowerCase() !== filterByRole) return false
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      const matchName = (r.passenger_name || '').toLowerCase().includes(q)
      const matchPhone = (r.passenger_phone || '').toLowerCase().includes(q)
      const matchDriver = (r.driver_name || '').toLowerCase().includes(q)
      const matchId = (r.id || '').toLowerCase().includes(q)
      const matchPickup = (r.pickup?.address || '').toLowerCase().includes(q)
      const matchDest = (r.destination?.address || '').toLowerCase().includes(q)
      return matchName || matchPhone || matchDriver || matchId || matchPickup || matchDest
    }
    return true
  })

  // Quick Stats
  const totalCancelled = rides.length
  const cancelledByPassenger = rides.filter((r) => r.cancelled_by === 'passenger').length
  const cancelledByDriver = rides.filter((r) => r.cancelled_by === 'driver').length
  const totalFeesCollected = rides.reduce((sum, r) => sum + (r.cancellation_fee || 0), 0)

  return (
    <div>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>🚫</span> Cancelled Trips & Customer Records
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
            Comprehensive audit log of all cancelled requests with customer details, reasons, and fee settlements.
          </p>
        </div>
        <button type="button" onClick={fetchCancelled} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          🔄 Refresh
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="metrics-grid">
        <div className="metric-card" style={{ borderLeft: '3px solid #ef4444' }}>
          <div className="metric-title">Total Cancelled</div>
          <div className="metric-value" style={{ color: '#f87171' }}>{totalCancelled}</div>
          <div className="metric-sub">Across platform history</div>
        </div>

        <div className="metric-card" style={{ borderLeft: '3px solid #f59e0b' }}>
          <div className="metric-title">By Passenger</div>
          <div className="metric-value">{cancelledByPassenger}</div>
          <div className="metric-sub">{totalCancelled > 0 ? Math.round((cancelledByPassenger / totalCancelled) * 100) : 0}% of cancellations</div>
        </div>

        <div className="metric-card" style={{ borderLeft: '3px solid #3b82f6' }}>
          <div className="metric-title">By Driver</div>
          <div className="metric-value">{cancelledByDriver}</div>
          <div className="metric-sub">{totalCancelled > 0 ? Math.round((cancelledByDriver / totalCancelled) * 100) : 0}% of cancellations</div>
        </div>

        <div className="metric-card" style={{ borderLeft: '3px solid #10b981' }}>
          <div className="metric-title">Cancellation Fees</div>
          <div className="metric-value" style={{ color: '#34d399' }}>Rs. {totalFeesCollected.toLocaleString()}</div>
          <div className="metric-sub">Compensated to drivers</div>
        </div>
      </div>

      {/* Search & Role Filter Toolbar */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="🔍 Search customer name, phone (+92), driver, or address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: '1',
            minWidth: '320px',
            padding: '10px 16px',
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            color: '#fff',
            fontSize: '13.5px',
          }}
        />

        <div style={{ display: 'flex', gap: '6px', background: 'rgba(255,255,255,0.03)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          {(['all', 'passenger', 'driver', 'dispatcher'] as const).map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setFilterByRole(role)}
              style={{
                padding: '6px 14px',
                fontSize: '12.5px',
                fontWeight: 600,
                textTransform: 'capitalize',
                background: filterByRole === role ? '#272f3d' : 'transparent',
                color: filterByRole === role ? '#fff' : 'var(--text-muted)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {role === 'all' ? 'All Roles' : `By ${role}`}
            </button>
          ))}
        </div>
      </div>

      {loading && <p style={{ padding: '20px 0', color: 'var(--text-muted)' }}>Loading cancelled trips...</p>}
      {error && <p style={{ color: 'var(--danger)', padding: '20px 0' }}>{error}</p>}

      {!loading && !error && filtered.length === 0 && (
        <div className="card-container" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>✅</div>
          <h3 style={{ color: '#fff', marginBottom: '6px' }}>No Cancelled Trips Found</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            There are no cancelled rides matching your current search filter.
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="modern-table-container">
          <table className="modern-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Customer Information</th>
                <th>Route (Pickup → Destination)</th>
                <th>Assigned Driver</th>
                <th>Cancelled By</th>
                <th>Fee</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((ride) => (
                <tr key={ride.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedTrip(ride)}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 600, color: '#fff' }}>
                      {new Date(ride.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </div>
                    <div style={{ color: 'var(--text-faint)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                      {new Date(ride.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} · #{ride.id.slice(0, 6)}
                    </div>
                  </td>

                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '34px',
                          height: '34px',
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: '13px',
                          color: '#fff',
                        }}
                      >
                        {(ride.passenger_name || 'P').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: '#fff' }}>{ride.passenger_name || 'Passenger'}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                          📞 {ride.passenger_phone || 'No phone'}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td style={{ maxWidth: '280px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12.5px' }}>
                      <span style={{ color: '#10b981' }}>🟢</span>
                      <span style={{ color: '#e2e8f0' }}>
                        {ride.pickup?.address || 'Current Location'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12.5px', marginTop: '3px' }}>
                      <span style={{ color: '#ef4444' }}>🏁</span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {ride.destination?.address || 'Destination'}
                      </span>
                    </div>
                  </td>

                  <td>
                    {ride.driver_name ? (
                      <div>
                        <div style={{ fontWeight: 600, color: '#fff' }}>{ride.driver_name}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>
                          {ride.vehicle_make} {ride.vehicle_plate && `· ${ride.vehicle_plate}`}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-faint)', fontSize: '12.5px' }}>No driver assigned</span>
                    )}
                  </td>

                  <td>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        textTransform: 'capitalize',
                        background:
                          ride.cancelled_by === 'passenger'
                            ? 'rgba(239, 68, 68, 0.15)'
                            : ride.cancelled_by === 'driver'
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(59, 130, 246, 0.15)',
                        color:
                          ride.cancelled_by === 'passenger'
                            ? '#fca5a5'
                            : ride.cancelled_by === 'driver'
                            ? '#fde047'
                            : '#93c5fd',
                        border: '1px solid rgba(255,255,255,0.06)',
                      }}
                    >
                      {ride.cancelled_by === 'passenger' ? '👤 ' : ride.cancelled_by === 'driver' ? '🚖 ' : '🛡️ '}
                      {ride.cancelled_by || 'Unknown'}
                    </span>
                  </td>

                  <td style={{ fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap' }}>
                    {ride.cancellation_fee && ride.cancellation_fee > 0 ? (
                      <span style={{ color: '#f87171' }}>Rs. {Number(ride.cancellation_fee).toLocaleString()}</span>
                    ) : (
                      <span style={{ color: 'var(--text-faint)' }}>Rs. 0</span>
                    )}
                  </td>

                  <td>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: '12px', padding: '5px 10px' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedTrip(ride)
                      }}
                    >
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Customer & Trip Modal */}
      {selectedTrip && (
        <div className="modal-overlay" onClick={() => setSelectedTrip(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
              <div>
                <span className="status-pill status-cancelled">CANCELLED</span>
                <h3 style={{ color: '#fff', fontSize: '18px', fontWeight: 800, marginTop: '8px' }}>
                  Trip Inspection #{selectedTrip.id.slice(0, 8)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTrip(null)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '22px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Customer Profile Box */}
            <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '16px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--primary)', marginBottom: '10px' }}>
                👤 Customer Information (Saved Profile)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Customer Name</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff', marginTop: '2px' }}>
                    {selectedTrip.passenger_name || 'Passenger'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Contact Number</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#38bdf8', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    {selectedTrip.passenger_phone || 'No phone recorded'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Customer Rating</div>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#facc15', marginTop: '2px' }}>
                    ⭐ {selectedTrip.passenger_rating || '5.0'} / 5.0
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Customer ID</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                    {selectedTrip.passenger_id || selectedTrip.id}
                  </div>
                </div>
              </div>
            </div>

            {/* Driver Profile Box */}
            <div style={{ background: 'var(--bg-input)', padding: '16px', borderRadius: 'var(--radius-md)', marginBottom: '16px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#60a5fa', marginBottom: '10px' }}>
                🚖 Assigned Driver & Vehicle
              </div>
              {selectedTrip.driver_name ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Driver Name</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginTop: '2px' }}>
                      {selectedTrip.driver_name}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Driver Phone</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#38bdf8', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                      {selectedTrip.driver_phone || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Vehicle Model</div>
                    <div style={{ fontSize: '13px', color: '#fff', marginTop: '2px' }}>
                      {selectedTrip.vehicle_make || 'Standard Vehicle'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Registration Plate</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#fde047', marginTop: '2px', fontFamily: 'var(--font-mono)' }}>
                      {selectedTrip.vehicle_plate || '—'}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ color: 'var(--text-faint)', fontSize: '13px' }}>Trip was cancelled before driver assignment.</div>
              )}
            </div>

            {/* Route & Cancellation Details */}
            <div style={{ background: 'rgba(239, 68, 68, 0.06)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: '#f87171', marginBottom: '10px' }}>
                ⚠️ Cancellation Audit Details
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Cancelled By</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#fca5a5', textTransform: 'capitalize', marginTop: '2px' }}>
                    {selectedTrip.cancelled_by || 'Unknown'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Cancellation Fee</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', marginTop: '2px' }}>
                    Rs. {Number(selectedTrip.cancellation_fee || 0).toLocaleString()}
                  </div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Pickup Location</div>
                  <div style={{ fontSize: '13px', color: '#fff', marginTop: '2px' }}>
                    🟢 {selectedTrip.pickup?.address || 'Pickup'}
                  </div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Destination</div>
                  <div style={{ fontSize: '13px', color: '#fff', marginTop: '2px' }}>
                    🏁 {selectedTrip.destination?.address || 'Destination'}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setSelectedTrip(null)} className="btn-primary" style={{ padding: '8px 24px' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
