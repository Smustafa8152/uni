import { supabase } from '../lib/supabase'
import {
  GRADE_COMPONENT_DB_COLUMNS,
  numericGradeToGpaPoints,
} from './getCollegeSettings'
import {
  calculateNumericGradeFromConfig,
  getLetterFromPercent,
  LEGACY_GRADE_COLUMNS,
} from './instructorGradeSheet'
import { deriveRecordStatus } from './gradeAssessmentGroups'
import { autoGradeExam } from './autoGradeExam'

/** Map subject_exams.exam_type → grade_components column */
export function examTypeToGradeColumn(examType) {
  const t = String(examType || '').toLowerCase().trim()
  if (t === 'midterm') return 'midterm'
  if (t === 'final') return 'final'
  if (t === 'short_quiz' || t === 'practice_quiz' || t === 'quiz' || t === 'quizzes') return 'quizzes'
  if (t === 'assignment' || t === 'assignments') return 'assignments'
  if (t === 'oral' || t === 'participation' || t === 'class_participation') return 'class_participation'
  if (t === 'project') return 'project'
  if (t === 'lab') return 'lab'
  return 'other'
}

/** Score as 0–100 for a gradebook cell. Prefer points/total so a re-exam cannot keep a stale `grade` %. */
export function examSubmissionScoreOutOf100(submission, exam) {
  const earned = Number(submission?.points_earned)
  const total = Number(exam?.total_points || submission?.submission_data?.autoGrade?.total_points || 0)
  if (!Number.isNaN(earned) && total > 0) {
    return Math.min(100, Math.max(0, Math.round((earned / total) * 1000) / 10))
  }
  const auto = submission?.submission_data?.autoGrade
  if (auto?.points_earned != null && Number(auto.total_points) > 0) {
    return Math.min(
      100,
      Math.max(0, Math.round((Number(auto.points_earned) / Number(auto.total_points)) * 1000) / 10),
    )
  }
  if (auto?.percent != null && auto.percent !== '') {
    const p = Number(auto.percent)
    if (!Number.isNaN(p)) return Math.min(100, Math.max(0, Math.round(p * 10) / 10))
  }
  if (submission?.grade != null && submission.grade !== '') {
    const g = Number(submission.grade)
    if (!Number.isNaN(g)) return Math.min(100, Math.max(0, Math.round(g * 10) / 10))
  }
  return null
}

export function isExamSubmissionGradable(submission) {
  if (!submission) return false
  const data = submission.submission_data
  // Pending instructor re-exam: current row is empty until they submit again.
  if (submission.status === 'EX_DRF' && data?.instructor_retake) return false
  if (submission.status === 'EX_SUB' || submission.status === 'EX_GRD') return true
  // Stuck drafts: finished attempt never flipped off EX_DRF (missing submitted/autoGrade flags)
  if (
    submission.status === 'EX_DRF' &&
    (submission.points_earned != null ||
      (submission.grade != null && submission.grade !== '') ||
      submission.submitted_at)
  ) {
    return true
  }
  return !!(data && (data.submitted === true || data.autoGrade))
}

/**
 * Finalize stuck drafts that have answers/scores but never flipped off EX_DRF (old RLS bug).
 * Returns updated submission rows.
 */
