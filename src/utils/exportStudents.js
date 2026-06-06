import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { getLocalizedName } from './localizedName'
import { getNationalityLabel } from './nationalities'
import { formatGenderLabel } from './formatGenderLabel'

const APPLICATION_SELECT = `
  id,
  application_number,
  email,
  created_at,
  first_name,
  middle_name,
  last_name,
  first_name_ar,
  middle_name_ar,
  last_name_ar,
  phone,
  date_of_birth,
  gender,
  nationality,
  religion,
  place_of_birth,
  street_address,
  city,
  state_province,
  postal_code,
  country,
  emergency_contact_name,
  emergency_contact_relationship,
  emergency_contact_phone,
  emergency_contact_email,
  high_school_name,
  high_school_country,
  graduation_year,
  gpa,
  certificate_type,
  toefl_score,
  ielts_score,
  sat_score,
  gmat_score,
  gre_score,
  is_transfer_student,
  previous_university,
  previous_degree,
  transfer_credits,
  personal_statement,
  scholarship_request,
  scholarship_type,
  scholarship_percentage,
  scholarship_details,
  status_code,
  enrollment_date
`

const STUDENT_SELECT = `
  *,
  majors(id, name_en, name_ar, code),
  colleges(id, name_en, name_ar, code)
`

function cell(value) {
  if (value == null) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return ''
  return String(value).trim()
}

function coalesce(...values) {
  for (const v of values) {
    if (v != null && String(v).trim() !== '') return v
  }
  return ''
}

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toISOString().slice(0, 10)
}

const STUDENT_EXPORT_PRIORITY_KEYS = ['student_name', 'email', 'country', 'nationality', 'gender']

function studentDisplayName(s, a, isArabic) {
  const en = coalesce(
    s?.name_en,
    [coalesce(s?.first_name, a?.first_name), coalesce(s?.middle_name, a?.middle_name), coalesce(s?.last_name, a?.last_name)]
      .filter(Boolean)
      .join(' '),
  )
  const ar = coalesce(
    s?.name_ar,
    [
      coalesce(s?.first_name_ar, a?.first_name_ar),
      coalesce(s?.middle_name_ar, a?.middle_name_ar),
      coalesce(s?.last_name_ar, a?.last_name_ar),
    ]
      .filter(Boolean)
      .join(' '),
  )
  return isArabic ? coalesce(ar, en) : coalesce(en, ar)
}

function orderStudentExportColumns(cols) {
  const byKey = new Map(cols.map((c) => [c.key, c]))
  const ordered = []
  for (const key of STUDENT_EXPORT_PRIORITY_KEYS) {
    const col = byKey.get(key)
    if (col) {
      ordered.push(col)
      byKey.delete(key)
    }
  }
  for (const col of cols) {
    if (byKey.has(col.key)) ordered.push(col)
  }
  return ordered
}

/** @returns {Record<string, import('@supabase/supabase-js').QueryResult>} */
export async function fetchApplicationsByEmail(emails) {
  const seen = new Set()
  const originals = []
  for (const e of emails || []) {
    const t = String(e || '').trim()
    if (!t) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    originals.push(t)
  }
  const map = {}
  if (!originals.length) return map

  const chunkSize = 80
  for (let i = 0; i < originals.length; i += chunkSize) {
    const chunk = originals.slice(i, i + chunkSize)
    const { data, error } = await supabase
      .from('applications')
      .select(APPLICATION_SELECT)
      .in('email', chunk)
      .order('created_at', { ascending: false })
    if (error) throw error
    for (const app of data || []) {
      const key = String(app.email || '').trim().toLowerCase()
      if (key && !map[key]) map[key] = app
    }
  }
  return map
}

export async function fetchStudentsForExport(studentIds) {
  if (!studentIds?.length) return []
  const { data, error } = await supabase
    .from('students')
    .select(STUDENT_SELECT)
    .in('id', studentIds)
  if (error) throw error
  return data || []
}

