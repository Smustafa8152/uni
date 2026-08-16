import ExcelJS from 'exceljs'
import { supabase } from '../lib/supabase'
import {
  getSubjectGpaFromEnrollment,
  normalizeGradeComponent,
  numericGradeToGpaPoints,
} from './getCollegeSettings'
import { getLetterFromPercent } from './instructorGradeSheet'
import {
  fetchExamScoresByClassIds,
  overlayExamScoresOnGradeComponent,
  examScoresForEnrollment,
} from './syncExamGradesToGradebook'

const BORDER = {
  top: { style: 'thin', color: { argb: 'FF94A3B8' } },
  left: { style: 'thin', color: { argb: 'FF94A3B8' } },
  bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
  right: { style: 'thin', color: { argb: 'FF94A3B8' } },
}

const SUBJECT_PALETTE = [
  { header: 'FF2E7D32', sub: 'FFC8E6C9' }, // green
  { header: 'FF1565C0', sub: 'FFBBDEFB' }, // blue
  { header: 'FFAD1457', sub: 'FFF8BBD0' }, // pink
  { header: 'FFE65100', sub: 'FFFFE0B2' }, // orange
  { header: 'FF6A1B9A', sub: 'FFE1BEE7' }, // purple
  { header: 'FF00838F', sub: 'FFB2EBF2' }, // teal
  { header: 'FFC62828', sub: 'FFFFCDD2' }, // red
  { header: 'FF455A64', sub: 'FFCFD8DC' }, // slate
]

const C = {
  navy: 'FF1A3A5C',
  gold: 'FFC9A84C',
  white: 'FFFFFFFF',
  summary: 'FFF0F4F8',
  text: 'FF111827',
  muted: 'FF64748B',
  zebra: 'FFF8FAFC',
  idCol: 'FFE8EEF5',
  nameCol: 'FFF4F7FB',
  rowA: 'FFF1F8E9',
  rowB: 'FFE8F4FD',
  rowC: 'FFFFF8E1',
  rowD: 'FFFFEBEE',
  pass: 'FF1B5E20',
  fail: 'FFB71C1C',
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function setCell(cell, value, opts = {}) {
  const {
    fillArgb = C.white,
    bold = false,
    align = 'center',
    color = C.text,
    size = 11,
    numFmt,
  } = opts
  cell.value = value ?? '—'
  cell.font = { size, bold, color: { argb: color } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } }
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: true }
  cell.border = BORDER
  if (numFmt) cell.numFmt = numFmt
}

function scoreFill(score) {
  if (score == null) return C.white
  if (score >= 90) return C.rowA
  if (score >= 80) return C.rowB
  if (score >= 60) return C.rowC
  return C.rowD
}

function normUniversityId(value) {
  return String(value || '')
    .replace(/^STU/i, '')
    .replace(/[\s\-]/g, '')
    .toLowerCase()
}

function normPersonName(person) {
  const parts = [
    person?.name_en,
    person?.name_ar,
    [person?.first_name, person?.last_name].filter(Boolean).join(' '),
    [person?.first_name_ar, person?.last_name_ar].filter(Boolean).join(' '),
  ]
    .map((v) => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean)
  return parts[0] || ''
}

function studentIdsFromExamData(examData) {
  const ids = new Set()
  const addFromKeys = (obj) => {
    Object.keys(obj || {}).forEach((key) => {
      const n = Number(String(key).split('::')[0])
      if (Number.isFinite(n)) ids.add(n)
    })
  }
  addFromKeys(examData?.byStudentClass)
  addFromKeys(examData?.byStudentSubject)
  addFromKeys(examData?.latestOverallSC)
  addFromKeys(examData?.latestOverallSubj)
  return [...ids]
}

async function fetchStudentsByIds(ids) {
  const uniq = [...new Set((ids || []).map(Number).filter((n) => Number.isFinite(n)))]
  const rows = []
  for (let i = 0; i < uniq.length; i += 80) {
    const { data, error } = await supabase
      .from('students')
      .select('id, student_id, name_en, name_ar, first_name, last_name, first_name_ar, last_name_ar')
      .in('id', uniq.slice(i, i + 80))
    if (error) throw error
    rows.push(...(data || []))
  }
  return rows
}

