/**
 * Course registration rules shared by the student page and the admin enrollment page,
 * so both apply the same checks to the same data.
 */

/** A prerequisite with no minimum of its own needs at least this many grade points. */
export const DEFAULT_PREREQUISITE_MIN_POINTS = 2.0

const FINAL_GRADE_STATUSES = ['final', 'approved']

/**
 * Grade points of a finished course, or null while the course has no final grade.
 * enrollments.grade_points is written by the database only once the grade is final or approved.
 */
export function finalGradePoints(enrollment) {
  const raw = enrollment?.grade_components
  const component = Array.isArray(raw) ? raw[0] : raw
  if (component && FINAL_GRADE_STATUSES.includes(String(component.status || '').toLowerCase()) && component.gpa_points != null) {
    return Number(component.gpa_points)
  }
  if (enrollment?.grade_points != null) return Number(enrollment.grade_points)
  return null
}

/** True when the course ended with a passing grade (any grade above zero points). */
export function isPassedEnrollment(enrollment) {
  const points = finalGradePoints(enrollment)
  return points != null && points > 0
}

const toMinutes = (time) => {
  const [h = '0', m = '0'] = String(time || '').split(':')
  return Number(h) * 60 + Number(m)
}

/** Two classes clash when any of their weekly slots overlap on the same day. */
export function hasTimeConflict(classA, classB) {
  const a = classA?.class_schedules || []
  const b = classB?.class_schedules || []
  for (const s1 of a) {
    for (const s2 of b) {
      if (String(s1.day_of_week).toLowerCase() !== String(s2.day_of_week).toLowerCase()) continue
      if (toMinutes(s1.start_time) < toMinutes(s2.end_time) && toMinutes(s2.start_time) < toMinutes(s1.end_time)) return true
    }
  }
  return false
}

/**
 * Best grade points per subject the student has already passed.
 * Returns Map(subjectId -> points), or null when the record could not be read.
 */
export async function fetchPassedSubjects(supabase, studentId) {
  const { data, error } = await supabase
    .from('enrollments')
    .select('id, status, grade, grade_points, classes(subject_id), grade_components(gpa_points, status)')
    .eq('student_id', studentId)
  if (error) return null
  const passed = new Map()
  for (const row of data || []) {
    const subjectId = row.classes?.subject_id
    if (!subjectId || !isPassedEnrollment(row)) continue
    const points = finalGradePoints(row)
    if (!passed.has(subjectId) || passed.get(subjectId) < points) passed.set(subjectId, points)
  }
  return passed
}

/**
 * Prerequisites for a set of subjects, from both the current and the older table.
 * Returns Map(subjectId -> [{ subjectId, minPoints }]), or null when neither table could be read.
 */
export async function fetchPrerequisites(supabase, subjectIds) {
  const ids = [...new Set((subjectIds || []).filter(Boolean))]
  const result = new Map()
  if (ids.length === 0) return result

  const [current, legacy] = await Promise.all([
    supabase
      .from('course_prerequisites')
      .select('subject_id, prerequisite_subject_id, min_gpa, prerequisite_type')
      .in('subject_id', ids)
      .eq('prerequisite_type', 'prerequisite'),
    supabase.from('subject_prerequisites').select('subject_id, prerequisite_subject_id').in('subject_id', ids),
  ])
  if (current.error && legacy.error) return null

  const add = (subjectId, prerequisiteId, minPoints) => {
    if (!subjectId || !prerequisiteId) return
    const list = result.get(subjectId) || []
    const existing = list.find((x) => x.subjectId === prerequisiteId)
    if (existing) existing.minPoints = Math.max(existing.minPoints, minPoints)
    else list.push({ subjectId: prerequisiteId, minPoints })
    result.set(subjectId, list)
  }
  for (const row of current.data || []) {
    add(row.subject_id, row.prerequisite_subject_id, parseFloat(row.min_gpa) || DEFAULT_PREREQUISITE_MIN_POINTS)
  }
  for (const row of legacy.data || []) {
    add(row.subject_id, row.prerequisite_subject_id, DEFAULT_PREREQUISITE_MIN_POINTS)
  }
  return result
}

/** Prerequisites of one subject the student has not met yet. Unknown data never blocks. */
export function unmetPrerequisites(subjectId, prerequisites, passedSubjects) {
  if (!prerequisites || !passedSubjects) return []
  return (prerequisites.get(subjectId) || []).filter((need) => {
    const points = passedSubjects.get(need.subjectId)
    return points == null || points < need.minPoints
  })
}

// ---- semesters -------------------------------------------------------------

