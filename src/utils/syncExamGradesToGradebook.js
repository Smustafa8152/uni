import { supabase } from '../lib/supabase'
import {
  GRADE_COMPONENT_DB_COLUMNS,
  numericGradeToGpaPoints,
} from './getCollegeSettings'
import {
  calculateNumericGradeFromConfig,
  getLetterFromPercent,
} from './instructorGradeSheet'
import { deriveRecordStatus } from './gradeAssessmentGroups'
import { autoGradeExam } from './autoGradeExam'

/** Map subject_exams.exam_type → grade_components column */
export function examTypeToGradeColumn(examType) {
  const t = String(examType || '').toLowerCase()
  if (t === 'midterm') return 'midterm'
  if (t === 'final') return 'final'
  if (t === 'short_quiz' || t === 'practice_quiz') return 'quizzes'
  if (t === 'assignment') return 'assignments'
  if (t === 'oral') return 'class_participation'
  return 'other'
}

/** Score as 0–100 for a gradebook cell */
export function examSubmissionScoreOutOf100(submission, exam) {
  if (submission?.grade != null && submission.grade !== '') {
    const g = Number(submission.grade)
    if (!Number.isNaN(g)) return Math.min(100, Math.max(0, Math.round(g * 10) / 10))
  }
  const earned = Number(submission?.points_earned)
  const total = Number(exam?.total_points || submission?.submission_data?.autoGrade?.total_points || 0)
  if (!Number.isNaN(earned) && total > 0) {
    return Math.min(100, Math.max(0, Math.round((earned / total) * 1000) / 10))
  }
  const auto = submission?.submission_data?.autoGrade
  if (auto?.percent != null) {
    return Math.min(100, Math.max(0, Math.round(Number(auto.percent) * 10) / 10))
  }
  if (auto?.points_earned != null && auto?.total_points > 0) {
    return Math.min(100, Math.max(0, Math.round((Number(auto.points_earned) / Number(auto.total_points)) * 1000) / 10))
  }
  return null
}

export function isExamSubmissionGradable(submission) {
  if (!submission) return false
  if (submission.status === 'EX_SUB' || submission.status === 'EX_GRD') return true
  const data = submission.submission_data
  return !!(data && (data.submitted === true || data.autoGrade))
}

/**
 * Finalize stuck drafts that have answers but never flipped to EX_SUB (old RLS bug).
 * Grades answers, marks EX_SUB, returns updated submission rows.
 */
async function recoverDraftExamSubmissions(subs, examById) {
  const drafts = (subs || []).filter(
    (s) =>
      s.status === 'EX_DRF' &&
      s.submission_data?.answers &&
      Object.keys(s.submission_data.answers).length > 0 &&
      !isExamSubmissionGradable(s),
  )
  if (!drafts.length) return subs || []

  const examIds = [...new Set(drafts.map((d) => d.exam_id))]
  const { data: questions } = await supabase
    .from('subject_exam_questions')
    .select('id, subject_exam_id, question_type, options, correct_answers, marks')
    .in('subject_exam_id', examIds)

  const qsByExam = {}
  ;(questions || []).forEach((q) => {
    if (!qsByExam[q.subject_exam_id]) qsByExam[q.subject_exam_id] = []
    qsByExam[q.subject_exam_id].push(q)
  })

  const recovered = []
  for (const sub of drafts) {
    const qs = qsByExam[sub.exam_id] || []
    if (!qs.length) continue
    const exam = examById[sub.exam_id]
    const grade = autoGradeExam(qs, sub.submission_data.answers || {})
    const nowIso = new Date().toISOString()
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
    if (!error) {
      recovered.push({ ...sub, ...patch })
    }
  }

  const recoveredIds = new Set(recovered.map((r) => r.id))
  return [...(subs || []).filter((s) => !recoveredIds.has(s.id)), ...recovered]
}

/**
 * Fetch submitted exam attempts for a class and build enrollmentId → { column: score } map.
 * When multiple exams map to the same column, keep the highest score.
 */
export async function fetchExamScoresByEnrollment(classId) {
  const { data: exams, error: exErr } = await supabase
    .from('subject_exams')
    .select('id, class_id, exam_type, total_points, title')
    .eq('class_id', classId)
  if (exErr) throw exErr
  if (!exams?.length) return { byEnrollment: {}, exams: [] }

  const examIds = exams.map((e) => e.id)
  const examById = Object.fromEntries(exams.map((e) => [e.id, e]))

  const { data: subsRaw, error: sErr } = await supabase
    .from('exam_submissions')
    .select('id, exam_id, student_id, enrollment_id, status, points_earned, grade, submission_data, submitted_at')
    .in('exam_id', examIds)
  if (sErr) throw sErr

  const subs = await recoverDraftExamSubmissions(subsRaw || [], examById)

  const byEnrollment = {}
  for (const sub of subs || []) {
    if (!isExamSubmissionGradable(sub)) continue
    const exam = examById[sub.exam_id]
    if (!exam) continue
    const col = examTypeToGradeColumn(exam.exam_type)
    if (!GRADE_COMPONENT_DB_COLUMNS.includes(col)) continue
    const score = examSubmissionScoreOutOf100(sub, exam)
    if (score == null) continue
    const enrId = sub.enrollment_id
    if (!enrId) continue
    if (!byEnrollment[enrId]) byEnrollment[enrId] = {}
    const prev = byEnrollment[enrId][col]
    if (prev == null || score > prev) byEnrollment[enrId][col] = score
  }
  return { byEnrollment, exams }
}

/**
 * Merge online-exam scores into gradebook draft rows (fill empty cells only).
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
      if (current == null || current === '') {
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
