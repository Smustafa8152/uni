/**
 * Admin sidebar modules for staff users (restricted admin portal).
 * Keys match `menuKey` on items in Layout.jsx adminNavigation.
 * Legacy college-menu keys are mapped in normalizeMenuPermissions.
 */

export const MENU_MODULES = [
  { key: 'dashboard', label: 'Dashboard', labelAr: 'لوحة التحكم', always: true },
  { key: 'university', label: 'University configuration', labelAr: 'إعدادات الجامعة' },
  { key: 'academic', label: 'Academic configuration', labelAr: 'الإعدادات الأكاديمية' },
  { key: 'admissions', label: 'Admissions', labelAr: 'القبول' },
  { key: 'people', label: 'People', labelAr: 'الأفراد' },
  { key: 'grades', label: 'Grades', labelAr: 'الدرجات' },
  { key: 'finance', label: 'Finance', labelAr: 'الشؤون المالية' },
  { key: 'operations', label: 'Operations', labelAr: 'العمليات' },
]

export const MENU_MODULE_KEYS = MENU_MODULES.map((m) => m.key)

/** Map old college-sidebar keys (+ aliases) → admin menu keys */
const KEY_ALIASES = {
  dashboard: 'dashboard',
  settings: 'university',
  universityConfiguration: 'university',
  university: 'university',
  academicYears: 'academic',
  semesters: 'academic',
  departments: 'academic',
  majors: 'academic',
  subjects: 'academic',
  sessions: 'academic',
  academicConfiguration: 'academic',
  academic: 'academic',
  admissions: 'admissions',
  enrollments: 'admissions',
  admissionsConfiguration: 'admissions',
  students: 'people',
  instructors: 'people',
  people: 'people',
  gradingManagement: 'grades',
  grades: 'grades',
  financeAffairs: 'finance',
  financialAssistance: 'finance',
  finance: 'finance',
  schedule: 'operations',
  attendance: 'operations',
  examinations: 'operations',
  studentRequests: 'operations',
  operations: 'operations',
}

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
    keys: ['dashboard', 'admissions', 'people', 'operations'],
  },
  {
    id: 'finance',
    label: 'Finance',
    labelAr: 'المالية',
    keys: ['dashboard', 'finance', 'people'],
  },
  {
    id: 'academic',
    label: 'Academic',
    labelAr: 'أكاديمي',
    keys: ['dashboard', 'academic', 'people'],
  },
  {
    id: 'grades',
    label: 'Grades',
    labelAr: 'الدرجات',
    keys: ['dashboard', 'grades', 'people', 'academic'],
  },
  {
    id: 'operations',
    label: 'Operations',
    labelAr: 'العمليات',
    keys: ['dashboard', 'operations', 'people'],
  },
]

export function normalizeMenuPermissions(value) {
  if (value == null) return null
  let raw = value
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!Array.isArray(raw)) return null
  const keys = [
    ...new Set(
      raw
        .map(String)
        .map((k) => KEY_ALIASES[k] || k)
        .filter((k) => MENU_MODULE_KEYS.includes(k)),
    ),
  ]
  return keys.length ? keys : null
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
  if (menuKey === 'dashboard') return true
  return keys.includes(menuKey)
}

export function filterNavByMenuPermissions(navigation, permissions) {
  if (hasFullMenuAccess(permissions)) return navigation || []
  return (navigation || []).filter((item) => isMenuModuleAllowed(permissions, item.menuKey))
}

export function defaultMenuPermissions() {
  return [...MENU_MODULE_KEYS]
}

/** Staff without a college use the admin shell with restricted menus. */
export function isAdminPortalStaff(userRole, collegeId) {
  return userRole === 'user' && (collegeId == null || collegeId === '')
}

/** Superadmin or university-wide staff (no college_id) — see all colleges/semesters. */
export function hasUniversityWideScope(userRole, collegeId) {
  return userRole === 'admin' || isAdminPortalStaff(userRole, collegeId)
}

/**
 * Effective college filter for list/create pages.
 * University-wide roles use optional CollegeContext selection (null = all colleges).
 * College-scoped `user` keeps their auth college_id.
 */
export function resolveEffectiveCollegeId(userRole, authCollegeId, selectedCollegeId) {
  if (hasUniversityWideScope(userRole, authCollegeId)) {
    return selectedCollegeId ?? null
  }
  return authCollegeId ?? null
}