async function recoverDraftExamSubmissions(subs, examById) {
  const stuck = (subs || []).filter(
    (s) => s.status === 'EX_DRF' && !s.submission_data?.instructor_retake,
  )
  if (!stuck.length) return subs || []

  // Already scored but never marked submitted/graded
  const scoredStuck = stuck.filter(
    (s) =>
      s.points_earned != null ||
      (s.grade != null && s.grade !== '') ||
      s.submitted_at ||
      s.submission_data?.submitted === true ||
      s.submission_data?.autoGrade,
  )
  const unscoredWithAnswers = stuck.filter(
    (s) =>
      !scoredStuck.some((x) => x.id === s.id) &&
      s.submission_data?.answers &&
      Object.keys(s.submission_data.answers).length > 0,
  )

  const recovered = []
  const nowIso = new Date().toISOString()

  for (const sub of scoredStuck) {
    const hasAuto = !!sub.submission_data?.autoGrade
    const preferredStatus = hasAuto && sub.submission_data.autoGrade.fullyAutoGraded !== false ? 'EX_GRD' : 'EX_SUB'
    const nextData = {
      ...(sub.submission_data || {}),
      submitted: true,
    }
    const patch = {
      submission_data: nextData,
      status: preferredStatus,
      submitted_at: sub.submitted_at || nowIso,
      updated_at: nowIso,
    }
    let { error } = await supabase.from('exam_submissions').update(patch).eq('id', sub.id)
    if (error && preferredStatus === 'EX_GRD') {
      patch.status = 'EX_SUB'
      ;({ error } = await supabase.from('exam_submissions').update(patch).eq('id', sub.id))
    }
    if (!error) recovered.push({ ...sub, ...patch })
  }

  if (unscoredWithAnswers.length) {
    const examIds = [...new Set(unscoredWithAnswers.map((d) => d.exam_id))]
    const { data: questions } = await supabase
      .from('subject_exam_questions')
      .select('id, subject_exam_id, question_type, options, correct_answers, marks')
      .in('subject_exam_id', examIds)

    const qsByExam = {}
    ;(questions || []).forEach((q) => {
      if (!qsByExam[q.subject_exam_id]) qsByExam[q.subject_exam_id] = []
      qsByExam[q.subject_exam_id].push(q)
    })

    for (const sub of unscoredWithAnswers) {
      const qs = qsByExam[sub.exam_id] || []
      if (!qs.length) continue
      const exam = examById[sub.exam_id]
      const grade = autoGradeExam(qs, sub.submission_data.answers || {})
      const nextData = {
        ...(sub.submission_data || {}),
        submitted: true,
        autoGrade: grade,
      }
      const preferredStatus = grade.fullyAutoGraded ? 'EX_GRD' : 'EX_SUB'
      const scorePct = exam?.total_points
        ? Math.round((grade.points_earned / Number(exam.total_points)) * 1000) / 10
        : grade.percent
      const patch = {
        submission_data: nextData,
        status: preferredStatus,
        points_earned: grade.points_earned,
        grade: scorePct,
        submitted_at: sub.submitted_at || nowIso,
        updated_at: nowIso,
      }
      let { error } = await supabase.from('exam_submissions').update(patch).eq('id', sub.id)
      if (error && preferredStatus === 'EX_GRD') {
        patch.status = 'EX_SUB'
        ;({ error } = await supabase.from('exam_submissions').update(patch).eq('id', sub.id))
      }
      if (!error) recovered.push({ ...sub, ...patch })
    }
  }

  if (!recovered.length) return subs || []
  const recoveredIds = new Set(recovered.map((r) => r.id))
  return [...(subs || []).filter((s) => !recoveredIds.has(s.id)), ...recovered]
}

/**
 * Recover EX_SUB submissions that were marked submitted but missing autoGrade/points/grade.
 * This happens in re-exam cases where the student answers exist, but the submission_data->autoGrade
 * was never persisted (so instructor views show Submitted + no score).
 */
async function recoverMissingAutoGradeExamSubmissions(subs, examById) {
  const needs = (subs || []).filter((s) => {
    if (!s) return false
    const hasAnswers = !!(s.submission_data?.answers && Object.keys(s.submission_data.answers).length > 0)
    const hasPayloadAuto = s.submission_data?.autoGrade != null
    const noScore =
      s.points_earned == null &&
      (s.grade == null || s.grade === '') &&
      !hasPayloadAuto
    return (s.status === 'EX_SUB' || s.status === 'EX_GRD') && noScore && hasAnswers
  })

  if (!needs.length) return subs || []

  const examIds = [...new Set(needs.map((d) => d.exam_id).filter(Boolean))]
  const nowIso = new Date().toISOString()

  const { data: questions } = await supabase
    .from('subject_exam_questions')
    .select(
      'id, subject_exam_id, question_type, options, correct_answers, marks',
    )
    .in('subject_exam_id', examIds)

  const qsByExam = {}
  ;(questions || []).forEach((q) => {
    if (!qsByExam[q.subject_exam_id]) qsByExam[q.subject_exam_id] = []
    qsByExam[q.subject_exam_id].push(q)
  })

  const recovered = []

  for (const sub of needs) {
    const qs = qsByExam[sub.exam_id] || []
    if (!qs.length) continue
    const exam = examById[sub.exam_id]
    if (!exam) continue

    const answers = sub.submission_data?.answers || {}
    const grade = autoGradeExam(qs, answers)

    const preferredStatus = grade.fullyAutoGraded ? 'EX_GRD' : 'EX_SUB'

    const totalPoints = Number(exam.total_points || grade.total_points || 0)
    const scorePct =
      totalPoints > 0
        ? Math.round((Number(grade.points_earned) / totalPoints) * 1000) / 10
        : grade.percent

    const patch = {
      submission_data: {
        ...(sub.submission_data || {}),
        submitted: true,
        autoGrade: grade,
      },
      status: preferredStatus,
      points_earned: grade.points_earned,
      grade: scorePct,
      submitted_at: sub.submitted_at || nowIso,
      updated_at: nowIso,
    }

    let { error } = await supabase.from('exam_submissions').update(patch).eq('id', sub.id)
    if (error && preferredStatus === 'EX_GRD') {
      patch.status = 'EX_SUB'
      ;({ error } = await supabase.from('exam_submissions').update(patch).eq('id', sub.id))
    }
    if (!error) recovered.push({ ...sub, ...patch })
  }

  return [...(subs || []), ...(recovered || [])]
}

