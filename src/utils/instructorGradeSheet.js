import * as XLSX from 'xlsx'
import {
  GRADE_COMPONENT_DB_COLUMNS,
  numericGradeToGpaPoints,
} from './getCollegeSettings'

export const LEGACY_GRADE_COLUMNS = [
  { field: 'assignments', weight: 15, maximum: 100, minimum: 0, assessmentGroup: 'activities' },
  { field: 'quizzes', weight: 10, maximum: 100, minimum: 0, assessmentGroup: 'activities' },
  { field: 'class_participation', weight: 15, maximum: 100, minimum: 0, assessmentGroup: 'activities' },
  { field: 'midterm', weight: 30, maximum: 100, minimum: 0, assessmentGroup: 'midterm' },
  { field: 'final', weight: 30, maximum: 100, minimum: 0, assessmentGroup: 'final' },
]

export function getConfigFieldName(config) {
  return config.dbColumn || `grade_${(config.grade_type_code || '').toLowerCase().replace(/\s+/g, '_')}`
}

export function getScoreForConfig(gradeRow, config) {
  const field = getConfigFieldName(config)
  const val = gradeRow?.[field] ?? gradeRow?.[config.dbColumn]
  if (val == null || val === '') return null
  return Number(val)
}

export function calculateNumericGradeFromConfig(gradeData, gradeConfiguration) {
  if (!gradeConfiguration?.length) {
    const components = GRADE_COMPONENT_DB_COLUMNS.map((col) => Number(gradeData?.[col]) || 0)
    const nonZero = components.filter((c) => c > 0)
    if (nonZero.length === 0) return null
    const sum = components.reduce((a, b) => a + b, 0)
    return Math.min(100, Math.max(0, sum))
  }

  let totalWeightedScore = 0
  let totalWeight = 0

  gradeConfiguration.forEach((config) => {
    const fieldName = getConfigFieldName(config)
    const score = Number(gradeData?.[fieldName] ?? gradeData?.[config.dbColumn]) || 0
    const weight = config.weight || 0
    if (score > 0 && weight > 0) {
      const maxScore = config.maximum || 100
      const normalizedScore = (score / maxScore) * 100
      totalWeightedScore += normalizedScore * (weight / 100)
      totalWeight += weight / 100
    }
  })

  if (totalWeight === 0) return null
  return Math.min(100, Math.max(0, (totalWeightedScore / totalWeight) * 100))
}

export function getTotalPercent(gradeRow, gradeConfig) {
  if (!gradeRow) return null
  const num = gradeRow.numeric_grade
  if (num != null && num !== '') return parseFloat(num)
  if (!gradeConfig?.length) {
    return calculateNumericGradeFromConfig(gradeRow, [])
  }
  let totalWeighted = 0
  let totalWeight = 0
  gradeConfig.forEach((c) => {
    const score = getScoreForConfig(gradeRow, c)
    const max = c.maximum ?? 100
    const weight = c.weight ?? 0
    if (score != null && max > 0 && weight > 0) {
      totalWeighted += (score / max) * weight
      totalWeight += weight
    }
  })
  if (totalWeight === 0) return null
  return Math.min(100, (totalWeighted / totalWeight) * 100)
}

export function getLetterFromPercent(percent, gradingScale) {
  if (percent == null) return null
  const scale = Array.isArray(gradingScale) && gradingScale.length > 0 ? gradingScale : []
  const entry = scale.find((g) => {
    const min = g.minPercent ?? g.min_percent ?? 0
    const max = g.maxPercent ?? g.max_percent ?? 100
    return percent >= min && percent <= max
  })
  return entry ? (entry.letter ?? null) : null
}

export function validateGradeValue(value, config, t) {
  if (value === null || value === undefined || value === '') return null
  const parsedValue = parseFloat(value)
  if (isNaN(parsedValue)) return null
  const name = config.grade_type_name_en || config.grade_type_code || config.field || ''
  if (config.minimum != null && parsedValue < config.minimum) {
    return t('grading.classGrades.valueTooLow', { defaultValue: 'Value too low' }) + `: ${name} (${config.minimum})`
  }
  if (config.maximum != null && parsedValue > config.maximum) {
    return t('grading.classGrades.valueTooHigh', { defaultValue: 'Value too high' }) + `: ${name} (${config.maximum})`
  }
  return null
}

export function finalizeGradeRow(row, gradeConfig, gradingScale) {
  const numeric = calculateNumericGradeFromConfig(row, gradeConfig)
  if (numeric == null) return row
  return {
    ...row,
    numeric_grade: Math.round(numeric * 100) / 100,
    letter_grade: getLetterFromPercent(numeric, gradingScale),
    gpa_points: numericGradeToGpaPoints(numeric, gradingScale),
  }
}

