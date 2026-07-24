/**
 * College-configurable ID templates for students (student_id) and instructors (employee_id).
 * Placeholders: {prefix}, {year}, {year2}, {college_code}, {sequence:D4} … {sequence:D6}
 */

export const STUDENT_ID_FORMAT_PRESETS = {
  custom: '',
  prefix_year_seq: '{prefix}{year}{sequence:D4}',
  year_college_seq: '{year}{college_code}{sequence:D4}',
  prefix_year_college_seq: '{prefix}{year}{college_code}{sequence:D4}',
}

export const INSTRUCTOR_ID_FORMAT_PRESETS = STUDENT_ID_FORMAT_PRESETS

export function detectStudentIdFormatPreset(format) {
  const f = (format || '').replace(/\s/g, '')
  if (f === STUDENT_ID_FORMAT_PRESETS.prefix_year_seq) return 'prefix_year_seq'
  if (f === STUDENT_ID_FORMAT_PRESETS.year_college_seq) return 'year_college_seq'
  if (f === STUDENT_ID_FORMAT_PRESETS.prefix_year_college_seq) return 'prefix_year_college_seq'
  return 'custom'
}

export function detectInstructorIdFormatPreset(format) {
  return detectStudentIdFormatPreset(format)
}

function padSequence(n, width) {
  return String(Math.max(0, Math.floor(Number(n) || 0))).padStart(width, '0')
}

/**
 * Apply template with known tokens. Sequence width from {sequence:Dn}.
 */
export function applyCollegeEntityIdFormat(template, { prefix = '', year, collegeCode = '', sequence }) {
  const yearNum = String(year ?? '')
  const year2 = yearNum.length >= 2 ? yearNum.slice(-2) : yearNum
  let result = template
  result = result.replace(/\{prefix\}/g, prefix ?? '')
  result = result.replace(/\{year\}/g, yearNum)
  result = result.replace(/\{year2\}/g, year2)
  result = result.replace(/\{college_code\}/g, collegeCode ?? '')
  result = result.replace(/\{sequence:D(\d+)\}/g, (_, w) => padSequence(sequence, parseInt(w, 10)))
  return result
}

/**
 * Template with sequence tokens removed — used for LIKE filters and parsing existing IDs.
 */
export function buildStaticIdPrefix(template, { prefix = '', year, collegeCode = '' }) {
  const yearNum = String(year ?? '')
  const year2 = yearNum.length >= 2 ? yearNum.slice(-2) : yearNum
  return template
    .replace(/\{prefix\}/g, prefix ?? '')
    .replace(/\{year\}/g, yearNum)
    .replace(/\{year2\}/g, year2)
    .replace(/\{college_code\}/g, collegeCode ?? '')
    .replace(/\{sequence:D\d+\}/g, '')
}

function maxSequenceFromIdsWithPrefix(ids, staticPrefix) {
  let max = 0
  for (const id of ids) {
    if (!id) continue
    if (staticPrefix && !id.startsWith(staticPrefix)) continue
    const rest = staticPrefix ? id.slice(staticPrefix.length) : id
    const m = rest.match(/^(\d+)$/)
    if (m) {
      const n = parseInt(m[1], 10)
      if (n > max) max = n
    }
  }
  return max
}

/** Fallback when static prefix is empty: take trailing digit run (legacy behavior). */
function maxSequenceFromIdsLegacy(ids) {
  let max = 0
  for (const id of ids) {
    if (!id) continue
    const match = String(id).match(/(\d{4,6})$/)
    if (match) {
      const n = parseInt(match[1], 10)
      if (n > max) max = n
    }
  }
  return max
}

export function nextSequenceFromExistingIds(existingIds, staticPrefix, startingNumber) {
  const base = startingNumber || 1
  const ids = existingIds || []
  const maxParsed = staticPrefix
    ? maxSequenceFromIdsWithPrefix(ids, staticPrefix)
    : maxSequenceFromIdsLegacy(ids)
  if (maxParsed > 0) return maxParsed + 1
  return base
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number|string} collegeId
 */
export async function generateStudentId(supabase, collegeId) {
  if (!collegeId) return null
  try {
    const { data: college } = await supabase
      .from('colleges')
      .select('student_id_prefix, student_id_format, student_id_starting_number, code')
      .eq('id', collegeId)
      .single()

    if (!college) return null

    const prefix = college.student_id_prefix ?? ''
    const collegeCode = college.code ?? ''
    const year = new Date().getFullYear()
    const format = college.student_id_format || '{prefix}{year}{sequence:D4}'
    const staticPrefix = buildStaticIdPrefix(format, { prefix, year, collegeCode })

    let query = supabase.from('students').select('student_id').eq('college_id', collegeId)
    if (staticPrefix) {
      query = query.like('student_id', `${staticPrefix}%`)
    }
    query = query.limit(10000)

    const { data: existingStudents, error: studentError } = await query
    if (studentError && studentError.code !== 'PGRST116') {
      console.error('Error fetching existing students:', studentError)
    }

    const existingIds = (existingStudents || []).map((s) => s.student_id).filter(Boolean)
    const existingSet = new Set(existingIds)

    let sequence = nextSequenceFromExistingIds(existingIds, staticPrefix, college.student_id_starting_number || 1)

    let attempts = 0
    const maxAttempts = 100
    while (attempts < maxAttempts) {
      const generatedId = applyCollegeEntityIdFormat(format, {
        prefix,
        year,
        collegeCode,
        sequence,
      })
      if (!existingSet.has(generatedId)) {
        return generatedId
      }
      sequence++
      attempts++
    }
    throw new Error('Unable to generate unique student ID after multiple attempts')
  } catch (err) {
    console.error('Error generating student ID:', err)
    return null
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number|string} collegeId
 */
export async function generateInstructorEmployeeId(supabase, collegeId) {
  if (!collegeId) return null
  try {
    const { data: college } = await supabase
      .from('colleges')
      .select('instructor_id_prefix, instructor_id_format, instructor_id_starting_number, code')
      .eq('id', collegeId)
      .single()

    if (!college) return null

    const prefix = college.instructor_id_prefix ?? 'INS'
    const collegeCode = college.code ?? ''
    const year = new Date().getFullYear()
    const format = college.instructor_id_format || '{prefix}{year}{sequence:D4}'
    const staticPrefix = buildStaticIdPrefix(format, { prefix, year, collegeCode })

    let query = supabase.from('instructors').select('employee_id').eq('college_id', collegeId)
    if (staticPrefix) {
      query = query.like('employee_id', `${staticPrefix}%`)
    }
    query = query.limit(10000)

    const { data: rows, error } = await query
    if (error && error.code !== 'PGRST116') {
      console.error('Error fetching existing instructors:', error)
    }

    const existingIds = (rows || []).map((r) => r.employee_id).filter(Boolean)
    const existingSet = new Set(existingIds)

    let sequence = nextSequenceFromExistingIds(existingIds, staticPrefix, college.instructor_id_starting_number || 1)

    let attempts = 0
    const maxAttempts = 100
    while (attempts < maxAttempts) {
      const generatedId = applyCollegeEntityIdFormat(format, {
        prefix,
        year,
        collegeCode,
        sequence,
      })
      if (!existingSet.has(generatedId)) {
        return generatedId
      }
      sequence++
      attempts++
    }
    throw new Error('Unable to generate unique employee ID after multiple attempts')
  } catch (err) {
    console.error('Error generating instructor employee ID:', err)
    return null
  }
}
