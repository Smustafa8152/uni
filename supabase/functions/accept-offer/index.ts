import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.16'
import { buildBrandedEmailHtml, buildPlainTextEmail } from './email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function toNum(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'))
  return Number.isFinite(n) ? n : 0
}

function computeMilestone(totalPaid: number, totalDue: number): string {
  const due = Number(totalDue || 0)
  const paid = Number(totalPaid || 0)
  if (!Number.isFinite(due) || due <= 0) return 'PM00'
  const pct = (Math.max(0, paid) / due) * 100
  if (pct >= 100) return 'PM100'
  if (pct >= 90) return 'PM90'
  if (pct >= 60) return 'PM60'
  if (pct >= 30) return 'PM30'
  if (pct >= 10) return 'PM10'
  return 'PM00'
}

function addDays(dateIso: string, days: number) {
  const d = new Date(`${dateIso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + Number(days || 0))
  return d.toISOString().split('T')[0]
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


function applyIdTokens(format: string, prefix: string, year: number, collegeCode: string, sequenceToken: string) {
  const yearNum = String(year)
  const year2 = yearNum.length >= 2 ? yearNum.slice(-2) : yearNum
  return format
    .replaceAll('{prefix}', prefix)
    .replaceAll('{year}', yearNum)
    .replaceAll('{year2}', year2)
    .replaceAll('{college_code}', collegeCode)
    .replaceAll('{collegeCode}', collegeCode)
    .replace(/\{sequence:D\d+\}/g, sequenceToken)
}

function formatStudentId(format: string, prefix: string, year: number, collegeCode: string, sequence: number) {
  const widthMatch = format.match(/\{sequence:D(\d+)\}/)
  const width = widthMatch ? parseInt(widthMatch[1], 10) : 4
  const seqStr = String(Math.max(0, sequence)).padStart(width, '0')
  return applyIdTokens(format, prefix, year, collegeCode, seqStr)
}

async function generateStudentId(supabaseAdmin: any, collegeId: number) {
  const { data: college } = await supabaseAdmin
    .from('colleges')
    .select('student_id_prefix, student_id_format, student_id_starting_number, code')
    .eq('id', collegeId)
    .single()

  const prefix = college?.student_id_prefix ?? ''
  const collegeCode = college?.code ?? ''
  const year = new Date().getFullYear()
  const format = college?.student_id_format || '{prefix}{year}{sequence:D4}'
  const staticPrefix = applyIdTokens(format, prefix, year, collegeCode, '')

  let query = supabaseAdmin.from('students').select('student_id').eq('college_id', collegeId)
  if (staticPrefix) query = query.like('student_id', `${staticPrefix}%`)
  const { data: existing } = await query.limit(10000)

  const ids = (existing || []).map((r: any) => String(r.student_id || '')).filter(Boolean)
  let max = 0
  for (const id of ids) {
    if (staticPrefix && !id.startsWith(staticPrefix)) continue
    const rest = staticPrefix ? id.slice(staticPrefix.length) : id
    const m = rest.match(/^(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  const start = Number(college?.student_id_starting_number) || 1
  let sequence = Math.max(max + 1, start)

  // student_id is unique across every college, so skip numbers already taken elsewhere.
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = formatStudentId(format, prefix, year, collegeCode, sequence)
    const { data: taken } = await supabaseAdmin
      .from('students')
      .select('id')
      .eq('student_id', candidate)
      .maybeSingle()
    if (!taken) return candidate
    sequence++
  }
  throw new Error('Unable to generate a unique student ID')
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
    const forceFinalize = Boolean((body as any)?.forceFinalize)
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

    const collegeIdForPayments = Number(app.college_id || 0) || null
    let paymentsEnabled = true
    try {
      if (collegeIdForPayments) {
        // Global kill switch: if university disables payments, bypass all payment gating.
        const { data: uniRow } = await supabaseAdmin
          .from('university_settings')
          .select('financial_settings')
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        const uniFlag = (uniRow as any)?.financial_settings?.payments_enabled
        if (uniFlag === false) {
          paymentsEnabled = false
        } else {
          const { data: collegeRow } = await supabaseAdmin
            .from('colleges')
            .select('financial_settings')
            .eq('id', collegeIdForPayments)
            .maybeSingle()
          const collegeFlag = (collegeRow as any)?.financial_settings?.payments_enabled
          if (typeof collegeFlag === 'boolean') {
            paymentsEnabled = collegeFlag
          } else if (typeof uniFlag === 'boolean') {
            paymentsEnabled = uniFlag
          }
        }
      }
    } catch {
      paymentsEnabled = true
    }

    // Allow applicant OR admin/user staff to finalize.
    const { data: callerRow } = await supabaseAdmin
      .from('users')
      .select('id, role, college_id, email')
      .eq('openId', authUser.id)
      .maybeSingle()
    const callerRole = String((callerRow as any)?.role || '').toLowerCase()
    const isStaffCaller = callerRole === 'admin' || callerRole === 'user'

    if (String(app.applicant_user_id || '') !== String(authUser.id) && !isStaffCaller) {
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

    // Ensure required student display names are never NULL (students.name_ar is NOT NULL in DB).
    const computedNameEn = [app.first_name, app.middle_name, app.last_name].filter(Boolean).join(' ').trim()
    const computedNameAr = [app.first_name_ar, app.middle_name_ar, app.last_name_ar].filter(Boolean).join(' ').trim()
    const safeNameEn = (computedNameEn || `${app.first_name || ''} ${app.last_name || ''}`.trim() || app.email || '').trim()
    const safeNameAr = (computedNameAr || safeNameEn).trim()
    const rawGender = String(app.gender || '').trim().toLowerCase()
    const safeGender = rawGender === 'male' || rawGender === 'female' ? rawGender : null
    const idNumber = String(app.id_number || '').trim() || null
    const isPassport = String(app.id_type || '').toLowerCase() === 'passport'
    const gpaNum = app.gpa != null && app.gpa !== '' ? Number(app.gpa) : null

    // Everything the applicant filled in on the application form that the student record can hold.
    const profileFromApplication: Record<string, unknown> = {
      name_en: safeNameEn,
      name_ar: safeNameAr,
      first_name: app.first_name || null,
      middle_name: app.middle_name || null,
      last_name: app.last_name || null,
      first_name_ar: app.first_name_ar || null,
      middle_name_ar: app.middle_name_ar || null,
      last_name_ar: app.last_name_ar || null,
      phone: app.phone || null,
      mobile_phone: app.phone || null,
      date_of_birth: app.date_of_birth || null,
      gender: safeGender,
      nationality: app.nationality || null,
      religion: app.religion || null,
      national_id: app.national_id || idNumber,
      passport_number: isPassport ? idNumber : null,
      passport_expiry: isPassport ? app.id_expiry_date || null : null,
      address: app.street_address || null,
      city: app.city || null,
      state: app.state_province || null,
      country: app.country || null,
      postal_code: app.postal_code || null,
      emergency_contact_name: app.emergency_contact_name || null,
      emergency_contact_relation: app.emergency_contact_relationship || app.emergency_contact_relation || null,
      emergency_contact_email: app.emergency_contact_email || null,
      emergency_phone: app.emergency_contact_phone || app.emergency_phone || null,
      high_school_name: app.high_school_name || null,
      high_school_country: app.high_school_country || null,
      graduation_year: app.graduation_year || null,
      high_school_gpa: Number.isFinite(gpaNum) ? gpaNum : null,
      major_id: Number(app.major_id),
      college_id: Number(app.college_id),
      study_approach: app.study_type === 'online' ? 'online' : 'on_campus',
    }

    if (paymentsEnabled && !forceFinalize) {
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
    }

    // `public.users` row for the enrolling person — must NOT be the staff caller's id when
    // an admin/college user finalizes acceptance (otherwise their role becomes `student`).
    let enrollmentUserId: number | null = null
    const applicantAuthId = app.applicant_user_id != null ? String(app.applicant_user_id) : ''
    if (applicantAuthId) {
      const { data: applicantUserRow } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('openId', applicantAuthId)
        .maybeSingle()
      enrollmentUserId = applicantUserRow?.id ?? null
    }
    if (enrollmentUserId == null && applicantAuthId && String(authUser.id) === applicantAuthId) {
      enrollmentUserId = (callerRow as any)?.id ?? null
    }
    if (enrollmentUserId == null && typeof app.email === 'string' && app.email.trim()) {
      const { data: byAppEmail } = await supabaseAdmin
        .from('users')
        .select('id')
        .ilike('email', app.email.trim())
        .maybeSingle()
      enrollmentUserId = byAppEmail?.id ?? null
    }
    if (enrollmentUserId == null && !isStaffCaller) {
      enrollmentUserId = (callerRow as any)?.id ?? null
    }

    const userId = enrollmentUserId

    // Create student record if missing
    const { data: existingStudent } = await supabaseAdmin
      .from('students')
      .select('id, student_id')
      .eq('email', app.email)
      .maybeSingle()

    let createdStudent: any = existingStudent
    if (!existingStudent) {
      const enrollmentDate = new Date().toISOString().split('T')[0]
      let lastInsErr: any = null
      for (let attempt = 0; attempt < 8; attempt++) {
        const studentId = await generateStudentId(supabaseAdmin, Number(app.college_id))
        const { data: inserted, error: insErr } = await supabaseAdmin
          .from('students')
          .insert({
            ...profileFromApplication,
            user_id: userId,
            student_id: studentId,
            email: app.email,
            enrollment_date: enrollmentDate,
            status: 'active',
            study_type: app.study_type === 'part_time' ? 'part_time' : 'full_time',
          })
          .select('id, student_id')
          .single()
        if (!insErr) {
          createdStudent = inserted
          lastInsErr = null
          break
        }
        const duplicateId =
          insErr.code === '23505' && String(insErr.message || '').includes('students_student_id_unique')
        if (!duplicateId) throw insErr
        lastInsErr = insErr
      }
      if (!createdStudent) throw lastInsErr || new Error('Unable to generate a unique student ID')
    }
    // Keep student record in sync with the latest application data (best-effort update).
    // Empty application values never overwrite what the student record already has.
    try {
      if (createdStudent?.id) {
        const filled = Object.fromEntries(
          Object.entries(profileFromApplication).filter(([, v]) => v !== null && v !== undefined && v !== ''),
        )
        await supabaseAdmin.from('students').update(filled).eq('id', createdStudent.id)
      }
    } catch {
      // ignore
    }

    // Link application-stage invoices/payments to this student (so they appear in admin + student portal).
    // This includes the registration-fee invoice created during application registration.
    try {
      if (createdStudent?.id) {
        const { data: appInvoices } = await supabaseAdmin
          .from('invoices')
          .select('id')
          .eq('application_id', applicationId)

        const invIds = (appInvoices || []).map((r: any) => r.id).filter((v: any) => Number.isFinite(Number(v)))
        if (invIds.length > 0) {
          await supabaseAdmin.from('invoices').update({ student_id: createdStudent.id }).in('id', invIds)
          // payments.student_id may be null for application-stage payments; backfill it.
          await supabaseAdmin.from('payments').update({ student_id: createdStudent.id }).in('invoice_id', invIds)
        }
      }
    } catch (e) {
      console.error('accept-offer link application invoices/payments error:', e)
    }

    // Copy application documents → student_documents (so they appear in student portal & admin student view)
    try {
      if (createdStudent?.id) {
        const { data: appDocs, error: appDocsErr } = await supabaseAdmin
          .from('application_documents')
          .select('document_type, file_path, file_name, file_size, content_type, uploaded_at, verified_at')
          .eq('application_id', applicationId)
        if (!appDocsErr && appDocs?.length) {
          for (const doc of appDocs) {
            await supabaseAdmin.from('student_documents').upsert(
              {
                student_id: createdStudent.id,
                document_type: doc.document_type,
                file_path: doc.file_path,
                file_name: doc.file_name,
                file_size: doc.file_size,
                content_type: doc.content_type,
                uploaded_at: doc.uploaded_at || new Date().toISOString(),
                status: doc.verified_at ? 'verified' : 'in_review',
                verified_at: doc.verified_at || null,
              },
              { onConflict: 'student_id,document_type' },
            )
          }
        }
      }
    } catch {
      // ignore
    }

    // Promote role to student (keeps same auth email/password)
    if (userId) {
      await supabaseAdmin.from('users').update({ role: 'student', college_id: app.college_id }).eq('id', userId)
    }

    // Create semester tuition invoice + apply the 10% onboarding payment (so PM10/PM30 gates have a real base)
    // Best-effort: do not fail offer acceptance if finance sync fails.
    try {
      if (paymentsEnabled && createdStudent?.id) {
        let semesterId: number | null = Number(app.semester_id || 0) || null
        if (!semesterId) {
          const { data: sem } = await supabaseAdmin
            .from('semesters')
            .select('id')
            .or(`college_id.eq.${app.college_id},is_university_wide.eq.true`)
            .in('status', ['active', 'registration_open'])
            .order('start_date', { ascending: false })
            .limit(1)
            .maybeSingle()
          semesterId = sem?.id ?? null
        }

        if (semesterId) {
          const { data: existingTuition } = await supabaseAdmin
            .from('invoices')
            .select('id')
            .eq('student_id', createdStudent.id)
            .eq('semester_id', semesterId)
            .neq('invoice_type', 'admission_fee')
            .order('invoice_date', { ascending: false })
            .limit(1)
            .maybeSingle()

          if (!existingTuition?.id) {
            const majorId = Number(app.major_id || 0) || null
            const collegeId = Number(app.college_id || 0) || null
            let degreeLevel: string | null = null
            if (majorId) {
              const { data: majorRow } = await supabaseAdmin
                .from('majors')
                .select('id, degree_level, tuition_fee, lab_fee')
                .eq('id', majorId)
                .maybeSingle()
              degreeLevel = (majorRow?.degree_level as string) || null
            }

            // IMPORTANT: Offer 10% should be based on SEMESTER fees, not whole-major/program totals.
            // Therefore we prefer semester-scoped finance_configuration totals. Major catalog is LAST fallback only.
            let configTotal = 0
            let paymentPortions: any[] = []
            if (collegeId) {
              const { data: cfg } = await supabaseAdmin
                .from('finance_configuration')
                .select(
                  'id, fee_type, amount, payment_portions, is_university_wide, college_id, semester_id, applies_to_semester, applies_to_major, applies_to_degree_level, is_active',
                )
                .eq('is_active', true)
                .or(`college_id.eq.${collegeId},is_university_wide.eq.true`)

              const applicable = (cfg || []).filter((row: any) => {
                const feeType = String(row?.fee_type || '').toLowerCase()
                if (feeType === 'admission_fee' || feeType === 'registration_fee' || feeType === 'application_fee' || feeType === 'wallet_credit') return false
                const hasSemesterScope =
                  row?.semester_id != null ||
                  (Array.isArray(row?.applies_to_semester) && row.applies_to_semester.length > 0)
                const semList = Array.isArray(row?.applies_to_semester)
                  ? row.applies_to_semester.map((v: any) => Number(v)).filter((n: number) => Number.isFinite(n))
                  : []
                const semScopedMatch =
                  (row?.semester_id != null && Number(row.semester_id) === Number(semesterId)) ||
                  (semList.length > 0 && semList.includes(Number(semesterId)))
                const majors = row?.applies_to_major as number[] | null
                if (Array.isArray(majors) && majors.length > 0 && majorId && !majors.includes(Number(majorId))) return false
                const degrees = row?.applies_to_degree_level as string[] | null
                if (Array.isArray(degrees) && degrees.length > 0 && degreeLevel && !degrees.includes(String(degreeLevel))) return false

                // If nothing is semester-scoped, allow major-scoped tuition rows to represent semester totals.
                // This supports setups where finance_configuration is configured per-major with payment_portions
                // but semester scoping was not selected in the UI.
                const looksLikeTuition =
                  feeType.includes('tuition') || feeType.includes('tution') || feeType === 'course_fee' || feeType === 'course_fees'

                if (hasSemesterScope) {
                  if (!semScopedMatch) return false
                } else {
                  if (!looksLikeTuition) return false
                }

                return true
              })

              configTotal = applicable.reduce((acc: number, row: any) => acc + toNum(row?.amount), 0)

              const portionSource = (applicable || []).find(
                (r: any) => Array.isArray(r?.payment_portions) && r.payment_portions.length > 0,
              )
              paymentPortions = Array.isArray(portionSource?.payment_portions) ? portionSource.payment_portions : []
            }

            let totalDue = configTotal || 0
            if (totalDue <= 0 && majorId) {
              const { data: majorRow } = await supabaseAdmin
                .from('majors')
                .select('id, tuition_fee, lab_fee')
                .eq('id', majorId)
                .maybeSingle()
              const catalogTotal = toNum(majorRow?.tuition_fee) + toNum(majorRow?.lab_fee)
              totalDue = catalogTotal || 0
            }
            const onboardingPaid = toNum(app.tuition_fee_amount) || (totalDue > 0 ? totalDue * 0.1 : 0)
            const payMethod = (String(app.tuition_fee_payment_method || 'online_payment') as any) || 'online_payment'

            if (totalDue > 0) {
              const invoiceDate = new Date().toISOString().split('T')[0]

              const normalizedPortions = (paymentPortions || [])
                .map((p: any) => ({
                  portion_number: Number(p?.portion_number ?? 0),
                  percentage: toNum(p?.percentage),
                  days: Number(p?.days ?? 0),
                  custom_date: p?.custom_date ? String(p.custom_date) : null,
                  deadline_type: String(p?.deadline_type || 'days_from_invoice'),
                }))
                .filter((p: any) => Number.isFinite(p.portion_number) && p.portion_number > 0 && p.percentage > 0)
                .sort((a: any, b: any) => a.portion_number - b.portion_number)

              const portionsPct = normalizedPortions.reduce((acc: number, p: any) => acc + toNum(p.percentage), 0)
              const usePortions = normalizedPortions.length >= 2 && Math.abs(portionsPct - 100) <= 0.5

              let payableInvoiceId: number | null = null

              if (usePortions) {
                // Parent summary invoice (non-payable, children are payable)
                const { data: parentNum } = await supabaseAdmin.rpc('generate_invoice_number', { college_id_param: collegeId })
                const { data: parentInv, error: parentErr } = await supabaseAdmin
                  .from('invoices')
                  .insert({
                    invoice_number: parentNum,
                    student_id: createdStudent.id,
                    application_id: null,
                    college_id: collegeId,
                    semester_id: semesterId,
                    invoice_date: invoiceDate,
                    due_date: invoiceDate,
                    invoice_type: 'course_fee',
                    status: 'pending',
                    subtotal: totalDue,
                    discount_amount: 0,
                    scholarship_amount: 0,
                    tax_amount: 0,
                    total_amount: totalDue,
                    paid_amount: 0,
                    pending_amount: totalDue,
                    payment_method: payMethod,
                    notes: `Semester fees (summary) — offer onboarding for application ${app.application_number || applicationId}`,
                  })
                  .select('id')
                  .single()
                if (parentErr) throw parentErr

                await supabaseAdmin.from('invoice_items').insert({
                  invoice_id: parentInv.id,
                  item_type: 'tuition_fee',
                  item_name_en: 'Semester tuition fees (summary)',
                  item_name_ar: 'رسوم الفصل الدراسي (ملخص)',
                  description: 'Created on offer acceptance (summary)',
                  quantity: 1,
                  unit_price: totalDue,
                  discount_amount: 0,
                  scholarship_amount: 0,
                  total_amount: totalDue,
                  reference_id: majorId,
                  reference_type: 'major',
                })

                const childIds: { id: number; portion_number: number }[] = []
                for (const p of normalizedPortions) {
                  const amount = Math.round((totalDue * (toNum(p.percentage) / 100)) * 100) / 100
                  const due =
                    p.deadline_type === 'custom_date' && p.custom_date
                      ? String(p.custom_date).split('T')[0]
                      : addDays(invoiceDate, Number(p.days || 0))

                  const { data: childNum } = await supabaseAdmin.rpc('generate_invoice_number', { college_id_param: collegeId })
                  const { data: childInv, error: childErr } = await supabaseAdmin
                    .from('invoices')
                    .insert({
                      invoice_number: childNum,
                      parent_invoice_id: parentInv.id,
                      student_id: createdStudent.id,
                      application_id: null,
                      college_id: collegeId,
                      semester_id: semesterId,
                      invoice_date: invoiceDate,
                      due_date: due,
                      invoice_type: 'course_fee',
                      status: 'pending',
                      subtotal: amount,
                      discount_amount: 0,
                      scholarship_amount: 0,
                      tax_amount: 0,
                      total_amount: amount,
                      paid_amount: 0,
                      pending_amount: amount,
                      payment_method: payMethod,
                      notes: `Portion ${p.portion_number} (${toNum(p.percentage)}%) — offer onboarding`,
                    })
                    .select('id')
                    .single()
                  if (childErr) throw childErr

                  await supabaseAdmin.from('invoice_items').insert({
                    invoice_id: childInv.id,
                    item_type: 'tuition_fee',
                    item_name_en: `Semester fees — Portion ${p.portion_number} (${toNum(p.percentage)}%)`,
                    item_name_ar: `رسوم الفصل الدراسي — القسط ${p.portion_number} (${toNum(p.percentage)}٪)`,
                    description: 'Created on offer acceptance (portion)',
                    quantity: 1,
                    unit_price: amount,
                    discount_amount: 0,
                    scholarship_amount: 0,
                    total_amount: amount,
                    reference_id: majorId,
                    reference_type: 'major',
                  })

                  childIds.push({ id: childInv.id, portion_number: p.portion_number })
                }

                const first = childIds.sort((a, b) => a.portion_number - b.portion_number)[0]
                payableInvoiceId = first?.id ?? null
              } else {
                // Single payable invoice
                const { data: invNum } = await supabaseAdmin.rpc('generate_invoice_number', { college_id_param: collegeId })
                const { data: inv, error: invErr } = await supabaseAdmin
                  .from('invoices')
                  .insert({
                    invoice_number: invNum,
                    student_id: createdStudent.id,
                    application_id: null,
                    college_id: collegeId,
                    semester_id: semesterId,
                    invoice_date: invoiceDate,
                    due_date: invoiceDate,
                    invoice_type: 'course_fee',
                    status: 'pending',
                    subtotal: totalDue,
                    discount_amount: 0,
                    scholarship_amount: 0,
                    tax_amount: 0,
                    total_amount: totalDue,
                    paid_amount: 0,
                    pending_amount: totalDue,
                    payment_method: payMethod,
                    notes: `Tuition/semester fees — offer onboarding for application ${app.application_number || applicationId}`,
                  })
                  .select('id')
                  .single()
                if (invErr) throw invErr
                payableInvoiceId = inv.id

                await supabaseAdmin.from('invoice_items').insert({
                  invoice_id: inv.id,
                  item_type: 'tuition_fee',
                  item_name_en: 'Semester tuition fees',
                  item_name_ar: 'رسوم الفصل الدراسي',
                  description: 'Created on offer acceptance (onboarding)',
                  quantity: 1,
                  unit_price: totalDue,
                  discount_amount: 0,
                  scholarship_amount: 0,
                  total_amount: totalDue,
                  reference_id: majorId,
                  reference_type: 'major',
                })
              }

              if (onboardingPaid > 0 && payableInvoiceId) {
                const { data: payNum } = await supabaseAdmin.rpc('generate_payment_number', { college_id_param: collegeId })
                const paymentTs = new Date().toISOString()
                await supabaseAdmin.from('payments').insert({
                  payment_number: payNum,
                  invoice_id: payableInvoiceId,
                  student_id: createdStudent.id,
                  college_id: collegeId,
                  payment_date: invoiceDate,
                  payment_method: payMethod,
                  amount: onboardingPaid,
                  status: 'verified',
                  verified_at: paymentTs,
                  notes: `Onboarding paid on offer letter for application ${app.application_number || applicationId}`,
                })

                const { data: invRow } = await supabaseAdmin
                  .from('invoices')
                  .select('total_amount')
                  .eq('id', payableInvoiceId)
                  .maybeSingle()
                const invTotal = toNum(invRow?.total_amount)
                const newPaid = Math.min(invTotal, onboardingPaid)
                const newPending = Math.max(0, invTotal - newPaid)
                await supabaseAdmin
                  .from('invoices')
                  .update({
                    paid_amount: newPaid,
                    pending_amount: newPending,
                    status: newPending <= 0 ? 'paid' : 'partially_paid',
                  })
                  .eq('id', payableInvoiceId)
              }

              const { data: semInvoices } = await supabaseAdmin
                .from('invoices')
                .select('id, total_amount, paid_amount, status, invoice_type, parent_invoice_id')
                .eq('student_id', createdStudent.id)
                .eq('semester_id', semesterId)
                .neq('invoice_type', 'admission_fee')

              let tDue = 0
              let tPaid = 0
              const parentIds = new Set<number>()
              ;(semInvoices || []).forEach((inv: any) => {
                if (!inv?.parent_invoice_id) {
                  const hasChildren = (semInvoices || []).some((c: any) => c?.parent_invoice_id === inv?.id)
                  if (hasChildren) parentIds.add(Number(inv.id))
                }
              })
              ;(semInvoices || []).forEach((r: any) => {
                if (parentIds.has(Number(r?.id))) return
                tDue += toNum(r?.total_amount)
                if (r?.status === 'paid' || r?.status === 'partially_paid') tPaid += toNum(r?.paid_amount)
              })

              await supabaseAdmin
                .from('student_semester_financial_status')
                .upsert(
                  {
                    student_id: createdStudent.id,
                    semester_id: semesterId,
                    financial_milestone_code: computeMilestone(tPaid, tDue),
                    total_due: tDue,
                    total_paid: tPaid,
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'student_id,semester_id' },
                )
            }
          }
        }
      }
    } catch (e) {
      console.error('accept-offer finance sync error:', e)
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
        const subject = 'You have been admitted — تم قبولك'
        const message =
          'Congratulations. You have been admitted. Your place is confirmed. Log in to the student portal with the same email and password you used to apply.\n\nتهانينا. تم قبولك. مقعدك مؤكد. سجّل الدخول إلى بوابة الطالب بنفس البريد وكلمة المرور التي استخدمتها في التقديم.'
        const appNo = String(app.application_number || app.id)
        const html = buildBrandedEmailHtml({
          brandName: smtp.fromName,
          brandEmail: smtp.fromEmail,
          subject,
          message,
          metaLabel: 'Application',
          metaValue: appNo,
        })
        const text = buildPlainTextEmail({ subject, message, metaLine: `Application: ${appNo}` })
        await sendSmtpMessage(smtp, String(app.email), subject, text, html)

        const loginUrl = 'https://qalam.nuzum.tech/login/student'
        const subject2 = 'Welcome — student onboarding'
        const message2 = paymentsEnabled
          ? `Welcome to the Student Portal.\n\nLog in here:\n${loginUrl}\n\nNext steps:\n- Log in using the same email and password you used during application registration.\n- Open Student Portal → Invoices & fees to complete the remaining semester payments (30% unlocks registration).\n- Upload/verify any missing documents from Student Portal → Documents.\n\nIf you have any questions, contact the admissions/finance office.`
          : `Welcome to the Student Portal.\n\nLog in here:\n${loginUrl}\n\nNext steps:\n- Log in using the same email and password you used during application registration.\n- Upload/verify any missing documents from Student Portal → Documents.\n\nIf you have any questions, contact the admissions office.`
        const appNo2 = String(app.application_number || app.id)
        const html2 = buildBrandedEmailHtml({
          brandName: smtp.fromName,
          brandEmail: smtp.fromEmail,
          subject: subject2,
          message: message2,
          metaLabel: 'Application',
          metaValue: appNo2,
        })
        const text2 = buildPlainTextEmail({ subject: subject2, message: message2, metaLine: `Application: ${appNo2}` })
        await sendSmtpMessage(smtp, String(app.email), subject2, text2, html2)
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