export function applyGradeFieldChange(current, { field, value, gradeConfig, gradingScale }) {
  const parsedValue = value === '' || value == null ? null : parseFloat(value)
  const updated = { ...current, [field]: parsedValue }

  const componentFields = gradeConfig?.length
    ? gradeConfig.map((c) => getConfigFieldName(c))
    : GRADE_COMPONENT_DB_COLUMNS

  if (componentFields.includes(field) || field === 'numeric_grade') {
    const numericGrade = calculateNumericGradeFromConfig(updated, gradeConfig)
    if (numericGrade != null) {
      updated.numeric_grade = Math.round(numericGrade * 100) / 100
      updated.letter_grade = getLetterFromPercent(updated.numeric_grade, gradingScale)
      updated.gpa_points = numericGradeToGpaPoints(updated.numeric_grade, gradingScale)
    }
  }

  return updated
}

export function buildGradeUpsertPayload(gradeRow, enrollment, classData, instructorId) {
  const allowedKeys = new Set([
    'enrollment_id', 'class_id', 'student_id', 'semester_id', 'college_id',
    ...GRADE_COMPONENT_DB_COLUMNS,
    'numeric_grade', 'letter_grade', 'gpa_points', 'status', 'notes', 'record_status',
    'graded_by', 'graded_at', 'updated_at',
  ])

  const { enrollment_id, ...rest } = gradeRow
  const gradeData = {}
  Object.keys(rest).forEach((key) => {
    const dbKey = key.startsWith('grade_') && GRADE_COMPONENT_DB_COLUMNS.includes(key.slice(7))
      ? key.slice(7)
      : key
    if (allowedKeys.has(dbKey) && rest[key] !== undefined) gradeData[dbKey] = rest[key]
  })

  gradeData.enrollment_id = enrollment_id ?? enrollment.id
  gradeData.updated_at = new Date().toISOString()
  gradeData.class_id = gradeData.class_id ?? classData?.id
  gradeData.student_id = gradeData.student_id ?? enrollment.student_id
  gradeData.semester_id = gradeData.semester_id ?? classData?.semester_id
  gradeData.college_id = gradeData.college_id ?? classData?.college_id ?? null
  if (instructorId) gradeData.graded_by = gradeData.graded_by ?? instructorId

  return gradeData
}

function normalizeHeader(h) {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w_]/g, '')
}

function buildHeaderToFieldMap(gradeConfig) {
  const map = new Map()
  map.set('student_id', 'student_id')
  map.set('studentid', 'student_id')
  map.set('id', 'student_id')

  if (gradeConfig?.length) {
    gradeConfig.forEach((c) => {
      const field = getConfigFieldName(c)
      const names = [
        c.grade_type_code,
        c.grade_type_name_en,
        c.grade_type_name_ar,
        field,
      ].filter(Boolean)
      names.forEach((n) => map.set(normalizeHeader(n), field))
    })
  } else {
    LEGACY_GRADE_COLUMNS.forEach((c) => {
      map.set(normalizeHeader(c.field), c.field)
    })
  }
  return map
}

export function downloadGradeSheetTemplate(enrollments, gradeConfig, filename = 'grade-sheet-template.xlsx') {
  const componentHeaders = gradeConfig?.length
    ? gradeConfig.map((c) => c.grade_type_name_en || c.grade_type_code || getConfigFieldName(c))
    : LEGACY_GRADE_COLUMNS.map((c) => c.field)

  const headers = ['student_id', ...componentHeaders]
  const rows = (enrollments || []).map((e) => {
    const sid = e.students?.student_id ?? ''
    return [sid, ...componentHeaders.map(() => '')]
  })

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Grades')
  XLSX.writeFile(wb, filename)
}

export function parseGradeUploadWorkbook(arrayBuffer, { enrollments, gradeConfig }) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const json = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  const headerMap = buildHeaderToFieldMap(gradeConfig)
  const byStudentId = new Map()
  ;(enrollments || []).forEach((e) => {
    const sid = e.students?.student_id
    if (sid) byStudentId.set(String(sid).trim().toLowerCase(), e)
  })

  const updates = {}
  const errors = []
  let matched = 0

  json.forEach((row, idx) => {
    const rowNum = idx + 2
    const normalizedRow = {}
    Object.keys(row).forEach((key) => {
      const mapped = headerMap.get(normalizeHeader(key))
      if (mapped) normalizedRow[mapped] = row[key]
    })

    const studentIdRaw = normalizedRow.student_id ?? row.student_id ?? row.Student_ID ?? row['Student ID']
    const studentKey = String(studentIdRaw || '').trim().toLowerCase()
    if (!studentKey) {
      errors.push(`Row ${rowNum}: missing student_id`)
      return
    }

    const enrollment = byStudentId.get(studentKey)
    if (!enrollment) {
      errors.push(`Row ${rowNum}: student_id "${studentIdRaw}" not found in class`)
      return
    }

    const patch = {}
    const fields = gradeConfig?.length
      ? gradeConfig.map((c) => getConfigFieldName(c))
      : LEGACY_GRADE_COLUMNS.map((c) => c.field)

    let hasValue = false
    fields.forEach((field) => {
      const raw = normalizedRow[field]
      if (raw === '' || raw == null) return
      const num = parseFloat(raw)
      if (isNaN(num)) {
        errors.push(`Row ${rowNum}: invalid number for ${field}`)
        return
      }
      patch[field] = num
      hasValue = true
    })

    if (hasValue) {
      updates[enrollment.id] = patch
      matched += 1
    }
  })

  return { updates, errors, matched }
}
