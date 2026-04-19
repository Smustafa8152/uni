import { supabase } from '../lib/supabase'

/** After email OTP + password, create/update public.users row with role applicant (Edge Function). */
export async function syncApplicantProfile({ name } = {}) {
  const { data, error } = await supabase.functions.invoke('sync-applicant-profile', {
    body: { name: name || undefined },
  })
  if (data && typeof data === 'object' && 'error' in data && data.error) {
    throw new Error(typeof data.error === 'string' ? data.error : data.error?.message || 'Profile sync failed')
  }
  if (error) {
    throw new Error(error.message || 'Failed to invoke sync-applicant-profile')
  }
  return data
}
