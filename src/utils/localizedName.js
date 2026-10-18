/**
 * Returns the localized display name based on current language.
 * When isRTL (Arabic): uses name_ar, fallback to name_en
 * When LTR (English): uses name_en, fallback to name_ar
 *
 * @param {Object} item - Object with name_en and/or name_ar
 * @param {boolean} isRTL - True when language is Arabic
 * @returns {string} Localized display name
 */
export function getLocalizedName(item, isRTL) {
  if (!item) return ''
  const val = isRTL
    ? (item.name_ar || item.name_en || item.fee_name_ar || item.fee_name_en || item.item_name_ar || item.item_name_en || item.group_name_ar || item.group_name_en)
    : (item.name_en || item.name_ar || item.fee_name_en || item.fee_name_ar || item.item_name_en || item.item_name_ar || item.group_name_en || item.group_name_ar)
  return (val || '').toString().trim()
}

function joinName(parts) {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join(' ')
}

/** A person's name in the page language. Arabic uses the Arabic name, then the Latin name. */
export function getPersonName(person, isArabic) {
  if (!person) return ''
  const english = joinName([person.first_name, person.middle_name, person.last_name]) || String(person.name_en || '').trim()
  const arabic = joinName([person.first_name_ar, person.middle_name_ar, person.last_name_ar]) || String(person.name_ar || '').trim()
  return (isArabic ? arabic || english : english || arabic) || ''
}
