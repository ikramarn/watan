import { useState, type FormEvent } from 'react'
import { apiRequest, ApiError } from '../lib/api'
import type { User } from '../types'
import './DispatcherAccountsView.css'

interface CreateDispatcherResponse {
  user: User
}

/**
 * Admin-facing form for provisioning new dispatcher accounts.
 *
 * Calls `POST /api/dispatch/accounts` (backend task 4.3) via `apiRequest`,
 * which attaches the current dispatcher's auth headers automatically. The
 * backend requires an authenticated dispatcher and records `created_by` on
 * the new user, and rejects duplicate emails with 400 "Email already
 * registered".
 *
 * _Requirements: 1.9, 1.10_
 */
export function DispatcherAccountsView() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setSubmitting(true)
    try {
      const data = await apiRequest<CreateDispatcherResponse>('/api/dispatch/accounts', {
        method: 'POST',
        body: { email, password, name },
      })
      setSuccess(`Dispatcher account created for ${data.user.email}.`)
      setEmail('')
      setPassword('')
      setName('')
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Failed to create dispatcher account.'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="dispatcher-accounts-view">
      <h2>Create Dispatcher Account</h2>
      <form className="dispatcher-accounts-form" onSubmit={handleSubmit}>
        <label htmlFor="da-name">Name</label>
        <input
          id="da-name"
          name="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <label htmlFor="da-email">Email</label>
        <input
          id="da-email"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <label htmlFor="da-password">Password</label>
        <input
          id="da-password"
          name="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && (
          <p className="dispatcher-accounts-error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="dispatcher-accounts-success" role="status">
            {success}
          </p>
        )}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </div>
  )
}
