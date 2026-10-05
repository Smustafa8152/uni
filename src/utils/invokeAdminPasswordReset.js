import { supabase } from '../lib/supabase'

/**
 * Reset password for a student, instructor, or applicant login.
 * Requires Edge Function `admin-reset-password` deployed with service role.
 */
export async function invokeAdminPasswordReset({ studentId, instructorId, applicationId, newPassword }) {
  const { data, error } = await supabase.functions.invoke('admin-reset-password', {
    body: { studentId, instructorId, applicationId, newPassword },
  })
  if (error) {
    let message = error.message || 'Password reset failed'
    const response = error.context
    if (response && typeof response.clone === 'function') {
      try {
        const body = await response.clone().json()
        if (typeof body?.error === 'string' && body.error.trim()) message = body.error
      } catch {
        // The function did not return JSON.
      }
    }
    throw new Error(message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
