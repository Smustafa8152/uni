import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'
import {
  APPLICANT_PHASES,
  applicantStatusClass,
  getApplicantReasonMeta,
  getApplicantStatus,
} from '../../utils/applicationStatusDisplay'
import ApplicantNextStep, { applicantHasNextStep } from '../../components/applicant/ApplicantNextStep'
import { FilePlus2, ChevronRight, Loader2 } from 'lucide-react'

const CLOSED_CODES = new Set(['DCRJ', 'ENCA', 'ENCU', 'ACWD'])

function phaseIndex(code) {
  const idx = APPLICANT_PHASES.indexOf(getApplicantStatus(code).phase)
  return idx < 0 ? 0 : idx
}

export default function ApplicantDashboard() {
  const { t, i18n } = useTranslation()
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
            status_reason_code,
            review_notes,
            interview_at,
            interview_timezone,
            interview_meeting_url,
            interview_instructions,
            exam_at,
            exam_timezone,
            exam_location_or_link,
            exam_instructions,
            created_at,
            majors!major_id (name_en, name_ar),
            colleges!college_id (name_en, name_ar),
            semesters (name_en, name_ar)
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
  const active = rows.find((r) => !CLOSED_CODES.has(String(r.status_code || '').toUpperCase())) || rows[0] || null
  const others = active ? rows.filter((r) => r.id !== active.id) : []

  const showNext = Boolean(active && applicantHasNextStep(active.status_code))
  const activeStatus = getApplicantStatus(active?.status_code)
  const hintKey = `${activeStatus.labelKey}Hint`
  const statusHint = active && i18n.exists(hintKey) ? t(hintKey) : ''

  const reason = useMemo(() => {
    if (!active) return null
    const meta = getApplicantReasonMeta(active.status_code)
    if (!meta) return null
    const reasonCode = String(active.status_reason_code || '').toUpperCase()
    const groups = meta.group
      ? [meta.group, meta.group === 'reject' ? 'requestInfo' : 'reject']
      : ['reject', 'requestInfo']
    const reasonKey = reasonCode
      ? groups.map((group) => `admissions.statusReasons.${group}.${reasonCode}`).find((key) => i18n.exists(key))
      : ''
    const label = reasonKey ? t(reasonKey) : ''
    const notes = String(active.review_notes || '').trim()
    if (!label && !notes) return null
    return { meta, label, notes }
  }, [active, i18n, t])

  const steps = useMemo(() => {
    if (!active) return []
    const current = phaseIndex(active.status_code)
    return APPLICANT_PHASES.map((phase, idx) => {
      let state = 'pending'
      if (idx < current) state = 'done'
      else if (idx === current) state = activeStatus.view === 'outcome' ? activeStatus.tone : 'current'
      return { key: phase, state, title: t(`track.steps.${phase}`) }
    })
  }, [active, activeStatus.view, activeStatus.tone, t])

  const formatDate = (value) =>
    value
      ? new Date(value).toLocaleDateString(isRTL ? 'ar-u-nu-latn' : 'en-GB', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : '—'

  return (
    <div className="max-w-5xl mx-auto" dir={isRTL ? 'rtl' : 'ltr'}>
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-[#6b7a99] mb-5">
        <Link to="/" className="hover:text-[#1a3a6b] no-underline">
          {t('applicantPortal.breadcrumbHome')}
        </Link>
        <span className="text-[#dde3ef]">/</span>
        <span className="text-[#1a3a6b] font-semibold">{t('applicantPortal.breadcrumbPortal')}</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
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
      ) : !active ? (
        <div className="rounded-2xl border border-[#dde3ef] bg-white shadow-sm p-10 text-center">
          <p className="text-[#6b7a99] mb-4">{t('applicantPortal.emptyList')}</p>
          <Link
            to="/portal/apply"
            className="inline-flex items-center gap-2 text-[#1a3a6b] font-bold hover:underline"
          >
            {t('applicantPortal.startFirst')}
            <ChevronRight className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} />
          </Link>
        </div>
      ) : (
        <>
          <section className="rounded-2xl border border-[#dde3ef] bg-white shadow-sm overflow-hidden">
            <header className="px-5 sm:px-7 py-5 border-b border-[#dde3ef] bg-[#f7f9fd] flex flex-col sm:flex-row sm:items-start gap-4 sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7a99]">
                  {t('applicantPortal.activeTitle')}
                </p>
                <h3 className="font-mono text-xl sm:text-2xl font-extrabold text-[#1a3a6b] mt-1">
                  {active.application_number}
                </h3>
              </div>
              <span
                className={`inline-flex items-center self-start px-3 py-1.5 rounded-full text-sm font-bold border ${applicantStatusClass(activeStatus)}`}
              >
                {t(activeStatus.labelKey)}
              </span>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-[#dde3ef] border-b border-[#dde3ef]">
              <div className="bg-white px-5 sm:px-7 py-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7a99]">
                  {t('applicantPortal.stat.program')}
                </p>
                <p className="mt-1 text-sm font-bold text-[#1a3a6b] leading-snug">
                  {getLocalizedName(active.majors, isRTL) || active.majors?.name_en || '—'}
                </p>
              </div>
              <div className="bg-white px-5 sm:px-7 py-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7a99]">
                  {t('applicantApplySelect.collegeLabel')}
                </p>
                <p className="mt-1 text-sm font-bold text-[#1a3a6b] leading-snug">
                  {getLocalizedName(active.colleges, isRTL) || active.colleges?.name_en || '—'}
                </p>
              </div>
              <div className="bg-white px-5 sm:px-7 py-4">
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#6b7a99]">
                  {t('applicantPortal.submittedOn')}
                </p>
                <p className="mt-1 text-sm font-bold text-[#1a3a6b]">{formatDate(active.created_at)}</p>
                {active.semesters && (
                  <p className="mt-0.5 text-xs text-[#6b7a99]">
                    {getLocalizedName(active.semesters, isRTL) || active.semesters?.name_en}
                  </p>
                )}
              </div>
            </div>

            <div className="px-5 sm:px-7 py-6">
              {showNext && (
                <div className="mb-6">
                  <ApplicantNextStep application={active} isRTL={isRTL} portal />
                </div>
              )}
              <p className="text-xs font-bold uppercase tracking-wide text-[#6b7a99] mb-4">
                {t('track.stagesTitle')}
              </p>
              <ol aria-label={t('track.stagesTitle')}>
                {steps.map((step, idx) => {
                  const failed = step.state === 'rejected'
                  const accepted = step.state === 'accepted'
                  const waiting = step.state === 'waitlist'
                  const done = step.state === 'done' || accepted
                  const current = step.state === 'current' || failed || waiting
                  const upcoming = step.state === 'pending'
                  const mark = failed ? '!' : done ? '✓' : String(idx + 1)
                  const bubble = failed
                    ? 'bg-rose-600 text-white ring-4 ring-rose-100'
                    : accepted
                      ? 'bg-emerald-600 text-white ring-4 ring-emerald-100'
                      : current
                        ? 'bg-[#1a3a6b] text-white ring-4 ring-[#d9e3f5]'
                        : done
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white text-[#8b98b0] border border-[#dde3ef]'
                  const copyKey = upcoming
                    ? `track.flow.${step.key}Wait`
                    : current
                      ? `track.flow.${step.key}Now`
                      : `track.flow.${step.key}Done`
                  const detail = (current || accepted) && statusHint && !showNext ? statusHint : t(copyKey)
                  const badge = current || accepted
                    ? t('track.flow.youAreHere')
                    : done
                      ? t('track.flow.completed')
                      : t('track.flow.upcoming')
                  return (
                    <li key={step.key} className="relative ps-12 pb-6 last:pb-0" aria-current={current ? 'step' : undefined}>
                      {idx < steps.length - 1 && (
                        <span
                          className={`absolute top-8 bottom-0 w-0.5 start-[15px] ${done ? 'bg-emerald-400' : 'bg-[#e6ebf4]'}`}
                          aria-hidden
                        />
                      )}
                      <span
                        className={`absolute top-0 start-0 z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${bubble}`}
                      >
                        {mark}
                      </span>
                      <div className="min-w-0 pt-1">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className={`text-[15px] ${upcoming ? 'font-semibold text-[#8b98b0]' : 'font-bold text-[#1e2a3a]'}`}>
                            {step.title}
                          </p>
                          <span
                            className={`shrink-0 text-[11px] font-semibold ${
                              failed ? 'text-rose-700' : upcoming ? 'text-[#a8b3c7]' : 'text-[#6b7a99]'
                            }`}
                          >
                            {badge}
                          </span>
                        </div>
                        <p className={`mt-1 text-sm leading-relaxed ${failed ? 'text-rose-800' : upcoming ? 'text-[#a8b3c7]' : 'text-[#4b5b78]'}`}>
                          {detail}
                        </p>
                        {current && reason && !showNext && (
                          <div
                            className={`mt-3 rounded-xl border px-4 py-3 ${
                              failed
                                ? 'border-rose-200 bg-rose-50'
                                : reason.meta.kind === 'conditions'
                                  ? 'border-blue-200 bg-blue-50'
                                  : 'border-amber-200 bg-amber-50'
                            }`}
                          >
                            <p
                              className={`text-xs font-bold ${
                                failed ? 'text-rose-800' : reason.meta.kind === 'conditions' ? 'text-blue-900' : 'text-amber-950'
                              }`}
                            >
                              {t(`track.reason.${reason.meta.kind}`)}
                            </p>
                            {reason.label && <p className="mt-1 text-sm font-semibold text-[#1e2a3a]">{reason.label}</p>}
                            {reason.notes && reason.notes !== reason.label && (
                              <p className="mt-1 whitespace-pre-wrap text-sm text-[#3d4d66]">{reason.notes}</p>
                            )}
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>

              <div className="mt-6 flex justify-end">
                <Link
                  to={`/portal/applications/${active.id}`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1a3a6b] text-white text-sm font-bold no-underline hover:bg-[#2a5298]"
                >
                  {t('applicantPortal.viewApplication')}
                  <ChevronRight className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} />
                </Link>
              </div>
            </div>
          </section>

          {others.length > 0 && (
            <section className="mt-6 rounded-2xl border border-[#dde3ef] bg-white shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-[#dde3ef]">
                <h3 className="text-base font-bold text-[#1a3a6b]">{t('applicantPortal.otherApplications')}</h3>
              </div>
              <ul className="divide-y divide-[#dde3ef]">
                {others.map((r) => (
                  <li key={r.id}>
                    <Link
                      to={`/portal/applications/${r.id}`}
                      className="flex items-center gap-3 px-5 py-4 hover:bg-[#f0f4fb] no-underline text-inherit"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-mono font-bold text-[#1a3a6b]">{r.application_number}</div>
                        <div className="text-xs text-[#6b7a99] truncate">
                          {getLocalizedName(r.majors, isRTL) || r.majors?.name_en || '—'} · {formatDate(r.created_at)}
                        </div>
                      </div>
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${applicantStatusClass(
                          getApplicantStatus(r.status_code)
                        )}`}
                      >
                        {t(getApplicantStatus(r.status_code).labelKey)}
                      </span>
                      <ChevronRight className={`w-5 h-5 text-[#6b7a99] shrink-0 ${isRTL ? 'rotate-180' : ''}`} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
