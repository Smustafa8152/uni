import ExcelJS from 'exceljs'
import html2pdf from 'html2pdf.js'
import { getConfigFieldName, getTotalPercent, getLetterFromPercent } from './instructorGradeSheet'
import { getUniversityBranding, numericGradeToGpaPoints } from './getCollegeSettings'

function rowBgFromPercent(pct) {
  if (pct == null) return '#fafcff'
  if (pct >= 90) return '#f1f8e9'
  if (pct >= 80) return '#e8f4fd'
  if (pct >= 60) return '#fff8e1'
  return '#ffebee'
}

function scoreColorFromPercent(pct) {
  if (pct == null) return '#555'
  if (pct >= 90) return '#1b5e20'
  if (pct >= 80) return '#1565c0'
  if (pct >= 60) return '#e65100'
  return '#b71c1c'
}

const C = {
  navy: 'FF1A3A5C',
  midBlue: 'FF2E6DA4',
  gold: 'FFC9A84C',
  blue: 'FF2E6DA4',
  blueLight: 'FFD6E4F0',
  headerText: 'FFFFFFFF',
  activitiesBg: 'FFFAFCFF',
  midtermBg: 'FFE8F4FD',
  finalBg: 'FFE8F4FD',
  summaryBg: 'FFF4F6F9',
  border: 'FFB0C4DE',
  zebra: 'FFFAFCFF',
  white: 'FFFFFFFF',
  pass: 'FF1B5E20',
  fail: 'FFB71C1C',
  rowA: 'FFF1F8E9',
  rowB: 'FFE8F4FD',
  rowC: 'FFFFF8E1',
  rowD: 'FFFFEBEE',
  status: {
    complete: 'FFD1FAE5',
    incomplete: 'FFFEF3C7',
    not_recorded: 'FFE5E7EB',
    debarred: 'FFFECACA',
    withdrawn: 'FFFED7AA',
  },
}

const GRAY_BORDER = {
  top: { style: 'thin', color: { argb: 'FFD1D1D1' } },
  left: { style: 'thin', color: { argb: 'FFD1D1D1' } },
  bottom: { style: 'thin', color: { argb: 'FFD1D1D1' } },
  right: { style: 'thin', color: { argb: 'FFD1D1D1' } },
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function labelComponent(c, isArabic) {
  if (isArabic && c.grade_type_name_ar) return c.grade_type_name_ar
  return c.grade_type_name_en || c.grade_type_code || c.field || getConfigFieldName(c)
}

function formatPrintDate() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
}

function mergeBanner(ws, row, colEnd, value, fillArgb, fontSize = 14) {
  ws.mergeCells(row, 1, row, colEnd)
  const cell = ws.getCell(row, 1)
  cell.value = value
  cell.font = { bold: true, size: fontSize, color: { argb: C.headerText } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } }
  cell.alignment = { vertical: 'middle', horizontal: 'center' }
  ws.getRow(row).height = fontSize + 12
}

function setCell(cell, value, opts = {}) {
  const {
    fillArgb = C.white,
    bold = false,
    align = 'center',
    color = 'FF111827',
    size = 11,
    numFmt,
    wrap = true,
  } = opts
  cell.value = value
  cell.font = { size, bold, color: { argb: color } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } }
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: wrap }
  cell.border = GRAY_BORDER
  if (numFmt) cell.numFmt = numFmt
}

function addInfoBlock(ws, startRow, colStart, colSpan, label, value) {
  ws.mergeCells(startRow, colStart, startRow, colStart + colSpan - 1)
  const labelCell = ws.getCell(startRow, colStart)
  setCell(labelCell, label, { fillArgb: 'FFF4F6F9', align: 'center', size: 9, color: 'FF666666', bold: true })

  ws.mergeCells(startRow + 1, colStart, startRow + 1, colStart + colSpan - 1)
  const valCell = ws.getCell(startRow + 1, colStart)
  setCell(valCell, value ?? '—', { fillArgb: C.white, align: 'center', size: 11, color: 'FF1A3A5C', bold: true })
}

