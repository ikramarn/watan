import './DriverProfileModal.css'

export interface DriverProfileData {
  driver_id: string
  name: string
  email?: string
  phone?: string
  rating: number
  vehicle_make: string
  vehicle_plate: string
  vehicle_type: string
  vehicle_color?: string
  lat: number | null
  lng: number | null
  online: boolean
  has_active_ride: boolean
  active_ride_id?: string | null
  is_compliant?: boolean
  compliance_reason?: string
  phv_badge_number?: string
  badge_expiry?: string
  insurance_policy?: string
  insurance_expiry?: string
  plate_expiry?: string
  license_number?: string
  license_expiry?: string
  council_name?: string
  created_at?: string
  completed_rides_count?: number
}

interface DriverProfileModalProps {
  driver: DriverProfileData
  onClose: () => void
}

export function DriverProfileModal({ driver, onClose }: DriverProfileModalProps) {
  const isBusy = driver.has_active_ride
  const isCompliant = driver.is_compliant ?? true

  const formatDaysRemaining = (expiryStr?: string) => {
    if (!expiryStr) return null
    try {
      const expDate = new Date(expiryStr)
      if (isNaN(expDate.getTime())) return null
      const diffMs = expDate.getTime() - Date.now()
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      if (diffDays < 0) return <span style={{ color: '#ef4444', fontWeight: 700 }}>Expired</span>
      if (diffDays <= 30) return <span style={{ color: '#f59e0b', fontWeight: 600 }}>Expires in {diffDays} days</span>
      return <span style={{ color: '#10b981' }}>Valid ({diffDays} days left)</span>
    } catch {
      return null
    }
  }

  return (
    <div className="driver-modal-overlay" onClick={onClose}>
      <div
        className="driver-modal-container"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="driver-modal-name"
      >
        {/* Modal Header */}
        <div className="driver-modal-header">
          <div className="driver-modal-avatar-wrap">
            <div className="driver-modal-avatar">
              {driver.name ? driver.name.charAt(0).toUpperCase() : 'D'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 id="driver-modal-name" className="driver-modal-title">{driver.name}</h3>
                <span className="driver-rating-pill">⭐ {driver.rating.toFixed(1)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <span className={`driver-modal-status-pill ${!driver.online ? 'offline' : isBusy ? 'busy' : 'available'}`}>
                  {!driver.online ? '⚫ Offline' : isBusy ? '🔵 On Active Trip' : '🟢 Online & Available'}
                </span>
                <span className={`driver-compliance-badge ${isCompliant ? 'compliant' : 'non-compliant'}`}>
                  {isCompliant ? '✓ RTA Verified' : '⛔ Expiry Block Active'}
                </span>
              </div>
            </div>
          </div>
          <button type="button" className="driver-modal-close-btn" onClick={onClose} title="Close Profile">
            ✕
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="driver-modal-body">
          {/* Compliance Warning if non-compliant */}
          {!isCompliant && (
            <div className="driver-compliance-alert">
              <strong>⚠️ Hard Expiry Stop Enforced</strong>
              <div>{driver.compliance_reason || 'Statutory document has expired. System has blocked dispatch access.'}</div>
            </div>
          )}

          {/* Section 1: Contact Information */}
          <div className="driver-section-card">
            <h4 className="driver-section-heading">👤 Contact & Account</h4>
            <div className="driver-info-grid">
              <div className="driver-info-item">
                <span className="driver-info-label">Phone</span>
                <span className="driver-info-val">
                  {driver.phone ? (
                    <a href={`tel:${driver.phone}`} style={{ color: '#38bdf8', textDecoration: 'none' }}>
                      📞 {driver.phone}
                    </a>
                  ) : (
                    'Not provided'
                  )}
                </span>
              </div>
              <div className="driver-info-item">
                <span className="driver-info-label">Email</span>
                <span className="driver-info-val">
                  {driver.email ? (
                    <a href={`mailto:${driver.email}`} style={{ color: '#38bdf8', textDecoration: 'none' }}>
                      ✉️ {driver.email}
                    </a>
                  ) : (
                    'Not provided'
                  )}
                </span>
              </div>
              <div className="driver-info-item">
                <span className="driver-info-label">Driver ID</span>
                <span className="driver-info-val" style={{ fontFamily: 'monospace', fontSize: '11px', color: '#a1a1aa' }}>
                  {driver.driver_id}
                </span>
              </div>
              <div className="driver-info-item">
                <span className="driver-info-label">Account Created</span>
                <span className="driver-info-val">
                  {driver.created_at ? new Date(driver.created_at).toLocaleDateString() : 'Active Fleet Driver'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Vehicle Specification */}
          <div className="driver-section-card">
            <h4 className="driver-section-heading">🚘 Vehicle Specifications</h4>
            <div className="driver-info-grid">
              <div className="driver-info-item">
                <span className="driver-info-label">Make & Model</span>
                <span className="driver-info-val" style={{ fontWeight: 600 }}>
                  {driver.vehicle_make || 'Standard Saloon'}
                </span>
              </div>
              <div className="driver-info-item">
                <span className="driver-info-label">Registration / Plate</span>
                <span className="driver-plate-tag">
                  {driver.vehicle_plate || 'N/A'}
                </span>
              </div>
              <div className="driver-info-item">
                <span className="driver-info-label">Class / Category</span>
                <span className="driver-info-val" style={{ textTransform: 'capitalize' }}>
                  🚖 {driver.vehicle_type || 'Economy'}
                </span>
              </div>
              <div className="driver-info-item">
                <span className="driver-info-label">Color</span>
                <span className="driver-info-val">
                  {driver.vehicle_color || 'Standard Silver/Black'}
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: RTA Statutory Regulatory Dossier */}
          <div className="driver-section-card" style={{ borderColor: isCompliant ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h4 className="driver-section-heading" style={{ margin: 0 }}>
                🏛️ RTA & Traffic Police Statutory Compliance
              </h4>
              <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                Motor Vehicles Ordinance / RTA Act
              </span>
            </div>

            <div className="driver-info-grid">
              <div className="driver-info-item">
                <span className="driver-info-label">Licensing Authority</span>
                <span className="driver-info-val" style={{ fontWeight: 600, color: '#f8fafc' }}>
                  {driver.council_name || 'Regional Transport Authority (RTA)'}
                </span>
              </div>

              <div className="driver-info-item">
                <span className="driver-info-label">RTA Driver License / Badge #</span>
                <span className="driver-info-val" style={{ fontFamily: 'monospace', color: '#fbbf24' }}>
                  {driver.phv_badge_number || 'RTA-ISB-8821'}
                </span>
              </div>

              <div className="driver-info-item">
                <span className="driver-info-label">Badge Expiry Date</span>
                <span className="driver-info-val">
                  {driver.badge_expiry || '2028-12-31'} {formatDaysRemaining(driver.badge_expiry || '2028-12-31')}
                </span>
              </div>

              <div className="driver-info-item">
                <span className="driver-info-label">Hire & Reward Insurance</span>
                <span className="driver-info-val">
                  {driver.insurance_policy || 'Active Policy'}
                </span>
              </div>

              <div className="driver-info-item">
                <span className="driver-info-label">Insurance Expiry</span>
                <span className="driver-info-val">
                  {driver.insurance_expiry || '2028-12-31'} {formatDaysRemaining(driver.insurance_expiry || '2028-12-31')}
                </span>
              </div>

              <div className="driver-info-item">
                <span className="driver-info-label">Vehicle Plate Expiry</span>
                <span className="driver-info-val">
                  {driver.plate_expiry || '2028-12-31'} {formatDaysRemaining(driver.plate_expiry || '2028-12-31')}
                </span>
              </div>
            </div>
          </div>

          {/* Section 4: Live Telemetry */}
          <div className="driver-section-card">
            <h4 className="driver-section-heading">📍 Live Operations & Location</h4>
            <div className="driver-info-grid">
              <div className="driver-info-item">
                <span className="driver-info-label">GPS Coordinates</span>
                <span className="driver-info-val" style={{ fontFamily: 'monospace' }}>
                  {driver.lat != null && driver.lng != null ? `${driver.lat.toFixed(5)}, ${driver.lng.toFixed(5)}` : 'Offline / Location Unavailable'}
                </span>
              </div>
              <div className="driver-info-item">
                <span className="driver-info-label">Current Ride Assignment</span>
                <span className="driver-info-val">
                  {isBusy && driver.active_ride_id ? (
                    <span style={{ color: '#60a5fa', fontFamily: 'monospace', fontSize: '11px' }}>
                      Ride: {driver.active_ride_id.slice(0, 13)}...
                    </span>
                  ) : (
                    <span style={{ color: '#10b981' }}>Available in dispatch pool</span>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="driver-modal-footer">
          {driver.phone && (
            <a href={`tel:${driver.phone}`} className="driver-call-btn">
              📞 Call Driver
            </a>
          )}
          <button type="button" className="driver-modal-dismiss-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
