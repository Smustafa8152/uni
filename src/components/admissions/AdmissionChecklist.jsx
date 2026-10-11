import { CheckCircle2, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

function Step({ done, title, action, busy, disabled, hint }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dde3ef] bg-[#f7f9fd] px-4 py-3">
      <div className="min-w-0 text-start">
        <p className="text-sm font-bold text-[#1a3a6b]">{title}</p>
        {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      </div>
      {done ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          {action}
        </span>
      ) : (
        <button
          type="button"
          onClick={action?.onClick}
          disabled={disabled || busy}
          className="inline-flex items-center gap-2 rounded-xl bg-[#1a3a6b] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {action?.label}
        </button>
      )}
    </div>
  )
}

export default function AdmissionChecklist({
  isRTL = false,
  detailsDone,
  documentsDone,
  documentsReady,
  paymentDone,
  paymentCanConfirm,
  busyKey,
  onVerifyDetails,
  onVerifyDocuments,
  onVerifyPayment,
}) {
  const { t } = useTranslation()
  const ready = detailsDone && documentsDone && paymentDone
  return (
    <section className="rounded-2xl border border-[#dde3ef] bg-white p-5 sm:p-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <h2 className="text-base font-extrabold text-[#1a3a6b]">{t('admissions.viewApplication.reviewSteps.title')}</h2>
      <p className="mt-1 text-sm text-slate-600">{t('admissions.viewApplication.reviewSteps.hint')}</p>
      <div className="mt-4 space-y-3">
        <Step
          done={detailsDone}
          title={t('admissions.viewApplication.reviewSteps.details')}
          action={detailsDone ? t('admissions.viewApplication.reviewSteps.done') : { label: t('admissions.viewApplication.reviewSteps.details'), onClick: onVerifyDetails }}
          busy={busyKey === 'details'}
        />
        <Step
          done={documentsDone}
          title={t('admissions.viewApplication.reviewSteps.documents')}
          hint={documentsDone || documentsReady ? '' : t('admissions.viewApplication.reviewSteps.needDocuments')}
          action={documentsDone ? t('admissions.viewApplication.reviewSteps.done') : { label: t('admissions.viewApplication.reviewSteps.documents'), onClick: onVerifyDocuments }}
          busy={busyKey === 'documents'}
        />
        <Step
          done={paymentDone}
          title={t('admissions.viewApplication.reviewSteps.payment')}
          hint={paymentDone ? '' : paymentCanConfirm ? t('admissions.viewApplication.reviewSteps.paymentWaitingReview') : t('admissions.viewApplication.reviewSteps.waitingPayment')}
          action={paymentDone ? t('admissions.viewApplication.reviewSteps.done') : { label: t('admissions.viewApplication.reviewSteps.payment'), onClick: onVerifyPayment }}
          busy={busyKey === 'payment'}
          disabled={!paymentCanConfirm}
        />
      </div>
      {!ready && (
        <p className="mt-3 text-sm font-semibold text-amber-800">{t('admissions.viewApplication.reviewSteps.locked')}</p>
      )}
    </section>
  )
}
