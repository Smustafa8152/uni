import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'

const UI = {
  p: '#1a3a6b',
  pl: '#2a5298',
  acc: '#c8a84b',
  bg: '#f4f6fb',
  sur: '#ffffff',
  bdr: '#dde3ef',
  txt: '#1e2a3a',
  muted: '#6b7a99',
  ok: '#1a7a4a',
  okBg: '#e6f7ef',
  err: '#b91c1c',
  errBg: '#fee2e2',
}

const formatMoney = (amount, isArabic) => {
  const n = Number(amount || 0)
  const val = Number.isFinite(n) ? n : 0
  const unit = isArabic ? 'ر.س' : 'SAR'
  return `${val.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit}`
}

const fmtDateTime = (iso, isArabic) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleString(isArabic ? 'ar' : 'en', { dateStyle: 'full', timeStyle: 'short' })
  } catch {
    return String(iso)
  }
}

const fmtDate = (iso, isArabic) => {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    return d.toLocaleDateString(isArabic ? 'ar' : 'en')
  } catch {
    return String(iso).slice(0, 10)
  }
}

const methodLabel = (method, t) => {
  const m = String(method || '').toLowerCase()
  if (m === 'online_payment') return t('studentPortal.receipt.methodOnline', { defaultValue: 'Online payment' })
  if (m === 'bank_transfer') return t('studentPortal.receipt.methodBank', { defaultValue: 'Bank transfer' })
  if (!m) return '—'
  return m.replace(/_/g, ' ')
}

