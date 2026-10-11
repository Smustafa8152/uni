import { supabase } from '../lib/supabase'

/** Send or confirm an applicant password-reset code. The mailbox is the university enrollment address. */
export async function invokeApplicantForgotPassword(body) {
  const { data, error } = await supabase.functions.invoke('applicant-forgot-password', { body })
  if (error) {
    let message = error.message || 'Password reset failed'
    let code = ''
    const response = error.context
    if (response && typeof response.clone === 'function') {
      try {
        const payload = await response.clone().json()
        if (typeof payload?.error === 'string' && payload.error.trim()) {
          code = payload.error.trim()
          message = code
        }
      } catch {
        // The function did not return JSON.
      }
    }
    const err = new Error(message)
    err.code = code
    throw err
  }
  if (data?.error) {
    const err = new Error(data.error)
    err.code = data.error
    throw err
  }
  return data
}
