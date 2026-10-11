type ReceiptMail = {
  email?: string | null
  college_id?: number | null
  id?: number | null
  application_number?: string | null
  first_name?: string | null
  last_name?: string | null
  first_name_ar?: string | null
  majors?: { name_en?: string | null; name_ar?: string | null } | { name_en?: string | null; name_ar?: string | null }[] | null
}

function majorName(app: ReceiptMail, lang: 'ar' | 'en') {
  const major = Array.isArray(app.majors) ? app.majors[0] : app.majors
  if (!major) return ''
  if (lang === 'ar') return String(major.name_ar || major.name_en || '')
  return String(major.name_en || major.name_ar || '')
}

function money(amount: number, currency: string) {
  const value = Number.isFinite(amount) ? amount : 0
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency || 'USD'}`
  }
}

function when(value: string, lang: 'ar' | 'en') {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kuwait',
  })
}

export async function emailPaymentReceipt(
  supabaseUrl: string,
  serviceKey: string,
  app: ReceiptMail,
  opts: {
    lang?: string | null
    kind: 'application' | 'registration'
    amount: number
    currency?: string | null
    method?: string | null
    paidAt?: string | null
    reference?: string | null
    receiptNo?: string | null
  },
) {
  const to = String(app.email || '').trim()
  if (!to.includes('@') || !app.id) return
  const requested = String(opts.lang || '').toLowerCase()
  const lang: 'ar' | 'en' = requested.startsWith('ar') ? 'ar' : requested.startsWith('en') ? 'en' : app.first_name_ar ? 'ar' : 'en'
  const kindLabel = opts.kind === 'registration'
    ? (lang === 'ar' ? 'رسوم التسجيل' : 'Registration fee')
    : (lang === 'ar' ? 'رسوم الطلب' : 'Application fee')
  const method = String(opts.method || '')
  const methodLabel = method === 'bank_transfer'
    ? (lang === 'ar' ? 'تحويل بنكي' : 'Bank transfer')
    : (lang === 'ar' ? 'دفع إلكتروني' : 'Online payment')
  const name = [app.first_name, app.last_name].filter(Boolean).join(' ').trim()
  const receiptNo = opts.receiptNo || (app.application_number ? `${opts.kind === 'registration' ? 'RF' : 'AF'}-${app.application_number}` : '')
  const subject = lang === 'ar'
    ? `تم تأكيد الدفع — إيصال ${receiptNo || app.application_number || ''}`.trim()
    : `Payment verified — receipt ${receiptNo || app.application_number || ''}`.trim()
  const message = lang === 'ar'
    ? `تم التحقق من دفعتك. هذا إيصال ${kindLabel}.`
    : `Your payment has been verified. This is your ${kindLabel.toLowerCase()} receipt.`
  const labels = lang === 'ar'
    ? { receipt: 'رقم الإيصال', applicant: 'المتقدم', application: 'رقم الطلب', program: 'البرنامج', amount: 'المبلغ', method: 'طريقة الدفع', paidOn: 'تاريخ الدفع', reference: 'المرجع', status: 'الحالة', verified: 'تم التحقق من الدفع' }
    : { receipt: 'Receipt number', applicant: 'Applicant', application: 'Application number', program: 'Program', amount: 'Amount', method: 'Method', paidOn: 'Paid on', reference: 'Reference', status: 'Status', verified: 'Payment verified' }
  const details = [
    { label: labels.receipt, value: receiptNo },
    { label: labels.applicant, value: name },
    { label: labels.application, value: String(app.application_number || '') },
    { label: labels.program, value: majorName(app, lang) },
    { label: labels.amount, value: money(Number(opts.amount), opts.currency || 'USD') },
    { label: labels.method, value: methodLabel },
    { label: labels.paidOn, value: opts.paidAt ? when(opts.paidAt, lang) : '' },
    { label: labels.reference, value: String(opts.reference || '') },
    { label: labels.status, value: labels.verified },
  ].filter((row) => row.value)

  await fetch(`${supabaseUrl}/functions/v1/send-admission-notification`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      scope: 'college',
      collegeId: app.college_id ?? null,
      to,
      type: 'payment_verified',
      language: lang,
      subject,
      message,
      details,
      applicationId: app.id,
      application: { id: app.id, application_number: app.application_number },
    }),
  })
}
