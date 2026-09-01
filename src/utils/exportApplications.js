import ExcelJS from 'exceljs'
import { supabase } from '../lib/supabase'
import { getLocalizedName } from './localizedName'
import { getNationalityLabel, nationalityMatchesFilter } from './nationalities'
import { formatGenderLabel } from './formatGenderLabel'

const PENDING_CODES = ['APSB', 'APPN', 'RVQU', 'RVIN', 'DCPN', 'ENPN']
const ACCEPTED_CODES = ['DCFA', 'DCCA', 'ENCF', 'ENAC']

const C = {
  navy: 'FF1A3A6B',
  midBlue: 'FF2563EB',
  gold: 'FFC9A84C',
  headerText: 'FFFFFFFF',
  white: 'FFFFFFFF',
  zebra: 'FFF8FAFC',
  summaryBg: 'FFEFF6FF',
  border: 'FFCBD5E1',
  text: 'FF1E293B',
  muted: 'FF64748B',
  pendingBg: 'FFFFFBEB',
  acceptedBg: 'FFECFDF5',
  rejectedBg: 'FFFEF2F2',
  waitlistedBg: 'FFEFF6FF',
}

const BORDER = {
  top: { style: 'thin', color: { argb: C.border } },
  left: { style: 'thin', color: { argb: C.border } },
  bottom: { style: 'thin', color: { argb: C.border } },
  right: { style: 'thin', color: { argb: C.border } },
}

const APPLICATION_EXPORT_SELECT = `
  id,
  application_number,
  first_name,
  middle_name,
  last_name,
  first_name_ar,
  middle_name_ar,
  last_name_ar,
  email,
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
  status_code,
  created_at,
  college_id,
  major_id,
  semester_id,
  academic_year_id,
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
  scholarship_request,
  scholarship_type,
  majors(id, name_en, name_ar, code),
  colleges(id, name_en, name_ar, code),
  semesters(
    id,
    name_en,
    name_ar,
    code,
    academic_year_id,
    academic_years(id, name_en, name_ar, code)
  ),
  academic_years(id, name_en, name_ar, code)
`

function cell(value) {
  if (value == null) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return ''
  return String(value).trim()
}

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toISOString().slice(0, 10)
}

function getAppAcademicYearId(app) {
  if (app.academic_year_id != null || app.academic_years?.id != null) {
    return app.academic_year_id ?? app.academic_years?.id ?? null
  }
  return app.semesters?.academic_year_id ?? app.semesters?.academic_years?.id ?? null
}

function fullName(app, isArabic) {
  const parts = isArabic
    ? [app.first_name_ar, app.middle_name_ar, app.last_name_ar]
    : [app.first_name, app.middle_name, app.last_name]
  const joined = parts.filter(Boolean).join(' ')
  if (joined) return joined
  const fallback = isArabic
    ? [app.first_name, app.middle_name, app.last_name].filter(Boolean).join(' ')
    : [app.first_name_ar, app.middle_name_ar, app.last_name_ar].filter(Boolean).join(' ')
  return fallback || ''
}

function resolveAcademicYear(app, isArabic) {
  if (app.academic_years) {
    return getLocalizedName(app.academic_years, isArabic) || app.academic_years.name_en || app.academic_years.code || ''
  }
  const viaSem = app.semesters?.academic_years
  if (viaSem) {
    return getLocalizedName(viaSem, isArabic) || viaSem.name_en || viaSem.code || ''
  }
  return ''
}

function rowFillForStatus(statusCode) {
  if (ACCEPTED_CODES.includes(statusCode)) return C.acceptedBg
  if (statusCode === 'DCRJ') return C.rejectedBg
  if (statusCode === 'DCWL') return C.waitlistedBg
  if (PENDING_CODES.includes(statusCode)) return C.pendingBg
  return C.white
}

