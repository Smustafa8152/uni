import { APPLICATION_FEE_DEFAULT } from './applicationFee'
import { getApplicationFormDefaults } from './getApplicationFormDefaults'

/**
 * Amount the applicant is asked to pay when the application is payment pending.
 * It always comes from the Application fee card (Ask for the fee), in dalasi,
 * including when staff set the status by hand.
 */
export async function resolveRegistrationFeeAmount() {
  try {
    const cfg = await getApplicationFormDefaults()
    const amount = Number(cfg?.application_fee?.amount)
    if (Number.isFinite(amount) && amount > 0) return Math.round(amount * 100) / 100
  } catch {
    // Fall through to the same default the fee card uses.
  }
  return APPLICATION_FEE_DEFAULT
}