function computeSheetStats(enrollments, draftGrades, gradeConfig) {
  const rows = (enrollments || []).map((e) => ({
    pct: getTotalPercent(draftGrades[e.id], gradeConfig),
    recordStatus: draftGrades[e.id]?.record_status || 'not_recorded',
  }))
  const withPct = rows.filter((r) => r.pct != null)
  const passCount = withPct.filter((r) => r.pct >= 60).length
  const failCount = withPct.filter((r) => r.pct < 60).length
  const avg =
    withPct.length > 0 ? withPct.reduce((a, r) => a + r.pct, 0) / withPct.length : null
  const highest = withPct.length ? Math.max(...withPct.map((r) => r.pct)) : null
  const lowest = withPct.length ? Math.min(...withPct.map((r) => r.pct)) : null
  const debarred = rows.filter((r) => r.recordStatus === 'debarred').length
  return {
    total: enrollments?.length || 0,
    passCount,
    failCount,
    avg,
    highest,
    lowest,
    debarred,
    graded: withPct.length,
  }
}

function buildGradeRows(enrollments, draftGrades, gradeConfig, componentCols, gradingScale, displayStudentName) {
  return (enrollments || []).map((e, idx) => {
    const g = draftGrades[e.id] || {}
    const pct = getTotalPercent(g, gradeConfig)
    const letter = g.letter_grade || getLetterFromPercent(pct, gradingScale)
    const gpaPts =
      g.gpa_points != null ? Number(g.gpa_points) : pct != null ? numericGradeToGpaPoints(pct, gradingScale) : null
    const componentVals = (componentCols || []).map((c) => {
      const f = getConfigFieldName(c)
      const v = g[f]
      return v != null && v !== '' ? Number(v) : null
    })
    return {
      idx: idx + 1,
      studentId: e.students?.student_id ?? '',
      name: displayStudentName(e.students),
      status: 'enrolled',
      componentVals,
      total: pct != null ? Math.round(pct) : null,
      gpaPts,
      letter: letter ?? '',
      note: g.notes || '',
      pct,
    }
  })
}

