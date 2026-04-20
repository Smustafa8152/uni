import { supabase } from '../lib/supabase'
import { getMajorCatalogFeeAmounts } from './feeHierarchy'

function matchesArrayScope(arr, value) {
  if (!Array.isArray(arr) || arr.length === 0) return true
  return arr.includes(value)
}

function matchesSemesterScope(row, semesterId) {
  if (!semesterId) return true
  if (row?.semester_id != null) return Number(row.semester_id) === Number(semesterId)
  if (Array.isArray(row?.applies_to_semester) && row.applies_to_semester.length > 0) {
    return row.applies_to_semester.includes(Number(semesterId))
  }
  return true
}

/**
 * Computes total semester fees for an application from:
 * - majors.tuition_fee (+ majors.lab_fee when set)
 * - finance_configuration items scoped to major/semester/degree_level (fallback/additive)
 *
 * Returns { total, onboarding } where onboarding is 10% of total.
 */
export async function resolveOnboardingFeeAmount(application) {
  const collegeId = application?.college_id
  const majorId = application?.major_id
  const semesterId = application?.semester_id

  // Load major fee catalog + degree level (if not already present).
  let major = application?.majors || null
  if (!major && majorId) {
    const { data } = await supabase
      .from('majors')
      .select('id, degree_level, tuition_fee, lab_fee')
      .eq('id', majorId)
      .maybeSingle()
    major = data || null
  } else if (major && (major.tuition_fee == null || major.degree_level == null)) {
    const { data } = await supabase
      .from('majors')
      .select('id, degree_level, tuition_fee, lab_fee')
      .eq('id', major.id)
      .maybeSingle()
    major = { ...(major || {}), ...(data || {}) }
  }

  const catalog = getMajorCatalogFeeAmounts(major)
  const catalogTotal = Number(catalog?.tuition || 0) + Number(catalog?.lab || 0)

  // Pull finance_configuration and filter in JS (same approach as CreateInvoice.jsx)
  let configRows = []
  if (collegeId) {
    const { data } = await supabase
      .from('finance_configuration')
      .select(
        'id, fee_type, fee_name_en, fee_name_ar, amount, is_university_wide, college_id, semester_id, applies_to_semester, applies_to_major, applies_to_degree_level, is_active'
      )
      .eq('is_active', true)
      .or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
    configRows = data || []
  } else {
    const { data } = await supabase
      .from('finance_configuration')
      .select(
        'id, fee_type, fee_name_en, fee_name_ar, amount, is_university_wide, college_id, semester_id, applies_to_semester, applies_to_major, applies_to_degree_level, is_active'
      )
      .eq('is_active', true)
      .eq('is_university_wide', true)
    configRows = data || []
  }

  const degree = major?.degree_level || null
  const applicable = (configRows || []).filter((row) => {
    if (!matchesSemesterScope(row, semesterId)) return false
    if (!matchesArrayScope(row?.applies_to_major, Number(majorId))) return false
    if (!matchesArrayScope(row?.applies_to_degree_level, degree)) return false
    const type = String(row?.fee_type || '').toLowerCase()
    // Exclude admission fee (handled earlier in application flow) and wallet credits
    if (type === 'admission_fee' || type === 'wallet_credit') return false
    return true
  })

  const configTotal = applicable.reduce((acc, row) => {
    const n = parseFloat(row?.amount || 0)
    return acc + (Number.isFinite(n) ? n : 0)
  }, 0)

  // Prefer catalogTotal if set; otherwise rely on finance_configuration.
  const total = catalogTotal > 0 ? catalogTotal : configTotal
  const onboarding = total > 0 ? total * 0.1 : 0

  return {
    total,
    onboarding,
    breakdown: { catalogTotal, configTotal, financeItems: applicable },
  }
}

