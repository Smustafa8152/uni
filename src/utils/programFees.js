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
