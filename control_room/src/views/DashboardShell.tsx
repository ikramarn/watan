import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../lib/auth'
import { apiRequest, downloadFifeAuditCsv } from '../lib/api'
import { dispatchSocket } from '../lib/dispatchSocket'
import { ActiveRidesTable } from './ActiveRidesTable'
import type { ActiveRide } from './ActiveRidesTable'
import { AnalyticsDashboard } from './AnalyticsDashboard'
import { AuditLogView } from './AuditLogView'
import { CancelledTripsView } from './CancelledTripsView'
import { DispatcherAccountsView } from './DispatcherAccountsView'
import { DriverRosterView } from './DriverRosterView'
import { FleetCockpitMap } from './FleetCockpitMap'
import type { FleetDriver } from './FleetCockpitMap'
import { KycManagementView } from './KycManagementView'
import { ManualAssignModal } from './ManualAssignModal'
import { NewRequestAlert } from './NewRequestAlert'
import { PendingRequestsTable } from './PendingRequestsTable'
import type { PendingRide } from './PendingRequestsTable'
import { SosIncidentsView } from './SosIncidentsView'
import { TripHistoryView } from './TripHistoryView'

type Section =
  | 'overview'
  | 'pending'
  | 'active'
  | 'cancelled'
  | 'history'
  | 'drivers'
  | 'kyc'
  | 'sos'
  | 'accounts'
  | 'audit'
  | 'analytics'

