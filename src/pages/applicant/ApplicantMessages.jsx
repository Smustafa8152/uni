import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'
import ApplicationMessagesPanel from '../../components/admissions/ApplicationMessagesPanel'
import { Loader2, MessageSquare, Video, GraduationCap } from 'lucide-react'

/** Applicant portal: messages for own applications */
export default function ApplicantMessages() {
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

        if (user.id && em) q = q.or(`applicant_user_id.eq.${user.id},email.eq.${em}`)
        else if (user.id) q = q.eq('applicant_user_id', user.id)
        else q = q.eq('email', em)

        const { data, error: qErr } = await q
        if (qErr) throw qErr
        if (cancelled) return
        const rows = data || []
        setApplications(rows)
        setSelectedId((prev) => prev || rows[0]?.id || null)
      } catch (e) {
        if (!cancelled) setError(e?.message || t('applicantPortal.messages.loadFailed', 'Failed to load messages'))
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
        <h1 className="text-2xl md:text-3xl font-extrabold text-[#1a3a6b] mb-1">
          {t('applicantPortal.messages.title', 'Messages')}
        </h1>
        <p className="text-sm text-[#6b7a99]">
          {t(
            'applicantPortal.messages.subtitle',
            'Messages from admissions about your applications. Replies are saved on your file.',
          )}
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 justify-center py-12 text-sm text-[#6b7a99]">
          <Loader2 className="w-5 h-5 animate-spin" />
          {t('common.loading', 'Loading…')}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">{error}</div>
      ) : applications.length === 0 ? (
        <div className="rounded-2xl border border-[#dde3ef] bg-white p-8 text-center">
          <MessageSquare className="w-10 h-10 mx-auto mb-3 text-[#1a3a6b]/40" />
          <p className="font-semibold text-[#1a3a6b]">
            {t('applicantPortal.messages.empty', 'No applications yet')}
          </p>
          <Link to="/portal/apply" className="inline-block mt-3 text-sm font-bold text-[#1a3a6b] underline">
            {t('applicantPortal.newApplication', 'New application')}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)] gap-4">
          <aside className="rounded-2xl border border-[#dde3ef] bg-white p-3 h-fit">
            <ul className="space-y-1">
              {applications.map((app) => (
                <li key={app.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(app.id)}
                    className={`w-full text-start rounded-lg px-3 py-2.5 text-sm font-semibold ${
                      app.id === selectedId ? 'bg-[#c8a84b] text-[#1a3a6b]' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-mono text-xs opacity-80">{app.application_number}</div>
                    <div className="truncate">
                      {getLocalizedName(app.majors, isArabic) || app.status_code}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
          <div className="space-y-4 min-w-0">
            {selected?.interview_meeting_url || selected?.interview_at ? (
              <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm">
                <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <Video className="w-5 h-5 shrink-0" />
                  <div>
                    <p className="font-bold">{t('admissions.interview.portalTitle', 'Admission interview')}</p>
                    {selected.interview_meeting_url && (
                      <a href={selected.interview_meeting_url} target="_blank" rel="noreferrer" className="underline font-semibold">
                        {t('admissions.interview.joinMeeting', 'Join meeting')}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
            {selected?.exam_at || selected?.exam_location_or_link ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <GraduationCap className="w-5 h-5 shrink-0" />
                  <div>
                    <p className="font-bold">{t('admissions.exam.portalTitle', 'Entrance exam / admission test')}</p>
                    {selected.exam_location_or_link && <p>{selected.exam_location_or_link}</p>}
                  </div>
                </div>
              </div>
            ) : null}
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