function addOfficialGradeSheet(ws, {
  isArabic,
  totalCols,
  meta,
  componentCols,
  gradeRows,
  tableHeaderRow,
}) {
  const L = isArabic
    ? {
        num: '#',
        id: 'رقم الطالب',
        name: 'اسم الطالب',
        status: 'الحالة',
        enrolled: 'مسجلة',
        total: 'المجموع',
        points: 'العلامة بالنقاط',
        letter: 'العلامة بالأحرف',
        note: 'ملاحظة',
        per100: '/100',
        perPts: 'بالنقاط',
        perLetter: 'بالأحرف',
      }
    : {
        num: '#',
        id: 'Student ID',
        name: 'Student name',
        status: 'Status',
        enrolled: 'Enrolled',
        total: 'Total',
        points: 'Points grade',
        letter: 'Letter grade',
        note: 'Note',
        per100: '/100',
        perPts: 'GPA',
        perLetter: 'grade',
      }

  mergeBanner(ws, 1, totalCols, meta.universityNameAr || meta.universityNameEn, C.navy, 16)
  mergeBanner(ws, 2, totalCols, meta.universityNameEn || meta.universityNameAr, C.navy, 12)
  mergeBanner(ws, 3, totalCols, meta.semesterLabel || '', C.midBlue, 12)

  ws.mergeCells(4, 1, 4, totalCols)
  const goldCell = ws.getCell(4, 1)
  goldCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.gold } }
  ws.getRow(4).height = 4

  const infoItems = isArabic
    ? [
        { label: 'رمز المقرر', value: meta.subjectCode },
        { label: 'اسم المقرر', value: meta.courseName },
        { label: 'المحاضر', value: meta.instructorName },
        { label: 'نوع الدراسة', value: meta.studyType || 'دراسة منتظمة' },
        { label: 'الشعبة', value: meta.section },
        { label: 'الوقت', value: meta.scheduleLabel || '—' },
        { label: 'تاريخ الطباعة', value: meta.printDate },
        { label: 'المستخدم', value: meta.printUser },
      ]
    : [
        { label: 'Course code', value: meta.subjectCode },
        { label: 'Course name', value: meta.courseName },
        { label: 'Instructor', value: meta.instructorName },
        { label: 'Study type', value: meta.studyType || 'Regular study' },
        { label: 'Section', value: meta.section },
        { label: 'Class / schedule', value: meta.scheduleLabel || meta.classCode || '—' },
        { label: 'Print date', value: meta.printDate },
        { label: 'User', value: meta.printUser },
      ]

  const infoStartRow = 5
  const pairsPerRow = 4
  const span = Math.max(2, Math.floor(totalCols / pairsPerRow))
  infoItems.forEach((item, i) => {
    const rowGroup = Math.floor(i / pairsPerRow)
    const colGroup = i % pairsPerRow
    const colStart = colGroup * span + 1
    const colSpan = colGroup === pairsPerRow - 1 ? totalCols - colStart + 1 : span
    addInfoBlock(ws, infoStartRow + rowGroup * 2, colStart, colSpan, item.label, item.value)
  })

  if (meta.allGroupsApproved) {
    const badgeRow = infoStartRow + 4
    ws.mergeCells(badgeRow, 1, badgeRow, totalCols)
    const badge = ws.getCell(badgeRow, 1)
    setCell(badge, isArabic ? 'معتمدة من قبل العميد' : 'Approved by dean', {
      fillArgb: 'FFE8F5E9',
      color: 'FF2E7D32',
      bold: true,
      size: 11,
    })
  }

  const hdrRow = tableHeaderRow
  let col = 1
  const headers = [
    { text: L.num },
    { text: L.id },
    { text: L.name, align: isArabic ? 'right' : 'left' },
    { text: L.status },
    ...componentCols.map((c) => ({
      text: `${labelComponent(c, isArabic)}\n/${c.maximum ?? 100}`,
    })),
    { text: `${L.total}\n${L.per100}` },
    { text: `${L.points}\n${L.perPts}` },
    { text: `${L.letter}\n${L.perLetter}` },
    { text: L.note },
  ]

  headers.forEach((h) => {
    const cell = ws.getCell(hdrRow, col)
    cell.value = h.text
    cell.font = { bold: true, size: 11, color: { argb: C.headerText } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }
    cell.alignment = {
      vertical: 'middle',
      horizontal: h.align || 'center',
      wrapText: true,
    }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFFFFFFF' } },
      left: { style: 'thin', color: { argb: '33FFFFFF' } },
      bottom: { style: 'thin', color: { argb: '33FFFFFF' } },
      right: { style: 'thin', color: { argb: '33FFFFFF' } },
    }
    col += 1
  })
  ws.getRow(hdrRow).height = 36

  gradeRows.forEach((row, rIdx) => {
    const rowNum = hdrRow + 1 + rIdx
    const zebra = rIdx % 2 === 1 ? 'FFFFF8E1' : C.white
    let c = 1

    setCell(ws.getCell(rowNum, c++), row.idx, { fillArgb: zebra, color: 'FF2E6DA4', bold: true })
    setCell(ws.getCell(rowNum, c++), row.studentId, { fillArgb: zebra, size: 10 })
    setCell(ws.getCell(rowNum, c++), row.name, {
      fillArgb: zebra,
      align: isArabic ? 'right' : 'left',
      bold: true,
      color: 'FF1A3A5C',
    })
    setCell(ws.getCell(rowNum, c++), isArabic ? L.enrolled : L.enrolled, {
      fillArgb: zebra,
      color: 'FF2E7D32',
      bold: true,
      size: 10,
    })

    row.componentVals.forEach((v) => {
      const cell = ws.getCell(rowNum, c++)
      setCell(cell, v != null ? v : '', { fillArgb: zebra, numFmt: v != null ? '0' : undefined })
    })

    const totalColor =
      row.pct == null ? 'FF555555' : row.pct >= 90 ? 'FF1B5E20' : row.pct >= 80 ? 'FF1565C0' : row.pct >= 60 ? 'FFE65100' : 'FFB71C1C'
    setCell(ws.getCell(rowNum, c++), row.total != null ? row.total : '', {
      fillArgb: zebra,
      bold: true,
      color: totalColor,
    })
    setCell(ws.getCell(rowNum, c++), row.gpaPts != null ? row.gpaPts : '', {
      fillArgb: zebra,
      bold: true,
      color: 'FF2E6DA4',
      numFmt: row.gpaPts != null ? '0.00' : undefined,
    })
    setCell(ws.getCell(rowNum, c++), row.letter, { fillArgb: zebra, bold: true, color: 'FF1A3A5C' })
    setCell(ws.getCell(rowNum, c++), row.note, { fillArgb: zebra, color: 'FFE53935', bold: true })

    ws.getRow(rowNum).height = 20
  })
}

