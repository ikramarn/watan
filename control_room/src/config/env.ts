/**
 * Centralized access to build-time environment variables for the control_room app.
 *
 * Vite only exposes env vars prefixed with `VITE_` to client code (via `import.meta.env`).
 * See: https://vite.dev/guide/env-and-mode
 */

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL

if (!apiBaseUrl) {
  // eslint-disable-next-line no-console
  console.warn(
    'VITE_API_BASE_URL is not set. Copy .env.example to .env.local and set it to the backend URL.',
  )
}

export const env = {
  apiBaseUrl: apiBaseUrl ?? '',
}
