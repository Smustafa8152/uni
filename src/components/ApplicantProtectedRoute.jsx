import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function ApplicantProtectedRoute({ children }) {
  const { user, userRole, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f6fb]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1a3a6b] mx-auto" />
          <p className="mt-4 text-[#6b7a99] text-sm">Loading…</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <Navigate to="/login/applicant" replace state={{ from: location.pathname + location.search }} />
    )
  }

  if (userRole !== 'applicant') {
    return <Navigate to="/" replace />
  }

  return children
}
