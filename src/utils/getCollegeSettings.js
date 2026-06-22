import { supabase } from '../lib/supabase'

/**
 * Fetches effective settings for a college
 * If use_university_settings is true, returns university settings
 * Otherwise, returns college-specific settings
 * 
 * @param {number} collegeId - The college ID
 * @returns {Promise<Object>} - Object containing settings and metadata
 */
export async function getCollegeSettings(collegeId) {
  try {
    // First, fetch the college to check if it uses university settings
    const { data: college, error: collegeError } = await supabase
      .from('colleges')
      .select('id, use_university_settings, academic_settings, financial_settings, email_settings, onboarding_settings, system_settings, examination_settings')
      .eq('id', collegeId)
      .single()

    if (collegeError) {
      throw collegeError
    }

    // If college uses university settings, fetch from university_settings
    if (college.use_university_settings) {
      const { data: universitySettings, error: universityError } = await supabase
        .from('university_settings')
        .select('academic_settings, financial_settings, email_settings, onboarding_settings, system_settings, examination_settings')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (universityError && universityError.code !== 'PGRST116') {
        console.error('Error fetching university settings:', universityError)
        // Fallback to college settings if university settings fetch fails
        return {
          academic: college.academic_settings || {},
          financial: college.financial_settings || {},
          email: college.email_settings || {},
          onboarding: college.onboarding_settings || {},
          system: college.system_settings || {},
          examination: college.examination_settings || {},
          usesUniversitySettings: false, // Fallback to college settings
        }
      }

      return {
        academic: universitySettings?.academic_settings || {},
        financial: universitySettings?.financial_settings || {},
        email: universitySettings?.email_settings || {},
        onboarding: universitySettings?.onboarding_settings || {},
        system: universitySettings?.system_settings || {},
        examination: universitySettings?.examination_settings || {},
        usesUniversitySettings: true,
      }
    }

    // Otherwise, use college-specific settings
    return {
      academic: college.academic_settings || {},
      financial: college.financial_settings || {},
      email: college.email_settings || {},
      onboarding: college.onboarding_settings || {},
      system: college.system_settings || {},
      examination: college.examination_settings || {},
      usesUniversitySettings: false,
    }
  } catch (error) {
    console.error('Error fetching college settings:', error)
    // Return empty settings on error
    return {
      academic: {},
      financial: {},
      email: {},
      onboarding: {},
      system: {},
      examination: {},
      usesUniversitySettings: false,
    }
  }
}

/**
 * Fetches semester credit limits from university settings only.
 * Used for enrollments, admission, attendance, examination, grade management.
 * Semester create/edit/view display these as read-only.
 *
 * @returns {Promise<Object>} - { min_credit_hours, max_credit_hours, max_credit_hours_with_permission, min_gpa_for_max_credits }
 */
export async function getSemesterCreditsFromUniversitySettings() {
  try {
    const { data, error } = await supabase
      .from('university_settings')
      .select('academic_settings')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Error fetching university settings for semester credits:', error)
      return {
        min_credit_hours: 12,
        max_credit_hours: 18,
        max_credit_hours_with_permission: 21,
        min_gpa_for_max_credits: 3.0,
      }
    }

    const academic = data?.academic_settings || {}
    return {
      min_credit_hours: parseInt(academic.min_credit_hours) || 12,
      max_credit_hours: parseInt(academic.max_credit_hours) || 18,
      max_credit_hours_with_permission: parseInt(academic.max_with_permission) || 21,
      min_gpa_for_max_credits: parseFloat(academic.min_gpa_for_overload) || 3.0,
    }
  } catch (err) {
    console.error('Error in getSemesterCreditsFromUniversitySettings:', err)
    return {
      min_credit_hours: 12,
      max_credit_hours: 18,
      max_credit_hours_with_permission: 21,
      min_gpa_for_max_credits: 3.0,
    }
  }
}