export default function StudentPaymentReceipt() {
  const { t } = useTranslation()
  const { paymentId } = useParams()
  const { user } = useAuth()
  const { isRTL, language } = useLanguage()
  const navigate = useNavigate()

  const isArabic = isRTL || language === 'ar'

  const [loading, setLoading] = useState(true)
  const [payment, setPayment] = useState(null)
  const [invoice, setInvoice] = useState(null)
  const [student, setStudent] = useState(null)
  const [items, setItems] = useState([])

  useEffect(() => {
    if (user?.email && paymentId) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email, paymentId])

  const fetchAll = async () => {
    if (!user?.email || !paymentId) return
    try {
      setLoading(true)

      const { data: studentData } = await supabase
        .from('students')
        .select('id, student_id, name_en, name_ar, first_name, last_name, email, college_id')
        .eq('email', user.email)
        .eq('status', 'active')
        .maybeSingle()
      if (!studentData) {
        setStudent(null)
        return
      }
      setStudent(studentData)

      const { data: paymentRow, error: payErr } = await supabase
        .from('payments')
        .select('id, payment_number, invoice_id, student_id, college_id, payment_date, payment_method, amount, currency, status, transaction_reference, verified_at, created_at, notes')
        .eq('id', Number(paymentId))
        .eq('student_id', studentData.id)
        .single()
      if (payErr) throw payErr
      setPayment(paymentRow)

      const { data: invoiceRow } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, due_date, status, total_amount, paid_amount, pending_amount, invoice_type, semester_id')
        .eq('id', paymentRow.invoice_id)
        .maybeSingle()
      setInvoice(invoiceRow || null)

      const { data: itemRows } = await supabase
        .from('invoice_items')
        .select('id, item_name_en, item_name_ar, quantity, unit_price, discount_amount, scholarship_amount, total_amount')
        .eq('invoice_id', paymentRow.invoice_id)
        .order('id', { ascending: true })
      setItems(itemRows || [])
    } catch (e) {
      console.error('StudentPaymentReceipt fetch error:', e)
      setPayment(null)
    } finally {
      setLoading(false)
    }
  }

  const receiptNumber = useMemo(() => {
    const y = new Date().getFullYear()
    if (payment?.payment_number) return payment.payment_number.replace(/^PAY-/, `RCP-${y}-`)
    return payment?.id ? `RCP-${y}-${payment.id}` : '—'
  }, [payment?.payment_number, payment?.id])

  const itemsForTable = useMemo(() => {
    const list = (items || []).map((it) => ({
      key: `item-${it.id}`,
      name: (isArabic ? it.item_name_ar : it.item_name_en) || it.item_name_ar || it.item_name_en || '—',
      amount: Number(it.total_amount || 0),
      isDiscount: false,
    }))

    const discountTotal = (items || []).reduce((acc, it) => acc + Number(it.discount_amount || 0) + Number(it.scholarship_amount || 0), 0)
    if (discountTotal > 0) {
      list.push({
        key: 'discount',
        name: t('studentPortal.receipt.discountLine', { defaultValue: 'Discounts / scholarships' }),
        amount: -discountTotal,
        isDiscount: true,
      })
    }

    return list
  }, [items, isArabic, t])

  const paidAt = useMemo(() => payment?.verified_at || payment?.created_at || null, [payment?.verified_at, payment?.created_at])
  const success = payment?.status === 'verified'

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-slate-600 border-t-transparent" />
      </div>
    )
  }

  if (!student || !payment) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-6 text-center">
        <p className="text-amber-800">{t('studentPortal.receipt.notFound', { defaultValue: 'Receipt not found.' })}</p>
        <div className="mt-4">
          <button className="px-4 py-2 rounded-md border" onClick={() => navigate('/student/payments')}>
            {t('studentPortal.receipt.backToPayments', { defaultValue: 'Back to payments' })}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`${isArabic ? 'text-right' : 'text-left'} space-y-6`} dir={isArabic ? 'rtl' : 'ltr'}>
      <nav className="flex flex-wrap items-center gap-2 text-sm" style={{ color: UI.muted }} aria-label="مسار التنقل">
        <Link to="/" className="no-underline hover:underline" style={{ color: UI.muted }}>
          {t('studentPortal.documents.breadcrumbHome', { defaultValue: 'Home' })}
        </Link>
        <span style={{ color: UI.bdr }}>/</span>
        <Link to="/dashboard" className="no-underline hover:underline" style={{ color: UI.muted }}>
          {t('studentPortal.studentPortal', { defaultValue: 'Student Portal' })}
        </Link>
        <span style={{ color: UI.bdr }}>/</span>
        <Link to="/student/payments" className="no-underline hover:underline" style={{ color: UI.muted }}>
          {t('studentPortal.billsFees', { defaultValue: 'Invoices & fees' })}
        </Link>
        <span style={{ color: UI.bdr }}>/</span>
        <span className="font-semibold" style={{ color: UI.p }}>
          {t('studentPortal.receipt.title', { defaultValue: 'Payment receipt' })}
        </span>
      </nav>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: UI.p }}>
            {t('studentPortal.receipt.title', { defaultValue: 'Payment receipt' })}
          </h1>
          <p className="text-sm" style={{ color: UI.muted }}>
            {t('studentPortal.receipt.subtitle', { defaultValue: 'Confirmation of successful payment' })}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            className="px-4 py-2 rounded-md border"
            style={{ background: UI.bg, borderColor: UI.bdr, color: UI.txt }}
            onClick={() => window.print()}
          >
            🖨️ {t('studentPortal.receipt.print', { defaultValue: 'Print receipt' })}
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-md border"
            style={{ background: UI.bg, borderColor: UI.bdr, color: UI.txt }}
            onClick={() => window.print()}
            title={t('studentPortal.receipt.pdfHint', { defaultValue: 'Use Print to save as PDF.' })}
          >
            ⬇ {t('studentPortal.receipt.downloadPdf', { defaultValue: 'Download PDF' })}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-6 max-w-[700px] mx-auto" style={{ borderColor: UI.bdr }}>
        {/* Success banner */}
        <div className="text-center pb-5 mb-6 border-b" style={{ borderColor: UI.bdr }}>
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto mb-3"
            style={{ backgroundColor: success ? UI.okBg : UI.errBg, color: success ? UI.ok : UI.err }}
          >
            {success ? '✅' : '⏳'}
          </div>
          <h2 className="text-xl font-extrabold mb-1" style={{ color: success ? UI.ok : UI.err }}>
            {success
              ? t('studentPortal.receipt.successTitle', { defaultValue: 'Payment completed successfully' })
              : t('studentPortal.receipt.pendingTitle', { defaultValue: 'Payment is pending verification' })}
          </h2>
          <p className="text-sm" style={{ color: UI.muted }}>
            {fmtDateTime(paidAt, isArabic)}
          </p>
        </div>

        {/* Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm mb-6">
          <div>
            <div style={{ color: UI.muted }}>{t('studentPortal.receipt.receiptNumber', { defaultValue: 'Receipt number' })}</div>
            <div className="font-extrabold text-base">{receiptNumber}</div>
          </div>
          <div>
            <div style={{ color: UI.muted }}>{t('studentPortal.receipt.bankRef', { defaultValue: 'Bank reference' })}</div>
            <div className="font-extrabold">{payment.transaction_reference || '—'}</div>
          </div>
          <div>
            <div style={{ color: UI.muted }}>{t('studentPortal.receipt.studentName', { defaultValue: 'Student name' })}</div>
            <div className="font-extrabold">{getLocalizedName(student, isArabic) || student.email}</div>
          </div>
          <div>
            <div style={{ color: UI.muted }}>{t('studentPortal.receipt.studentId', { defaultValue: 'Student ID' })}</div>
            <div className="font-extrabold">{student.student_id || '—'}</div>
          </div>
          <div>
            <div style={{ color: UI.muted }}>{t('studentPortal.receipt.invoicePaid', { defaultValue: 'Paid invoice' })}</div>
            <div className="font-extrabold">{invoice?.invoice_number || '—'}</div>
          </div>
          <div>
            <div style={{ color: UI.muted }}>{t('studentPortal.receipt.method', { defaultValue: 'Payment method' })}</div>
            <div className="font-extrabold">{methodLabel(payment.payment_method, t)}</div>
          </div>
        </div>

        {/* Items */}
        <div className="overflow-x-auto rounded-xl border mb-6" style={{ borderColor: UI.bdr }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: UI.p, color: 'white' }}>
                <th className="px-4 py-3">{t('studentPortal.receipt.item', { defaultValue: 'Item' })}</th>
                <th className="px-4 py-3">{t('studentPortal.receipt.amount', { defaultValue: 'Amount' })}</th>
              </tr>
            </thead>
            <tbody>
              {itemsForTable.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-6 text-center" style={{ color: UI.muted }}>
                    {t('studentPortal.receipt.noItems', { defaultValue: 'No items found.' })}
                  </td>
                </tr>
              ) : (
                itemsForTable.map((row) => (
                  <tr key={row.key} className="border-b" style={{ borderColor: UI.bdr }}>
                    <td className="px-4 py-3">{row.name}</td>
                    <td className="px-4 py-3" style={{ color: row.amount < 0 ? UI.ok : UI.txt, fontWeight: 800 }}>
                      {row.amount < 0 ? `- ${formatMoney(Math.abs(row.amount), isArabic)}` : formatMoney(row.amount, isArabic)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: UI.okBg }}>
                <th className="px-4 py-3">{t('studentPortal.receipt.totalPaid', { defaultValue: 'Total paid' })}</th>
                <th className="px-4 py-3" style={{ color: UI.ok, fontSize: 18 }}>
                  {formatMoney(payment.amount, isArabic)}
                </th>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Next */}
        <div className="rounded-lg p-4 mb-4" style={{ backgroundColor: UI.okBg }}>
          <div className="font-extrabold mb-2" style={{ color: UI.ok }}>
            ✅ {t('studentPortal.receipt.nextTitle', { defaultValue: 'What happens next?' })}
          </div>
          <div className="text-sm leading-8" style={{ color: UI.ok }}>
            {success ? (
              <>
                <div>✓ {t('studentPortal.receipt.next1', { defaultValue: 'Your financial hold will be updated automatically.' })}</div>
                <div>✓ {t('studentPortal.receipt.next2', { defaultValue: 'You can proceed with course registration if eligible.' })}</div>
                <div>✓ {t('studentPortal.receipt.next3', { defaultValue: 'A copy of this receipt can be saved as PDF from Print.' })}</div>
                <div>✓ {t('studentPortal.receipt.next4', { defaultValue: 'Your financial record may take up to 24 hours to reflect everywhere.' })}</div>
              </>
            ) : (
              <>
                <div>• {t('studentPortal.receipt.pending1', { defaultValue: 'Your payment is recorded and awaiting verification.' })}</div>
                <div>• {t('studentPortal.receipt.pending2', { defaultValue: 'If you used bank transfer, keep your bank reference.' })}</div>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-3 justify-center">
          <Link
            to="/student/enroll"
            className="px-6 py-3 rounded-md font-extrabold text-white no-underline"
            style={{ backgroundColor: UI.p }}
          >
            📚 {t('studentPortal.receipt.goRegister', { defaultValue: 'Register courses now' })}
          </Link>
          <Link
            to="/student/payments"
            className="px-4 py-2 rounded-md no-underline"
            style={{ backgroundColor: UI.bg, border: `1px solid ${UI.bdr}`, color: UI.txt }}
          >
            {t('studentPortal.receipt.viewInvoices', { defaultValue: 'View invoices' })}
          </Link>
          <Link
            to="/dashboard"
            className="px-4 py-2 rounded-md no-underline"
            style={{ backgroundColor: UI.bg, border: `1px solid ${UI.bdr}`, color: UI.txt }}
          >
            {t('studentPortal.receipt.home', { defaultValue: 'Home' })}
          </Link>
        </div>

        <div className="mt-6 text-center text-xs" style={{ color: UI.muted }}>
          {t('studentPortal.receipt.printHint', { defaultValue: 'Tip: use Print → Save as PDF.' })}
        </div>
      </div>
    </div>
  )
}

