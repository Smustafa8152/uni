import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'
import { GRADE_COMPONENT_DB_COLUMNS } from './getCollegeSettings'
import { examTypeToGradeColumn } from './syncExamGradesToGradebook'

function stamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * Fetch all enrollments (+ grades) optionally filtered by semester.
 */
async function fetchOverallGradeRows({ semesterId = null } = {}) {
  let classQuery = supabase
    .from('classes')
    .select(
      `
      id, section, code, semester_id, college_id, instructor_id, status,
      subjects(id, code, name_en, name_ar),
      semesters(id, name_en, name_ar, academic_year),
      colleges(id, name_en, name_ar),
      instructors(id, name_en, name_ar)
    `,
    )
    .eq('status', 'active')

  if (semesterId) classQuery = classQuery.eq('semester_id', semesterId)

  const { data: classes, error: cErr } = await classQuery
  if (cErr) throw cErr
  if (!classes?.length) return []

  const classIds = classes.map((c) => c.id)
  const classById = Object.fromEntries(classes.map((c) => [c.id, c]))

  const enrollments = []
  for (const ids of chunk(classIds, 80)) {
    const { data, error } = await supabase
      .from('enrollments')
      .select(
        `
        id, class_id, student_id, status,
        students(id, student_id, name_en, name_ar, email)
      `,
      )
      .in('class_id', ids)
      .eq('status', 'enrolled')
    if (error) throw error
    enrollments.push(...(data || []))
  }

  if (!enrollments.length) return []

  const enrollmentIds = enrollments.map((e) => e.id)
  const gradesByEnrollment = {}
  for (const ids of chunk(enrollmentIds, 80)) {
    const { data, error } = await supabase.from('grade_components').select('*').in('enrollment_id', ids)
    if (error) throw error
    ;(data || []).forEach((g) => {
      gradesByEnrollment[g.enrollment_id] = g
    })
  }

  return enrollments.map((e) => {
    const cls = classById[e.class_id] || {}
    const g = gradesByEnrollment[e.id] || {}
    const st = e.students || {}
    const row = {
      College: cls.colleges?.name_en || cls.colleges?.name_ar || '',
      Semester: cls.semesters?.name_en || cls.semesters?.name_ar || '',
      'Academic year': cls.semesters?.academic_year || '',
      'Subject code': cls.subjects?.code || '',
      'Subject name': cls.subjects?.name_en || cls.subjects?.name_ar || '',
      Section: cls.section || cls.code || '',
      Instructor: cls.instructors?.name_en || cls.instructors?.name_ar || '',
      'Student ID': st.student_id || '',
      'Student name': st.name_en || st.name_ar || '',
      Email: st.email || '',
      'Enrollment status': e.status || '',
    }
    GRADE_COMPONENT_DB_COLUMNS.forEach((col) => {
      row[col] = g[col] != null ? Number(g[col]) : ''
    })
    row.numeric_grade = g.numeric_grade != null ? Number(g.numeric_grade) : ''
    row.letter_grade = g.letter_grade || ''
    row.gpa_points = g.gpa_points != null ? Number(g.gpa_points) : ''
    row.grade_status = g.status || ''
    row.record_status = g.record_status || ''
    return row
  })
}

/**
 * Fetch all online exam submissions (subject_exams), optionally by semester via class.
 */