function scKey(studentId, classId) {
  return `${Number(studentId)}::${Number(classId)}`
}

function subjKey(studentId, subjectId) {
  return `${Number(studentId)}::subj::${Number(subjectId)}`
}

/** Latest completed attempt: current row if graded, otherwise archived re-exam history. */
function latestCompletedExamScore(sub, exam) {
  let bestScore = null
  let bestAt = 0

  const consider = (submissionLike, atRaw) => {
    const score = examSubmissionScoreOutOf100(submissionLike, exam)
    if (score == null) return
    const at = atRaw ? new Date(atRaw).getTime() : 0
    if (bestScore == null || at >= bestAt) {
      bestScore = score
      bestAt = at
    }
  }

  if (isExamSubmissionGradable(sub)) {
    consider(sub, sub.submitted_at)
  }

  const prev = sub?.submission_data?.previous_attempts
  if (Array.isArray(prev)) {
    for (const attempt of prev) {
      consider(
        {
          points_earned: attempt.points_earned,
          grade: attempt.grade,
          submitted_at: attempt.submitted_at,
          submission_data: {
            autoGrade: attempt.autoGrade,
            answers: attempt.answers,
          },
        },
        attempt.submitted_at,
      )
    }
  }

  if (bestScore == null) return null
  return { score: bestScore, at: bestAt }
}

function collectLatestExamScores(subs, examById) {
  const byEnrollment = {}
  const byStudentClass = {}
  const byStudentSubject = {}
  const latestAt = {}
  const latestAtSC = {}
  const latestAtSubj = {}
  const latestOverall = {}
  const latestOverallSC = {}
  const latestOverallSubj = {}

  const put = (bucket, atBucket, overallBucket, key, col, score, at) => {
    if (key == null || key === '' || String(key).includes('NaN')) return
    if (!bucket[key]) bucket[key] = {}
    if (!atBucket[key]) atBucket[key] = {}
    if (atBucket[key][col] == null || at >= atBucket[key][col]) {
      bucket[key][col] = score
      atBucket[key][col] = at
    }
    if (!overallBucket[key] || at >= overallBucket[key].at) {
      overallBucket[key] = { score, at }
    }
  }

  for (const sub of subs || []) {
    const exam = examById[sub.exam_id]
    if (!exam) continue
    const col = examTypeToGradeColumn(exam.exam_type)
    if (!GRADE_COMPONENT_DB_COLUMNS.includes(col)) continue
    const latest = latestCompletedExamScore(sub, exam)
    if (!latest) continue
    const { score, at } = latest

    const enrId = sub.enrollment_id != null && sub.enrollment_id !== ''
      ? Number(sub.enrollment_id)
      : null
    if (Number.isFinite(enrId)) {
      put(byEnrollment, latestAt, latestOverall, enrId, col, score, at)
    }
    if (sub.student_id && exam.class_id) {
      put(byStudentClass, latestAtSC, latestOverallSC, scKey(sub.student_id, exam.class_id), col, score, at)
    }
    if (sub.student_id && exam.subject_id) {
      put(
        byStudentSubject,
        latestAtSubj,
        latestOverallSubj,
        subjKey(sub.student_id, exam.subject_id),
        col,
        score,
        at,
      )
    }
  }
  return {
    byEnrollment,
    byStudentClass,
    byStudentSubject,
    latestAt,
    latestAtSC,
    latestAtSubj,
    latestOverall,
    latestOverallSC,
    latestOverallSubj,
  }
}

const LEGACY_FIELDS = new Set(LEGACY_GRADE_COLUMNS.map((c) => c.field))

/**
 * Replace exam cells with latest attempt scores and recompute overall numeric/letter/GPA.
 * Stored grade_components.numeric_grade often lags behind a re-exam.
 */
