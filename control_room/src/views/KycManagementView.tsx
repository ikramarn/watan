import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'

interface PendingKyc {
  driver_id: string
  driver_name: string
  driver_email: string
  vehicle_type: string
  license_number: string
  license_expiry: string
  council_name?: string
  operator_license_number?: string
  operator_license_expiry?: string
  phv_badge_number?: string
  insurance_policy: string
  vehicle_year: number
  vehicle_color: string
  document_urls: string[]
  submitted_at: string
}

export function KycManagementView() {
  const [items, setItems] = useState<PendingKyc[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionDriverId, setActionDriverId] = useState<string | null>(null)

  const fetchPending = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiRequest<{ pending_kyc: PendingKyc[] }>('/api/dispatch/drivers/kyc/pending')
      setItems(res.pending_kyc || [])
    } catch (err: any) {
      setError(err.message || 'Failed to fetch pending KYC records')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPending()
  }, [])

  const handleReview = async (driverId: string, status: 'verified' | 'rejected', reason: string = '') => {
    setActionDriverId(driverId)
    try {
      await apiRequest('/api/dispatch/drivers/kyc/review', {
        method: 'POST',
        body: { driver_id: driverId, status, reason },
      })
      await fetchPending()
    } catch (err: any) {
      alert(`Error reviewing KYC: ${err.message}`)
    } finally {
      setActionDriverId(null)
    }
  }

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>UK 1-Car Operator & Driver KYC Verification Queue</h2>
        <button type="button" onClick={fetchPending} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh Queue'}
        </button>
      </div>

      {error && <div style={{ color: '#ef4444', marginTop: '0.5rem' }}>{error}</div>}

      {items.length === 0 && !loading && (
        <p style={{ color: '#71717a', marginTop: '1rem' }}>No drivers currently pending KYC review.</p>
      )}

      {items.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #3f3f46' }}>
              <th style={{ padding: '8px' }}>Driver / Operator</th>
              <th style={{ padding: '8px' }}>Council & Operator Lic #</th>
              <th style={{ padding: '8px' }}>PHV Badge #</th>
              <th style={{ padding: '8px' }}>Insurance / MOT</th>
              <th style={{ padding: '8px' }}>Vehicle Spec</th>
              <th style={{ padding: '8px' }}>Submitted</th>
              <th style={{ padding: '8px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.driver_id} style={{ borderBottom: '1px solid #27272a' }}>
                <td style={{ padding: '8px' }}>
                  <strong>{item.driver_name}</strong>
                  <br />
                  <small style={{ color: '#a1a1aa' }}>{item.driver_email}</small>
                </td>
                <td style={{ padding: '8px' }}>
                  <strong>{item.council_name || 'UK Council'}</strong>
                  <br />
                  <small style={{ color: '#a1a1aa' }}>Lic: {item.operator_license_number || 'N/A'}</small>
                </td>
                <td style={{ padding: '8px' }}>{item.phv_badge_number || item.license_number}</td>
                <td style={{ padding: '8px' }}>
                  {item.insurance_policy}
                  <br />
                  <small style={{ color: '#a1a1aa' }}>Exp: {item.license_expiry}</small>
                </td>
                <td style={{ padding: '8px' }}>
                  {item.vehicle_year} {item.vehicle_color} ({item.vehicle_type})
                </td>
                <td style={{ padding: '8px' }}>
                  <small>{new Date(item.submitted_at).toLocaleString()}</small>
                </td>
                <td style={{ padding: '8px' }}>
                  <button
                    type="button"
                    style={{ backgroundColor: '#22c55e', color: '#fff', marginRight: '6px', cursor: 'pointer' }}
                    onClick={() => handleReview(item.driver_id, 'verified')}
                    disabled={actionDriverId === item.driver_id}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    style={{ backgroundColor: '#ef4444', color: '#fff', cursor: 'pointer' }}
                    onClick={() => {
                      const reason = prompt('Rejection reason (e.g. Expired license):', 'Document unreadable')
                      if (reason !== null) {
                        handleReview(item.driver_id, 'rejected', reason)
                      }
                    }}
                    disabled={actionDriverId === item.driver_id}
                  >
                    Reject
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
