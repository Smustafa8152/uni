/**
 * Course Learning Outcomes (CLO) alignment: lectures (lessons), assessments, achievement.
 */

function gradedPercent(pointsEarned, totalPoints) {
  const earned = Number(pointsEarned)
  const total = Number(totalPoints)
  if (!Number.isFinite(earned) || !Number.isFinite(total) || total <= 0) return null
  return Math.round((earned / total) * 100)
}

function avg(nums) {
  const valid = nums.filter((n) => n != null && Number.isFinite(n))
  if (!valid.length) return null
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length)
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ classId: number, subjectId: number }} params
 */
export async function fetchClassCloAlignment(supabase, { classId, subjectId }) {
  if (!classId || !subjectId) {
    return { clos: [], lessons: [], exams: [], rows: [] }
  }

  const [
    { data: clos, error: closErr },
    { data: lessons, error: lessonsErr },
    { data: exams, error: examsErr },
  ] = await Promise.all([
    supabase
      .from('subject_learning_outcomes')
      .select('id, code, description, bloom_level, difficulty_level, display_order')
      .eq('subject_id', subjectId)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('id', { ascending: true }),
    supabase
      .from('class_lessons')
      .select('id, title, unit_number, lesson_number, class_lesson_clos(clo_id)')
      .eq('class_id', classId)
      .order('unit_number', { ascending: true })
      .order('lesson_number', { ascending: true }),
    supabase
      .from('subject_exams')
      .select('id, title, total_points, status, subject_exam_clos(clo_id)')
      .eq('class_id', classId)
      .order('created_at', { ascending: true }),
  ])

  if (closErr) throw closErr
  if (lessonsErr) throw lessonsErr
  if (examsErr) throw examsErr

  const examList = exams || []
  const examIds = examList.map((e) => e.id).filter(Boolean)

  let submissions = []
  if (examIds.length) {
    const { data: subData, error: subErr } = await supabase
      .from('exam_submissions')
      .select('exam_id, points_earned, status')
      .in('exam_id', examIds)
    if (subErr) throw subErr
    submissions = subData || []
  }

  const rows = buildCloAlignmentRows(clos || [], lessons || [], examList, submissions)

  return {
    clos: clos || [],
    lessons: lessons || [],
    exams: examList,
    rows,
  }
}

/**
 * @param {Array} clos
 * @param {Array} lessons
 * @param {Array} exams
 * @param {Array} submissions
 */
export function buildCloAlignmentRows(clos, lessons, exams, submissions) {
  const totalLessons = lessons.length
  const submissionsByExam = new Map()
  for (const sub of submissions || []) {
    if (!submissionsByExam.has(sub.exam_id)) submissionsByExam.set(sub.exam_id, [])
    submissionsByExam.get(sub.exam_id).push(sub)
  }

  return clos.map((clo) => {
    const linkedLessons = lessons.filter((lesson) =>
      (lesson.class_lesson_clos || []).some((m) => m.clo_id === clo.id),
    )
    const linkedExams = exams.filter((exam) =>
      (exam.subject_exam_clos || []).some((m) => m.clo_id === clo.id),
    )

    const lessonCoveragePct = totalLessons
      ? Math.round((linkedLessons.length / totalLessons) * 100)
      : linkedLessons.length > 0
        ? 100
        : 0

    const achievementScores = []
    for (const exam of linkedExams) {
      const subs = submissionsByExam.get(exam.id) || []
      const graded = subs.filter(
        (s) => s.points_earned != null && s.status !== 'EX_DRF' && s.status !== 'in_progress',
      )
      for (const s of graded) {
        const pct = gradedPercent(s.points_earned, exam.total_points)
        if (pct != null) achievementScores.push(pct)
      }
    }

    const achievementPct = avg(achievementScores)
    const hasLectures = linkedLessons.length > 0
    const hasAssessments = linkedExams.length > 0
    const isAligned = hasLectures && hasAssessments
    const isAssessed = achievementPct != null

    let gap = null
    if (!hasLectures && !hasAssessments) gap = 'none'
    else if (!hasLectures) gap = 'no_lectures'
    else if (!hasAssessments) gap = 'no_assessments'
    else if (!isAssessed) gap = 'not_graded'

    return {
      ...clo,
      linkedLessons,
      linkedExams,
      lessonsLinked: linkedLessons.length,
      assessmentsLinked: linkedExams.length,
      lessonCoveragePct,
      achievementPct,
      hasLectures,
      hasAssessments,
      isAligned,
      isAssessed,
      gap,
    }
  })
}

/**
 * Unit × CLO matrix for lectures.
 */
export function buildLessonCloMatrix(lessons, clos) {
  const grouped = {}
  for (const lesson of lessons) {
    if (!grouped[lesson.unit_number]) grouped[lesson.unit_number] = []
    grouped[lesson.unit_number].push(lesson)
  }

  return Object.keys(grouped)
    .map((unitKey) => {
      const unit = Number(unitKey)
      const unitLessons = grouped[unit]
      const cloMap = {}
      for (const clo of clos) {
        cloMap[clo.id] = unitLessons.some((lesson) =>
          (lesson.class_lesson_clos || []).some((m) => m.clo_id === clo.id),
        )
      }
      return { unit, cloMap }
    })
    .sort((a, b) => a.unit - b.unit)
}

/**
 * Assessment × CLO row for mapping matrix.
 */
export function buildAssessmentCloMap(exams, clos) {
  const cloMap = {}
  for (const clo of clos) {
    cloMap[clo.id] = exams.some((exam) =>
      (exam.subject_exam_clos || []).some((m) => m.clo_id === clo.id),
    )
  }
  return cloMap
}
