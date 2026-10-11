import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.16'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const STAFF_ROLES = new Set(['admin', 'user', 'instructor', 'student'])
const CODE_TTL_MS = 10 * 60 * 1000
const RESEND_WAIT_MS = 60 * 1000
const MAX_SENDS_PER_HOUR = 5
const MAX_ATTEMPTS = 5

type SmtpShape = {
  host: string
  port: number
  enableSsl: boolean
  username: string
  password: string
  fromEmail: string
  fromName: string
}

type ResetMeta = {
  codeHash?: string
  expiresAt?: number
  attempts?: number
  lastSentAt?: number
  recentSends?: number[]
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
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
  const smtp = o.smtp as Record<string, unknown> | undefined
  if (smtp && typeof smtp.host === 'string' && String(smtp.host).length > 0) {
    return {
      host: String(smtp.host),
      port: Number(smtp.port) || 587,
      enableSsl: smtp.enableSsl !== false,
      username: String(smtp.username ?? ''),
      password: String(smtp.password ?? ''),
      fromEmail: String(smtp.fromEmail ?? ''),
      fromName: String(smtp.fromName ?? ''),
    }
  }
  return null
}

function normalizeSmtpAuth(cfg: SmtpShape): SmtpShape {
  const host = cfg.host.trim().toLowerCase()
  let username = cfg.username.trim()
  const fromEmail = cfg.fromEmail.trim()
  const isGmail = host === 'smtp.gmail.com' || host === 'smtp.googlemail.com' || host.endsWith('.gmail.com')
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
    tls: plainNoTls ? { rejectUnauthorized: false } : { minVersion: 'TLSv1.2' as const },
  })
  const fromAddr =
    effective.fromName && effective.fromEmail
      ? `"${String(effective.fromName).replace(/"/g, '\\"')}" <${effective.fromEmail}>`
      : effective.fromEmail || effective.username
  try {
    await transporter.sendMail({
      from: fromAddr,
      to,
      subject,
      text,
      html,
      headers: {
        'Auto-Submitted': 'auto-generated',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
      },
    })
  } finally {
    transporter.close()
  }
}

async function findAuthIdByEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  email: string,
): Promise<string | null> {
  const lookup = await fetch(`${supabaseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`, {
    headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
  })
  let filterAnswered = false
  if (lookup.ok) {
    filterAnswered = true
    const payload = await lookup.json()
    const users = Array.isArray(payload) ? payload : payload?.users || []
    const match = users.find((row: { email?: string; id?: string }) => String(row.email || '').trim().toLowerCase() === email)
    if (match?.id) return match.id
  }
  if (filterAnswered && !email.includes('+')) return null
  let page = 1
  for (let i = 0; i < 50; i++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) return null
    const found = data.users.find((user) => user.email?.trim().toLowerCase() === email)
    if (found?.id) return found.id
    if (data.users.length < 200) break
    page++
  }
  return null
}

async function sha256(value: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let out = 0
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return out === 0
}

