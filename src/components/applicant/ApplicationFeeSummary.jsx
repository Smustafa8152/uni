import { useTranslation } from 'react-i18next'
import { formatApplicationFee } from '../../utils/applicationFee'

/** Paid or unpaid application fee. Hidden when the fee was not required. */
export default function ApplicationFeeSummary({ application, className = '' }) {
  const { t } = useTranslation()
  const status = String(application?.application_fee_status || '')
  if (status !== 'pending' && status !== 'paid') return null

  const amount = formatApplicationFee(application.application_fee_amount, application.application_fee_currency || 'USD')
  const paid = status === 'paid'
  const paidOn = application.application_fee_paid_at
    ? new Date(application.application_fee_paid_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <section className={`rounded-2xl border px-4 py-4 sm:px-5 ${paid ? 'border-emerald-200 bg-emerald-50' : 'border-amber-300 bg-amber-50'} ${className}`}>
      <p className="text-xs font-bold text-[#1a3a6b]">{t('registerApplication.feeTitle')}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
        <p className="text-base font-extrabold text-[#1e2a3a]" dir="ltr">{amount}</p>
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${paid ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'}`}>
          {paid ? t('registerApplication.paymentStatusPaid') : t('registerApplication.paymentStatusUnpaid')}
        </span>
      </div>
      {paid && paidOn && (
        <p className="mt-2 text-sm text-[#3d4d66]">
          {t('registerApplication.paymentPaidOn')}: <span dir="ltr">{paidOn}</span>
        </p>
      )}
      {application.application_fee_reference && (
        <p className="mt-1 text-sm text-[#3d4d66]">
          {t('registerApplication.paymentReference')}: <span dir="ltr">{application.application_fee_reference}</span>
        </p>
      )}
    </section>
  )
}
