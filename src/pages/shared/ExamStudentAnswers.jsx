import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'
import { getLocalizedName } from '../../utils/localizedName'
import { gradeQuestion, autoGradeExam } from '../../utils/autoGradeExam'
import {
  formatStudentAnswer,
  formatCorrectAnswer,
  submissionStatusLabel,
  examLifecycleStatusLabel,
  questionTypeLabel,
} from '../../utils/formatExamAnswer'
import { recoverAndSyncExamSubmissions } from '../../utils/syncExamGradesToGradebook'
import { parseDatetimeLocal } from '../../utils/subjectExamDateTime'
import {
  Search,
  ClipboardList,
  FileQuestion,
  Users,
  Award,
  Calendar,
  ChevronRight,
  BookOpen,
  RefreshCw,
} from 'lucide-react'

function rowKey(s) {
  if (s?.id != null) return `sub-${s.id}`
  if (s?.student_id != null) return `stu-${s.student_id}`
  return ''
}

function toDatetimeLocal(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function mergeEnrolledStudentsWithSubmissions(examId, classId, subs) {
  const { data: enrs, error } = await supabase
    .from('enrollments')
    .select('id, student_id, students(id, student_id, name_en, name_ar)')
    .eq('class_id', classId)
    .eq('status', 'enrolled')
  if (error) throw error

  const byStudent = new Map((subs || []).map((s) => [s.student_id, s]))
  const seen = new Set()
  const merged = []

  for (const enr of enrs || []) {
    seen.add(enr.student_id)
    const existing = byStudent.get(enr.student_id)
    if (existing) {
      merged.push({
        ...existing,
        enrollment_id: existing.enrollment_id || enr.id,
        students: existing.students || enr.students,
      })
    } else {
      merged.push({
        id: null,
        exam_id: examId,
        student_id: enr.student_id,
        enrollment_id: enr.id,
        status: null,
        started_at: null,
        submitted_at: null,
        points_earned: null,
        grade: null,
        submission_data: null,
        students: enr.students,
      })
    }
  }

  for (const s of subs || []) {
    if (!seen.has(s.student_id)) merged.push(s)
  }

  merged.sort((a, b) => {
    const an = (a.students?.name_en || a.students?.student_id || '').toLowerCase()
    const bn = (b.students?.name_en || b.students?.student_id || '').toLowerCase()
    return an.localeCompare(bn)
  })
  return merged
}

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
  const [selectedRowKeys, setSelectedRowKeys] = useState(() => new Set())
  const [reexamWindowStart, setReexamWindowStart] = useState('')
  const [reexamWindowEnd, setReexamWindowEnd] = useState('')
  const [reexamDuration, setReexamDuration] = useState(90)
  const [actionError, setActionError] = useState('')
  const [actionOk, setActionOk] = useState('')
  const [examSearch, setExamSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('')

  const basePath = mode === 'admin' ? '/admin/exam-answers' : '/instructor/exam-answers'
  const homeHref = mode === 'admin' ? '/dashboard' : '/instructor/dashboard'
  const assessmentsHref = mode === 'admin' ? '/examinations' : '/instructor/assessments'
  const align = isArabic ? 'text-right' : 'text-left'

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
      setSelectedRowKeys(new Set())
      return
    }
    let cancelled = false
    ;(async () => {
      setDetailLoading(true)
      try {
        let ex = null
        if (mode === 'instructor') {
          const instructor = await getActiveInstructorByEmail(user.email)
          if (!instructor) return
          const { data } = await supabase
            .from('subject_exams')
            .select(
              'id, title, exam_type, status, total_points, class_id, duration_minutes, assessment_settings, classes(id, section, instructor_id, subjects(code, name_en, name_ar))',
            )
            .eq('id', selectedExamId)
            .maybeSingle()
          if (!data || data.classes?.instructor_id !== instructor.id) {
            if (!cancelled) {
              setExam(null)
              setQuestions([])
              setSubmissions([])
            }
            return
          }
          ex = data
        } else {
          const { data } = await supabase
            .from('subject_exams')
            .select(
              'id, title, exam_type, status, total_points, class_id, duration_minutes, assessment_settings, classes(id, section, subjects(code, name_en, name_ar))',
            )
            .eq('id', selectedExamId)
            .maybeSingle()
          ex = data || null
          if (!ex) {
            if (!cancelled) setExam(null)
            return
          }
        }
        if (!cancelled) setExam(ex)

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
              'id, exam_id, student_id, enrollment_id, status, started_at, submitted_at, points_earned, grade, submission_data, students(id, student_id, name_en, name_ar)',
            )
            .eq('exam_id', selectedExamId)
            .order('submitted_at', { ascending: false, nullsFirst: false }),
        ])

        if (cancelled) return
        setQuestions(qs || [])
        let list = (subs || []).map((s) => ({
          ...s,
          exam_id: s.exam_id || selectedExamId,
        }))

        try {
          const sync = await recoverAndSyncExamSubmissions(selectedExamId, list)
          if (sync.submissions?.length) list = sync.submissions
        } catch (syncErr) {
          console.warn('recoverAndSyncExamSubmissions', syncErr)
        }

        if (ex.class_id) {
          list = await mergeEnrolledStudentsWithSubmissions(selectedExamId, ex.class_id, list)
        }

        if (cancelled) return
        setSubmissions(list)
        setSelectedRowKeys(new Set())
        const prefer =
          list.find((s) => s.id === submissionIdParam) ||
          list.find((s) => s.status === 'EX_SUB' || s.status === 'EX_GRD') ||
          list[0] ||
          null
        setSelectedSubmissionId(prefer ? rowKey(prefer) : null)
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
    () => submissions.find((s) => rowKey(s) === selectedSubmissionId) || null,
    [submissions, selectedSubmissionId],
  )

  const allRowKeys = useMemo(() => submissions.map((s) => rowKey(s)).filter(Boolean), [submissions])
  const allSelected = allRowKeys.length > 0 && allRowKeys.every((k) => selectedRowKeys.has(k))

  const selectExam = (id) => {
    const next = id ? Number(id) : null
    setSelectedExamId(next)
    setSelectedSubmissionId(null)
    setSelectedRowKeys(new Set())
    const params = new URLSearchParams()
    if (next) params.set('examId', String(next))
    setSearchParams(params)
  }

  const selectSubmission = (row) => {
    const key = typeof row === 'object' ? rowKey(row) : row
    const found = typeof row === 'object' ? row : submissions.find((s) => rowKey(s) === row)
    setSelectedSubmissionId(key)
    setActionError('')
    setActionOk('')
    setReexamConfirmOpen(false)
    const params = new URLSearchParams(searchParams)
    if (selectedExamId) params.set('examId', String(selectedExamId))
    if (found?.id) params.set('submissionId', String(found.id))
    else params.delete('submissionId')
    setSearchParams(params)
  }

  const toggleRowSelected = (key, checked) => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const toggleSelectAll = (checked) => {
    setSelectedRowKeys(checked ? new Set(allRowKeys) : new Set())
  }

  const openReexamModal = (keys = null) => {
    setActionError('')
    setActionOk('')
    if (keys) setSelectedRowKeys(new Set(keys))
    const now = new Date()
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    setReexamWindowStart(toDatetimeLocal(now))
    setReexamWindowEnd(toDatetimeLocal(end))
    setReexamDuration(Math.max(1, Number(exam?.duration_minutes) || 90))
    setReexamConfirmOpen(true)
  }

  const reloadSubmissions = async (preferKey = null) => {
    if (!selectedExamId || !exam?.class_id) return
    const { data: subs } = await supabase
      .from('exam_submissions')
      .select(
        'id, exam_id, student_id, enrollment_id, status, started_at, submitted_at, points_earned, grade, submission_data, students(id, student_id, name_en, name_ar)',
      )
      .eq('exam_id', selectedExamId)
      .order('submitted_at', { ascending: false, nullsFirst: false })
    let list = (subs || []).map((s) => ({ ...s, exam_id: s.exam_id || selectedExamId }))
    try {
      const sync = await recoverAndSyncExamSubmissions(selectedExamId, list)
      if (sync.submissions?.length) list = sync.submissions
    } catch (syncErr) {
      console.warn('recoverAndSyncExamSubmissions', syncErr)
    }
    list = await mergeEnrolledStudentsWithSubmissions(selectedExamId, exam.class_id, list)
    setSubmissions(list)
    const next =
      (preferKey && list.find((s) => rowKey(s) === preferKey)) ||
      list.find((s) => rowKey(s) === selectedSubmissionId) ||
      list[0] ||
      null
    setSelectedSubmissionId(next ? rowKey(next) : null)
  }

  const selectedStudentName =
    (isArabic ? selectedSubmission?.students?.name_ar : selectedSubmission?.students?.name_en) ||
    selectedSubmission?.students?.name_en ||
    selectedSubmission?.students?.student_id ||
    ''

  const reexamPending =
    !!(selectedSubmission?.submission_data?.instructor_retake && selectedSubmission?.status === 'EX_DRF')

  const previousAttempts = Array.isArray(selectedSubmission?.submission_data?.previous_attempts)
    ? selectedSubmission.submission_data.previous_attempts
    : []

  const confirmAllowReexam = async () => {
    const keys = selectedRowKeys.size
      ? [...selectedRowKeys]
      : selectedSubmission
        ? [rowKey(selectedSubmission)]
        : []
    const students = submissions.filter((s) => keys.includes(rowKey(s)))
    const studentIds = [...new Set(students.map((s) => s.student_id).filter(Boolean))]
    if (!selectedExamId || !studentIds.length) return

    const start = parseDatetimeLocal(reexamWindowStart)
    const end = parseDatetimeLocal(reexamWindowEnd)
    if (!start || !end || end <= start) {
      setActionError(
        t('examAnswers.reexamWindowInvalid', 'Please set a valid start and end time (end must be after start).'),
      )
      return
    }
    const duration = Math.max(1, Number(reexamDuration) || Number(exam?.duration_minutes) || 90)

    setReexamBusy(true)
    setActionError('')
    setActionOk('')
    try {
      const { data, error } = await supabase.rpc('reset_exam_students_for_retake', {
        p_exam_id: selectedExamId,
        p_student_ids: studentIds,
        p_window_start_at: start.toISOString(),
        p_window_end_at: end.toISOString(),
        p_duration_minutes: duration,
      })
      if (error) throw error
      await reloadSubmissions(selectedSubmission ? rowKey(selectedSubmission) : null)
      setReexamConfirmOpen(false)
      setSelectedRowKeys(new Set())
      setActionOk(
        t('examAnswers.reexamBulkDone', {
          defaultValue:
            'Re-exam allowed for {{n}} student(s). They can enter only during the window you set.',
          n: data ?? studentIds.length,
        }),
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
  const liveAutoGrade = useMemo(() => autoGradeExam(questions, answersMap), [questions, answersMap])
  const manualMarks = selectedSubmission?.submission_data?.manualMarks || {}

  const subjectOptions = useMemo(() => {
    const map = new Map()
    for (const ex of exams) {
      const subj = ex.classes?.subjects
      if (!subj?.code && !subj?.name_en && !subj?.name_ar) continue
      const key = subj.code || String(subj.name_en || subj.name_ar)
      if (!map.has(key)) {
        map.set(key, {
          key,
          code: subj.code || '',
          label: getLocalizedName(subj, isArabic) || subj.code || key,
        })
      }
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, isArabic ? 'ar' : 'en'))
  }, [exams, isArabic])

  const filteredExams = useMemo(() => {
    let list = [...exams]
    if (subjectFilter) {
      list = list.filter((ex) => {
        const code = ex.classes?.subjects?.code || ''
        const name = getLocalizedName(ex.classes?.subjects, isArabic) || ''
        const key = code || name
        return key === subjectFilter
      })
    }
    if (examSearch.trim()) {
      const q = examSearch.trim().toLowerCase()
      list = list.filter((ex) => {
        const title = (ex.title || '').toLowerCase()
        const code = (ex.classes?.subjects?.code || '').toLowerCase()
        const name = (getLocalizedName(ex.classes?.subjects, isArabic) || '').toLowerCase()
        const st = examLifecycleStatusLabel(ex.status, t).toLowerCase()
        return title.includes(q) || code.includes(q) || name.includes(q) || st.includes(q)
      })
    }
    return list
  }, [exams, subjectFilter, examSearch, isArabic, t])

  const statusPill = (status) => {
    const label = examLifecycleStatusLabel(status, t)
    const s = String(status || '').toUpperCase()
    let cls = 'bg-slate-100 text-slate-700'
    if (s.includes('OPEN') || s.includes('LIVE') || s.includes('PUB')) cls = 'bg-emerald-50 text-emerald-800'
    else if (s.includes('DRAFT')) cls = 'bg-amber-50 text-amber-800'
    else if (s.includes('CLOSE') || s.includes('END') || s.includes('ARCH')) cls = 'bg-slate-100 text-slate-600'
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
        {label}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[240px]" dir={isArabic ? 'rtl' : 'ltr'}>
        <div className="h-10 w-10 rounded-full border-[3px] border-slate-200 border-t-[#1a3a6b] animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6" dir={isArabic ? 'rtl' : 'ltr'}>
      <nav className={`flex flex-wrap items-center gap-2 text-sm text-slate-500 ${align}`}>
        <Link to={homeHref} className="hover:text-[#1a3a6b] transition-colors">
          {t('common.dashboard', 'Dashboard')}
        </Link>
        <ChevronRight className={`w-3.5 h-3.5 opacity-50 ${isArabic ? 'rotate-180' : ''}`} />
        {mode === 'instructor' && (
          <>
            <Link to={assessmentsHref} className="hover:text-[#1a3a6b] transition-colors">
              {t('instructorPortal.createAssessments', 'Assessments')}
            </Link>
            <ChevronRight className={`w-3.5 h-3.5 opacity-50 ${isArabic ? 'rotate-180' : ''}`} />
          </>
        )}
        <span className="text-slate-800 font-medium">{t('examAnswers.breadcrumb', 'Exam answers')}</span>
      </nav>

      <div className={`flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between ${isArabic ? 'sm:flex-row-reverse' : ''}`}>
        <div className={align}>
          <div className={`flex items-center gap-3 ${isArabic ? 'flex-row-reverse' : ''}`}>
            <div className="h-11 w-11 rounded-xl bg-[#1a3a6b] text-white flex items-center justify-center shrink-0">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 m-0">
                {t('examAnswers.title', 'Student exam answers')}
              </h1>
              <p className="text-slate-600 mt-1 text-sm sm:text-base max-w-2xl">
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
          </div>
        </div>
        {mode === 'instructor' && selectedExamId && (
          <div className={`flex flex-wrap gap-2 shrink-0 ${isArabic ? 'flex-row-reverse' : ''}`}>
            <Link
              to={`/instructor/monitor-exam?examId=${selectedExamId}&classId=${exam?.class_id || ''}`}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t('instructorPortal.monitorExam', 'Monitor')}
            </Link>
            <Link
              to={`/instructor/grade-exam?examId=${selectedExamId}`}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#1a3a6b] text-white text-sm font-semibold hover:bg-[#152f57]"
            >
              {t('instructorPortal.manualGrading', 'Manual grading')}
            </Link>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={`block text-sm font-medium text-slate-700 mb-2 ${align}`}>
              {t('examAnswers.filterSubject', 'Subject')}
            </label>
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className={`w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-[#1a3a6b]/30 focus:border-[#1a3a6b] ${align}`}
            >
              <option value="">{t('examAnswers.allSubjects', 'All subjects')}</option>
              {subjectOptions.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.code ? `${s.label} (${s.code})` : s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={`block text-sm font-medium text-slate-700 mb-2 ${align}`}>
              {t('common.search', 'Search')}
            </label>
            <div className="relative">
              <Search
                className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none ${isArabic ? 'right-3' : 'left-3'}`}
              />
              <input
                type="text"
                value={examSearch}
                onChange={(e) => setExamSearch(e.target.value)}
                placeholder={t('examAnswers.searchExams', 'Search exams by title or subject…')}
                className={`w-full py-2.5 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-[#1a3a6b]/30 focus:border-[#1a3a6b] ${isArabic ? 'pr-10 pl-3 text-right' : 'pl-10 pr-3 text-left'}`}
              />
            </div>
          </div>
          <div>
            <label className={`block text-sm font-medium text-slate-700 mb-2 ${align}`}>
              {t('examAnswers.selectExam', 'Select exam')}
            </label>
            <select
              value={selectedExamId || ''}
              onChange={(e) => selectExam(e.target.value)}
              className={`w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:ring-2 focus:ring-[#1a3a6b]/30 focus:border-[#1a3a6b] ${align}`}
            >
              <option value="">— {t('examAnswers.chooseExam', 'Choose an exam')} —</option>
              {filteredExams.map((ex) => {
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
        </div>
        <div className={`mt-3 flex flex-wrap gap-3 text-xs text-slate-500 ${isArabic ? 'flex-row-reverse' : ''}`}>
          <span className="inline-flex items-center gap-1.5">
            <FileQuestion className="w-3.5 h-3.5" />
            {t('examAnswers.examCount', { defaultValue: '{{n}} exams', n: filteredExams.length })}
          </span>
          {subjectFilter && (
            <button
              type="button"
              onClick={() => setSubjectFilter('')}
              className="text-[#1a3a6b] font-semibold hover:underline"
            >
              {t('examAnswers.clearSubjectFilter', 'Clear subject filter')}
            </button>
          )}
        </div>
      </div>

      {!selectedExamId && (
        <div className="space-y-4">
          {filteredExams.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 px-6 py-16 text-center">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <BookOpen className="w-7 h-7 text-slate-400" />
              </div>
              <h2 className="text-lg font-bold text-slate-800 m-0">
                {exams.length === 0
                  ? t('examAnswers.noExams', 'No online exams found.')
                  : t('examAnswers.noExamsMatch', 'No exams match your filters.')}
              </h2>
              <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">
                {exams.length === 0
                  ? t(
                      'examAnswers.noExamsHint',
                      'Online exams will appear here once they are created for a class.',
                    )
                  : t('examAnswers.tryClearFilters', 'Try clearing search or subject filters.')}
              </p>
            </div>
          ) : (
            <>
              <div className={`flex items-center justify-between gap-3 ${isArabic ? 'flex-row-reverse' : ''}`}>
                <h2 className={`text-base font-bold text-slate-800 m-0 ${align}`}>
                  {t('examAnswers.pickExamTitle', 'Choose an exam to review')}
                </h2>
                <p className="text-xs text-slate-500 m-0">
                  {t('examAnswers.pickExamHint', 'Select an exam above to view student answers.')}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredExams.map((ex) => {
                  const code = ex.classes?.subjects?.code || '—'
                  const name = getLocalizedName(ex.classes?.subjects, isArabic) || ''
                  const created = ex.created_at ? new Date(ex.created_at).toLocaleDateString() : '—'
                  return (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => selectExam(ex.id)}
                      className={`group text-start bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-[#1a3a6b]/40 hover:shadow-md transition-all ${align}`}
                    >
                      <div className={`flex items-start justify-between gap-3 ${isArabic ? 'flex-row-reverse' : ''}`}>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[#1a3a6b] tracking-wide uppercase">
                            {code}
                          </div>
                          <div className="mt-1 font-bold text-slate-900 text-[15px] leading-snug line-clamp-2">
                            {ex.title || '—'}
                          </div>
                          {name ? (
                            <div className="mt-1 text-sm text-slate-500 truncate">{name}</div>
                          ) : null}
                        </div>
                        {statusPill(ex.status)}
                      </div>
                      <div
                        className={`mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs text-slate-500 ${isArabic ? 'flex-row-reverse' : ''}`}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Award className="w-3.5 h-3.5" />
                          {ex.total_points ?? 0} {t('examAnswers.points', 'pts')}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          {created}
                        </span>
                        <span className="inline-flex items-center gap-1 font-semibold text-[#1a3a6b] opacity-0 group-hover:opacity-100 transition-opacity">
                          {t('examAnswers.open', 'Open')}
                          <ChevronRight className={`w-3.5 h-3.5 ${isArabic ? 'rotate-180' : ''}`} />
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {selectedExamId && detailLoading && (
        <div className="flex items-center justify-center py-16">
          <div className="h-9 w-9 rounded-full border-[3px] border-slate-200 border-t-[#1a3a6b] animate-spin" />
        </div>
      )}

      {selectedExamId && !detailLoading && exam && (
        <>
          <div className="bg-gradient-to-br from-[#1a3a6b] to-[#2a5298] rounded-2xl text-white p-5 sm:p-6 shadow-sm">
            <div className={`flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between ${isArabic ? 'lg:flex-row-reverse' : ''}`}>
              <div className={align}>
                <div className="text-white/70 text-xs font-semibold uppercase tracking-wide">
                  {subjectCode}
                  {subjectName ? ` · ${subjectName}` : ''}
                </div>
                <h2 className="text-xl sm:text-2xl font-bold m-0 mt-1">{exam.title}</h2>
                <div className="mt-2">{statusPill(exam.status)}</div>
              </div>
              <div className={`grid grid-cols-3 gap-3 ${isArabic ? 'text-right' : 'text-left'}`}>
                <div className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm">
                  <div className="flex items-center gap-1.5 text-white/70 text-[11px] font-medium">
                    <FileQuestion className="w-3.5 h-3.5" />
                    {t('examAnswers.questions', 'Questions')}
                  </div>
                  <div className="text-xl font-bold mt-0.5">{questions.length}</div>
                </div>
                <div className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm">
                  <div className="flex items-center gap-1.5 text-white/70 text-[11px] font-medium">
                    <Users className="w-3.5 h-3.5" />
                    {t('examAnswers.attempts', 'Attempts')}
                  </div>
                  <div className="text-xl font-bold mt-0.5">{submissions.length}</div>
                </div>
                <div className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm">
                  <div className="flex items-center gap-1.5 text-white/70 text-[11px] font-medium">
                    <Award className="w-3.5 h-3.5" />
                    {t('examAnswers.points', 'Points')}
                  </div>
                  <div className="text-xl font-bold mt-0.5">{exam.total_points || 0}</div>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => selectExam('')}
              className={`mt-4 inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white ${isArabic ? 'flex-row-reverse' : ''}`}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              {t('examAnswers.changeExam', 'Choose another exam')}
            </button>
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
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <span>
                    {t('examAnswers.students', 'Students')} ({submissions.length})
                  </span>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                    />
                    {t('examAnswers.selectAll', 'Select all')}
                  </label>
                </div>
                {selectedRowKeys.size > 0 && (
                  <button
                    type="button"
                    onClick={() => openReexamModal()}
                    style={{
                      appearance: 'none',
                      border: 'none',
                      background: '#1a3a6b',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: 12,
                      padding: '8px 10px',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    {t('examAnswers.bulkAllowReexam', {
                      defaultValue: 'Allow re-exam ({{n}})',
                      n: selectedRowKeys.size,
                    })}
                  </button>
                )}
              </div>
              <div style={{ maxHeight: '70vh', overflowY: 'auto', background: '#fff' }}>
                {submissions.length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', color: '#6b7a99', fontSize: 13 }}>
                    {t('examAnswers.noEnrolled', 'No enrolled students for this class.')}
                  </div>
                )}
                {submissions.map((s) => {
                  const key = rowKey(s)
                  const active = key === selectedSubmissionId
                  const name =
                    (isArabic ? s.students?.name_ar : s.students?.name_en) ||
                    s.students?.name_en ||
                    '—'
                  const isRetake =
                    !!(s.submission_data?.instructor_retake && s.status === 'EX_DRF')
                  const hasWindow = !!(s.submission_data?.retake_window?.start_at || s.submission_data?.retake_window?.end_at)
                  const noAttempt = !s.id
                  const isDone =
                    s.status === 'EX_GRD' ||
                    s.status === 'EX_SUB' ||
                    (!isRetake &&
                      (s.points_earned != null ||
                        (s.grade != null && s.grade !== '') ||
                        !!s.submitted_at))
                  return (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'stretch',
                        borderBottom: '1px solid #e8edf5',
                        borderInlineStart: active ? '4px solid #1a3a6b' : '4px solid transparent',
                        background: active ? '#e8eef8' : '#ffffff',
                        boxShadow: active ? 'inset 0 0 0 1px #c5d4eb' : 'none',
                      }}
                    >
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '0 8px 0 10px',
                          cursor: 'pointer',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedRowKeys.has(key)}
                          onChange={(e) => toggleRowSelected(key, e.target.checked)}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => selectSubmission(s)}
                        aria-current={active ? 'true' : undefined}
                        style={{
                          display: 'block',
                          flex: 1,
                          textAlign: 'start',
                          padding: '12px 14px 12px 4px',
                          border: 'none',
                          background: 'transparent',
                          color: '#1e2a3a',
                          cursor: 'pointer',
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
                            background: isRetake ? '#fef3c7' : noAttempt ? '#f1f5f9' : isDone ? '#e6f7ef' : '#f1f5f9',
                            color: isRetake ? '#92400e' : noAttempt ? '#64748b' : isDone ? '#166534' : '#475569',
                          }}
                        >
                          {isRetake
                            ? t('examAnswers.reexamShort', 'Re-exam')
                            : noAttempt
                              ? t('examAnswers.noAttemptShort', 'No attempt')
                              : submissionStatusLabel(s.status, t)}
                        </span>
                        {hasWindow && (
                          <span
                            style={{
                              fontWeight: 700,
                              fontSize: 10,
                              padding: '2px 7px',
                              borderRadius: 999,
                              background: '#dbeafe',
                              color: '#1d4ed8',
                            }}
                          >
                            {t('examAnswers.timedWindow', 'Timed')}
                          </span>
                        )}
                        {(s.points_earned ?? s.submission_data?.autoGrade?.points_earned) != null && (
                          <span style={{ fontWeight: 700, color: '#1e2a3a' }}>
                            {s.points_earned ?? s.submission_data?.autoGrade?.points_earned}/{exam.total_points}
                          </span>
                        )}
                      </div>
                      </button>
                    </div>
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
                        {(selectedSubmission.points_earned ??
                          selectedSubmission.submission_data?.autoGrade?.points_earned ??
                          liveAutoGrade?.points_earned) != null
                          ? `${selectedSubmission.points_earned ??
                              selectedSubmission.submission_data?.autoGrade?.points_earned ??
                              liveAutoGrade?.points_earned} / ${exam.total_points}`
                          : '—'}
                        {(selectedSubmission.grade ??
                          selectedSubmission.submission_data?.autoGrade?.percent ??
                          liveAutoGrade?.percent) != null ? (
                          <span style={{ color: 'var(--muted)', fontWeight: 600 }}>
                            {' '}
                            ({selectedSubmission.grade ??
                              selectedSubmission.submission_data?.autoGrade?.percent ??
                              liveAutoGrade?.percent}%)
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
                              'This student may open the exam again during the timed window.',
                            )
                          : t(
                              'examAnswers.reexamPanelHint',
                              'Set a start/end window and duration, then allow this student (or a selection) to re-take the exam. Previous answers stay in history.',
                            )}
                      </div>
                      {selectedSubmission?.submission_data?.retake_window?.start_at && (
                        <div style={{ fontSize: 11, color: '#1d4ed8', marginTop: 6, fontWeight: 600 }}>
                          {t('examAnswers.retakeWindowLabel', 'Window')}:{' '}
                          {new Date(selectedSubmission.submission_data.retake_window.start_at).toLocaleString()}
                          {' → '}
                          {selectedSubmission.submission_data.retake_window.end_at
                            ? new Date(selectedSubmission.submission_data.retake_window.end_at).toLocaleString()
                            : '—'}
                          {selectedSubmission.submission_data.retake_window.duration_minutes
                            ? ` · ${selectedSubmission.submission_data.retake_window.duration_minutes} ${t('examAnswers.minutesShort', 'min')}`
                            : ''}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={reexamBusy || !selectedSubmission?.student_id}
                      onClick={() => openReexamModal([rowKey(selectedSubmission)])}
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

                  {previousAttempts.length > 0 && (
                    <div
                      style={{
                        marginBottom: 16,
                        padding: '12px 14px',
                        borderRadius: 12,
                        border: '1px solid #e2e8f0',
                        background: '#f8fafc',
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>
                        {t('examAnswers.attemptHistory', 'Previous attempts')} ({previousAttempts.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {[...previousAttempts].reverse().map((a, i) => (
                          <div
                            key={i}
                            style={{ fontSize: 12, color: '#475569', display: 'flex', flexWrap: 'wrap', gap: 8 }}
                          >
                            <span style={{ fontWeight: 700 }}>
                              #{previousAttempts.length - i}
                            </span>
                            <span>
                              {a.submitted_at
                                ? new Date(a.submitted_at).toLocaleString()
                                : a.archived_at
                                  ? new Date(a.archived_at).toLocaleString()
                                  : '—'}
                            </span>
                            <span>
                              {(a.points_earned ?? a.autoGrade?.points_earned) != null
                                ? `${a.points_earned ?? a.autoGrade?.points_earned}/${exam.total_points}`
                                : '—'}
                              {(a.grade ?? a.autoGrade?.percent) != null
                                ? ` (${a.grade ?? a.autoGrade?.percent}%)`
                                : ''}
                            </span>
                            <span>{submissionStatusLabel(a.status, t)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

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
                {t('examAnswers.reexamModalTitle', 'Allow timed re-exam')}
              </div>
              <p style={{ fontSize: 14, color: '#6b7a99', margin: '0 0 16px', lineHeight: 1.55 }}>
                {selectedRowKeys.size > 1
                  ? t('examAnswers.reexamBulkConfirm', {
                      defaultValue:
                        'Allow {{n}} selected students to re-take this exam during the window below. Current answers are archived; the latest attempt will drive the gradebook.',
                      n: selectedRowKeys.size,
                    })
                  : t('examAnswers.reexamConfirm', {
                      defaultValue:
                        'Allow {{name}} to re-take this exam during the window below? Current answers and score will be cleared (kept in history). The gradebook cell for this exam type will be cleared until they submit again.',
                      name: selectedStudentName || '—',
                    })}
              </p>
              <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: '#334155' }}>
                  {t('examAnswers.windowStart', 'Window start')}
                  <input
                    type="datetime-local"
                    value={reexamWindowStart}
                    onChange={(e) => setReexamWindowStart(e.target.value)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #dde3ef',
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  />
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: '#334155' }}>
                  {t('examAnswers.windowEnd', 'Window end')}
                  <input
                    type="datetime-local"
                    value={reexamWindowEnd}
                    onChange={(e) => setReexamWindowEnd(e.target.value)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #dde3ef',
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  />
                </label>
                <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 700, color: '#334155' }}>
                  {t('examAnswers.attemptDuration', 'Attempt duration (minutes)')}
                  <input
                    type="number"
                    min={1}
                    value={reexamDuration}
                    onChange={(e) => setReexamDuration(e.target.value)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #dde3ef',
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  />
                </label>
              </div>
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