export function overlayExamScoresOnGradeComponent(gcRaw, examScores, gradingScale) {
  if (!examScores || !Object.keys(examScores).length) return gcRaw
  const patched = { ...(gcRaw || {}) }
  const examPercents = []
  Object.entries(examScores).forEach(([col, score]) => {
    patched[col] = score
    const n = Number(score)
    if (!Number.isNaN(n)) examPercents.push(n)
  })

  let numeric = calculateNumericGradeFromConfig(patched, LEGACY_GRADE_COLUMNS)
  const examOnLegacy = Object.keys(examScores).some((col) => LEGACY_FIELDS.has(col))
  // Exam types that map to other/project/lab are ignored by the default 5-column weights,
  // so the stored first-attempt percent would otherwise stay as the course score.
  if (!examOnLegacy && examPercents.length) {
    numeric =
      examPercents.length === 1
        ? examPercents[0]
        : examPercents.reduce((a, b) => a + b, 0) / examPercents.length
  }

  if (numeric != null) {
    patched.numeric_grade = Math.round(numeric * 100) / 100
    patched.letter_grade = getLetterFromPercent(patched.numeric_grade, gradingScale)
    patched.gpa_points = numericGradeToGpaPoints(patched.numeric_grade, gradingScale)
  }
  return patched
}

export function examScoresForEnrollment(examData, enrollment) {
  const byEnrollment = examData?.byEnrollment || {}
  const byStudentClass = examData?.byStudentClass || {}
  const byStudentSubject = examData?.byStudentSubject || {}
  const latestAt = examData?.latestAt || {}
  const latestAtSC = examData?.latestAtSC || {}
  const latestAtSubj = examData?.latestAtSubj || {}
  const latestOverall = examData?.latestOverall || {}
  const latestOverallSC = examData?.latestOverallSC || {}
  const latestOverallSubj = examData?.latestOverallSubj || {}

  const id = enrollment?.id
  const numId = Number(id)
  const sc = enrollment?.student_id != null && enrollment?.class_id != null
    ? scKey(enrollment.student_id, enrollment.class_id)
    : null
  const subjectId = enrollment?.subject_id ?? enrollment?.classes?.subject_id
  const sk =
    enrollment?.student_id != null && subjectId != null
      ? subjKey(enrollment.student_id, subjectId)
      : null

  const peakAt = (atMap, overall) => {
    const times = Object.values(atMap || {}).map(Number).filter((n) => Number.isFinite(n))
    const fromMap = times.length ? Math.max(...times) : 0
    return Math.max(fromMap, Number(overall?.at) || 0)
  }

  const candidates = []
  const push = (scores, overall, atMap) => {
    if ((!scores || !Object.keys(scores).length) && overall == null) return
    candidates.push({
      scores: scores || {},
      overall: overall || null,
      at: peakAt(atMap, overall),
    })
  }

  if (Number.isFinite(numId)) {
    push(
      byEnrollment[numId] || byEnrollment[id] || byEnrollment[String(id)],
      latestOverall[numId] || latestOverall[id] || latestOverall[String(id)],
      latestAt[numId] || latestAt[id] || latestAt[String(id)],
    )
  }
  if (sc) push(byStudentClass[sc], latestOverallSC[sc], latestAtSC[sc])
  if (sk) push(byStudentSubject[sk], latestOverallSubj[sk], latestAtSubj[sk])

  if (!candidates.length) {
    return { scores: {}, examAt: 0, latestPercent: null }
  }
  candidates.sort((a, b) => (b.at || 0) - (a.at || 0))
  const best = candidates[0]
  const latestPercent = best.overall?.score != null ? Number(best.overall.score) : null
  return { scores: best.scores, examAt: best.at || 0, latestPercent }
}

async function resolveMissingEnrollmentIds(subs, examById) {
  const missing = (subs || []).filter(
    (s) => (s.enrollment_id == null || s.enrollment_id === '') && s.student_id && examById[s.exam_id]?.class_id,
  )
  if (!missing.length) return subs || []

  const studentIds = [...new Set(missing.map((s) => s.student_id))]
  const classIds = [...new Set(missing.map((s) => examById[s.exam_id].class_id))]
  const enrs = []
  for (let i = 0; i < studentIds.length; i += 80) {
    const chunk = studentIds.slice(i, i + 80)
    const { data, error } = await supabase
      .from('enrollments')
      .select('id, student_id, class_id')
      .in('student_id', chunk)
      .in('class_id', classIds)
      .eq('status', 'enrolled')
    if (error) throw error
    enrs.push(...(data || []))
  }
  const map = {}
  enrs.forEach((e) => {
    map[`${e.student_id}::${e.class_id}`] = e.id
  })
  return (subs || []).map((s) => {
    if (s.enrollment_id != null && s.enrollment_id !== '') return s
    const cid = examById[s.exam_id]?.class_id
    const enrId = map[`${s.student_id}::${cid}`]
    return enrId ? { ...s, enrollment_id: enrId } : s
  })
}

