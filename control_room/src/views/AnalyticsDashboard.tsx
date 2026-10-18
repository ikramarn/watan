import { useEffect, useState, type FormEvent } from 'react'
import { apiRequest } from '../lib/api'
import './AnalyticsDashboard.css'

/**
 * Shape of a single entry in `GET /api/dispatch/analytics/volume`'s
 * `volume` array (backend/app/routers/dispatch.py: get_ride_volume_analytics
 * / compute_ride_volume, task 12.2).
 */
interface VolumeEntry {
  date: string
  ride_type: string
  count: number
}

interface VolumeResponse {
  volume: VolumeEntry[]
}

/**
 * Shape of `GET /api/dispatch/analytics/wait-times`'s `wait_times` object
 * (backend/app/routers/dispatch.py: get_wait_time_analytics /
 * compute_wait_times, task 12.2).
 */
interface WaitTimeStats {
  avg_seconds: number
  p95_seconds: number
}

interface WaitTimesResponse {
  wait_times: {
    automatic: WaitTimeStats
    manual: WaitTimeStats
  }
}

/**
 * Shape of a single entry in `GET /api/dispatch/analytics/performance`'s
 * `performance` array (backend/app/routers/dispatch.py:
 * get_dispatcher_performance_analytics / compute_dispatcher_performance,
 * task 12.2).
 */
interface PerformanceEntry {
  dispatcher_id: string
  dispatcher_name: string
  manual_assign: number
  force_cancel: number
  reassign: number
}

interface PerformanceResponse {
  performance: PerformanceEntry[]
}

function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)}s`
}

/**
 * Renders the three `/api/dispatch/analytics/*` endpoints (ride volume by
 * day/type, wait times avg/p95 split by assignment type, and per-dispatcher
 * action counts) as tables, driven by a single shared start/end date-range
 * picker at the top, following the same date-filter pattern as
 * `AuditLogView`.
 *
 * _Requirements: 9.1, 9.2, 9.3, 9.4_
 */
export function AnalyticsDashboard() {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const [volume, setVolume] = useState<VolumeEntry[]>([])
  const [waitTimes, setWaitTimes] = useState<WaitTimesResponse['wait_times'] | null>(null)
  const [performance, setPerformance] = useState<PerformanceEntry[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (range: { start: string; end: string }) => {
    if (!range.start || !range.end) return
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ start: range.start, end: range.end }).toString()
      const [volumeData, waitTimesData, performanceData] = await Promise.all([
        apiRequest<VolumeResponse>(`/api/dispatch/analytics/volume?${params}`),
        apiRequest<WaitTimesResponse>(`/api/dispatch/analytics/wait-times?${params}`),
        apiRequest<PerformanceResponse>(`/api/dispatch/analytics/performance?${params}`),
      ])
      setVolume(volumeData.volume)
      setWaitTimes(waitTimesData.wait_times)
      setPerformance(performanceData.performance)
    } catch {
      setError('Failed to load analytics.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    setStart(thirtyDaysAgo)
    setEnd(today)
    load({ start: thirtyDaysAgo, end: today })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    load({ start, end })
  }

  return (
    <div className="analytics-dashboard">
      <h2>Analytics</h2>

      <form className="analytics-filters" onSubmit={handleSubmit}>
        <label htmlFor="analytics-start">Start</label>
        <input
          id="analytics-start"
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <label htmlFor="analytics-end">End</label>
        <input id="analytics-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        <button type="submit" disabled={loading || !start || !end}>
          {loading ? 'Loading…' : 'Apply range'}
        </button>
      </form>

      {error && (
        <p className="analytics-error" role="alert">
          {error}
        </p>
      )}

      <section className="analytics-section">
        <h3>Ride volume by day/type</h3>
        {!error && volume.length === 0 && !loading && <p>No ride volume data for this range.</p>}
        {volume.length > 0 && (
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Ride type</th>
                <th>Count</th>
              </tr>
            </thead>
            <tbody>
              {volume.map((entry) => (
                <tr key={`${entry.date}-${entry.ride_type}`}>
                  <td>{entry.date}</td>
                  <td>{entry.ride_type}</td>
                  <td>{entry.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="analytics-section">
        <h3>Wait times (avg/p95, automatic vs manual)</h3>
        {!error && !waitTimes && !loading && <p>No wait time data for this range.</p>}
        {waitTimes && (
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Assignment type</th>
                <th>Avg wait</th>
                <th>P95 wait</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Automatic</td>
                <td>{formatSeconds(waitTimes.automatic.avg_seconds)}</td>
                <td>{formatSeconds(waitTimes.automatic.p95_seconds)}</td>
              </tr>
              <tr>
                <td>Manual</td>
                <td>{formatSeconds(waitTimes.manual.avg_seconds)}</td>
                <td>{formatSeconds(waitTimes.manual.p95_seconds)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <section className="analytics-section">
        <h3>Dispatcher performance</h3>
        {!error && performance.length === 0 && !loading && (
          <p>No dispatcher performance data for this range.</p>
        )}
        {performance.length > 0 && (
          <table className="analytics-table">
            <thead>
              <tr>
                <th>Dispatcher</th>
                <th>Manual assigns</th>
                <th>Force cancels</th>
                <th>Reassigns</th>
              </tr>
            </thead>
            <tbody>
              {performance.map((entry) => (
                <tr key={entry.dispatcher_id}>
                  <td>{entry.dispatcher_name || entry.dispatcher_id}</td>
                  <td>{entry.manual_assign}</td>
                  <td>{entry.force_cancel}</td>
                  <td>{entry.reassign}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
