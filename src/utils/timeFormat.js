export function normalizeTime(t) {
  if (t == null || t === '') return ''
  const s = String(t)
  return s.length >= 5 ? s.slice(0, 5) : s
}

function parseTimeToDate(hm) {
  const norm = normalizeTime(hm)
  if (!norm) return null
  const [h, m] = norm.split(':').map((x) => parseInt(x, 10) || 0)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

export function formatTime12h(time, isArabic) {
  const d = parseTimeToDate(time)
  if (!d) return '—'
  return d.toLocaleTimeString(isArabic ? 'ar-SA' : 'en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatTimeRange12h(start, end, isArabic) {
  const a = formatTime12h(start, isArabic)
  const b = formatTime12h(end, isArabic)
  if (a === '—') return '—'
  if (b === '—') return a
  return `${a} – ${b}`
}
