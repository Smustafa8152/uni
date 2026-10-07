import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

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
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
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
    if (action === 'methods') return await listMethods(req, admin, anonKey, supabaseUrl, body)
    if (action === 'create') return await createInvoice(req, admin, anonKey, supabaseUrl, body)
    if (action === 'confirm') return await confirmPayment(admin, supabaseUrl, serviceKey, body)
    return json({ error: 'Unknown action.' }, 400)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment failed.'
    console.error('myfatoorah-application-fee:', message)
    return json({ error: message }, 400)
  }
})

async function loadPayableApplication(
  req: Request,
  admin: ReturnType<typeof createClient>,
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
  if (userErr || !user) return { error: json({ error: 'Sign in to pay the application fee.' }, 401) }

  const { data: app, error } = await admin
    .from('applications')
    .select('id, email, applicant_user_id, first_name, last_name, phone, application_number, application_fee_status, application_fee_amount, application_fee_currency, application_fee_paid_at, application_fee_reference, status_code')
    .eq('id', applicationId)
    .maybeSingle()
  if (error || !app) return { error: json({ error: 'Application not found.' }, 404) }

  const email = String(app.email || '').toLowerCase()
  const owns = app.applicant_user_id === user.id || (email && email === String(user.email || '').toLowerCase())
  if (!owns) return { error: json({ error: 'You cannot pay for this application.' }, 403) }
  return { app }
}

async function listMethods(
  req: Request,
  admin: ReturnType<typeof createClient>,
  anonKey: string,
  supabaseUrl: string,
  body: Record<string, unknown>,
) {
  const loaded = await loadPayableApplication(req, admin, anonKey, supabaseUrl, body)
  if (loaded.error) return loaded.error
  const app = loaded.app
  if (app.application_fee_status === 'paid') {
    return json({ alreadyPaid: true, application: app, methods: [] })
  }
  if (app.application_fee_status !== 'pending' || String(app.status_code || '').toUpperCase() !== 'APFP') {
    return json({ error: 'This application does not have a fee waiting.' }, 400)
  }
  const amount = Number(app.application_fee_amount)
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'The application fee amount is not set.' }, 400)
  const currency = String(app.application_fee_currency || 'USD')

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
  return json({ methods, application: app, amount, currency })
}

