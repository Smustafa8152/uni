function money(amount, currency = 'USD') {
  const value = Number(amount)
  const safe = Number.isFinite(value) ? value : 0
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(safe)
  } catch {
    return `${safe.toFixed(2)} ${currency || 'USD'}`
  }
}

function when(value, lang) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export async function sendPaymentReceiptEmail(supabase, { application, kind, amount, currency, method, paidAt, reference, receiptNo, lang }) {
  const to = String(application?.email || '').trim()
  if (!to.includes('@') || !application?.id) return
  const arabic = String(lang || '').toLowerCase().startsWith('ar') || Boolean(application.first_name_ar)
  const language = arabic ? 'ar' : 'en'
  const kindLabel = kind === 'registration'
    ? (language === 'ar' ? 'رسوم التسجيل' : 'Registration fee')
    : (language === 'ar' ? 'رسوم الطلب' : 'Application fee')
  const methodLabel = method === 'bank_transfer'
    ? (language === 'ar' ? 'تحويل بنكي' : 'Bank transfer')
    : (language === 'ar' ? 'دفع إلكتروني' : 'Online payment')
  const name = [application.first_name, application.last_name].filter(Boolean).join(' ').trim()
  const program = language === 'ar'
    ? application.majors?.name_ar || application.majors?.name_en || ''
    : application.majors?.name_en || application.majors?.name_ar || ''
  const number = receiptNo || (application.application_number ? `${kind === 'registration' ? 'RF' : 'AF'}-${application.application_number}` : '')
  const labels = language === 'ar'
    ? { receipt: 'رقم الإيصال', applicant: 'المتقدم', application: 'رقم الطلب', program: 'البرنامج', amount: 'المبلغ', method: 'طريقة الدفع', paidOn: 'تاريخ الدفع', reference: 'المرجع', status: 'الحالة', verified: 'تم التحقق من الدفع' }
    : { receipt: 'Receipt number', applicant: 'Applicant', application: 'Application number', program: 'Program', amount: 'Amount', method: 'Method', paidOn: 'Paid on', reference: 'Reference', status: 'Status', verified: 'Payment verified' }
  const details = [
    [labels.receipt, number],
    [labels.applicant, name],
    [labels.application, application.application_number || ''],
    [labels.program, program],
    [labels.amount, money(amount, currency || 'USD')],
    [labels.method, methodLabel],
    [labels.paidOn, paidAt ? when(paidAt, language) : ''],
    [labels.reference, reference || ''],
    [labels.status, labels.verified],
  ].filter(([, value]) => value).map(([label, value]) => ({ label, value: String(value) }))

  const { data, error } = await supabase.functions.invoke('send-admission-notification', {
    body: {
      scope: 'college',
      collegeId: application.college_id ?? null,
      to,
      type: 'payment_verified',
      language,
      subject: language === 'ar'
        ? `تم تأكيد الدفع — إيصال ${number || application.application_number || ''}`.trim()
        : `Payment verified — receipt ${number || application.application_number || ''}`.trim(),
      message: language === 'ar'
        ? `تم التحقق من دفعتك. هذا إيصال ${kindLabel}.`
        : `Your payment has been verified. This is your ${kindLabel.toLowerCase()} receipt.`,
      details,
      applicationId: application.id,
      application: { id: application.id, application_number: application.application_number },
    },
  })
  if (error) throw error
  if (data?.error) throw new Error(String(data.error))
}