async function fetchOnlineExamRows({ semesterId = null } = {}) {
  let examQuery = supabase
    .from('subject_exams')
    .select(
      `
      id, title, exam_type, status, total_points, weight_percentage, class_id,
      scheduled_date, created_at,
      classes(
        id, section, semester_id,
        subjects(code, name_en, name_ar),
        semesters(name_en, name_ar, academic_year),
        instructors(name_en, name_ar)
      )
    `,
    )
    .order('created_at', { ascending: false })

  const { data: exams, error: eErr } = await examQuery
  if (eErr) throw eErr

  let filtered = exams || []
  if (semesterId) {
    filtered = filtered.filter((ex) => Number(ex.classes?.semester_id) === Number(semesterId))
  }
  if (!filtered.length) return { examCatalog: [], attemptRows: [] }

  const examById = Object.fromEntries(filtered.map((e) => [e.id, e]))
  const examIds = filtered.map((e) => e.id)

  const submissions = []
  for (const ids of chunk(examIds, 80)) {
    const { data, error } = await supabase
      .from('exam_submissions')
      .select(
        'id, exam_id, student_id, status, points_earned, grade, started_at, submitted_at, students(student_id, name_en, name_ar, email)',
      )
      .in('exam_id', ids)
    if (error) throw error
    submissions.push(...(data || []))
  }

  const examCatalog = filtered.map((ex) => ({
    'Exam ID': ex.id,
    'Subject code': ex.classes?.subjects?.code || '',
    'Subject name': ex.classes?.subjects?.name_en || '',
    Section: ex.classes?.section || '',
    Semester: ex.classes?.semesters?.name_en || '',
    Instructor: ex.classes?.instructors?.name_en || '',
    'Exam title': ex.title || '',
    'Exam type': ex.exam_type || '',
    'Gradebook column': examTypeToGradeColumn(ex.exam_type),
    Status: ex.status || '',
    'Total points': ex.total_points ?? '',
    Weight: ex.weight_percentage ?? '',
    'Scheduled date': ex.scheduled_date || '',
  }))

  const attemptRows = submissions.map((s) => {
    const ex = examById[s.exam_id] || {}
    const st = s.students || {}
    return {
      'Exam ID': s.exam_id,
      'Exam title': ex.title || '',
      'Exam type': ex.exam_type || '',
      'Subject code': ex.classes?.subjects?.code || '',
      'Subject name': ex.classes?.subjects?.name_en || '',
      Section: ex.classes?.section || '',
      Semester: ex.classes?.semesters?.name_en || '',
      Instructor: ex.classes?.instructors?.name_en || '',
      'Student ID': st.student_id || '',
      'Student name': st.name_en || st.name_ar || '',
      Email: st.email || '',
      'Attempt status': s.status || '',
      'Points earned': s.points_earned != null ? Number(s.points_earned) : '',
      'Total points': ex.total_points ?? '',
      'Grade %': s.grade != null ? Number(s.grade) : '',
      Started: s.started_at ? new Date(s.started_at).toISOString() : '',
      Submitted: s.submitted_at ? new Date(s.submitted_at).toISOString() : '',
    }
  })

  return { examCatalog, attemptRows }
}

function sheetFromRows(rows, sheetName) {
  if (!rows?.length) {
    return XLSX.utils.aoa_to_sheet([['No data']])
  }
  return XLSX.utils.json_to_sheet(rows)
}

/**
 * Build and download Excel: overall gradebook + all online exams.
 * @returns {{ overallCount: number, examCount: number, attemptCount: number }}
 */
export async function exportAdminOverallGradesExcel({ semesterId = null, filename } = {}) {
  const [overallRows, examData] = await Promise.all([
    fetchOverallGradeRows({ semesterId }),
    fetchOnlineExamRows({ semesterId }),
  ])

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheetFromRows(overallRows, 'Overall grades'), 'Overall grades')
  XLSX.utils.book_append_sheet(wb, sheetFromRows(examData.examCatalog, 'Exams'), 'All exams')
  XLSX.utils.book_append_sheet(wb, sheetFromRows(examData.attemptRows, 'Exam attempts'), 'Exam attempts')

  const name = filename || `overall-grades-all-subjects-exams-${stamp()}.xlsx`
  XLSX.writeFile(wb, name)

  return {
    overallCount: overallRows.length,
    examCount: examData.examCatalog.length,
    attemptCount: examData.attemptRows.length,
    filename: name,
  }
}

/**
 * CSV-only overall grades (single sheet).
 */
export async function exportAdminOverallGradesCsv({ semesterId = null, filename } = {}) {
  const rows = await fetchOverallGradeRows({ semesterId })
  const ws = sheetFromRows(rows, 'Overall')
  const csv = XLSX.utils.sheet_to_csv(ws)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `overall-grades-${stamp()}.csv`
  a.click()
  URL.revokeObjectURL(url)
  return { overallCount: rows.length, filename: a.download }
}

/**
 * CSV for all exam attempts.
 */
export async function exportAdminExamAttemptsCsv({ semesterId = null, filename } = {}) {
  const { attemptRows, examCatalog } = await fetchOnlineExamRows({ semesterId })
  const ws = sheetFromRows(attemptRows, 'Attempts')
  const csv = XLSX.utils.sheet_to_csv(ws)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `all-exam-attempts-${stamp()}.csv`
  a.click()
  URL.revokeObjectURL(url)
  return { attemptCount: attemptRows.length, examCount: examCatalog.length, filename: a.download }
}