/**
 * Fetch submitted exam attempts for classes and build enrollmentId → { column: score } map.
 * Latest attempt (by submitted_at) wins — including after a re-exam.
 */
export async function fetchExamScoresByClassIds(classIds, extra = {}) {
  const ids = [...new Set((classIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)))]
  const subjectIds = [...new Set((extra.subjectIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)))]
  if (!ids.length && !subjectIds.length) return { byEnrollment: {}, exams: [] }

  const exams = []
  const seenExam = new Set()
  const addExams = (rows) => {
    for (const row of rows || []) {
      if (row?.id == null || seenExam.has(row.id)) continue
      seenExam.add(row.id)
      exams.push(row)
    }
  }

  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80)
    const { data, error } = await supabase
      .from('subject_exams')
      .select('id, class_id, subject_id, exam_type, total_points, title')
      .in('class_id', chunk)
    if (error) throw error
    addExams(data)
  }
  for (let i = 0; i < subjectIds.length; i += 80) {
    const chunk = subjectIds.slice(i, i + 80)
    const { data, error } = await supabase
      .from('subject_exams')
      .select('id, class_id, subject_id, exam_type, total_points, title')
      .in('subject_id', chunk)
    if (error) throw error
    addExams(data)
  }
  if (!exams.length) return { byEnrollment: {}, exams: [] }

  const examIds = exams.map((e) => e.id)
  const examById = Object.fromEntries(exams.map((e) => [e.id, e]))

  const subsRaw = []
  for (let i = 0; i < examIds.length; i += 80) {
    const chunk = examIds.slice(i, i + 80)
    const { data, error } = await supabase
      .from('exam_submissions')
      .select('id, exam_id, student_id, enrollment_id, status, points_earned, grade, submission_data, submitted_at')
      .in('exam_id', chunk)
    if (error) throw error
    subsRaw.push(...(data || []))
  }

  let recovered = subsRaw
  try {
    recovered = await recoverDraftExamSubmissions(subsRaw, examById)
    recovered = await recoverMissingAutoGradeExamSubmissions(recovered, examById)
  } catch (err) {
    console.warn('recoverDraftExamSubmissions', err)
  }
  const subs = await resolveMissingEnrollmentIds(recovered, examById)
  const collected = collectLatestExamScores(subs, examById)
  return { ...collected, exams }
}

/**
 * Fetch submitted exam attempts for a class and build enrollmentId → { column: score } map.
 * When multiple exams map to the same column, keep the latest submission (by submitted_at).
 */
export async function fetchExamScoresByEnrollment(classId) {
  return fetchExamScoresByClassIds(classId ? [classId] : [])
}

/**
 * Merge online-exam scores into gradebook draft rows (replace cells with latest exam score).
 * Returns { nextDrafts, dirtyEnrollmentIds }.
 */
export function mergeExamScoresIntoDrafts(draftGrades, examScoresByEnrollment, gradeConfig = []) {
  const next = { ...draftGrades }
  const dirty = []
  Object.entries(examScoresByEnrollment || {}).forEach(([enrollmentIdRaw, scores]) => {
    const enrollmentId = Number(enrollmentIdRaw)
    const row = next[enrollmentId]
    if (!row || !scores) return
    let changed = false
    const updated = { ...row }
    Object.entries(scores).forEach(([col, score]) => {
      const current = updated[col]
      if (current == null || current === '' || Number(current) !== Number(score)) {
        updated[col] = score
        changed = true
      }
    })
    if (changed) {
      const numeric = calculateNumericGradeFromConfig(updated, gradeConfig)
      if (numeric != null) {
        updated.numeric_grade = Math.round(numeric * 100) / 100
        updated.letter_grade = getLetterFromPercent(updated.numeric_grade, null)
        updated.gpa_points = numericGradeToGpaPoints(updated.numeric_grade, null)
      }
      updated.record_status = deriveRecordStatus(updated, gradeConfig)
      next[enrollmentId] = updated
      dirty.push(enrollmentId)
    }
  })
  return { nextDrafts: next, dirtyEnrollmentIds: dirty }
}

