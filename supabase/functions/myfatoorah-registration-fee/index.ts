import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { emailPaymentReceipt } from '../_shared/paymentReceiptEmail.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

type Admin = ReturnType<typeof createClient>

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function baseUrl() {
  return (Deno.env.get('MYFATOORAH_BASE_URL') || 'https://apitest.myfatoorah.com').replace(/\/$/, '')
}

async function myfatoorah(path: string, payload: Record<string, unknown>) {
  const key = Deno.env.get('MYFATOORAH_API_KEY') || ''
  if (!key) throw new Error('Payment is not configured.')
  const res = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.IsSuccess === false) {
    const message = body?.Message || body?.ValidationErrors?.[0]?.Error || 'The payment service rejected the request.'
    throw new Error(String(message))
  }
  return body?.Data || body
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
  if (!supabaseUrl || !serviceKey) return json({ error: 'Payment is not configured.' }, 500)

  const admin = createClient(supabaseUrl, serviceKey)
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request.' }, 400)
  }

  const action = String(body.action || '')
  try {
    if (action === 'confirm') return await confirmPayment(admin, supabaseUrl, serviceKey, body)
    if (action !== 'methods' && action !== 'create') return json({ error: 'Unknown action.' }, 400)

    const loaded = await loadPayableApplication(req, admin, anonKey, supabaseUrl, body)
    if (loaded.error) return loaded.error
    if (loaded.alreadyPaid) return json({ alreadyPaid: true, application: loaded.app, methods: [] })

    if (action === 'methods') return await listMethods(loaded.amount, loaded.currency, loaded.app)
    return await createInvoice(req, admin, loaded.app, loaded.amount, loaded.currency, body)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment failed.'
    console.error('myfatoorah-registration-fee:', message)
    return json({ error: message }, 400)
  }
})

async function loadPayableApplication(
  req: Request,
  admin: Admin,
  anonKey: string,
  supabaseUrl: string,
  body: Record<string, unknown>,
) {
  const applicationId = Number(body.applicationId)
  if (!Number.isFinite(applicationId)) return { error: json({ error: 'Application is missing.' }, 400) }

  const authHeader = req.headers.get('Authorization') || ''
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  const user = userData?.user
  if (userErr || !user) return { error: json({ error: 'Sign in to pay the registration fee.' }, 401) }

  const { data: app, error } = await admin
    .from('applications')
    .select('id, email, applicant_user_id, first_name, last_name, phone, application_number, college_id, major_id, status_code, registration_fee_amount, registration_fee_paid_at')
    .eq('id', applicationId)
    .maybeSingle()
  if (error || !app) return { error: json({ error: 'Application not found.' }, 404) }

  const email = String(app.email || '').toLowerCase()
  const owns = app.applicant_user_id === user.id || (email && email === String(user.email || '').toLowerCase())
  if (!owns) return { error: json({ error: 'You cannot pay for this application.' }, 403) }

  if (app.registration_fee_paid_at) return { alreadyPaid: true, app, amount: Number(app.registration_fee_amount) || 0, currency: 'GMD' }
  if (String(app.status_code || '').toUpperCase() !== 'APPN') {
    return { error: json({ error: 'This application is not waiting for the registration fee.' }, 400) }
  }

  const amount = await feeAmount(admin)
  if (!(amount > 0)) return { error: json({ error: 'The registration fee amount is not set.' }, 400) }
  return { app, amount, currency: 'GMD' }
}

/** The amount on the Applications page, Ask for the fee. Status changes do not replace it. */
async function feeAmount(admin: Admin) {
  const { data } = await admin
    .from('university_settings')
    .select('onboarding_settings')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const amount = Number(data?.onboarding_settings?.application_fee?.amount)
  if (Number.isFinite(amount) && amount > 0) return Math.round(amount * 100) / 100
  return 20
}

async function listMethods(amount: number, currency: string, app: Record<string, unknown>) {
  const data = await myfatoorah('/v2/InitiatePayment', { InvoiceAmount: amount, CurrencyIso: currency })
  const methods = (Array.isArray(data?.PaymentMethods) ? data.PaymentMethods : []).map((row: Record<string, unknown>) => ({
    id: row.PaymentMethodId,
    nameEn: row.PaymentMethodEn || '',
    nameAr: row.PaymentMethodAr || '',
    code: row.PaymentMethodCode || '',
    imageUrl: row.ImageUrl || '',
    totalAmount: row.TotalAmount,
    currency: row.CurrencyIso || currency,
  }))
  if (methods.length === 0) throw new Error('No payment methods are available.')
  return json({ methods, amount, currency, application: { id: app.id, application_number: app.application_number } })
}