export function getStudentExportColumnDefs(isArabic) {
  const L = (en, ar) => (isArabic ? ar : en)

  const cols = [
    {
      key: 'student_name',
      header: L('Student name', 'اسم الطالب'),
      get: (s, a) => studentDisplayName(s, a, isArabic),
    },
    { key: 'student_id', header: L('Student ID', 'رقم الطالب'), get: (s) => s.student_id },
    { key: 'application_number', header: L('Application #', 'رقم الطلب'), get: (s, a) => a?.application_number },
    {
      key: 'name_en',
      header: L('Full name (English)', 'الاسم الكامل (إنجليزي)'),
      get: (s, a) =>
        coalesce(
          s.name_en,
          [coalesce(s.first_name, a?.first_name), coalesce(s.middle_name, a?.middle_name), coalesce(s.last_name, a?.last_name)]
            .filter(Boolean)
            .join(' '),
        ),
    },
    {
      key: 'name_ar',
      header: L('Full name (Arabic)', 'الاسم الكامل (عربي)'),
      get: (s, a) =>
        coalesce(
          s.name_ar,
          [
            coalesce(s.first_name_ar, a?.first_name_ar),
            coalesce(s.middle_name_ar, a?.middle_name_ar),
            coalesce(s.last_name_ar, a?.last_name_ar),
          ]
            .filter(Boolean)
            .join(' '),
        ),
    },
    { key: 'first_name', header: L('First name', 'الاسم الأول'), get: (s, a) => coalesce(s.first_name, a?.first_name) },
    { key: 'middle_name', header: L('Middle name', 'اسم الأب'), get: (s, a) => coalesce(s.middle_name, a?.middle_name) },
    { key: 'last_name', header: L('Last name', 'اسم العائلة'), get: (s, a) => coalesce(s.last_name, a?.last_name) },
    { key: 'first_name_ar', header: L('First name (AR)', 'الاسم الأول (عربي)'), get: (s, a) => coalesce(s.first_name_ar, a?.first_name_ar) },
    { key: 'middle_name_ar', header: L('Middle name (AR)', 'اسم الأب (عربي)'), get: (s, a) => coalesce(s.middle_name_ar, a?.middle_name_ar) },
    { key: 'last_name_ar', header: L('Last name (AR)', 'اسم العائلة (عربي)'), get: (s, a) => coalesce(s.last_name_ar, a?.last_name_ar) },
    { key: 'email', header: L('Email', 'البريد الإلكتروني'), get: (s, a) => coalesce(s.email, a?.email) },
    { key: 'phone', header: L('Phone', 'الهاتف'), get: (s, a) => coalesce(s.phone, a?.phone) },
    { key: 'mobile_phone', header: L('Mobile', 'الجوال'), get: (s, a) => coalesce(s.mobile_phone, s.phone, a?.phone) },
    {
      key: 'gender',
      header: L('Gender', 'الجنس'),
      get: (s, a) => formatGenderLabel(coalesce(s.gender, a?.gender), isArabic),
    },
    { key: 'date_of_birth', header: L('Date of birth', 'تاريخ الميلاد'), get: (s, a) => formatDate(coalesce(s.date_of_birth, a?.date_of_birth)) },
    {
      key: 'nationality',
      header: L('Nationality', 'الجنسية'),
      get: (s, a) => getNationalityLabel(coalesce(s.nationality, a?.nationality), isArabic),
    },
    { key: 'religion', header: L('Religion', 'الديانة'), get: (s, a) => coalesce(s.religion, a?.religion) },
    { key: 'marital_status', header: L('Marital status', 'الحالة الاجتماعية'), get: (s) => s.marital_status },
    { key: 'place_of_birth', header: L('Place of birth', 'مكان الميلاد'), get: (s, a) => coalesce(s.place_of_birth, a?.place_of_birth) },
    { key: 'national_id', header: L('National / civil ID', 'رقم الهوية'), get: (s) => s.national_id },
    { key: 'is_international', header: L('International student', 'طالب دولي'), get: (s) => s.is_international },
    {
      key: 'college',
      header: L('College', 'الكلية'),
      get: (s) => (s.colleges ? getLocalizedName(s.colleges, isArabic) : ''),
    },
    { key: 'major_code', header: L('Major code', 'رمز التخصص'), get: (s) => s.majors?.code },
    {
      key: 'major',
      header: L('Major', 'التخصص'),
      get: (s) => (s.majors ? getLocalizedName(s.majors, isArabic) : ''),
    },
    { key: 'status', header: L('Student status', 'حالة الطالب'), get: (s) => s.status },
    { key: 'current_status_code', header: L('Lifecycle status', 'رمز الحالة'), get: (s) => s.current_status_code },
    { key: 'enrollment_date', header: L('Enrollment date', 'تاريخ التسجيل'), get: (s, a) => formatDate(coalesce(s.enrollment_date, a?.enrollment_date)) },
    { key: 'gpa', header: L('GPA', 'المعدل'), get: (s) => s.gpa },
    { key: 'total_credits_earned', header: L('Credits earned', 'الساعات المكتسبة'), get: (s) => s.total_credits_earned },
    { key: 'study_type', header: L('Study type', 'نوع الدراسة'), get: (s) => s.study_type },
    { key: 'study_load', header: L('Study load', 'العبء الدراسي'), get: (s) => s.study_load },
    { key: 'study_approach', header: L('Study approach', 'أسلوب الدراسة'), get: (s) => s.study_approach },
    { key: 'address', header: L('Address', 'العنوان'), get: (s, a) => coalesce(s.address, a?.street_address) },
    { key: 'city', header: L('City', 'المدينة'), get: (s, a) => coalesce(s.city, a?.city) },
    { key: 'state', header: L('State / province', 'المحافظة'), get: (s, a) => coalesce(s.state, a?.state_province) },
    { key: 'country', header: L('Country', 'الدولة'), get: (s, a) => coalesce(s.country, a?.country) },
    { key: 'postal_code', header: L('Postal code', 'الرمز البريدي'), get: (s, a) => coalesce(s.postal_code, a?.postal_code) },
    {
      key: 'emergency_contact_name',
      header: L('Emergency contact', 'جهة الاتصال للطوارئ'),
      get: (s, a) => coalesce(s.emergency_contact_name, a?.emergency_contact_name),
    },
    {
      key: 'emergency_contact_relation',
      header: L('Emergency relationship', 'صلة القرابة'),
      get: (s, a) => coalesce(s.emergency_contact_relation, a?.emergency_contact_relationship),
    },
    {
      key: 'emergency_phone',
      header: L('Emergency phone', 'هاتف الطوارئ'),
      get: (s, a) => coalesce(s.emergency_phone, a?.emergency_contact_phone),
    },
    {
      key: 'emergency_contact_email',
      header: L('Emergency email', 'بريد الطوارئ'),
      get: (s, a) => coalesce(s.emergency_contact_email, a?.emergency_contact_email),
    },
    {
      key: 'high_school_name',
      header: L('High school / institution', 'المدرسة / الجهة'),
      get: (s, a) => coalesce(s.high_school_name, a?.high_school_name),
    },
    {
      key: 'high_school_country',
      header: L('Certificate country', 'دولة الشهادة'),
      get: (s, a) => coalesce(s.high_school_country, a?.high_school_country),
    },
    {
      key: 'graduation_year',
      header: L('Graduation year', 'سنة التخرج'),
      get: (s, a) => coalesce(s.graduation_year, a?.graduation_year),
    },
    {
      key: 'high_school_gpa',
      header: L('High school GPA', 'معدل الثانوية'),
      get: (s, a) => coalesce(s.high_school_gpa, a?.gpa),
    },
    {
      key: 'certificate_type',
      header: L('Certificate type', 'نوع الشهادة'),
      get: (s, a) => coalesce(s.certificate_type, a?.certificate_type),
    },
    { key: 'toefl_score', header: L('TOEFL', 'توفل'), get: (s, a) => coalesce(s.toefl_score, a?.toefl_score) },
    { key: 'ielts_score', header: L('IELTS', 'آيلتس'), get: (s, a) => coalesce(s.ielts_score, a?.ielts_score) },
    { key: 'sat_score', header: L('SAT', 'سات'), get: (s, a) => coalesce(s.sat_score, a?.sat_score) },
    { key: 'gmat_score', header: L('GMAT', 'جمات'), get: (s, a) => coalesce(s.gmat_score, a?.gmat_score) },
    { key: 'gre_score', header: L('GRE', 'جري'), get: (s, a) => coalesce(s.gre_score, a?.gre_score) },
    {
      key: 'is_transfer_student',
      header: L('Transfer student', 'طالب محول'),
      get: (s, a) => (a?.is_transfer_student != null ? a.is_transfer_student : ''),
    },
    {
      key: 'previous_university',
      header: L('Previous university', 'الجامعة السابقة'),
      get: (s, a) => coalesce(s.previous_university, a?.previous_university),
    },
    {
      key: 'previous_degree',
      header: L('Previous degree', 'الشهادة السابقة'),
      get: (s, a) => coalesce(s.previous_degree, a?.previous_degree),
    },
    {
      key: 'transfer_credits',
      header: L('Transfer credits', 'ساعات محولة'),
      get: (s, a) => coalesce(s.transfer_credits, a?.transfer_credits),
    },
    {
      key: 'scholarship_request',
      header: L('Scholarship requested', 'طلب منحة'),
      get: (s, a) => coalesce(s.has_scholarship, a?.scholarship_request),
    },
    { key: 'scholarship_type', header: L('Scholarship type', 'نوع المنحة'), get: (s, a) => coalesce(s.scholarship_type, a?.scholarship_type) },
    {
      key: 'scholarship_percentage',
      header: L('Scholarship %', 'نسبة المنحة'),
      get: (s, a) => coalesce(s.scholarship_percentage, a?.scholarship_percentage),
    },
    {
      key: 'scholarship_details',
      header: L('Scholarship details', 'تفاصيل المنحة'),
      get: (s, a) => coalesce(s.scholarship_details, a?.scholarship_details),
    },
    {
      key: 'personal_statement',
      header: L('Personal statement', 'البيان الشخصي'),
      get: (s, a) => coalesce(s.personal_statement, a?.personal_statement),
    },
    { key: 'application_status', header: L('Application status', 'حالة الطلب'), get: (s, a) => a?.status_code },
    { key: 'passport_number', header: L('Passport number', 'رقم الجواز'), get: (s) => s.passport_number },
    { key: 'passport_expiry', header: L('Passport expiry', 'انتهاء الجواز'), get: (s) => formatDate(s.passport_expiry) },
    { key: 'visa_number', header: L('Visa number', 'رقم التأشيرة'), get: (s) => s.visa_number },
    { key: 'blood_type', header: L('Blood type', 'فصيلة الدم'), get: (s) => s.blood_type },
    { key: 'medical_conditions', header: L('Medical conditions', 'حالات طبية'), get: (s) => s.medical_conditions },
    { key: 'allergies', header: L('Allergies', 'الحساسية'), get: (s) => s.allergies },
    { key: 'notes', header: L('Notes', 'ملاحظات'), get: (s) => s.notes },
  ]

  return orderStudentExportColumns(cols)
}

