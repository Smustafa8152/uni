import { FunctionsHttpError } from '@supabase/supabase-js'

export const PLAN_SELECT =
  'id, major_id, study_mode, installments, currency, is_active, billing_mode, credit_hour_rate, majors (id, name_en, name_ar, code, degree_level), program_fee_items (id, name_en, name_ar, amount, is_optional, is_tuition, sort_order)'

/** The same select without the columns added on 13 Oct 2026, for a database that has not run that migration yet. */
export const PLAN_SELECT_LEGACY =
  'id, major_id, study_mode, installments, currency, is_active, majors (id, name_en, name_ar, code, degree_level), program_fee_items (id, name_en, name_ar, amount, is_optional, sort_order)'

/** True when an error says a column or function from the 13 Oct 2026 fee migration is missing. */
export function isMissingFeeMigration(error) {
  const text = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`
  return /billing_mode|credit_hour_rate|is_tuition|scholarship_status|student_fee_due|program_fee_roster|record_program_fee_payment|breakdown|method/i.test(text) &&
    /does not exist|could not find|schema cache/i.test(text)
}

/** Reads the plans; falls back to the older columns when the migration has not been run. */
export async function loadPlans(supabase) {
  const res = await supabase.from('program_fee_plans').select(PLAN_SELECT).order('id')
  if (!res.error) return { plans: res.data || [], migrated: true }
  if (!isMissingFeeMigration(res.error)) throw res.error
  const legacy = await supabase.from('program_fee_plans').select(PLAN_SELECT_LEGACY).order('id')
  if (legacy.error) throw legacy.error
  return { plans: (legacy.data || []).map((p) => ({ ...p, billing_mode: 'installment', credit_hour_rate: null })), migrated: false }
}

export function sortedItems(plan) {
  return [...(plan?.program_fee_items || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)
}

export function planTotal(plan) {
  return sortedItems(plan)
    .filter((item) => !item.is_optional)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)
}

export function installmentAmount(plan) {
  const n = Number(plan?.installments) || 1
  return Math.round((planTotal(plan) / n) * 100) / 100
}

/** Tuition lines (what a scholarship reduces) and the fixed fees, both without optional lines. */
export function planParts(plan) {
  const items = sortedItems(plan).filter((i) => !i.is_optional)
  const tuition = items.filter((i) => i.is_tuition).reduce((s, i) => s + Number(i.amount || 0), 0)
  const total = items.reduce((s, i) => s + Number(i.amount || 0), 0)
  const n = Number(plan?.installments) || 1
  return { tuition, fees: total - tuition, total, n, feesPerSemester: Math.round(((total - tuition) / n) * 100) / 100 }
}

export const isCreditHourPlan = (plan) => plan?.billing_mode === 'credit_hours'

/** What one student owes for one semester, worked out by the database (billing mode, hours, scholarship). */
export async function fetchFeeDue(supabase, studentId, semesterId) {
  const { data, error } = await supabase.rpc('student_fee_due', { p_student_id: studentId, p_semester_id: semesterId })
  if (error) throw error
  return data || null
}

export async function fetchRoster(supabase, planId, semesterId) {
  const { data, error } = await supabase.rpc('program_fee_roster', { p_plan_id: planId, p_semester_id: semesterId })
  if (error) throw error
  return data || []
}

export async function recordFeePayment(supabase, { studentId, semesterId, method, reference, note }) {
  const { data, error } = await supabase.rpc('record_program_fee_payment', {
    p_student_id: studentId,
    p_semester_id: semesterId,
    p_method: method,
    p_reference: reference || null,
    p_note: note || null,
  })
  if (error) throw error
  return data
}

export async function cancelFeePayment(supabase, paymentId, note) {
  const { error } = await supabase.rpc('cancel_program_fee_payment', { p_payment_id: paymentId, p_note: note || null })
  if (error) throw error
}

export function formatMoney(amount, currency = 'GMD') {
  const value = Number(amount)
  const safe = Number.isFinite(value) ? value : 0
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'GMD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(safe)
  } catch {
    return `${safe.toFixed(2)} ${currency || 'GMD'}`
  }
}

/** Semesters an opening covers: the semester itself, or every semester of the opened academic year. */
export function openedSemesterIds(openings, semesters) {
  const ids = new Set()
  for (const opening of openings || []) {
    if (opening.semester_id) ids.add(opening.semester_id)
    if (opening.academic_year_id) {
      for (const s of semesters || []) if (s.academic_year_id === opening.academic_year_id) ids.add(s.id)
    }
  }
  return ids
}

/**
 * The student's program fee plan and the installments open to them: one per opened semester that has not
 * ended before they joined, up to the plan's number of installments. Each row carries its paid payment, if any.
 */
export async function loadStudentInstallments(supabase, student) {
  if (!student?.major_id) return { plan: null, rows: [] }
  let { data: plan, error: planErr } = await supabase
    .from('program_fee_plans')
    .select(PLAN_SELECT)
    .eq('major_id', student.major_id)
    .eq('is_active', true)
    .maybeSingle()
  if (planErr && isMissingFeeMigration(planErr)) {
    ;({ data: plan, error: planErr } = await supabase
      .from('program_fee_plans')
      .select(PLAN_SELECT_LEGACY)
      .eq('major_id', student.major_id)
      .eq('is_active', true)
      .maybeSingle())
  }
  if (planErr) throw planErr
  if (!plan) return { plan: null, rows: [] }

  const [openRes, payRes] = await Promise.all([
    supabase.from('program_fee_openings').select('semester_id, academic_year_id').eq('plan_id', plan.id),
    supabase
      .from('program_fee_payments')
      .select('semester_id, amount, currency, paid_at, myfatoorah_payment_id')
      .eq('student_id', student.id)
      .eq('plan_id', plan.id)
      .eq('status', 'paid'),
  ])
  if (openRes.error) throw openRes.error
  if (payRes.error) throw payRes.error
  const openings = openRes.data || []
  const yearIds = openings.map((o) => o.academic_year_id).filter(Boolean)
  const semesterIds = openings.map((o) => o.semester_id).filter(Boolean)
  let semesters = []
  if (yearIds.length || semesterIds.length) {
    const filters = [
      yearIds.length ? `academic_year_id.in.(${yearIds.join(',')})` : null,
      semesterIds.length ? `id.in.(${semesterIds.join(',')})` : null,
    ].filter(Boolean)
    const { data: semData, error: semErr } = await supabase
      .from('semesters')
      .select('id, name_en, name_ar, academic_year_id, start_date, end_date')
      .or(filters.join(','))
      .order('start_date', { ascending: true })
    if (semErr) throw semErr
    semesters = semData || []
  }

  const opened = openedSemesterIds(openings, semesters)
  const paidBySemester = new Map((payRes.data || []).map((p) => [p.semester_id, p]))
  const joined = student.enrollment_date ? String(student.enrollment_date) : ''
  const creditHours = plan.billing_mode === 'credit_hours'
  const rows = semesters
    .filter((s) => opened.has(s.id))
    .filter((s) => !joined || !s.end_date || String(s.end_date) >= joined)
    .slice(0, creditHours ? undefined : plan.installments)
    .map((s, index) => ({ semester: s, number: index + 1, payment: paidBySemester.get(s.id) || null, due: null }))

  // The amount and its parts come from the database, the same figure the payment will charge.
  await Promise.all(
    rows.map(async (row) => {
      try {
        row.due = await fetchFeeDue(supabase, student.id, row.semester.id)
      } catch {
        row.due = null
      }
    })
  )
  return { plan, rows }
}

async function invoke(supabase, body) {
  const { data, error } = await supabase.functions.invoke('myfatoorah-student-fee', { body })
  if (error) {
    let message = error.message
    if (error instanceof FunctionsHttpError) {
      try {
        const payload = await error.context.json()
        if (payload?.error) message = String(payload.error)
      } catch {
        // The body is not JSON.
      }
    }
    throw new Error(message || 'Payment could not be started.')
  }
  if (data?.error) throw new Error(data.error)
  return data || {}
}

export const listStudentFeeMethods = (supabase, semesterId) => invoke(supabase, { action: 'methods', semesterId })

export async function startStudentFeeCheckout(supabase, { semesterId, paymentMethodId, language }) {
  const data = await invoke(supabase, { action: 'create', semesterId, paymentMethodId, language })
  if (data.alreadyPaid) return { alreadyPaid: true }
  if (!data.invoiceUrl) throw new Error('Payment link was not created.')
  window.location.assign(data.invoiceUrl)
  return { redirected: true }
}

export const confirmStudentFeePayment = (supabase, paymentId) => invoke(supabase, { action: 'confirm', paymentId })
