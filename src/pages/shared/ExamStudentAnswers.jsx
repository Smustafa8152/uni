import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'
import { getLocalizedName } from '../../utils/localizedName'
import { gradeQuestion } from '../../utils/autoGradeExam'
import {
  formatStudentAnswer,
  formatCorrectAnswer,
  submissionStatusLabel,
  examLifecycleStatusLabel,
  questionTypeLabel,
} from '../../utils/formatExamAnswer'

/**
 * Neat per-exam student answers review.
 * @param {'instructor'|'admin'} mode
 */
export default function ExamStudentAnswers({ mode = 'instructor' }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { language, isRTL } = useLanguage()
  const isArabic = isRTL || language === 'ar'
  const [searchParams, setSearchParams] = useSearchParams()

  const examIdParam = searchParams.get('examId') ? Number(searchParams.get('examId')) : null
  const submissionIdParam = searchParams.get('submissionId') ? Number(searchParams.get('submissionId')) : null

  const [loading, setLoading] = useState(true)
  const [exams, setExams] = useState([])
  const [selectedExamId, setSelectedExamId] = useState(examIdParam)
  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(submissionIdParam)
  const [detailLoading, setDetailLoading] = useState(false)
  const [reexamBusy, setReexamBusy] = useState(false)
  const [reexamConfirmOpen, setReexamConfirmOpen] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionOk, setActionOk] = useState('')

  const basePath = mode === 'admin' ? '/admin/exam-answers' : '/instructor/exam-answers'
  const homeHref = mode === 'admin' ? '/dashboard' : '/instructor/dashboard'
  const assessmentsHref = mode === 'admin' ? '/examinations' : '/instructor/assessments'

  // Load exam picker list
  useEffect(() => {
    if (!user?.email) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        if (mode === 'instructor') {
          const instructor = await getActiveInstructorByEmail(user.email)
          if (!instructor || cancelled) {
            setExams([])
            return
          }
          const { data: classes } = await supabase
            .from('classes')
            .select('id')
            .eq('instructor_id', instructor.id)
            .eq('status', 'active')
          const classIds = (classes || []).map((c) => c.id)
          if (!classIds.length) {
            setExams([])
            return
          }
          const { data } = await supabase
            .from('subject_exams')
            .select(
              'id, title, exam_type, status, total_points, class_id, created_at, classes(id, section, subjects(code, name_en, name_ar))',
            )
            .in('class_id', classIds)
            .order('created_at', { ascending: false })
          if (!cancelled) setExams(data || [])
        } else {
          const { data } = await supabase
            .from('subject_exams')
            .select(
              'id, title, exam_type, status, total_points, class_id, created_at, classes(id, section, subjects(code, name_en, name_ar))',
            )
            .order('created_at', { ascending: false })
            .limit(200)
          if (!cancelled) setExams(data || [])
        }
      } catch (e) {
        console.error(e)
        if (!cancelled) setExams([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.email, mode])

  // Load selected exam + submissions
  useEffect(() => {
    if (!selectedExamId) {
      setExam(null)
      setQuestions([])
      setSubmissions([])
      setSelectedSubmissionId(null)
      return
    }
    let cancelled = false
    ;(async () => {
      setDetailLoading(true)
      try {
        if (mode === 'instructor') {
          const instructor = await getActiveInstructorByEmail(user.email)
          if (!instructor) return
          const { data: ex } = await supabase
            .from('subject_exams')
            .select(
              'id, title, exam_type, status, total_points, class_id, assessment_settings, classes(id, section, instructor_id, subjects(code, name_en, name_ar))',
            )
            .eq('id', selectedExamId)
            .maybeSingle()
          if (!ex || ex.classes?.instructor_id !== instructor.id) {
            if (!cancelled) {
              setExam(null)
              setQuestions([])
              setSubmissions([])
            }
            return
          }
          if (!cancelled) setExam(ex)
        } else {
          const { data: ex } = await supabase
            .from('subject_exams')
            .select(
              'id, title, exam_type, status, total_points, class_id, assessment_settings, classes(id, section, subjects(code, name_en, name_ar))',
            )
            .eq('id', selectedExamId)
            .maybeSingle()
          if (!cancelled) setExam(ex || null)
          if (!ex) return
        }

        const [{ data: qs }, { data: subs }] = await Promise.all([
          supabase
            .from('subject_exam_questions')
            .select(
              'id, question_order, question_type, question_text, question_text_ar, options, correct_answers, marks',
            )
            .eq('subject_exam_id', selectedExamId)
            .order('question_order', { ascending: true }),
          supabase
            .from('exam_submissions')
            .select(
              'id, student_id, status, started_at, submitted_at, points_earned, grade, submission_data, students(id, student_id, name_en, name_ar)',
            )
            .eq('exam_id', selectedExamId)
            .order('submitted_at', { ascending: false, nullsFirst: false }),
        ])

        if (cancelled) return
        setQuestions(qs || [])
        const list = subs || []
        setSubmissions(list)
        const prefer =
          list.find((s) => s.id === submissionIdParam)?.id ||
          list.find((s) => s.status === 'EX_SUB' || s.status === 'EX_GRD')?.id ||
          list[0]?.id ||
          null
        setSelectedSubmissionId(prefer)
      } catch (e) {
        console.error(e)
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selectedExamId, mode, user?.email, submissionIdParam])

  const selectedSubmission = useMemo(
    () => submissions.find((s) => s.id === selectedSubmissionId) || null,
    [submissions, selectedSubmissionId],
  )

  const selectExam = (id) => {
    const next = id ? Number(id) : null
    setSelectedExamId(next)
    setSelectedSubmissionId(null)
    const params = new URLSearchParams()
    if (next) params.set('examId', String(next))
    setSearchParams(params)
  }

  const selectSubmission = (id) => {
    setSelectedSubmissionId(id)
    setActionError('')
    setActionOk('')
    setReexamConfirmOpen(false)
    const params = new URLSearchParams(searchParams)
    if (selectedExamId) params.set('examId', String(selectedExamId))
    if (id) params.set('submissionId', String(id))
    else params.delete('submissionId')
    setSearchParams(params)
  }

  const reloadSubmissions = async (preferId = null) => {
    if (!selectedExamId) return
    const { data: subs } = await supabase
      .from('exam_submissions')
      .select(
        'id, student_id, status, started_at, submitted_at, points_earned, grade, submission_data, students(id, student_id, name_en, name_ar)',
      )
      .eq('exam_id', selectedExamId)
      .order('submitted_at', { ascending: false, nullsFirst: false })
    const list = subs || []
    setSubmissions(list)
    const nextId =
      (preferId && list.find((s) => s.id === preferId)?.id) ||
      list.find((s) => s.id === selectedSubmissionId)?.id ||
      list[0]?.id ||
      null
    setSelectedSubmissionId(nextId)
  }

  const selectedStudentName =
    (isArabic ? selectedSubmission?.students?.name_ar : selectedSubmission?.students?.name_en) ||
    selectedSubmission?.students?.name_en ||
    selectedSubmission?.students?.student_id ||
    ''

  const reexamPending =
    !!(selectedSubmission?.submission_data?.instructor_retake && selectedSubmission?.status === 'EX_DRF')

  const confirmAllowReexam = async () => {
    if (!selectedSubmission?.id) return
    setReexamBusy(true)
    setActionError('')
    setActionOk('')
    try {
      const { error } = await supabase.rpc('reset_exam_submission_for_retake', {
        p_submission_id: selectedSubmission.id,
      })
      if (error) throw error
      await reloadSubmissions(selectedSubmission.id)
      setReexamConfirmOpen(false)
      setActionOk(
        t(
          'examAnswers.reexamDone',
          'Re-exam allowed. The student can open the exam again and start a new attempt.',
        ),
      )
    } catch (e) {
      console.error(e)
      setActionError(e?.message || String(e))
    } finally {
      setReexamBusy(false)
    }
  }

  useEffect(() => {
    if (!reexamConfirmOpen) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [reexamConfirmOpen])

  const subjectCode = exam?.classes?.subjects?.code || '—'
  const subjectName = getLocalizedName(exam?.classes?.subjects, isArabic) || ''

  const answersMap = selectedSubmission?.submission_data?.answers || {}
  const autoGrade = selectedSubmission?.submission_data?.autoGrade || null
  const manualMarks = selectedSubmission?.submission_data?.manualMarks || {}

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <div
          style={{
            width: 40,
            height: 40,
            border: '3px solid var(--bdr, #dde3ef)',
            borderTopColor: 'var(--p, #1a3a6b)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      </div>
    )
  }

  return (
    <div dir={isArabic ? 'rtl' : 'ltr'}>
      <nav className="bc" style={{ marginBottom: 12 }}>
        <Link to={homeHref}>{t('common.dashboard', 'Dashboard')}</Link>
        <span className="bc-sep">›</span>
        {mode === 'instructor' && (
          <>
            <Link to={assessmentsHref}>{t('instructorPortal.createAssessments', 'Assessments')}</Link>
            <span className="bc-sep">›</span>
          </>
        )}
        <span>{t('examAnswers.breadcrumb', 'Exam answers')}</span>
      </nav>

      <div className="ph" style={{ marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>{t('examAnswers.title', 'Student exam answers')}</h1>
          <p className="ph-sub" style={{ marginTop: 4 }}>
            {mode === 'admin'
              ? t(
                  'examAnswers.subtitleAdmin',
                  'Review student answers for any online exam. You can allow a specific student to re-take the exam.',
                )
              : t(
                  'examAnswers.subtitle',
                  'Review each student’s answers for an online exam — questions, responses, and scores.',
                )}
          </p>
        </div>
        <div className="ph-acts">
          {mode === 'instructor' && selectedExamId && (
            <>
              <Link
                to={`/instructor/monitor-exam?examId=${selectedExamId}&classId=${exam?.class_id || ''}`}
                className="btn btn-gh"
              >
                {t('instructorPortal.monitorExam', 'Monitor')}
              </Link>
              <Link to={`/instructor/grade-exam?examId=${selectedExamId}`} className="btn btn-out">
                {t('instructorPortal.manualGrading', 'Manual grading')}
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="fg" style={{ marginBottom: 0, maxWidth: 560 }}>
          <label className="fl">{t('examAnswers.selectExam', 'Select exam')}</label>
          <select
            className="fc"
            value={selectedExamId || ''}
            onChange={(e) => selectExam(e.target.value)}
          >
            <option value="">— {t('examAnswers.chooseExam', 'Choose an exam')} —</option>
            {exams.map((ex) => {
              const code = ex.classes?.subjects?.code || '—'
              const st = examLifecycleStatusLabel(ex.status, t)
              return (
                <option key={ex.id} value={ex.id}>
                  {code} — {ex.title} ({st})
                </option>
              )
            })}
          </select>
        </div>
        {exams.length === 0 && (
          <p style={{ marginTop: 12, color: 'var(--muted)', fontSize: 13 }}>
            {t('examAnswers.noExams', 'No online exams found.')}
          </p>
        )}
      </div>

      {!selectedExamId && (
        <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--muted)' }}>
          {t('examAnswers.pickExamHint', 'Select an exam above to view student answers.')}
        </div>
      )}

      {selectedExamId && detailLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div
            style={{
              width: 36,
              height: 36,
              border: '3px solid var(--bdr)',
              borderTopColor: 'var(--p)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        </div>
      )}

      {selectedExamId && !detailLoading && exam && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--p)' }}>
              {subjectCode}
              {subjectName ? ` — ${subjectName}` : ''} · {exam.title}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              {t('examAnswers.meta', {
                defaultValue: '{{n}} questions · {{s}} attempts · {{pts}} points',
                n: questions.length,
                s: submissions.length,
                pts: exam.total_points || 0,
              })}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(240px, 300px) 1fr',
              gap: 16,
              alignItems: 'start',
            }}
            className="exam-answers-grid"
          >
            {/* Student list */}
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div
                style={{
                  padding: '12px 14px',
                  borderBottom: '1px solid var(--bdr)',
                  fontWeight: 800,
                  fontSize: 13,
                }}
              >
                {t('examAnswers.students', 'Students')} ({submissions.length})
              </div>
              <div style={{ maxHeight: '70vh', overflowY: 'auto', background: '#fff' }}>
                {submissions.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', color: '#6b7a99', fontSize: 13 }}>
                    {t('examAnswers.noAttempts', 'No student attempts for this exam yet.')}
                  </div>
                )}
                {submissions.map((s) => {
                  const active = s.id === selectedSubmissionId
                  const name =
                    (isArabic ? s.students?.name_ar : s.students?.name_en) ||
                    s.students?.name_en ||
                    '—'
                  const isRetake =
                    !!(s.submission_data?.instructor_retake && s.status === 'EX_DRF')
                  const isDone = s.status === 'EX_GRD' || s.status === 'EX_SUB'
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => selectSubmission(s.id)}
                      aria-current={active ? 'true' : undefined}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'start',
                        padding: '12px 14px',
                        border: 'none',
                        borderBottom: '1px solid #e8edf5',
                        borderInlineStart: active ? '4px solid #1a3a6b' : '4px solid transparent',
                        background: active ? '#e8eef8' : '#ffffff',
                        color: '#1e2a3a',
                        cursor: 'pointer',
                        boxShadow: active ? 'inset 0 0 0 1px #c5d4eb' : 'none',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: active ? 800 : 700,
                          fontSize: 13,
                          color: '#1a3a6b',
                          lineHeight: 1.35,
                        }}
                      >
                        {name}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          marginTop: 4,
                          color: '#5b6b86',
                          display: 'flex',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        <span>{s.students?.student_id || '—'}</span>
                        <span
                          style={{
                            fontWeight: 800,
                            fontSize: 10,
                            padding: '2px 7px',
                            borderRadius: 999,
                            background: isRetake ? '#fef3c7' : isDone ? '#e6f7ef' : '#f1f5f9',
                            color: isRetake ? '#92400e' : isDone ? '#166534' : '#475569',
                          }}
                        >
                          {isRetake
                            ? t('examAnswers.reexamShort', 'Re-exam')
                            : submissionStatusLabel(s.status, t)}
                        </span>
                        {s.points_earned != null && (
                          <span style={{ fontWeight: 700, color: '#1e2a3a' }}>
                            {s.points_earned}/{exam.total_points}
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Answer detail */}
            <div className="card">
              {!selectedSubmission && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>
                  {t('examAnswers.selectStudent', 'Select a student to view their answers.')}
                </div>
              )}

              {selectedSubmission && (
                <>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 16,
                      marginBottom: 12,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                      <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--p)' }}>
                        {selectedStudentName || '—'}
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
                        {selectedSubmission.students?.student_id || '—'}
                        <span style={{ marginInline: 6 }}>·</span>
                        <span
                          style={{
                            display: 'inline-block',
                            fontSize: 11,
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: reexamPending
                              ? '#fef3c7'
                              : selectedSubmission.status === 'EX_GRD' || selectedSubmission.status === 'EX_SUB'
                                ? '#e6f7ef'
                                : '#f1f5f9',
                            color: reexamPending
                              ? '#b45309'
                              : selectedSubmission.status === 'EX_GRD' || selectedSubmission.status === 'EX_SUB'
                                ? '#1a7a4a'
                                : '#475569',
                          }}
                        >
                          {reexamPending
                            ? t('examAnswers.reexamPending', 'Re-exam allowed — waiting for student')
                            : submissionStatusLabel(selectedSubmission.status, t)}
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'end', fontSize: 13, flex: '0 0 auto' }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>
                        {t('examAnswers.score', 'Score')}:{' '}
                        {selectedSubmission.points_earned != null
                          ? `${selectedSubmission.points_earned} / ${exam.total_points}`
                          : '—'}
                        {selectedSubmission.grade != null ? (
                          <span style={{ color: 'var(--muted)', fontWeight: 600 }}>
                            {' '}
                            ({selectedSubmission.grade}%)
                          </span>
                        ) : null}
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 2 }}>
                        {selectedSubmission.submitted_at
                          ? `${t('examAnswers.submittedAt', 'Submitted')}: ${new Date(selectedSubmission.submitted_at).toLocaleString()}`
                          : selectedSubmission.started_at
                            ? `${t('examAnswers.startedAt', 'Started')}: ${new Date(selectedSubmission.started_at).toLocaleString()}`
                            : t('examAnswers.notStartedYet', 'Not started yet')}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '12px 14px',
                      marginBottom: 16,
                      borderRadius: 12,
                      border: '1px solid #c7d2fe',
                      background: 'linear-gradient(180deg, #eef2ff 0%, #f8fafc 100%)',
                    }}
                  >
                    <div style={{ flex: '1 1 220px' }}>
                      <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--p)' }}>
                        {t('examAnswers.reexamPanelTitle', 'Student re-exam')}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                        {reexamPending
                          ? t(
                              'examAnswers.reexamPanelPendingHint',
                              'This student may open the exam again and start a new attempt.',
                            )
                          : t(
                              'examAnswers.reexamPanelHint',
                              'Reset this student’s attempt so they can take the exam again. Previous answers are kept in history.',
                            )}
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={reexamBusy}
                      onClick={() => {
                        setActionError('')
                        setActionOk('')
                        setReexamConfirmOpen(true)
                      }}
                      style={{
                        appearance: 'none',
                        border: 'none',
                        background: '#1a3a6b',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: 14,
                        padding: '10px 16px',
                        borderRadius: 10,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {reexamPending
                        ? t('examAnswers.allowReexamAgain', 'Allow another re-exam')
                        : t('examAnswers.allowReexam', 'Allow re-exam')}
                    </button>
                  </div>

                  {actionError && (
                    <div className="alert alert-err" style={{ marginBottom: 12 }} role="alert">
                      {actionError}
                    </div>
                  )}
                  {actionOk && !actionError && (
                    <div className="alert alert-ok" style={{ marginBottom: 12 }} role="status">
                      {actionOk}
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {questions.map((q, idx) => {
                      const raw = answersMap[String(q.id)]
                      const studentText = formatStudentAnswer(q, raw, t)
                      const correctText = formatCorrectAnswer(q, t)
                      const perQ = autoGrade?.perQuestion?.[String(q.id)]
                      const live = gradeQuestion(q, raw)
                      const result = perQ || live
                      const manual = manualMarks[String(q.id)]
                      const earned =
                        manual != null ? Number(manual) : result?.earned != null ? Number(result.earned) : null
                      const max = Number(q.marks || result?.max || 0)
                      const needsManual = !!result?.needsManual
                      const isCorrect = result?.correct === true
                      const unanswered = raw == null || raw === ''

                      let borderColor = 'var(--bdr)'
                      let badgeBg = '#f1f5f9'
                      let badgeFg = '#475569'
                      let badge = t('examAnswers.unanswered', 'Unanswered')
                      if (!unanswered && needsManual) {
                        badge = t('examAnswers.needsReview', 'Needs review')
                        badgeBg = '#fef3c7'
                        badgeFg = '#b45309'
                        borderColor = '#f59e0b'
                      } else if (!unanswered && isCorrect) {
                        badge = t('examAnswers.correct', 'Correct')
                        badgeBg = '#e6f7ef'
                        badgeFg = '#1a7a4a'
                        borderColor = '#22c55e'
                      } else if (!unanswered && result && !needsManual) {
                        badge = t('examAnswers.incorrect', 'Incorrect')
                        badgeBg = '#fee2e2'
                        badgeFg = '#b91c1c'
                        borderColor = '#ef4444'
                      }

                      const qText =
                        (isArabic ? q.question_text_ar : q.question_text) || q.question_text || '—'

                      return (
                        <div
                          key={q.id}
                          style={{
                            border: `1px solid ${borderColor}`,
                            borderRadius: 12,
                            padding: 14,
                            background: '#fff',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              justifyContent: 'space-between',
                              gap: 8,
                              marginBottom: 8,
                            }}
                          >
                            <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--p)' }}>
                              {t('examAnswers.questionN', { defaultValue: 'Question {{n}}', n: idx + 1 })}
                              <span style={{ fontWeight: 500, color: 'var(--muted)', marginInlineStart: 8 }}>
                                ({questionTypeLabel(q.question_type, t)}) · {max}{' '}
                                {t('examAnswers.marks', 'marks')}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 800,
                                  padding: '3px 8px',
                                  borderRadius: 999,
                                  background: badgeBg,
                                  color: badgeFg,
                                }}
                              >
                                {badge}
                              </span>
                              {earned != null && (
                                <span style={{ fontSize: 12, fontWeight: 700 }}>
                                  {earned}/{max}
                                </span>
                              )}
                            </div>
                          </div>

                          <div style={{ fontSize: 14, marginBottom: 12, whiteSpace: 'pre-wrap' }}>{qText}</div>

                          {Array.isArray(q.options) && q.options.length > 0 && (
                            <div
                              style={{
                                fontSize: 12,
                                color: 'var(--muted)',
                                marginBottom: 10,
                                padding: '8px 10px',
                                background: '#f8fafc',
                                borderRadius: 8,
                              }}
                            >
                              {q.options.map((o, i) => {
                                const label = typeof o === 'string' ? o : o?.text || o?.label || '—'
                                return (
                                  <div key={i}>
                                    {String.fromCharCode(65 + i)}. {label}
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          <div style={{ display: 'grid', gap: 8 }}>
                            <div
                              style={{
                                padding: '10px 12px',
                                borderRadius: 8,
                                background: unanswered ? '#f8fafc' : '#eff6ff',
                                border: '1px solid #dbeafe',
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 11,
                                  fontWeight: 800,
                                  color: '#1d4ed8',
                                  marginBottom: 4,
                                }}
                              >
                                {t('examAnswers.studentAnswer', 'Student answer')}
                              </div>
                              <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>
                                {studentText || (
                                  <span style={{ color: 'var(--muted)' }}>—</span>
                                )}
                              </div>
                            </div>

                            {correctText && (
                              <div
                                style={{
                                  padding: '10px 12px',
                                  borderRadius: 8,
                                  background: '#f0fdf4',
                                  border: '1px solid #bbf7d0',
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: 11,
                                    fontWeight: 800,
                                    color: '#15803d',
                                    marginBottom: 4,
                                  }}
                                >
                                  {t('examAnswers.correctAnswer', 'Correct answer')}
                                </div>
                                <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{correctText}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}

                    {questions.length === 0 && (
                      <div style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
                        {t('examAnswers.noQuestions', 'This exam has no questions.')}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          <style>{`
            @media (max-width: 900px) {
              .exam-answers-grid { grid-template-columns: 1fr !important; }
            }
          `}</style>
        </>
      )}

      {reexamConfirmOpen &&
        selectedSubmission &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="reexam-confirm-title"
            onClick={() => !reexamBusy && setReexamConfirmOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100vw',
              height: '100vh',
              background: 'rgba(15, 23, 42, 0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 99999,
              padding: 20,
              boxSizing: 'border-box',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 460,
                background: '#ffffff',
                borderRadius: 16,
                border: '1px solid #dde3ef',
                boxShadow: '0 24px 64px rgba(15, 23, 42, 0.35)',
                padding: 24,
                color: '#1e2a3a',
              }}
            >
              <div
                id="reexam-confirm-title"
                style={{ fontWeight: 800, fontSize: 18, color: '#1a3a6b', marginBottom: 10 }}
              >
                {t('examAnswers.reexamModalTitle', 'Allow re-exam?')}
              </div>
              <p style={{ fontSize: 14, color: '#6b7a99', margin: '0 0 20px', lineHeight: 1.55 }}>
                {t('examAnswers.reexamConfirm', {
                  defaultValue:
                    'Allow {{name}} to re-take this exam? Their current answers and score will be cleared (a copy is kept in history). The synced gradebook cell for this exam type will also be cleared.',
                  name: selectedStudentName || '—',
                })}
              </p>
              {actionError && (
                <div
                  role="alert"
                  style={{
                    marginBottom: 14,
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: '#fee2e2',
                    color: '#b91c1c',
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  {actionError}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={reexamBusy}
                  onClick={() => setReexamConfirmOpen(false)}
                  style={{
                    appearance: 'none',
                    border: '1px solid #dde3ef',
                    background: '#f4f6fb',
                    color: '#1e2a3a',
                    fontWeight: 700,
                    fontSize: 14,
                    padding: '10px 16px',
                    borderRadius: 10,
                    cursor: reexamBusy ? 'not-allowed' : 'pointer',
                  }}
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="button"
                  disabled={reexamBusy}
                  onClick={confirmAllowReexam}
                  style={{
                    appearance: 'none',
                    border: 'none',
                    background: '#1a3a6b',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: 14,
                    padding: '10px 16px',
                    borderRadius: 10,
                    cursor: reexamBusy ? 'not-allowed' : 'pointer',
                    opacity: reexamBusy ? 0.75 : 1,
                  }}
                >
                  {reexamBusy
                    ? t('common.loading', 'Loading…')
                    : t('examAnswers.reexamConfirmBtn', 'Yes, allow re-exam')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