function setCell(cell, value, opts = {}) {
  const {
    fillArgb = C.white,
    bold = false,
    align = 'left',
    color = C.text,
    size = 10,
    numFmt,
  } = opts
  cell.value = value
  cell.font = { size, bold, color: { argb: color } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillArgb } }
  cell.alignment = { vertical: 'middle', horizontal: align, wrapText: true }
  cell.border = BORDER
  if (numFmt) cell.numFmt = numFmt
}

export function getApplicationExportColumnDefs(isArabic, getStatusLabel) {
  const L = (en, ar) => (isArabic ? ar : en)

  return [
    { key: 'application_number', header: L('Application #', 'رقم الطلب'), get: (a) => a.application_number, width: 16 },
    { key: 'full_name', header: L('Full name', 'الاسم الكامل'), get: (a) => fullName(a, isArabic), width: 22 },
    { key: 'first_name', header: L('First name', 'الاسم الأول'), get: (a) => a.first_name, width: 14 },
    { key: 'middle_name', header: L('Middle name', 'اسم الأب'), get: (a) => a.middle_name, width: 14 },
    { key: 'last_name', header: L('Last name', 'اسم العائلة'), get: (a) => a.last_name, width: 14 },
    { key: 'first_name_ar', header: L('First name (AR)', 'الاسم الأول (عربي)'), get: (a) => a.first_name_ar, width: 16 },
    { key: 'middle_name_ar', header: L('Middle name (AR)', 'اسم الأب (عربي)'), get: (a) => a.middle_name_ar, width: 16 },
    { key: 'last_name_ar', header: L('Last name (AR)', 'اسم العائلة (عربي)'), get: (a) => a.last_name_ar, width: 16 },
    { key: 'email', header: L('Email', 'البريد الإلكتروني'), get: (a) => a.email, width: 26 },
    { key: 'phone', header: L('Phone', 'الهاتف'), get: (a) => a.phone, width: 16 },
    { key: 'gender', header: L('Gender', 'الجنس'), get: (a) => formatGenderLabel(a.gender, isArabic), width: 10 },
    { key: 'nationality', header: L('Nationality', 'الجنسية'), get: (a) => getNationalityLabel(a.nationality, isArabic), width: 14 },
    { key: 'date_of_birth', header: L('Date of birth', 'تاريخ الميلاد'), get: (a) => formatDate(a.date_of_birth), width: 12 },
    { key: 'religion', header: L('Religion', 'الديانة'), get: (a) => a.religion, width: 12 },
    { key: 'place_of_birth', header: L('Place of birth', 'مكان الميلاد'), get: (a) => a.place_of_birth, width: 16 },
    { key: 'college', header: L('College', 'الكلية'), get: (a) => (a.colleges ? getLocalizedName(a.colleges, isArabic) || a.colleges.name_en : ''), width: 22 },
    { key: 'major_code', header: L('Major code', 'رمز التخصص'), get: (a) => a.majors?.code || '', width: 12 },
    { key: 'major', header: L('Major', 'التخصص'), get: (a) => (a.majors ? getLocalizedName(a.majors, isArabic) || a.majors.name_en : ''), width: 22 },
    { key: 'academic_year', header: L('Academic year', 'السنة الأكاديمية'), get: (a) => resolveAcademicYear(a, isArabic), width: 18 },
    { key: 'semester', header: L('Semester', 'الفصل'), get: (a) => (a.semesters ? getLocalizedName(a.semesters, isArabic) || a.semesters.name_en || a.semesters.code : ''), width: 18 },
    { key: 'status', header: L('Status', 'الحالة'), get: (a) => (getStatusLabel ? getStatusLabel(a.status_code) : a.status_code), width: 18 },
    { key: 'status_code', header: L('Status code', 'رمز الحالة'), get: (a) => a.status_code, width: 12 },
    { key: 'applied_at', header: L('Applied date', 'تاريخ التقديم'), get: (a) => formatDate(a.created_at), width: 12 },
    { key: 'city', header: L('City', 'المدينة'), get: (a) => a.city, width: 14 },
    { key: 'country', header: L('Country', 'الدولة'), get: (a) => a.country, width: 14 },
    { key: 'high_school_name', header: L('High school', 'المدرسة'), get: (a) => a.high_school_name, width: 20 },
    { key: 'high_school_country', header: L('Certificate country', 'دولة الشهادة'), get: (a) => a.high_school_country, width: 16 },
    { key: 'graduation_year', header: L('Graduation year', 'سنة التخرج'), get: (a) => a.graduation_year, width: 12 },
    { key: 'gpa', header: L('GPA', 'المعدل'), get: (a) => a.gpa, width: 8 },
    { key: 'toefl_score', header: L('TOEFL', 'توفل'), get: (a) => a.toefl_score, width: 8 },
    { key: 'ielts_score', header: L('IELTS', 'آيلتس'), get: (a) => a.ielts_score, width: 8 },
    { key: 'sat_score', header: L('SAT', 'سات'), get: (a) => a.sat_score, width: 8 },
    { key: 'gmat_score', header: L('GMAT', 'جمات'), get: (a) => a.gmat_score, width: 8 },
    { key: 'gre_score', header: L('GRE', 'جري'), get: (a) => a.gre_score, width: 8 },
    { key: 'is_transfer_student', header: L('Transfer student', 'طالب محول'), get: (a) => a.is_transfer_student, width: 12 },
    { key: 'previous_university', header: L('Previous university', 'الجامعة السابقة'), get: (a) => a.previous_university, width: 20 },
    { key: 'scholarship_request', header: L('Scholarship request', 'طلب منحة'), get: (a) => a.scholarship_request, width: 14 },
  ]
}

