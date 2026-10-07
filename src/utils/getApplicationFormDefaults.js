import { supabase } from '../lib/supabase'
import { readApplicationFeeSettings } from './applicationFee'

/** Academic levels offered on the public application form, in display order. */
export const APPLICATION_DEGREE_LEVELS = ['diploma', 'bachelor', 'master', 'phd']

/**
 * Missing setting means every level is open.
 * An explicit list (including an empty one) is honored as-is.
 */
export function resolveActiveDegreeLevels(raw) {
  if (!Array.isArray(raw)) return [...APPLICATION_DEGREE_LEVELS]
  return APPLICATION_DEGREE_LEVELS.filter((lvl) => raw.includes(lvl))
}

/**
 * Global defaults for the applicant application form.
 * Stored in university_settings.onboarding_settings.application_form_defaults.
 *
 * Shape:
 * {
 *   enabled: boolean,
 *   lock_fields: boolean,
 *   college_id: number|null,
 *   major_id: number|null,
 *   semester_id: number|null,
 *   academic_year_id: number|null,
 *   active_degree_levels: string[]
 * }
 */

export async function getApplicationFormDefaults() {
  try {
    const { data, error } = await supabase
      .from('university_settings')
      .select('onboarding_settings')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    const raw = data?.onboarding_settings?.application_form_defaults
    const application_fee = readApplicationFeeSettings(data?.onboarding_settings)
    const active_degree_levels = resolveActiveDegreeLevels(raw?.active_degree_levels)
    const enabled = Boolean(raw?.enabled)
    if (!enabled) {
      return { enabled: false, active_degree_levels, application_fee }
    }

    const toNumOrNull = (v) => {
      if (v == null || v === '') return null
      const n = typeof v === 'number' ? v : parseInt(String(v), 10)
      return Number.isFinite(n) ? n : null
    }

    return {
      enabled: true,
      lock_fields: raw?.lock_fields !== false, // default true
      college_id: toNumOrNull(raw?.college_id),
      major_id: toNumOrNull(raw?.major_id),
      semester_id: toNumOrNull(raw?.semester_id),
      academic_year_id: toNumOrNull(raw?.academic_year_id),
      active_degree_levels,
      application_fee,
    }
  } catch (e) {
    console.warn('getApplicationFormDefaults failed:', e?.message || e)
    return { enabled: false, active_degree_levels: [...APPLICATION_DEGREE_LEVELS], application_fee: readApplicationFeeSettings(null) }
  }
}

