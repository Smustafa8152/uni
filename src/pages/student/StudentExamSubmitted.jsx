import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'
import { mergeAssessmentSettings, RESULT_VISIBILITY, canShowReviewField } from '../../utils/assessmentSettings'

const UI = {
  p: '#1a3a6b',
  bg: '#f4f6fb',
  sur: '#ffffff',
  bdr: '#dde3ef',
  txt: '#1e2a3a',
  muted: '#6b7a99',
  ok: '#1a7a4a',
  okBg: '#e6f7ef',
  info: '#1d4ed8',
  infoBg: '#dbeafe',
}

function fmtDateTime(dt, isArabic) {
  if (!dt) return '—'
  const d = new Date(dt)
  return d.toLocaleString(isArabic ? 'ar' : 'en', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function StudentExamSubmitted() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabic = isRTL || language === 'ar'
  const { user } = useAuth()
  const { examId } = useParams()

  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(null)
  const [exam, setExam] = useState(null)
  const [submission, setSubmission] = useState(null)

  useEffect(() => {
    if (!user?.email || !examId) return
    const load = async () => {
      setLoading(true)
      try {
        const { data: st } = await supabase
          .from('students')
          .select('id, email')
          .eq('email', user.email)
          .eq('status', 'active')
          .single()
        setStudent(st)

        const { data: ex } = await supabase
          .from('subject_exams')
          .select('id, class_id, title, title_ar, scheduled_date, start_time, total_points, assessment_settings, classes(id, subjects(id, code, name_en, name_ar))')
          .eq('id', Number(examId))
          .single()
        setExam(ex)

        const { data: sub } = await supabase
          .from('exam_submissions')
          .select('id, exam_id, status, submitted_at, started_at, points_earned, grade, submission_data')
          .eq('exam_id', Number(examId))
          .eq('student_id', st.id)
          .maybeSingle()
        setSubmission(sub || null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.email, examId])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-slate-600 border-t-transparent" />
      </div>
    )
  }

  const code = exam?.classes?.subjects?.code || '—'
  const courseName = getLocalizedName(exam?.classes?.subjects, isArabic) || '—'
  const title = (isArabic ? exam?.title_ar : exam?.title) || exam?.title || '—'
  const answered = submission?.submission_data?.answers ? Object.keys(submission.submission_data.answers).length : 0
  const settings = mergeAssessmentSettings(exam?.assessment_settings)
  const showScore =
    settings.result_visibility === RESULT_VISIBILITY.IMMEDIATE &&
    canShowReviewField(settings, 'immediately_after', 'marks') &&
    submission?.points_earned != null
  const durationMin =
    submission?.started_at && submission?.submitted_at
      ? Math.round((new Date(submission.submitted_at) - new Date(submission.started_at)) / 60000)
      : null

  return (
    <div dir={isArabic ? 'rtl' : 'ltr'} className="max-w-2xl mx-auto py-10">
      <nav className="flex flex-wrap items-center gap-2 text-sm mb-6" style={{ color: UI.muted }}>
        <Link to="/dashboard" style={{ color: UI.muted }} className="hover:underline">
          {t('studentPortal.dashboard', 'Dashboard')}
        </Link>
        <span style={{ color: UI.bdr }}>›</span>
        <Link to="/student/elearning/exams" style={{ color: UI.muted }} className="hover:underline">
          {t('studentPortal.elearning.exams', 'Exams')}
        </Link>
        <span style={{ color: UI.bdr }}>›</span>
        <span className="font-semibold" style={{ color: UI.p }}>
          {t('studentPortal.elearning.submissionConfirmation', 'Submission confirmation')}
        </span>
      </nav>

      <div className="text-center">
        <div className="w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center text-5xl" style={{ background: UI.okBg, border: `3px solid ${UI.ok}` }}>
          ✅
        </div>
        <h1 className="text-2xl font-extrabold mb-2" style={{ color: UI.ok }}>
          {t('studentPortal.elearning.examSubmitted', 'Exam submitted successfully!')}
        </h1>
        <p className="text-sm mb-7" style={{ color: UI.muted }}>
          {code} — {courseName} — {title}
        </p>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-6 mb-4" style={{ borderColor: UI.bdr }}>
        <div className="flex items-center justify-between pb-4 mb-4 border-b" style={{ borderColor: UI.bdr }}>
          <div className="font-extrabold" style={{ color: UI.p }}>
            📋 {t('studentPortal.elearning.examSummary', 'Exam summary')}
          </div>
        </div>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: UI.bdr }}>
            <span style={{ color: UI.muted }}>{t('studentPortal.elearning.submissionId', 'Submission ID')}</span>
            <strong>#{submission?.id ?? '—'}</strong>
          </div>
          <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: UI.bdr }}>
            <span style={{ color: UI.muted }}>{t('studentPortal.elearning.submittedAt', 'Submitted at')}</span>
            <strong>{fmtDateTime(submission?.submitted_at, isArabic)}</strong>
          </div>
          <div className="flex items-center justify-between py-2 border-b" style={{ borderColor: UI.bdr }}>
            <span style={{ color: UI.muted }}>{t('studentPortal.elearning.answered', 'Answered')}</span>
            <strong>{answered}</strong>
          </div>
          <div className="flex items-center justify-between py-2">
            <span style={{ color: UI.muted }}>{t('studentPortal.elearning.status', 'Status')}</span>
            <span className="px-3 py-1 rounded-full text-xs font-extrabold" style={{ background: UI.okBg, color: UI.ok }}>
              {submission?.status === 'EX_GRD' ? t('studentPortal.elearning.graded', 'Graded') : t('studentPortal.elearning.submitted', 'Submitted')}
            </span>
          </div>
          {showScore && (
            <>
              <div className="flex items-center justify-between py-2 border-t" style={{ borderColor: UI.bdr }}>
                <span style={{ color: UI.muted }}>{t('studentPortal.elearning.score', 'Score')}</span>
                <strong>{submission.points_earned}/{exam?.total_points} ({submission.grade}%)</strong>
              </div>
              {durationMin != null && (
                <div className="flex items-center justify-between py-2">
                  <span style={{ color: UI.muted }}>{t('studentPortal.elearning.duration', 'Duration')}</span>
                  <strong>{durationMin} {t('studentPortal.elearning.minutes', 'min')}</strong>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {!showScore && (
      <div className="rounded-lg px-4 py-3 border-r-4 flex gap-3 items-start mb-4" style={{ background: UI.infoBg, color: UI.info, borderColor: UI.info }}>
        <span>ℹ️</span>
        <div className="text-sm">
          {t('studentPortal.elearning.resultsInfo', 'Your result will appear after it is released by the instructor. You will receive a notification when published.')}
        </div>
      </div>
      )}

      <div className="flex flex-wrap gap-3 justify-center">
        <Link to="/student/elearning/exams" className="px-6 py-2.5 rounded-md font-extrabold text-white" style={{ background: UI.p }}>
          ← {t('studentPortal.elearning.backToExams', 'Back to exams')}
        </Link>
        <Link to="/student/my-grades" className="px-5 py-2.5 rounded-md border font-bold" style={{ borderColor: UI.bdr, color: UI.txt, background: UI.bg }}>
          📊 {t('studentPortal.elearning.gradesPage', 'Grades page')}
        </Link>
        <Link to="/dashboard" className="px-5 py-2.5 rounded-md border font-bold" style={{ borderColor: UI.bdr, color: UI.txt, background: UI.bg }}>
          🏠 {t('studentPortal.elearning.dashboard', 'Dashboard')}
        </Link>
      </div>
    </div>
  )
}