export function normalizeFilterList(value) {
  if (value == null || value === 'all') return []
  if (Array.isArray(value)) return value.filter((v) => v != null && v !== '').map(String)
  return [String(value)]
}

function matchesFilterList(appValue, filterValue) {
  const selected = normalizeFilterList(filterValue)
  if (!selected.length) return true
  return selected.includes(String(appValue ?? ''))
}

function matchesFilterListWithNone(appValue, filterValue, noneToken = '__none__') {
  const selected = normalizeFilterList(filterValue)
  if (!selected.length) return true
  const hasNone = selected.includes(noneToken)
  const ids = selected.filter((v) => v !== noneToken)
  if (appValue == null || appValue === '') return hasNone
  return ids.includes(String(appValue))
}

function matchesStatusFilter(app, statusFilter) {
  const selected = normalizeFilterList(statusFilter)
  if (!selected.length) return true
  return selected.some((status) => {
    if (status === 'pending') return PENDING_CODES.includes(app.status_code)
    if (status === 'accepted') return ACCEPTED_CODES.includes(app.status_code)
    if (status === 'rejected') return app.status_code === 'DCRJ'
    if (status === 'waitlisted') return app.status_code === 'DCWL'
    if (status === 'pending_requests') return false
    return app.status_code === status
  })
}

