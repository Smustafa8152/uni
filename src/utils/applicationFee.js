import { FunctionsHttpError } from '@supabase/supabase-js'

export const APPLICATION_FEE_DEFAULT = 20

export function readApplicationFeeSettings(onboarding) {
  const raw = onboarding?.application_fee
  const amount = Number(raw?.amount)
  return {
    enabled: Boolean(raw?.enabled),
    amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : APPLICATION_FEE_DEFAULT,
  }
}

export function formatApplicationFee(amount, currency = 'USD') {
  const value = Number(amount)
  const safe = Number.isFinite(value) ? value : 0
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(safe)
  } catch {
    return `${safe.toFixed(2)} ${currency || 'USD'}`
  }
}

async function functionErrorMessage(error) {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json()
      if (body?.error) return String(body.error)
    } catch {
      // The body is not JSON.
    }
  }
  return error?.message || 'Payment could not be started.'
}

async function invokeFee(supabase, body) {
  const { data, error } = await supabase.functions.invoke('myfatoorah-application-fee', { body })
  if (error) throw new Error(await functionErrorMessage(error))
  if (data?.error) throw new Error(data.error)
  return data || {}
}

export async function listApplicationFeeMethods(supabase, { applicationId }) {
  return invokeFee(supabase, { action: 'methods', applicationId })
}

export async function startApplicationFeeCheckout(supabase, { applicationId, language, paymentMethodId }) {
  const data = await invokeFee(supabase, {
    action: 'create',
    applicationId,
    paymentMethodId,
    language: String(language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en',
  })
  if (data.alreadyPaid) return { alreadyPaid: true, application: data.application }
  if (!data.invoiceUrl) throw new Error('Payment link was not created.')
  window.location.assign(data.invoiceUrl)
  return { redirected: true }
}

export async function confirmApplicationFeePayment(supabase, { paymentId, applicationId }) {
  return invokeFee(supabase, { action: 'confirm', paymentId: paymentId || null, applicationId: applicationId || null })
}