export function buildStudentExportRows(students, applicationsByEmail, isArabic) {
  const cols = getStudentExportColumnDefs(isArabic)
  const headers = cols.map((c) => c.header)
  const rows = (students || []).map((student) => {
    const emailKey = String(student.email || '').trim().toLowerCase()
    const app = applicationsByEmail[emailKey] || null
    return cols.map((col) => cell(col.get(student, app)))
  })
  return { headers, rows, cols }
}

export function downloadStudentsExcel({ headers, rows, filename = 'students-export.xlsx' }) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Students')
  XLSX.writeFile(wb, filename)
}

function excelSheetName(code, usedNames) {
  let base = String(code || 'Subject')
    .replace(/[\\/?*[\]:]/g, '_')
    .trim()
    .slice(0, 31) || 'Subject'
  let name = base
  let i = 2
  while (usedNames.has(name.toLowerCase())) {
    const suffix = `_${i}`
    name = `${base.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`
    i += 1
  }
  usedNames.add(name.toLowerCase())
  return name
}

export function downloadStudentsCsv({ headers, rows, filename = 'students-export.csv' }) {
  const escape = (v) => {
    const s = String(v ?? '')
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const lines = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))]
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportStudentsList({ studentIds, isArabic, format = 'xlsx' }) {
  const students = await fetchStudentsForExport(studentIds)
  const emails = students.map((s) => s.email).filter(Boolean)
  const applicationsByEmail = await fetchApplicationsByEmail(emails)
  const { headers, rows } = buildStudentExportRows(students, applicationsByEmail, isArabic)
  const stamp = new Date().toISOString().slice(0, 10)
  const base = `students-export-${stamp}`
  if (format === 'csv') {
    downloadStudentsCsv({ headers, rows, filename: `${base}.csv` })
  } else {
    downloadStudentsExcel({ headers, rows, filename: `${base}.xlsx` })
  }
  return students.length
}

