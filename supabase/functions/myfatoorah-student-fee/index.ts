import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

  try {
    const action = String(body.action || '')
    if (action === 'confirm') return await confirmPayment(admin, body)
    if (action !== 'methods' && action !== 'create') return json({ error: 'Unknown action.' }, 400)

    const student = await signedInStudent(req, admin, anonKey, supabaseUrl)
    if (!student) return json({ error: 'Sign in as a student to pay.' }, 401)
    const due = await installmentDue(admin, student, Number(body.semesterId))
    if ('error' in due) return json({ error: due.error }, 400)
    if (due.alreadyPaid) return json({ alreadyPaid: true })

    if (action === 'methods') return await listMethods(due)
    return await createInvoice(req, admin, student, due, body)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Payment failed.'
    console.error('myfatoorah-student-fee:', message)
    return json({ error: message }, 400)
  }
})

async function signedInStudent(req: Request, admin: Admin, anonKey: string, supabaseUrl: string) {
  const authHeader = req.headers.get('Authorization') || ''
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: userData } = await userClient.auth.getUser()
  const user = userData?.user
  if (!user?.email) return null

  const email = user.email.trim().toLowerCase()
  const { data: rows } = await admin
    .from('students')
    .select('id, student_id, name_en, first_name, last_name, email, phone, major_id, enrollment_date, status')
    .ilike('email', email.replace(/[\\%_]/g, '\\$&'))
    .order('id', { ascending: false })
    .limit(1)
  return rows?.[0] || null
}

type Due = {
  plan: { id: number; currency: string }
  semester: { id: number; name_en: string | null; name_ar: string | null }
  amount: number
  breakdown: Record<string, unknown>
  alreadyPaid?: boolean
}

const DUE_ERRORS: Record<string, string> = {
  no_student: 'Your student record was not found.',
  no_plan: 'Your program has no fees set yet.',
  no_semester: 'Semester not found.',
  not_open: 'Payment for this semester is not open.',
  before_joining: 'This semester ended before you joined.',
  all_paid: 'All installments of your program are paid.',
  no_courses: 'You are not registered in any course this semester yet.',
  nothing_due: 'Nothing is due for this semester.',
}

/**
 * The amount this student owes for one opened semester. The database function student_fee_due() is the one
 * calculation (billing mode, credit hours, approved scholarship), so the portal and the payment always agree.
 */
async function installmentDue(admin: Admin, student: Record<string, unknown>, semesterId: number): Promise<Due | { error: string }> {
  if (!Number.isFinite(semesterId)) return { error: 'Choose the semester to pay for.' }
  const { data, error } = await admin.rpc('student_fee_due', { p_student_id: student.id, p_semester_id: semesterId })
  if (error) throw new Error(error.message)
  const d = (data || {}) as Record<string, unknown>
  if (!d.ok) return { error: DUE_ERRORS[String(d.reason)] || 'Your program has no fees set yet.' }
  const base: Due = {
    plan: { id: Number(d.plan_id), currency: String(d.currency || 'GMD') },
    semester: { id: Number(d.semester_id), name_en: (d.semester_name_en as string) || null, name_ar: (d.semester_name_ar as string) || null },
    amount: Number(d.amount) || 0,
    breakdown: d,
  }
  if (d.paid) return { ...base, alreadyPaid: true }
  if (d.reason) return { error: DUE_ERRORS[String(d.reason)] || 'Payment is not possible for this semester.' }
  if (!(base.amount > 0)) return { error: DUE_ERRORS.nothing_due }
  return base
}

async function listMethods(due: Due) {
  const currency = due.plan.currency || 'GMD'
  const data = await myfatoorah('/v2/InitiatePayment', { InvoiceAmount: due.amount, CurrencyIso: currency })
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
  return json({ methods, amount: due.amount, currency })
}