export function applyApplicationFilters(
  applications,
  filters,
  { pendingApplicantRequestMap = {}, selectedIds = null } = {},
) {
  let filtered = [...(applications || [])]

  if (filters.college !== undefined || filters.colleges !== undefined) {
    const collegeFilter = filters.colleges ?? filters.college
    filtered = filtered.filter((app) =>
      matchesFilterList(app.college_id ?? app.colleges?.id ?? '', collegeFilter),
    )
  }
  if (filters.major !== undefined || filters.majors !== undefined) {
    const majorFilter = filters.majors ?? filters.major
    filtered = filtered.filter((app) => matchesFilterList(app.major_id ?? app.majors?.id ?? '', majorFilter))
  }
  if (filters.academicYear !== undefined || filters.academicYears !== undefined) {
    const academicYearFilter = filters.academicYears ?? filters.academicYear
    filtered = filtered.filter((app) => matchesFilterListWithNone(getAppAcademicYearId(app), academicYearFilter))
  }
  if (filters.semester !== undefined || filters.semesters !== undefined) {
    const semesterFilter = filters.semesters ?? filters.semester
    filtered = filtered.filter((app) =>
      matchesFilterListWithNone(app.semester_id ?? app.semesters?.id ?? null, semesterFilter),
    )
  }
  if (filters.nationality !== undefined || filters.nationalities !== undefined) {
    const nationalityFilter = filters.nationalities ?? filters.nationality
    const selected = normalizeFilterList(nationalityFilter)
    if (selected.length) {
      filtered = filtered.filter((app) =>
        selected.some((code) => nationalityMatchesFilter(app.nationality, code)),
      )
    }
  }
  if (filters.gender !== undefined || filters.genders !== undefined) {
    const genderFilter = filters.genders ?? filters.gender
    const selected = normalizeFilterList(genderFilter)
    if (selected.length) {
      filtered = filtered.filter((app) => {
        if (selected.includes('__empty__')) {
          if (!String(app.gender ?? '').trim()) return true
        }
        return selected.includes(String(app.gender ?? '').trim())
      })
    }
  }
  if (filters.status !== undefined || filters.statuses !== undefined) {
    const statusFilter = filters.statuses ?? filters.status
    const selected = normalizeFilterList(statusFilter)
    if (selected.length) {
      filtered = filtered.filter((app) =>
        selected.some((status) => {
          if (status === 'pending_requests') {
            return (pendingApplicantRequestMap[String(app.id)] || 0) > 0
          }
          return matchesStatusFilter(app, status)
        }),
      )
    }
  }
  if (filters.search) {
    const q = String(filters.search).toLowerCase()
    filtered = filtered.filter(
      (app) =>
        app.first_name?.toLowerCase().includes(q) ||
        app.last_name?.toLowerCase().includes(q) ||
        app.email?.toLowerCase().includes(q) ||
        app.phone?.includes(q) ||
        app.application_number?.toLowerCase().includes(q),
    )
  }
  if (filters.onlySelected && selectedIds?.size) {
    filtered = filtered.filter((app) => selectedIds.has(app.id))
  }
  return filtered
}

export function buildApplicationExportRows(applications, isArabic, getStatusLabel) {
  const cols = getApplicationExportColumnDefs(isArabic, getStatusLabel)
  const headers = cols.map((c) => c.header)
  const rows = (applications || []).map((app) => cols.map((col) => cell(col.get(app))))
  return { headers, rows, cols }
}

