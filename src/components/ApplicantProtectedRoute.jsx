import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function ApplicantProtectedRoute({ children }) {
  const { user, userRole, loading, refreshUserRole } = useAuth()
  const location = useLocation()
  const [roleRefreshAttempted, setRoleRefreshAttempted] = useState(false)

  // On hard refresh, AuthContext may have a session but role fetch can lag/timeout.
  // Avoid redirecting to "/" while role is still unknown; trigger one refresh attempt.
  useEffect(() => {
    if (!loading && user && userRole == null && !roleRefreshAttempted) {
      setRoleRefreshAttempted(true)
      refreshUserRole?.().catch(() => {})
    }
  }, [loading, user, userRole, roleRefreshAttempted, refreshUserRole])

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

  if (userRole == null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f6fb]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#1a3a6b] mx-auto" />
          <p className="mt-4 text-[#6b7a99] text-sm">Loading…</p>
        </div>
      </div>
    )
  }

  // If the applicant has been promoted to student (after accepting offer), send them to student portal.
  if (userRole === 'student') {
    return <Navigate to="/student/profile" replace />
  }

  if (userRole !== 'applicant') {
    return <Navigate to="/" replace />
  }

  return children
}