const FINISHED_SEMESTER_STATUSES = new Set(['completed', 'archived', 'closed', 'cancelled', 'ended'])
const DRAFT_SEMESTER_STATUSES = new Set(['draft', 'planned'])
const OPEN_BY_STATUS = new Set(['registration_open', 'active'])

const startOfDay = (value) => {
  const d = new Date(value)
  d.setHours(0, 0, 0, 0)
  return d
}
const endOfDay = (value) => {
  const d = new Date(value)
  d.setHours(23, 59, 59, 999)
  return d
}
const statusOf = (row) => String(row?.status || '').toLowerCase()

/** A semester that is over: closed by status, or past its end date. */
export function isFinishedSemester(semester, now = new Date()) {
  if (!semester) return true
  if (FINISHED_SEMESTER_STATUSES.has(statusOf(semester))) return true
  return Boolean(semester.end_date) && endOfDay(semester.end_date) < startOfDay(now)
}

/** A semester still being planned. */
export function isDraftSemester(semester) {
  return DRAFT_SEMESTER_STATUSES.has(statusOf(semester))
}

/** A semester whose teaching dates include today and which is not over. */
export function isRunningSemester(semester, now = new Date()) {
  if (!semester || isFinishedSemester(semester, now) || isDraftSemester(semester)) return false
  if (!semester.start_date) return false
  return startOfDay(semester.start_date) <= now
}

/**
 * Whether students can register in a semester today. One answer for the student page,
 * the admin semester pages and bulk registration, so they can never disagree.
 *
 * Order of the rules: the semester is over -> the academic year's switch is off ->
 * the semester's "course registration" switch is off -> the registration dates.
 * Returns { allowed, code, date } where code is one of
 * finished | yearClosed | switchOff | notStarted | open | late | ended.
 */
export function registrationState(semester, now = new Date()) {
  if (!semester) return { allowed: false, code: 'finished', date: null }
  if (isFinishedSemester(semester, now)) return { allowed: false, code: 'finished', date: semester.end_date || null }

  const year = Array.isArray(semester.academic_years) ? semester.academic_years[0] : semester.academic_years
  if (year && year.registration_open === false) return { allowed: false, code: 'yearClosed', date: null }

  const hasSwitch = typeof semester.course_registration_allowed === 'boolean'
  if (hasSwitch && !semester.course_registration_allowed) return { allowed: false, code: 'switchOff', date: null }

  const today = startOfDay(now)
  const { registration_start_date: opens, registration_end_date: closes, late_registration_end_date: lateUntil } = semester
  if (opens && today < startOfDay(opens)) return { allowed: false, code: 'notStarted', date: opens }
  if (closes && today <= endOfDay(closes)) return { allowed: true, code: 'open', date: closes }
  if (lateUntil && semester.late_registration_allowed !== false && today <= endOfDay(lateUntil)) {
    return { allowed: true, code: 'late', date: lateUntil }
  }
  if (closes || lateUntil) return { allowed: false, code: 'ended', date: lateUntil || closes }

  // No dates were set: the switch decides. Rows without the switch fall back to the status.
  if (hasSwitch || OPEN_BY_STATUS.has(statusOf(semester))) return { allowed: true, code: 'open', date: null }
  return { allowed: false, code: 'switchOff', date: null }
}

/** Credit-hour limits for a semester: its own numbers first, the university settings second. */
export function creditLimits(semester, settings = {}) {
  const pick = (...values) => {
    for (const v of values) {
      const n = parseInt(v, 10)
      if (Number.isFinite(n) && n > 0) return n
    }
    return 0
  }
  const min = Number.isFinite(parseInt(semester?.min_credit_hours, 10)) ? parseInt(semester.min_credit_hours, 10) : pick(settings.min_credit_hours)
  const max = pick(semester?.max_credit_hours, settings.max_credit_hours, 18)
  const maxWithPermission = Math.max(max, pick(semester?.max_credit_hours_with_permission, settings.max_credit_hours_with_permission, max))
  return { min, max, maxWithPermission }
}

/**
 * The sentence for a registrationState() result, e.g. "Registration is open until 14 October 2026."
 * The same words are shown to students and to staff.
 */
export function describeRegistrationState(state, t, formatDate) {
  if (!state) return ''
  const date = state.date ? formatDate(state.date) : ''
  switch (state.code) {
    case 'open':
      return date ? t('registrationState.openUntil', { date }) : t('registrationState.open')
    case 'late':
      return t('registrationState.late', { date })
    case 'notStarted':
      return t('registrationState.notStarted', { date })
    case 'ended':
      return date ? t('registrationState.endedOn', { date }) : t('registrationState.ended')
    case 'yearClosed':
      return t('registrationState.yearClosed')
    case 'switchOff':
      return t('registrationState.switchOff')
    default:
      return t('registrationState.finished')
  }
}
