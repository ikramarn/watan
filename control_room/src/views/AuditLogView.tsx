import { useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from '../lib/api'
import './AuditLogView.css'

/**
 * Shape of a single entry in `GET /api/dispatch/audit-log`'s `entries` array
 * (backend/app/routers/dispatch.py: get_audit_log, task 12.1). Entries are
 * returned sorted by `created_at` descending.
 */
interface AuditLogEntry {
  id: string
  dispatcher_id: string
  dispatcher_name: string
  action: string
  ride_id: string | null
  driver_id: string | null
  previous_driver_id: string | null
  detail: unknown
  created_at: string
}

interface AuditLogResponse {
  entries: AuditLogEntry[]
}

function summarizeDetail(detail: unknown): string {
  if (detail == null) return ''
  if (typeof detail === 'string') return detail
  try {
    const text = JSON.stringify(detail)
    return text === '{}' ? '' : text
  } catch {
    return String(detail)
  }
}

/**
 * Renders `GET /api/dispatch/audit-log` as a table, with optional
 * date-range (`start`/`end`) and dispatcher-id filters forwarded as query
 * params to the backend, which filters `created_at` inclusively on both
 * ends and does an exact match on `dispatcher_id`.
 *
 * _Requirements: 8.2_
 */
export function AuditLogView() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [dispatcherId, setDispatcherId] = useState('')

  const load = async (filters: { start: string; end: string; dispatcherId: string }) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filters.start) params.set('start', filters.start)
      if (filters.end) params.set('end', filters.end)
      if (filters.dispatcherId) params.set('dispatcher_id', filters.dispatcherId)
      const query = params.toString()
      const data = await apiRequest<AuditLogResponse>(
        `/api/dispatch/audit-log${query ? `?${query}` : ''}`,
      )
      setEntries(data.entries)
    } catch {
      setError('Failed to load audit log.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load({ start: '', end: '', dispatcherId: '' })
  }, [])

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    load({ start, end, dispatcherId })
  }

  const handleClear = () => {
    setStart('')
    setEnd('')
    setDispatcherId('')
    load({ start: '', end: '', dispatcherId: '' })
  }

  return (
    <div className="audit-log-view">
      <h2>Audit Log</h2>

      <form className="audit-log-filters" onSubmit={handleSubmit}>
        <label htmlFor="audit-log-start">Start</label>
        <input
          id="audit-log-start"
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <label htmlFor="audit-log-end">End</label>
        <input id="audit-log-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        <label htmlFor="audit-log-dispatcher">Dispatcher ID</label>
        <input
          id="audit-log-dispatcher"
          type="text"
          placeholder="Filter by dispatcher id…"
          value={dispatcherId}
          onChange={(e) => setDispatcherId(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Loading…' : 'Apply filters'}
        </button>
        <button type="button" onClick={handleClear} disabled={loading}>
          Clear
        </button>
      </form>

      {error && (
        <p className="audit-log-error" role="alert">
          {error}
        </p>
      )}

      {!error && !loading && entries.length === 0 && <p>No audit log entries match.</p>}

      {!error && entries.length > 0 && (
        <table className="audit-log-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Dispatcher</th>
              <th>Action</th>
              <th>Ride</th>
              <th>Driver</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.created_at}</td>
                <td>{entry.dispatcher_name || entry.dispatcher_id}</td>
                <td>{entry.action}</td>
                <td>{entry.ride_id ?? '—'}</td>
                <td>{entry.driver_id ?? '—'}</td>
                <td>{summarizeDetail(entry.detail) || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