function addDistributionSheet(wb, { isArabic, gradingScale, gradeRows, stats }) {
  const ws = wb.addWorksheet(isArabic ? 'توزيع الدرجات' : 'Distribution', {
    views: [{ rightToLeft: isArabic }],
  })

  const scale = (gradingScale || []).slice().sort((a, b) => (a.minPercent ?? 0) - (b.minPercent ?? 0))
  const counts = {}
  gradeRows.forEach((r) => {
    if (!r.letter) return
    counts[r.letter] = (counts[r.letter] || 0) + 1
  })

  const headers = isArabic
    ? ['العلامة بالنقاط', 'أقل علامة', 'أقصى علامة', 'التقدير بالأحرف', 'عدد الطلاب', 'النسبة %']
    : ['Points', 'Min %', 'Max %', 'Letter', 'Count', '%']

  headers.forEach((h, i) => {
    const cell = ws.getCell(1, i + 1)
    cell.value = h
    cell.font = { bold: true, color: { argb: C.headerText } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.navy } }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = GRAY_BORDER
  })

  scale.forEach((band, idx) => {
    const rowNum = idx + 2
    const letter = band.letter
    const count = counts[letter] || 0
    const pct = stats.graded > 0 ? ((count / stats.graded) * 100).toFixed(1) : ''
    const zebra = idx % 2 === 1 ? 'FFFFF8E1' : C.white
    setCell(ws.getCell(rowNum, 1), band.points ?? '', { fillArgb: zebra, bold: true, color: 'FF2E6DA4', numFmt: '0.00' })
    setCell(ws.getCell(rowNum, 2), band.minPercent ?? band.min_percent ?? '', { fillArgb: zebra })
    setCell(ws.getCell(rowNum, 3), band.maxPercent ?? band.max_percent ?? '', { fillArgb: zebra })
    setCell(ws.getCell(rowNum, 4), letter, { fillArgb: zebra, bold: true })
    setCell(ws.getCell(rowNum, 5), count, { fillArgb: zebra, bold: true })
    setCell(ws.getCell(rowNum, 6), pct !== '' ? `${pct}%` : '', { fillArgb: zebra })
  })

  const totalRow = scale.length + 2
  ws.mergeCells(totalRow, 1, totalRow, 4)
  setCell(ws.getCell(totalRow, 1), isArabic ? 'المجموع الكلي' : 'Total', {
    fillArgb: C.blueLight,
    bold: true,
    color: 'FF1A3A5C',
  })
  setCell(ws.getCell(totalRow, 5), stats.graded, { fillArgb: C.blueLight, bold: true })
  setCell(ws.getCell(totalRow, 6), stats.graded > 0 ? '100%' : '', { fillArgb: C.blueLight })

  ws.columns = [{ width: 14 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 12 }]
}

function addStatsSheet(wb, { isArabic, meta, stats }) {
  const ws = wb.addWorksheet(isArabic ? 'الملخص الإحصائي' : 'Statistics', {
    views: [{ rightToLeft: isArabic }],
  })

  mergeBanner(ws, 1, 2, isArabic ? 'الملخص الإحصائي' : 'Statistical summary', C.navy, 14)
  mergeBanner(ws, 2, 2, [meta.subjectCode, meta.courseName].filter(Boolean).join(' — '), C.midBlue, 11)

  const items = isArabic
    ? [
        ['إجمالي الطلاب', stats.total],
        ['الناجحون', stats.passCount],
        ['الراسبون', stats.failCount],
        ['متوسط الشعبة', stats.avg != null ? stats.avg.toFixed(2) : '—'],
        ['أعلى علامة', stats.highest != null ? Math.round(stats.highest) : '—'],
        ['أدنى علامة', stats.lowest != null ? Math.round(stats.lowest) : '—'],
        ['المحرومون', stats.debarred],
        ['عدد المرصود', stats.graded],
      ]
    : [
        ['Total students', stats.total],
        ['Passed', stats.passCount],
        ['Failed', stats.failCount],
        ['Section average', stats.avg != null ? stats.avg.toFixed(2) : '—'],
        ['Highest grade', stats.highest != null ? Math.round(stats.highest) : '—'],
        ['Lowest grade', stats.lowest != null ? Math.round(stats.lowest) : '—'],
        ['Debarred', stats.debarred],
        ['Graded', stats.graded],
      ]

  items.forEach((item, i) => {
    const row = i + 4
    setCell(ws.getCell(row, 1), item[0], { fillArgb: 'FFF4F6F9', align: isArabic ? 'right' : 'left', bold: true })
    setCell(ws.getCell(row, 2), item[1], { fillArgb: C.white, align: 'center', bold: true, color: 'FF2E6DA4', size: 13 })
    ws.getRow(row).height = 22
  })

  ws.columns = [{ width: 28 }, { width: 18 }]
}

