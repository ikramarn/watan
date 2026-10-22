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
  vehicle_type?: string
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

interface HistoryResponse {
  rides: TripRecord[]
}

const STATUS_FILTERS = ['all', 'cancelled', 'completed', 'active', 'pending'] as const

export function TripHistoryView() {
  const [rides, setRides] = useState<TripRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selectedTrip, setSelectedTrip] = useState<TripRecord | null>(null)

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const params = new URLSearchParams()
      if (statusFilter !== 'all' && statusFilter !== 'active') {
        params.set('status', statusFilter)
      }
      if (search.trim()) params.set('search', search.trim())
      const data = await apiRequest<HistoryResponse>(`/api/dispatch/rides/history?${params.toString()}`)
      setRides(data.rides)
    } catch {
      setError('Failed to load trip logs from server.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, search])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const filteredRides = rides.filter((r) => {
    if (statusFilter === 'active') {
      return ['accepted', 'arrived', 'in_progress'].includes(r.status)
    }
    return true
  })

  return (
    <div>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '24px' }}>📜</span> All Trips & Customer Logs
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
            Complete audit trail of all historical and current bookings with customer profiles and financial settlements.
          </p>
        </div>
        <button type="button" onClick={fetchHistory} className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          🔄 Refresh Log
        </button>
      </div>

      {/* Toolbar: Search & Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '18px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="🔍 Search passenger name, phone, driver, trip ID, or street address..."
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
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(s)}
              style={{
                padding: '6px 14px',
                fontSize: '12.5px',
                fontWeight: 600,
                textTransform: 'capitalize',
                background: statusFilter === s ? (s === 'cancelled' ? '#dc2626' : '#272f3d') : 'transparent',
                color: statusFilter === s ? '#fff' : 'var(--text-muted)',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {loading && <p style={{ padding: '20px 0', color: 'var(--text-muted)' }}>Loading trips...</p>}
      {error && <p style={{ color: 'var(--danger)', padding: '20px 0' }}>{error}</p>}

      {!loading && !error && filteredRides.length === 0 && (
        <div className="card-container" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>📁</div>
          <h3 style={{ color: '#fff', marginBottom: '6px' }}>No Trips Recorded</h3>
          <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
            No trips matching this filter criteria were found.
          </p>
        </div>
      )}

      {!loading && !error && filteredRides.length > 0 && (
        <div className="modern-table-container">
          <table className="modern-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Status</th>
                <th>Customer Profile</th>
                <th>Assigned Driver</th>
                <th>Route</th>
                <th>Fare</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredRides.map((ride) => {
                const isCancelled = ride.status === 'cancelled'
                const isCompleted = ride.status === 'completed'
                const isPending = ride.status === 'pending'
                const statusClass = isCompleted
                  ? 'status-completed'
                  : isCancelled
                  ? 'status-cancelled'
                  : isPending
                  ? 'status-pending'
                  : 'status-active'

                return (
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
                      <span className={`status-pill ${statusClass}`}>{ride.status}</span>
                      {isCancelled && ride.cancelled_by && (
                        <div style={{ color: '#f87171', fontSize: '11px', marginTop: '3px' }}>
                          By {ride.cancelled_by}
                        </div>
                      )}
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

                    <td>
                      {ride.driver_name ? (
                        <div>
                          <div style={{ fontWeight: 600, color: '#fff' }}>{ride.driver_name}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '11.5px' }}>
                            {ride.vehicle_make} {ride.vehicle_plate && `· ${ride.vehicle_plate}`}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-faint)', fontSize: '12.5px' }}>Unassigned</span>
                      )}
                    </td>

                    <td style={{ maxWidth: '260px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12.5px' }}>
                        <span style={{ color: '#10b981' }}>🟢</span>
                        <span style={{ color: '#e2e8f0' }}>{ride.pickup?.address || 'Pickup location'}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12.5px', marginTop: '3px' }}>
                        <span style={{ color: '#ef4444' }}>🏁</span>
                        <span style={{ color: 'var(--text-muted)' }}>{ride.destination?.address || 'Destination'}</span>
                      </div>
                    </td>

                    <td style={{ fontWeight: 700, fontSize: '14px', whiteSpace: 'nowrap' }}>
                      Rs. {Number(ride.fare || 0).toLocaleString()}
                      {ride.cancellation_fee && ride.cancellation_fee > 0 ? (
                        <div style={{ color: '#ef4444', fontSize: '11px' }}>Fee: Rs. {Number(ride.cancellation_fee).toLocaleString()}</div>
                      ) : null}
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
                        Inspect
                      </button>
                    </td>
                  </tr>
                )
              })}
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
                <span className={`status-pill status-${selectedTrip.status}`}>{selectedTrip.status}</span>
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
                <div style={{ color: 'var(--text-faint)', fontSize: '13px' }}>No driver was assigned to this request.</div>
              )}
            </div>

            {/* Financial & Route Details */}
            <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', marginBottom: '20px' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '10px' }}>
                📍 Route & Settlement Breakdown
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Fare</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#34d399', marginTop: '2px' }}>
                    Rs. {Number(selectedTrip.fare || 0).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Distance / Duration</div>
                  <div style={{ fontSize: '14px', color: '#fff', marginTop: '2px' }}>
                    {selectedTrip.distance_km ? `${selectedTrip.distance_km.toFixed(1)} km` : '—'} · {selectedTrip.duration_min ? `${selectedTrip.duration_min} min` : '—'}
                  </div>
                </div>
                {selectedTrip.status === 'cancelled' && (
                  <div style={{ gridColumn: 'span 2', background: 'rgba(239, 68, 68, 0.08)', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <div style={{ color: '#fca5a5', fontSize: '12px', fontWeight: 700 }}>
                      ⚠️ Cancelled by {selectedTrip.cancelled_by || 'Unknown'} · Fee Charged: Rs. {Number(selectedTrip.cancellation_fee || 0).toLocaleString()}
                    </div>
                  </div>
                )}
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
