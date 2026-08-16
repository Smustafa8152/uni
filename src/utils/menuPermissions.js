/**
 * Sidebar modules for college staff (role = user).
 * Keys must match `menuKey` on items in Layout.jsx defaultNavigation.
 */

export const MENU_MODULES = [
  { key: 'dashboard', label: 'Dashboard', labelAr: 'لوحة التحكم', always: true },
  { key: 'academicYears', label: 'Academic Years', labelAr: 'السنوات الأكاديمية' },
  { key: 'semesters', label: 'Semesters', labelAr: 'الفصول الدراسية' },
  { key: 'departments', label: 'Departments', labelAr: 'الأقسام' },
  { key: 'majors', label: 'Majors', labelAr: 'التخصصات' },
  { key: 'subjects', label: 'Subjects', labelAr: 'المواد' },
  { key: 'sessions', label: 'Sessions', labelAr: 'الجلسات' },
  { key: 'enrollments', label: 'Enrollments', labelAr: 'التسجيلات' },
  { key: 'students', label: 'Students', labelAr: 'الطلاب' },
  { key: 'instructors', label: 'Instructors', labelAr: 'المدرسون' },
  { key: 'schedule', label: 'Schedule', labelAr: 'الجدول' },
  { key: 'examinations', label: 'Examinations', labelAr: 'الاختبارات' },
  { key: 'attendance', label: 'Attendance', labelAr: 'الحضور' },
  { key: 'gradingManagement', label: 'Grading', labelAr: 'الدرجات' },
  { key: 'financeAffairs', label: 'Finance', labelAr: 'الشؤون المالية' },
  { key: 'admissions', label: 'Admissions', labelAr: 'القبول' },
  { key: 'studentRequests', label: 'Student Requests', labelAr: 'طلبات الطلاب' },
  { key: 'settings', label: 'Settings', labelAr: 'الإعدادات' },
]

export const MENU_MODULE_KEYS = MENU_MODULES.map((m) => m.key)

const ACADEMIC_KEYS = [
  'dashboard',
  'academicYears',
  'semesters',
  'departments',
  'majors',
  'subjects',
  'sessions',
  'enrollments',
  'schedule',
  'settings',
]

/** Quick role-style presets for staff user creation */
export const MENU_PRESETS = [
  {
    id: 'full',
    label: 'Full access',
    labelAr: 'صلاحية كاملة',
    keys: [...MENU_MODULE_KEYS],
  },
  {
    id: 'admissions',
    label: 'Admissions',
    labelAr: 'القبول',
    keys: ['dashboard', 'admissions', 'enrollments', 'students', 'studentRequests', 'settings'],
  },
  {
    id: 'finance',
    label: 'Finance',
    labelAr: 'المالية',
    keys: ['dashboard', 'financeAffairs', 'students', 'settings'],
  },
  {
    id: 'academic',
    label: 'Academic',
    labelAr: 'أكاديمي',
    keys: ACADEMIC_KEYS,
  },
  {
    id: 'grades',
    label: 'Grades',
    labelAr: 'الدرجات',
    keys: ['dashboard', 'gradingManagement', 'students', 'examinations', 'subjects', 'sessions', 'settings'],
  },
  {
    id: 'operations',
    label: 'Operations',
    labelAr: 'العمليات',
    keys: ['dashboard', 'schedule', 'attendance', 'examinations', 'studentRequests', 'students', 'settings'],
  },
]

export function normalizeMenuPermissions(value) {
  if (value == null) return null
  if (Array.isArray(value)) {
    const keys = [...new Set(value.map(String).filter((k) => MENU_MODULE_KEYS.includes(k)))]
    return keys.length ? keys : null
  }
  if (typeof value === 'string') {
    try {
      return normalizeMenuPermissions(JSON.parse(value))
    } catch {
      return null
    }
  }
  return null
}

/** Null/empty permissions = unrestricted (legacy users). */
export function hasFullMenuAccess(permissions) {
  const keys = normalizeMenuPermissions(permissions)
  return !keys || !keys.length
}

export function isMenuModuleAllowed(permissions, menuKey) {
  if (!menuKey) return true
  if (hasFullMenuAccess(permissions)) return true
  const keys = normalizeMenuPermissions(permissions)
  if (keys.includes('dashboard') === false && menuKey === 'dashboard') return true
  return keys.includes(menuKey)
}

export function filterNavByMenuPermissions(navigation, permissions) {
  if (hasFullMenuAccess(permissions)) return navigation || []
  return (navigation || []).filter((item) => isMenuModuleAllowed(permissions, item.menuKey))
}

export function defaultMenuPermissions() {
  return [...MENU_MODULE_KEYS]
}
