import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Building2, CreditCard, Landmark, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { COLLEGE_BANK_ACCOUNT } from '../../utils/collegeBankAccount'
import { submitBankTransfer } from '../../utils/bankTransferProof'
import { formatMoney } from '../../utils/programFees'

export function PaymentChannelChoice({ onOnline, onBank, isRTL = false, myfatoorah = true, bankTransfer = true }) {
  const { t } = useTranslation()
  const options = [
    myfatoorah ? { key: 'online', icon: CreditCard, title: t('payments.bank.online'), hint: t('payments.bank.onlineHint'), onClick: onOnline } : null,
    bankTransfer ? { key: 'bank', icon: Landmark, title: t('payments.bank.transfer'), hint: t('payments.bank.transferHint'), onClick: onBank } : null,
  ].filter(Boolean)
  return (
    <div className={`grid grid-cols-1 gap-3 ${options.length > 1 ? 'sm:grid-cols-2' : ''}`} dir={isRTL ? 'rtl' : 'ltr'}>
      {options.map((option) => {
        const Icon = option.icon
        return (
          <button
            key={option.key}
            type="button"
            onClick={option.onClick}
            className="rounded-2xl border border-[#dde3ef] bg-white p-4 text-start transition hover:border-[#1a3a6b] hover:bg-[#f7f9fd]"
          >
            <Icon className="mb-2 h-6 w-6 text-[#1a3a6b]" />
            <span className="block text-sm font-extrabold text-slate-900">{option.title}</span>
            <span className="mt-1 block text-xs text-slate-500">{option.hint}</span>
          </button>
        )
      })}
    </div>
  )
}

export default function BankTransferPanel({ applicationId, feeKind, amount, currency = 'GMD', isRTL = false, onSubmitted }) {
  const { t } = useTranslation()
  const [file, setFile] = useState(null)
  const [details, setDetails] = useState('')
  const [senderName, setSenderName] = useState('')
  const [transferDate, setTransferDate] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const send = async (event) => {
    event.preventDefault()
    if (!file || !details.trim()) {
      setError(t('payments.bank.needProof'))
      return
    }
    setSending(true)
    setError('')
    try {
      await submitBankTransfer(supabase, {
        applicationId,
        feeKind,
        amount,
        currency,
        details,
        senderName,
        transferDate,
        file,
      })
      if (onSubmitted) onSubmitted()
    } catch (err) {
      setError(err?.message || t('payments.bank.needProof'))
    } finally {
      setSending(false)
    }
  }

  const accountRows = [
    [t('payments.bank.accountName'), COLLEGE_BANK_ACCOUNT.accountName],
    [t('payments.bank.accountNumber'), COLLEGE_BANK_ACCOUNT.accountNumber],
    [t('payments.bank.bban'), COLLEGE_BANK_ACCOUNT.bban],
  ]

  return (
    <form onSubmit={send} className="space-y-4 text-start" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="rounded-2xl border border-[#dde3ef] bg-[#f7f9fd] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Building2 className="h-5 w-5 shrink-0 text-[#c8a84b]" />
          <h3 className="text-sm font-extrabold text-[#1a3a6b]">{t('payments.bank.accountTitle')}</h3>
        </div>
        <p className="text-sm font-bold text-slate-900" dir="ltr">{COLLEGE_BANK_ACCOUNT.college}</p>
        <p className="mt-1 text-sm text-slate-600" dir="ltr">{COLLEGE_BANK_ACCOUNT.address.join(', ')}</p>
        <dl className="mt-3 space-y-2">
          {accountRows.map(([label, value]) => (
            <div key={label} className="flex items-start justify-between gap-3 text-sm">
              <dt className="text-slate-500">{label}</dt>
              <dd className="text-end font-bold text-slate-900 underline decoration-[#1a3a6b] underline-offset-2" dir="ltr">{value}</dd>
            </div>
          ))}
        </dl>
        {amount != null && (
          <p className="mt-3 text-sm font-semibold text-[#1a3a6b]" dir="ltr">{formatMoney(amount, currency)}</p>
        )}
      </div>

      <label className="block text-sm font-semibold text-slate-700">
        {t('payments.bank.screenshot')}
        <input
          type="file"
          accept="image/*,.pdf"
          onChange={(event) => setFile(event.target.files?.[0] || null)}
          className="mt-1 block w-full text-sm text-slate-700 file:me-3 file:rounded-lg file:border-0 file:bg-[#1a3a6b] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
        />
      </label>

      <label className="block text-sm font-semibold text-slate-700">
        {t('payments.bank.details')}
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          rows={3}
          placeholder={t('payments.bank.detailsHint')}
          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal"
        />
      </label>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-slate-700">
          {t('payments.bank.sender')}
          <input
            type="text"
            value={senderName}
            onChange={(event) => setSenderName(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal"
          />
        </label>
        <label className="block text-sm font-semibold text-slate-700">
          {t('payments.bank.date')}
          <input
            type="date"
            value={transferDate}
            onChange={(event) => setTransferDate(event.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal"
            dir="ltr"
          />
        </label>
      </div>

      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      <button
        type="submit"
        disabled={sending}
        className="inline-flex items-center gap-2 rounded-xl bg-[#1a3a6b] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {sending && <Loader2 className="h-4 w-4 animate-spin" />}
        {sending ? t('payments.bank.sending') : t('payments.bank.submit')}
      </button>
    </form>
  )
}
