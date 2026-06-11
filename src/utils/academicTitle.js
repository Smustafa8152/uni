import { getLocalizedName } from './localizedName'

/** Select sentinel for free-text academic title in forms. */
export const ACADEMIC_TITLE_CUSTOM = '__custom__'

const PRESETS = [
  { value: '', en: 'None', ar: 'بدون' },
  { value: 'Dr.', en: 'Dr.', ar: 'د.' },
  { value: 'Prof.', en: 'Prof.', ar: 'أ.د.' },
  { value: 'Assoc. Prof.', en: 'Assoc. Prof.', ar: 'أ.م.د.' },
  { value: 'Asst. Prof.', en: 'Asst. Prof.', ar: 'أ.د. مساعد' },
  { value: 'Eng.', en: 'Eng.', ar: 'م.' },
  { value: 'Mr.', en: 'Mr.', ar: 'السيد' },
  { value: 'Mrs.', en: 'Mrs.', ar: 'السيدة' },
  { value: 'Ms.', en: 'Ms.', ar: 'الآنسة' },
]

const ARABIC_PREFIX_BY_VALUE = Object.fromEntries(
  PRESETS.filter((p) => p.value).map((p) => [p.value, p.ar]),
)

export function getAcademicTitlePresetOptions(isArabic = false) {
  const options = PRESETS.map((p) => ({
    value: p.value,
    label: isArabic ? p.ar : p.en,
  }))
  options.push({
    value: ACADEMIC_TITLE_CUSTOM,
    label: isArabic ? 'مخصص…' : 'Custom…',
  })
  return options
}

export function parseAcademicTitleFromStorage(stored) {
  const value = String(stored ?? '').trim()
  if (!value) return { preset: '', custom: '' }
  if (PRESETS.some((p) => p.value === value)) return { preset: value, custom: '' }
  return { preset: ACADEMIC_TITLE_CUSTOM, custom: value }
}

export function resolveAcademicTitleForSave(preset, custom) {
  if (!preset) return null
  if (preset === ACADEMIC_TITLE_CUSTOM) {
    const trimmed = String(custom ?? '').trim()
    return trimmed || null
  }
  return preset
}

export function getAcademicTitleDisplayPrefix(stored, isArabic = false) {
  const value = String(stored ?? '').trim()
  if (!value) return ''
  if (isArabic && ARABIC_PREFIX_BY_VALUE[value]) return ARABIC_PREFIX_BY_VALUE[value]
  return value
}

export function formatNameWithAcademicTitle(name, academicTitle, isArabic = false) {
  const n = String(name ?? '').trim()
  const prefix = getAcademicTitleDisplayPrefix(academicTitle, isArabic)
  if (!n && !prefix) return ''
  if (!prefix) return n
  if (!n) return prefix
  return `${prefix} ${n}`
}

/** Localized instructor/faculty display name with optional academic title prefix. */
export function formatInstructorDisplayName(instructor, isArabic = false) {
  if (!instructor) return ''
  const name = getLocalizedName(instructor, isArabic)
  return formatNameWithAcademicTitle(name, instructor.academic_title, isArabic) || name
}