const defaultGradingScale = [
  { letter: 'A+', minPercent: 95, maxPercent: 100, points: 4.0, passing: true },
  { letter: 'A', minPercent: 90, maxPercent: 94, points: 3.7, passing: true },
  { letter: 'B+', minPercent: 85, maxPercent: 89, points: 3.3, passing: true },
  { letter: 'B', minPercent: 80, maxPercent: 84, points: 3.0, passing: true },
  { letter: 'C+', minPercent: 75, maxPercent: 79, points: 2.7, passing: true },
  { letter: 'C', minPercent: 70, maxPercent: 74, points: 2.0, passing: true },
  { letter: 'D', minPercent: 60, maxPercent: 69, points: 1.0, passing: true },
  { letter: 'F', minPercent: 0, maxPercent: 59, points: 0.0, passing: false },
]

/**
 * Converts numeric grade (0-100) to GPA points using the grading scale.
 * @param {number} numericGrade - Percentage grade (0-100)
 * @param {Array} gradingScale - From getGradingScaleFromUniversitySettings()
 * @returns {number|null} - GPA points or null if no grade
 */
export function numericGradeToGpaPoints(numericGrade, gradingScale) {
  if (numericGrade == null || numericGrade === '' || isNaN(parseFloat(numericGrade))) return null
  const pct = parseFloat(numericGrade)
  const scale = Array.isArray(gradingScale) && gradingScale.length > 0 ? gradingScale : defaultGradingScale
  const entry = scale.find(g => {
    const min = g.minPercent ?? g.min_percent ?? 0
    const max = g.maxPercent ?? g.max_percent ?? 100
    return pct >= min && pct <= max
  })
  return entry ? (entry.points ?? 0) : 0
}

/**
 * University display names from university_settings.academic_settings (general tab).
 */
export async function getUniversityBranding() {
  try {
    const { data } = await supabase
      .from('university_settings')
      .select('academic_settings')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const ac = data?.academic_settings || {}
    return {
      nameAr: ac.name_ar || '',
      nameEn: ac.name_en || '',
    }
  } catch {
    return { nameAr: '', nameEn: '' }
  }
}

/**
 * Gets effective GPA points for an enrollment using grading scale.
 * Uses numeric_grade + scale if available; otherwise falls back to stored gpa_points.
 * @param {Object} enrollment - Has grade_components, classes.subjects.credit_hours
 * @param {Array} gradingScale - From getGradingScaleFromUniversitySettings()
 * @returns {{ points: number|null, credits: number }} - GPA points and credits
 */
export function getSubjectGpaFromEnrollment(enrollment, gradingScale) {
  const comp = enrollment.grade_components?.[0]
  const credits = enrollment.classes?.subjects?.credit_hours || 0
  const ch = typeof credits === 'number' ? credits : parseInt(credits, 10) || 0
  if (ch <= 0) return { points: null, credits: ch }
  // Prefer grade_components; fall back to enrollment.grade_points / numeric_grade
  const numericGrade = comp?.numeric_grade ?? enrollment.numeric_grade
  const gpaPoints = comp?.gpa_points ?? enrollment.grade_points
  const points = numericGrade != null ? numericGradeToGpaPoints(numericGrade, gradingScale) : null
  const effectivePoints = points != null ? points : (gpaPoints != null ? Number(gpaPoints) : null)
  return { points: effectivePoints, credits: ch }
}

/**
 * Calculates Semester GPA and Cumulative GPA using grading scale.
 * @param {Array} enrollments - List of enrollments with grade_components, classes.subjects
 * @param {Array} gradingScale - From getGradingScaleFromUniversitySettings()
 * @param {number|null} semesterId - If provided, only include enrollments for this semester
 * @returns {{ gpa: string, totalPoints: number, totalCredits: number }}
 */
export function calculateGpaWithScale(enrollments, gradingScale, semesterId = null) {
  const filtered = semesterId
    ? enrollments.filter(e => e.semester_id === semesterId)
    : enrollments
  let totalPoints = 0
  let totalCredits = 0
  filtered.forEach(enrollment => {
    const { points, credits } = getSubjectGpaFromEnrollment(enrollment, gradingScale)
    if (points != null && credits > 0) {
      totalPoints += points * credits
      totalCredits += credits
    }
  })
  const gpa = totalCredits > 0 ? (totalPoints / totalCredits).toFixed(2) : '0.00'
  return { gpa, totalPoints, totalCredits }
}

