import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.16'
import {
  buildInstructorCommunicationEmailHtml,
  buildInstructorCommunicationPlainText,
} from './email.ts'

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

type AttachmentInput = {
  name: string
  mimeType?: string
  contentBase64: string
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

async function sendSmtpMessage(
  cfg: SmtpShape,
  to: string,
  subject: string,
  text: string,
  html: string,
  attachments: AttachmentInput[] = [],
) {
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

  const mailAttachments = attachments.map((a) => ({
    filename: a.name,
    content: Uint8Array.from(atob(a.contentBase64), (c) => c.charCodeAt(0)),
    contentType: a.mimeType || undefined,
  }))

  try {
    await transporter.sendMail({
      from: fromAddr,
      to,
      subject,
      text,
      html,
      attachments: mailAttachments,
    })
  } finally {
    transporter.close()
  }
}

async function resolveSmtpForCollege(supabaseAdmin: ReturnType<typeof createClient>, collegeId: number) {
  const { data: college } = await supabaseAdmin
    .from('colleges')
    .select('use_university_settings, email_settings')
    .eq('id', collegeId)
    .maybeSingle()

  if (!college) return null

  let rawEmail = college.email_settings
  if (college.use_university_settings) {
    const { data: uni } = await supabaseAdmin
      .from('university_settings')
      .select('email_settings')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (uni?.email_settings) rawEmail = uni.email_settings
  }

  return normalizeEmailSettings(rawEmail)
}

async function getInstructorByAuthEmail(supabaseAdmin: ReturnType<typeof createClient>, email: string) {
  const { data } = await supabaseAdmin
    .from('instructors')
    .select('id, name_en, name_ar, email, college_id')
    .eq('status', 'active')
    .ilike('email', email)
    .maybeSingle()
  return data
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
    if (authErr || !callerAuth?.email) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const instructor = await getInstructorByAuthEmail(supabaseAdmin, callerAuth.email)
    if (!instructor) {
      return new Response(JSON.stringify({ error: 'Instructor not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json()
    const classId = Number(body.classId)
    if (!classId || Number.isNaN(classId)) {
      return new Response(JSON.stringify({ error: 'classId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: cls } = await supabaseAdmin
      .from('classes')
      .select('id, instructor_id, college_id, subject_id, subjects(code, name_en, name_ar)')
      .eq('id', classId)
      .maybeSingle()

    if (!cls || cls.instructor_id !== instructor.id) {
      return new Response(JSON.stringify({ error: 'Class not found or access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const collegeId = cls.college_id || instructor.college_id
    const deliveryChannel = String(body.deliveryChannel || 'both')
    const sendEmail = deliveryChannel === 'email' || deliveryChannel === 'both'
    const logoUrl = String(body.logoUrl || '').trim() || `${req.headers.get('origin') || 'https://qalam.nuzum.tech'}/assets/Logo.png`
    const attachments: AttachmentInput[] = Array.isArray(body.attachments) ? body.attachments : []
    const courseCode = cls.subjects?.code || ''
    const instructorName = instructor.name_ar || instructor.name_en || ''
    const isArabic = body.isArabic !== false

    const { data: enrollments } = await supabaseAdmin
      .from('enrollments')
      .select('id, student_id, students(id, email, name_en, name_ar, status)')
      .eq('class_id', classId)
      .eq('status', 'enrolled')

    const allStudents = (enrollments || [])
      .map((e) => e.students)
      .filter((s) => s && String(s.email || '').trim())

    let recipients: Array<{ id: number | null; email: string; name_en?: string; name_ar?: string }> = [...allStudents]
    const targetAudience = String(body.targetAudience || 'all')
    const recipientIds: number[] = Array.isArray(body.recipientStudentIds)
      ? body.recipientStudentIds.map(Number).filter((n) => !Number.isNaN(n))
      : []

    if (targetAudience === 'manual_emails') {
      const rawList = Array.isArray(body.manualEmails)
        ? body.manualEmails
        : String(body.manualEmailsRaw || '')
            .split(/[,;]+/)
            .map((e: string) => e.trim())
      const emails = [
        ...new Set(
          rawList
            .map((e) => String(e).trim().toLowerCase())
            .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
        ),
      ]
      recipients = emails.map((email) => ({ id: null, email, name_en: email, name_ar: email }))
    } else if (targetAudience === 'specific') {
      recipients = allStudents.filter((s) => recipientIds.includes(s.id))
    } else if (targetAudience === 'at_risk') {
      const enrollmentIds = (enrollments || []).map((e) => e.id)
      if (enrollmentIds.length) {
        const { data: grades } = await supabaseAdmin
          .from('grade_components')
          .select('enrollment_id, total_percentage')
          .in('enrollment_id', enrollmentIds)
        const atRiskEnrollmentIds = new Set(
          (grades || [])
            .filter((g) => g.total_percentage != null && Number(g.total_percentage) < 60)
            .map((g) => g.enrollment_id),
        )
        const atRiskStudentIds = new Set(
          (enrollments || [])
            .filter((e) => atRiskEnrollmentIds.has(e.id))
            .map((e) => e.student_id),
        )
        recipients = allStudents.filter((s) => atRiskStudentIds.has(s.id))
      } else {
        recipients = []
      }
    } else if (targetAudience === 'no_homework') {
      const sid = cls.subject_id
      if (sid) {
        const { data: homework } = await supabaseAdmin
          .from('subject_homework')
          .select('id')
          .eq('subject_id', sid)
          .eq('status', 'published')
          .order('due_date', { ascending: false })
          .limit(1)
        const hwId = homework?.[0]?.id
        if (hwId) {
          const { data: subs } = await supabaseAdmin
            .from('homework_submissions')
            .select('student_id')
            .eq('homework_id', hwId)
          const submitted = new Set((subs || []).map((s) => s.student_id))
          recipients = allStudents.filter((s) => !submitted.has(s.id))
        }
      }
    }

    if (!recipients.length) {
      return new Response(JSON.stringify({ error: 'No recipients matched the selected audience' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const smtpCfg = collegeId ? await resolveSmtpForCollege(supabaseAdmin, collegeId) : null
    if (sendEmail && !smtpCfg?.host) {
      return new Response(JSON.stringify({ error: 'SMTP is not configured for this college' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const commType = String(body.type || 'announcement')
    let emailSentCount = 0
    const emailErrors: string[] = []

    if (commType === 'announcement') {
      const title = String(body.title || '').trim()
      const messageBody = String(body.body || '').trim()
      const category = String(body.category || 'general')

      if (!title || !messageBody) {
        return new Response(JSON.stringify({ error: 'Title and body are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const manualEmailsForDb =
        targetAudience === 'manual_emails'
          ? recipients.map((r) => r.email).filter(Boolean)
          : []

      const { data: announcement, error: annErr } = await supabaseAdmin
        .from('course_announcements')
        .insert({
          class_id: classId,
          instructor_id: instructor.id,
          category,
          title,
          body: messageBody,
          target_audience: targetAudience,
          delivery_channel: deliveryChannel,
          recipient_student_ids: recipients.filter((r) => r.id != null).map((r) => r.id),
          manual_recipient_emails: manualEmailsForDb,
          recipient_count: recipients.length,
          email_sent_count: 0,
        })
        .select('id')
        .single()

      if (annErr || !announcement) {
        return new Response(JSON.stringify({ error: annErr?.message || 'Failed to save announcement' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const subject = `[${courseCode}] ${title}`
      const text = buildInstructorCommunicationPlainText({
        courseCode,
        instructorName,
        title,
        body: messageBody,
        category,
      })
      const html = buildInstructorCommunicationEmailHtml({
        logoUrl,
        brandName: smtpCfg?.fromName || 'جامعة الإمام البخاري',
        courseCode,
        instructorName,
        title,
        body: messageBody,
        category,
        isArabic,
      })

      if (sendEmail && smtpCfg) {
        for (const student of recipients) {
          try {
            await sendSmtpMessage(smtpCfg, student.email, subject, text, html, attachments)
            emailSentCount++
          } catch (e) {
            emailErrors.push(`${student.email}: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
        await supabaseAdmin
          .from('course_announcements')
          .update({ email_sent_count: emailSentCount })
          .eq('id', announcement.id)
      }

      return new Response(
        JSON.stringify({
          ok: true,
          announcementId: announcement.id,
          recipientCount: recipients.length,
          emailSentCount,
          emailErrors: emailErrors.length ? emailErrors : undefined,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    if (commType === 'message') {
      const studentId = Number(body.studentId)
      const subjectLine = String(body.subject || '').trim()
      const messageBody = String(body.body || '').trim()

      if (!studentId || !subjectLine || !messageBody) {
        return new Response(JSON.stringify({ error: 'studentId, subject, and body are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const student = allStudents.find((s) => s.id === studentId)
      if (!student) {
        return new Response(JSON.stringify({ error: 'Student not enrolled in this class' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: message, error: msgErr } = await supabaseAdmin
        .from('course_messages')
        .insert({
          class_id: classId,
          instructor_id: instructor.id,
          student_id: studentId,
          subject: subjectLine,
          body: messageBody,
          delivery_channel: deliveryChannel,
          email_sent: false,
        })
        .select('id')
        .single()

      if (msgErr || !message) {
        return new Response(JSON.stringify({ error: msgErr?.message || 'Failed to save message' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let emailSent = false
      if (sendEmail && smtpCfg) {
        const emailSubject = `[${courseCode}] ${subjectLine}`
        const text = buildInstructorCommunicationPlainText({
          courseCode,
          instructorName,
          title: subjectLine,
          body: messageBody,
          category: 'general',
        })
        const html = buildInstructorCommunicationEmailHtml({
          logoUrl,
          brandName: smtpCfg.fromName || 'جامعة الإمام البخاري',
          courseCode,
          instructorName,
          title: subjectLine,
          body: messageBody,
          category: 'general',
          isArabic,
        })
        try {
          await sendSmtpMessage(smtpCfg, student.email, emailSubject, text, html, attachments)
          emailSent = true
          await supabaseAdmin.from('course_messages').update({ email_sent: true }).eq('id', message.id)
        } catch (e) {
          emailErrors.push(e instanceof Error ? e.message : String(e))
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          messageId: message.id,
          emailSent,
          emailErrors: emailErrors.length ? emailErrors : undefined,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(JSON.stringify({ error: 'type must be announcement or message' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
