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

const GROUP_LABELS: Record<string, string> = {
  activities: 'Course Activities',
  midterm: 'Midterm Exam',
  final: 'Final Exam',
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
  if (smtp && typeof smtp.host === 'string') {
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

async function resolveSmtp(supabaseAdmin: ReturnType<typeof createClient>, collegeId: number) {
  const { data: college } = await supabaseAdmin
    .from('colleges')
    .select('use_university_settings, email_settings')
    .eq('id', collegeId)
    .maybeSingle()

  let raw = college?.email_settings
  if (college?.use_university_settings) {
    const { data: uni } = await supabaseAdmin
      .from('university_settings')
      .select('email_settings')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (uni?.email_settings) raw = uni.email_settings
  }

  let cfg = normalizeEmailSettings(raw)
  if (!cfg?.host) {
    const { data: uni } = await supabaseAdmin
      .from('university_settings')
      .select('email_settings')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    cfg = normalizeEmailSettings(uni?.email_settings)
  }
  return cfg
}

async function sendEmail(cfg: SmtpShape, to: string, subject: string, text: string, html: string) {
  const port = cfg.port
  const implicitTls = port === 465
  const transporter = nodemailer.createTransport({
    host: cfg.host.trim(),
    port,
    secure: implicitTls,
    auth: cfg.username ? { user: cfg.username, pass: cfg.password } : undefined,
    tls: { minVersion: 'TLSv1.2' as const },
  })
  const from =
    cfg.fromName && cfg.fromEmail
      ? `"${cfg.fromName.replace(/"/g, '\\"')}" <${cfg.fromEmail}>`
      : cfg.fromEmail
  try {
    await transporter.sendMail({ from, to, subject, text, html })
  } finally {
    transporter.close()
  }
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
    const { data: { user: callerAuth }, error: authErr } = await supabaseAdmin.auth.getUser(jwt)
    if (authErr || !callerAuth?.email) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const classId = Number(body.classId)
    const assessmentGroup = String(body.assessmentGroup || '')
    const collegeId = Number(body.collegeId)

    if (!classId || !assessmentGroup) {
      return new Response(JSON.stringify({ error: 'classId and assessmentGroup required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: cls } = await supabaseAdmin
      .from('classes')
      .select(`
        id, code, section, college_id, instructor_id,
        subjects(code, name_en, name_ar),
        instructors(id, name_en, name_ar, email, department_id)
      `)
      .eq('id', classId)
      .maybeSingle()

    if (!cls) {
      return new Response(JSON.stringify({ error: 'Class not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const instructor = cls.instructors as { id: number; name_en: string; email: string; department_id: number } | null
    if (!instructor || instructor.email?.toLowerCase() !== callerAuth.email?.toLowerCase()) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const effectiveCollegeId = collegeId || cls.college_id
    const smtpCfg = await resolveSmtp(supabaseAdmin, effectiveCollegeId)
    if (!smtpCfg?.host || !smtpCfg.fromEmail) {
      return new Response(JSON.stringify({ error: 'SMTP not configured', skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const recipients: string[] = []
    if (instructor.department_id) {
      const { data: dept } = await supabaseAdmin
        .from('departments')
        .select('head_id')
        .eq('id', instructor.department_id)
        .maybeSingle()
      if (dept?.head_id) {
        const { data: head } = await supabaseAdmin
          .from('instructors')
          .select('email')
          .eq('id', dept.head_id)
          .maybeSingle()
        if (head?.email) recipients.push(head.email)
      }
    }

    const { data: college } = await supabaseAdmin
      .from('colleges')
      .select('dean_email, name_en')
      .eq('id', effectiveCollegeId)
      .maybeSingle()
    if (college?.dean_email) recipients.push(college.dean_email)

    const uniqueRecipients = [...new Set(recipients.filter(Boolean))]
    if (uniqueRecipients.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: 'no recipients' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const subjectCode = (cls.subjects as { code?: string })?.code || cls.code
    const groupLabel = GROUP_LABELS[assessmentGroup] || assessmentGroup
    const subject = `Grade approval: ${subjectCode} — ${groupLabel}`
    const approvedAt = new Date().toLocaleString('en-GB')
    const text = [
      `Instructor ${instructor.name_en} has approved grades for ${groupLabel}.`,
      `Course: ${subjectCode} (section ${cls.section || '—'})`,
      `Approved at: ${approvedAt}`,
      '',
      'Please review in the grade management system.',
    ].join('\n')
    const html = `<p>${text.replace(/\n/g, '<br/>')}</p>`

    let sent = 0
    for (const to of uniqueRecipients) {
      try {
        await sendEmail(smtpCfg, to, subject, text, html)
        sent += 1
      } catch (e) {
        console.error('notify-grade-approval send failed', to, e)
      }
    }

    return new Response(JSON.stringify({ ok: true, sent, recipients: uniqueRecipients.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
