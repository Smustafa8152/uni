import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.16'
import { buildBrandedEmailHtml, buildPlainTextEmail } from './email.ts'
import { buildApplicationSubmittedEmail, normalizeLang } from './submittedEmail.ts'

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
  enableNotifications: boolean
}

function notificationsEnabled(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return true
  const o = raw as Record<string, unknown>
  if (typeof o.enable_email_notifications === 'boolean') return o.enable_email_notifications
  if (typeof o.enableEmailNotifications === 'boolean') return o.enableEmailNotifications
  const nested = o.notifications
  if (nested && typeof nested === 'object') {
    const n = nested as Record<string, unknown>
    if (typeof n.enableEmailNotifications === 'boolean') return n.enableEmailNotifications
    if (typeof n.enable_email_notifications === 'boolean') return n.enable_email_notifications
  }
  return true
}

function smtpReady(cfg: SmtpShape | null): boolean {
  if (!cfg?.host || !cfg.fromEmail) return false
  if (!cfg.username || !cfg.password) return false
  return true
}

function normalizeEmailSettings(raw: unknown): SmtpShape | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const enabled = notificationsEnabled(raw)
  if (typeof o.smtp_host === 'string' && o.smtp_host.length > 0) {
    return {
      host: o.smtp_host,
      port: Number(o.smtp_port) || 587,
      enableSsl: Boolean(o.enable_ssl),
      username: String(o.smtp_username ?? ''),
      password: String(o.smtp_password ?? ''),
      fromEmail: String(o.from_email ?? ''),
      fromName: String(o.from_name ?? ''),
      enableNotifications: enabled,
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
      enableNotifications: enabled,
    }
  }
  return null
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

const STAFF_ROLES = new Set(['admin', 'college', 'user'])

/** Where the "Follow your application" button goes. Set PUBLIC_APP_URL when the site address changes. */
const DEFAULT_APP_URL = 'https://qalam.nuzum.tech'
/** The sender name in the mail settings is English; Arabic emails are signed with this instead. Override with BRAND_NAME_AR. */
const DEFAULT_BRAND_NAME_AR = 'جامعة الإمام البخاري'

type NamedRow = { name_en?: string | null; name_ar?: string | null } | null

function pickName(row: NamedRow, lang: 'ar' | 'en') {
  if (!row) return ''
  const en = String(row.name_en || '').trim()
  const ar = String(row.name_ar || '').trim()
  return lang === 'ar' ? ar || en : en || ar
}

/**
 * Everything the submission confirmation shows, read from the saved application.
 * Returns null when the application does not exist.
 */
