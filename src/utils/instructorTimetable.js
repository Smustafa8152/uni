/** Weekly grid for instructor portal (Sun–Sat columns). */

export const TIMETABLE_DAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

const GRAD_CLASSES = ['course-eng', 'course-cs', 'course-math', 'course-bus']

export function normalizeTime(t) {
  if (t == null) return ''
  const s = String(t)
  return s.length >= 5 ? s.slice(0, 5) : s
}

export function formatTimeRangeLabel(start, end) {
  const a = normalizeTime(start)
  const b = normalizeTime(end)
  if (!a || !b) return '—'
  return `${a} – ${b}`
}

export function gradClassForClassId(classId) {
  const n = Number(classId) || 0
  return GRAD_CLASSES[Math.abs(n) % GRAD_CLASSES.length]
}

function durationMinutes(start, end) {
  const a = normalizeTime(start)
  const b = normalizeTime(end)
  const [sh, sm] = a.split(':').map((x) => parseInt(x, 10) || 0)
  const [eh, em] = b.split(':').map((x) => parseInt(x, 10) || 0)
  return Math.max(0, eh * 60 + em - (sh * 60 + sm))
}

/** Sum weekly teaching minutes (each recurring slot counts once). */
export function sumTeachingMinutes(schedules) {
  if (!schedules?.length) return 0
  return schedules.reduce((sum, s) => sum + durationMinutes(s.start_time, s.end_time), 0)
}

/** Weekly teaching hours for one class (from recurring schedule slots). */
export function weeklyTeachingHoursForClass(scheduleRows, classId) {
  const mins = sumTeachingMinutes(schedulesForClass(scheduleRows, classId))
  if (mins <= 0) return null
  return Math.round((mins / 60) * 10) / 10
}

/** Format hours for display (drops trailing .0). */
export function formatTeachingHours(n) {
  if (n === 0 || n === null || n === undefined || Number.isNaN(n)) return '0'
  return Number(n).toFixed(1).replace(/\.0$/, '')
}

export function uniqueLocationsFromSchedules(schedules) {
  const set = new Set()
  for (const s of schedules || []) {
    const loc = (s.location || '').trim()
    if (loc) set.add(loc)
  }
  return set.size
}

/**
 * @param {Array} schedules - Rows from class_schedules with nested classes.subjects
 * @returns {{ slots: Array<{key:string,start:string,end:string,label:string}>, cellMap: Record<string, Array<object>> }}
 */
export function buildInstructorWeekMatrix(schedules) {
  const slotKeys = new Set()
  for (const s of schedules || []) {
    const a = normalizeTime(s.start_time)
    const b = normalizeTime(s.end_time)
    if (a && b) slotKeys.add(`${a}|${b}`)
  }

  const slots = Array.from(slotKeys)
    .map((k) => {
      const [start, end] = k.split('|')
      return {
        key: k,
        start,
        end,
        label: formatTimeRangeLabel(start, end),
      }
    })
    .sort((x, y) => x.start.localeCompare(y.start))

  const cellMap = {}
  for (const s of schedules || []) {
    const start = normalizeTime(s.start_time)
    const end = normalizeTime(s.end_time)
    if (!start || !end) continue
    const key = `${start}|${end}`
    const dayIdx = TIMETABLE_DAY_KEYS.indexOf(s.day_of_week)
    if (dayIdx < 0) continue
    const cellKey = `${key}::${dayIdx}`
    if (!cellMap[cellKey]) cellMap[cellKey] = []
    const cls = s.classes
    const subj = cls?.subjects
    const code = subj ? `${subj.code} — ${cls?.section ?? ''}`.trim() : cls?.code || '—'
    const title = subj ? subj.name_en || subj.name_ar || '' : ''
    const locRaw = (s.location || cls?.location || '').trim()
    const loc = locRaw ? `📍 ${locRaw}` : ''
    cellMap[cellKey].push({
      classId: s.class_id,
      code,
      title,
      loc,
      classType: cls?.type || 'on_campus',
      gradClass: gradClassForClassId(s.class_id),
      joinUrl: s.teams_meeting_url || s.teamsJoinUrl || null,
    })
  }

  return { slots, cellMap }
}

export function buildLegendItems(schedules) {
  const map = new Map()
  for (const s of schedules || []) {
    const subj = s.classes?.subjects
    if (!subj?.code) continue
    if (map.has(subj.code)) continue
    map.set(subj.code, {
      code: subj.code,
      label: `${subj.code} — ${subj.name_en || subj.name_ar || ''}`.trim(),
      gradClass: gradClassForClassId(s.class_id),
    })
  }
  return Array.from(map.values())
}

/** i18n keys under instructorPortal for workload day labels (Sun–Sat). */
export const WORKLOAD_DAY_I18N_KEYS = {
  sunday: 'workloadDaySun',
  monday: 'workloadDayMon',
  tuesday: 'workloadDayTue',
  wednesday: 'workloadDayWed',
  thursday: 'workloadDayThu',
  friday: 'workloadDayFri',
  saturday: 'workloadDaySat',
}

/**
 * @param {Array} scheduleRows - class_schedules joined with classes.subjects
 * @param {string|number} classId
 */
export function schedulesForClass(scheduleRows, classId) {
  if (classId == null) return []
  const id = String(classId)
  return (scheduleRows || []).filter((r) => String(r.class_id) === id)
}

/**
 * One-line summary: "Sunday 10:00–11:30 · Tuesday 10:00–11:30" with localized day names.
 * @param {(key: string) => string} t - i18n `t` from useTranslation
 */
export function formatClassScheduleSummary(scheduleRows, classId, t) {
  const rows = schedulesForClass(scheduleRows, classId)
  if (!rows.length) return ''
  const byDay = {}
  for (const r of rows) {
    const d = String(r.day_of_week || '').toLowerCase()
    if (!TIMETABLE_DAY_KEYS.includes(d)) continue
    if (!byDay[d]) byDay[d] = []
    byDay[d].push(formatTimeRangeLabel(r.start_time, r.end_time))
  }
  const parts = []
  for (const day of TIMETABLE_DAY_KEYS) {
    if (!byDay[day]?.length) continue
    const key = WORKLOAD_DAY_I18N_KEYS[day]
    const label = key ? t(`instructorPortal.${key}`) : day
    const times = [...new Set(byDay[day])].join(', ')
    parts.push(`${label} ${times}`)
  }
  return parts.join(' · ')
}