/**
 * Fetches grading scale from university settings only.
 * Used for grade management, reports, transcripts.
 *
 * @returns {Promise<Array>} - Array of { letter, minPercent, maxPercent, points, passing }
 */
export async function getGradingScaleFromUniversitySettings() {
  try {
    const { data, error } = await supabase
      .from('university_settings')
      .select('academic_settings')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Error fetching university settings for grading scale:', error)
      return defaultGradingScale
    }

    const scale = data?.academic_settings?.grading_scale
    return Array.isArray(scale) && scale.length > 0 ? scale : defaultGradingScale
  } catch (err) {
    console.error('Error in getGradingScaleFromUniversitySettings:', err)
    return defaultGradingScale
  }
}

/**
 * Fetches grade types (with max/min/pass/fail) from university settings.
 * Used for grade management, reports, subject validation.
 *
 * @returns {Promise<Array>} - Array of { code, name_en, name_ar, maximum, minimum, pass_score, fail_score, ... }
 */
export async function getGradeTypesFromUniversitySettings() {
  try {
    const { data, error } = await supabase
      .from('university_settings')
      .select('grade_types')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Error fetching university settings for grade types:', error)
      return []
    }

    const types = data?.grade_types
    return Array.isArray(types) ? types : []
  } catch (err) {
    console.error('Error in getGradeTypesFromUniversitySettings:', err)
    return []
  }
}

/** Actual column names in grade_components table (no dynamic columns like grade_002) */
export const GRADE_COMPONENT_DB_COLUMNS = [
  'midterm',
  'final',
  'assignments',
  'quizzes',
  'class_participation',
  'project',
  'lab',
  'other',
]

/** Maps grade_type_code (or id) to a valid grade_components column name */
function gradeTypeCodeToDbColumn(code) {
  if (!code || typeof code !== 'string') return null
  const normalized = code.toLowerCase().trim().replace(/\s+/g, '_')
  if (GRADE_COMPONENT_DB_COLUMNS.includes(normalized)) return normalized
  // Common aliases
  const alias = {
    assignment: 'assignments',
    quiz: 'quizzes',
    participation: 'class_participation',
    'class_participation': 'class_participation',
  }[normalized]
  if (alias) return alias
  // Numeric or unknown codes (e.g. "002") map to "other" to avoid invalid column names
  return 'other'
}

/**
 * Merges subject grade_configuration with grade type definitions from university settings.
 * Maximum, minimum, pass_score, fail_score are taken from university settings ONLY (grade type).
 * Subject config only contributes weight and grade type reference.
 * Adds dbColumn: the actual grade_components table column name for this type.
 *
 * @param {Array} gradeConfiguration - Subject's grade_configuration (weight, grade_type_code, etc.)
 * @param {Array} gradeTypes - From getGradeTypesFromUniversitySettings()
 * @returns {Array} - Config with effective max/min/pass/fail and dbColumn
 */
export function mergeGradeConfigWithTypes(gradeConfiguration, gradeTypes) {
  if (!Array.isArray(gradeConfiguration)) return []
  const usedColumns = new Set()
  return gradeConfiguration.map((config) => {
    const gt = gradeTypes.find((t) => t.code === config.grade_type_code)
    let dbColumn = gradeTypeCodeToDbColumn(config.grade_type_code)
    if (dbColumn && usedColumns.has(dbColumn)) {
      dbColumn = GRADE_COMPONENT_DB_COLUMNS.find((c) => !usedColumns.has(c)) || 'other'
    }
    if (dbColumn) usedColumns.add(dbColumn)
    const assessmentGroup =
      config.assessment_group ||
      gt?.assessment_group ||
      (dbColumn === 'midterm' ? 'midterm' : dbColumn === 'final' ? 'final' : 'activities')
    return {
      ...config,
      maximum: gt?.maximum ?? 100,
      minimum: gt?.minimum ?? 0,
      pass_score: gt?.pass_score ?? 60,
      fail_score: gt?.fail_score ?? 50,
      dbColumn: dbColumn || 'other',
      assessmentGroup,
    }
  })
}

