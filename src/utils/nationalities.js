/** ISO 3166-1 alpha-2 country codes for nationality storage. */
export const ISO_COUNTRY_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AR', 'AS', 'AT', 'AU', 'AW', 'AX', 'AZ',
  'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI', 'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BW', 'BY', 'BZ',
  'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN', 'CO', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ',
  'DE', 'DJ', 'DK', 'DM', 'DO', 'DZ',
  'EC', 'EE', 'EG', 'ER', 'ES', 'ET',
  'FI', 'FJ', 'FK', 'FM', 'FO', 'FR',
  'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI', 'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GT', 'GU', 'GW', 'GY',
  'HK', 'HN', 'HR', 'HT', 'HU',
  'ID', 'IE', 'IM', 'IN', 'IQ', 'IR', 'IS', 'IT',
  'JE', 'JM', 'JO', 'JP',
  'KE', 'KG', 'KH', 'KI', 'KM', 'KN', 'KP', 'KR', 'KW', 'KY', 'KZ',
  'LA', 'LB', 'LC', 'LI', 'LK', 'LR', 'LS', 'LT', 'LU', 'LV', 'LY',
  'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH', 'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV', 'MW', 'MX', 'MY', 'MZ',
  'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO', 'NP', 'NR', 'NU', 'NZ',
  'OM',
  'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL', 'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY',
  'QA',
  'RE', 'RO', 'RS', 'RU', 'RW',
  'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL', 'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ',
  'TC', 'TD', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV', 'TW', 'TZ',
  'UA', 'UG', 'US', 'UY', 'UZ',
  'VA', 'VC', 'VE', 'VG', 'VI', 'VN', 'VU',
  'WF', 'WS',
  'YE', 'YT',
  'ZA', 'ZM', 'ZW',
]

const CODE_SET = new Set(ISO_COUNTRY_CODES)

/** Common free-text / Arabic variants from legacy data → ISO code */
const NATIONALITY_ALIASES = {
  filipino: 'PH',
  philippines: 'PH',
  philippine: 'PH',
  gambian: 'GM',
  gambia: 'GM',
  غامبيا: 'GM',
  nigeria: 'NG',
  nigerian: 'NG',
  nigéria: 'NG',
  nigería: 'NG',
  نجيري: 'NG',
  نيجيريا: 'NG',
  syria: 'SY',
  syrian: 'SY',
  سوريا: 'SY',
  سوري: 'SY',
  tanzania: 'TZ',
  tanzanian: 'TZ',
  تنزاني: 'TZ',
  تنزانية: 'TZ',
  thai: 'TH',
  thailand: 'TH',
  تايلاند: 'TH',
  تايلاندي: 'TH',
  تايلاندية: 'TH',
  تايلادن: 'TH',
  'الجنسية التايلاندية': 'TH',
  'بان خو': 'TH',
  mali: 'ML',
  مالي: 'ML',
  egypt: 'EG',
  egyptian: 'EG',
  مصر: 'EG',
  مصري: 'EG',
  morocco: 'MA',
  moroccan: 'MA',
  مغربية: 'MA',
  مغربي: 'MA',
  niger: 'NE',
  nigerien: 'NE',
  النيجر: 'NE',
  kuwait: 'KW',
  kuwaiti: 'KW',
  الكويت: 'KW',
  كويت: 'KW',
  كويتي: 'KW',
  كويتية: 'KW',
  saudi: 'SA',
  'saudi arabia': 'SA',
  'المملكة العربية السعودية': 'SA',
  السعودية: 'SA',
  سعودي: 'SA',
  سعودية: 'SA',
  emirati: 'AE',
  uae: 'AE',
  'united arab emirates': 'AE',
  الإمارات: 'AE',
  اماراتي: 'AE',
  bahrain: 'BH',
  البحرين: 'BH',
  qatar: 'QA',
  قطر: 'QA',
  oman: 'OM',
  عمان: 'OM',
  jordan: 'JO',
  الأردن: 'JO',
  lebanon: 'LB',
  لبنان: 'LB',
  iraq: 'IQ',
  العراق: 'IQ',
  yemen: 'YE',
  اليمن: 'YE',
  palestine: 'PS',
  فلسطين: 'PS',
  sudan: 'SD',
  السودان: 'SD',
  india: 'IN',
  indian: 'IN',
  pakistan: 'PK',
  pakistani: 'PK',
  bangladesh: 'BD',
  indonesia: 'ID',
  malaysia: 'MY',
  china: 'CN',
  chinese: 'CN',
  japan: 'JP',
  japanese: 'JP',
  korea: 'KR',
  'south korea': 'KR',
  usa: 'US',
  'united states': 'US',
  american: 'US',
  uk: 'GB',
  'united kingdom': 'GB',
  british: 'GB',
  canada: 'CA',
  canadian: 'CA',
  france: 'FR',
  french: 'FR',
  germany: 'DE',
  german: 'DE',
  italy: 'IT',
  italian: 'IT',
  spain: 'ES',
  spanish: 'ES',
  turkey: 'TR',
  turkish: 'TR',
  iran: 'IR',
  iranian: 'IR',
  afghanistan: 'AF',
  somalia: 'SO',
  ethiopia: 'ET',
  kenya: 'KE',
  senegal: 'SN',
  chad: 'TD',
  tunisia: 'TN',
  algeria: 'DZ',
  libya: 'LY',
  تيسيت: null,
}

