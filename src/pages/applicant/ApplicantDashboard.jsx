import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'
import { FilePlus2, ListChecks, AlertTriangle, ChevronRight, Loader2 } from 'lucide-react'

function statusBadgeClass(code) {
  const c = (code || '').toUpperCase()
  if (['DCCA', 'DCFA', 'ENCF', 'ENAC', 'APPC'].includes(c)) return 'bg-emerald-50 text-emerald-800 border-emerald-200'
  if (['DCRJ', 'APIV'].includes(c)) return 'bg-red-50 text-red-800 border-red-200'
  if (['APPN', 'RVRI', 'RVHL'].includes(c)) return 'bg-amber-50 text-amber-900 border-amber-200'
  if (['RVIN', 'RVQU', 'RVDV'].includes(c)) return 'bg-blue-50 text-blue-800 border-blue-200'
  return 'bg-slate-50 text-slate-700 border-slate-200'
}

export default function ApplicantDashboard() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user?.id || !user?.email) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      try {
        const em = user.email.trim()
        const { data, error: qErr } = await supabase
          .from('applications')
          .select(
            `
            id,
            application_number,
            status_code,
            created_at,
            majors (name_en, name_ar),
            colleges (name_en, name_ar)
          `
          )
          .or(`applicant_user_id.eq.${user.id},email.eq.${em}`)
          .order('created_at', { ascending: false })

        if (qErr) throw qErr
        if (!cancelled) setRows(data || [])
      } catch (e) {
        if (!cancelled) setError(e.message || t('applicantPortal.loadFailed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user?.id, user?.email, t])

  const displayName = user?.user_metadata?.name || user?.email?.split('@')[0] || '—'
  const latest = rows[0]
  const openDocHint = rows.some(
    (r) => r.status_code === 'RVRI' || r.status_code === 'APPN' || r.status_code === 'APDR'
  )

  return (
    <div className="max-w-5xl mx-auto" dir={isRTL ? 'rtl' : 'ltr'}>
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-[#6b7a99] mb-5">
        <Link to="/" className="hover:text-[#1a3a6b] no-underline">
          {t('applicantPortal.breadcrumbHome')}
        </Link>
        <span className="text-[#dde3ef]">/</span>
        <span className="text-[#1a3a6b] font-semibold">{t('applicantPortal.breadcrumbPortal')}</span>
      </nav>

      <div className={`flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8 ${isRTL ? 'sm:flex-row-reverse' : ''}`}>
        <div>
          <h2 className="text-2xl md:text-3xl font-extrabold text-[#1a3a6b] mb-1">
            {t('applicantPortal.welcome', { name: displayName })}
          </h2>
          <p className="text-sm text-[#6b7a99]">{t('applicantPortal.welcomeSub')}</p>
        </div>
        <Link
          to="/portal/apply"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#1a3a6b] text-white text-sm font-bold shadow hover:bg-[#2a5298] no-underline shrink-0"
        >
          <FilePlus2 className="w-4 h-4" />
          {t('applicantPortal.newApplication')}
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-10 h-10 text-[#1a3a6b] animate-spin" />
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">{error}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="rounded-xl border border-[#dde3ef] border-t-4 border-t-[#c8a84b] bg-white p-5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#6b7a99] mb-1">
                {t('applicantPortal.stat.status')}
              </div>
              <div className={`text-sm font-bold truncate ${latest ? 'text-[#1a3a6b]' : 'text-[#6b7a99]'}`}>
                {latest?.status_code || '—'}
              </div>
              <div className="text-xs text-[#6b7a99] mt-1 font-mono truncate">
                {latest?.application_number || t('applicantPortal.stat.noApplication')}
              </div>
            </div>
            <div className="rounded-xl border border-[#dde3ef] border-t-4 border-t-emerald-600 bg-white p-5 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#6b7a99] mb-1">
                {t('applicantPortal.stat.applications')}
              </div>
              <div className="text-3xl font-extrabold text-[#1a3a6b]">{rows.length}</div>
              <div className="text-xs text-[#6b7a99] mt-1">{t('applicantPortal.stat.totalSubmitted')}</div>
            </div>
            <div className="rounded-xl border border-[#dde3ef] border-t-4 border-t-amber-500 bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-2">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#6b7a99] mb-1">
                {t('applicantPortal.stat.program')}
              </div>
              <div className="text-base font-bold text-[#1a3a6b] truncate">
                {latest ? getLocalizedName(latest.majors, isRTL) || latest.majors?.name_en || '—' : '—'}
              </div>
              <div className="text-xs text-[#6b7a99] mt-1 truncate">
                {latest ? getLocalizedName(latest.colleges, isRTL) || latest.colleges?.name_en : ''}
              </div>
            </div>
          </div>

          {openDocHint && (
            <div
              className={`rounded-lg border border-amber-200 bg-amber-50 text-amber-950 px-4 py-3 text-sm mb-6 flex gap-2 items-start ${
                isRTL ? 'flex-row-reverse' : ''
              }`}
            >
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{t('applicantPortal.documentsHint')}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-xl border border-[#dde3ef] bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-[#dde3ef] flex items-center justify-between">
                <h3 className="text-base font-bold text-[#1a3a6b]">{t('applicantPortal.myApplications')}</h3>
              </div>
              {rows.length === 0 ? (
                <div className="p-8 text-center text-[#6b7a99] text-sm">
                  <p className="mb-4">{t('applicantPortal.emptyList')}</p>
                  <Link
                    to="/portal/apply"
                    className="inline-flex items-center gap-2 text-[#1a3a6b] font-bold hover:underline"
                  >
                    {t('applicantPortal.startFirst')}
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-[#dde3ef]">
                  {rows.map((r) => (
                    <li key={r.id}>
                      <Link
                        to={`/portal/applications/${r.id}`}
                        className={`flex items-center gap-3 px-5 py-4 hover:bg-[#f0f4fb] no-underline text-inherit ${
                          isRTL ? 'flex-row-reverse' : ''
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-mono font-bold text-[#1a3a6b]">{r.application_number}</div>
                          <div className="text-xs text-[#6b7a99] truncate">
                            {getLocalizedName(r.majors, isRTL) || r.majors?.name_en || '—'} ·{' '}
                            {r.created_at
                              ? new Date(r.created_at).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : ''}
                          </div>
                        </div>
                        <span
                          className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${statusBadgeClass(
                            r.status_code
                          )}`}
                        >
                          {r.status_code}
                        </span>
                        <ChevronRight className={`w-5 h-5 text-[#6b7a99] shrink-0 ${isRTL ? 'rotate-180' : ''}`} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-[#dde3ef] bg-white shadow-sm p-5 h-fit">
              <h3 className="text-base font-bold text-[#1a3a6b] mb-3">{t('applicantPortal.quickActions')}</h3>
              <div className="flex flex-col gap-2">
                <Link
                  to="/portal/apply"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[#dde3ef] bg-[#f4f6fb] text-sm font-semibold text-[#1e2a3a] hover:bg-[#dde3ef] no-underline"
                >
                  <FilePlus2 className="w-4 h-4" />
                  {t('applicantPortal.nav.newApplication')}
                </Link>
                <Link
                  to="/application-status"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[#dde3ef] bg-[#f4f6fb] text-sm font-semibold text-[#1e2a3a] hover:bg-[#dde3ef] no-underline"
                >
                  <ListChecks className="w-4 h-4" />
                  {t('applicantPortal.nav.trackPublic')}
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
