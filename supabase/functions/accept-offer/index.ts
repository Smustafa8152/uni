import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.16'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

type SmtpShape = {
  host: string
  port: number
  enableSsl: boolean
  username: string
  password: string
  fromEmail: string
  fromName: string
}

function normalizeEmailSettings(raw: unknown): SmtpShape | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (typeof o.smtp_host === 'string' && o.smtp_host.length > 0) {
    return {
      host: o.smtp_host,
      port: Number(o.smtp_port) || 587,
      enableSsl: Boolean(o.enable_ssl),
      username: String(o.smtp_username ?? ''),
      password: String(o.smtp_password ?? ''),
      fromEmail: String(o.from_email ?? ''),
      fromName: String(o.from_name ?? ''),
    }
  }
  return null
}

function normalizeSmtpAuth(cfg: SmtpShape): SmtpShape {
  const host = cfg.host.trim().toLowerCase()
  let username = cfg.username.trim()
  const fromEmail = cfg.fromEmail.trim()
  const isGmail =
    host === 'smtp.gmail.com' || host === 'smtp.googlemail.com' || host.endsWith('.gmail.com')
  const isOutlook =
    host === 'smtp-mail.outlook.com' ||
    host === 'smtp.office365.com' ||
    host.includes('.outlook.com') ||
    host.includes('.office365.com')
  if ((isGmail || isOutlook) && username.length > 0 && !username.includes('@') && fromEmail.includes('@')) {
    username = fromEmail
  }
  return { ...cfg, username }
}

async function sendSmtpMessage(cfg: SmtpShape, to: string, subject: string, text: string, html: string) {
  const effective = normalizeSmtpAuth(cfg)
  const port = effective.port
  const implicitTls = port === 465 || port === 994
  const submissionPort = port === 587 || port === 2525 || port === 2587
  const plainNoTls = !implicitTls && !submissionPort && !effective.enableSsl

  const transporter = nodemailer.createTransport({
    host: effective.host.trim(),
    port,
    secure: implicitTls,
    auth:
      effective.username || effective.password
        ? { user: effective.username, pass: effective.password }
        : undefined,
    ignoreTLS: plainNoTls,
    tls: plainNoTls ? { rejectUnauthorized: false } : undefined,
  })

  await transporter.sendMail({
    from: effective.fromName ? `"${effective.fromName}" <${effective.fromEmail}>` : effective.fromEmail,
    to,
    subject,
    text,
    html,
  })
}

