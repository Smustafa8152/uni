/** Majors visible on public registration / admission forms (major_status lifecycle). */
export const MAJOR_STATUS_FOR_APPLICATION_DROPDOWN = ['open_for_admission', 'active']

/** Legacy `status` column: inactive only when the program is fully shut down. */
export function legacyMajorRecordStatus(majorStatus) {
  return ['archived', 'suspended'].includes(majorStatus) ? 'inactive' : 'active'
}

/** True when this major itself is offered, before parent college/department checks. */
export function isMajorOfferedOnRegistrationForm(major) {
  if (!major) return false
  const lifecycle = String(major.major_status || major.status || '').toLowerCase()
  if (!MAJOR_STATUS_FOR_APPLICATION_DROPDOWN.includes(lifecycle)) return false
  return String(major.status || 'active').toLowerCase() !== 'inactive'
}

/**
 * Public registration visibility.
 * inactiveDepartmentIds: Set of department ids that are not active.
 * Pass null when department statuses could not be loaded (do not hide majors for that reason).
 * activeCollegeIds: Set of college ids currently active. College-specific majors outside it are hidden.
 */
export function isMajorOpenForRegistration(major, { activeCollegeIds = null, inactiveDepartmentIds = null } = {}) {
  if (!isMajorOfferedOnRegistrationForm(major)) return false

  if (
    inactiveDepartmentIds &&
    major.department_id != null &&
    inactiveDepartmentIds.has(String(major.department_id))
  ) {
    return false
  }

  if (
    activeCollegeIds &&
    major.college_id != null &&
    !major.is_university_wide &&
    !activeCollegeIds.has(String(major.college_id))
  ) {
    return false
  }

  return true
}

export function filterMajorsForRegistration(majors, context) {
  return (majors || []).filter((major) => isMajorOpenForRegistration(major, context))
}

export function inactiveDepartmentIdSet(departments) {
  return new Set(
    (departments || [])
      .filter((department) => department?.status && String(department.status).toLowerCase() !== 'active')
      .map((department) => String(department.id))
  )
}