/**
 * Gets a specific setting value from college or university settings
 * 
 * @param {number} collegeId - The college ID
 * @param {string} category - Settings category: 'academic', 'financial', 'email', 'onboarding', 'system', 'examination'
 * @param {string} path - Dot-separated path to the setting (e.g., 'creditHours.minPerSemester')
 * @param {any} defaultValue - Default value if setting not found
 * @returns {Promise<any>} - The setting value
 */
const DEFAULT_CURRENCY_CODE = 'USD'

/**
 * Returns a valid ISO 4217 code for Intl, or USD if invalid.
 */
export function normalizeCurrencyCode(code) {
  if (code == null || code === '') return DEFAULT_CURRENCY_CODE
  const s = String(code)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  const three = s.length >= 3 ? s.slice(0, 3) : s
  if (!/^[A-Z]{3}$/.test(three)) return DEFAULT_CURRENCY_CODE
  try {
    new Intl.NumberFormat('en-US', { style: 'currency', currency: three }).format(0)
    return three
  } catch {
    return DEFAULT_CURRENCY_CODE
  }
}

/**
 * Reads currency from a financial_settings JSONB blob when explicitly set.
 * Returns null if no currency is configured (so callers can fall back).
 */
export function tryExtractCurrencyFromFinancial(financial) {
  if (!financial || typeof financial !== 'object') return null
  const cur = financial.currency
  if (cur != null && typeof cur === 'object') {
    const raw = cur.code
    if (raw != null && String(raw).trim() !== '') {
      return normalizeCurrencyCode(raw)
    }
  }
  if (financial.currency_code != null && String(financial.currency_code).trim() !== '') {
    return normalizeCurrencyCode(financial.currency_code)
  }
  return null
}

/**
 * Reads currency code from college financial_settings JSON (currency.code).
 */
export function getCurrencyCodeFromFinancialSettings(financial) {
  return tryExtractCurrencyFromFinancial(financial) || DEFAULT_CURRENCY_CODE
}

/**
 * Currency for invoices/UI for a college.
 * Always reads the college row's financial_settings.currency first (even when
 * use_university_settings is true — other modules may inherit university
 * settings, but fee currency is normally per-college). Falls back to
 * university financial_settings, then USD.
 */
export async function getCollegeCurrencyCode(collegeId) {
  if (!collegeId) return DEFAULT_CURRENCY_CODE
  try {
    const { data: college, error } = await supabase
      .from('colleges')
      .select('use_university_settings, financial_settings')
      .eq('id', collegeId)
      .single()

    if (error || !college) {
      if (error) console.warn('getCollegeCurrencyCode: college fetch', error.message)
      return DEFAULT_CURRENCY_CODE
    }

    const fromCollege = tryExtractCurrencyFromFinancial(college.financial_settings)
    if (fromCollege) return fromCollege

    if (college.use_university_settings) {
      const { data: uni, error: uniErr } = await supabase
        .from('university_settings')
        .select('financial_settings')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!uniErr && uni?.financial_settings) {
        const fromUni = tryExtractCurrencyFromFinancial(uni.financial_settings)
        if (fromUni) return fromUni
      }
    }

    return DEFAULT_CURRENCY_CODE
  } catch (e) {
    console.error('getCollegeCurrencyCode:', e)
    return DEFAULT_CURRENCY_CODE
  }
}

export async function getCollegeSetting(collegeId, category, path, defaultValue = null) {
  try {
    const settings = await getCollegeSettings(collegeId)
    const categorySettings = settings[category] || {}
    
    // Navigate through the path
    const keys = path.split('.')
    let value = categorySettings
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key]
      } else {
        return defaultValue
      }
    }
    
    return value !== undefined ? value : defaultValue
  } catch (error) {
    console.error('Error getting college setting:', error)
    return defaultValue
  }
}
