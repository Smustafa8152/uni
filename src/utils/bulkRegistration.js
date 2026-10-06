/**
 * Bulk registration: many students into one or more classes of a semester.
 *
 * planBulkRegistration() is pure: it decides, for every student and class, whether the
 * registration goes ahead and why not when it does not. applyBulkRegistration() writes
 * exactly what the plan says, in small batches, and reports what happened.
 */
import { hasTimeConflict, unmetPrerequisites } from './registrationRules'

const creditsOf = (cls) => parseInt(cls?.subjects?.credit_hours, 10) || 0
const INACTIVE = new Set(['dropped', 'withdrawn'])

/** Run `worker` over `items` in slices, a few slices at a time, in order. */
export async function inChunks(items, size, worker, { concurrency = 3, onProgress } = {}) {
  const slices = []
  for (let i = 0; i < items.length; i += size) slices.push(items.slice(i, i + size))
  const results = new Array(slices.length)
  let next = 0
  let done = 0
  const run = async () => {
    while (next < slices.length) {
      const index = next++
      results[index] = await worker(slices[index], index)
      done += 1
      onProgress?.(done, slices.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, slices.length) || 1 }, run))
  return results
}

const EXISTING_SELECT = `
  id, student_id, class_id, status,
  classes ( id, code, section, subject_id, subjects ( code, credit_hours ), class_schedules ( day_of_week, start_time, end_time ) )
`

/** Every registration the given students already have in the semester, whatever its status. */
export async function fetchSemesterEnrollments(supabase, semesterId, studentIds, onProgress) {
  const pages = await inChunks(
    studentIds,
    15,
    async (slice) => {
      const { data, error } = await supabase.from('enrollments').select(EXISTING_SELECT).eq('semester_id', semesterId).in('student_id', slice)
      if (error) throw error
      return data || []
    },
    { concurrency: 4, onProgress }
  )
  return pages.flat()
}

/**
 * Passed prerequisite subjects per student: Map(studentId -> Map(subjectId -> points)).
 * Only the prerequisite subjects are read, and only when there are any.
 */
export async function fetchPassedByStudent(supabase, studentIds, prerequisiteSubjectIds, onProgress) {
  const result = new Map(studentIds.map((id) => [id, new Map()]))
  if (prerequisiteSubjectIds.length === 0) return result
  const pages = await inChunks(
    studentIds,
    5,
    async (slice) => {
      const { data, error } = await supabase
        .from('enrollments')
        .select('student_id, status, grade_points, classes!inner ( subject_id ), grade_components ( gpa_points, status )')
        .in('student_id', slice)
        .in('classes.subject_id', prerequisiteSubjectIds)
      if (error) throw error
      return data || []
    },
    { concurrency: 4, onProgress }
  )
  for (const row of pages.flat()) {
    const component = Array.isArray(row.grade_components) ? row.grade_components[0] : row.grade_components
    const isFinal = component && ['final', 'approved'].includes(String(component.status || '').toLowerCase()) && component.gpa_points != null
    const points = isFinal ? Number(component.gpa_points) : row.grade_points != null ? Number(row.grade_points) : null
    if (points == null || points <= 0) continue
    const subjectId = row.classes?.subject_id
    const passed = result.get(row.student_id)
    if (!passed || !subjectId) continue
    if (!passed.has(subjectId) || passed.get(subjectId) < points) passed.set(subjectId, points)
  }
  return result
}

/**
 * Decide every student x class pair.
 *
 * @param students   the chosen students, in the order seats are handed out
 * @param classes    the chosen classes (with subjects, class_schedules, capacity, enrolled)
 * @param existing   rows from fetchSemesterEnrollments()
 * @param prerequisites   Map(subjectId -> [{ subjectId, minPoints }]) or null when unknown
 * @param passedByStudent Map(studentId -> Map(subjectId -> points)) or null when unknown
 * @param maxHours   the most credit hours one student may hold in the semester
 *
 * Each item: { cls, action: 'add' | 'reactivate' | 'skip' | 'blocked', reason, detail, enrollmentId }
 * reason is one of: already | otherSection | full | prerequisite | clash | overMax
 */
