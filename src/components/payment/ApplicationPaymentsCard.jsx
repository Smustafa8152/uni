import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Receipt } from 'lucide-react'
import { formatMoney } from '../../utils/programFees'
import { listApplicationPayments, paymentKindTitleKey } from '../../utils/applicationPayments'

export default function ApplicationPaymentsCard({ application, isRTL = false, detailsTo }) {
  const { t } = useTranslation()
  const rows = listApplicationPayments(application)
  if (rows.length === 0) return null

  return (
    <section className="rounded-2xl border border-[#dde3ef] bg-white p-5 sm:p-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="mb-4 flex items-center gap-2">
        <Receipt className="h-5 w-5 shrink-0 text-[#c8a84b]" />
        <h2 className="text-base font-extrabold text-[#1a3a6b]">{t('payments.recordsTitle')}</h2>
      </div>
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.kind} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dde3ef] bg-[#f7f9fd] px-4 py-3">
            <div className="min-w-0 text-start">
              <p className="text-sm font-bold text-[#1a3a6b]">{t(paymentKindTitleKey(row.kind))}</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-800" dir="ltr">{formatMoney(row.amount, row.currency)}</p>
              <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${row.paid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                {row.paid ? t('payments.record.paid') : t('payments.record.unpaid')}
              </span>
            </div>
            {typeof detailsTo === 'function' && (
              <Link
                to={detailsTo(row.kind)}
                className="inline-flex items-center rounded-lg bg-[#1a3a6b] px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-[#2a5298]"
              >
                {row.paid ? t('payments.viewReceipt') : t('payments.viewDetails')}
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
