import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ExternalLink, GraduationCap, Video } from 'lucide-react'
import { getApplicantReasonMeta, getApplicantStatus } from '../../utils/applicationStatusDisplay'

const NEW_APPLICATION = new Set(['DCRJ', 'ENCA', 'ENCU', 'ACWD'])

export function applicantHasNextStep(code) {
  const info = getApplicantStatus(code)
  return info.view === 'action' || Boolean(info.action) || Boolean(getApplicantReasonMeta(code))
}

function whenText(value, zone, isRTL) {
  if (!value) return ''
  const when = new Date(value).toLocaleString(isRTL ? 'ar-u-nu-latn' : 'en-GB')
  return zone ? `${when} (${zone})` : when
}

/**
 * One card for a status that needs the applicant to act, or that carries a message for them.
 * Plain "in review" statuses return nothing.
 */
export default function ApplicantNextStep({ application, isRTL, portal = true, onPage = false, onPay, audience = 'applicant' }) {
  const { t, i18n } = useTranslation()
  if (!application || !applicantHasNextStep(application.status_code)) return null

  const code = String(application.status_code || '').toUpperCase()
  const info = getApplicantStatus(code)
  const hintKey = `${info.labelKey}Hint`
  const hint = i18n.exists(hintKey) ? t(hintKey) : ''
  const needsAction = info.view === 'action' || Boolean(info.action)
  const id = application.id

  const reasonMeta = getApplicantReasonMeta(code)
  const reasonCode = String(application.status_reason_code || '').toUpperCase()
  const groups = reasonMeta?.group
    ? [reasonMeta.group, reasonMeta.group === 'reject' ? 'requestInfo' : 'reject']
    : ['reject', 'requestInfo']
  const reasonKey = reasonCode
    ? groups.map((group) => `admissions.statusReasons.${group}.${reasonCode}`).find((key) => i18n.exists(key))
    : ''
  const reasonLabel = reasonKey ? t(reasonKey) : ''
  const reasonNotes = String(application.review_notes || '').trim()
  const showReason = Boolean(reasonMeta && (reasonLabel || reasonNotes))

  const studentView = audience === 'student'
  const statusPath = studentView
    ? `/student/applications/${id}`
    : portal
      ? `/portal/applications/${id}`
      : `/application-status/${id}`
  let button = null
  if (info.action === 'draft') {
    button = studentView
      ? { label: t('track.applicant.continueApplication'), to: statusPath }
      : { label: t('track.applicant.continueApplication'), to: portal ? '/portal/apply' : '/apply' }
  } else if (info.action === 'documents') {
    button = onPage
      ? { label: t('track.applicant.goToDocuments'), href: '#status-documents-panel' }
      : { label: t('track.applicant.goToDocuments'), to: `${statusPath}#status-documents-panel` }
  } else if (info.action === 'applicationFee') {
    button = { label: t('track.applicant.payApplicationFee'), to: `/apply/payment-result?application=${id}&retry=1` }
  } else if (info.action === 'payment') {
    button = onPay
      ? { label: t('track.payRegistrationFee'), onClick: onPay }
      : { label: t('track.payRegistrationFee'), to: `${statusPath}?pay=1` }
  } else if (info.action === 'offer') {
    button = studentView
      ? { label: t('track.applicant.viewOffer'), to: `/student/applications/${id}/offer-letter` }
      : portal
        ? { label: t('track.applicant.viewOffer'), to: `/portal/applications/${id}/offer-letter` }
        : { label: t('track.applicant.viewOffer'), to: '/login/applicant' }
  } else if (info.action === 'enrollment') {
    button = { label: t('track.loginToStudentPortal'), to: '/login/student' }
  } else if (portal && !studentView && NEW_APPLICATION.has(code)) {
    button = { label: t('track.applicant.startNew'), to: '/portal/apply' }
  }

  const shell =
    info.tone === 'rejected'
      ? 'border-rose-200 bg-rose-50'
      : info.tone === 'accepted'
        ? 'border-emerald-200 bg-emerald-50'
        : info.tone === 'action' || info.tone === 'waitlist'
          ? 'border-amber-300 bg-amber-50'
          : 'border-blue-200 bg-blue-50'
  const titleColor =
    info.tone === 'rejected'
      ? 'text-rose-900'
      : info.tone === 'accepted'
        ? 'text-emerald-900'
        : info.tone === 'action' || info.tone === 'waitlist'
          ? 'text-amber-950'
          : 'text-blue-950'

  const controlClass =
    'inline-flex items-center justify-center rounded-lg bg-[#1a3a6b] px-4 py-2.5 text-sm font-bold text-white no-underline hover:bg-[#2a5298]'

  return (
    <section className={`rounded-2xl border px-4 py-4 sm:px-5 ${shell}`}>
      <p className={`text-xs font-bold ${titleColor}`}>
        {needsAction ? t('track.applicant.nextStep') : t('track.applicant.updateForYou')}
      </p>
      <h3 className="mt-1 text-base font-extrabold text-[#1e2a3a]">{t(info.labelKey)}</h3>
      {hint && <p className="mt-1 text-sm leading-relaxed text-[#3d4d66]">{hint}</p>}
      {showReason && (
        <div className="mt-3 rounded-xl bg-white/80 px-3 py-2.5">
          <p className="text-xs font-bold text-[#1a3a6b]">{t(`track.reason.${reasonMeta.kind}`)}</p>
          {reasonLabel && <p className="mt-1 text-sm font-semibold text-[#1e2a3a]">{reasonLabel}</p>}
          {reasonNotes && reasonNotes !== reasonLabel && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-[#3d4d66]">{reasonNotes}</p>
          )}
        </div>
      )}
      {button && (
        <div className="mt-4 flex">
          {button.to ? (
            <Link to={button.to} className={controlClass}>
              {button.label}
            </Link>
          ) : button.href ? (
            <a
              href={button.href}
              className={controlClass}
              {...(button.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {button.label}
            </a>
          ) : (
            <button type="button" onClick={button.onClick} className={controlClass}>
              {button.label}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function httpUrl(value) {
  const text = String(value || '').trim()
  return /^https?:\/\//i.test(text) ? text : ''
}

/** Interview and entrance-exam links, shown whenever admissions has saved them. */
export function ApplicantSessionLinks({ application, isRTL }) {
  const { t } = useTranslation()
  if (!application) return null

  const meetingUrl = httpUrl(application.interview_meeting_url)
  const examRaw = String(application.exam_location_or_link || '').trim()
  const examUrl = httpUrl(examRaw)
  const interviewWhen = whenText(application.interview_at, application.interview_timezone, isRTL)
  const examWhen = whenText(application.exam_at, application.exam_timezone, isRTL)
  const interviewNotes = String(application.interview_instructions || '').trim()
  const examNotes = String(application.exam_instructions || '').trim()
  const showInterview = Boolean(meetingUrl || interviewWhen || interviewNotes)
  const showExam = Boolean(examUrl || examRaw || examWhen || examNotes)
  if (!showInterview && !showExam) return null

  const buttonClass =
    'mt-3 inline-flex items-center justify-center gap-2 rounded-lg bg-[#1a3a6b] px-4 py-2.5 text-sm font-bold text-white no-underline hover:bg-[#2a5298]'

  return (
    <div className="space-y-3">
      {showInterview && (
        <section className="rounded-2xl border border-[#dde3ef] bg-white px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <Video className="mt-0.5 h-5 w-5 shrink-0 text-[#1a3a6b]" />
            <div className="min-w-0 flex-1 text-start">
              <p className="font-extrabold text-[#1a3a6b]">{t('admissions.interview.portalTitle', 'Admission interview')}</p>
              {interviewWhen && (
                <p className="mt-1 text-sm text-[#3d4d66]">
                  <span className="font-semibold">{t('admissions.interview.when', 'When')}: </span>
                  <span dir="ltr">{interviewWhen}</span>
                </p>
              )}
              {interviewNotes && <p className="mt-1 whitespace-pre-wrap text-sm text-[#3d4d66]">{interviewNotes}</p>}
              {meetingUrl && (
                <a href={meetingUrl} target="_blank" rel="noopener noreferrer" className={buttonClass}>
                  <Video className="h-4 w-4" />
                  {t('track.applicant.joinInterview', 'Join interview')}
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </section>
      )}
      {showExam && (
        <section className="rounded-2xl border border-[#dde3ef] bg-white px-4 py-4 sm:px-5">
          <div className="flex items-start gap-3">
            <GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-[#1a3a6b]" />
            <div className="min-w-0 flex-1 text-start">
              <p className="font-extrabold text-[#1a3a6b]">{t('admissions.exam.portalTitle', 'Entrance exam')}</p>
              {examWhen && (
                <p className="mt-1 text-sm text-[#3d4d66]">
                  <span className="font-semibold">{t('admissions.exam.when', 'When')}: </span>
                  <span dir="ltr">{examWhen}</span>
                </p>
              )}
              {examRaw && !examUrl && (
                <p className="mt-1 text-sm text-[#3d4d66]">
                  <span className="font-semibold">{t('admissions.exam.location', 'Location')}: </span>
                  {examRaw}
                </p>
              )}
              {examNotes && <p className="mt-1 whitespace-pre-wrap text-sm text-[#3d4d66]">{examNotes}</p>}
              {examUrl && (
                <a href={examUrl} target="_blank" rel="noopener noreferrer" className={buttonClass}>
                  <GraduationCap className="h-4 w-4" />
                  {t('track.applicant.openExam', 'Open the test')}
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