/** Map an exported student row onto the exam_submissions student when IDs differ (duplicate records). */
function examLookupIdForStudent(student, examStudents) {
  const pk = Number(student?.id)
  if (!examStudents?.length) return Number.isFinite(pk) ? pk : null
  if (examStudents.some((s) => Number(s.id) === pk)) return pk
  const uni = normUniversityId(student?.student_id)
  if (uni) {
    const hit = examStudents.find((s) => normUniversityId(s.student_id) === uni)
    if (hit) return Number(hit.id)
  }
  const name = normPersonName(student)
  if (name) {
    const hits = examStudents.filter((s) => normPersonName(s) === name)
    const unique = [...new Set(hits.map((s) => Number(s.id)))]
    if (unique.length === 1) return unique[0]
  }
  return Number.isFinite(pk) ? pk : null
}

function scoreColor(score) {
  if (score == null) return C.muted
  if (score >= 90) return C.pass
  if (score >= 80) return 'FF1565C0'
  if (score >= 60) return 'FFE65100'
  return C.fail
}

function cleanCode(code) {
  return String(code || '')
    .replace(/\t/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function downloadBuffer(buffer, filename) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Multi-subject matrix: Student ID | Name | [Subject: Score|Grade|GPA]...
 * Matches the coloured subject-group layout from the sample sheet.
 */
export async function exportStudentGradesMatrixExcel({
  students,
  subjects,
  gradesByStudent,
  meta = {},
  isArabic = false,
  filename,
}) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'University Management System'
  wb.created = new Date()

  const labels = isArabic
    ? {
        title: 'كشف درجات الطلاب — حسب المقرر',
        studentId: 'رقم الطالب',
        name: 'الاسم',
        score: 'الدرجة',
        grade: 'التقدير',
        gpa: 'معدل المقرر',
        overall: 'المعدل الفصلي الإجمالي',
        overallScore: 'الإجمالي',
        overallGrade: 'التقدير',
        overallGpa: 'المعدل',
        college: 'الكلية',
        year: 'العام الأكاديمي',
        program: 'البرنامج',
        students: 'عدد الطلاب',
        subjects: 'عدد المقررات',
        allYears: 'جميع الأعوام',
        allPrograms: 'جميع البرامج',
        legend: 'تلوين الدرجة: أخضر ≥90 · أزرق ≥80 · أصفر ≥60 · أحمر <60',
        sheet: 'درجات المقررات',
      }
    : {
        title: 'Student grades — subject breakdown',
        studentId: 'Student ID',
        name: 'Name',
        score: 'Score',
        grade: 'Grade',
        gpa: 'Course GPA',
        overall: 'Semester overall',
        overallScore: 'Overall',
        overallGrade: 'Grade',
        overallGpa: 'GPA',
        college: 'College',
        year: 'Academic year',
        program: 'Program',
        students: 'Students',
        subjects: 'Subjects',
        allYears: 'All years',
        allPrograms: 'All programs',
        legend: 'Score colours: green ≥90 · blue ≥80 · amber ≥60 · red <60',
        sheet: 'Subject grades',
      }

  const ws = wb.addWorksheet(labels.sheet, {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 5, rightToLeft: isArabic }],
  })

  const subjectList = subjects || []
  const overallStart = 3 + subjectList.length * 3
  const colCount = 2 + subjectList.length * 3 + 3

  // Title
  ws.mergeCells(1, 1, 1, Math.max(colCount, 2))
  setCell(ws.getCell(1, 1), labels.title, {
    fillArgb: C.navy,
    bold: true,
    color: C.white,
    size: 16,
  })
  ws.getRow(1).height = 28

  // Meta
  const metaLine = [
    meta.collegeName ? `${labels.college}: ${meta.collegeName}` : null,
    `${labels.year}: ${meta.yearName || labels.allYears}`,
    `${labels.program}: ${meta.programName || labels.allPrograms}`,
    `${labels.students}: ${(students || []).length}`,
    `${labels.subjects}: ${subjectList.length}`,
  ]
    .filter(Boolean)
    .join('  ·  ')
  ws.mergeCells(2, 1, 2, Math.max(colCount, 2))
  setCell(ws.getCell(2, 1), metaLine, {
    fillArgb: C.summary,
    color: C.muted,
    size: 10,
    align: isArabic ? 'right' : 'left',
  })
  ws.getRow(2).height = 18

  // Gold accent
  ws.mergeCells(3, 1, 3, Math.max(colCount, 2))
  setCell(ws.getCell(3, 1), '', { fillArgb: C.gold })
  ws.getRow(3).height = 5

  // Row 4: subject group headers | Row 5: sub-headers
  setCell(ws.getCell(4, 1), labels.studentId, {
    fillArgb: C.navy,
    bold: true,
    color: C.white,
    size: 11,
  })
  setCell(ws.getCell(4, 2), labels.name, {
    fillArgb: C.navy,
    bold: true,
    color: C.white,
    size: 11,
  })
  setCell(ws.getCell(5, 1), '', { fillArgb: C.idCol, bold: true })
  setCell(ws.getCell(5, 2), '', { fillArgb: C.nameCol, bold: true })
  ws.mergeCells(4, 1, 5, 1)
  ws.mergeCells(4, 2, 5, 2)

  subjectList.forEach((subj, i) => {
    const palette = SUBJECT_PALETTE[i % SUBJECT_PALETTE.length]
    const start = 3 + i * 3
    const end = start + 2
    ws.mergeCells(4, start, 4, end)
    const title = [subj.name, cleanCode(subj.code) ? `(${cleanCode(subj.code)})` : null]
      .filter(Boolean)
      .join(' ')
    setCell(ws.getCell(4, start), title, {
      fillArgb: palette.header,
      bold: true,
      color: C.white,
      size: 11,
    })
    // paint merged area borders
    for (let c = start; c <= end; c++) {
      ws.getCell(4, c).border = BORDER
      ws.getCell(4, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: palette.header } }
    }
    ;[labels.score, labels.grade, labels.gpa].forEach((lab, j) => {
      setCell(ws.getCell(5, start + j), lab, {
        fillArgb: palette.sub,
        bold: true,
        color: C.text,
        size: 10,
      })
    })
  })

  const overallPalette = { header: C.navy, sub: 'FFD6E4F0' }
  ws.mergeCells(4, overallStart, 4, overallStart + 2)
  setCell(ws.getCell(4, overallStart), labels.overall, {
    fillArgb: overallPalette.header,
    bold: true,
    color: C.white,
    size: 11,
  })
  for (let c = overallStart; c <= overallStart + 2; c++) {
    ws.getCell(4, c).border = BORDER
    ws.getCell(4, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: overallPalette.header } }
  }
  ;[labels.overallScore, labels.overallGrade, labels.overallGpa].forEach((lab, j) => {
    setCell(ws.getCell(5, overallStart + j), lab, {
      fillArgb: overallPalette.sub,
      bold: true,
      color: C.text,
      size: 10,
    })
  })
  ws.getRow(4).height = 26
  ws.getRow(5).height = 20

  // Data rows
  ;(students || []).forEach((stu, rowIdx) => {
    const r = 6 + rowIdx
    const zebra = rowIdx % 2 === 1 ? C.zebra : C.white
    setCell(ws.getCell(r, 1), stu.studentId ?? '—', {
      fillArgb: C.idCol,
      bold: true,
      size: 10,
    })
    setCell(ws.getCell(r, 2), stu.name ?? '—', {
      fillArgb: C.nameCol,
      align: isArabic ? 'right' : 'left',
      size: 10,
    })

    const bySubject =
      gradesByStudent?.[stu.id] || gradesByStudent?.[Number(stu.id)] || gradesByStudent?.[String(stu.id)] || {}
    subjectList.forEach((subj, i) => {
      const start = 3 + i * 3
      const g = bySubject[subj.id] || {}
      const score = g.score != null ? Number(g.score) : null
      const fill = score != null ? scoreFill(score) : zebra
      setCell(ws.getCell(r, start), score != null ? score : '—', {
        fillArgb: fill,
        bold: true,
        color: scoreColor(score),
        size: 11,
      })
      setCell(ws.getCell(r, start + 1), g.letter || '—', {
        fillArgb: fill,
        bold: true,
        size: 11,
      })
      setCell(ws.getCell(r, start + 2), g.gpa != null ? Number(g.gpa) : '—', {
        fillArgb: fill,
        size: 11,
        numFmt: g.gpa != null ? '0.00' : undefined,
      })
    })

    const overall =
      gradesByStudent?.[stu.id]?.__overall ||
      gradesByStudent?.[Number(stu.id)]?.__overall ||
      gradesByStudent?.[String(stu.id)]?.__overall ||
      {}
    const oScore = overall.score != null ? Number(overall.score) : null
    const oFill = oScore != null ? scoreFill(oScore) : zebra
    setCell(ws.getCell(r, overallStart), oScore != null ? oScore : '—', {
      fillArgb: oFill,
      bold: true,
      color: scoreColor(oScore),
      size: 11,
    })
    setCell(ws.getCell(r, overallStart + 1), overall.letter || '—', {
      fillArgb: oFill,
      bold: true,
      size: 11,
    })
    setCell(ws.getCell(r, overallStart + 2), overall.gpa != null ? Number(overall.gpa) : '—', {
      fillArgb: oFill,
      size: 11,
      numFmt: overall.gpa != null ? '0.00' : undefined,
    })
    ws.getRow(r).height = 18
  })

  // Legend
  const legendRow = 6 + (students || []).length + 1
  ws.mergeCells(legendRow, 1, legendRow, Math.max(colCount, 2))
  setCell(ws.getCell(legendRow, 1), labels.legend, {
    fillArgb: C.summary,
    color: C.muted,
    size: 9,
    align: isArabic ? 'right' : 'left',
  })

  ws.getColumn(1).width = 14
  ws.getColumn(2).width = 28
  for (let i = 0; i < subjectList.length; i++) {
    const start = 3 + i * 3
    ws.getColumn(start).width = 10
    ws.getColumn(start + 1).width = 10
    ws.getColumn(start + 2).width = 12
  }
  ws.getColumn(overallStart).width = 12
  ws.getColumn(overallStart + 1).width = 10
  ws.getColumn(overallStart + 2).width = 12

  const out =
    filename ||
    `student-grades-matrix-${stamp()}.xlsx`
  const buffer = await wb.xlsx.writeBuffer()
  downloadBuffer(buffer, out)
}