async function createInvoice(
  req: Request,
  admin: Admin,
  app: Record<string, unknown>,
  amount: number,
  currency: string,
  body: Record<string, unknown>,
) {
  const paymentMethodId = Number(body.paymentMethodId)
  if (!Number.isFinite(paymentMethodId)) return json({ error: 'Choose a payment method.' }, 400)

  const origin = req.headers.get('origin') || ''
  if (!origin) return json({ error: 'Payment could not be started.' }, 400)
  const requested = String(body.returnPath || '')
  const fallback = `/portal/applications/${app.id}`
  const safe = /^\/(portal|student)\/applications\/\d+$/.test(requested) && requested.endsWith(`/${app.id}`)
    ? requested
    : fallback
  const returnUrl = `${origin}${safe}`
  const language = String(body.language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en'
  const name = [app.first_name, app.last_name].filter(Boolean).join(' ').trim() || 'Applicant'

  const data = await myfatoorah('/v2/ExecutePayment', {
    PaymentMethodId: paymentMethodId,
    CustomerName: name,
    InvoiceValue: amount,
    DisplayCurrencyIso: currency,
    CallBackUrl: returnUrl,
    ErrorUrl: `${returnUrl}?failed=1`,
    Language: language,
    CustomerReference: app.application_number || String(app.id),
    CustomerEmail: app.email || undefined,
    UserDefinedField: `registration:${app.id}`,
  })

  const invoiceId = data?.InvoiceId != null ? String(data.InvoiceId) : ''
  const invoiceUrl = data?.PaymentURL || data?.InvoiceURL || ''
  if (!invoiceUrl) throw new Error('Payment link was not created.')

  const { error: insertErr } = await admin.from('registration_fee_payments').insert({
    application_id: app.id,
    amount,
    currency,
    status: 'pending',
    myfatoorah_invoice_id: invoiceId || null,
    invoice_url: invoiceUrl,
    language,
  })
  if (insertErr) throw new Error(insertErr.message)
  return json({ invoiceUrl, invoiceId, applicationId: app.id })
}

function isPaid(data: Record<string, unknown>) {
  if (String(data?.InvoiceStatus || '').toLowerCase() === 'paid') return true
  const tx = Array.isArray(data?.InvoiceTransactions) ? data.InvoiceTransactions : []
  return tx.some((row) => {
    const s = String((row as Record<string, unknown>)?.TransactionStatus || '').toLowerCase()
    return s === 'succss' || s === 'success'
  })
}

async function confirmPayment(admin: Admin, supabaseUrl: string, serviceKey: string, body: Record<string, unknown>) {
  const paymentId = String(body.paymentId || '').trim()
  const applicationId = Number(body.applicationId)
  if (!paymentId) {
    if (Number.isFinite(applicationId)) {
      const { data: app } = await admin
        .from('applications')
        .select('id, application_number, registration_fee_paid_at, registration_fee_amount, status_code')
        .eq('id', applicationId)
        .maybeSingle()
      if (app?.registration_fee_paid_at) return json({ paid: true, alreadyPaid: true, application: app })
    }
    return json({ paid: false })
  }

  const data = await myfatoorah('/v2/GetPaymentStatus', { Key: paymentId, KeyType: 'PaymentId' })
  const invoiceId = data?.InvoiceId != null ? String(data.InvoiceId) : ''
  const paid = isPaid(data as Record<string, unknown>)

  let paymentQuery = admin
    .from('registration_fee_payments')
    .select('id, application_id, amount, currency, language, status')
    .order('created_at', { ascending: false })
    .limit(1)
  paymentQuery = invoiceId
    ? paymentQuery.eq('myfatoorah_invoice_id', invoiceId)
    : paymentQuery.eq('application_id', Number.isFinite(applicationId) ? applicationId : -1)
  const { data: paymentRows } = await paymentQuery
  const payment = paymentRows?.[0]
  if (!payment) return json({ paid: false, error: 'This payment does not match a registration fee.' }, 404)
  if (payment.status === 'paid') {
    const { data: app } = await admin
      .from('applications')
      .select('id, application_number, registration_fee_paid_at, registration_fee_amount, status_code')
      .eq('id', payment.application_id)
      .maybeSingle()
    return json({ paid: true, alreadyPaid: true, application: app })
  }

  const invoiceStatus = String((data as Record<string, unknown>)?.InvoiceStatus || '').toLowerCase()
  if (!paid && (invoiceStatus === 'pending' || invoiceStatus === '')) {
    return json({ paid: false, pending: true, applicationId: payment.application_id })
  }

  if (!paid) {
    await admin
      .from('registration_fee_payments')
      .update({ status: 'failed', myfatoorah_payment_id: paymentId })
      .eq('id', payment.id)
      .eq('status', 'pending')
    return json({ paid: false, applicationId: payment.application_id })
  }

  const paidAt = new Date().toISOString()
  await admin
    .from('registration_fee_payments')
    .update({ status: 'paid', myfatoorah_payment_id: paymentId, paid_at: paidAt })
    .eq('id', payment.id)

  const { data: current } = await admin
    .from('applications')
    .select('id, email, college_id, application_number, status_code, registration_fee_paid_at')
    .eq('id', payment.application_id)
    .maybeSingle()

  if (current && !current.registration_fee_paid_at) {
    const fromStatus = current.status_code || 'APPN'
    const nextStatus = String(fromStatus).toUpperCase() === 'APPN' ? 'APPC' : fromStatus
    await admin
      .from('applications')
      .update({
        registration_fee_amount: payment.amount,
        registration_fee_paid_at: paidAt,
        registration_fee_payment_method: 'online_payment',
        financial_milestone_code: 'PM10',
        status_code: nextStatus,
        status_changed_at: paidAt,
      })
      .eq('id', current.id)
      .is('registration_fee_paid_at', null)

    await admin.from('status_change_audit_log').insert({
      entity_type: 'application',
      entity_id: current.id,
      from_status_code: fromStatus,
      to_status_code: nextStatus,
      trigger_code: 'TRWH',
      triggered_by: null,
      notes: `Registration fee paid: ${payment.amount} ${payment.currency || 'GMD'}.`,
    })

    await recordPaidInvoice(admin, current, Number(payment.amount)).catch((err) => {
      console.error('registration invoice failed:', err?.message || err)
    })

    const { data: mailed } = await admin
      .from('applications')
      .select('id, email, college_id, application_number, first_name, last_name, first_name_ar, majors!major_id(name_en, name_ar)')
      .eq('id', current.id)
      .maybeSingle()
    if (mailed?.email) {
      await emailPaymentReceipt(supabaseUrl, serviceKey, mailed, {
        lang: payment.language,
        kind: 'registration',
        amount: Number(payment.amount),
        currency: payment.currency || 'GMD',
        method: 'online_payment',
        paidAt,
        reference: paymentId,
        receiptNo: mailed.application_number ? `RF-${mailed.application_number}` : '',
      }).catch((err) => console.error('registration receipt email failed:', err?.message || err))
    }
  }

  const { data: app } = await admin
    .from('applications')
    .select('id, application_number, email, registration_fee_paid_at, registration_fee_amount, status_code')
    .eq('id', payment.application_id)
    .maybeSingle()

  return json({ paid: true, application: app })
}

async function recordPaidInvoice(admin: Admin, application: Record<string, unknown>, paidAmount: number) {
  const collegeId = application.college_id
  const applicationId = application.id
  if (!collegeId || !applicationId || !(paidAmount > 0)) return

  const { data: existing } = await admin
    .from('invoices')
    .select('id')
    .eq('application_id', applicationId)
    .maybeSingle()
  if (existing?.id) return

  const { data: invNum, error: invNumErr } = await admin.rpc('generate_invoice_number', { college_id_param: collegeId })
  if (invNumErr) throw new Error(invNumErr.message)

  const paymentDate = new Date().toISOString().split('T')[0]
  const paymentTs = new Date().toISOString()
  const label = `Registration fee — application ${application.application_number || applicationId}`

  const { data: invoice, error: invoiceError } = await admin
    .from('invoices')
    .insert({
      invoice_number: invNum,
      student_id: null,
      application_id: applicationId,
      college_id: collegeId,
      semester_id: null,
      invoice_date: paymentDate,
      invoice_type: 'admission_fee',
      status: 'paid',
      subtotal: paidAmount,
      discount_amount: 0,
      scholarship_amount: 0,
      tax_amount: 0,
      total_amount: paidAmount,
      paid_amount: paidAmount,
      pending_amount: 0,
      payment_method: 'online_payment',
      notes: label,
    })
    .select('id')
    .single()
  if (invoiceError) throw new Error(invoiceError.message)

  const { error: itemError } = await admin.from('invoice_items').insert({
    invoice_id: invoice.id,
    item_type: 'registration_fee',
    item_name_en: 'Registration Fee',
    item_name_ar: 'رسوم التسجيل',
    description: 'Registration fee (application)',
    quantity: 1,
    unit_price: paidAmount,
    discount_amount: 0,
    scholarship_amount: 0,
    total_amount: paidAmount,
    reference_id: applicationId,
    reference_type: 'application',
  })
  if (itemError) throw new Error(itemError.message)

  const { data: payNum, error: payNumErr } = await admin.rpc('generate_payment_number', { college_id_param: collegeId })
  if (payNumErr) throw new Error(payNumErr.message)

  const { error: paymentError } = await admin.from('payments').insert({
    payment_number: payNum,
    invoice_id: invoice.id,
    student_id: null,
    college_id: collegeId,
    payment_date: paymentDate,
    payment_method: 'online_payment',
    amount: paidAmount,
    status: 'verified',
    verified_at: paymentTs,
    notes: label,
  })
  if (paymentError) throw new Error(paymentError.message)
}