/**
 * Persist merged exam scores into grade_components for a class (instructor session).
 */
export async function persistExamScoresToGradebook({
  classId,
  classData,
  enrollments,
  draftGrades,
  dirtyEnrollmentIds,
  gradeConfig,
  instructorId,
}) {
  if (!dirtyEnrollmentIds?.length) return { saved: 0 }
  let saved = 0
  for (const enrollmentId of dirtyEnrollmentIds) {
    const enrollment = enrollments.find((e) => e.id === enrollmentId)
    const row = draftGrades[enrollmentId]
    if (!enrollment || !row) continue

    const payload = {
      enrollment_id: enrollmentId,
      class_id: classId,
      student_id: enrollment.student_id,
      semester_id: classData?.semester_id,
      college_id: classData?.college_id ?? null,
      status: row.status === 'final' || row.status === 'submitted' ? row.status : 'draft',
      record_status: row.record_status || deriveRecordStatus(row, gradeConfig),
      graded_by: instructorId || null,
      graded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    GRADE_COMPONENT_DB_COLUMNS.forEach((col) => {
      if (row[col] !== undefined) payload[col] = row[col]
    })
    if (row.numeric_grade != null) payload.numeric_grade = row.numeric_grade
    if (row.letter_grade != null) payload.letter_grade = row.letter_grade
    if (row.gpa_points != null) payload.gpa_points = row.gpa_points

    const { error } = await supabase
      .from('grade_components')
      .upsert(payload, { onConflict: 'enrollment_id' })
    if (!error) saved += 1
    else console.error('persistExamScoresToGradebook', error)
  }
  return { saved }
}

/** Best-effort RPC after student submit (no-op if migration not applied). */
export async function syncExamSubmissionToGradebookRpc(submissionId) {
  if (!submissionId) return { ok: false }
  const { error } = await supabase.rpc('sync_exam_submission_to_gradebook', {
    p_submission_id: submissionId,
  })
  if (error) {
    console.warn('sync_exam_submission_to_gradebook', error.message)
    return { ok: false, error }
  }
  return { ok: true }
}

/**
 * Recover stuck EX_DRF rows for one exam and push only those into grade_components.
 * Does not re-sync every already-graded submission (avoids request spam).
 */
export async function recoverAndSyncExamSubmissions(examId, submissions) {
  if (!examId) return { recovered: 0, synced: 0 }
  const { data: exam } = await supabase
    .from('subject_exams')
    .select('id, exam_type, total_points, title')
    .eq('id', examId)
    .maybeSingle()
  if (!exam) return { recovered: 0, synced: 0 }

  const examById = { [exam.id]: exam }
  let list = submissions
  if (!list) {
    const { data } = await supabase
      .from('exam_submissions')
      .select(
        'id, exam_id, student_id, enrollment_id, status, points_earned, grade, submission_data, submitted_at',
      )
      .eq('exam_id', examId)
    list = data || []
  }

  const stuckIds = new Set(
    (list || [])
      .filter(
        (s) =>
          (s.status === 'EX_DRF' &&
            (s.points_earned != null ||
              (s.grade != null && s.grade !== '') ||
              s.submitted_at ||
              s.submission_data?.submitted === true ||
              s.submission_data?.autoGrade ||
              (s.submission_data?.answers && Object.keys(s.submission_data.answers).length > 0))) ||
          ((s.status === 'EX_SUB' || s.status === 'EX_GRD') &&
            s.points_earned == null &&
            (s.grade == null || s.grade === '') &&
            s.submission_data?.autoGrade == null &&
            (s.submission_data?.answers && Object.keys(s.submission_data.answers).length > 0)),
      )
      .map((s) => s.id),
  )

  let updated = await recoverDraftExamSubmissions(list, examById)
  // Also recover EX_SUB rows missing autoGrade so they can become EX_GRD.
  updated = await recoverMissingAutoGradeExamSubmissions(updated, examById)
  let recovered = 0
  let synced = 0
  for (const sub of updated) {
    if (!stuckIds.has(sub.id)) continue
    if (sub.status !== 'EX_DRF') recovered += 1
    if (!isExamSubmissionGradable(sub)) continue
    const res = await syncExamSubmissionToGradebookRpc(sub.id)
    if (res.ok) synced += 1
  }
  return { recovered, synced, submissions: updated }
}
