import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'
import { isExamEnterableForStudent, isExamSubmissionComplete, canStudentAttemptExam } from '../../utils/subjectExamDateTime'

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

function fmtDate(d, isArabic) {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString(isArabic ? 'ar' : 'en', { year: 'numeric', month: 'long', day: 'numeric' })
}

function fmtTime(t) {
  if (!t) return ''
  return String(t).slice(0, 5)
}

function pct(n, d) {
  const dd = Number(d) || 0
  if (!dd) return 0
  return Math.round((Number(n || 0) / dd) * 100)
}

function msUntil(exam) {
  try {
    const dt = new Date(`${exam.scheduled_date}T${exam.start_time}`)
    return dt.getTime() - Date.now()
  } catch {
    return null
  }
}

function countdown(ms) {
  const m = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(m / 3600)
  const mm = Math.floor((m % 3600) / 60)
  const ss = m % 60
  const pad = (x) => String(x).padStart(2, '0')
  return `${pad(h)}:${pad(mm)}:${pad(ss)}`
}

export default function StudentELearningExams() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabic = isRTL || language === 'ar'
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(null)
  const [rows, setRows] = useState([])
  const [tab, setTab] = useState('upcoming')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      setLoading(true)
      try {
        const { data: sid, error: sidErr } = await supabase.rpc('current_student_id')
        if (sidErr) throw sidErr
        if (!sid) {
          setStudent(null)
          setRows([])
          return
        }

        const { data: st, error: stErr } = await supabase
          .from('students')
          .select('id, name_en, name_ar, email, status')
          .eq('id', sid)
          .single()
        if (stErr) throw stErr
        setStudent(st || null)

        const { data: exams, error } = await supabase
          .from('subject_exams')
          .select(
            `
            id, class_id, subject_id, title, title_ar, exam_type, status,
            scheduled_date, start_time, end_time, duration_minutes, total_points, weight_percentage,
            allow_calculator, allow_notes, assessment_settings,
            classes(id, section, subjects(id, code, name_en, name_ar))
          `
          )
          .in('status', ['EX_SCH', 'EX_OPN', 'EX_CLS', 'EX_REL'])
          .order('scheduled_date', { ascending: true })
        if (error) throw error

        const examIds = (exams || []).map((x) => x.id)

        // Best-effort: flip due scheduled exams to open so RLS/UI stay consistent
        await Promise.all(
          (exams || [])
            .filter((x) => x.status === 'EX_SCH')
            .map(async (x) => {
              const { data } = await supabase.rpc('sync_subject_exam_window_status', { p_exam_id: x.id })
              if (data && data !== x.status) x.status = data
            }),
        )

        const { data: subs } = await supabase
          .from('exam_submissions')
          .select('id, exam_id, status, points_earned, grade, submitted_at, submission_data')
          .eq('student_id', sid)
          .in('exam_id', examIds)

        const merged = (exams || []).map((ex) => ({
          ...ex,
          submission: (subs || []).find((s) => s.exam_id === ex.id) || null,
        }))
        setRows(merged)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  const computed = useMemo(() => {
    const isDoneForStudent = (x) => isExamSubmissionComplete(x.submission)
    const upcoming = rows.filter(
      (x) =>
        (x.status === 'EX_SCH' || x.status === 'EX_OPN') && !isDoneForStudent(x),
    )
    const completed = rows.filter(
      (x) => x.status === 'EX_CLS' || x.status === 'EX_REL' || isDoneForStudent(x),
    )
    const graded = rows.filter((x) => x.submission?.points_earned != null)

    const avg = graded.length
      ? Math.round(
          graded.reduce((sum, x) => sum + pct(x.submission.points_earned, x.total_points || 100), 0) / graded.length
        )
      : 0
    const highest = graded.length
      ? Math.max(...graded.map((x) => pct(x.submission.points_earned, x.total_points || 100)))
      : 0
    return { upcoming, completed, avg, highest }
  }, [rows, tick])

  const list = tab === 'completed' ? computed.completed : computed.upcoming

  const topReminder = computed.upcoming
    .filter((x) => x.status === 'EX_SCH')
    .sort((a, b) => (msUntil(a) ?? 1e18) - (msUntil(b) ?? 1e18))[0]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-slate-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div dir={isArabic ? 'rtl' : 'ltr'} className="space-y-6">
      <nav className="flex flex-wrap items-center gap-2 text-sm" style={{ color: UI.muted }}>
        <Link to="/dashboard" className="hover:underline" style={{ color: UI.muted }}>
          {t('studentPortal.dashboard', 'Dashboard')}
        </Link>
        <span style={{ color: UI.bdr }}>›</span>
        <span className="font-semibold" style={{ color: UI.p }}>
          {t('studentPortal.elearning.exams', 'Exams')}
        </span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: UI.p }}>
            {t('studentPortal.elearning.exams', 'Online exams')}
          </h1>
          <p className="text-sm" style={{ color: UI.muted }}>
            {t('studentPortal.elearning.thisSemester', 'This semester')}
          </p>
        </div>
      </div>

      {topReminder && (
        <div className="rounded-lg px-4 py-3 border-r-4 flex gap-3 items-start" style={{ background: UI.warnBg, color: UI.warn, borderColor: UI.warn }}>
          <span>⏰</span>
          <div className="text-sm">
            <strong>{t('studentPortal.elearning.reminder', 'Reminder')}:</strong>{' '}
            {t('studentPortal.elearning.examTomorrowHint', {
              defaultValue: '{{code}} — {{title}} starts soon. Make sure your device is ready.',
              code: topReminder?.classes?.subjects?.code || '—',
              title: (isArabic ? topReminder?.title_ar : topReminder?.title) || topReminder?.title || '—',
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border shadow-sm px-5 py-4" style={{ borderColor: UI.bdr, borderTop: `3px solid ${UI.info}` }}>
          <div className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: UI.muted }}>
            {t('studentPortal.elearning.upcomingExams', 'Upcoming exams')}
          </div>
          <div className="text-3xl font-extrabold" style={{ color: UI.p }}>
            {computed.upcoming.length}
          </div>
          <div className="text-xs" style={{ color: UI.muted }}>
            {t('studentPortal.elearning.thisSemester', 'This semester')}
          </div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm px-5 py-4" style={{ borderColor: UI.bdr, borderTop: `3px solid ${UI.ok}` }}>
          <div className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: UI.muted }}>
            {t('studentPortal.elearning.completedExams', 'Completed exams')}
          </div>
          <div className="text-3xl font-extrabold" style={{ color: UI.p }}>
            {computed.completed.length}
          </div>
          <div className="text-xs" style={{ color: UI.muted }}>
            {t('studentPortal.elearning.resultsPublished', 'Results published')}
          </div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm px-5 py-4" style={{ borderColor: UI.bdr, borderTop: `3px solid ${UI.acc}` }}>
          <div className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: UI.muted }}>
            {t('studentPortal.elearning.avgGrade', 'Average grade')}
          </div>
          <div className="text-3xl font-extrabold" style={{ color: UI.p }}>
            {computed.avg}%
          </div>
          <div className="text-xs" style={{ color: UI.muted }}>
            {t('studentPortal.elearning.thisSemester', 'This semester')}
          </div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm px-5 py-4" style={{ borderColor: UI.bdr, borderTop: `3px solid ${UI.warn}` }}>
          <div className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: UI.muted }}>
            {t('studentPortal.elearning.highestGrade', 'Highest grade')}
          </div>
          <div className="text-3xl font-extrabold" style={{ color: UI.p }}>
            {computed.highest}%
          </div>
          <div className="text-xs" style={{ color: UI.muted }}>
            {t('studentPortal.elearning.bestThisSemester', 'Best this semester')}
          </div>
        </div>
      </div>

      <div className="flex gap-0 border-b-2 overflow-x-auto" style={{ borderColor: UI.bdr }}>
        <button
          type="button"
          className="px-5 py-2 text-sm font-bold border-b-2 -mb-[2px]"
          style={{ borderColor: tab === 'upcoming' ? UI.p : 'transparent', color: tab === 'upcoming' ? UI.p : UI.muted }}
          onClick={() => setTab('upcoming')}
        >
          📋 {t('studentPortal.elearning.upcomingRunning', 'Upcoming & running')}
        </button>
        <button
          type="button"
          className="px-5 py-2 text-sm font-bold border-b-2 -mb-[2px]"
          style={{ borderColor: tab === 'completed' ? UI.p : 'transparent', color: tab === 'completed' ? UI.p : UI.muted }}
          onClick={() => setTab('completed')}
        >
          ✅ {t('studentPortal.elearning.completedResults', 'Completed & results')}
        </button>
      </div>

      <div className="space-y-4">
        {list.map((ex) => {
          const code = ex?.classes?.subjects?.code || '—'
          const courseName = getLocalizedName(ex?.classes?.subjects, isArabic) || '—'
          const title = (isArabic ? ex.title_ar : ex.title) || ex.title || '—'
          const start = fmtTime(ex.start_time)
          const end = fmtTime(ex.end_time)
          const soonMs = msUntil(ex)
          const isTomorrow = soonMs != null && soonMs < 24 * 60 * 60 * 1000 && soonMs > 0
          const alreadySubmitted = isExamSubmissionComplete(ex.submission)
          const canEnter = canStudentAttemptExam(ex, ex.submission)
          const canViewResult = alreadySubmitted && !canEnter

          const accent = canEnter ? UI.info : alreadySubmitted ? UI.ok : isTomorrow ? UI.err : UI.warn
          const accentBg = canEnter ? UI.infoBg : alreadySubmitted ? UI.okBg : isTomorrow ? UI.errBg : UI.warnBg

          return (
            <div key={ex.id} className="bg-white rounded-xl border shadow-sm p-6" style={{ borderColor: UI.bdr, borderRight: `4px solid ${accent}` }}>
              <div className="flex flex-wrap items-start gap-4">
                <div className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl" style={{ backgroundColor: accentBg }}>
                  📋
                </div>
                <div className="flex-1 min-w-[260px]">
                  <div className="text-xs font-extrabold uppercase tracking-wide" style={{ color: accent }}>
                    {code} — {courseName}
                  </div>
                  <div className="text-lg font-extrabold" style={{ color: UI.txt }}>
                    {title}
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm mt-2" style={{ color: UI.muted }}>
                    <span>📅 {fmtDate(ex.scheduled_date, isArabic)}</span>
                    <span>🕐 {start} – {end}</span>
                    <span>⏱️ {ex.duration_minutes || 0} {t('studentPortal.elearning.minutes', 'minutes')}</span>
                    <span>📊 {ex.total_points || 0} {t('studentPortal.elearning.points', 'points')}</span>
                  </div>

                  <div className="flex gap-2 flex-wrap mt-4">
                    {canEnter ? (
                      <button type="button" className="px-5 py-2 rounded-md font-extrabold text-white" style={{ backgroundColor: UI.p }} onClick={() => navigate(`/student/elearning/exams/${ex.id}`)}>
                        📋 {t('studentPortal.elearning.enterExam', 'Enter exam')}
                      </button>
                    ) : canViewResult ? (
                      <button type="button" className="px-5 py-2 rounded-md font-extrabold text-white" style={{ backgroundColor: UI.ok }} onClick={() => navigate(`/student/elearning/exams/${ex.id}/submitted`)}>
                        ✅ {t('studentPortal.elearning.viewSubmission', 'View submission')}
                      </button>
                    ) : (
                      <button type="button" className="px-4 py-2 rounded-md border font-bold text-sm" style={{ borderColor: UI.p, color: UI.p }} onClick={() => navigate(`/student/elearning/exams/${ex.id}`)}>
                        📋 {t('studentPortal.elearning.examDetails', 'Exam details')}
                      </button>
                    )}
                  </div>
                </div>

                <div className="text-center">
                  <span className="inline-flex px-3 py-1 rounded-full text-xs font-extrabold" style={{ backgroundColor: canEnter ? UI.infoBg : alreadySubmitted ? UI.okBg : UI.bdr, color: canEnter ? UI.info : alreadySubmitted ? UI.ok : UI.txt }}>
                    {alreadySubmitted
                      ? t('studentPortal.elearning.submitted', 'Submitted')
                      : canEnter
                        ? t('studentPortal.elearning.open', 'Open')
                        : ex.status === 'EX_SCH'
                          ? t('studentPortal.elearning.scheduled', 'Scheduled')
                          : ex.status === 'EX_REL'
                            ? t('studentPortal.elearning.resultsReleased', 'Results released')
                            : ex.status === 'EX_OPN'
                              ? t('studentPortal.elearning.open', 'Open')
                              : t('studentPortal.elearning.closed', 'Closed')}
                  </span>
                  {isTomorrow && (
                    <>
                      <div className="text-xs mt-2" style={{ color: UI.muted }}>
                        {t('studentPortal.elearning.startsIn', 'Starts in')}
                      </div>
                      <div className="text-xl font-extrabold" style={{ color: UI.err }}>
                        {countdown(soonMs)}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {list.length === 0 && (
          <div className="bg-white rounded-xl border p-6 text-sm" style={{ borderColor: UI.bdr, color: UI.muted }}>
            <p>{t('studentPortal.elearning.noExamsYet', 'No published exams for your enrolled courses yet.')}</p>
            <p style={{ marginTop: 8, fontSize: 12 }}>
              {t('studentPortal.elearning.noExamsHint', 'Exams appear here after your instructor publishes them (scheduled or open). Draft exams are not visible.')}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

