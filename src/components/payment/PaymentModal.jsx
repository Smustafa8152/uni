import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { X, CreditCard, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { calculateFinancialMilestone } from '../../utils/financePermissions'
import { resolveRegistrationFeeAmount } from '../../utils/resolveRegistrationFeeAmount'
import { createApplicationRegistrationInvoice } from '../../utils/createApplicationRegistrationInvoice'
import { listRegistrationFeeMethods, startRegistrationFeeCheckout } from '../../utils/registrationFee'
import { formatApplicationFee, onlyPaymentChannel, selectedPaymentChannels } from '../../utils/applicationFee'
import { getApplicationFormDefaults } from '../../utils/getApplicationFormDefaults'
import BankTransferPanel, { PaymentChannelChoice } from './BankTransferPanel'

export default function PaymentModal({ isOpen, onClose, application, invoice, student, onPaymentSuccess, purpose = 'registration' }) {
  const { t } = useTranslation()
  const { language, isRTL } = useLanguage()
  const useGateway = Boolean(application && !invoice && purpose !== 'tuition')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('online')
  const [amount, setAmount] = useState(0)
  const [methods, setMethods] = useState([])
  const [methodsLoading, setMethodsLoading] = useState(false)
  const [payingId, setPayingId] = useState(null)
  const [channel, setChannel] = useState(null)
  const [channels, setChannels] = useState({ myfatoorah: true, bankTransfer: true })
  const [channelsReady, setChannelsReady] = useState(false)
  const [bankSent, setBankSent] = useState(false)
  const [paymentDetails, setPaymentDetails] = useState({
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    cardholderName: ''
  })

  useEffect(() => {
    if (isOpen) {
      setBankSent(false)
      setChannelsReady(false)
      getApplicationFormDefaults()
        .then((cfg) => {
          const next = selectedPaymentChannels(cfg?.application_fee)
          setChannels(next)
          setChannel(onlyPaymentChannel(cfg?.application_fee))
        })
        .catch(() => {
          setChannels({ myfatoorah: true, bankTransfer: true })
          setChannel(null)
        })
        .finally(() => setChannelsReady(true))
      if (invoice) {
        // Payment for an invoice
        setAmount(parseFloat(invoice.pending_amount || invoice.total_amount || 0))
      } else if (application) {
        // Payment for application (registration or tuition)
        if (purpose === 'tuition') {
          const a = parseFloat(application.tuition_fee_amount || 0)
          setAmount(Number.isFinite(a) && a > 0 ? a : 0)
        } else {
          fetchRegistrationFee()
        }
      }
    }
  }, [isOpen, application, invoice, purpose])

  useEffect(() => {
    if (!isOpen || !useGateway || channel !== 'online' || !application?.id) return
    let cancelled = false
    setMethodsLoading(true)
    setError('')
    setMethods([])
    listRegistrationFeeMethods(supabase, { applicationId: application.id })
      .then((result) => {
        if (cancelled) return
        if (result?.alreadyPaid) {
          if (onPaymentSuccess) onPaymentSuccess(null, null)
          onClose()
          return
        }
        if (result?.amount) setAmount(Number(result.amount))
        setMethods(result?.methods || [])
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || t('payments.gatewayFailed'))
      })
      .finally(() => {
        if (!cancelled) setMethodsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [isOpen, useGateway, channel, application?.id, t])

  const payWithGateway = async (methodId) => {
    if (!application?.id) return
    setPayingId(methodId)
    setError('')
    try {
      const returnPath = window.location.pathname.startsWith('/student/')
        ? `/student/applications/${application.id}`
        : `/portal/applications/${application.id}`
      const result = await startRegistrationFeeCheckout(supabase, {
        applicationId: application.id,
        paymentMethodId: methodId,
        language,
        returnPath,
      })
      if (result?.alreadyPaid) {
        if (onPaymentSuccess) onPaymentSuccess(null, null)
        onClose()
        setPayingId(null)
      }
    } catch (err) {
      setError(err?.message || t('payments.gatewayFailed'))
      setPayingId(null)
    }
  }

  const fetchRegistrationFee = async () => {
    try {
      const resolved = await resolveRegistrationFeeAmount(application)
      setAmount(resolved)
    } catch (err) {
      console.error('Error fetching registration fee:', err)
      setAmount(100)
    }
  }

  const handlePayment = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess(false)
    setLoading(true)

    try {
      if (paymentMethod === 'online') {
        // Validate card details
        if (!paymentDetails.cardNumber || !paymentDetails.expiryDate || !paymentDetails.cvv) {
          setError('Please fill in all card details')
          setLoading(false)
          return
        }

        // In a real application, this would integrate with a payment gateway
        // For now, we'll simulate a successful payment
        await processPayment()
      } else {
        // Bank transfer - show instructions
        setError('Bank transfer instructions will be shown. Please contact finance office for manual payment processing.')
        setLoading(false)
        return
      }
    } catch (err) {
      console.error('Payment error:', err)
      setError(err.message || 'Payment processing failed. Please try again.')
      setLoading(false)
    }
  }

  const processPayment = async () => {
    try {
      let targetInvoice = invoice
      let paymentRecord = null

      if (invoice) {
        // Payment for an existing invoice
        const paymentNumber = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`
        
        // Get student_id and college_id (payments.college_id is NOT NULL)
        let studentId = student?.id || invoice.student_id
        let collegeId = student?.college_id || invoice.college_id

        if (!studentId || collegeId == null) {
          const { data: invoiceData, error: invError } = await supabase
            .from('invoices')
            .select('student_id, college_id')
            .eq('id', invoice.id)
            .single()
          if (invError) throw invError
          if (!studentId) studentId = invoiceData.student_id
          if (collegeId == null) collegeId = invoiceData.college_id
        }

        if (collegeId == null) {
          throw new Error('Could not determine college for this invoice. Please try again or contact support.')
        }
        
        const { data: payment, error: paymentError } = await supabase
          .from('payments')
          .insert({
            payment_number: paymentNumber,
            invoice_id: invoice.id,
            student_id: studentId,
            college_id: collegeId,
            payment_date: new Date().toISOString().split('T')[0],
            payment_method: 'online_payment',
            amount: amount,
            status: 'verified', // In production, this would start as 'pending' and be verified by webhook
            verified_at: new Date().toISOString(),
            notes: `Payment for invoice ${invoice.invoice_number}`
          })
          .select()
          .single()

        if (paymentError) throw paymentError
        paymentRecord = payment

        // Send receipt email (best effort)
        try {
          const invNo = invoice?.invoice_number || invoice.id
          const paid = Number(amount || 0)
          const currency = invoice?.currency || ''
          let toEmail = (student?.email || '').trim()
          if (!toEmail && studentId) {
            const { data: sRow } = await supabase.from('students').select('email').eq('id', studentId).maybeSingle()
            toEmail = String(sRow?.email || '').trim()
          }
          const subject = t('payments.receiptEmailSubject', 'Payment received')
          const message = t(
            'payments.receiptEmailMessage',
            'We received your payment of {{amount}} for invoice {{invoiceNumber}}. You can view your receipt in Student Portal → Payments.',
            {
              amount: `${currency ? `${currency} ` : ''}${paid.toFixed(2)}`,
              invoiceNumber: String(invNo),
            },
          )
          if (toEmail) {
            await supabase.functions.invoke('send-admission-notification', {
              body: {
                type: 'payment_received',
                scope: 'college',
                to: toEmail,
                collegeId: collegeId,
                subject,
                message,
              },
            })
          }
        } catch (e) {
          console.warn('Receipt email failed:', e)
        }

        // Trigger should update invoice, but we'll also update it manually
        // Note: Invoice status is automatically updated by database trigger when payment is inserted
        // We just need to ensure the payment is inserted correctly
        // The trigger will handle updating invoice.paid_amount, pending_amount, and status

        // Update student financial milestone if student exists (per semester).
        // Include admission_fee: updateStudentFinancialMilestone excludes admission from tuition %.
        if (studentId && invoice.semester_id) {
          await updateStudentFinancialMilestone(studentId, invoice.semester_id)
        }
        
        setSuccess(true)
        setTimeout(() => {
          if (onPaymentSuccess) {
            onPaymentSuccess(null, paymentRecord)
          }
          onClose()
        }, 2000)
        return
      }
      
      if (application) {
        // Payment for application — registration fee OR tuition fee (pre-student)
        const isTuition = purpose === 'tuition'
        const paidAmount = isTuition ? parseFloat(application.tuition_fee_amount || 0) : await resolveRegistrationFeeAmount(application)
        if (!Number.isFinite(paidAmount) || paidAmount <= 0) {
          throw new Error(
            isTuition
              ? t('payments.tuitionAmountMissing', 'Tuition fee amount is not set for this application.')
              : t('payments.amountMissing', 'Payment amount is not available.')
          )
        }
        const newMilestone = 'PM10'
        const paymentDate = new Date().toISOString()
        const methodEnum = paymentMethod === 'online' ? 'online_payment' : 'bank_transfer'

        const { error: updateError } = await supabase
          .from('applications')
          .update({
            ...(isTuition
              ? {
                  tuition_fee_amount: paidAmount,
                  tuition_fee_paid_at: paymentDate,
                  tuition_fee_payment_method: methodEnum,
                }
              : {
                  financial_milestone_code: newMilestone,
                  status_code: application.status_code === 'APPN' ? 'APPC' : application.status_code,
                  status_changed_at: paymentDate,
                  registration_fee_amount: paidAmount,
                  registration_fee_paid_at: paymentDate,
                  registration_fee_payment_method: methodEnum,
                }),
          })
          .eq('id', application.id)

        if (updateError) throw updateError

        const { error: logError } = await supabase
          .from('status_change_audit_log')
          .insert({
            entity_type: 'application',
            entity_id: application.id,
            from_status_code: application.status_code,
            to_status_code: application.status_code === 'APPN' ? 'APPC' : application.status_code,
            transition_reason_code: null,
            trigger_code: isTuition ? 'TRTP' : 'TRWH',
            notes: `${isTuition ? 'Tuition fee' : 'Registration fee'} payment received: ${
              isTuition ? `$${Number(paidAmount).toFixed(2)}` : formatApplicationFee(paidAmount)
            } via ${paymentMethod === 'online' ? 'online payment' : 'bank transfer'}`,
          })

        if (logError) console.error('Error logging status change:', logError)

        if (!isTuition) {
          let invoiceCreateFailed = false
          try {
            await createApplicationRegistrationInvoice(
              { ...application, registration_fee_amount: paidAmount },
              paidAmount,
              methodEnum
            )
          } catch (invoiceErr) {
            console.error('Application registration invoice error:', invoiceErr)
            invoiceCreateFailed = true
            setError(
              t(
                'payments.invoiceCreateFailed',
                'Payment was recorded, but the invoice could not be generated. Please contact the finance office with your application number.'
              )
            )
          }

          if (invoiceCreateFailed) {
            return
          }
        }
        
        paymentRecord = {
          id: Date.now(),
          amount: paidAmount,
          status: 'verified',
          payment_number: `APP-PAY-${Date.now()}`,
        }

        setSuccess(true)
        setTimeout(() => {
          if (onPaymentSuccess) {
            onPaymentSuccess(newMilestone, paymentRecord)
          }
          onClose()
        }, 2000)
        return
      }

      setSuccess(true)
      setTimeout(() => {
        if (onPaymentSuccess) {
          onPaymentSuccess(null, paymentRecord)
        }
        onClose()
      }, 2000)
    } catch (err) {
      console.error('Payment processing error:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const updateStudentFinancialMilestone = async (studentId, semesterId) => {
    if (!semesterId) {
      console.warn('No semester ID provided for milestone calculation in PaymentModal')
      return
    }

    try {
      // Fetch all invoices for this student for the specific semester (excluding admission fees)
      const { data: semesterInvoices, error: invoicesError } = await supabase
        .from('invoices')
        .select('id, total_amount, paid_amount, status, invoice_type, parent_invoice_id')
        .eq('student_id', studentId)
        .eq('semester_id', semesterId)
        .neq('invoice_type', 'admission_fee')

      if (invoicesError) {
        console.error('Error fetching invoices for milestone calculation:', invoicesError)
        return
      }

      // Calculate total due and total paid for this semester
      // Handle payment portions:
      // - If invoice has children, DO NOT count the parent (children are the payable invoices).
      // - Count child invoices and standalone invoices.
      let totalDue = 0
      let totalPaid = 0
      const parentInvoiceIds = new Set()

      semesterInvoices?.forEach((inv) => {
        if (!inv.parent_invoice_id) {
          const hasChildren = semesterInvoices.some((c) => c.parent_invoice_id === inv.id)
          if (hasChildren) parentInvoiceIds.add(inv.id)
        }
      })

      semesterInvoices?.forEach((inv) => {
        if (parentInvoiceIds.has(inv.id)) return
        totalDue += parseFloat(inv.total_amount || 0)
        if (inv.status === 'paid' || inv.status === 'partially_paid') {
          totalPaid += parseFloat(inv.paid_amount || 0)
        }
      })

      // Calculate new financial milestone for this semester
      const newMilestone = calculateFinancialMilestone(totalPaid, totalDue)

      // Update or insert student semester financial status
      const { data: existingRecord, error: checkError } = await supabase
        .from('student_semester_financial_status')
        .select('id')
        .eq('student_id', studentId)
        .eq('semester_id', semesterId)
        .maybeSingle() // Use maybeSingle() to return null instead of throwing error when no record exists

      if (checkError) {
        console.error('Error checking existing record:', checkError)
      }

      if (existingRecord) {
        // Update existing record
        const { error: updateError } = await supabase
          .from('student_semester_financial_status')
          .update({
            financial_milestone_code: newMilestone,
            total_due: totalDue,
            total_paid: totalPaid,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingRecord.id)

        if (updateError) {
          console.error('Error updating student semester financial milestone:', updateError)
        }
      } else {
        // Insert new record
        const { error: insertError } = await supabase
          .from('student_semester_financial_status')
          .insert({
            student_id: studentId,
            semester_id: semesterId,
            financial_milestone_code: newMilestone,
            total_due: totalDue,
            total_paid: totalPaid
          })

        if (insertError) {
          console.error('Error creating student semester financial milestone:', insertError)
        }
      }

      // PM100 → Clear financial holds if all active semesters are paid
      if (newMilestone === 'PM100') {
        const { data: allSemesterStatuses } = await supabase
          .from('student_semester_financial_status')
          .select('financial_milestone_code')
          .eq('student_id', studentId)

        const allPaid = allSemesterStatuses?.every(status => status.financial_milestone_code === 'PM100')

        if (allPaid) {
          await supabase
            .from('students')
            .update({
              financial_hold_reason_code: null
            })
            .eq('id', studentId)
        }
      }
    } catch (err) {
      console.error('Error updating student financial milestone:', err)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">
            {invoice ? t('payments.payNow') : t('payments.payRegistrationFee')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Payment Summary */}
          <div className="bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-600">
                {invoice ? `${t('payments.invoiceNumber')} ${invoice.invoice_number}` : t('payments.registrationFee')}
              </span>
              <span className="text-2xl font-bold text-gray-900">
                {invoice || purpose === 'tuition' ? `$${amount.toFixed(2)}` : formatApplicationFee(amount)}
              </span>
            </div>
            {invoice && (
              <p className="text-sm text-gray-500">
                {t('payments.total')}: ${invoice.total_amount?.toFixed(2)} • {t('payments.paid')}: ${invoice.paid_amount?.toFixed(2)} • {t('payments.pending')}: ${invoice.pending_amount?.toFixed(2)}
              </p>
            )}
            {application && (
              <p className="text-sm text-gray-500">{t('public.status.applicationNumber')}: {application.application_number}</p>
            )}
          </div>

          {useGateway ? (
            <div className="space-y-4" dir={isRTL ? 'rtl' : 'ltr'}>
              {bankSent ? (
                <div className="space-y-4">
                  <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{t('payments.bank.submitted')}</p>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        if (onPaymentSuccess) onPaymentSuccess(null, null)
                        onClose()
                      }}
                      className="rounded-xl bg-[#1a3a6b] px-6 py-3 text-sm font-semibold text-white"
                    >
                      {t('common.close', 'Close')}
                    </button>
                  </div>
                </div>
              ) : !channelsReady ? (
                <div className="flex items-center justify-center py-8 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : channel == null ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700">{t('payments.bank.choose')}</p>
                  <PaymentChannelChoice
                    isRTL={isRTL}
                    myfatoorah={channels.myfatoorah}
                    bankTransfer={channels.bankTransfer}
                    onOnline={() => setChannel('online')}
                    onBank={() => setChannel('bank')}
                  />
                </div>
              ) : channel === 'bank' ? (
                <div className="space-y-3">
                  {channels.myfatoorah && (
                    <button type="button" onClick={() => setChannel(null)} className="text-sm font-semibold text-[#1a3a6b]">
                      {t('payments.bank.back')}
                    </button>
                  )}
                  <BankTransferPanel
                    applicationId={application.id}
                    feeKind="registration"
                    amount={amount}
                    currency="GMD"
                    isRTL={isRTL}
                    onSubmitted={() => setBankSent(true)}
                  />
                </div>
              ) : (
              <div className="space-y-4">
              {channels.bankTransfer && (
                <button type="button" onClick={() => setChannel(null)} className="text-sm font-semibold text-[#1a3a6b]">
                  {t('payments.bank.back')}
                </button>
              )}
              <div>
                <p className="text-sm font-medium text-gray-700">{t('payments.paymentMethod')}</p>
                <p className="mt-1 text-sm text-gray-500">{t('payments.gatewayContinue')}</p>
              </div>
              {methodsLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>{t('payments.gatewayLoading')}</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {methods.map((method) => {
                    const name = isRTL && method.nameAr ? method.nameAr : method.nameEn || method.nameAr
                    const busy = payingId === method.id
                    return (
                      <button
                        key={method.id}
                        type="button"
                        disabled={payingId != null}
                        onClick={() => payWithGateway(method.id)}
                        className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-start transition hover:border-primary-500 hover:bg-primary-50 disabled:opacity-60"
                      >
                        {method.imageUrl ? (
                          <img src={method.imageUrl} alt="" className="h-10 w-16 object-contain" />
                        ) : (
                          <span className="flex h-10 w-16 items-center justify-center rounded-lg bg-gray-100 text-xs font-bold text-gray-500">
                            {method.code || '—'}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 font-semibold text-gray-900">{name}</span>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin text-primary-600" /> : null}
                      </button>
                    )
                  })}
                </div>
              )}
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>
              )}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-gray-300 px-6 py-3 hover:bg-gray-50"
                  disabled={payingId != null}
                >
                  {t('common.cancel')}
                </button>
              </div>
              </div>
              )}
            </div>
          ) : (
          <>
          {/* Payment Method Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">{t('payments.paymentMethod')}</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setPaymentMethod('online')}
                className={`p-4 border-2 rounded-xl transition-all ${
                  paymentMethod === 'online'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <CreditCard className="w-6 h-6 mx-auto mb-2 text-primary-600" />
                <span className="font-semibold">{t('payments.onlinePayment')}</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('bank')}
                className={`p-4 border-2 rounded-xl transition-all ${
                  paymentMethod === 'bank'
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <CreditCard className="w-6 h-6 mx-auto mb-2 text-primary-600" />
                <span className="font-semibold">{t('payments.bankTransfer')}</span>
              </button>
            </div>
          </div>

          {/* Payment Form */}
          {paymentMethod === 'online' && (
            <form onSubmit={handlePayment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('payments.cardholderName')}</label>
                <input
                  type="text"
                  value={paymentDetails.cardholderName}
                  onChange={(e) => setPaymentDetails({ ...paymentDetails, cardholderName: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500"
                  placeholder={t('payments.cardholderName')}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('payments.cardNumber')}</label>
                <input
                  type="text"
                  value={paymentDetails.cardNumber}
                  onChange={(e) => setPaymentDetails({ ...paymentDetails, cardNumber: e.target.value.replace(/\D/g, '').slice(0, 16) })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 font-mono"
                  placeholder="1234 5678 9012 3456"
                  maxLength="19"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('payments.expiryDate')}</label>
                  <input
                    type="text"
                    value={paymentDetails.expiryDate}
                    onChange={(e) => {
                      let value = e.target.value.replace(/\D/g, '')
                      if (value.length >= 2) {
                        value = value.slice(0, 2) + '/' + value.slice(2, 4)
                      }
                      setPaymentDetails({ ...paymentDetails, expiryDate: value })
                    }}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 font-mono"
                    placeholder="MM/YY"
                    maxLength="5"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('payments.cvv')}</label>
                  <input
                    type="text"
                    value={paymentDetails.cvv}
                    onChange={(e) => setPaymentDetails({ ...paymentDetails, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 font-mono"
                    placeholder="123"
                    maxLength="4"
                    required
                  />
                </div>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-yellow-800">
                    {t('payments.demoPaymentNotice')}
                  </p>
                </div>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-800">
                  {error}
                </div>
              )}

              {/* Success Message */}
              {success && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                  <div className="flex items-center space-x-2 text-green-800">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-semibold">Payment successful! Redirecting...</span>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="flex items-center justify-end space-x-4 pt-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
                  disabled={loading}
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={loading || success}
                  className="flex items-center space-x-2 px-6 py-3 bg-primary-gradient text-white rounded-xl font-semibold shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>{t('payments.processing')}</span>
                    </>
                  ) : success ? (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      <span>{t('payments.paymentSuccess')}</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      <span>{t('payments.payNow')} ${amount.toFixed(2)}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {paymentMethod === 'bank' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
                <h3 className="font-semibold text-blue-900 mb-4">{t('payments.bankTransferInstructions')}</h3>
                <div className="space-y-2 text-sm text-blue-800">
                  <p><strong>{t('payments.accountName')}:</strong> University Finance Office</p>
                  <p><strong>{t('payments.accountNumber')}:</strong> 1234567890</p>
                  <p><strong>{t('payments.bankName')}:</strong> Example Bank</p>
                  <p><strong>{t('payments.swiftCode')}:</strong> EXMPUS33</p>
                  {invoice && (
                    <p><strong>{t('payments.reference')}:</strong> {invoice.invoice_number}</p>
                  )}
                  {application && (
                    <p><strong>{t('payments.reference')}:</strong> {application.application_number}</p>
                  )}
                  <p className="mt-4"><strong>{t('payments.total')}:</strong> ${amount.toFixed(2)}</p>
                </div>
                <p className="mt-4 text-sm text-blue-700">
                  {t('payments.bankTransferNote')}
                </p>
              </div>
              <div className="flex items-center justify-end space-x-4">
                <button
                  onClick={onClose}
                  className="px-6 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
                >
                  {t('common.close')}
                </button>
              </div>
            </div>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  )
}

