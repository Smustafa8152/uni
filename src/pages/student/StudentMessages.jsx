import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'
import ApplicationMessagesPanel from '../../components/admissions/ApplicationMessagesPanel'
import { Loader2, MessageSquare, Video, GraduationCap } from 'lucide-react'

const UI = {
  p: '#1a3a6b',
  acc: '#c8a84b',
  bg: '#f4f6fb',
  sur: '#ffffff',
  bdr: '#dde3ef',
  muted: '#6b7a99',
}

/**
 * Student portal: admissions messages + interview/exam details for applications
 * linked to this student's email.
 */
export default function StudentMessages() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabic = isRTL || language === 'ar'
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [applications, setApplications] = useState([])
  const [selectedId, setSelectedId] = useState(null)

  useEffect(() => {
    if (!user?.email && !user?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const em = (user.email || '').trim()
        let q = supabase
          .from('applications')
          .select(
            `
            id,
            application_number,
            status_code,
            email,
            college_id,
            interview_at,
            interview_timezone,
            interview_meeting_url,
            interview_instructions,
            exam_at,
            exam_timezone,
            exam_location_or_link,
            exam_instructions,
            majors (name_en, name_ar),
            colleges (name_en, name_ar)
          `,
          )
          .order('created_at', { ascending: false })

        if (user.id && em) {
          q = q.or(`applicant_user_id.eq.${user.id},email.eq.${em}`)
        } else if (user.id) {
          q = q.eq('applicant_user_id', user.id)
        } else {
          q = q.eq('email', em)
        }

        const { data, error: qErr } = await q
        if (qErr) throw qErr
        if (cancelled) return
        const rows = data || []
        setApplications(rows)
        setSelectedId((prev) => prev || rows[0]?.id || null)
      } catch (e) {
        if (!cancelled) setError(e?.message || t('studentPortal.messages.loadFailed', 'Failed to load messages'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.email, user?.id, t])

  const selected = useMemo(
    () => applications.find((a) => a.id === selectedId) || null,
    [applications, selectedId],
  )

  return (
    <div className="max-w-5xl mx-auto w-full" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold" style={{ color: UI.p }}>
          {t('studentPortal.messages.title', 'Messages & admissions updates')}
        </h1>
        <p className="text-sm mt-1" style={{ color: UI.muted }}>
          {t(
            'studentPortal.messages.subtitle',
            'View messages from admissions, reply, and see interview or exam details for your applications.',
          )}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm py-12 justify-center" style={{ color: UI.muted }}>
          <Loader2 className="w-5 h-5 animate-spin" />
          {t('common.loading', 'Loading…')}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>
      ) : applications.length === 0 ? (
        <div
          className="rounded-2xl border p-8 text-center"
          style={{ backgroundColor: UI.sur, borderColor: UI.bdr }}
        >
          <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-40" style={{ color: UI.p }} />
          <p className="font-semibold" style={{ color: UI.p }}>
            {t('studentPortal.messages.emptyTitle', 'No admission applications found')}
          </p>
          <p className="text-sm mt-2" style={{ color: UI.muted }}>
            {t(
              'studentPortal.messages.emptyHint',
              'Messages appear here when admissions contacts you about an application linked to this email. You can also use the applicant portal.',
            )}
          </p>
          <Link
            to="/portal"
            className="inline-block mt-4 text-sm font-bold underline"
            style={{ color: UI.p }}
          >
            {t('studentPortal.messages.openApplicantPortal', 'Open applicant portal')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-4">
          <aside
            className="rounded-2xl border p-3 h-fit"
            style={{ backgroundColor: UI.sur, borderColor: UI.bdr }}
          >
            <p className="text-[10px] font-extrabold uppercase tracking-wider px-2 mb-2" style={{ color: UI.muted }}>
              {t('studentPortal.messages.yourApplications', 'Your applications')}
            </p>
            <ul className="space-y-1">
              {applications.map((app) => {
                const active = app.id === selectedId
                return (
                  <li key={app.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(app.id)}
                      className={`w-full text-start rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors ${
                        active ? 'text-[#1a3a6b]' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                      style={active ? { backgroundColor: UI.acc } : undefined}
                    >
                      <div className="font-mono text-xs opacity-80">{app.application_number}</div>
                      <div className="truncate">
                        {getLocalizedName(app.majors, isArabic) ||
                          getLocalizedName(app.colleges, isArabic) ||
                          app.status_code}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          <div className="space-y-4 min-w-0">
            {selected && (selected.interview_at || selected.interview_meeting_url) && (
              <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
                <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <Video className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">{t('admissions.interview.portalTitle', 'Admission interview')}</p>
                    {selected.interview_at && (
                      <p>
                        {new Date(selected.interview_at).toLocaleString(isArabic ? 'ar' : undefined)}
                        {selected.interview_timezone ? ` (${selected.interview_timezone})` : ''}
                      </p>
                    )}
                    {selected.interview_meeting_url && (
                      <a
                        href={selected.interview_meeting_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold underline"
                      >
                        {t('admissions.interview.joinMeeting', 'Join meeting')}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {selected && (selected.exam_at || selected.exam_location_or_link) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <GraduationCap className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">{t('admissions.exam.portalTitle', 'Entrance exam / admission test')}</p>
                    {selected.exam_at && (
                      <p>{new Date(selected.exam_at).toLocaleString(isArabic ? 'ar' : undefined)}</p>
                    )}
                    {selected.exam_location_or_link && <p>{selected.exam_location_or_link}</p>}
                  </div>
                </div>
              </div>
            )}

            {selected && (
              <ApplicationMessagesPanel
                application={selected}
                mode="applicant"
                isArabicLayout={isArabic}
                alignStart={isArabic ? 'text-right' : 'text-left'}
                iconRow={isArabic ? 'flex-row-reverse' : 'flex-row'}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
