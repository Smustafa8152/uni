/** Payments an application can show: the application fee and the registration fee. */

export function listApplicationPayments(application, askedFee = null) {
  if (!application) return []
  const rows = []
  const feeStatus = String(application.application_fee_status || '')
  if (feeStatus === 'paid' || feeStatus === 'pending') {
    const applicationMethod = application.application_fee_payment_method || (feeStatus === 'paid' ? 'online_payment' : '')
    rows.push({
      kind: 'application',
      amount: Number(application.application_fee_amount) || 0,
      currency: 'GMD',
      paid: feeStatus === 'paid',
      paidAt: application.application_fee_paid_at || null,
      method: applicationMethod,
      reference: application.application_fee_reference || '',
      receiptNo: application.application_number ? `AF-${application.application_number}` : '',
    })
  }

  const code = String(application.status_code || '').toUpperCase()
  const regPaid = Boolean(application.registration_fee_paid_at) || code === 'APPC'
  const regWaiting = code === 'APPN' && !application.registration_fee_paid_at
  if (regPaid || regWaiting) {
    const fromSettings = Number(askedFee)
    const stored = Number(application.registration_fee_amount)
    const amount = regWaiting && Number.isFinite(fromSettings) && fromSettings > 0
      ? fromSettings
      : (Number.isFinite(stored) ? stored : 0)
    const registrationMethod = application.registration_fee_payment_method || (regPaid ? 'online_payment' : '')
    rows.push({
      kind: 'registration',
      amount,
      currency: regWaiting || registrationMethod === 'bank_transfer' ? 'GMD' : 'USD',
      paid: regPaid,
      paidAt: application.registration_fee_paid_at || null,
      method: registrationMethod,
      reference: '',
      receiptNo: application.application_number ? `RF-${application.application_number}` : '',
    })
  }
  return rows
}

export function paymentKindTitleKey(kind) {
  return kind === 'registration' ? 'payments.record.registrationFee' : 'payments.record.applicationFee'
}
