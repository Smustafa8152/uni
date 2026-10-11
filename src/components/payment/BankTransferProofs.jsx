import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { bankProofUrl, confirmBankTransfer, listBankTransfers } from '../../utils/bankTransferProof'
import { formatMoney } from '../../utils/programFees'
import { paymentKindTitleKey } from '../../utils/applicationPayments'

export default function BankTransferProofs({ application, staffUserId = null, canConfirm = false, showEmpty = false, refreshKey = 0, onConfirmed, isRTL = false }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [confirmingId, setConfirmingId] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!application?.id) {
        setRows([])
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        const data = await listBankTransfers(supabase, application.id)
        if (!cancelled) setRows(data)
      } catch (err) {
        if (!cancelled) setError(err?.message || '')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [application?.id, refreshKey])

  const confirm = async (proof) => {
    setConfirmingId(proof.id)
    setError('')
    try {
      await confirmBankTransfer(supabase, { proof, application, staffUserId })
      setRows((prev) => prev.map((row) => (row.id === proof.id ? { ...row, status: 'confirmed' } : row)))
      if (onConfirmed) onConfirmed()
    } catch (err) {
      setError(err?.message || t('payments.bank.needProof'))
    } finally {
      setConfirmingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-[#1a3a6b]" />
      </div>
    )
  }
  if (rows.length === 0) {
    if (!showEmpty) return null
    return <p className="text-sm text-slate-500" dir={isRTL ? 'rtl' : 'ltr'}>{t('payments.bank.empty')}</p>
  }

  return (
    <section className="space-y-3" dir={isRTL ? 'rtl' : 'ltr'}>
      <h3 className="text-sm font-extrabold text-[#1a3a6b]">{t('payments.bank.proofTitle')}</h3>
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      <ul className="space-y-3">
        {rows.map((row) => {
          const url = bankProofUrl(supabase, row.file_path)
          const image = String(row.content_type || '').startsWith('image/')
          return (
            <li key={row.id} className="rounded-2xl border border-[#dde3ef] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 text-start">
                  <p className="text-sm font-bold text-[#1a3a6b]">{t(paymentKindTitleKey(row.fee_kind))}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800" dir="ltr">{formatMoney(row.amount, row.currency || 'USD')}</p>
                  <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${row.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                    {row.status === 'confirmed' ? t('payments.bank.confirmed') : t('payments.bank.waiting')}
                  </span>
                </div>
                {canConfirm && row.status === 'submitted' && (
                  <button
                    type="button"
                    onClick={() => confirm(row)}
                    disabled={confirmingId != null}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#1a3a6b] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {confirmingId === row.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('payments.bank.confirm')}
                  </button>
                )}
              </div>
              {row.notes && <p className="mt-3 text-sm text-slate-700">{row.notes}</p>}
              <div className="mt-2 space-y-1 text-sm text-slate-600">
                {row.sender_name && <p>{t('payments.bank.sender')}: {row.sender_name}</p>}
                {row.transfer_date && <p dir="ltr">{t('payments.bank.date')}: {row.transfer_date}</p>}
              </div>
              {url && (
                image ? (
                  <a href={url} target="_blank" rel="noreferrer" className="mt-3 block">
                    <img src={url} alt="" className="max-h-64 rounded-xl border border-[#dde3ef] object-contain" />
                  </a>
                ) : (
                  <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-sm font-semibold text-[#1a3a6b] underline">
                    {row.file_name || t('payments.bank.screenshot')}
                  </a>
                )
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