export function DashboardShell() {
  const { user, logout } = useAuth()
  const [section, setSection] = useState<Section>('overview')

  // Real-time collections
  const [pendingRides, setPendingRides] = useState<PendingRide[]>([])
  const [activeRides, setActiveRides] = useState<ActiveRide[]>([])
  const [drivers, setDrivers] = useState<FleetDriver[]>([])

  // Telemetry counts
  const [pendingCount, setPendingCount] = useState(0)
  const [activeCount, setActiveCount] = useState(0)
  const [cancelledCount, setCancelledCount] = useState(0)
  const [sosCount, setSosCount] = useState(0)
  const [onlineDriversCount, setOnlineDriversCount] = useState(0)

  // Auto-dispatch vs Manual-Only allocation mode state
  const [autoDispatch, setAutoDispatch] = useState(true)
  const [togglingDispatch, setTogglingDispatch] = useState(false)

  // Modal for quick manual assignment from cockpit
  const [assigningRide, setAssigningRide] = useState<PendingRide | null>(null)

  // Admin & Back-Office dropdown menu toggle
  const [adminMenuOpen, setAdminMenuOpen] = useState(false)
  const adminDropdownRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (adminDropdownRef.current && !adminDropdownRef.current.contains(e.target as Node)) {
        setAdminMenuOpen(false)
      }
    }
    if (adminMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [adminMenuOpen])


  // Fetch telemetry & lists
  const fetchTelemetry = useCallback(async () => {
    try {
      const [pendingRes, activeRes, historyRes, driversRes, sosRes, settingsRes] = await Promise.all([
        apiRequest<{ rides: PendingRide[] }>('/api/dispatch/rides/pending').catch(() => ({ rides: [] })),
        apiRequest<{ rides: ActiveRide[] }>('/api/dispatch/rides/active').catch(() => ({ rides: [] })),
        apiRequest<{ rides: any[] }>('/api/dispatch/rides/history?status=cancelled').catch(() => ({ rides: [] })),
        apiRequest<{ drivers: FleetDriver[] }>('/api/dispatch/drivers').catch(() => ({ drivers: [] })),
        apiRequest<any[]>('/api/driver/sos/incidents').catch(() => []),
        apiRequest<{ auto_dispatch: boolean }>('/api/dispatch/settings').catch(() => ({ auto_dispatch: true })),
      ])

      const pRides = pendingRes.rides || []
      const aRides = activeRes.rides || []
      const dList = driversRes.drivers || []

      setPendingRides(pRides)
      setActiveRides(aRides)
      setDrivers(dList)

      setPendingCount(pRides.length)
      setActiveCount(aRides.length)
      setCancelledCount(historyRes.rides?.length || 0)
      setOnlineDriversCount(dList.filter((d) => d.online).length)
      setSosCount(Array.isArray(sosRes) ? sosRes.filter((i) => i.status === 'active_emergency').length : 0)

      if (typeof settingsRes.auto_dispatch === 'boolean') {
        setAutoDispatch(settingsRes.auto_dispatch)
      }
    } catch {}
  }, [])

  useEffect(() => {
    fetchTelemetry()
    const interval = setInterval(fetchTelemetry, 5000)

    // WebSocket real-time subscription
    dispatchSocket.connect()

    const unsubSettings = dispatchSocket.on('dispatch.settings_updated', (msg: any) => {
      if (msg.settings && typeof msg.settings.auto_dispatch === 'boolean') {
        setAutoDispatch(msg.settings.auto_dispatch)
      }
    })

    const unsubDriverStatus = dispatchSocket.on('driver.status', (msg: any) => {
      const status = msg.status
      if (!status?.driver_id) return
      setDrivers((prev) => {
        if (status.online === false) {
          return prev.filter((d) => d.driver_id !== status.driver_id)
        }
        return prev.map((d) =>
          d.driver_id === status.driver_id
            ? { ...d, online: true, lat: status.lat ?? d.lat, lng: status.lng ?? d.lng }
            : d,
        )
      })
    })

    const unsubDriverLoc = dispatchSocket.on('driver.location', (msg: any) => {
      if (!msg.ride_id || msg.lat === undefined || msg.lng === undefined) return
      setDrivers((prev) =>
        prev.map((d) => (d.active_ride_id === msg.ride_id ? { ...d, lat: msg.lat, lng: msg.lng } : d)),
      )
    })

    const unsubRideCreated = dispatchSocket.on('ride.created', () => {
      fetchTelemetry()
    })

    const unsubRideUpdated = dispatchSocket.on('ride.updated', () => {
      fetchTelemetry()
    })

    return () => {
      clearInterval(interval)
      unsubSettings()
      unsubDriverStatus()
      unsubDriverLoc()
      unsubRideCreated()
      unsubRideUpdated()
    }
  }, [fetchTelemetry])

  const toggleAutoDispatch = async () => {
    setTogglingDispatch(true)
    const nextVal = !autoDispatch
    try {
      await apiRequest('/api/dispatch/settings', {
        method: 'POST',
        body: { auto_dispatch: nextVal },
      })
      setAutoDispatch(nextVal)
    } catch (err: any) {
      alert(err.message || 'Failed to toggle dispatch mode')
    } finally {
      setTogglingDispatch(false)
    }
  }

  const isAdminActive = ['history', 'kyc', 'analytics', 'audit', 'accounts'].includes(section)
  const adminLabels: Record<string, string> = {
    history: '📜 Trips & Logs',
    kyc: '📋 Driver KYC',
    analytics: '📈 Analytics',
    audit: '🛡️ Audit',
    accounts: '⚙️ Accounts',
  }

  return (
    <div className="app-shell">

      <NewRequestAlert />

      {/* Sleek Edge-to-Edge Navigation Bar */}
      <header className="top-nav-bar">
        {/* Left: Brand Badge (Clickable to return to Live Cockpit) */}
        <div
          className="brand-badge clickable"
          onClick={() => setSection('overview')}
          title="Return to Live Cockpit"
          role="button"
          tabIndex={0}
        >
          <div className="brand-logo-icon">🚖</div>
          <div>
            <div className="brand-title">
              GetChum <span style={{ color: 'var(--primary)' }}>Dispatch</span>
            </div>
            <div
              style={{
                fontSize: '10.5px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                marginTop: '1px',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 8px #10b981',
                }}
              />
              Fife & Edinburgh Fleet Cockpit
            </div>
          </div>
        </div>

        {/* Live Operations Primary Tabs (Left Side) */}
        <nav className="nav-ops-rail">
          <button
            type="button"
            className={`nav-tab-pill nav-tab-cockpit ${section === 'overview' ? 'active' : ''}`}
            onClick={() => setSection('overview')}
          >
            🕹️ Live Cockpit
          </button>

          <button
            type="button"
            className={`nav-tab-pill ${section === 'pending' ? 'active' : ''}`}
            onClick={() => setSection('pending')}
          >
            ⏳ Pending
            {pendingCount > 0 && <span className="tab-badge badge-primary">{pendingCount}</span>}
          </button>

          <button
            type="button"
            className={`nav-tab-pill ${section === 'active' ? 'active' : ''}`}
            onClick={() => setSection('active')}
          >
            🚖 Active
            {activeCount > 0 && (
              <span className="tab-badge" style={{ background: '#2563eb', color: '#fff' }}>
                {activeCount}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`nav-tab-pill tab-cancelled ${section === 'cancelled' ? 'active' : ''}`}
            onClick={() => setSection('cancelled')}
          >
            🚫 Cancelled
            {cancelledCount > 0 && <span className="tab-badge badge-danger">{cancelledCount}</span>}
          </button>

          <button
            type="button"
            className={`nav-tab-pill ${section === 'drivers' ? 'active' : ''}`}
            onClick={() => setSection('drivers')}
          >
            👥 Fleet
            {onlineDriversCount > 0 && (
              <span className="tab-badge" style={{ background: '#10b981', color: '#090a0f' }}>
                {onlineDriversCount}
              </span>
            )}
          </button>

          <button
            type="button"
            className={`nav-tab-pill ${sosCount > 0 ? 'tab-sos-alert' : ''} ${section === 'sos' ? 'active' : ''}`}
            onClick={() => setSection('sos')}
          >
            🚨 SOS
            {sosCount > 0 && <span className="tab-badge badge-danger">{sosCount}</span>}
          </button>
        </nav>

        {/* Flexible spacer pushing admin buttons to the right */}
        <div style={{ flex: 1 }} />

        {/* Secondary Back-Office & Management Tools Dropdown (Shifted Right) */}
        <div className="nav-admin-dropdown-wrap" ref={adminDropdownRef}>
          <button
            type="button"
            className={`nav-tab-pill nav-tab-secondary ${isAdminActive ? 'active' : ''}`}
            onClick={() => setAdminMenuOpen((prev) => !prev)}
            title="Management, KYC, Analytics & Audit tools"
            aria-expanded={adminMenuOpen}
          >
            <span>{isAdminActive ? adminLabels[section] : '⚙️ Admin & Logs'}</span>
            <span style={{ fontSize: '10px', opacity: 0.8, marginLeft: '3px' }}>▾</span>
          </button>

          {adminMenuOpen && (
            <div className="admin-dropdown-menu">
              <button
                type="button"
                className={`admin-dropdown-item ${section === 'history' ? 'active' : ''}`}
                onClick={() => {
                  setSection('history')
                  setAdminMenuOpen(false)
                }}
              >
                <span>📜 All Trips & Logs</span>
              </button>
              <button
                type="button"
                className={`admin-dropdown-item ${section === 'kyc' ? 'active' : ''}`}
                onClick={() => {
                  setSection('kyc')
                  setAdminMenuOpen(false)
                }}
              >
                <span>📋 Driver KYC Verification</span>
              </button>
              <button
                type="button"
                className={`admin-dropdown-item ${section === 'analytics' ? 'active' : ''}`}
                onClick={() => {
                  setSection('analytics')
                  setAdminMenuOpen(false)
                }}
              >
                <span>📈 Analytics & Reports</span>
              </button>
              <button
                type="button"
                className={`admin-dropdown-item ${section === 'audit' ? 'active' : ''}`}
                onClick={() => {
                  setSection('audit')
                  setAdminMenuOpen(false)
                }}
              >
                <span>🛡️ Security & Audit Trail</span>
              </button>
              <button
                type="button"
                className={`admin-dropdown-item ${section === 'accounts' ? 'active' : ''}`}
                onClick={() => {
                  setSection('accounts')
                  setAdminMenuOpen(false)
                }}
              >
                <span>⚙️ Dispatcher Accounts</span>
              </button>
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
              <button
                type="button"
                className="admin-dropdown-item"
                style={{ color: '#10b981', fontWeight: 600 }}
                onClick={async () => {
                  setAdminMenuOpen(false)
                  try {
                    await downloadFifeAuditCsv()
                  } catch (err) {
                    alert('Failed to download Fife Council audit log: ' + String(err))
                  }
                }}
                title="Download official Fife Council statutory booking record CSV"
              >
                <span>📥 Export Fife Audit (CSV)</span>
              </button>
            </div>
          )}
        </div>


        <div style={{ width: '1px', height: '26px', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

        {/* Right: Engine Switch + Dispatcher Profile + Sign Out */}
        <div className="top-nav-right">
          {/* Dispatch Engine Toggle Switch */}
          <div className="dispatch-mode-toggle-card">
            <div className="toggle-label-wrap">
              <span className="toggle-label-title">Dispatch Engine</span>
              <span className={`toggle-status-pill ${autoDispatch ? 'auto-active' : 'manual-active'}`}>
                {autoDispatch ? '⚡ Auto Matching' : '✋ Manual Only'}
              </span>
            </div>
            <button
              type="button"
              className={`dispatch-switch-btn ${autoDispatch ? 'active' : ''}`}
              onClick={toggleAutoDispatch}
              disabled={togglingDispatch}
              title={
                autoDispatch
                  ? 'Auto-dispatch is ON: Click to switch to Manual-Only mode'
                  : 'Manual-Only is ON: Click to enable Automatic matching'
              }
              aria-label="Toggle Auto-Dispatch Mode"
            >
              <span className="switch-knob" />
            </button>
          </div>

          <div style={{ width: '1px', height: '30px', background: 'rgba(255,255,255,0.08)' }} />

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{user?.name || user?.email}</div>
            <div style={{ fontSize: '10px', color: 'var(--primary)', textTransform: 'uppercase', fontWeight: 600 }}>
              Master Dispatcher
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="btn-secondary"
            style={{ fontSize: '11.5px', padding: '6px 12px' }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="cockpit-content-wrap">
        {/* Navigation Breadcrumb & Return to Cockpit Header for any non-cockpit view */}
        {section !== 'overview' && (
          <div className="section-back-bar">
            <button
              type="button"
              className="btn-back-cockpit"
              onClick={() => setSection('overview')}
            >
              ← Return to Live Cockpit
            </button>
            <span className="section-back-crumb">
              Control Room / <strong style={{ color: '#fff', textTransform: 'capitalize' }}>
                {section === 'history'
                  ? 'Trips & Audit Logs'
                  : section === 'kyc'
                  ? 'Driver & Operator KYC Verification'
                  : section === 'accounts'
                  ? 'Team Accounts'
                  : section}
              </strong>
            </span>
          </div>
        )}

        {/* Emergency Alert Banner (Shown if SOS active) */}
        {sosCount > 0 && (
          <div className="emergency-alert-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '20px' }}>🚨</span>
              <div>
                <strong>EMERGENCY SOS ACTIVE:</strong> {sosCount} incident(s) require immediate dispatch assistance!
              </div>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setSection('sos')}
              style={{ padding: '6px 14px', fontSize: '12px', background: '#ef4444', color: '#fff' }}
            >
              Review SOS Incident →
            </button>
          </div>
        )}

        {/* SECTION: Overview (Concept A Cockpit Split Screen) */}
        {section === 'overview' && (
          <div className="cockpit-split-grid">
            {/* Left Pane: Interactive Live Fleet Radar Map */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: '560px' }}>
              <FleetCockpitMap
                drivers={drivers}
                pendingRides={pendingRides}
                onAssignRide={(ride) => setAssigningRide(ride)}
              />
            </div>

            {/* Right Pane: Live Action Feed & Controls */}
            <aside className="cockpit-sidebar">
              {/* 4 Sleek KPI Stat Badges */}
              <div className="cockpit-kpi-grid">
                <div className="cockpit-kpi-card" style={{ '--kpi-accent': '#10b981' } as any}>
                  <span className="cockpit-kpi-title">Online Fleet</span>
                  <span className="cockpit-kpi-value" style={{ color: '#34d399' }}>
                    {onlineDriversCount}
                  </span>
                  <span className="cockpit-kpi-sub">Active on GPS network</span>
                </div>

                <div className="cockpit-kpi-card" style={{ '--kpi-accent': '#3b82f6' } as any}>
                  <span className="cockpit-kpi-title">In-Progress Trips</span>
                  <span className="cockpit-kpi-value" style={{ color: '#60a5fa' }}>
                    {activeCount}
                  </span>
                  <span className="cockpit-kpi-sub">Riders en route</span>
                </div>

                <div className="cockpit-kpi-card" style={{ '--kpi-accent': '#f59e0b' } as any}>
                  <span className="cockpit-kpi-title">Pending Queue</span>
                  <span className="cockpit-kpi-value" style={{ color: '#fbbf24' }}>
                    {pendingCount}
                  </span>
                  <span className="cockpit-kpi-sub">Awaiting driver</span>
                </div>

                <div className="cockpit-kpi-card" style={{ '--kpi-accent': '#ef4444' } as any}>
                  <span className="cockpit-kpi-title">Cancelled / SOS</span>
                  <span className="cockpit-kpi-value" style={{ color: '#f87171' }}>
                    {cancelledCount}
                  </span>
                  <span className="cockpit-kpi-sub">Customer audit log</span>
                </div>
              </div>

              {/* Live Pending Requests Card */}
              <div className="cockpit-feed-card">
                <div className="cockpit-feed-header">
                  <div className="cockpit-feed-title">
                    <span>⏳ Pending Dispatch Queue</span>
                    <span className="tab-badge badge-primary">{pendingRides.length}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSection('pending')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary)',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    View All →
                  </button>
                </div>

                {pendingRides.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--text-faint)' }}>
                    <div style={{ fontSize: '24px', marginBottom: '6px' }}>✅</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
                      Zero Pending Requests
                    </div>
                    <div style={{ fontSize: '11px', marginTop: '2px' }}>
                      All current ride bookings are assigned or completed.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {pendingRides.slice(0, 5).map((ride) => {
                      const waitMins = Math.floor(ride.wait_seconds / 60)
                      const waitSecs = ride.wait_seconds % 60
                      return (
                        <div
                          key={ride.id}
                          className={`cockpit-ride-item ${ride.is_aging ? 'aging-warning' : ''}`}
                        >
                          <div className="cockpit-ride-top">
                            <span className="cockpit-ride-passenger">
                              👤 {ride.passenger_name || 'Passenger'}
                            </span>
                            <span className="cockpit-ride-fare">£{(ride.fare || 0).toFixed(2)}</span>
                          </div>

                          <div className="cockpit-route-row">
                            <span className="cockpit-route-dot" style={{ background: '#10b981' }} />
                            <span>{ride.pickup?.address || 'Pickup Point'}</span>
                          </div>
                          <div className="cockpit-route-row">
                            <span className="cockpit-route-dot" style={{ background: '#ef4444' }} />
                            <span>{ride.destination?.address || 'Dropoff Point'}</span>
                          </div>

                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              marginTop: '4px',
                            }}
                          >
                            <span style={{ fontSize: '11px', color: ride.is_aging ? '#f87171' : 'var(--text-faint)' }}>
                              ⏱️ Wait: {waitMins}m {waitSecs}s
                            </span>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => setAssigningRide(ride)}
                              style={{ padding: '4px 10px', fontSize: '11.5px' }}
                            >
                              ⚡ Assign Driver
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Active Rides Monitor Card */}
              <div className="cockpit-feed-card">
                <div className="cockpit-feed-header">
                  <div className="cockpit-feed-title">
                    <span>🚖 In-Progress Rides</span>
                    <span className="tab-badge" style={{ background: '#2563eb', color: '#fff' }}>
                      {activeRides.length}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSection('active')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#60a5fa',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Manage →
                  </button>
                </div>

                {activeRides.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '16px 12px', color: 'var(--text-faint)' }}>
                    <div style={{ fontSize: '12px' }}>No active passenger rides right now.</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {activeRides.slice(0, 4).map((ride) => (
                      <div key={ride.id} className="cockpit-ride-item">
                        <div className="cockpit-ride-top">
                          <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#fff' }}>
                            {ride.driver_name || 'Driver'} → {ride.passenger_name || 'Passenger'}
                          </span>
                          <span
                            className="status-pill status-active"
                            style={{ fontSize: '9.5px', padding: '2px 7px' }}
                          >
                            {ride.status.replace('_', ' ')}
                          </span>
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                          📍 To: {ride.destination?.address || 'Dropoff Point'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Platform Operating Telemetry */}
              <div className="cockpit-feed-card" style={{ padding: '12px 16px', gap: '6px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '11.5px',
                    color: 'var(--text-muted)',
                  }}
                >
                  <span>Model: <strong>Route B SaaS</strong></span>
                  <span>Platform Fee: <strong style={{ color: 'var(--primary)' }}>8%</strong></span>
                  <span>Driver Share: <strong style={{ color: '#34d399' }}>92%</strong></span>
                </div>
                <div
                  style={{
                    fontSize: '10.5px',
                    color: 'var(--text-faint)',
                    textAlign: 'center',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    paddingTop: '6px',
                  }}
                >
                  Licensing: Fife Council & City of Edinburgh Council
                </div>
              </div>
            </aside>
          </div>
        )}

        {/* Other Sections */}
        {section === 'pending' && <PendingRequestsTable autoDispatch={autoDispatch} />}
        {section === 'active' && <ActiveRidesTable />}
        {section === 'cancelled' && <CancelledTripsView />}
        {section === 'history' && <TripHistoryView />}
        {section === 'drivers' && <DriverRosterView />}
        {section === 'kyc' && <KycManagementView />}
        {section === 'sos' && <SosIncidentsView />}
        {section === 'accounts' && <DispatcherAccountsView />}
        {section === 'audit' && <AuditLogView />}
        {section === 'analytics' && <AnalyticsDashboard />}
      </main>

      {/* Quick Manual Assign Modal */}
      {assigningRide && (
        <ManualAssignModal
          ride={assigningRide}
          onClose={() => setAssigningRide(null)}
          onAssigned={() => {
            setAssigningRide(null)
            fetchTelemetry()
          }}
        />
      )}
    </div>
  )
}
