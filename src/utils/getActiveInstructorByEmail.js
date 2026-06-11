import { supabase } from '../lib/supabase'
import { getEmailLookupCandidates } from './emailLookup'

/**
 * Resolve an active instructor row by email (case-insensitive).
 * Returns `null` if not found.
 */
export async function getActiveInstructorByEmail(email) {
  const candidates = getEmailLookupCandidates(email)
  for (const candidate of candidates) {
    const { data } = await supabase
      .from('instructors')
      .select('id, name_en, name_ar, email, college_id, department_id, can_add_materials, academic_title')
      .eq('status', 'active')
      .ilike('email', candidate)
      .maybeSingle()
    if (data) return data
  }
  return null
}

