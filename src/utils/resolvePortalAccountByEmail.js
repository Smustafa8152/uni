import { supabase } from '../lib/supabase'
import { getEmailLookupCandidates } from './emailLookup'

/**
 * Detect whether an email belongs to instructor / student / applicant / staff
 * before or during portal signup/login. Best-effort under RLS (may return unknown).
 * @returns {Promise<'instructor'|'student'|'applicant'|'staff'|'unknown'>}
 */
export async function resolvePortalAccountByEmail(email) {
  const candidates = getEmailLookupCandidates(email)
  if (!candidates.length) return 'unknown'

  for (const candidate of candidates) {
    const { data: inst } = await supabase
      .from('instructors')
      .select('id, status')
      .ilike('email', candidate)
      .limit(1)
      .maybeSingle()
    if (inst?.id) return 'instructor'
  }

  for (const candidate of candidates) {
    const { data: userRow } = await supabase
      .from('users')
      .select('role')
      .ilike('email', candidate)
      .maybeSingle()
    const role = String(userRow?.role || '').toLowerCase()
    if (role === 'instructor') return 'instructor'
    if (role === 'applicant') return 'applicant'
    if (role === 'student') return 'student'
    if (role === 'admin' || role === 'user' || role === 'super_admin') return 'staff'
  }

  for (const candidate of candidates) {
    const { data: stu } = await supabase
      .from('students')
      .select('id')
      .ilike('email', candidate)
      .limit(1)
      .maybeSingle()
    if (stu?.id) return 'student'
  }

  return 'unknown'
}
