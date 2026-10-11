import { FunctionsHttpError } from '@supabase/supabase-js'

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
  const { data, error } = await supabase.functions.invoke('myfatoorah-registration-fee', { body })
  if (error) throw new Error(await functionErrorMessage(error))
  if (data?.error) throw new Error(data.error)
  return data || {}
}

export async function listRegistrationFeeMethods(supabase, { applicationId }) {
  return invokeFee(supabase, { action: 'methods', applicationId })
}

export async function startRegistrationFeeCheckout(supabase, { applicationId, language, paymentMethodId, returnPath }) {
  const data = await invokeFee(supabase, {
    action: 'create',
    applicationId,
    paymentMethodId,
    returnPath,
    language: String(language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en',
  })
  if (data.alreadyPaid) return { alreadyPaid: true, application: data.application }
  if (!data.invoiceUrl) throw new Error('Payment link was not created.')
  window.location.assign(data.invoiceUrl)
  return { redirected: true }
}

export async function confirmRegistrationFeePayment(supabase, { paymentId, applicationId }) {
  return invokeFee(supabase, { action: 'confirm', paymentId: paymentId || null, applicationId: applicationId || null })
}
