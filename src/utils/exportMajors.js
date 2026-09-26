import * as XLSX from 'xlsx'
import { getLocalizedName } from './localizedName'

function cell(value) {
  if (value == null) return ''
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value).trim()
}

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toISOString().slice(0, 10)
}

function degreeLabel(level, isArabic) {
  const map = {
    diploma: isArabic ? 'دبلوم' : 'Diploma',
    bachelor: isArabic ? 'بكالوريوس' : 'Bachelor',
    master: isArabic ? 'ماجستير' : 'Master',
    phd: isArabic ? 'دكتوراه' : 'PhD',
  }
  return map[level] || level || ''
}

function statusLabel(status, isArabic) {
  const map = {
    active: isArabic ? 'نشط' : 'Active',
    open_for_admission: isArabic ? 'مفتوح للقبول' : 'Open for admission',
    draft: isArabic ? 'مسودة' : 'Draft',
    suspended: isArabic ? 'موقوف' : 'Suspended',
    phasing_out: isArabic ? 'قيد الإيقاف' : 'Teach-out',
    archived: isArabic ? 'مؤرشف' : 'Archived',
  }
  return map[status] || status || ''
}

/**
 * Export majors list currently shown on /academic/majors (respects UI filters).
 */
export function exportMajorsList({ majors = [], majorStats = {}, isArabic = false }) {
  const L = (en, ar) => (isArabic ? ar : en)

  const headers = [
    L('Code', 'الرمز'),
    L('Name (English)', 'الاسم (إنجليزي)'),
    L('Name (Arabic)', 'الاسم (عربي)'),
    L('College', 'الكلية'),
    L('University-wide', 'على مستوى الجامعة'),
    L('Degree level', 'المرحلة الدراسية'),
    L('Degree title (EN)', 'المسمى العلمي (إنجليزي)'),
    L('Degree title (AR)', 'المسمى العلمي (عربي)'),
    L('Status', 'الحالة'),
    L('Total credits', 'إجمالي الساعات'),
    L('Core credits', 'ساعات إجبارية'),
    L('Elective credits', 'ساعات اختيارية'),
    L('Min semesters', 'أدنى فصول'),
    L('Max semesters', 'أقصى فصول'),
    L('Min GPA', 'أدنى معدل'),
    L('Tuition fee', 'الرسوم الدراسية'),
    L('Lab fee', 'رسوم المختبر'),
    L('Registration fee', 'رسوم التسجيل'),
    L('Enrolled students', 'الطلاب المسجلون'),
    L('Near graduation', 'قرب التخرج'),
    L('Degree plan', 'الخطة الدراسية'),
    L('Accreditation body', 'جهة الاعتماد'),
    L('Accreditation date', 'تاريخ الاعتماد'),
    L('Accreditation expiry', 'انتهاء الاعتماد'),
    L('Created at', 'تاريخ الإنشاء'),
  ]

  const rows = majors.map((m) => {
    const stats = majorStats[m.id] || {}
    const collegeName = m.is_university_wide
      ? L('University-wide', 'على مستوى الجامعة')
      : getLocalizedName(m.colleges, isArabic) || m.colleges?.name_en || ''

    return [
      cell(m.code),
      cell(m.name_en),
      cell(m.name_ar),
      cell(collegeName),
      cell(m.is_university_wide),
      cell(degreeLabel(m.degree_level, isArabic)),
      cell(m.degree_title_en),
      cell(m.degree_title_ar),
      cell(statusLabel(m.major_status || m.status, isArabic)),
      cell(m.total_credits),
      cell(m.core_credits),
      cell(m.elective_credits),
      cell(m.min_semesters),
      cell(m.max_semesters),
      cell(m.min_gpa),
      cell(m.tuition_fee),
      cell(m.lab_fee),
      cell(m.registration_fee),
      cell(stats.enrolledCount ?? ''),
      cell(stats.graduatingCount ?? ''),
      cell(stats.degreePlanVersion || ''),
      cell(m.accrediting_body),
      cell(formatDate(m.accreditation_date)),
      cell(formatDate(m.accreditation_expiry)),
      cell(formatDate(m.created_at)),
    ]
  })

  const stamp = new Date().toISOString().slice(0, 10)
  const filename = `majors-export-${stamp}.xlsx`
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = headers.map((h, i) => {
    const maxLen = Math.max(String(h).length, ...rows.map((r) => String(r[i] ?? '').length))
    return { wch: Math.min(Math.max(maxLen + 2, 10), 40) }
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Majors')
  XLSX.writeFile(wb, filename)
  return majors.length
}
