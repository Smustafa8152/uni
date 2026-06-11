import * as XLSX from 'xlsx'

function stamp() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Export CLO alignment / achievement report as Excel.
 * @param {{ subjectCode: string, classSection: string, rows: Array, isArabic?: boolean }} params
 */
export function exportCloAlignmentReport({
  subjectCode,
  classSection,
  rows,
  isArabic = false,
  labels = {},
}) {
  const L = {
    sheet: isArabic ? 'مخرجات التعلم' : 'Learning Outcomes',
    clo: isArabic ? 'رمز المخرج' : 'CLO Code',
    description: isArabic ? 'الوصف' : 'Description',
    lectures: isArabic ? 'المحاضرات المرتبطة' : 'Linked Lectures',
    assessments: isArabic ? 'الاختبارات المرتبطة' : 'Linked Assessments',
    lectureCoverage: isArabic ? 'تغطية المحاضرات %' : 'Lecture Coverage %',
    achievement: isArabic ? 'نسبة الإنجاز %' : 'Achievement %',
    gap: isArabic ? 'فجوة التغطية' : 'Coverage Gap',
    aligned: isArabic ? 'متوافق' : 'Aligned',
    gapNone: isArabic ? 'لا محاضرات ولا اختبارات' : 'No lectures or assessments',
    gapNoLectures: isArabic ? 'لا محاضرات مرتبطة' : 'No linked lectures',
    gapNoAssessments: isArabic ? 'لا اختبارات مرتبطة' : 'No linked assessments',
    gapNotGraded: isArabic ? 'لم يُرصد بعد' : 'Not graded yet',
    gapOk: isArabic ? '—' : '—',
    ...labels,
  }

  const gapLabel = (gap) => {
    if (gap === 'none') return L.gapNone
    if (gap === 'no_lectures') return L.gapNoLectures
    if (gap === 'no_assessments') return L.gapNoAssessments
    if (gap === 'not_graded') return L.gapNotGraded
    return L.gapOk
  }

  const headers = [
    L.clo,
    L.description,
    L.lectures,
    L.assessments,
    L.lectureCoverage,
    L.achievement,
    L.gap,
    L.aligned,
  ]

  const dataRows = (rows || []).map((r) => [
    r.code,
    r.description,
    r.lessonsLinked ?? 0,
    r.assessmentsLinked ?? 0,
    r.lessonCoveragePct ?? 0,
    r.achievementPct != null ? r.achievementPct : '',
    gapLabel(r.gap),
    r.isAligned ? (isArabic ? 'نعم' : 'Yes') : isArabic ? 'لا' : 'No',
  ])

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, L.sheet)

  const code = subjectCode || 'course'
  const section = classSection ? `-sec${classSection}` : ''
  XLSX.writeFile(wb, `${code}${section}-clo-report-${stamp()}.xlsx`)
}