export function planBulkRegistration({ students, classes, existing, prerequisites = null, passedByStudent = null, maxHours = 0 }) {
  const byStudent = new Map()
  for (const row of existing || []) {
    if (!byStudent.has(row.student_id)) byStudent.set(row.student_id, [])
    byStudent.get(row.student_id).push(row)
  }

  const seatsLeft = new Map(classes.map((cls) => [cls.id, Math.max(0, (cls.capacity || 0) - (cls.enrolled || 0))]))
  const totals = { add: 0, reactivate: 0, skip: 0, blocked: 0, studentsChanged: 0, studentsBlocked: 0 }
  const reasons = {}

  const rows = students.map((student) => {
    const mine = byStudent.get(student.id) || []
    const current = mine.filter((row) => row.status === 'enrolled' && row.classes).map((row) => row.classes)
    const holding = [...current]
    const hoursBefore = current.reduce((sum, cls) => sum + creditsOf(cls), 0)
    let hours = hoursBefore

    const items = classes.map((cls) => {
      const stop = (action, reason, detail = '') => {
        totals[action] += 1
        reasons[reason] = (reasons[reason] || 0) + 1
        return { cls, action, reason, detail, enrollmentId: null }
      }

      const sameClass = mine.find((row) => row.class_id === cls.id)
      if (sameClass && sameClass.status === 'enrolled') return stop('skip', 'already')
      if (sameClass && !INACTIVE.has(sameClass.status)) return stop('skip', 'already', sameClass.status)
      if (holding.some((held) => held.subject_id && held.subject_id === cls.subject_id)) return stop('skip', 'otherSection')
      if ((seatsLeft.get(cls.id) || 0) <= 0) return stop('blocked', 'full')

      const passed = passedByStudent ? passedByStudent.get(student.id) || new Map() : null
      const unmet = unmetPrerequisites(cls.subject_id, prerequisites, passed)
      if (unmet.length > 0) return stop('blocked', 'prerequisite', unmet.map((need) => need.subjectId))

      const clash = holding.find((held) => hasTimeConflict(cls, held))
      if (clash) return stop('blocked', 'clash', clash.subjects?.code || clash.code || '')

      if (maxHours > 0 && hours + creditsOf(cls) > maxHours) return stop('blocked', 'overMax')

      seatsLeft.set(cls.id, seatsLeft.get(cls.id) - 1)
      holding.push(cls)
      hours += creditsOf(cls)
      const action = sameClass ? 'reactivate' : 'add'
      totals[action] += 1
      return { cls, action, reason: '', detail: '', enrollmentId: sameClass ? sameClass.id : null }
    })

    const changed = items.some((item) => item.action === 'add' || item.action === 'reactivate')
    const blocked = items.some((item) => item.action === 'blocked')
    if (changed) totals.studentsChanged += 1
    if (blocked) totals.studentsBlocked += 1
    return { student, items, hoursBefore, hoursAfter: hours, changed, blocked }
  })

  return { rows, totals, reasons, seatsLeft }
}

/** Pairs of chosen classes nobody could hold together: same subject, or overlapping times. */
export function selectionWarnings(classes) {
  const sameSubject = []
  const overlapping = []
  for (let i = 0; i < classes.length; i += 1) {
    for (let j = i + 1; j < classes.length; j += 1) {
      const a = classes[i]
      const b = classes[j]
      if (a.subject_id && a.subject_id === b.subject_id) sameSubject.push([a, b])
      else if (hasTimeConflict(a, b)) overlapping.push([a, b])
    }
  }
  return { sameSubject, overlapping }
}

/**
 * Write the plan. New registrations go in batches of 40; a batch that fails is retried
 * one row at a time so one bad row cannot sink the other thirty-nine.
 * Seat counters are then set from the real number of registered students.
 */
export async function applyBulkRegistration(supabase, { semesterId, plan, onProgress }) {
  const inserts = []
  const reactivations = []
  for (const row of plan.rows) {
    for (const item of row.items) {
      if (item.action === 'add') inserts.push({ student: row.student, cls: item.cls })
      if (item.action === 'reactivate') reactivations.push({ student: row.student, cls: item.cls, id: item.enrollmentId })
    }
  }

  const now = new Date().toISOString()
  const toRow = ({ student, cls }) => ({
    student_id: student.id,
    class_id: cls.id,
    semester_id: semesterId,
    status: 'enrolled',
    enrollment_date: now,
  })

  const total = inserts.length + reactivations.length
  let written = 0
  const failed = []
  const succeeded = []
  const tick = (count) => {
    written += count
    onProgress?.(written, total)
  }

  await inChunks(
    inserts,
    40,
    async (slice) => {
      const { error } = await supabase.from('enrollments').insert(slice.map(toRow))
      if (!error) {
        succeeded.push(...slice)
        tick(slice.length)
        return
      }
      for (const one of slice) {
        const { error: rowError } = await supabase.from('enrollments').insert(toRow(one))
        if (rowError) failed.push({ ...one, message: rowError.message || String(rowError.code || '') })
        else succeeded.push(one)
        tick(1)
      }
    },
    { concurrency: 1 }
  )

  await inChunks(
    reactivations,
    40,
    async (slice) => {
      const { error } = await supabase
        .from('enrollments')
        .update({ status: 'enrolled', enrollment_date: now })
        .in(
          'id',
          slice.map((one) => one.id)
        )
      if (error) slice.forEach((one) => failed.push({ ...one, message: error.message || String(error.code || '') }))
      else succeeded.push(...slice)
      tick(slice.length)
    },
    { concurrency: 1 }
  )

  // Seat counters: count the registered students of each class we touched and store that number.
  const perClass = new Map()
  for (const one of succeeded) perClass.set(one.cls.id, (perClass.get(one.cls.id) || 0) + 1)
  const counterProblems = []
  for (const [classId, added] of perClass) {
    const { count, error: countError } = await supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('class_id', classId).eq('status', 'enrolled')
    let value = count
    if (countError || count == null) {
      const { data } = await supabase.from('classes').select('enrolled').eq('id', classId).limit(1)
      value = (data?.[0]?.enrolled || 0) + added
    }
    const { error: updateError } = await supabase.from('classes').update({ enrolled: value }).eq('id', classId)
    if (updateError) counterProblems.push(classId)
  }

  return { added: succeeded.length, failed, counterProblems, total }
}
