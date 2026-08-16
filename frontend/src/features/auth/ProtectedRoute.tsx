import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

export function ProtectedRoute() {
  const { token, user, isLoading } = useAuth()

  if (token && isLoading) {
    return <p className="full-screen-center">Loading…</p>
  }

  if (!token || !user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
