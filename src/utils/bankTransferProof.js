import { SUPABASE_STORAGE_BUCKET } from '../lib/supabase'
import { sendPaymentReceiptEmail } from './paymentReceiptEmail'

export const BANK_TRANSFER_CURRENCY = 'GMD'

export async function listBankTransfers(supabase, applicationId) {
  const id = Number(applicationId)
  if (!Number.isFinite(id)) return []
  const { data, error } = await supabase
    .from('application_bank_transfers')
    .select('id, application_id, fee_kind, amount, currency, sender_name, transfer_reference, transfer_date, notes, file_path, file_name, content_type, status, created_at, confirmed_at')
    .eq('application_id', id)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export function bankProofUrl(supabase, filePath) {
  if (!filePath) return ''
  const { data } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(filePath)
  return data?.publicUrl || ''
}

export async function submitBankTransfer(supabase, { applicationId, feeKind, amount, currency, details, senderName, transferDate, file }) {
  const id = Number(applicationId)
  if (!Number.isFinite(id)) throw new Error('Application is missing.')
  if (!file) throw new Error('Screenshot is required.')
  const note = String(details || '').trim()
  if (!note) throw new Error('Transfer details are required.')

  const safeName = `${Date.now()}-${String(file.name || 'transfer').replace(/[^a-zA-Z0-9.-]/g, '_')}`
  const storagePath = `${id}/bank-transfer/${feeKind}/${safeName}`
  const { error: uploadError } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type || 'image/jpeg' })
  if (uploadError) throw uploadError

  const { error } = await supabase.from('application_bank_transfers').insert({
    application_id: id,
    fee_kind: feeKind === 'registration' ? 'registration' : 'application',
    amount: Number.isFinite(Number(amount)) ? Number(amount) : null,
    currency: currency || BANK_TRANSFER_CURRENCY,
    sender_name: String(senderName || '').trim() || null,
    transfer_reference: note.slice(0, 160),
    transfer_date: transferDate || null,
    notes: note,
    file_path: storagePath,
    file_name: file.name || safeName,
    content_type: file.type || null,
    status: 'submitted',
  })
  if (error) throw error
}

export async function confirmBankTransfer(supabase, { proof, application, staffUserId }) {
  if (!proof?.id || !application?.id) throw new Error('Payment proof is missing.')
  const now = new Date().toISOString()
  const fromStatus = application.status_code || null

  if (proof.fee_kind === 'registration') {
    const nextStatus = String(fromStatus || '').toUpperCase() === 'APPN' ? 'APPC' : fromStatus
    const { error } = await supabase
      .from('applications')
      .update({
        registration_fee_amount: proof.amount,
        registration_fee_paid_at: now,
        registration_fee_payment_method: 'bank_transfer',
        financial_milestone_code: 'PM10',
        status_code: nextStatus,
        status_changed_at: now,
        payment_review: null,
      })
      .eq('id', application.id)
      .is('registration_fee_paid_at', null)
    if (error) throw error
    await supabase.from('status_change_audit_log').insert({
      entity_type: 'application',
      entity_id: application.id,
      from_status_code: fromStatus,
      to_status_code: nextStatus,
      trigger_code: 'TRWH',
      triggered_by: staffUserId || null,
      notes: `Registration fee confirmed from bank transfer: ${proof.amount} ${proof.currency || BANK_TRANSFER_CURRENCY}.`,
    })
  } else {
    const nextStatus = String(fromStatus || '').toUpperCase() === 'APFP' ? 'APSB' : fromStatus
    const { error } = await supabase
      .from('applications')
      .update({
        status_code: nextStatus,
        status: 'pending',
        application_fee_status: 'paid',
        application_fee_paid_at: now,
        application_fee_amount: proof.amount,
        application_fee_currency: proof.currency || BANK_TRANSFER_CURRENCY,
        application_fee_reference: proof.transfer_reference || proof.notes || null,
        application_fee_payment_method: 'bank_transfer',
        status_changed_at: now,
        payment_review: null,
      })
      .eq('id', application.id)
    if (error) throw error
    if (String(fromStatus || '').toUpperCase() === 'APFP') {
      await supabase.from('status_change_audit_log').insert({
        entity_type: 'application',
        entity_id: application.id,
        from_status_code: fromStatus,
        to_status_code: nextStatus,
        trigger_code: 'TRSB',
        triggered_by: staffUserId || null,
        notes: 'Application fee confirmed from bank transfer.',
      })
    }
  }

  const { error: proofError } = await supabase
    .from('application_bank_transfers')
    .update({
      status: 'confirmed',
      confirmed_at: now,
      confirmed_by: staffUserId || null,
    })
    .eq('id', proof.id)
  if (proofError) throw proofError

  await sendPaymentReceiptEmail(supabase, {
    application,
    kind: proof.fee_kind === 'registration' ? 'registration' : 'application',
    amount: proof.amount,
    currency: proof.currency || BANK_TRANSFER_CURRENCY,
    method: 'bank_transfer',
    paidAt: now,
    reference: proof.transfer_reference || proof.notes || '',
    receiptNo: application.application_number
      ? `${proof.fee_kind === 'registration' ? 'RF' : 'AF'}-${application.application_number}`
      : '',
  }).catch((err) => console.warn('Payment receipt email failed:', err?.message || err))
}

/** Staff upload a receipt image and approve that payment in one step. */
export async function approveStaffReceipt(supabase, { application, staffUserId, feeKind, amount, file }) {
  const id = Number(application?.id)
  if (!Number.isFinite(id)) throw new Error('Application is missing.')
  if (!file) throw new Error('Receipt image is required.')
  const value = Number(amount)
  if (!Number.isFinite(value) || value <= 0) throw new Error('Amount is required.')

  const kind = feeKind === 'registration' ? 'registration' : 'application'
  const safeName = `${Date.now()}-${String(file.name || 'receipt').replace(/[^a-zA-Z0-9.-]/g, '_')}`
  const storagePath = `${id}/bank-transfer/${kind}/${safeName}`
  const { error: uploadError } = await supabase.storage
    .from(SUPABASE_STORAGE_BUCKET)
    .upload(storagePath, file, { upsert: false, contentType: file.type || 'image/jpeg' })
  if (uploadError) throw uploadError

  const note = 'Receipt uploaded by staff'
  const { data: inserted, error } = await supabase
    .from('application_bank_transfers')
    .insert({
      application_id: id,
      fee_kind: kind,
      amount: value,
      currency: BANK_TRANSFER_CURRENCY,
      notes: note,
      transfer_reference: note,
      file_path: storagePath,
      file_name: file.name || safeName,
      content_type: file.type || null,
      status: 'submitted',
    })
    .select('id, application_id, fee_kind, amount, currency, notes, transfer_reference, file_path, file_name, content_type, status')
    .single()
  if (error) throw error

  await confirmBankTransfer(supabase, { proof: inserted, application, staffUserId })
  return inserted
}
