import ExcelJS from 'exceljs'

const C = {
  navy: 'FF1A3A5C',
  midBlue: 'FF2E6DA4',
  gold: 'FFC9A84C',
  headerText: 'FFFFFFFF',
  white: 'FFFFFFFF',
  zebra: 'FFF7FAFC',
  summaryBg: 'FFF0F4F8',
  border: 'FFB0C4DE',
  text: 'FF111827',
  muted: 'FF64748B',
  rowA: 'FFF1F8E9',
  rowB: 'FFE8F4FD',
  rowC: 'FFFFF8E1',
  rowD: 'FFFFEBEE',
  pass: 'FF1B5E20',
  fail: 'FFB71C1C',
}

const BORDER = {
  top: { style: 'thin', color: { argb: C.border } },
  left: { style: 'thin', color: { argb: C.border } },
  bottom: { style: 'thin', color: { argb: C.border } },
  right: { style: 'thin', color: { argb: C.border } },
}

function fillFromScore(score) {
  if (score == null) return C.white
  if (score >= 90) return C.rowA
  if (score >= 80) return C.rowB
  if (score >= 60) return C.rowC
  return C.rowD
}

function colorFromScore(score) {
  if (score == null) return C.muted
  if (score >= 90) return C.pass
  if (score >= 80) return 'FF1565C0'
  if (score >= 60) return 'FFE65100'
  return C.fail
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
  cell.value = value
  cell.font = { size, bold, color: { argb: color } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } }
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: true }
  cell.border = BORDER
  if (numFmt) cell.numFmt = numFmt
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

/**
 * Export subject scores as a coloured Excel workbook.
 * @param {object} opts
 * @param {Array} opts.rows - { studentId, name, program, semester, score, letter, gpa }
 * @param {object} opts.meta - { subjectName, subjectCode, yearName, programName, collegeName, stats }
 * @param {boolean} opts.isArabic
 * @param {string} [opts.filename]
 */
