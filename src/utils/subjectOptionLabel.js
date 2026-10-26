import { getLocalizedName } from './localizedName'

/** Supabase select fragment for subject picker rows (college + major context). */
export const SUBJECT_OPTION_SELECT = `
  id,
  name_en,
  name_ar,
  code,
  college_id,
  is_university_wide,
  major_id,
  applies_to_all_majors_of_college,
  colleges!subjects_college_id_fkey(name_en, name_ar, code),
  majors!subjects_major_id_majors_id_fk(name_en, name_ar, code),
  subject_majors(majors(name_en, name_ar, code))
`

function formatMajorLine(subject, isRTL) {
  const fromJunction = (subject.subject_majors || [])
    .map((sm) => sm.majors)
    .filter(Boolean)
  const majorNames = fromJunction.map((m) => {
    const mn = getLocalizedName(m, isRTL)
    return m.code ? `${mn} (${m.code})` : mn
  })
  if (majorNames.length > 0) {
    const maxShow = 3
    const shown = majorNames.slice(0, maxShow)
    const rest = majorNames.length - maxShow
    let line = shown.join(isRTL ? '، ' : '; ')
    if (rest > 0) {
      line += ` (+${rest})`
    }
    return line
  }
  if (subject.majors) {
    const m = subject.majors
    const mn = getLocalizedName(m, isRTL)
    return m.code ? `${mn} (${m.code})` : mn
  }
  return ''
}

/**
 * Label for prerequisite/corequisite pickers: code, name, college (or university-wide), majors when known.
 */
export function formatSubjectOptionLabel(subject, isRTL, t) {
  const name = getLocalizedName(subject, isRTL)
  const base = `${subject.code} — ${name}`
  const parts = []

  if (subject.is_university_wide) {
    parts.push(t('subjectsForm.subjectOptionUniversityWide'))
  } else {
    if (subject.colleges) {
      const c = subject.colleges
      const cn = getLocalizedName(c, isRTL)
      parts.push(c.code ? `${cn} (${c.code})` : cn)
    }
    if (subject.applies_to_all_majors_of_college) {
      parts.push(t('subjectsForm.subjectOptionAllMajorsInCollege'))
    } else {
      const majorLine = formatMajorLine(subject, isRTL)
      if (majorLine) parts.push(majorLine)
    }
  }

  if (parts.length === 0) return base
  return `${base} · ${parts.join(' · ')}`
}
