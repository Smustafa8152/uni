/** Payments an application can show: the application fee and the registration fee. */

export function listApplicationPayments(application) {
  if (!application) return []
  const rows = []
  const feeStatus = String(application.application_fee_status || '')
  if (feeStatus === 'paid' || feeStatus === 'pending') {
    rows.push({
      kind: 'application',
      amount: Number(application.application_fee_amount) || 0,
      currency: application.application_fee_currency || 'USD',
      paid: feeStatus === 'paid',
      paidAt: application.application_fee_paid_at || null,
      method: application.application_fee_payment_method || (feeStatus === 'paid' ? 'online_payment' : ''),
      reference: application.application_fee_reference || '',
      receiptNo: application.application_number ? `AF-${application.application_number}` : '',
    })
  }

  const code = String(application.status_code || '').toUpperCase()
  const regPaid = Boolean(application.registration_fee_paid_at) || code === 'APPC'
  const regWaiting = code === 'APPN' && !application.registration_fee_paid_at
  if (regPaid || regWaiting) {
    const stored = application.registration_fee_amount
    const majorFee = Number(application.majors?.registration_fee)
    const amount = stored == null || stored === ''
      ? (Number.isFinite(majorFee) ? majorFee : 0)
      : Number(stored) || 0
    rows.push({
      kind: 'registration',
      amount,
      currency: 'USD',
      paid: regPaid,
      paidAt: application.registration_fee_paid_at || null,
      method: application.registration_fee_payment_method || (regPaid ? 'online_payment' : ''),
      reference: '',
      receiptNo: application.application_number ? `RF-${application.application_number}` : '',
    })
  }
  return rows
}

export function paymentKindTitleKey(kind) {
  return kind === 'registration' ? 'payments.record.registrationFee' : 'payments.record.applicationFee'
}
