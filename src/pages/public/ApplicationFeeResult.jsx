import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle, Copy } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { confirmApplicationFeePayment, formatApplicationFee, listApplicationFeeMethods, startApplicationFeeCheckout } from '../../utils/applicationFee'
import BankTransferPanel, { PaymentChannelChoice } from '../../components/payment/BankTransferPanel'
import { listBankTransfers } from '../../utils/bankTransferProof'

export default function ApplicationFeeResult() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const applicationId = params.get('application')
  const paymentId = params.get('paymentId') || params.get('paymentid') || ''
  const [state, setState] = useState('checking')
  const [error, setError] = useState('')
  const [application, setApplication] = useState(null)
  const [methods, setMethods] = useState([])
  const [payingId, setPayingId] = useState(null)
  const [channel, setChannel] = useState(null)

  useEffect(() => {
    async function run() {
      if (!applicationId && !paymentId) {
        setState('unpaid')
        return
      }
      try {
        if (paymentId) {
          const result = await confirmApplicationFeePayment(supabase, { paymentId, applicationId })
          if (result?.paid) {
            setApplication(result.application || null)
            setState('paid')
            return
          }
        }
        if (!applicationId) {
          setState('unpaid')
          return
        }
        const listed = await listApplicationFeeMethods(supabase, { applicationId: Number(applicationId) })
        if (listed?.alreadyPaid) {
          setApplication(listed.application || null)
          setState('paid')
          return
        }
        setApplication(listed?.application || null)
        setMethods(listed?.methods || [])
        const proofs = await listBankTransfers(supabase, Number(applicationId)).catch(() => [])
        const waiting = proofs.some((row) => row.fee_kind === 'application' && row.status === 'submitted')
        setState(waiting ? 'proof' : 'choose')
      } catch (err) {
        setError(err?.message || '')
        setState('unpaid')
      }
    }
    run()
  }, [applicationId, paymentId])

  const payWith = async (methodId) => {
    if (!applicationId) return
    setPayingId(methodId)
    setError('')
    try {
      const result = await startApplicationFeeCheckout(supabase, {
        applicationId: Number(applicationId),
        language,
        paymentMethodId: methodId,
      })
      if (result?.alreadyPaid) {
        setApplication(result.application || application)
        setState('paid')
        setPayingId(null)
      }
    } catch (err) {
      setError(err?.message || t('registerApplication.paymentUnpaidHint'))
      setPayingId(null)
    }
  }

  const amount = application
    ? formatApplicationFee(application.application_fee_amount, application.application_fee_currency || 'USD')
    : ''
  const showChoices = (state === 'choose' || state === 'unpaid') && Boolean(applicationId)
  const paid = state === 'paid'

  const copyApplicationNumber = () => {
    if (!application?.application_number) return
    navigator.clipboard.writeText(application.application_number)
    alert(t('registerApplication.success.copied'))
  }

  const openPortal = () => {
    if (user && application?.id) {
      navigate(`/portal/applications/${application.id}`)
      return
    }
    navigate('/login/applicant', {
      state: {
        from: application?.id ? `/portal/applications/${application.id}` : '/portal',
        email: application?.email || '',
      },
    })
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f6fb] p-4"
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{ fontFamily: "'Cairo', system-ui, sans-serif" }}
    >
      <div className="pointer-events-none absolute -start-24 top-0 h-72 w-72 rounded-full bg-[#1a3a6b]/10 blur-3xl" />
      <div className="pointer-events-none absolute -end-16 bottom-10 h-72 w-72 rounded-full bg-[#c8a84b]/20 blur-3xl" />
      <div className={`relative w-full rounded-3xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-900/5 md:p-10 ${channel === 'bank' ? 'max-w-xl' : 'max-w-lg'}`}>
        {state === 'checking' ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#1a3a6b] border-t-transparent" />
            <p className="text-sm text-slate-500">{t('registerApplication.paymentChecking')}</p>
          </div>
        ) : paid ? (
          <div className="text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-100">
              <CheckCircle className="h-7 w-7 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">{t('registerApplication.paymentPaid')}</h1>
            <p className="mt-2 text-sm text-slate-500">{t('registerApplication.paymentPaidHint')}</p>

            {application?.application_number && (
              <div className="mt-6 rounded-2xl bg-[#1a3a6b] px-5 py-5 text-white">
                <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{t('registerApplication.success.appNumberLabel')}</p>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <p className="font-mono text-2xl font-bold tracking-wide" dir="ltr">{application.application_number}</p>
                  <button type="button" onClick={copyApplicationNumber} className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white" title={t('registerApplication.success.copied')}>
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                {(amount || application.application_fee_reference) && (
                  <p className="mt-3 text-sm text-white/80" dir="ltr">
                    {[amount, application.application_fee_reference].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-start">
              <h3 className="text-sm font-bold text-slate-900">{t('registerApplication.success.nextTitle')}</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {['step1', 'step2', 'step3'].map((k) => (
                  <li key={k} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8a84b]" />
                    <span>{t(`registerApplication.success.${k}`)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex justify-center">
              <button
                type="button"
                onClick={openPortal}
                className="rounded-xl bg-[#1a3a6b] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#1a3a6b]/20 transition hover:bg-[#152f56]"
              >
                {user
                  ? t('applicantPortal.viewApplication', 'View application')
                  : t('registerApplication.success.signInPortal')}
              </button>
            </div>
          </div>
        ) : state === 'proof' ? (
          <div className="text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-100">
              <CheckCircle className="h-7 w-7 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">{t('payments.bank.submitted')}</h1>
            {application?.application_number && (
              <p className="mt-4 font-mono text-lg font-bold text-[#1a3a6b]" dir="ltr">{application.application_number}</p>
            )}
            <div className="mt-6 flex justify-center">
              <button type="button" onClick={openPortal} className="rounded-xl bg-[#1a3a6b] px-6 py-3 text-sm font-bold text-white">
                {user ? t('applicantPortal.viewApplication', 'View application') : t('registerApplication.success.signInPortal')}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              {showChoices ? t('registerApplication.chooseMethod') : t('registerApplication.paymentUnpaid')}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {showChoices ? t('registerApplication.chooseMethodHint') : t('registerApplication.paymentUnpaidHint')}
            </p>
            {application?.application_number && (
              <p className="mt-4 font-mono text-lg font-bold text-[#1a3a6b]" dir="ltr">{application.application_number}</p>
            )}
            {amount && <p className="mt-1 text-sm font-semibold text-slate-700" dir="ltr">{amount}</p>}
            {showChoices && channel == null && (
              <div className="mt-5 text-start">
                <PaymentChannelChoice isRTL={isRTL} onOnline={() => setChannel('online')} onBank={() => setChannel('bank')} />
              </div>
            )}
            {showChoices && channel === 'bank' && applicationId && (
              <div className="mt-5 text-start">
                <button type="button" onClick={() => setChannel(null)} className="mb-3 text-sm font-semibold text-[#1a3a6b]">
                  {t('payments.bank.back')}
                </button>
                <BankTransferPanel
                  applicationId={Number(applicationId)}
                  feeKind="application"
                  amount={application?.application_fee_amount}
                  currency={application?.application_fee_currency || 'USD'}
                  isRTL={isRTL}
                  onSubmitted={() => setState('proof')}
                />
              </div>
            )}
            {showChoices && channel === 'online' && (
              <div className="mt-5 grid grid-cols-1 gap-3 text-start">
                <button type="button" onClick={() => setChannel(null)} className="text-start text-sm font-semibold text-[#1a3a6b]">
                  {t('payments.bank.back')}
                </button>
                {methods.map((method) => {
                  const name = isRTL && method.nameAr ? method.nameAr : method.nameEn || method.nameAr
                  const busy = payingId === method.id
                  return (
                    <button
                      key={method.id}
                      type="button"
                      disabled={payingId != null}
                      onClick={() => payWith(method.id)}
                      className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 transition hover:border-[#1a3a6b] hover:bg-[#f4f6fb] disabled:opacity-60"
                    >
                      {method.imageUrl ? (
                        <img src={method.imageUrl} alt="" className="h-10 w-16 object-contain" />
                      ) : (
                        <span className="flex h-10 w-16 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">
                          {method.code || '—'}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-extrabold text-slate-900">{name}</span>
                        {method.totalAmount != null && (
                          <span className="mt-0.5 block text-xs text-slate-500" dir="ltr">
                            {formatApplicationFee(method.totalAmount, method.currency || application?.application_fee_currency || 'USD')}
                          </span>
                        )}
                      </span>
                      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1a3a6b] border-t-transparent" />}
                    </button>
                  )
                })}
              </div>
            )}
            {error && <p className="mt-3 text-sm text-rose-700">{error}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
