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

function testAddressFromRaw(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return ''
  const o = raw as Record<string, unknown>
  if (typeof o.test_email_address === 'string') return o.test_email_address
  if (typeof o.testEmail === 'string') return o.testEmail
  return ''
}

function bodySmtpToShape(s: Record<string, unknown>): SmtpShape | null {
  const host = typeof s.host === 'string' ? s.host : ''
  if (!host) return null
  return {
    host,
    port: Number(s.port) || 587,
    enableSsl: s.enableSsl !== false,
    username: String(s.username ?? ''),
    password: String(s.password ?? ''),
    fromEmail: String(s.fromEmail ?? ''),
    fromName: String(s.fromName ?? ''),
  }
}

/** Gmail / Outlook submission AUTH must use the full mailbox address, not the local part only. */
function normalizeSmtpAuth(cfg: SmtpShape): SmtpShape {
  const host = cfg.host.trim().toLowerCase()
  let username = cfg.username.trim()
  const fromEmail = cfg.fromEmail.trim()

  const isGmail =
    host === 'smtp.gmail.com' ||
    host === 'smtp.googlemail.com' ||
    host.endsWith('.gmail.com')
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

/** Send via nodemailer (Node SMTP stack) — more reliable with Gmail STARTTLS than denomailer in Edge/Deno. */
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
        ? {
            user: effective.username,
            pass: effective.password,
          }
        : undefined,
    ignoreTLS: plainNoTls,
    tls: plainNoTls
      ? { rejectUnauthorized: false }
      : { minVersion: 'TLSv1.2' as const },
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
    })
  } finally {
    transporter.close()
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
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
      data: { user: callerAuth },
      error: authErr,
    } = await supabaseAdmin.auth.getUser(jwt)
    if (authErr || !callerAuth) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: callerRow, error: callerErr } = await supabaseAdmin
      .from('users')
      .select('id, role, college_id')
      .eq('openId', callerAuth.id)
      .maybeSingle()

    if (callerErr || !callerRow) {
      return new Response(JSON.stringify({ error: 'Caller not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body: {
      scope?: string
      collegeId?: number
      to?: string
      useSaved?: boolean
      smtp?: Record<string, unknown>
    }
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const scope = body.scope === 'college' ? 'college' : body.scope === 'university' ? 'university' : null
    if (!scope) {
      return new Response(JSON.stringify({ error: 'scope must be university or college' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const useSaved = Boolean(body.useSaved)
    let to = typeof body.to === 'string' ? body.to.trim() : ''
    if (!to && useSaved) {
      // filled after loading settings
    } else if (!to || !to.includes('@')) {
      return new Response(JSON.stringify({ error: 'Valid "to" email address is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const isAdmin = callerRow.role === 'admin'
    const isCollegeStaff = callerRow.role === 'user' && callerRow.college_id != null

    if (scope === 'university' && !isAdmin) {
      return new Response(JSON.stringify({ error: 'Only administrators can test university SMTP' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (scope === 'college' && !isAdmin && !isCollegeStaff) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let smtpCfg: SmtpShape | null = null

    if (useSaved) {
      if (scope === 'university') {
        const { data: row, error: uErr } = await supabaseAdmin
          .from('university_settings')
          .select('email_settings')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (uErr) {
          return new Response(JSON.stringify({ error: uErr.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        smtpCfg = normalizeEmailSettings(row?.email_settings)
        if (!to) to = testAddressFromRaw(row?.email_settings)
      } else {
        const collegeId = body.collegeId
        if (collegeId == null || !Number.isFinite(Number(collegeId))) {
          return new Response(JSON.stringify({ error: 'collegeId is required when useSaved is true for college' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (!isAdmin && Number(callerRow.college_id) !== Number(collegeId)) {
          return new Response(JSON.stringify({ error: 'Not allowed for this college' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const { data: col, error: cErr } = await supabaseAdmin
          .from('colleges')
          .select('email_settings, use_university_settings')
          .eq('id', collegeId)
          .maybeSingle()

        if (cErr || !col) {
          return new Response(JSON.stringify({ error: 'College not found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        let rawEmail = col.email_settings
        if (col.use_university_settings) {
          const { data: urow } = await supabaseAdmin
            .from('university_settings')
            .select('email_settings')
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          rawEmail = urow?.email_settings ?? rawEmail
        }

        smtpCfg = normalizeEmailSettings(rawEmail)
        if (!to) to = testAddressFromRaw(rawEmail)
      }
    } else {
      if (!body.smtp || typeof body.smtp !== 'object') {
        return new Response(JSON.stringify({ error: 'smtp object is required when useSaved is false' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      smtpCfg = bodySmtpToShape(body.smtp as Record<string, unknown>)
      if (scope === 'college' && body.collegeId != null && Number.isFinite(Number(body.collegeId))) {
        if (!isAdmin && Number(callerRow.college_id) !== Number(body.collegeId)) {
          return new Response(JSON.stringify({ error: 'Not allowed for this college' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
      if (scope === 'college' && !isAdmin && body.collegeId == null) {
        // college staff must be scoped to their college for inline (unsaved) tests
        if (!isCollegeStaff || callerRow.college_id == null) {
          return new Response(JSON.stringify({ error: 'collegeId is required' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
    }

    if (!smtpCfg?.host) {
      return new Response(JSON.stringify({ error: 'SMTP host is not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!to || !to.includes('@')) {
      return new Response(JSON.stringify({ error: 'Enter a test recipient address' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!smtpCfg.fromEmail && !smtpCfg.username) {
      return new Response(JSON.stringify({ error: 'Configure From email or SMTP username' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const subject =
      scope === 'university'
        ? 'University SMTP test'
        : 'College SMTP test'
    const text =
      'This is a test message from your university management system SMTP settings.\n\nIf you received this email, your configuration is working.'
    const html =
      '<p>This is a <strong>test message</strong> from your university management system SMTP settings.</p><p>If you received this email, your configuration is working.</p>'

    await sendSmtpMessage(smtpCfg, to, subject, text, html)

    return new Response(JSON.stringify({ success: true, message: 'Test email sent' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    const msg = (e as Error).message || 'Server error'
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
