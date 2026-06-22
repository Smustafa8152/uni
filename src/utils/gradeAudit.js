import { supabase } from '../lib/supabase'
import { GRADE_COMPONENT_DB_COLUMNS } from './getCollegeSettings'

const AUDIT_FIELDS = [
  ...GRADE_COMPONENT_DB_COLUMNS,
  'numeric_grade',
  'letter_grade',
  'gpa_points',
  'record_status',
  'status',
  'notes',
]

/**
 * Write audit log entries for changed fields between old and new grade rows.
 */
export async function writeGradeAuditLog({
  oldRow,
  newRow,
  enrollmentId,
  classId,
  gradeComponentId,
  userId,
  changeSource = 'manual',
}) {
  if (!enrollmentId || !classId) return

  const entries = []
  AUDIT_FIELDS.forEach((field) => {
    const oldVal = oldRow?.[field]
    const newVal = newRow?.[field]
    const oldStr = oldVal == null ? '' : String(oldVal)
    const newStr = newVal == null ? '' : String(newVal)
    if (oldStr !== newStr) {
      entries.push({
        grade_component_id: gradeComponentId ?? oldRow?.id ?? newRow?.id ?? null,
        enrollment_id: enrollmentId,
        class_id: classId,
        field_name: field,
        old_value: oldStr || null,
        new_value: newStr || null,
        changed_by: userId ?? null,
        change_source: changeSource,
      })
    }
  })

  if (entries.length === 0) return

  const { error } = await supabase.from('grade_component_audit_log').insert(entries)
  if (error) console.error('grade audit log insert failed:', error)
}

export async function fetchGradeAuditLog(enrollmentId, limit = 50) {
  const { data, error } = await supabase
    .from('grade_component_audit_log')
    .select(`
      id,
      field_name,
      old_value,
      new_value,
      changed_at,
      change_source,
      users:changed_by(id, name_en, name_ar, email)
    `)
    .eq('enrollment_id', enrollmentId)
    .order('changed_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

export async function fetchClassAssessmentApprovals(classId) {
  const { data, error } = await supabase
    .from('class_grade_assessment_approvals')
    .select('*')
    .eq('class_id', classId)

  if (error) throw error
  const map = {}
  ;(data || []).forEach((row) => {
    map[row.assessment_group] = row
  })
  return map
}

export async function approveAssessmentGroup({
  classId,
  assessmentGroup,
  instructorId,
  entryStartedAt,
  entryEndedAt,
  notes,
}) {
  const now = new Date().toISOString()
  const payload = {
    class_id: classId,
    assessment_group: assessmentGroup,
    status: 'approved',
    approved_by: instructorId,
    approved_at: now,
    entry_started_at: entryStartedAt ?? null,
    entry_ended_at: entryEndedAt ?? null,
    notes: notes ?? null,
    updated_at: now,
  }

  const { data, error } = await supabase
    .from('class_grade_assessment_approvals')
    .upsert(payload, { onConflict: 'class_id,assessment_group' })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function notifyGradeApproval({ classId, assessmentGroup, collegeId }) {
  const { data, error } = await supabase.functions.invoke('notify-grade-approval', {
    body: { classId, assessmentGroup, collegeId },
  })
  if (error) throw error
  return data
}
