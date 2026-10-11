import { useTranslation } from 'react-i18next'
import { formatMoney } from '../../utils/programFees'
import { paymentKindTitleKey } from '../../utils/applicationPayments'
import { getLocalizedName } from '../../utils/localizedName'

function methodLabel(method, t) {
  const value = String(method || '').toLowerCase()
  if (value === 'online_payment') return t('payments.methodOnline')
  if (value === 'bank_transfer') return t('payments.methodBank')
  if (value === 'cash') return t('payments.methodCash')
  if (value === 'check') return t('payments.methodCheck')
  if (!value) return '—'
  return value
}

function formatWhen(value, isRTL) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(isRTL ? 'ar-u-nu-latn' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ApplicationReceipt({ application, payment, isRTL = false, id = 'application-receipt' }) {
  const { t } = useTranslation()
  if (!application || !payment) return null
  const name = [application.first_name, application.last_name].filter(Boolean).join(' ').trim() || '—'
  const program = getLocalizedName(application.majors, isRTL) || application.majors?.name_en || '—'
  const rows = [
    [t('payments.record.receiptNo'), payment.receiptNo || '—'],
    [t('payments.record.applicant'), name],
    [t('payments.record.applicationNo'), application.application_number || '—'],
    [t('payments.record.program'), program],
    [t('payments.record.amount'), formatMoney(payment.amount, payment.currency || 'USD')],
    [t('payments.record.method'), methodLabel(payment.method, t)],
    [t('payments.record.paidOn'), formatWhen(payment.paidAt, isRTL)],
    [t('payments.record.reference'), payment.reference || '—'],
    [t('payments.record.status'), payment.paid ? t('payments.record.paid') : t('payments.record.unpaid')],
  ]

  return (
    <article
      id={id}
      className="mx-auto max-w-lg rounded-2xl border border-[#dde3ef] bg-white p-6 shadow-sm print:max-w-none print:border-0 print:shadow-none"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <header className="border-b border-[#dde3ef] pb-4 text-center">
        <img src="/assets/IBU Logo.png" alt={t('payments.receipt.university')} className="mx-auto mb-3 h-16 w-auto object-contain" />
        <p className="text-xs font-bold uppercase tracking-wider text-[#c8a84b]">{t('payments.receipt.university')}</p>
        <h2 className="mt-1 text-xl font-black text-[#1a3a6b]">{t('payments.receipt.title')}</h2>
        <p className="mt-1 text-sm text-slate-500">{t(paymentKindTitleKey(payment.kind))}</p>
      </header>
      <dl className="mt-4 space-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 text-sm">
            <dt className="text-slate-500">{label}</dt>
            <dd className="text-end font-semibold text-slate-900" dir="ltr">{value}</dd>
          </div>
        ))}
      </dl>
      {payment.paid && (
        <p className="mt-5 rounded-xl bg-emerald-50 px-3 py-2 text-center text-sm font-bold text-emerald-800">
          {t('payments.receipt.confirmed')}
        </p>
      )}
    </article>
  )
}
