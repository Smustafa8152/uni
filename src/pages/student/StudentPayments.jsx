import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle, CreditCard, Loader2, Receipt, Wallet, X, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import {
  confirmStudentFeePayment,
  formatMoney,
  installmentAmount,
  listStudentFeeMethods,
  loadStudentInstallments,
  planTotal,
  sortedItems,
  startStudentFeeCheckout,
} from '../../utils/programFees'

const NAVY = '#1a3a6b'

export default function StudentPayments() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { isRTL, language } = useLanguage()
  const isArabic = isRTL || language === 'ar'
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const paymentId = params.get('paymentId')
  const failed = params.get('failed') === '1'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState(null)
  const [rows, setRows] = useState([])
  const [invoices, setInvoices] = useState([])
  const [notice, setNotice] = useState(failed ? 'failed' : paymentId ? 'checking' : '')
  const [picker, setPicker] = useState(null)

  const nameOf = (row) => (row ? getLocalizedName(row, isArabic) || row.name_en || row.name_ar : '') || '—'
  const formatDate = (value) =>
    value ? new Date(value).toLocaleDateString(isArabic ? 'ar-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

  const load = async () => {
    if (!user?.email) return
    setLoading(true)
    setError('')
    try {
      const { data: students, error: studentErr } = await supabase
        .from('students')
        .select('id, major_id, enrollment_date')
        .ilike('email', user.email.trim().replace(/[\\%_]/g, '\\$&'))
        .order('id', { ascending: false })
        .limit(1)
      if (studentErr) throw studentErr
      const student = students?.[0]
      if (!student) {
        setPlan(null)
        setRows([])
        return
      }

      const [installments, invoiceRes] = await Promise.all([
        loadStudentInstallments(supabase, student),
        supabase
          .from('invoices')
          .select('id, invoice_number, invoice_date, invoice_type, status, total_amount, paid_amount')
          .eq('student_id', student.id)
          .order('invoice_date', { ascending: false }),
      ])
      setInvoices(invoiceRes.data || [])
      setPlan(installments.plan)
      setRows(installments.rows)
    } catch (err) {
      setError(err?.message || t('studentFees.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email])

  useEffect(() => {
    if (!paymentId) return
    confirmStudentFeePayment(supabase, paymentId)
      .then((result) => {
        setNotice(result?.paid ? 'paid' : result?.pending ? 'pending' : 'failed')
        load()
      })
      .catch(() => setNotice('failed'))
      .finally(() => navigate('/student/payments', { replace: true }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId])

  const currency = plan?.currency || 'USD'
  const total = plan ? planTotal(plan) : 0
  const perInstallment = plan ? installmentAmount(plan) : 0
  const paidTotal = rows.reduce((sum, r) => sum + (r.payment ? Number(r.payment.amount || 0) : 0), 0)
  const items = useMemo(() => (plan ? sortedItems(plan) : []), [plan])
  const otherInvoices = invoices.filter((inv) => inv.status !== 'cancelled')

  const openPicker = async (row) => {
    setPicker({ row, loading: true, methods: [], error: '', payingId: null })
    try {
      const result = await listStudentFeeMethods(supabase, row.semester.id)
      if (result?.alreadyPaid) {
        setPicker(null)
        load()
        return
      }
      setPicker({ row, loading: false, methods: result?.methods || [], error: '', payingId: null })
    } catch (err) {
      setPicker({ row, loading: false, methods: [], error: err?.message || '', payingId: null })
    }
  }

  const payWith = async (methodId) => {
    if (!picker) return
    setPicker((prev) => ({ ...prev, payingId: methodId, error: '' }))
    try {
      const result = await startStudentFeeCheckout(supabase, { semesterId: picker.row.semester.id, paymentMethodId: methodId, language })
      if (result?.alreadyPaid) {
        setPicker(null)
        load()
      }
    } catch (err) {
      setPicker((prev) => ({ ...prev, payingId: null, error: err?.message || '' }))
    }
  }

  if (loading && !plan) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" style={{ color: NAVY }} />
      </div>
    )
  }

  const noticeView = {
    checking: { tone: 'border-slate-200 bg-white text-slate-700', icon: <Loader2 className="h-5 w-5 animate-spin" />, text: t('studentFees.confirming') },
    paid: { tone: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: <CheckCircle className="h-5 w-5" />, text: t('studentFees.paymentReceived') },
    pending: { tone: 'border-amber-200 bg-amber-50 text-amber-800', icon: <Loader2 className="h-5 w-5" />, text: t('studentFees.paymentPending') },
    failed: { tone: 'border-rose-200 bg-rose-50 text-rose-800', icon: <AlertCircle className="h-5 w-5" />, text: t('studentFees.paymentFailed') },
  }[notice]

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-black text-slate-900">{t('studentFees.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('studentFees.subtitle')}</p>
      </div>

      {noticeView && (
        <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${noticeView.tone}`}>
          {noticeView.icon}
          <span className="flex-1">{noticeView.text}</span>
          {notice !== 'checking' && (
            <button type="button" onClick={() => setNotice('')} className="rounded-lg p-1 opacity-60 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {error && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-slate-200 bg-white px-6 py-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Wallet className="h-7 w-7 text-slate-400" />
          </div>
          <p className="mx-auto mt-4 max-w-md text-sm text-slate-600">{t('studentFees.nothingOpen')}</p>
        </div>
      ) : (
        <>
          <section className="rounded-3xl p-6 text-white shadow-lg" style={{ backgroundColor: NAVY }}>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/60">{t('studentFees.programFees')}</p>
            <h2 className="mt-1 text-lg font-extrabold leading-snug">{nameOf(plan?.majors)}</h2>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-white/60">{t('studentFees.total')}</div>
                <div className="mt-0.5 text-xl font-black" dir="ltr">{formatMoney(total, currency)}</div>
              </div>
              <div>
                <div className="text-xs text-white/60">{t('studentFees.installmentsOf', { count: plan.installments })}</div>
                <div className="mt-0.5 text-xl font-black" dir="ltr">{formatMoney(perInstallment, currency)}</div>
              </div>
              <div>
                <div className="text-xs text-white/60">{t('studentFees.paidSoFar')}</div>
                <div className="mt-0.5 text-xl font-black text-[#e5c76b]" dir="ltr">{formatMoney(paidTotal, currency)}</div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white">
            <h2 className="border-b border-slate-100 px-5 py-4 text-base font-extrabold text-slate-900">{t('studentFees.installments')}</h2>
            <ul className="divide-y divide-slate-100">
              {rows.map((row) => (
                <li key={row.semester.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black ${
                      row.payment ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {row.payment ? <CheckCircle className="h-5 w-5" /> : row.number}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-900">{nameOf(row.semester)}</div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {t('studentFees.installmentN', { n: row.number, total: plan.installments })}
                      {row.payment?.paid_at && <> · {t('studentFees.paidOn', { date: formatDate(row.payment.paid_at) })}</>}
                    </div>
                    {row.payment?.myfatoorah_payment_id && (
                      <div className="mt-0.5 text-xs text-slate-400">
                        {t('studentFees.reference')}: <span dir="ltr">{row.payment.myfatoorah_payment_id}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-end">
                    <div className="text-lg font-black text-slate-900" dir="ltr">
                      {formatMoney(row.payment ? row.payment.amount : perInstallment, row.payment?.currency || currency)}
                    </div>
                    {row.payment ? (
                      <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">{t('studentFees.paid')}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openPicker(row)}
                        className="mt-1.5 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white shadow"
                        style={{ backgroundColor: NAVY }}
                      >
                        <CreditCard className="h-4 w-4" />
                        {t('studentFees.payNow')}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-extrabold text-slate-900">{t('studentFees.itemsTitle')}</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="pb-2 text-start font-semibold">{t('studentFees.item')}</th>
                  <th className="pb-2 text-end font-semibold">{t('studentFees.amount')}</th>
                  <th className="pb-2 text-end font-semibold">{t('studentFees.perInstallment')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className={item.is_optional ? 'text-slate-400' : 'text-slate-800'}>
                    <td className="py-2">
                      {isArabic ? item.name_ar || item.name_en : item.name_en || item.name_ar}
                      {item.is_optional && <span className="ms-1.5 text-xs">({t('studentFees.notInTotal')})</span>}
                    </td>
                    <td className="py-2 text-end tabular-nums" dir="ltr">{formatMoney(item.amount, currency)}</td>
                    <td className="py-2 text-end tabular-nums" dir="ltr">
                      {item.is_optional ? '—' : formatMoney(Number(item.amount) / plan.installments, currency)}
                    </td>
                  </tr>
                ))}
                <tr className="font-extrabold text-slate-900">
                  <td className="pt-3">{t('studentFees.total')}</td>
                  <td className="pt-3 text-end tabular-nums" dir="ltr">{formatMoney(total, currency)}</td>
                  <td className="pt-3 text-end tabular-nums" dir="ltr">{formatMoney(perInstallment, currency)}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </>
      )}

      {otherInvoices.length > 0 && (
        <section className="rounded-3xl border border-slate-200 bg-white">
          <h2 className="flex items-center gap-2 border-b border-slate-100 px-5 py-4 text-base font-extrabold text-slate-900">
            <Receipt className="h-5 w-5 text-slate-400" />
            {t('studentFees.otherInvoices')}
          </h2>
          <ul className="divide-y divide-slate-100">
            {otherInvoices.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <div className="font-mono font-semibold text-slate-800" dir="ltr">{inv.invoice_number}</div>
                  <div className="text-xs text-slate-500">{formatDate(inv.invoice_date)}</div>
                </div>
                <div className="text-end">
                  <div className="font-bold text-slate-900" dir="ltr">{formatMoney(inv.total_amount)}</div>
                  <span
                    className={`text-xs font-bold ${inv.status === 'paid' ? 'text-emerald-700' : 'text-amber-700'}`}
                  >
                    {inv.status === 'paid' ? t('studentFees.paid') : t('studentFees.unpaid')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {picker && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => !picker.payingId && setPicker(null)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-900">{t('studentFees.chooseMethod')}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {nameOf(picker.row.semester)} · <span dir="ltr">{formatMoney(perInstallment, currency)}</span>
                </p>
              </div>
              <button type="button" onClick={() => setPicker(null)} disabled={Boolean(picker.payingId)} className="rounded-lg p-1 text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            {picker.loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-7 w-7 animate-spin" style={{ color: NAVY }} />
              </div>
            ) : (
              <div className="mt-4 grid gap-2.5">
                {picker.methods.map((method) => (
                  <button
                    key={method.id}
                    type="button"
                    disabled={picker.payingId != null}
                    onClick={() => payWith(method.id)}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-start transition hover:border-[#1a3a6b] hover:bg-slate-50 disabled:opacity-60"
                  >
                    {method.imageUrl ? (
                      <img src={method.imageUrl} alt="" className="h-9 w-14 object-contain" />
                    ) : (
                      <span className="flex h-9 w-14 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">{method.code}</span>
                    )}
                    <span className="flex-1">
                      <span className="block text-sm font-extrabold text-slate-900">{isArabic && method.nameAr ? method.nameAr : method.nameEn || method.nameAr}</span>
                      {method.totalAmount != null && (
                        <span className="block text-xs text-slate-500" dir="ltr">{formatMoney(method.totalAmount, method.currency || currency)}</span>
                      )}
                    </span>
                    {picker.payingId === method.id && <Loader2 className="h-4 w-4 animate-spin" style={{ color: NAVY }} />}
                  </button>
                ))}
              </div>
            )}
            {picker.error && <p className="mt-3 text-sm text-rose-700">{picker.error}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
