import { SUPABASE_STORAGE_BUCKET } from '../lib/supabase'

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
    currency: currency || 'USD',
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
      notes: `Registration fee confirmed from bank transfer: ${proof.amount} ${proof.currency || 'USD'}.`,
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
}
