import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'
import { mergeAssessmentSettings, RESULT_VISIBILITY, canShowReviewField } from '../../utils/assessmentSettings'
import { autoGradeExam, studentAnswerIsAnswered } from '../../utils/autoGradeExam'
import {
  resolveExamAvailabilityWindow,
  isExamEnterableForStudent,
  isExamSubmissionComplete,
  canStudentAttemptExam,
} from '../../utils/subjectExamDateTime'
import { syncExamSubmissionToGradebookRpc } from '../../utils/syncExamGradesToGradebook'

const UI = {
  p: '#1a3a6b',
  pl: '#2a5298',
  acc: '#c8a84b',
  bg: '#f4f6fb',
  sur: '#ffffff',
  bdr: '#dde3ef',
  txt: '#1e2a3a',
  muted: '#6b7a99',
  ok: '#1a7a4a',
  okBg: '#e6f7ef',
  warn: '#b45309',
  warnBg: '#fef3c7',
  err: '#b91c1c',
  errBg: '#fee2e2',
  info: '#1d4ed8',
  infoBg: '#dbeafe',
}

function fmtHMS(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (x) => String(x).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(ss)}`
}

export default function StudentExamRoom() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabic = isRTL || language === 'ar'
  const { user } = useAuth()
  const navigate = useNavigate()
  const { examId } = useParams()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [student, setStudent] = useState(null)
  const [enrollment, setEnrollment] = useState(null)
  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState([])
  const [submission, setSubmission] = useState(null)

  const [qIndex, setQIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [flagged, setFlagged] = useState({})
  const [optionOrder, setOptionOrder] = useState({})
  const [remainingSec, setRemainingSec] = useState(0)
  const [autosaveState, setAutosaveState] = useState('idle') // idle|saving|saved|err
  const [showSummary, setShowSummary] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  /** Seconds until exam start (waiting lobby) — distinct from attempt countdown */
  const [startsInSec, setStartsInSec] = useState(null)

  const savingRef = useRef(false)
  const submittingRef = useRef(false)
  const hadPositiveTimeRef = useRef(false)
  const autoSubmitTriedRef = useRef(false)

  useEffect(() => {
    if (!user?.email || !examId) return
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const { data: st, error: stErr } = await supabase
          .from('students')
          .select('id, name_en, name_ar, email')
          .eq('email', user.email)
          .eq('status', 'active')
          .single()
        if (stErr) throw stErr
        setStudent(st)

        const { data: exRow, error: exErr } = await supabase
          .from('subject_exams')
          .select(
            `
            id, class_id, subject_id, title, title_ar, exam_type, status,
            scheduled_date, start_time, end_time, duration_minutes, total_points, instructions, instructions_ar,
            allow_calculator, allow_notes, assessment_settings,
            classes(id, section, subjects(id, code, name_en, name_ar))
          `
          )
          .eq('id', Number(examId))
          .single()
        if (exErr) throw exErr
        let ex = exRow

        // Auto-open scheduled exams when availability window has started
        {
          const { data: syncedStatus, error: syncErr } = await supabase.rpc('sync_subject_exam_window_status', {
            p_exam_id: Number(examId),
          })
          if (!syncErr && syncedStatus && syncedStatus !== ex.status) {
            ex = { ...ex, status: syncedStatus }
          }
        }
        setExam(ex)

        const { data: enr, error: eErr } = await supabase
          .from('enrollments')
          .select('id, class_id, status')
          .eq('student_id', st.id)
          .eq('class_id', ex.class_id)
          .eq('status', 'enrolled')
          .single()
        if (eErr) throw eErr
        setEnrollment(enr)

        const { data: sub } = await supabase
          .from('exam_submissions')
          .select('id, exam_id, student_id, enrollment_id, submission_data, status, submitted_at, started_at, points_earned, grade')
          .eq('exam_id', ex.id)
          .eq('student_id', st.id)
          .maybeSingle()
        setSubmission(sub || null)

        // Already submitted — do not allow another attempt (unless max_attempts still available)
        if (isExamSubmissionComplete(sub) && !canStudentAttemptExam(ex, sub)) {
          navigate(`/student/elearning/exams/${ex.id}/submitted`, { replace: true })
          return
        }

        const prevData = sub?.submission_data && typeof sub.submission_data === 'object' ? sub.submission_data : {}
        setAnswers(prevData.answers || {})
        setFlagged(prevData.flagged || {})
        setOptionOrder(prevData.optionOrder || {})
        setQIndex(Number(prevData.qIndex || 0) || 0)

        const { start, end } = resolveExamAvailabilityWindow(ex)
        const durationSec = Number(ex.duration_minutes || 0) * 60

        const now = Date.now()
        const endMs = end?.getTime()
        const startMs = start?.getTime()

        // Block entry until the availability window is open
        if (!isExamEnterableForStudent(ex, new Date(now))) {
          if (startMs && now < startMs) {
            setStartsInSec(Math.max(0, Math.floor((startMs - now) / 1000)))
            setRemainingSec(0)
            setQuestions([])
            setLoading(false)
            return
          }
          if (endMs && now > endMs) {
            setError(t('studentPortal.elearning.examWindowClosed', 'The exam availability window has closed.'))
          } else {
            setError(t('studentPortal.elearning.examNotOpen', 'This exam is not open.'))
          }
          setStartsInSec(null)
          setRemainingSec(0)
          setQuestions([])
          setLoading(false)
          return
        }
        setStartsInSec(null)

        const { data: qs, error: qErr } = await supabase
          .from('subject_exam_questions')
          .select('id, question_order, question_type, question_text, question_text_ar, options, correct_answers, marks')
          .eq('subject_exam_id', ex.id)
          .order('question_order', { ascending: true })
        if (qErr) throw qErr
        const normalized = (qs || []).map((q) => ({
          ...q,
          options: Array.isArray(q.options) ? q.options : [],
        }))

        // Shuffle questions if setting says so
        const settings = ex.assessment_settings || {}
        const shuffled = settings.shuffle_questions ? [...normalized].sort(() => Math.random() - 0.5) : normalized
        setQuestions(shuffled)

        // Determine remaining time:
        // - If duration_minutes is set, timing starts when the student opens the exam (started_at).
        // - end_time (if set) is treated as an absolute cap (min).
        let startedAt = sub?.started_at ? new Date(sub.started_at).getTime() : null
        if (durationSec > 0 && !startedAt) {
          // Create/patch a draft row to capture started_at immediately.
          const startedIso = new Date().toISOString()
          if (sub?.id) {
            await supabase.from('exam_submissions').update({ started_at: startedIso }).eq('id', sub.id)
            startedAt = new Date(startedIso).getTime()
            setSubmission((prev) => (prev ? { ...prev, started_at: startedIso } : prev))
          } else {
            const initialPayload = {
              answers: prevData.answers || {},
              flagged: prevData.flagged || {},
              qIndex: Number(prevData.qIndex || 0) || 0,
              optionOrder: prevData.optionOrder || {},
            }
            const row = {
              exam_id: ex.id,
              student_id: st.id,
              enrollment_id: enr.id,
              submission_data: initialPayload,
              status: 'EX_DRF',
              started_at: startedIso,
              updated_at: startedIso,
            }
            const { data: created, error: cErr } = await supabase
              .from('exam_submissions')
              .insert(row)
              .select('id, submission_data, status, started_at')
              .single()
            if (!cErr && created?.id) {
              startedAt = new Date(created.started_at).getTime()
              setSubmission(created)
            }
          }
        }

        if (durationSec > 0 && startedAt) {
          const durEndMs = startedAt + durationSec * 1000
          const effectiveEndMs = endMs ? Math.min(endMs, durEndMs) : durEndMs
          setRemainingSec(Math.max(0, Math.floor((effectiveEndMs - now) / 1000)))
        } else if (endMs) {
          // Fallback: no duration → use scheduled end window.
          setRemainingSec(Math.max(0, Math.floor((endMs - now) / 1000)))
        } else {
          setRemainingSec(0)
        }
      } catch (e) {
        console.error(e)
        setError(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.email, examId, t])

  // Ensure stable per-question option order for shuffle_answers
  useEffect(() => {
    if (!exam?.id || !student?.id || !questions.length) return
    const settings = exam.assessment_settings || {}
    if (!settings.shuffle_answers) return

    setOptionOrder((prev) => {
      const next = { ...(prev || {}) }
      let changed = false
      for (const q of questions) {
        const key = String(q.id)
        if (next[key] || q.question_type === 'true_false') continue
        const size = Array.isArray(q.options) ? q.options.length : 0
        const order = Array.from({ length: size }, (_, i) => i)
        // deterministic-ish shuffle: use a seeded swap based on ids
        let seed = (Number(q.id) || 1) * 31 + (Number(student.id) || 1) * 97
        for (let i = order.length - 1; i > 0; i--) {
          seed = (seed * 9301 + 49297) % 233280
          const j = seed % (i + 1)
          const tmp = order[i]
          order[i] = order[j]
          order[j] = tmp
        }
        next[key] = order
        changed = true
      }
      return changed ? next : prev
    })
  }, [exam?.id, student?.id, questions])

  // Countdown — attempt timer OR waiting-to-start timer
  useEffect(() => {
    if (startsInSec != null && startsInSec > 0) {
      const it = setInterval(() => {
        setStartsInSec((s) => {
          if (s == null) return s
          const next = Math.max(0, s - 1)
          if (next === 0) {
            // Reload so student can enter once start time hits
            window.location.reload()
          }
          return next
        })
      }, 1000)
      return () => clearInterval(it)
    }
    if (!remainingSec) return
    hadPositiveTimeRef.current = true
    const it = setInterval(() => setRemainingSec((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(it)
  }, [remainingSec, startsInSec])

  // Auto-submit when attempt timer hits 0 (only if a real countdown had started)
  useEffect(() => {
    if (startsInSec != null) return
    if (!exam?.id || loading) return
    if (remainingSec !== 0) return
    if (!hadPositiveTimeRef.current || autoSubmitTriedRef.current) return
    if (submission?.status === 'EX_SUB' || submission?.status === 'EX_GRD') return
    if (!isExamEnterableForStudent(exam) && !submission?.started_at) return
    autoSubmitTriedRef.current = true
    ;(async () => {
      try {
        await submitFinal()
      } catch {
        autoSubmitTriedRef.current = false
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSec, exam?.id, loading, startsInSec])

  const courseCode = exam?.classes?.subjects?.code || '—'
  const courseName = getLocalizedName(exam?.classes?.subjects, isArabic) || '—'
  const examTitle = (isArabic ? exam?.title_ar : exam?.title) || exam?.title || '—'

  const currentQ = questions[qIndex] || null
  const totalQ = questions.length

  const answeredCount = useMemo(() => {
    return questions.filter((q) => answers[String(q.id)] != null).length
  }, [questions, answers])

  const persistDraft = async (patch = {}) => {
    if (!student?.id || !enrollment?.id || !exam?.id) return
    if (savingRef.current || submittingRef.current) return
    if (submission?.status === 'EX_SUB' || submission?.status === 'EX_GRD') return
    savingRef.current = true
    setAutosaveState('saving')
    try {
      const payload = {
        answers,
        flagged,
        qIndex,
        optionOrder,
        ...patch,
      }
      const row = {
        exam_id: exam.id,
        student_id: student.id,
        enrollment_id: enrollment.id,
        submission_data: payload,
        status: 'EX_DRF',
        started_at: submission?.started_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (submission?.id) {
        const { error } = await supabase.from('exam_submissions').update(row).eq('id', submission.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('exam_submissions').insert(row).select('id, submission_data, status, started_at').single()
        if (error) throw error
        setSubmission({ id: data.id, submission_data: data.submission_data, status: data.status, started_at: data.started_at })
      }
      setAutosaveState('saved')
      setTimeout(() => setAutosaveState('idle'), 1200)
    } catch (e) {
      console.error(e)
      setAutosaveState('err')
    } finally {
      savingRef.current = false
    }
  }

  // Autosave on answer changes (debounced)
  useEffect(() => {
    if (!exam?.id || !student?.id || loading) return
    if (submission?.status === 'EX_SUB' || submission?.status === 'EX_GRD') return
    const h = setTimeout(() => persistDraft(), 700)
    return () => clearTimeout(h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, flagged, qIndex, optionOrder])

  const setAnswer = (q, value) => {
    setAnswers((m) => ({ ...(m || {}), [String(q.id)]: value }))
  }

  const settings = useMemo(() => mergeAssessmentSettings(exam?.assessment_settings), [exam?.assessment_settings])

  const unansweredCount = useMemo(
    () => questions.filter((q) => !studentAnswerIsAnswered(answers[String(q.id)])).length,
    [questions, answers],
  )

  const submitFinal = async () => {
    if (!student?.id || !enrollment?.id || !exam?.id || submittingRef.current) return
    if (submission?.status === 'EX_SUB' || submission?.status === 'EX_GRD') {
      navigate(`/student/elearning/exams/${exam.id}/submitted`)
      return
    }
    submittingRef.current = true
    setSubmitting(true)
    setError('')
    try {
      // Wait briefly if an autosave is mid-flight
      for (let i = 0; i < 20 && savingRef.current; i += 1) {
        await new Promise((r) => setTimeout(r, 50))
      }

      const grade = autoGradeExam(questions, answers)
      const nowIso = new Date().toISOString()
      const payload = {
        answers,
        flagged,
        qIndex,
        optionOrder,
        submitted: true,
        attempt_count: Math.max(
          1,
          Number(submission?.submission_data?.attempt_count || 0) + 1,
        ),
        autoGrade: grade,
      }
      // Always write EX_SUB first (RLS historically only allowed EX_DRF/EX_SUB).
      // Prefer EX_GRD when fully auto-graded if DB policy allows it; fall back to EX_SUB.
      const preferredStatus = grade.fullyAutoGraded ? 'EX_GRD' : 'EX_SUB'
      let finalStatus = preferredStatus
      const row = {
        exam_id: exam.id,
        student_id: student.id,
        enrollment_id: enrollment.id,
        submission_data: payload,
        status: preferredStatus,
        points_earned: grade.points_earned,
        grade: exam.total_points ? Math.round((grade.points_earned / Number(exam.total_points)) * 1000) / 10 : grade.percent,
        started_at: submission?.started_at || nowIso,
        submitted_at: nowIso,
        updated_at: nowIso,
      }

      let writeErr = null
      if (submission?.id) {
        const { error } = await supabase.from('exam_submissions').update(row).eq('id', submission.id)
        writeErr = error
      } else {
        const { data, error } = await supabase.from('exam_submissions').insert(row).select('id').single()
        writeErr = error
        if (!error && data?.id) setSubmission((prev) => ({ ...(prev || {}), id: data.id, status: preferredStatus }))
      }

      // Fallback if EX_GRD is blocked by older RLS
      if (writeErr && preferredStatus === 'EX_GRD') {
        finalStatus = 'EX_SUB'
        const fallback = { ...row, status: 'EX_SUB' }
        if (submission?.id) {
          const { error } = await supabase.from('exam_submissions').update(fallback).eq('id', submission.id)
          writeErr = error
        } else {
          const { data, error } = await supabase.from('exam_submissions').insert(fallback).select('id').single()
          writeErr = error
          if (!error && data?.id) setSubmission((prev) => ({ ...(prev || {}), id: data.id, status: 'EX_SUB' }))
        }
      }

      if (writeErr) throw writeErr

      let submissionId = submission?.id
      if (!submissionId) {
        const { data: latest } = await supabase
          .from('exam_submissions')
          .select('id')
          .eq('exam_id', exam.id)
          .eq('student_id', student.id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        submissionId = latest?.id
      }

      // Push score into gradebook (midterm/final/quizzes column)
      if (submissionId) {
        await syncExamSubmissionToGradebookRpc(submissionId)
      }

      setSubmission((prev) =>
        prev ? { ...prev, id: submissionId || prev.id, status: finalStatus, points_earned: row.points_earned, submitted_at: nowIso } : prev,
      )
      setShowSummary(false)
      navigate(`/student/elearning/exams/${exam.id}/submitted`)
    } catch (e) {
      console.error(e)
      const msg = e?.message || e?.error_description || String(e)
      setError(msg)
      alert(t('studentPortal.elearning.submitFailed', { defaultValue: 'Submit failed: {{msg}}', msg }))
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-slate-600 border-t-transparent" />
      </div>
    )
  }

  if (error && !exam) {
    return (
      <div className="rounded-xl border bg-white p-6" style={{ borderColor: UI.bdr }}>
        <div className="text-sm" style={{ color: UI.err }}>{error}</div>
        <Link to="/student/elearning/exams" className="inline-block mt-4 text-sm font-bold" style={{ color: UI.p }}>
          ← {t('studentPortal.elearning.backToExams', 'Back to exams')}
        </Link>
      </div>
    )
  }

  // Waiting lobby — exam scheduled but start time not reached (do not show exam UI)
  if (startsInSec != null) {
    return (
      <div dir={isArabic ? 'rtl' : 'ltr'} className="space-y-4">
        <nav className="flex flex-wrap items-center gap-2 text-sm" style={{ color: UI.muted }}>
          <Link to="/dashboard" style={{ color: UI.muted }} className="hover:underline">
            {t('studentPortal.dashboard', 'Dashboard')}
          </Link>
          <span style={{ color: UI.bdr }}>›</span>
          <Link to="/student/elearning/exams" style={{ color: UI.muted }} className="hover:underline">
            {t('studentPortal.elearning.exams', 'Exams')}
          </Link>
          <span style={{ color: UI.bdr }}>›</span>
          <span className="font-semibold" style={{ color: UI.p }}>
            {courseCode}
          </span>
        </nav>

        <div className="bg-white rounded-xl border shadow-sm p-8 text-center max-w-lg mx-auto" style={{ borderColor: UI.bdr }}>
          <div className="text-4xl mb-3">📅</div>
          <h1 className="text-xl font-extrabold mb-2" style={{ color: UI.p }}>
            {examTitle}
          </h1>
          <p className="text-sm mb-6" style={{ color: UI.muted }}>
            {t('studentPortal.elearning.examNotStarted', 'Exam has not started yet.')}
          </p>
          <div className="rounded-xl px-5 py-6 text-white" style={{ background: `linear-gradient(135deg, ${UI.warn}, #d97706)` }}>
            <div className="text-xs font-extrabold uppercase tracking-widest opacity-90">
              {t('studentPortal.elearning.startsIn', 'Starts in')}
            </div>
            <div className="text-4xl font-extrabold mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtHMS(startsInSec)}
            </div>
            <div className="text-xs opacity-80 mt-2">
              {t('studentPortal.elearning.waitingToStartHint', 'You can enter the exam when this countdown reaches zero.')}
            </div>
          </div>
          <Link
            to="/student/elearning/exams"
            className="inline-block mt-6 px-5 py-2 rounded-md border font-bold text-sm"
            style={{ borderColor: UI.p, color: UI.p }}
          >
            ← {t('studentPortal.elearning.backToExams', 'Back to exams')}
          </Link>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div dir={isArabic ? 'rtl' : 'ltr'} className="space-y-4">
        <div className="rounded-xl border bg-white p-6 max-w-lg" style={{ borderColor: UI.bdr }}>
          <div className="text-sm font-bold mb-2" style={{ color: UI.err }}>{error}</div>
          <Link to="/student/elearning/exams" className="text-sm font-bold" style={{ color: UI.p }}>
            ← {t('studentPortal.elearning.backToExams', 'Back to exams')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div dir={isArabic ? 'rtl' : 'ltr'} className="space-y-4">
      <nav className="flex flex-wrap items-center gap-2 text-sm" style={{ color: UI.muted }}>
        <Link to="/dashboard" style={{ color: UI.muted }} className="hover:underline">
          {t('studentPortal.dashboard', 'Dashboard')}
        </Link>
        <span style={{ color: UI.bdr }}>›</span>
        <Link to="/student/elearning/exams" style={{ color: UI.muted }} className="hover:underline">
          {t('studentPortal.elearning.exams', 'Exams')}
        </Link>
        <span style={{ color: UI.bdr }}>›</span>
        <span className="font-semibold" style={{ color: UI.p }}>
          {courseCode}
        </span>
      </nav>

      {/* Attempt timer — only while exam is in progress */}
      <div className="rounded-xl px-5 py-4 text-white flex items-center gap-4" style={{ background: `linear-gradient(135deg, ${UI.err}, #dc2626)` }}>
        <div className="text-2xl">⏱️</div>
        <div className="flex-1">
          <div className="text-xs font-extrabold uppercase tracking-widest opacity-80">{t('studentPortal.elearning.timeRemaining', 'Time remaining')}</div>
          <div className="text-3xl font-extrabold" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {fmtHMS(remainingSec)}
          </div>
          <div className="text-xs opacity-80">
            {courseCode} — {examTitle} — {totalQ} {t('studentPortal.elearning.questions', 'questions')}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs opacity-80">{t('studentPortal.elearning.progress', 'Progress')}</div>
          <div className="text-2xl font-extrabold">
            {answeredCount} / {totalQ}
          </div>
          <div className="w-[120px] h-[6px] rounded-full overflow-hidden mt-2" style={{ background: 'rgba(255,255,255,.3)' }}>
            <div className="h-full" style={{ width: `${totalQ ? Math.round((answeredCount / totalQ) * 100) : 0}%`, background: '#fff' }} />
          </div>
        </div>
      </div>

      <div className="rounded-lg px-4 py-3 border-r-4 flex gap-3 items-start" style={{ background: UI.infoBg, color: UI.info, borderColor: UI.info }}>
        <span>🔒</span>
        <div className="text-sm">
          {t('studentPortal.elearning.proctorNote', 'Integrity monitoring is enabled. Do not leave the exam window.')}
        </div>
        <div className="ms-auto text-xs font-extrabold" style={{ color: UI.muted }}>
          {autosaveState === 'saving'
            ? t('studentPortal.elearning.saving', 'Saving…')
            : autosaveState === 'saved'
              ? t('studentPortal.elearning.saved', 'Saved')
              : autosaveState === 'err'
                ? t('studentPortal.elearning.saveFailed', 'Save failed')
                : t('studentPortal.elearning.autosave', 'Autosave')}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5 items-start">
        {/* Question */}
        <div className="bg-white rounded-xl border shadow-sm p-6" style={{ borderColor: UI.bdr }}>
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="text-xs font-extrabold uppercase tracking-wide" style={{ color: UI.muted }}>
              {t('studentPortal.elearning.questionXofY', { defaultValue: 'Question {{x}} of {{y}}', x: qIndex + 1, y: totalQ })}
            </div>
            <button
              type="button"
              className="px-3 py-1.5 rounded-md border text-xs font-bold"
              style={{ borderColor: UI.bdr, background: UI.bg, color: UI.txt }}
              onClick={() => setFlagged((m) => ({ ...(m || {}), [String(currentQ?.id)]: !m?.[String(currentQ?.id)] }))}
              disabled={!currentQ}
            >
              {flagged[String(currentQ?.id)] ? '⚑' : '⚐'} {t('studentPortal.elearning.flag', 'Flag')}
            </button>
          </div>

          <div className="text-base font-extrabold mb-4" style={{ color: UI.txt }}>
            {(isArabic ? currentQ?.question_text_ar : currentQ?.question_text) || currentQ?.question_text || '—'}
          </div>

          {/* Options */}
          <div className="space-y-2">
            {currentQ?.question_type === 'true_false' ? (
              <>
                {['true', 'false'].map((v) => (
                  <label key={v} className="flex items-center gap-3 rounded-md border px-4 py-3 cursor-pointer" style={{ borderColor: UI.bdr }}>
                    <input
                      type="radio"
                      name={`q-${currentQ.id}`}
                      checked={answers[String(currentQ.id)] === v}
                      onChange={() => setAnswer(currentQ, v)}
                      style={{ accentColor: UI.pl, width: 16, height: 16 }}
                    />
                    <span className="text-sm font-semibold">{v === 'true' ? (isArabic ? '✓ صح' : 'True') : (isArabic ? '✗ خطأ' : 'False')}</span>
                  </label>
                ))}
              </>
            ) : (
              (optionOrder[String(currentQ?.id)] || (currentQ?.options || []).map((_, i) => i)).map((origIndex) => {
                const opt = (currentQ?.options || [])[origIndex]
                return (
                <label key={origIndex} className="flex items-center gap-3 rounded-md border px-4 py-3 cursor-pointer" style={{ borderColor: UI.bdr }}>
                  <input
                    type="radio"
                    name={`q-${currentQ.id}`}
                    checked={answers[String(currentQ.id)] === origIndex}
                    onChange={() => setAnswer(currentQ, origIndex)}
                    style={{ accentColor: UI.pl, width: 16, height: 16 }}
                  />
                  <span className="text-sm font-semibold">{opt}</span>
                </label>
                )
              })
            )}
          </div>

          <div className="flex items-center justify-between mt-6 pt-4 border-t" style={{ borderColor: UI.bdr }}>
            <button
              type="button"
              className="px-4 py-2 rounded-md border font-bold text-sm"
              style={{ borderColor: UI.bdr, background: UI.bg, color: UI.txt }}
              onClick={() => setQIndex((x) => Math.max(0, x - 1))}
              disabled={qIndex === 0}
            >
              ← {t('studentPortal.elearning.prevQuestion', 'Previous')}
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-md font-extrabold text-white"
              style={{ background: UI.p }}
              onClick={() => setQIndex((x) => Math.min(totalQ - 1, x + 1))}
              disabled={qIndex >= totalQ - 1}
            >
              {t('studentPortal.elearning.nextQuestion', 'Next')} →
            </button>
          </div>

          <div className="mt-5 rounded-xl border p-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderColor: UI.ok, background: UI.okBg }}>
            <div>
              <div className="text-sm font-extrabold" style={{ color: UI.ok }}>
                {t('studentPortal.elearning.readyToSubmit', 'Ready to submit?')}
              </div>
              <div className="text-xs" style={{ color: UI.ok }}>
                {t('studentPortal.elearning.answeredOutOf', { defaultValue: 'Answered {{a}} of {{t}}', a: answeredCount, t: totalQ })}
              </div>
            </div>
            <button type="button" className="px-6 py-2.5 rounded-md font-extrabold text-white" style={{ background: UI.ok }} onClick={() => setShowSummary(true)}>
              ✅ {t('studentPortal.elearning.submitFinal', 'Submit final')}
            </button>
          </div>
        </div>

        {/* Navigation grid */}
        <div className="bg-white rounded-xl border shadow-sm p-5 sticky top-4" style={{ borderColor: UI.bdr }}>
          <div className="font-extrabold mb-3" style={{ color: UI.p }}>
            {t('studentPortal.elearning.navigate', 'Navigate')}
          </div>
          <div className="grid grid-cols-5 gap-2 mb-3">
            {questions.map((q, i) => {
              const answered = answers[String(q.id)] != null
              const isCurrent = i === qIndex
              const isFlag = !!flagged[String(q.id)]
              const bg = isCurrent ? UI.p : answered ? UI.ok : UI.bg
              const br = isFlag ? UI.warn : UI.bdr
              const col = isCurrent || answered ? '#fff' : UI.txt
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setQIndex(i)}
                  className="h-9 rounded-md font-extrabold text-sm"
                  style={{ background: bg, border: `1.5px solid ${br}`, color: col }}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>
          <div className="text-xs space-y-1" style={{ color: UI.muted }}>
            <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: UI.ok }} /> {t('studentPortal.elearning.answered', 'Answered')}</div>
            <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: UI.p }} /> {t('studentPortal.elearning.current', 'Current')}</div>
            <div className="flex items-center gap-2"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: UI.warnBg, border: `1.5px solid ${UI.warn}` }} /> {t('studentPortal.elearning.flagged', 'Flagged')}</div>
          </div>
        </div>
      </div>

      {showSummary && (
        <div
          role="dialog"
          aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}
          onClick={() => setShowSummary(false)}
        >
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-lg w-full" style={{ borderColor: UI.bdr }} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-extrabold mb-4" style={{ color: UI.p }}>
              {t('studentPortal.elearning.submitConfirmTitle', 'Submit all your answers and finish?')}
            </h2>
            {error && (
              <div className="rounded-lg px-3 py-2 text-sm mb-3" style={{ background: UI.errBg, color: UI.err }}>
                {error}
              </div>
            )}
            {settings.summary_show_total !== false && (
              <table className="w-full text-sm mb-4">
                <tbody>
                  <tr><td style={{ color: UI.muted }}>{t('studentPortal.elearning.answered', 'Answered')}</td><td className="text-end font-bold">{answeredCount}</td></tr>
                  <tr><td style={{ color: UI.muted }}>{t('studentPortal.elearning.unanswered', 'Unanswered')}</td><td className="text-end font-bold">{unansweredCount}</td></tr>
                  <tr><td style={{ color: UI.muted }}>{t('studentPortal.elearning.flagged', 'Flagged')}</td><td className="text-end font-bold">{Object.values(flagged).filter(Boolean).length}</td></tr>
                </tbody>
              </table>
            )}
            <div className="flex gap-3 justify-end">
              <button type="button" className="px-4 py-2 rounded-md border font-bold" style={{ borderColor: UI.bdr }} onClick={() => setShowSummary(false)}>
                {t('common.cancel', 'Cancel')}
              </button>
              <button type="button" className="px-4 py-2 rounded-md font-extrabold text-white" style={{ background: UI.ok }} disabled={submitting} onClick={submitFinal}>
                {submitting ? '…' : t('studentPortal.elearning.submitFinal', 'Submit final')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