async function createInvoice(
  req: Request,
  admin: ReturnType<typeof createClient>,
  anonKey: string,
  supabaseUrl: string,
  body: Record<string, unknown>,
) {
  const loaded = await loadPayableApplication(req, admin, anonKey, supabaseUrl, body)
  if (loaded.error) return loaded.error
  const app = loaded.app
  if (app.application_fee_status === 'paid') return json({ alreadyPaid: true, applicationId: app.id, application: app })
  if (app.application_fee_status !== 'pending' || String(app.status_code || '').toUpperCase() !== 'APFP') {
    return json({ error: 'This application does not have a fee waiting.' }, 400)
  }

  const paymentMethodId = Number(body.paymentMethodId)
  if (!Number.isFinite(paymentMethodId)) return json({ error: 'Choose a payment method.' }, 400)

  const amount = Number(app.application_fee_amount)
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'The application fee amount is not set.' }, 400)

  const origin = req.headers.get('origin') || ''
  if (!origin) return json({ error: 'Payment could not be started.' }, 400)
  const returnUrl = `${origin}/apply/payment-result?application=${app.id}`
  const language = String(body.language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en'
  const name = [app.first_name, app.last_name].filter(Boolean).join(' ').trim() || 'Applicant'
  const currency = String(app.application_fee_currency || 'USD')

  const data = await myfatoorah('/v2/ExecutePayment', {
    PaymentMethodId: paymentMethodId,
    CustomerName: name,
    InvoiceValue: amount,
    DisplayCurrencyIso: currency,
    CallBackUrl: returnUrl,
    ErrorUrl: `${returnUrl}&failed=1`,
    Language: language === 'ar' ? 'ar' : 'en',
    CustomerReference: app.application_number || String(app.id),
    CustomerEmail: app.email || undefined,
    UserDefinedField: String(app.id),
  })

  const invoiceId = data?.InvoiceId != null ? String(data.InvoiceId) : ''
  const invoiceUrl = data?.PaymentURL || data?.InvoiceURL || ''
  if (!invoiceUrl) throw new Error('Payment link was not created.')

  const { error: insertErr } = await admin.from('application_fee_payments').insert({
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
  const status = String(data?.InvoiceStatus || '').toLowerCase()
  if (status === 'paid') return true
  const tx = Array.isArray(data?.InvoiceTransactions) ? data.InvoiceTransactions : []
  return tx.some((row) => {
    const s = String((row as Record<string, unknown>)?.TransactionStatus || '').toLowerCase()
    return s === 'succss' || s === 'success'
  })
}

async function confirmPayment(
  admin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string,
  body: Record<string, unknown>,
) {
  const paymentId = String(body.paymentId || '').trim()
  const applicationId = Number(body.applicationId)
  if (!paymentId) {
    if (Number.isFinite(applicationId)) {
      const { data: app } = await admin
        .from('applications')
        .select('id, application_number, application_fee_status, application_fee_amount, application_fee_currency, application_fee_paid_at, application_fee_reference')
        .eq('id', applicationId)
        .maybeSingle()
      if (app?.application_fee_status === 'paid') return json({ paid: true, alreadyPaid: true, application: app })
    }
    return json({ paid: false })
  }

  const data = await myfatoorah('/v2/GetPaymentStatus', { Key: paymentId, KeyType: 'PaymentId' })
  const invoiceId = data?.InvoiceId != null ? String(data.InvoiceId) : ''
  const paid = isPaid(data as Record<string, unknown>)

  let paymentQuery = admin.from('application_fee_payments').select('id, application_id, language, status').order('created_at', { ascending: false }).limit(1)
  paymentQuery = invoiceId
    ? paymentQuery.eq('myfatoorah_invoice_id', invoiceId)
    : paymentQuery.eq('application_id', Number.isFinite(applicationId) ? applicationId : -1)
  const { data: paymentRows } = await paymentQuery
  const payment = paymentRows?.[0]
  if (!payment) return json({ paid: false, error: 'This payment does not match an application.' }, 404)

  const invoiceStatus = String((data as Record<string, unknown>)?.InvoiceStatus || '').toLowerCase()
  if (!paid && (invoiceStatus === 'pending' || invoiceStatus === '')) {
    return json({ paid: false, pending: true, applicationId: payment.application_id })
  }

  if (!paid) {
    await admin
      .from('application_fee_payments')
      .update({ status: 'failed', myfatoorah_payment_id: paymentId })
      .eq('id', payment.id)
      .eq('status', 'pending')
    return json({ paid: false, applicationId: payment.application_id })
  }

  await admin
    .from('application_fee_payments')
    .update({ status: 'paid', myfatoorah_payment_id: paymentId, paid_at: new Date().toISOString() })
    .eq('id', payment.id)

  const { data: updated } = await admin
    .from('applications')
    .update({
      status_code: 'APSB',
      status: 'pending',
      application_fee_status: 'paid',
      application_fee_paid_at: new Date().toISOString(),
      application_fee_reference: paymentId,
      status_changed_at: new Date().toISOString(),
    })
    .eq('id', payment.application_id)
    .eq('application_fee_status', 'pending')
    .select('id, email, college_id, application_number')
    .maybeSingle()

  if (updated?.id && updated.email) {
    const lang = String(payment.language || 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en'
    const appNo = updated.application_number || String(updated.id)
    await fetch(`${supabaseUrl}/functions/v1/send-admission-notification`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scope: 'college',
        collegeId: updated.college_id ?? null,
        to: updated.email,
        type: 'submitted',
        language: lang,
        subject: lang === 'ar' ? `استلمنا طلبك رقم ${appNo}` : `We received your application ${appNo}`,
        applicationId: updated.id,
        application: { id: updated.id, application_number: updated.application_number },
      }),
    }).catch((err) => console.error('submitted email failed:', err?.message || err))

    await admin.from('status_change_audit_log').insert({
      entity_type: 'application',
      entity_id: updated.id,
      from_status_code: 'APFP',
      to_status_code: 'APSB',
      trigger_code: 'TRSB',
      triggered_by: null,
      notes: 'Application fee paid.',
    })
  }

  const { data: app } = await admin
    .from('applications')
    .select('id, application_number, email, application_fee_status, application_fee_amount, application_fee_currency, application_fee_paid_at, application_fee_reference, status_code')
    .eq('id', payment.application_id)
    .maybeSingle()

  return json({ paid: true, application: app })
}
