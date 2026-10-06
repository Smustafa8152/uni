import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase, SUPABASE_STORAGE_BUCKET } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'

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
  neu: '#4b5563',
  neuBg: '#f3f4f6',
}

export default function StudentSessionHistory() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabic = isRTL || language === 'ar'
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [student, setStudent] = useState(null)
  const [courseOptions, setCourseOptions] = useState([])
  const [courseFilter, setCourseFilter] = useState('')
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!user?.email) return
    const load = async () => {
      try {
        setLoading(true)
        setError('')

        const { data: st, error: stErr } = await supabase
          .from('students')
          .select('id, student_id, name_en, name_ar, email')
          .eq('email', user.email)
          .eq('status', 'active')
          .single()
        if (stErr) throw stErr
        setStudent(st)

        const { data: enrolls, error: eErr } = await supabase
          .from('enrollments')
          .select('class_id, status, classes(id, code, subjects(id, code, name_en, name_ar))')
          .eq('student_id', st.id)
          .eq('status', 'enrolled')
        if (eErr) throw eErr
        const cls = (enrolls || []).map((e) => e.classes).filter(Boolean)
        setCourseOptions(cls)
      } catch (e) {
        console.error('StudentSessionHistory load base error:', e)
        setError(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.email])

  useEffect(() => {
    if (!student?.id) return
    const loadRows = async () => {
      try {
        setLoading(true)
        setError('')

        const { data: enrolls, error: eErr } = await supabase
          .from('enrollments')
          .select('class_id')
          .eq('student_id', student.id)
          .eq('status', 'enrolled')
        if (eErr) throw eErr
        const classIds = [...new Set((enrolls || []).map((e) => e.class_id).filter(Boolean))]
        if (!classIds.length) {
          setRows([])
          return
        }

        const { data: schedules, error: sErr } = await supabase
          .from('class_schedules')
          .select('id, class_id')
          .in('class_id', courseFilter ? [Number(courseFilter)] : classIds)
        if (sErr) throw sErr
        const scheduleIds = (schedules || []).map((s) => s.id)
        if (!scheduleIds.length) {
          setRows([])
          return
        }

        const { data, error: qErr } = await supabase
          .from('elearning_schedule_recordings')
          .select(
            `
            id,
            class_schedule_id,
            session_date,
            title_en,
            title_ar,
            recording_type,
            file_path,
            external_url,
            duration_minutes,
            available_until,
            created_at,
            class_schedules(
              id,
              class_id,
              classes(
                id,
                code,
                subjects(id, code, name_en, name_ar)
              )
            )
          `,
          )
          .in('class_schedule_id', scheduleIds)
          .order('created_at', { ascending: false })
          .limit(200)
        if (qErr) throw qErr
        setRows(data || [])
      } catch (e) {
        console.error('StudentSessionHistory loadRows error:', e)
        setError(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    }
    loadRows()
  }, [student?.id, courseFilter])

  const titleFor = (r) => (isArabic ? r?.title_ar : r?.title_en) || r?.title_ar || r?.title_en || '—'
  const courseNameFor = (cls) => getLocalizedName(cls?.subjects, isArabic) || cls?.subjects?.code || '—'
  const isExpired = (r) => (r?.available_until ? new Date(r.available_until).getTime() < Date.now() : false)

  const prettyDate = useMemo(() => {
    return (x) => (x ? new Date(x).toLocaleDateString(isArabic ? 'ar-SA' : undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' }) : '—')
  }, [isArabic])

  return (
    <div className="space-y-6" dir={isArabic ? 'rtl' : 'ltr'}>
      <nav className="flex flex-wrap items-center gap-2 text-sm" style={{ color: UI.muted }}>
        <Link to="/dashboard" className="hover:underline" style={{ color: UI.muted }}>{t('studentPortal.dashboard', 'Dashboard')}</Link>
        <span style={{ color: UI.bdr }}>›</span>
        <Link to="/student/elearning/sessions" className="hover:underline" style={{ color: UI.muted }}>{t('studentPortal.elearning.teamsSessions', 'Teams sessions')}</Link>
        <span style={{ color: UI.bdr }}>›</span>
        <span className="font-semibold" style={{ color: UI.p }}>{t('studentPortal.elearning.recordings', 'Recordings')}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: UI.p }}>{t('studentPortal.elearning.previousRecordings', 'Previous recordings')}</h1>
          <p className="text-sm" style={{ color: UI.muted }}>{t('studentPortal.elearning.watchDownload', 'Watch and download lecture recordings')}</p>
        </div>
        <select
          className="px-3 py-2 rounded-md border text-sm"
          style={{ borderColor: UI.bdr }}
          value={courseFilter}
          onChange={(e) => setCourseFilter(e.target.value)}
          aria-label={t('studentPortal.elearning.courseFilter', 'Course filter')}
        >
          <option value="">{t('studentPortal.elearning.allCourses', 'All courses')}</option>
          {courseOptions.map((c) => (
            <option key={c.id} value={String(c.id)}>
              {(c?.subjects?.code || c?.code || '—') + ' — ' + (courseNameFor(c) || '—')}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-0 border-b-2 overflow-x-auto" style={{ borderColor: UI.bdr }}>
        <Link to="/student/elearning/sessions" className="px-5 py-2.5 text-sm font-semibold whitespace-nowrap" style={{ color: UI.muted }}>
          🔴 {t('studentPortal.elearning.currentUpcoming', 'Current & upcoming')}
        </Link>
        <Link
          to="/student/elearning/sessions/history"
          className="px-5 py-2.5 text-sm font-extrabold border-b-2 -mb-[2px] whitespace-nowrap"
          style={{ borderColor: UI.p, color: UI.p }}
          aria-current="page"
        >
          📼 {t('studentPortal.elearning.previousRecordings', 'Previous recordings')}
        </Link>
      </div>

      {error && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: '#fecaca', backgroundColor: UI.errBg, color: UI.err }}>
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: UI.bdr }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: UI.p, color: 'white' }}>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.elearning.course', 'Course')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.elearning.sessionTitle', 'Session title')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('common.date', 'Date')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.elearning.duration', 'Duration')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.elearning.status', 'Status')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('common.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center" style={{ color: UI.muted }}>
                    {t('common.loading', 'Loading...')}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center" style={{ color: UI.muted }}>
                    {t('common.noData', 'No data found')}
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const cls = r?.class_schedules?.classes
                  const code = cls?.subjects?.code || cls?.code || '—'
                  const dt = r?.session_date
                  const href =
                    r.recording_type === 'link'
                      ? r.external_url
                      : supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(r.file_path || '').data?.publicUrl
                  const expired = isExpired(r)
                  return (
                    <tr key={r.id} className="border-b hover:bg-slate-50" style={{ borderColor: UI.bdr }}>
                      <td className="px-4 py-3 font-extrabold" dir="ltr">{code}</td>
                      <td className="px-4 py-3">{titleFor(r)}</td>
                      <td className="px-4 py-3">{prettyDate(dt)}</td>
                      <td className="px-4 py-3" dir="ltr">{r.duration_minutes ? `${r.duration_minutes} min` : '—'}</td>
                      <td className="px-4 py-3">
                        {expired ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold" style={{ backgroundColor: UI.neuBg, color: UI.neu }}>
                            {t('studentPortal.elearning.expired', 'Expired')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold" style={{ backgroundColor: UI.okBg, color: UI.ok }}>
                            {t('studentPortal.elearning.available', 'Available')}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {expired || !href ? (
                          <span className="text-xs" style={{ color: UI.muted }}>{t('studentPortal.elearning.notAvailable', 'Not available')}</span>
                        ) : (
                          <div className="flex gap-2">
                            <a className="px-3 py-2 rounded-md text-white text-xs font-extrabold" style={{ backgroundColor: UI.p }} href={href} target="_blank" rel="noreferrer">
                              ▶ {t('studentPortal.elearning.watch', 'Watch')}
                            </a>
                            <a className="px-3 py-2 rounded-md border text-xs font-extrabold" style={{ borderColor: UI.bdr, backgroundColor: UI.bg, color: UI.txt }} href={href} target="_blank" rel="noreferrer">
                              📥
                            </a>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border px-4 py-3 text-sm flex items-start gap-2" style={{ borderColor: '#fde68a', backgroundColor: UI.warnBg, color: UI.warn }}>
        <span>⚠️</span>
        <div>{t('studentPortal.elearning.recordingsWindow', 'Session recordings are available for 30 days only. Please download before expiry.')}</div>
      </div>
    </div>
  )
}

