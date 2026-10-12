import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Loader2, Printer } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { APPLICATION_FEE_DEFAULT } from '../../utils/applicationFee'
import { getApplicationFormDefaults } from '../../utils/getApplicationFormDefaults'
import { listApplicationPayments } from '../../utils/applicationPayments'
import ApplicationReceipt from '../../components/payment/ApplicationReceipt'

export default function ApplicationPaymentDetails({ audience = 'applicant' }) {
  const { t } = useTranslation()
  const { id } = useParams()
  const [params] = useSearchParams()
  const { user } = useAuth()
  const { isRTL } = useLanguage()
  const kind = params.get('kind') === 'registration' ? 'registration' : 'application'
  const [application, setApplication] = useState(null)
  const [askedFee, setAskedFee] = useState(APPLICATION_FEE_DEFAULT)
  const [extra, setExtra] = useState({ reference: '', receiptNo: '' })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      const applicationId = Number(id)
      if (!Number.isFinite(applicationId)) {
        setError(t('payments.receipt.notFound'))
        setLoading(false)
        return
      }
      const { data, error: fetchError } = await supabase
        .from('applications')
        .select('*, majors!major_id (name_en, name_ar, registration_fee), colleges!college_id (name_en, name_ar)')
        .eq('id', applicationId)
        .maybeSingle()
      if (cancelled) return
      if (fetchError || !data) {
        setError(t('payments.receipt.notFound'))
        setLoading(false)
        return
      }
      if (audience !== 'staff' && user?.id) {
        const owns = data.applicant_user_id === user.id || String(data.email || '').toLowerCase() === String(user.email || '').toLowerCase()
        if (!owns) {
          setError(t('track.portalAccessDenied', 'You do not have access to this application.'))
          setLoading(false)
          return
        }
      }
      setApplication(data)
      const cfg = await getApplicationFormDefaults().catch(() => null)
      const fee = Number(cfg?.application_fee?.amount)
      if (!cancelled && Number.isFinite(fee) && fee > 0) setAskedFee(fee)

      const reference = { reference: '', receiptNo: '' }
      if (kind === 'registration') {
        const { data: gateway } = await supabase
          .from('registration_fee_payments')
          .select('myfatoorah_payment_id, amount')
          .eq('application_id', applicationId)
          .eq('status', 'paid')
          .order('paid_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        const { data: invoice } = await supabase
          .from('invoices')
          .select('id, invoice_number')
          .eq('application_id', applicationId)
          .order('invoice_date', { ascending: false })
          .limit(1)
          .maybeSingle()
        let paymentNumber = ''
        if (invoice?.id) {
          const { data: payment } = await supabase
            .from('payments')
            .select('payment_number')
            .eq('invoice_id', invoice.id)
            .order('id', { ascending: false })
            .limit(1)
            .maybeSingle()
          paymentNumber = payment?.payment_number || ''
        }
        reference.reference = gateway?.myfatoorah_payment_id || ''
        reference.receiptNo = paymentNumber || invoice?.invoice_number || ''
      } else {
        const { data: gateway } = await supabase
          .from('application_fee_payments')
          .select('myfatoorah_payment_id')
          .eq('application_id', applicationId)
          .eq('status', 'paid')
          .order('paid_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        reference.reference = data.application_fee_reference || gateway?.myfatoorah_payment_id || ''
      }
      if (!cancelled) {
        setExtra(reference)
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id, kind, audience, user?.id, user?.email, t])

  const payment = useMemo(() => {
    const row = listApplicationPayments(application, askedFee).find((item) => item.kind === kind)
    if (!row) return null
    return {
      ...row,
      reference: extra.reference || row.reference,
      receiptNo: extra.receiptNo || row.receiptNo,
    }
  }, [application, askedFee, kind, extra])

  const backTo = audience === 'staff'
    ? `/admissions/applications/${id}`
    : audience === 'student'
      ? `/student/applications/${id}`
      : `/portal/applications/${id}`

  return (
    <div className="mx-auto max-w-3xl px-4 py-6" dir={isRTL ? 'rtl' : 'ltr'}>
      <style>{`@media print { body * { visibility: hidden; } #application-receipt, #application-receipt * { visibility: visible; } #application-receipt { position: absolute; left: 0; top: 0; width: 100%; } }`}</style>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={backTo} className="text-sm font-semibold text-[#1a3a6b] no-underline hover:underline">
          {t('payments.receipt.back')}
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-xl bg-[#1a3a6b] px-4 py-2 text-sm font-semibold text-white"
        >
          <Printer className="h-4 w-4" />
          {t('payments.receipt.print')}
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-[#1a3a6b]" />
        </div>
      ) : error || !payment ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error || t('payments.receipt.notFound')}</p>
      ) : (
        <ApplicationReceipt application={application} payment={payment} isRTL={isRTL} />
      )}
    </div>
  )
}