/**
 * Load enrollments + grades for export (college / year / program / optional subject).
 * Returns { students, subjects, gradesByStudent }.
 */
export async function loadStudentGradesExportData({
  students,
  collegeId,
  yearId,
  programId,
  subjectId,
  gradingScale,
  isArabic = false,
  getStudentName,
}) {
  const studentList = (students || []).filter((s) => {
    if (programId && String(s.major_id || s.majors?.id || '') !== String(programId)) return false
    return true
  })
  if (!studentList.length) {
    return { students: [], subjects: [], gradesByStudent: {} }
  }

  let semesterIds = null
  if (yearId) {
    const { data: sems, error: semErr } = await supabase
      .from('semesters')
      .select('id')
      .eq('academic_year_id', Number(yearId))
    if (semErr) throw semErr
    semesterIds = (sems || []).map((s) => s.id)
    if (!semesterIds.length) {
      return { students: [], subjects: [], gradesByStudent: {} }
    }
  }

  // Classes scoped by subject filter or college subjects
  let classQuery = supabase
    .from('classes')
    .select('id, subject_id, subjects(id, code, name_en, name_ar, credit_hours)')
  if (subjectId) {
    classQuery = classQuery.eq('subject_id', Number(subjectId))
  } else if (collegeId) {
    classQuery = classQuery.eq('college_id', Number(collegeId))
  } else {
    throw new Error('Select a college (or a subject) before exporting all subjects.')
  }
  const { data: classRows, error: classErr } = await classQuery
  if (classErr) throw classErr

  const classById = new Map((classRows || []).map((c) => [c.id, c]))
  const classIds = (classRows || []).map((c) => c.id).filter(Boolean)
  if (!classIds.length) {
    return { students: [], subjects: [], gradesByStudent: {} }
  }

  const studentIdSet = new Set(
    studentList.map((s) => Number(s.id)).filter((id) => Number.isFinite(id)),
  )
  const enrollments = []
  const chunkSize = 40
  for (let i = 0; i < classIds.length; i += chunkSize) {
    const chunk = classIds.slice(i, i + chunkSize)
    let from = 0
    const page = 500
    for (;;) {
      let q = supabase
        .from('enrollments')
        .select('id, student_id, semester_id, class_id, numeric_grade, grade_points, grade, status')
        .in('class_id', chunk)
      if (semesterIds) q = q.in('semester_id', semesterIds)
      const { data, error } = await q.range(from, from + page - 1)
      if (error) throw error
      if (!data?.length) break
      for (const e of data) {
        const st = String(e.status || '').toLowerCase()
        if (st && st !== 'enrolled' && st !== 'completed' && st !== 'passed') continue
        if (studentIdSet.has(Number(e.student_id))) enrollments.push(e)
      }
      if (data.length < page) break
      from += page
    }
  }

  const enrollmentIds = enrollments.map((e) => e.id)
  const gcByEnrollment = new Map()
  for (let i = 0; i < enrollmentIds.length; i += 200) {
    const chunk = enrollmentIds.slice(i, i + 200)
    const { data: gcs, error: gcErr } = await supabase
      .from('grade_components')
      .select('*')
      .in('enrollment_id', chunk)
    if (gcErr) throw gcErr
    for (const gc of gcs || []) gcByEnrollment.set(gc.enrollment_id, gc)
  }

  let examData = {}
  try {
    const subjectIdsForExams = [
      ...new Set((classRows || []).map((c) => c.subject_id).filter(Boolean)),
    ]
    examData = await fetchExamScoresByClassIds(classIds, { subjectIds: subjectIdsForExams })
  } catch (examErr) {
    console.warn('loadStudentGradesExportData exam overlay', examErr)
  }

  const gradesByStudent = {}
  const subjectMap = new Map()

  const rememberSubject = (subj) => {
    if (!subj?.id || subjectMap.has(subj.id)) return
    const credits = Number(subj.credit_hours) > 0 ? Number(subj.credit_hours) : 1
    subjectMap.set(subj.id, {
      id: subj.id,
      code: cleanCode(subj.code),
      name: isArabic
        ? subj.name_ar || subj.name_en || cleanCode(subj.code)
        : subj.name_en || subj.name_ar || cleanCode(subj.code),
      name_en: subj.name_en,
      name_ar: subj.name_ar,
      creditHours: credits,
    })
  }

  for (const c of classRows || []) rememberSubject(c.subjects)

  const applyCell = (studentId, subj, cell) => {
    const sid = Number(studentId)
    if (!Number.isFinite(sid) || !subj?.id) return
    if (!gradesByStudent[sid]) gradesByStudent[sid] = {}
    const prev = gradesByStudent[sid][subj.id]
    if (!prev) {
      gradesByStudent[sid][subj.id] = cell
      return
    }
    const prevHas = prev.score != null && !Number.isNaN(Number(prev.score))
    const cellHas = cell.score != null && !Number.isNaN(Number(cell.score))
    // Never let an empty enrollment row wipe a real exam/gradebook score.
    if (cellHas && !prevHas) {
      gradesByStudent[sid][subj.id] = cell
      return
    }
    if (!cellHas && prevHas) return
    if ((cell.examAt || 0) > (prev.examAt || 0)) {
      gradesByStudent[sid][subj.id] = cell
      return
    }
    if ((cell.examAt || 0) === (prev.examAt || 0) && (cell.semester_id || 0) > (prev.semester_id || 0)) {
      gradesByStudent[sid][subj.id] = cell
    }
  }

  const cellFromPercent = (percent, credits, extra = {}) => {
    const score = percent != null && !Number.isNaN(Number(percent)) ? Number(percent) : null
    return {
      score,
      letter: score != null ? getLetterFromPercent(score, gradingScale) : extra.letter || null,
      gpa: score != null ? numericGradeToGpaPoints(score, gradingScale) : extra.gpa ?? null,
      credits,
      semester_id: extra.semester_id || 0,
      examAt: extra.examAt || 0,
    }
  }

  for (const e of enrollments) {
    const cls = classById.get(e.class_id) || classById.get(Number(e.class_id))
    const subj = cls?.subjects
    if (!subj?.id) continue
    rememberSubject(subj)
    const credits = Number(subj.credit_hours) > 0 ? Number(subj.credit_hours) : 1

    const gcRaw = gcByEnrollment.get(e.id) || gcByEnrollment.get(Number(e.id)) || null
    const { scores, examAt, latestPercent } = examScoresForEnrollment(examData, {
      ...e,
      subject_id: cls.subject_id || subj.id,
    })
    const gc = overlayExamScoresOnGradeComponent(gcRaw, scores, gradingScale)
    const enrollment = {
      ...e,
      classes: cls ? { id: cls.id, subject_id: cls.subject_id, subjects: subj } : null,
      grade_components: gc,
    }
    const comp = normalizeGradeComponent(enrollment.grade_components)
    const { points, letter } = getSubjectGpaFromEnrollment(enrollment, gradingScale)
    const examVals = Object.values(scores || {})
      .map(Number)
      .filter((n) => !Number.isNaN(n))
    const useExamPercent = latestPercent != null && (examVals.length <= 1 || gc?.numeric_grade == null)
    const scoreRaw = useExamPercent
      ? latestPercent
      : comp?.numeric_grade ?? comp?.final ?? enrollment.numeric_grade ?? null
    const score =
      scoreRaw != null && scoreRaw !== '' && !Number.isNaN(Number(scoreRaw))
        ? Number(scoreRaw)
        : null
    applyCell(
      e.student_id,
      subj,
      cellFromPercent(score, credits, {
        letter: useExamPercent ? null : comp?.letter_grade || letter || enrollment.grade,
        gpa: useExamPercent ? null : points,
        semester_id: e.semester_id || 0,
        examAt: examAt || 0,
      }),
    )
  }

  let examStudents = []
  try {
    examStudents = await fetchStudentsByIds(studentIdsFromExamData(examData))
  } catch (stuErr) {
    console.warn('loadStudentGradesExportData exam students', stuErr)
  }

  // Any student with an exam attempt (original or re-exam) must appear, even if enrollment/gradebook matching failed.
  for (const s of studentList) {
    const sid = Number(s.id)
    const examStudentId = examLookupIdForStudent(s, examStudents)
    for (const subj of subjectMap.values()) {
      const existing = gradesByStudent[sid]?.[subj.id]
      if (existing?.score != null) continue
      const { latestPercent, examAt } = examScoresForEnrollment(examData, {
        student_id: examStudentId,
        subject_id: subj.id,
      })
      if (latestPercent == null) continue
      applyCell(
        sid,
        subj,
        cellFromPercent(latestPercent, subj.creditHours || 1, { examAt }),
      )
    }
  }

  const listedIds = new Set(studentList.map((s) => Number(s.id)).filter((n) => Number.isFinite(n)))
  const extraExamStudents = examStudents.filter((s) => {
    const pk = Number(s.id)
    if (!Number.isFinite(pk) || listedIds.has(pk)) return false
    return [...subjectMap.values()].some((subj) => {
      const { latestPercent } = examScoresForEnrollment(examData, {
        student_id: pk,
        subject_id: subj.id,
      })
      return latestPercent != null
    })
  })
  for (const s of extraExamStudents) {
    const sid = Number(s.id)
    for (const subj of subjectMap.values()) {
      const { latestPercent, examAt } = examScoresForEnrollment(examData, {
        student_id: sid,
        subject_id: subj.id,
      })
      if (latestPercent == null) continue
      applyCell(sid, subj, cellFromPercent(latestPercent, subj.creditHours || 1, { examAt }))
    }
  }

  const allStudentsForExport = [...studentList, ...extraExamStudents]

  // Only include subjects that appear in data (or forced single subject)
  let subjectsOut = [...subjectMap.values()].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', isArabic ? 'ar' : 'en'),
  )
  if (subjectId) {
    const sid = Number(subjectId)
    subjectsOut = subjectsOut.filter((s) => s.id === sid)
  }

  Object.entries(gradesByStudent).forEach(([studentId, bySubject]) => {
    let scoreWeight = 0
    let scoreCredits = 0
    let gpaWeight = 0
    let gpaCredits = 0
    subjectsOut.forEach((subj) => {
      const cell = bySubject[subj.id]
      if (!cell) return
      const credits = Number(cell.credits || subj.creditHours || 1) || 1
      if (cell.score != null && !Number.isNaN(Number(cell.score))) {
        scoreWeight += Number(cell.score) * credits
        scoreCredits += credits
      }
      if (cell.gpa != null && !Number.isNaN(Number(cell.gpa))) {
        gpaWeight += Number(cell.gpa) * credits
        gpaCredits += credits
      }
    })
    const overallScore =
      scoreCredits > 0 ? Math.round((scoreWeight / scoreCredits) * 100) / 100 : null
    const overallGpa =
      gpaCredits > 0 ? Math.round((gpaWeight / gpaCredits) * 100) / 100 : null
    gradesByStudent[studentId].__overall = {
      score: overallScore,
      letter: overallScore != null ? getLetterFromPercent(overallScore, gradingScale) : null,
      gpa: overallGpa,
    }
  })

  // Only students who have at least one grade when exporting, or all filtered students
  const exportStudents = allStudentsForExport
    .map((s) => ({
      id: s.id,
      studentId: String(s.student_id || '').replace(/^STU/i, ''),
      name: getStudentName ? getStudentName(s) : s.name_en || s.name_ar || '—',
    }))
    .sort((a, b) =>
      String(a.studentId).localeCompare(String(b.studentId), undefined, { numeric: true }),
    )

  return {
    students: exportStudents,
    subjects: subjectsOut,
    gradesByStudent,
  }
}