function escapeHtml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function buildEmailHtml(subject: string, message: string, appNo: string) {
  const msg = escapeHtml(message).replaceAll('\n', '<br/>')
  const safeNo = escapeHtml(appNo)
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(
    subject,
  )}</title></head><body style="margin:0;padding:0;background:#f4f6fb;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1e2a3a;">
  <div style="max-width:640px;margin:0 auto;padding:28px 16px;">
    <div style="background:#fff;border:1px solid #dde3ef;border-radius:12px;padding:22px;">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;">
        <div style="width:40px;height:40px;border-radius:10px;background:#1a3a6b;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;">IBU</div>
        <div>
          <div style="font-size:18px;font-weight:800;color:#1a3a6b;">${escapeHtml(subject)}</div>
          <div style="font-size:13px;color:#6b7a99;margin-top:4px;">Application: <span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#e6f7ef;color:#1a7a4a;font-weight:700;">${safeNo}</span></div>
        </div>
      </div>
      <div style="font-size:14px;line-height:1.7;">${msg}</div>
      <div style="margin-top:16px;font-size:12px;color:#6b7a99;">Please do not reply to this email.</div>
    </div>
  </div>
  </body></html>`
}

async function generateStudentId(supabaseAdmin: any, collegeId: number) {
  const { data: college } = await supabaseAdmin
    .from('colleges')
    .select('student_id_prefix, student_id_format, student_id_starting_number, code')
    .eq('id', collegeId)
    .single()

  const prefix = college?.student_id_prefix ?? 'STU'
  const collegeCode = college?.code ?? ''
  const year = new Date().getFullYear()
  const format = college?.student_id_format || '{prefix}{year}{sequence:D4}'

  // Support both token spellings used in the app:
  // - {college_code} (snake_case) is what the admin UI hints
  // - {collegeCode} (legacy camelCase in this function)
  const applyTokens = (tpl: string) =>
    tpl
      .replaceAll('{prefix}', String(prefix))
      .replaceAll('{year}', String(year))
      .replaceAll('{college_code}', String(collegeCode))
      .replaceAll('{collegeCode}', String(collegeCode))

  const staticPrefix = applyTokens(format).replace(/\{sequence:[^}]+\}/g, '')

  let query = supabaseAdmin.from('students').select('student_id').eq('college_id', collegeId)
  if (staticPrefix) query = query.like('student_id', `${staticPrefix}%`)
  const { data: existing } = await query.limit(10000)

  const ids = (existing || []).map((r: any) => String(r.student_id || '')).filter(Boolean)
  let max = 0
  for (const id of ids) {
    const m = id.match(/(\d{4,6})$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  const start = Number(college?.student_id_starting_number) || 1
  const seq = Math.max(max + 1, start)
  const seqStr = String(seq).padStart(4, '0')
  return applyTokens(format).replace(/\{sequence:[^}]+\}/g, seqStr)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const jwt = authHeader.replace('Bearer ', '')
    const {
      data: { user: authUser },
      error: authErr,
    } = await supabaseAdmin.auth.getUser(jwt)
    if (authErr || !authUser?.id || !authUser.email) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const applicationId = Number(body.applicationId)
    if (!Number.isFinite(applicationId)) {
      return new Response(JSON.stringify({ error: 'applicationId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: app, error: appErr } = await supabaseAdmin
      .from('applications')
      .select('*')
      .eq('id', applicationId)
      .single()
    if (appErr || !app) throw appErr

    if (String(app.applicant_user_id || '') !== String(authUser.id)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const status = String(app.status_code || '').toUpperCase()
    if (!['DCCA', 'DCFA'].includes(status)) {
      return new Response(JSON.stringify({ error: 'Offer letter is not available for this application status' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!app.registration_fee_paid_at) {
      return new Response(JSON.stringify({ error: 'Registration fee must be paid before accepting the offer.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!app.tuition_fee_paid_at) {
      return new Response(JSON.stringify({ error: 'Tuition fee must be paid before final acceptance.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Resolve public.users id linked to this auth user
    const { data: urow } = await supabaseAdmin
      .from('users')
      .select('id, role, college_id, email')
      .eq('openId', authUser.id)
      .maybeSingle()
    const userId = urow?.id ?? null

    // Create student record if missing
    const { data: existingStudent } = await supabaseAdmin
      .from('students')
      .select('id, student_id')
      .eq('email', app.email)
      .maybeSingle()

    let createdStudent: any = existingStudent
    if (!existingStudent) {
      const studentId = await generateStudentId(supabaseAdmin, Number(app.college_id))
      const name_en = [app.first_name, app.middle_name, app.last_name].filter(Boolean).join(' ')
      const name_ar = [app.first_name_ar, app.middle_name_ar, app.last_name_ar].filter(Boolean).join(' ')
      const enrollmentDate = new Date().toISOString().split('T')[0]

      const { data: inserted, error: insErr } = await supabaseAdmin
        .from('students')
        .insert({
          user_id: userId,
          student_id: studentId,
          name_en: name_en || `${app.first_name} ${app.last_name}`,
          name_ar: name_ar || null,
          email: app.email,
          phone: app.phone || null,
          date_of_birth: app.date_of_birth || null,
          gender: app.gender || null,
          major_id: Number(app.major_id),
          college_id: Number(app.college_id),
          enrollment_date: enrollmentDate,
          status: 'active',
        })
        .select('id, student_id')
        .single()
      if (insErr) throw insErr
      createdStudent = inserted
    }

    // Promote role to student (keeps same auth email/password)
    if (userId) {
      await supabaseAdmin.from('users').update({ role: 'student', college_id: app.college_id }).eq('id', userId)
    }

    // Update application status to DCFA (accepted final)
    if (status !== 'DCFA') {
      await supabaseAdmin
        .from('applications')
        .update({ status_code: 'DCFA', status: 'accepted', status_changed_at: new Date().toISOString() })
        .eq('id', applicationId)
    }

    // Email notification (best effort)
    try {
      const { data: col } = await supabaseAdmin
        .from('colleges')
        .select('email_settings, use_university_settings')
        .eq('id', app.college_id)
        .maybeSingle()
      let rawEmail = col?.email_settings
      if (col?.use_university_settings) {
        const { data: uni } = await supabaseAdmin
          .from('university_settings')
          .select('email_settings')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        rawEmail = uni?.email_settings ?? rawEmail
      }
      const smtp = normalizeEmailSettings(rawEmail)
      if (smtp?.host && smtp.fromEmail) {
        const subject = 'Offer accepted'
        const message = 'Your offer has been accepted successfully. You can now log in as a student using the same email and password.'
        const html = buildEmailHtml(subject, message, String(app.application_number || app.id))
        const text = `${subject}\n\n${message}\n\nApplication: ${app.application_number || app.id}`
        await sendSmtpMessage(smtp, String(app.email), subject, text, html)
      }
    } catch {
      // ignore
    }

    return new Response(
      JSON.stringify({ success: true, student: createdStudent, status_code: 'DCFA' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