function downloadCsv({ headers, rows, filename }) {
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

async function downloadStyledExcel({ applications, isArabic, getStatusLabel, filterSummary, filename }) {
  const cols = getApplicationExportColumnDefs(isArabic, getStatusLabel)
  const colCount = cols.length
  const wb = new ExcelJS.Workbook()
  wb.creator = 'University Management System'
  wb.created = new Date()

  const ws = wb.addWorksheet(isArabic ? 'الطلبات' : 'Applications', {
    views: [{ state: 'frozen', ySplit: 7, xSplit: 1, rightToLeft: isArabic }],
  })

  const labels = isArabic
    ? {
        title: 'تصدير طلبات القبول',
        filters: 'التصفية',
        total: 'الإجمالي',
        pending: 'قيد الانتظار',
        accepted: 'مقبول',
        rejected: 'مرفوض',
      }
    : {
        title: 'Admissions applications export',
        filters: 'Filters',
        total: 'Total',
        pending: 'Pending',
        accepted: 'Accepted',
        rejected: 'Rejected',
      }

  const stats = {
    total: applications.length,
    pending: applications.filter((a) => PENDING_CODES.includes(a.status_code)).length,
    accepted: applications.filter((a) => ACCEPTED_CODES.includes(a.status_code)).length,
    rejected: applications.filter((a) => a.status_code === 'DCRJ').length,
  }

  ws.mergeCells(1, 1, 1, colCount)
  setCell(ws.getCell(1, 1), labels.title, { fillArgb: C.navy, bold: true, color: C.headerText, size: 14, align: 'center' })
  ws.getRow(1).height = 28

  ws.mergeCells(2, 1, 2, colCount)
  setCell(ws.getCell(2, 1), `${labels.filters}: ${filterSummary || (isArabic ? 'الكل' : 'All')}`, {
    fillArgb: C.summaryBg,
    color: C.midBlue,
    size: 10,
  })
  ws.getRow(2).height = 20

  ws.mergeCells(3, 1, 3, colCount)
  setCell(ws.getCell(3, 1), '', { fillArgb: C.gold })
  ws.getRow(3).height = 4

  const statItems = [
    [labels.total, stats.total],
    [labels.pending, stats.pending],
    [labels.accepted, stats.accepted],
    [labels.rejected, stats.rejected],
  ]
  const span = Math.max(1, Math.floor(colCount / statItems.length))
  statItems.forEach(([lab, val], i) => {
    const start = i * span + 1
    const end = i === statItems.length - 1 ? colCount : Math.min(start + span - 1, colCount)
    if (end > start) ws.mergeCells(4, start, 4, end)
    setCell(ws.getCell(4, start), `${lab}: ${val}`, { fillArgb: C.summaryBg, bold: true, color: C.navy, size: 11, align: 'center' })
  })
  ws.getRow(4).height = 22
  ws.getRow(5).height = 6

  const headerRow = 6
  cols.forEach((col, i) => {
    setCell(ws.getCell(headerRow, i + 1), col.header, {
      fillArgb: C.midBlue,
      bold: true,
      color: C.headerText,
      size: 10,
      align: 'center',
    })
    ws.getColumn(i + 1).width = col.width || 14
  })
  ws.getRow(headerRow).height = 24

  applications.forEach((app, rowIdx) => {
    const excelRow = headerRow + 1 + rowIdx
    const statusFill = rowFillForStatus(app.status_code)
    const zebra = rowIdx % 2 === 1 ? C.zebra : C.white
    cols.forEach((col, colIdx) => {
      const val = cell(col.get(app))
      const isStatusCol = col.key === 'status' || col.key === 'status_code'
      setCell(ws.getCell(excelRow, colIdx + 1), val, {
        fillArgb: isStatusCol ? statusFill : zebra,
        size: 10,
        align: col.key === 'email' || col.key === 'phone' || col.key === 'application_number' ? 'left' : 'left',
      })
    })
    ws.getRow(excelRow).height = 20
  })

  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: headerRow + applications.length, column: colCount },
  }

  const buffer = await wb.xlsx.writeBuffer()
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

export async function fetchApplicationsForExport(applicationIds) {
  const ids = [...new Set((applicationIds || []).filter(Boolean))]
  if (!ids.length) return []

  const rows = []
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80)
    const { data, error } = await supabase
      .from('applications')
      .select(APPLICATION_EXPORT_SELECT)
      .in('id', chunk)
    if (error) throw error
    rows.push(...(data || []))
  }

  const order = new Map(ids.map((id, idx) => [id, idx]))
  return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

export async function exportApplicationsList({
  applicationIds,
  isArabic,
  getStatusLabel,
  format = 'xlsx',
  filterSummary = '',
}) {
  if (!applicationIds?.length) return 0

  const full = await fetchApplicationsForExport(applicationIds)
  const { headers, rows } = buildApplicationExportRows(full, isArabic, getStatusLabel)
  const stamp = new Date().toISOString().slice(0, 10)
  const base = `applications-export-${stamp}`

  if (format === 'csv') {
    downloadCsv({ headers, rows, filename: `${base}.csv` })
  } else {
    await downloadStyledExcel({
      applications: full,
      isArabic,
      getStatusLabel,
      filterSummary,
      filename: `${base}.xlsx`,
    })
  }
  return full.length
}