export async function exportGradeSheetExcel({
  enrollments,
  draftGrades,
  gradeConfig,
  gradingScale,
  displayStudentName,
  subjectCode,
  courseName,
  semesterLabel,
  isArabic = false,
  filename,
  universityNameAr,
  universityNameEn,
  instructorName,
  section,
  classCode,
  scheduleLabel,
  printUser,
  allGroupsApproved,
  studyType,
}) {
  const branding = await getUniversityBranding()
  const componentCols = gradeConfig?.length
    ? gradeConfig
    : [
        { field: 'assignments', grade_type_name_en: 'Assignments', grade_type_name_ar: 'الواجبات', maximum: 100 },
        { field: 'quizzes', grade_type_name_en: 'Quizzes', grade_type_name_ar: 'قصير', maximum: 100 },
        { field: 'class_participation', grade_type_name_en: 'Participation', grade_type_name_ar: 'مشاركة', maximum: 100 },
        { field: 'midterm', grade_type_name_en: 'Midterm', grade_type_name_ar: 'نصف', maximum: 100 },
        { field: 'final', grade_type_name_en: 'Final', grade_type_name_ar: 'نهائي', maximum: 100 },
      ]

  const totalCols = 4 + componentCols.length + 4
  const stats = computeSheetStats(enrollments, draftGrades, gradeConfig)
  const gradeRows = buildGradeRows(enrollments, draftGrades, gradeConfig, componentCols, gradingScale, displayStudentName)

  const meta = {
    universityNameAr: branding.nameAr || universityNameAr || '',
    universityNameEn: branding.nameEn || universityNameEn || '',
    semesterLabel,
    subjectCode,
    courseName,
    instructorName,
    section,
    classCode,
    scheduleLabel: scheduleLabel || classCode,
    printDate: formatPrintDate(),
    printUser,
    studyType,
    allGroupsApproved,
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = meta.universityNameEn || 'University Management System'
  wb.created = new Date()

  const tableHeaderRow = meta.allGroupsApproved ? 10 : 9
  const ws = wb.addWorksheet(isArabic ? 'كشف الدرجات' : 'Grades', {
    views: [{ state: 'frozen', ySplit: tableHeaderRow, rightToLeft: isArabic }],
    properties: { defaultRowHeight: 18 },
  })

  addOfficialGradeSheet(ws, {
    isArabic,
    totalCols,
    meta,
    componentCols,
    gradeRows,
    tableHeaderRow,
  })

  ws.columns = [
    { width: 6 },
    { width: 14 },
    { width: 32 },
    { width: 12 },
    ...componentCols.map(() => ({ width: 11 })),
    { width: 10 },
    { width: 12 },
    { width: 10 },
    { width: 10 },
  ]

  const footerRow = tableHeaderRow + gradeRows.length + 2
  ws.mergeCells(footerRow, 1, footerRow, totalCols)
  const footer = ws.getCell(footerRow, 1)
  footer.value = isArabic
    ? `F043 | ${meta.universityNameAr} | ${meta.subjectCode} — ${meta.courseName} | طباعة: ${meta.printDate} | ${meta.printUser}`
    : `${meta.universityNameEn} | ${meta.subjectCode} — ${meta.courseName} | Printed: ${meta.printDate} | ${meta.printUser}`
  footer.font = { size: 9, color: { argb: 'FF666666' }, italic: true }
  footer.alignment = { horizontal: 'center' }

  addDistributionSheet(wb, { isArabic, gradingScale, gradeRows, stats })
  addStatsSheet(wb, { isArabic, meta, stats })

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename || `${subjectCode || 'grades'}-final-sheet.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportGradeSheetPdf({
  enrollments,
  draftGrades,
  gradeConfig,
  gradingScale,
  displayStudentName,
  subjectCode,
  courseName,
  semesterLabel,
  isArabic,
}) {
  const title = isArabic ? 'كشف الدرجات النهائي' : 'Final Grade Sheet'
  const printDate = (() => {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
  })()

  const withPct = (enrollments || []).map((e) => ({
    e,
    pct: getTotalPercent(draftGrades[e.id], gradeConfig),
  }))
  const graded = withPct.filter((r) => r.pct != null)
  const courseAvg =
    graded.length > 0 ? (graded.reduce((a, r) => a + r.pct, 0) / graded.length).toFixed(2) : '—'
  const passCount = graded.filter((r) => r.pct >= 60).length
  const failCount = graded.filter((r) => r.pct < 60).length
  const highest = graded.length ? Math.max(...graded.map((r) => r.pct)) : '—'
  const lowest = graded.length ? Math.min(...graded.map((r) => r.pct)) : '—'

  const componentCols = gradeConfig?.length
    ? gradeConfig
    : [
        { field: 'assignments', grade_type_name_en: 'Assignments' },
        { field: 'quizzes', grade_type_name_en: 'Quizzes' },
        { field: 'class_participation', grade_type_name_en: 'Participation' },
        { field: 'midterm', grade_type_name_en: 'Midterm' },
        { field: 'final', grade_type_name_en: 'Final' },
      ]

  const headCells = componentCols
    .map(
      (c) =>
        `<th>${escapeHtml(labelComponent(c, isArabic))}<br/><small style="font-weight:400;opacity:.85">/${c.maximum ?? 100}</small></th>`,
    )
    .join('')

  const bodyRows = (enrollments || [])
    .map((e, i) => {
      const g = draftGrades[e.id] || {}
      const pct = getTotalPercent(g, gradeConfig)
      const letter = g.letter_grade || getLetterFromPercent(pct, gradingScale) || '—'
      const gpaPts =
        g.gpa_points != null ? Number(g.gpa_points) : pct != null ? numericGradeToGpaPoints(pct, gradingScale) : null
      const bg = rowBgFromPercent(pct)
      const cells = componentCols
        .map((c) => {
          const f = getConfigFieldName(c)
          const v = g[f]
          return `<td>${v != null ? escapeHtml(v) : '—'}</td>`
        })
        .join('')
      return `<tr style="background:${bg}">
        <td style="color:#2e6da4;font-weight:700">${i + 1}</td>
        <td style="font-family:monospace;font-size:10px">${escapeHtml(e.students?.student_id)}</td>
        <td style="text-align:${isArabic ? 'right' : 'left'};font-weight:600;color:#1a3a5c">${escapeHtml(displayStudentName(e.students))}</td>
        <td><span style="background:#e8f5e9;color:#2e7d32;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">${isArabic ? 'مسجلة' : 'Enrolled'}</span></td>
        ${cells}
        <td style="font-weight:900;color:${scoreColorFromPercent(pct)}">${pct != null ? Math.round(pct) : '—'}</td>
        <td style="font-weight:700;color:#2e6da4">${gpaPts != null ? gpaPts.toFixed(2) : '—'}</td>
        <td style="font-weight:800">${escapeHtml(letter)}</td>
      </tr>`
    })
    .join('')

  const html = `
    <div style="font-family:'Tajawal',Arial,sans-serif;padding:0;direction:${isArabic ? 'rtl' : 'ltr'};color:#1a1a2e">
      <div style="background:linear-gradient(135deg,#1a3a5c,#0d2137);color:#fff;padding:20px 24px">
        <div style="font-size:22px;font-weight:900">${title}</div>
        <div style="color:#c9a84c;font-size:12px;margin-top:4px">${escapeHtml(subjectCode)} — ${escapeHtml(courseName)}</div>
        <div style="margin-top:8px;display:inline-block;background:#2e6da4;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:700">${escapeHtml(semesterLabel)}</div>
      </div>
      <div style="background:linear-gradient(90deg,#1a3a5c,#2e6da4);padding:12px 24px;display:flex;justify-content:space-around;flex-wrap:wrap;color:#fff;font-size:11px">
        <div style="text-align:center"><div style="font-size:18px;font-weight:900;color:#c9a84c">${enrollments?.length || 0}</div>${isArabic ? 'إجمالي الطلاب' : 'Students'}</div>
        <div style="text-align:center"><div style="font-size:18px;font-weight:900;color:#c9a84c">${passCount}</div>${isArabic ? 'الناجحون' : 'Passed'}</div>
        <div style="text-align:center"><div style="font-size:18px;font-weight:900;color:#c9a84c">${failCount}</div>${isArabic ? 'الراسبون' : 'Failed'}</div>
        <div style="text-align:center"><div style="font-size:18px;font-weight:900;color:#c9a84c">${courseAvg}</div>${isArabic ? 'متوسط الشعبة' : 'Average'}</div>
        <div style="text-align:center"><div style="font-size:18px;font-weight:900;color:#c9a84c">${highest}</div>${isArabic ? 'أعلى علامة' : 'Highest'}</div>
        <div style="text-align:center"><div style="font-size:18px;font-weight:900;color:#c9a84c">${lowest}</div>${isArabic ? 'أدنى علامة' : 'Lowest'}</div>
      </div>
      <div style="padding:16px 20px">
      <table style="width:100%;border-collapse:collapse;font-size:10px">
        <thead>
          <tr style="background:linear-gradient(135deg,#2e6da4,#1a3a5c);color:#fff">
            <th style="border:1px solid rgba(255,255,255,.15);padding:8px">#</th>
            <th style="border:1px solid rgba(255,255,255,.15);padding:8px">${isArabic ? 'رقم الطالب' : 'ID'}</th>
            <th style="border:1px solid rgba(255,255,255,.15);padding:8px">${isArabic ? 'اسم الطالب' : 'Name'}</th>
            <th style="border:1px solid rgba(255,255,255,.15);padding:8px">${isArabic ? 'الحالة' : 'Status'}</th>
            ${headCells.replace(/<th>/g, '<th style="border:1px solid rgba(255,255,255,.15);padding:8px">')}
            <th style="border:1px solid rgba(255,255,255,.15);padding:8px">${isArabic ? 'المجموع' : 'Total'}<br/><small>/100</small></th>
            <th style="border:1px solid rgba(255,255,255,.15);padding:8px">${isArabic ? 'بالنقاط' : 'GPA'}</th>
            <th style="border:1px solid rgba(255,255,255,.15);padding:8px">${isArabic ? 'التقدير' : 'Letter'}</th>
          </tr>
        </thead>
        <tbody>
          ${bodyRows.replace(/<td>/g, '<td style="border:1px solid #e8eef4;padding:6px;text-align:center;vertical-align:middle">')}
        </tbody>
      </table>
      </div>
      <div style="background:#1a3a5c;color:rgba(255,255,255,.65);padding:10px 24px;font-size:10px;display:flex;justify-content:space-between">
        <span>${isArabic ? 'تاريخ الطباعة' : 'Print date'}: <span style="color:#c9a84c">${printDate}</span></span>
        <span>${escapeHtml(subjectCode)} — ${escapeHtml(courseName)}</span>
      </div>
    </div>
  `

  const el = document.createElement('div')
  el.innerHTML = html
  document.body.appendChild(el)

  await html2pdf()
    .set({
      margin: 10,
      filename: `${subjectCode || 'grades'}-sheet.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
    })
    .from(el)
    .save()

  document.body.removeChild(el)
}

export function computeGradeDistribution(enrollments, draftGrades, gradeConfig, gradingScale) {
  const counts = {}
  let pass = 0
  let fail = 0
  let graded = 0

  ;(enrollments || []).forEach((e) => {
    const pct = getTotalPercent(draftGrades[e.id], gradeConfig)
    if (pct == null) return
    graded += 1
    const letter = draftGrades[e.id]?.letter_grade || getLetterFromPercent(pct, gradingScale) || '?'
    counts[letter] = (counts[letter] || 0) + 1
    if (pct >= 60) pass += 1
    else fail += 1
  })

  const total = enrollments?.length || 0
  const distribution = Object.entries(counts)
    .map(([letter, count]) => ({
      letter,
      count,
      pct: graded > 0 ? Math.round((count / graded) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  return {
    distribution,
    passRate: graded > 0 ? Math.round((pass / graded) * 100) : 0,
    failRate: graded > 0 ? Math.round((fail / graded) * 100) : 0,
    passCount: pass,
    failCount: fail,
    graded,
    total,
  }
}