// deno-lint-ignore no-explicit-any
async function loadSubmittedApplication(supabaseAdmin: any, applicationId: number) {
  const { data: app, error } = await supabaseAdmin
    .from('applications')
    .select('id, email, application_number, created_at, first_name, last_name, first_name_ar, college_id, major_id, semester_id')
    .eq('id', applicationId)
    .maybeSingle()
  if (error || !app) return null

  const named = async (table: string, id: number | null): Promise<NamedRow> => {
    if (!id) return null
    const { data } = await supabaseAdmin.from(table).select('name_en, name_ar').eq('id', id).maybeSingle()
    return (data as NamedRow) ?? null
  }
  const [major, college, semester] = await Promise.all([
    named('majors', app.major_id),
    named('colleges', app.college_id),
    named('semesters', app.semester_id),
  ])
  return { app, major, college, semester }
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

    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const scope = (body.scope as string) || 'college'
    const to = String(body.to || '')
    const subject = String(body.subject || '')
    const message = String(body.message || '')
    const type = (body.type as string) || ''
    const collegeId = body.collegeId != null ? Number(body.collegeId) : null
    const applicationId = body.applicationId != null ? Number(body.applicationId) : null
    const appNo =
      body.application && typeof body.application === 'object'
        ? String((body.application as Record<string, unknown>).application_number || '')
        : ''

    // Public / anon submit confirmation: verify application row via service role
    const isPublicSubmitted =
      (!authUser?.id || authErr) &&
      type === 'submitted' &&
      Number.isFinite(applicationId) &&
      applicationId > 0

    let caller: { id: number; role: string; college_id: number | null } | null = null
    let isAdmin = false
    let isCollegeStaff = false
    let isAdmissionsUser = false
    let isApplicant = false
    let isStudent = false

    if (authUser?.id && !authErr) {
      const { data: row, error: callerErr } = await supabaseAdmin
        .from('users')
        .select('id, role, college_id')
        .eq('openId', authUser.id)
        .maybeSingle()

      if (!callerErr && row?.role) {
        caller = row as { id: number; role: string; college_id: number | null }
        isAdmin = caller.role === 'admin'
        // DB enum has no "college"; college staff are stored as role "user"
        isCollegeStaff = caller.role === 'user'
        isAdmissionsUser = caller.role === 'user'
        isApplicant = caller.role === 'applicant'
        isStudent = caller.role === 'student'
      } else if (authUser.email) {
        // Portal applicants may exist only in auth + applications.applicant_user_id
        isApplicant = true
      }
    }

    if (isPublicSubmitted) {
      const { data: app, error: appErr } = await supabaseAdmin
        .from('applications')
        .select('id, email, college_id, application_number, created_at, status_code')
        .eq('id', applicationId)
        .maybeSingle()
      if (appErr || !app) {
        return new Response(JSON.stringify({ error: 'Application not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const createdMs = app.created_at ? new Date(app.created_at).getTime() : 0
      const ageMs = Date.now() - createdMs
      if (!createdMs || ageMs > 30 * 60 * 1000) {
        return new Response(JSON.stringify({ error: 'Submission confirmation window expired' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (to.trim().toLowerCase() !== String(app.email || '').trim().toLowerCase()) {
        return new Response(JSON.stringify({ error: 'Recipient does not match application' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      // Force college from application for SMTP resolution
      ;(body as Record<string, unknown>).collegeId = app.college_id
    } else if (isApplicant) {
      const authEmail = (authUser?.email || '').trim().toLowerCase()
      const toEmail = to.trim().toLowerCase()
      const ownsApplication = async () => {
        if (!Number.isFinite(applicationId)) return false
        const { data: app } = await supabaseAdmin
          .from('applications')
          .select('id, email, applicant_user_id')
          .eq('id', applicationId)
          .maybeSingle()
        if (!app) return false
        const appEmail = String(app.email || '').trim().toLowerCase()
        const owns =
          app.applicant_user_id === authUser?.id || (authEmail.length > 0 && appEmail === authEmail)
        if (!owns) return false
        // Confirmation goes to the address on the application, which may differ from the login email.
        if (type === 'submitted') return toEmail === appEmail
        return true
      }

      if (type === 'submitted') {
        if (!(await ownsApplication())) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      } else if (type === 'application_message') {
        if (toEmail !== authEmail) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      } else if (type === 'application_message_staff') {
        if (!(await ownsApplication())) {
          return new Response(JSON.stringify({ error: 'Forbidden' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      } else {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (isStudent) {
      const authEmail = (authUser?.email || '').trim().toLowerCase()
      if (type !== 'payment_received' || to.trim().toLowerCase() !== authEmail) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else if (!isAdmin && !isCollegeStaff && !isAdmissionsUser) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const effectiveCollegeId =
      body.collegeId != null ? Number(body.collegeId) : collegeId

    if (!to.includes('@')) {
      return new Response(JSON.stringify({ error: 'Invalid recipient email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!subject || !message) {
      return new Response(JSON.stringify({ error: 'subject and message are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let smtpCfg: SmtpShape | null = null
    let rawUniversitySettings: unknown = null
    const loadUniversitySmtp = async () => {
      const { data: row, error: uErr } = await supabaseAdmin
        .from('university_settings')
        .select('email_settings')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (uErr) throw uErr
      rawUniversitySettings = row?.email_settings
      return normalizeEmailSettings(row?.email_settings)
    }

    if (scope === 'university') {
      if (!isAdmin && !isPublicSubmitted) {
        return new Response(JSON.stringify({ error: 'Only administrators can send university notifications' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      smtpCfg = await loadUniversitySmtp()
    } else {
      const cid = effectiveCollegeId ?? caller?.college_id ?? null
      if (!cid || !Number.isFinite(Number(cid))) {
        return new Response(JSON.stringify({ error: 'collegeId is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (
        !isPublicSubmitted &&
        !isApplicant &&
        !isAdmin &&
        !isAdmissionsUser &&
        Number(caller?.college_id) !== Number(cid)
      ) {
        return new Response(JSON.stringify({ error: 'Not allowed for this college' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: col, error: cErr } = await supabaseAdmin
        .from('colleges')
        .select('email_settings, use_university_settings')
        .eq('id', cid)
        .maybeSingle()
      if (cErr || !col) {
        return new Response(JSON.stringify({ error: 'College not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (col.use_university_settings) {
        smtpCfg = await loadUniversitySmtp()
      } else {
        smtpCfg = normalizeEmailSettings(col.email_settings)
        if (smtpCfg && !notificationsEnabled(col.email_settings)) {
          smtpCfg = { ...smtpCfg, enableNotifications: false }
        }
      }
    }

    // A college row can store a host with no mailbox. That is not a working account.
    if (!smtpReady(smtpCfg)) {
      smtpCfg = await loadUniversitySmtp()
    }
    if (!smtpCfg?.host || !smtpCfg.fromEmail) {
      return new Response(JSON.stringify({ error: 'SMTP is not configured (host/from_email)' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (smtpCfg.enableNotifications === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'email_notifications_disabled' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const resolvedAppNo =
      appNo ||
      (isPublicSubmitted && applicationId
        ? String((body.application as Record<string, unknown> | undefined)?.application_number || '')
        : '')

    const brandName = smtpCfg?.fromName || ''
    const brandEmail = smtpCfg?.fromEmail || ''
    const details = (Array.isArray(body.details) ? body.details : [])
      .map((row) => {
        if (!row || typeof row !== 'object') return null
        const item = row as Record<string, unknown>
        return { label: String(item.label || ''), value: String(item.value || '') }
      })
      .filter((row): row is { label: string; value: string } => Boolean(row))
    // The submission confirmation is written here from the saved application, in the language
    // the applicant used, so its wording and details never depend on what the browser sent.
    if (type === 'submitted' && applicationId != null && Number.isFinite(applicationId) && applicationId > 0) {
      const found = await loadSubmittedApplication(supabaseAdmin, applicationId)
      if (!found) {
        return new Response(JSON.stringify({ error: 'Application not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const isStaffCaller = isAdmin || isCollegeStaff || isAdmissionsUser
      if (!isStaffCaller && to.trim().toLowerCase() !== String(found.app.email || '').trim().toLowerCase()) {
        return new Response(JSON.stringify({ error: 'Recipient does not match application' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const requested = body.language ?? body.lang
      const lang = requested ? normalizeLang(requested) : /[\u0600-\u06FF]/.test(`${subject}${message}`) ? 'ar' : 'en'
      const latinName = `${found.app.first_name || ''} ${found.app.last_name || ''}`.trim()
      const arabicName = String(found.app.first_name_ar || '').trim()
      const appUrl = String(Deno.env.get('PUBLIC_APP_URL') || DEFAULT_APP_URL).replace(/\/+$/, '')

      const built = buildApplicationSubmittedEmail({
        lang,
        applicantName: lang === 'ar' ? arabicName || latinName : latinName || arabicName,
        applicationNumber: String(found.app.application_number || found.app.id),
        program: pickName(found.major, lang),
        college: pickName(found.college, lang),
        semester: pickName(found.semester, lang),
        submittedAt: found.app.created_at,
        recipientEmail: String(found.app.email || to),
        portalUrl: `${appUrl}/login/applicant`,
        brandName: lang === 'ar' ? Deno.env.get('BRAND_NAME_AR') || DEFAULT_BRAND_NAME_AR : brandName,
        brandEmail,
        timeZone: Deno.env.get('APP_TIME_ZONE') || 'Asia/Kuwait',
      })
      await sendSmtpMessage(smtpCfg, to, built.subject, built.text, built.html)
      return new Response(JSON.stringify({ success: true, template: 'application_submitted', language: built.lang }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const html = buildBrandedEmailHtml({
      brandName,
      brandEmail,
      subject,
      message,
      metaLabel: resolvedAppNo ? 'Application' : '',
      metaValue: resolvedAppNo || '',
      details,
    })
    const text = buildPlainTextEmail({
      subject,
      message,
      metaLine: resolvedAppNo ? `Application: ${resolvedAppNo}` : '',
      details,
    })
    await sendSmtpMessage(smtpCfg, to, subject, text, html)

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