function normalizeKey(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function displayNames(locale) {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' })
  } catch {
    return null
  }
}

export function isNationalityCode(value) {
  const c = String(value ?? '').trim().toUpperCase()
  return c.length === 2 && CODE_SET.has(c)
}

/**
 * Map legacy free-text nationality to ISO alpha-2 code (or null if unknown).
 */
export function normalizeNationalityCode(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return null

  const upper = trimmed.toUpperCase()
  if (isNationalityCode(upper)) return upper

  const key = normalizeKey(trimmed)
  if (Object.prototype.hasOwnProperty.call(NATIONALITY_ALIASES, key)) {
    return NATIONALITY_ALIASES[key]
  }

  for (const locale of ['en', 'ar']) {
    const dn = displayNames(locale)
    if (!dn) continue
    for (const code of ISO_COUNTRY_CODES) {
      const label = dn.of(code)
      if (label && normalizeKey(label) === key) return code
    }
  }

  return null
}

export function getNationalityLabel(codeOrRaw, isArabic = false) {
  const trimmed = String(codeOrRaw ?? '').trim()
  if (!trimmed) return '—'

  const code = isNationalityCode(trimmed) ? trimmed.toUpperCase() : normalizeNationalityCode(trimmed)
  if (code) {
    const locale = isArabic ? 'ar' : 'en'
    const dn = displayNames(locale)
    const label = dn?.of(code)
    if (label) return label
  }

  return trimmed
}

export function getNationalityOptions(isArabic = false) {
  const locale = isArabic ? 'ar' : 'en'
  const dn = displayNames(locale)
  const options = ISO_COUNTRY_CODES.map((code) => ({
    code,
    label: dn?.of(code) || code,
  })).filter((o) => o.label)

  options.sort((a, b) => a.label.localeCompare(b.label, locale, { sensitivity: 'base' }))
  return options
}

export function nationalityMatchesFilter(recordNationality, filterCode) {
  if (filterCode === '__empty__') return !String(recordNationality ?? '').trim()
  if (!filterCode || filterCode === 'all') return true
  const stored = String(recordNationality ?? '').trim()
  if (!stored) return false
  const normalized = normalizeNationalityCode(stored) || (isNationalityCode(stored) ? stored.toUpperCase() : null)
  return normalized === filterCode || stored === filterCode
}

export function isKuwaitNationality(codeOrRaw) {
  const code = normalizeNationalityCode(codeOrRaw) || (isNationalityCode(codeOrRaw) ? String(codeOrRaw).toUpperCase() : null)
  return code === 'KW'
}

/** Options for admin filters: canonical list + any legacy values still in data */
export function getNationalityFilterOptions(records, isArabic = false) {
  const canonical = getNationalityOptions(isArabic)
  const usedCodes = new Set()
  let hasEmpty = false

  for (const row of records || []) {
    const raw = row?.nationality
    if (!String(raw ?? '').trim()) {
      hasEmpty = true
      continue
    }
    const code = normalizeNationalityCode(raw) || (isNationalityCode(raw) ? String(raw).toUpperCase() : null)
    if (code) usedCodes.add(code)
  }

  const values = canonical.filter((o) => usedCodes.has(o.code))
  return { values, hasEmpty }
}
