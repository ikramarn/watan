/**
 * Token storage for the control_room app.
 *
 * Per design.md section 6 ("Auth flow"): tokens are kept in memory (for fast,
 * synchronous access during a session) and mirrored to `localStorage` (the
 * browser-appropriate persistence mechanism, analogous to the
 * SecureStore/AsyncStorage used by the existing passenger/driver apps) so a
 * session survives a page reload.
 */

const ACCESS_TOKEN_KEY = 'dcr_access_token'
const REFRESH_TOKEN_KEY = 'dcr_refresh_token'

let accessToken: string | null = null
let refreshToken: string | null = null
let initialized = false

function ensureInitialized() {
  if (initialized) return
  initialized = true
  try {
    accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY)
    refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY)
  } catch {
    // localStorage may be unavailable (e.g. privacy mode); fall back to memory-only.
    accessToken = null
    refreshToken = null
  }
}

export function getAccessToken(): string | null {
  ensureInitialized()
  return accessToken
}

export function getRefreshToken(): string | null {
  ensureInitialized()
  return refreshToken
}

export function setAccessToken(token: string | null): void {
  ensureInitialized()
  accessToken = token
  try {
    if (token) window.localStorage.setItem(ACCESS_TOKEN_KEY, token)
    else window.localStorage.removeItem(ACCESS_TOKEN_KEY)
  } catch {
    // Ignore storage failures; the in-memory value still holds for this session.
  }
}

export function setRefreshTokenValue(token: string | null): void {
  ensureInitialized()
  refreshToken = token
  try {
    if (token) window.localStorage.setItem(REFRESH_TOKEN_KEY, token)
    else window.localStorage.removeItem(REFRESH_TOKEN_KEY)
  } catch {
    // Ignore storage failures; the in-memory value still holds for this session.
  }
}

export function clearTokens(): void {
  setAccessToken(null)
  setRefreshTokenValue(null)
}
