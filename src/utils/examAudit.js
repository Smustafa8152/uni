import { supabase } from '../lib/supabase'

export async function writeExamAuditLog({ examId, submissionId, actorUserId, action, details = {} }) {
  if (!examId || !action) return
  await supabase.from('exam_audit_log').insert({
    subject_exam_id: examId,
    exam_submission_id: submissionId ?? null,
    actor_user_id: actorUserId ?? null,
    action,
    details,
  })
}