function resetMeta(user: { app_metadata?: Record<string, unknown> } | null): ResetMeta {
  const raw = user?.app_metadata?.password_reset
  return raw && typeof raw === 'object' ? (raw as ResetMeta) : {}
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function otpEmail(lang: 'ar' | 'en', code: string, fromName: string, fromEmail: string) {
  const ar = lang === 'ar'
  const subject = ar ? 'رمز دخول بوابة المتقدمين' : 'Your applicant sign-in code'
  const message = ar
    ? 'استخدم هذا الرمز لتعيين كلمة مرور جديدة لحساب المتقدم. تنتهي صلاحيته خلال 10 دقائق.\n\nإذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.'
    : 'Use this code to set a new password for your applicant account. It expires in 10 minutes.\n\nIf you did not ask for this, you can ignore this email.'
  const dir = ar ? 'rtl' : 'ltr'
  const align = ar ? 'right' : 'left'
  const brand = escapeHtml(fromName || 'Imam Bukhary University')
  const html = `<!doctype html>
<html lang="${ar ? 'ar' : 'en'}" dir="${dir}">
<body style="margin:0;padding:0;background:#f4f6fb;font-family:Tahoma,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;">
    <tr><td align="center" style="padding:28px 16px;">
      <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#fff;border:1px solid #dde3ef;border-radius:12px;">
        <tr><td style="padding:28px 24px;direction:${dir};text-align:${align};">
          <h1 style="margin:0;color:#1a3a6b;font-size:20px;text-align:center;">${escapeHtml(subject)}</h1>
          <p style="margin:18px 0 0;font-size:15px;line-height:1.8;color:#1e2a3a;">${escapeHtml(message).replaceAll('\n', '<br/>')}</p>
          <p style="margin:22px 0;text-align:center;font-size:32px;letter-spacing:8px;font-weight:700;color:#1a3a6b;">${escapeHtml(code)}</p>
          <p style="margin:0;padding-top:12px;border-top:1px solid #eef2fb;color:#6b7a99;font-size:12px;line-height:1.7;">
            ${brand}<br/>${escapeHtml(fromEmail)}
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
  const text = `${subject}\n\n${message}\n\n${code}\n\n${fromName}\n${fromEmail}\n`
  return { subject, text, html }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let body: { action?: string; email?: string; code?: string; newPassword?: string; lang?: string }
    try {
      body = await req.json()
    } catch {
      return json(400, { error: 'invalid_json' })
    }

    const email = String(body.email || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json(400, { error: 'invalid_email' })
    const lang = String(body.lang || '').toLowerCase().startsWith('ar') ? 'ar' : 'en'
    const action = body.action === 'reset' ? 'reset' : body.action === 'send' ? 'send' : ''
    if (!action) return json(400, { error: 'invalid_action' })

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('openId, role, email')
      .ilike('email', email)
      .maybeSingle()

    if (profile?.role && STAFF_ROLES.has(profile.role)) {
      return json(400, { error: 'not_applicant' })
    }

    let authId = profile?.role === 'applicant' ? profile.openId || null : null
    if (authId) {
      const { data: linked } = await supabaseAdmin.auth.admin.getUserById(authId)
      const linkedEmail = String(linked?.user?.email || '').trim().toLowerCase()
      if (linkedEmail !== email) authId = null
    }
    if (!authId) authId = await findAuthIdByEmail(supabaseAdmin, supabaseUrl, serviceRoleKey, email)
    if (!authId) return json(400, { error: 'no_account' })

    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.getUserById(authId)
    const authUser = authData?.user
    const authEmail = String(authUser?.email || '').trim().toLowerCase()
    if (authErr || !authUser || authEmail !== email) return json(400, { error: 'no_account' })

    const metaRole = String(authUser.app_metadata?.role || authUser.user_metadata?.role || '').toLowerCase()
    if (!profile && metaRole && STAFF_ROLES.has(metaRole)) return json(400, { error: 'not_applicant' })

    const current = resetMeta(authUser)
    const now = Date.now()

    if (action === 'send') {
      const recent = (Array.isArray(current.recentSends) ? current.recentSends : []).filter((ts) => now - Number(ts) < 60 * 60 * 1000)
      if (current.lastSentAt && now - Number(current.lastSentAt) < RESEND_WAIT_MS) return json(429, { error: 'wait' })
      if (recent.length >= MAX_SENDS_PER_HOUR) return json(429, { error: 'too_many' })

      const { data: settings, error: settingsErr } = await supabaseAdmin
        .from('university_settings')
        .select('email_settings')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (settingsErr) return json(500, { error: 'smtp_missing' })
      const smtp = normalizeEmailSettings(settings?.email_settings)
      if (!smtp?.host || !smtp.fromEmail || !smtp.username || !smtp.password) return json(500, { error: 'smtp_missing' })

      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0')
      const codeHash = await sha256(`${serviceRoleKey}:${email}:${code}`)
      const nextMeta = {
        ...(authUser.app_metadata || {}),
        password_reset: {
          codeHash,
          expiresAt: now + CODE_TTL_MS,
          attempts: 0,
          lastSentAt: now,
          recentSends: [...recent, now],
        },
      }
      const { error: saveErr } = await supabaseAdmin.auth.admin.updateUserById(authId, { app_metadata: nextMeta })
      if (saveErr) return json(400, { error: 'send_failed' })

      const fromName = smtp.fromName || 'Imam Bukhary University'
      const mail = otpEmail(lang, code, fromName, smtp.fromEmail)
      try {
        await sendSmtpMessage(smtp, email, mail.subject, mail.text, mail.html)
      } catch (err) {
        console.error('applicant forgot-password smtp failed', (err as Error)?.message || err)
        return json(502, { error: 'send_failed' })
      }
      return json(200, { success: true, expiresIn: CODE_TTL_MS / 1000 })
    }

    const code = String(body.code || '').replace(/\D/g, '')
    const newPassword = String(body.newPassword || '')
    if (code.length !== 6) return json(400, { error: 'invalid_code' })
    if (newPassword.length < 8) return json(400, { error: 'password_short' })
    if (!current.codeHash || !current.expiresAt) return json(400, { error: 'expired' })
    if (now > Number(current.expiresAt) || Number(current.attempts || 0) >= MAX_ATTEMPTS) {
      return json(400, { error: 'expired' })
    }

    const codeHash = await sha256(`${serviceRoleKey}:${email}:${code}`)
    if (!safeEqual(codeHash, String(current.codeHash))) {
      const attempts = Number(current.attempts || 0) + 1
      await supabaseAdmin.auth.admin.updateUserById(authId, {
        app_metadata: {
          ...(authUser.app_metadata || {}),
          password_reset: { ...current, attempts },
        },
      })
      return json(400, { error: attempts >= MAX_ATTEMPTS ? 'expired' : 'invalid_code' })
    }

    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(authId, {
      password: newPassword,
      email_confirm: true,
      app_metadata: { ...(authUser.app_metadata || {}), password_reset: null },
    })
    if (updErr) return json(400, { error: 'reset_failed' })
    return json(200, { success: true })
  } catch (err) {
    console.error('applicant forgot-password', (err as Error)?.message || err)
    return json(500, { error: 'server_error' })
  }
})
