/**
 * Auth context for the control_room app.
 *
 * Per design.md section 6 ("Auth flow"): reuses `POST /api/auth/login` exactly
 * as the existing apps do (`{email, password}` -> `{access_token,
 * refresh_token, user}`). After a successful login, `user.role` is checked
 * client-side to confirm it equals `"dispatcher"` before the dashboard shell
 * is rendered. This is a UX guard only -- the real enforcement is server-side
 * (`require_role("dispatcher")`); if the role check fails here, an error is
 * shown and no tokens are stored.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { apiRequest, ApiError } from './api'
import { clearTokens, getAccessToken, setAccessToken, setRefreshTokenValue } from './tokens'
import type { User } from '../types'

interface LoginResponse {
  access_token?: string
  token?: string
  refresh_token?: string
  user: User
}

interface AuthContextValue {
  user: User | null
  ready: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const NOT_DISPATCHER_MESSAGE =
  'This account is not a dispatcher account. Please use dispatcher credentials.'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // On reload, if a token was persisted, confirm it still belongs to a
    // dispatcher via /api/auth/me before restoring the session.
    let cancelled = false
    const init = async () => {
      const token = getAccessToken()
      if (!token) {
        setReady(true)
        return
      }
      try {
        const me = await apiRequest<User>('/api/auth/me')
        if (cancelled) return
        if (me.role === 'dispatcher') {
          setUser(me)
        } else {
          clearTokens()
        }
      } catch {
        clearTokens()
      } finally {
        if (!cancelled) setReady(true)
      }
    }
    init()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiRequest<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    })

    if (data.user.role !== 'dispatcher') {
      // UX guard only: do not store tokens for a non-dispatcher account.
      throw new ApiError(NOT_DISPATCHER_MESSAGE, 403, data)
    }

    setAccessToken(data.access_token ?? data.token ?? null)
    setRefreshTokenValue(data.refresh_token ?? null)
    setUser(data.user)
  }, [])

  const logout = useCallback(() => {
    clearTokens()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