export async function exportSubjectScoresExcel({ rows, meta = {}, isArabic = false, filename }) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'University Management System'
  wb.created = new Date()

  const ws = wb.addWorksheet(isArabic ? 'درجات المقرر' : 'Subject scores', {
    views: [{ state: 'frozen', ySplit: 8, rightToLeft: isArabic }],
  })

  const colCount = 8
  const labels = isArabic
    ? {
        title: 'درجات المقرر',
        subject: 'المقرر',
        year: 'العام الأكاديمي',
        program: 'البرنامج',
        college: 'الكلية',
        students: 'الطلاب',
        graded: 'مقيَّمون',
        avg: 'متوسط الدرجة',
        pass: 'نسبة النجاح',
        headers: ['#', 'رقم الطالب', 'الاسم', 'البرنامج', 'الفصل', 'الدرجة', 'التقدير', 'معدل المقرر'],
        allYears: 'جميع الأعوام',
        allPrograms: 'جميع البرامج',
      }
    : {
        title: 'Subject scores',
        subject: 'Subject',
        year: 'Academic year',
        program: 'Program',
        college: 'College',
        students: 'Students',
        graded: 'Graded',
        avg: 'Avg score',
        pass: 'Pass rate',
        headers: ['#', 'Student ID', 'Name', 'Program', 'Semester', 'Score', 'Grade', 'Course GPA'],
        allYears: 'All years',
        allPrograms: 'All programs',
      }

  // Title banner
  ws.mergeCells(1, 1, 1, colCount)
  setCell(ws.getCell(1, 1), labels.title, {
    fillArgb: C.navy,
    bold: true,
    color: C.headerText,
    size: 16,
  })
  ws.getRow(1).height = 28

  // Subject subtitle
  const subjectLine = [meta.subjectName, meta.subjectCode ? `(${meta.subjectCode})` : null]
    .filter(Boolean)
    .join(' ')
  ws.mergeCells(2, 1, 2, colCount)
  setCell(ws.getCell(2, 1), subjectLine || '—', {
    fillArgb: C.midBlue,
    bold: true,
    color: C.headerText,
    size: 12,
  })
  ws.getRow(2).height = 22

  // Meta row
  const metaBits = [
    meta.collegeName ? `${labels.college}: ${meta.collegeName}` : null,
    `${labels.year}: ${meta.yearName || labels.allYears}`,
    `${labels.program}: ${meta.programName || labels.allPrograms}`,
  ].filter(Boolean)
  ws.mergeCells(3, 1, 3, colCount)
  setCell(ws.getCell(3, 1), metaBits.join('  ·  '), {
    fillArgb: C.summaryBg,
    color: C.muted,
    size: 10,
  })
  ws.getRow(3).height = 18

  // Gold accent
  ws.mergeCells(4, 1, 4, colCount)
  setCell(ws.getCell(4, 1), '', { fillArgb: C.gold })
  ws.getRow(4).height = 4

  // Stats
  const stats = meta.stats || {}
  const statsCells = [
    [labels.students, stats.students ?? rows.length],
    [labels.graded, stats.graded ?? '—'],
    [
      labels.avg,
      stats.avgScore != null
        ? Number(stats.avgScore) % 1 === 0
          ? String(stats.avgScore)
          : Number(stats.avgScore).toFixed(2)
        : '—',
    ],
    [
      labels.pass,
      stats.passRate != null ? `${Number(stats.passRate).toFixed(0)}%` : '—',
    ],
  ]
  // Row 5 labels, row 6 values — span across columns
  const spans = [2, 2, 2, 2]
  let col = 1
  statsCells.forEach(([lab, val], i) => {
    const span = spans[i]
    const end = Math.min(col + span - 1, colCount)
    if (end > col) ws.mergeCells(5, col, 5, end)
    if (end > col) ws.mergeCells(6, col, 6, end)
    setCell(ws.getCell(5, col), lab, {
      fillArgb: C.summaryBg,
      bold: true,
      color: C.muted,
      size: 9,
    })
    setCell(ws.getCell(6, col), val, {
      fillArgb: C.white,
      bold: true,
      color: C.navy,
      size: 14,
    })
    col = end + 1
  })
  ws.getRow(5).height = 16
  ws.getRow(6).height = 24

  // Spacer
  ws.getRow(7).height = 8

  // Headers
  const headerRow = 8
  labels.headers.forEach((h, i) => {
    setCell(ws.getCell(headerRow, i + 1), h, {
      fillArgb: C.navy,
      bold: true,
      color: C.headerText,
      size: 11,
    })
  })
  ws.getRow(headerRow).height = 22

  // Data
  rows.forEach((r, idx) => {
    const rowNum = headerRow + 1 + idx
    const bg = fillFromScore(r.score)
    const scoreColor = colorFromScore(r.score)
    const values = [
      idx + 1,
      r.studentId ?? '—',
      r.name ?? '—',
      r.program ?? '—',
      r.semester ?? '—',
      r.score != null ? r.score : '—',
      r.letter ?? '—',
      r.gpa != null ? Number(r.gpa) : '—',
    ]
    values.forEach((v, i) => {
      const isScore = i === 5
      const isGpa = i === 7
      setCell(ws.getCell(rowNum, i + 1), v, {
        fillArgb: bg,
        bold: isScore || i === 6,
        color: isScore ? scoreColor : C.text,
        align: i === 2 || i === 3 ? (isArabic ? 'right' : 'left') : 'center',
        numFmt: isGpa && typeof v === 'number' ? '0.00' : undefined,
      })
    })
    ws.getRow(rowNum).height = 20
  })

  ws.columns = [
    { width: 6 },
    { width: 14 },
    { width: 28 },
    { width: 28 },
    { width: 22 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
  ]

  // Legend
  const legendRow = headerRow + rows.length + 2
  ws.mergeCells(legendRow, 1, legendRow, colCount)
  setCell(ws.getCell(legendRow, 1), isArabic
    ? 'تلوين الصفوف: أخضر ≥90  ·  أزرق ≥80  ·  أصفر ≥60  ·  أحمر <60'
    : 'Row colours: green ≥90  ·  blue ≥80  ·  amber ≥60  ·  red <60', {
    fillArgb: C.summaryBg,
    color: C.muted,
    size: 9,
    align: isArabic ? 'right' : 'left',
  })

  const code = (meta.subjectCode || 'subject').replace(/[^\w\-]+/g, '_')
  const outName = filename || `subject-scores-${code}-${stamp()}.xlsx`
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = outName
  a.click()
  URL.revokeObjectURL(url)
}
