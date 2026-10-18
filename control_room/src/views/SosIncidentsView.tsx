import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/api'

interface SosIncident {
  id: string
  ride_id: string
  triggered_by_user_id: string
  triggered_by_role: string
  triggered_by_name: string
  lat: number
  lng: number
  reason: string
  status: string
  created_at: string
  notes?: string
}

export function SosIncidentsView() {
  const [incidents, setIncidents] = useState<SosIncident[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchIncidents = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiRequest<{ incidents: SosIncident[] }>('/api/dispatch/incidents/sos')
      setIncidents(res.incidents || [])
    } catch (err: any) {
      setError(err.message || 'Failed to load SOS incidents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchIncidents()
  }, [])

  const handleResolve = async (incidentId: string) => {
    const notes = prompt('Enter resolution notes / police dispatch details:', 'Contacted rider, emergency cleared')
    if (notes === null) return

    try {
      await apiRequest(`/api/dispatch/incidents/sos/${incidentId}/resolve`, {
        method: 'POST',
        body: { notes },
      })
      await fetchIncidents()
    } catch (err: any) {
      alert(`Failed to resolve incident: ${err.message}`)
    }
  }

  return (
    <div style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ color: '#ef4444' }}>🚨 Emergency Safety SOS Incidents</h2>
        <button type="button" onClick={fetchIncidents} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh Incidents'}
        </button>
      </div>

      {error && <div style={{ color: '#ef4444', marginTop: '0.5rem' }}>{error}</div>}

      {incidents.length === 0 && !loading && (
        <p style={{ color: '#71717a', marginTop: '1rem' }}>No emergency safety incidents recorded.</p>
      )}

      {incidents.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #3f3f46' }}>
              <th style={{ padding: '8px' }}>Status</th>
              <th style={{ padding: '8px' }}>Triggered By</th>
              <th style={{ padding: '8px' }}>Ride ID</th>
              <th style={{ padding: '8px' }}>Live Coordinates</th>
              <th style={{ padding: '8px' }}>Reason / Alert</th>
              <th style={{ padding: '8px' }}>Timestamp</th>
              <th style={{ padding: '8px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {incidents.map((inc) => (
              <tr
                key={inc.id}
                style={{
                  borderBottom: '1px solid #27272a',
                  backgroundColor: inc.status === 'active_emergency' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                }}
              >
                <td style={{ padding: '8px' }}>
                  <span
                    style={{
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontWeight: 'bold',
                      fontSize: '11px',
                      backgroundColor: inc.status === 'active_emergency' ? '#ef4444' : '#22c55e',
                      color: '#fff',
                    }}
                  >
                    {inc.status === 'active_emergency' ? 'ACTIVE SOS' : 'RESOLVED'}
                  </span>
                </td>
                <td style={{ padding: '8px' }}>
                  <strong>{inc.triggered_by_name}</strong> ({inc.triggered_by_role})
                </td>
                <td style={{ padding: '8px' }}>
                  <code>{inc.ride_id.slice(0, 8)}...</code>
                </td>
                <td style={{ padding: '8px' }}>
                  <a
                    href={`https://www.google.com/maps?q=${inc.lat},${inc.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#60a5fa' }}
                  >
                    {inc.lat.toFixed(4)}, {inc.lng.toFixed(4)} ↗
                  </a>
                </td>
                <td style={{ padding: '8px' }}>{inc.reason}</td>
                <td style={{ padding: '8px' }}>
                  <small>{new Date(inc.created_at).toLocaleString()}</small>
                </td>
                <td style={{ padding: '8px' }}>
                  {inc.status === 'active_emergency' ? (
                    <button
                      type="button"
                      style={{ backgroundColor: '#eab308', color: '#000', fontWeight: 'bold', cursor: 'pointer' }}
                      onClick={() => handleResolve(inc.id)}
                    >
                      Acknowledge & Resolve
                    </button>
                  ) : (
                    <small style={{ color: '#a1a1aa' }}>Resolved</small>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
