import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { Loader2, Printer, CheckCircle, XCircle } from 'lucide-react'
import { getLocalizedName } from '../../utils/localizedName'
import PaymentModal from '../../components/payment/PaymentModal'

export default function ApplicantOfferLetter() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const { user } = useAuth()
  const { id } = useParams()
  const applicationId = id ? parseInt(id, 10) : null

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [application, setApplication] = useState(null)
  const [accepting, setAccepting] = useState(false)
  const [showTuitionPayment, setShowTuitionPayment] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!applicationId) {
        setError('Invalid application id')
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      try {
        const { data, error: qErr } = await supabase
          .from('applications')
          .select(
            `
            *,
            majors (name_en, name_ar, code, degree_level),
            semesters (name_en, name_ar, code),
            colleges (name_en, name_ar, code)
          `
          )
          .eq('id', applicationId)
          .single()
        if (qErr) throw qErr

        // Portal ownership check (same email or applicant_user_id)
        const em = (user?.email || '').trim().toLowerCase()
        const appEm = (data?.email || '').trim().toLowerCase()
        const uidOk = data?.applicant_user_id && user?.id && data.applicant_user_id === user.id
        const emailOk = em && appEm && em === appEm
        if (!uidOk && !emailOk) throw new Error(t('track.portalAccessDenied', 'You do not have access to this application.'))

        if (!cancelled) setApplication(data)
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load offer letter')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [applicationId, user?.id, user?.email, t])

  const status = String(application?.status_code || '').toUpperCase()
  const isOfferAvailable = status === 'DCCA' || status === 'DCFA'
  const isFinalAccepted = status === 'DCFA'

  const programName = useMemo(() => {
    if (!application) return '—'
    return getLocalizedName(application.majors, isRTL) || application.majors?.name_en || '—'
  }, [application, isRTL])

  const termName = useMemo(() => {
    if (!application) return '—'
    return getLocalizedName(application.semesters, isRTL) || application.semesters?.name_en || '—'
  }, [application, isRTL])

  const applicantName = useMemo(() => {
    if (!application) return '—'
    const ar = [application.first_name_ar, application.middle_name_ar, application.last_name_ar].filter(Boolean).join(' ').trim()
    const en = [application.first_name, application.middle_name, application.last_name].filter(Boolean).join(' ').trim()
    return (isRTL ? (ar || en) : (en || ar)) || '—'
  }, [application, isRTL])

  const deadline = application?.offer_deadline || application?.created_at
  const deadlineText = deadline ? new Date(deadline).toLocaleDateString(isRTL ? 'ar' : undefined) : '—'
  const hasPaidRegistration = !!application?.registration_fee_paid_at
  const hasPaidTuition = !!application?.tuition_fee_paid_at
  const tuitionAmount = useMemo(() => Number(application?.tuition_fee_amount || 0), [application?.tuition_fee_amount])

  const handlePrint = () => window.print()

  const handleAcceptOffer = async () => {
    if (!applicationId) return
    setAccepting(true)
    setError('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('accept-offer', {
        body: { applicationId },
      })
      if (fnErr) throw fnErr
      if (!data?.success) throw new Error(data?.error || 'Failed to accept offer')
      setApplication((prev) => (prev ? { ...prev, status_code: 'DCFA', status: 'accepted' } : prev))
    } catch (e) {
      setError(e?.message || 'Failed to accept offer')
    } finally {
      setAccepting(false)
    }
  }

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="w-10 h-10 text-[#1a3a6b] animate-spin" />
      </div>
    )
  }

  if (error || !application) {
    return (
      <div className="max-w-3xl mx-auto w-full min-w-0">
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm">{error || '—'}</div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto w-full min-w-0 text-start print:max-w-none" dir={isRTL ? 'rtl' : 'ltr'}>
      <PaymentModal
        isOpen={showTuitionPayment}
        onClose={() => setShowTuitionPayment(false)}
        application={application}
        purpose="tuition"
        onPaymentSuccess={async () => {
          // Refresh application state after payment
          const { data } = await supabase.from('applications').select('*').eq('id', applicationId).single()
          if (data) setApplication(data)
          setShowTuitionPayment(false)
        }}
      />

      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-[#6b7a99] mb-5 print:hidden" aria-label="breadcrumb">
        <Link to="/" className="hover:text-[#1a3a6b] no-underline">
          {t('applicantPortal.breadcrumbHome')}
        </Link>
        <span className="text-[#dde3ef]">/</span>
        <Link to="/portal" className="hover:text-[#1a3a6b] no-underline">
          {t('applicantPortal.breadcrumbPortal')}
        </Link>
        <span className="text-[#dde3ef]">/</span>
        <span className="text-[#1a3a6b] font-semibold">{t('offerLetter.breadcrumb', 'Offer letter')}</span>
      </nav>

      <div className={`flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 print:hidden ${isRTL ? 'sm:flex-row-reverse' : ''}`}>
        <div>
          <h1 className="text-2xl font-extrabold text-[#1a3a6b] mb-1">{t('offerLetter.title', 'Official offer letter')}</h1>
          <p className="text-sm text-[#6b7a99]">{t('offerLetter.subtitle', 'Congratulations! You have been accepted to IBU')}</p>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-[#dde3ef] bg-white hover:bg-[#f4f6fb] text-sm font-bold text-[#1e2a3a]"
        >
          <Printer className="w-4 h-4" />
          {t('offerLetter.print', 'Print / Save as PDF')}
        </button>
      </div>

      {!isOfferAvailable ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-950 px-4 py-3 text-sm">
          {t('offerLetter.notAvailable', 'Offer letter is not available for this application yet.')}
        </div>
      ) : (
        <>
          <div className={`rounded-md border-s-4 px-4 py-3.5 mb-6 text-sm flex items-start gap-2.5 print:hidden ${isRTL ? 'flex-row-reverse' : ''} ${
            hasPaidRegistration ? 'bg-[#e6f7ef] text-[#1a7a4a] border-[#1a7a4a]' : 'bg-[#fef3c7] text-[#92400e] border-[#b45309]'
          }`}>
            {hasPaidRegistration ? <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" /> : <XCircle className="w-5 h-5 shrink-0 mt-0.5" />}
            <div className="min-w-0">
              <div className="font-bold">
                {hasPaidRegistration
                  ? t('offerLetter.paidOk', 'Registration fee received. You can accept the offer.')
                  : t('offerLetter.payFirst', 'Please pay the registration fee before accepting the offer.')}
              </div>
              <div className="text-xs mt-1 opacity-90">
                {t('offerLetter.applicationNumber', 'Application #')}: <span className="font-mono font-bold">{application.application_number}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
            <div className="rounded-[10px] border-2 border-[#1a7a4a] bg-white shadow-sm p-6">
              <div className="text-center pb-5 border-b border-[#dde3ef] mb-6">
                <div className="w-20 h-20 rounded-xl bg-[#f4f6fb] border border-[#dde3ef] mx-auto mb-3 flex items-center justify-center font-extrabold text-[#1a3a6b]">
                  IBU
                </div>
                <div className="text-xl font-extrabold text-[#1a3a6b]">{t('offerLetter.universityName', 'IBU University')}</div>
                <div className="text-sm text-[#6b7a99]">{t('offerLetter.official', 'Official offer letter')}</div>
              </div>

              <div className="text-sm leading-8 text-[#1e2a3a]">
                <p>{t('offerLetter.opening', 'We are pleased to inform you that you have been accepted.')}</p>
                <div className={`mt-4 rounded-[10px] bg-[#f4f6fb] border border-[#dde3ef] p-5 ${isRTL ? 'border-r-4 border-r-[#1a7a4a]' : 'border-l-4 border-l-[#1a7a4a]'}`}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-[#6b7a99]">{t('offerLetter.studentName', 'Name')}</div>
                      <div className="font-bold">{applicantName}</div>
                    </div>
                    <div>
                      <div className="text-[#6b7a99]">{t('offerLetter.applicationNumber', 'Application #')}</div>
                      <div className="font-mono font-bold">{application.application_number}</div>
                    </div>
                    <div>
                      <div className="text-[#6b7a99]">{t('offerLetter.program', 'Program')}</div>
                      <div className="font-bold">{programName}</div>
                    </div>
                    <div>
                      <div className="text-[#6b7a99]">{t('offerLetter.term', 'Term')}</div>
                      <div className="font-bold">{termName}</div>
                    </div>
                    <div>
                      <div className="text-[#6b7a99]">{t('offerLetter.offerType', 'Offer type')}</div>
                      <div className="font-bold">{isFinalAccepted ? t('offerLetter.fullOffer', 'Final acceptance') : t('offerLetter.conditionalOffer', 'Conditional acceptance')}</div>
                    </div>
                    <div>
                      <div className="text-[#6b7a99]">{t('offerLetter.deadline', 'Deadline')}</div>
                      <div className="font-bold text-red-700">{deadlineText}</div>
                    </div>
                  </div>
                </div>
                <p className="mt-4">{t('offerLetter.closing', 'We look forward to welcoming you at IBU.')}</p>
              </div>
            </div>

            <div className="space-y-6 print:hidden">
              <div className="rounded-[10px] border border-[#dde3ef] bg-white shadow-sm p-6">
                <div className="font-bold text-[#1a3a6b] mb-3">{t('offerLetter.nextSteps', 'Next steps')}</div>
                <ol className="space-y-3 text-sm text-[#1e2a3a]">
                  <li><span className="font-bold">1)</span> {t('offerLetter.stepAccept', 'Accept the offer')}</li>
                  <li><span className="font-bold">2)</span> {t('offerLetter.stepPayTuition', 'Pay the tuition fee')}</li>
                  <li><span className="font-bold">3)</span> {t('offerLetter.stepStudentId', 'Your student record will be created automatically')}</li>
                </ol>
                <div className="mt-4 grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTuitionPayment(true)}
                    disabled={!hasPaidRegistration || hasPaidTuition || !Number.isFinite(tuitionAmount) || tuitionAmount <= 0}
                    className="w-full py-2.5 px-4 rounded-md border border-[#dde3ef] bg-white hover:bg-[#f4f6fb] font-extrabold text-[#1e2a3a] disabled:opacity-60"
                  >
                    {hasPaidTuition
                      ? t('offerLetter.tuitionPaid', 'Tuition paid')
                      : t('offerLetter.payTuition', 'Pay tuition fee')}
                  </button>
                  <button
                    type="button"
                    onClick={handleAcceptOffer}
                    disabled={!hasPaidRegistration || !hasPaidTuition || accepting || isFinalAccepted}
                    className="w-full py-2.5 px-4 rounded-md bg-[#1a7a4a] hover:bg-[#16663f] text-white font-extrabold disabled:opacity-60"
                  >
                    {isFinalAccepted
                      ? t('offerLetter.acceptedFinal', 'Accepted (Final)')
                      : accepting
                        ? t('offerLetter.accepting', 'Accepting…')
                        : t('offerLetter.acceptOffer', 'Accept offer')}
                  </button>
                  <Link
                    to={`/portal/applications/${applicationId}`}
                    className="w-full py-2.5 px-4 rounded-md border border-[#dde3ef] bg-white hover:bg-[#f4f6fb] text-center font-extrabold text-[#1e2a3a] no-underline"
                  >
                    {t('offerLetter.backToApplication', 'Back to application')}
                  </Link>
                </div>
                {isFinalAccepted && (
                  <div className="mt-4 text-xs text-[#6b7a99]">
                    {t('offerLetter.studentLoginHint', 'You can now log in as a student using the same email and password.')}
                    {' '}
                    <Link to="/login/student" className="text-[#1a3a6b] font-bold hover:underline no-underline">
                      {t('offerLetter.loginStudent', 'Student login')}
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