/** Distinct student IDs with active enrollments in any class for the subject. */
export async function fetchStudentIdsForSubject(subjectId, { status = 'enrolled', semesterId = 'all' } = {}) {
  if (!subjectId) return []

  const { data: classes, error: classErr } = await supabase
    .from('classes')
    .select('id')
    .eq('subject_id', subjectId)
  if (classErr) throw classErr

  const classIds = (classes || []).map((c) => c.id).filter(Boolean)
  if (!classIds.length) return []

  let query = supabase.from('enrollments').select('student_id').in('class_id', classIds)
  if (status && status !== 'all') query = query.eq('status', status)
  if (semesterId && semesterId !== 'all') query = query.eq('semester_id', semesterId)

  const { data, error } = await query
  if (error) throw error

  return [...new Set((data || []).map((e) => e.student_id).filter(Boolean))]
}

/** Distinct student IDs enrolled in a class section. */
export async function fetchStudentIdsForClass(classId, { status = 'enrolled' } = {}) {
  if (!classId) return []

  let query = supabase.from('enrollments').select('student_id').eq('class_id', classId)
  if (status && status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw error

  return [...new Set((data || []).map((e) => e.student_id).filter(Boolean))]
}

export async function exportClassStudentsList({
  classId,
  classCode,
  section,
  isArabic,
  format = 'xlsx',
  status = 'enrolled',
}) {
  const studentIds = await fetchStudentIdsForClass(classId, { status })
  if (!studentIds.length) return 0

  const students = await fetchStudentsForExport(studentIds)
  const emails = students.map((s) => s.email).filter(Boolean)
  const applicationsByEmail = await fetchApplicationsByEmail(emails)
  const { headers, rows } = buildStudentExportRows(students, applicationsByEmail, isArabic)
  const stamp = new Date().toISOString().slice(0, 10)
  const safeCode = String(classCode || classId || 'class').replace(/[^\w-]+/g, '_')
  const safeSection = String(section || 'section').replace(/[^\w-]+/g, '_')
  const base = `class-${safeCode}-${safeSection}-students-${stamp}`
  if (format === 'csv') {
    downloadStudentsCsv({ headers, rows, filename: `${base}.csv` })
  } else {
    downloadStudentsExcel({ headers, rows, filename: `${base}.xlsx` })
  }
  return students.length
}

export async function exportSubjectStudentsList({
  subjectId,
  subjectCode,
  isArabic,
  format = 'xlsx',
  status = 'enrolled',
  semesterId = 'all',
}) {
  const studentIds = await fetchStudentIdsForSubject(subjectId, { status, semesterId })
  if (!studentIds.length) return 0

  const students = await fetchStudentsForExport(studentIds)
  const emails = students.map((s) => s.email).filter(Boolean)
  const applicationsByEmail = await fetchApplicationsByEmail(emails)
  const { headers, rows } = buildStudentExportRows(students, applicationsByEmail, isArabic)
  const stamp = new Date().toISOString().slice(0, 10)
  const safeCode = String(subjectCode || subjectId || 'subject').replace(/[^\w-]+/g, '_')
  const base = `subject-${safeCode}-students-${stamp}`
  if (format === 'csv') {
    downloadStudentsCsv({ headers, rows, filename: `${base}.csv` })
  } else {
    downloadStudentsExcel({ headers, rows, filename: `${base}.xlsx` })
  }
  return students.length
}

/** One workbook: one sheet per subject with the same student columns as the Students export. */
export async function exportAllSubjectsStudentsWorkbook({
  subjects,
  isArabic,
  status = 'enrolled',
  semesterId = 'all',
  filename,
}) {
  const subjectList = (subjects || []).filter((s) => s?.id)
  if (!subjectList.length) {
    return { subjectCount: 0, studentCount: 0, sheetCount: 0 }
  }

  const subjectStudentIds = await Promise.all(
    subjectList.map(async (subject) => ({
      subject,
      studentIds: await fetchStudentIdsForSubject(subject.id, { status, semesterId }),
    })),
  )

  const allStudentIds = [...new Set(subjectStudentIds.flatMap((s) => s.studentIds))]
  const studentsById = {}
  if (allStudentIds.length) {
    const students = await fetchStudentsForExport(allStudentIds)
    for (const s of students) studentsById[s.id] = s
  }

  const allEmails = [...new Set(Object.values(studentsById).map((s) => s.email).filter(Boolean))]
  const applicationsByEmail = await fetchApplicationsByEmail(allEmails)

  const { headers } = buildStudentExportRows([], applicationsByEmail, isArabic)
  const usedSheetNames = new Set()
  const wb = XLSX.utils.book_new()
  let totalStudents = 0

  for (const { subject, studentIds } of subjectStudentIds) {
    const students = studentIds.map((id) => studentsById[id]).filter(Boolean)
    const { rows } = buildStudentExportRows(students, applicationsByEmail, isArabic)
    const sheetName = excelSheetName(subject.code, usedSheetNames)
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    totalStudents += students.length
  }

  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, filename || `subjects-students-${stamp}.xlsx`)

  return {
    subjectCount: subjectList.length,
    studentCount: totalStudents,
    sheetCount: subjectList.length,
  }
}
