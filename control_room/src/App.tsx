import './App.css'
import { env } from './config/env'
import { AuthProvider, useAuth } from './lib/auth'
import { LoginView } from './views/LoginView'
import { DashboardShell } from './views/DashboardShell'

function AppContent() {
  const { user, ready } = useAuth()

  if (!env.apiBaseUrl) {
    return (
      <div className="app-shell">
        <h1>Dispatch Control Room</h1>
        <p role="alert">
          VITE_API_BASE_URL is not configured. See control_room/.env.example.
        </p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="app-shell">
        <p>Loading…</p>
      </div>
    )
  }

  return user ? <DashboardShell /> : <LoginView />
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