async function createInvoice(req: Request, admin: Admin, student: Record<string, unknown>, due: Due, body: Record<string, unknown>) {
  const paymentMethodId = Number(body.paymentMethodId)
  if (!Number.isFinite(paymentMethodId)) return json({ error: 'Choose a payment method.' }, 400)

  const origin = req.headers.get('origin') || ''
  if (!origin) return json({ error: 'Payment could not be started.' }, 400)
  const returnUrl = `${origin}/student/payments?semester=${due.semester.id}`
  const language = String(body.language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en'
  const name =
    [student.first_name, student.last_name].filter(Boolean).join(' ').trim() || String(student.name_en || '') || 'Student'
  const currency = due.plan.currency || 'GMD'

  const data = await myfatoorah('/v2/ExecutePayment', {
    PaymentMethodId: paymentMethodId,
    CustomerName: name,
    InvoiceValue: due.amount,
    DisplayCurrencyIso: currency,
    CallBackUrl: returnUrl,
    ErrorUrl: `${returnUrl}&failed=1`,
    Language: language,
    CustomerReference: String(student.student_id || student.id),
    CustomerEmail: student.email || undefined,
    UserDefinedField: `${student.id}:${due.semester.id}`,
  })

  const invoiceId = data?.InvoiceId != null ? String(data.InvoiceId) : ''
  const invoiceUrl = data?.PaymentURL || data?.InvoiceURL || ''
  if (!invoiceUrl) throw new Error('Payment link was not created.')

  const { error: insertErr } = await admin.from('program_fee_payments').insert({
    student_id: student.id,
    plan_id: due.plan.id,
    semester_id: due.semester.id,
    amount: due.amount,
    currency,
    status: 'pending',
    method: 'card',
    breakdown: due.breakdown,
    myfatoorah_invoice_id: invoiceId || null,
    invoice_url: invoiceUrl,
    language,
  })
  if (insertErr) throw new Error(insertErr.message)
  return json({ invoiceUrl })
}

function isPaid(data: Record<string, unknown>) {
  if (String(data?.InvoiceStatus || '').toLowerCase() === 'paid') return true
  const tx = Array.isArray(data?.InvoiceTransactions) ? data.InvoiceTransactions : []
  return tx.some((row) => {
    const s = String((row as Record<string, unknown>)?.TransactionStatus || '').toLowerCase()
    return s === 'succss' || s === 'success'
  })
}

async function confirmPayment(admin: Admin, body: Record<string, unknown>) {
  const paymentId = String(body.paymentId || '').trim()
  if (!paymentId) return json({ paid: false })

  const data = await myfatoorah('/v2/GetPaymentStatus', { Key: paymentId, KeyType: 'PaymentId' })
  const invoiceId = data?.InvoiceId != null ? String(data.InvoiceId) : ''
  if (!invoiceId) return json({ paid: false, error: 'This payment was not found.' }, 404)

  const { data: rows } = await admin
    .from('program_fee_payments')
    .select('id, status, semester_id, amount, currency, paid_at, myfatoorah_payment_id')
    .eq('myfatoorah_invoice_id', invoiceId)
    .order('created_at', { ascending: false })
    .limit(1)
  const payment = rows?.[0]
  if (!payment) return json({ paid: false, error: 'This payment does not match a student fee.' }, 404)
  if (payment.status === 'paid') return json({ paid: true, payment })

  const paid = isPaid(data as Record<string, unknown>)
  const invoiceStatus = String((data as Record<string, unknown>)?.InvoiceStatus || '').toLowerCase()
  if (!paid && (invoiceStatus === 'pending' || invoiceStatus === '')) return json({ paid: false, pending: true })

  if (!paid) {
    await admin
      .from('program_fee_payments')
      .update({ status: 'failed', myfatoorah_payment_id: paymentId })
      .eq('id', payment.id)
      .eq('status', 'pending')
    return json({ paid: false })
  }

  const { data: updated, error } = await admin
    .from('program_fee_payments')
    .update({ status: 'paid', myfatoorah_payment_id: paymentId, paid_at: new Date().toISOString() })
    .eq('id', payment.id)
    .select('id, status, semester_id, amount, currency, paid_at, myfatoorah_payment_id')
    .maybeSingle()
  if (error) throw new Error(error.message)
  return json({ paid: true, payment: updated })
}
