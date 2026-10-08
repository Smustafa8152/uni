import { FunctionsHttpError } from '@supabase/supabase-js'

export const PLAN_SELECT =
  'id, major_id, study_mode, installments, currency, is_active, majors (id, name_en, name_ar, code, degree_level), program_fee_items (id, name_en, name_ar, amount, is_optional, sort_order)'

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

export function formatMoney(amount, currency = 'USD') {
  const value = Number(amount)
  const safe = Number.isFinite(value) ? value : 0
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(safe)
  } catch {
    return `${safe.toFixed(2)} ${currency || 'USD'}`
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
  const { data: plan, error: planErr } = await supabase
    .from('program_fee_plans')
    .select(PLAN_SELECT)
    .eq('major_id', student.major_id)
    .eq('is_active', true)
    .maybeSingle()
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
  const rows = semesters
    .filter((s) => opened.has(s.id))
    .filter((s) => !joined || !s.end_date || String(s.end_date) >= joined)
    .slice(0, plan.installments)
    .map((s, index) => ({ semester: s, number: index + 1, payment: paidBySemester.get(s.id) || null }))
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
