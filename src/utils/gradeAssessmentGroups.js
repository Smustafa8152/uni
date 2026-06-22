/** Assessment groups for gradebook: activities, midterm, final */

export const ASSESSMENT_GROUPS = ['activities', 'midterm', 'final']

export const ACTIVITY_DB_COLUMNS = [
  'assignments',
  'quizzes',
  'class_participation',
  'project',
  'lab',
  'other',
]

export const GROUP_DB_COLUMNS = {
  activities: ACTIVITY_DB_COLUMNS,
  midterm: ['midterm'],
  final: ['final'],
}

/** Map a grade_components db column to its assessment group */
export function dbColumnToAssessmentGroup(dbColumn) {
  if (!dbColumn) return 'activities'
  const col = String(dbColumn).toLowerCase()
  if (col === 'midterm') return 'midterm'
  if (col === 'final') return 'final'
  return 'activities'
}

/** Attach assessmentGroup to each config row */
export function enrichConfigWithAssessmentGroup(gradeConfig) {
  if (!Array.isArray(gradeConfig)) return []
  return gradeConfig.map((c) => ({
    ...c,
    assessmentGroup:
      c.assessment_group ||
      c.assessmentGroup ||
      dbColumnToAssessmentGroup(c.dbColumn || c.field),
  }))
}

/** Group config columns by assessment group for table headers */
export function groupConfigByAssessment(gradeConfig) {
  const enriched = enrichConfigWithAssessmentGroup(gradeConfig)
  const groups = {
    activities: [],
    midterm: [],
    final: [],
  }
  enriched.forEach((c) => {
    const g = c.assessmentGroup || 'activities'
    if (groups[g]) groups[g].push(c)
    else groups.activities.push(c)
  })
  return groups
}

/** Sum weights for a group */
export function groupWeightSum(configs) {
  return (configs || []).reduce((s, c) => s + (Number(c.weight) || 0), 0)
}

/** Total weight across all config */
export function totalConfigWeight(gradeConfig) {
  return (gradeConfig || []).reduce((s, c) => s + (Number(c.weight) || 0), 0)
}

/** Whether an assessment group is approved for a class */
export function isGroupApproved(approvalsMap, group) {
  return approvalsMap?.[group]?.status === 'approved'
}

/** Check if a db column field is locked for editing */
export function isFieldLockedByApproval(field, approvalsMap) {
  const group = dbColumnToAssessmentGroup(field)
  return isGroupApproved(approvalsMap, group)
}

/** Derive record_status from grade row and config */
export function deriveRecordStatus(gradeRow, gradeConfig) {
  if (gradeRow?.record_status === 'debarred' || gradeRow?.record_status === 'withdrawn') {
    return gradeRow.record_status
  }
  if (!gradeRow) return 'not_recorded'

  const fields = gradeConfig?.length
    ? gradeConfig.map((c) => c.dbColumn || c.field)
    : [...ACTIVITY_DB_COLUMNS, 'midterm', 'final']

  let filled = 0
  let total = 0
  fields.forEach((f) => {
    const col = f?.dbColumn ? f.dbColumn : f
    total += 1
    const v = gradeRow[col]
    if (v != null && v !== '') filled += 1
  })

  if (filled === 0) return 'not_recorded'
  if (filled < total) return 'incomplete'
  return 'complete'
}

export const RECORD_STATUS_OPTIONS = [
  'complete',
  'incomplete',
  'not_recorded',
  'debarred',
  'withdrawn',
]

/** Row / badge styling for final grade sheet (matches official report template) */
export function getGradeRowClassFromPercent(pct) {
  if (pct == null) return 'gs-row-alt'
  if (pct >= 90) return 'gs-row-a'
  if (pct >= 80) return 'gs-row-b'
  if (pct >= 60) return 'gs-row-c'
  return 'gs-row-d'
}

export function getGradeBadgeClassFromPercent(pct) {
  if (pct == null) return 'gs-grade-empty'
  if (pct >= 90) return 'gs-grade-a'
  if (pct >= 80) return 'gs-grade-b'
  if (pct >= 60) return 'gs-grade-c'
  return 'gs-grade-d'
}

export function getScoreClassFromPercent(pct) {
  if (pct == null) return ''
  if (pct >= 90) return 'gs-score-a'
  if (pct >= 80) return 'gs-score-b'
  if (pct >= 60) return 'gs-score-c'
  return 'gs-score-d'
}
