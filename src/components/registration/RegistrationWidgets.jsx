import { normalizeTime } from '../../utils/timeFormat'

const DAY_ORDER = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const WORK_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday']

/** Weekday name in the reader's language. 1 January 2023 was a Sunday. */
function dayName(day, language, width = 'long') {
  const index = DAY_ORDER.indexOf(day)
  if (index < 0) return day
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar' : 'en-GB', { weekday: width }).format(new Date(2023, 0, 1 + index))
}

/** "08:00–09:30", always read left to right. */
export function TimeRange({ start, end }) {
  const a = normalizeTime(start)
  const b = normalizeTime(end)
  if (!a) return null
  return (
    <span dir="ltr" className="whitespace-nowrap tabular-nums">
      {a}
      {b ? `–${b}` : ''}
    </span>
  )
}

/** One line for a class's weekly slots: "Sunday 08:00–09:30, Tuesday 08:00–09:30". */
export function ScheduleLine({ schedules, language, empty }) {
  const slots = [...(schedules || [])].sort(
    (a, b) => DAY_ORDER.indexOf(String(a.day_of_week).toLowerCase()) - DAY_ORDER.indexOf(String(b.day_of_week).toLowerCase())
  )
  if (slots.length === 0) return <span>{empty}</span>
  return (
    <span>
      {slots.map((slot, i) => (
        <span key={`${slot.day_of_week}-${slot.start_time}-${i}`}>
          {i > 0 ? (language === 'ar' ? '، ' : ', ') : ''}
          {dayName(String(slot.day_of_week).toLowerCase(), language, 'short')} <TimeRange start={slot.start_time} end={slot.end_time} />
        </span>
      ))}
    </span>
  )
}

/**
 * Registered hours against the semester's limits.
 * The bar runs to the maximum; a tick marks the minimum so the gap is visible at a glance.
 */
export function HoursMeter({ hours, min, max, label, minLabel, message, tone = 'info' }) {
  const safeMax = Math.max(max || 0, 1)
  const fill = Math.min(100, Math.round((hours / safeMax) * 100))
  const minAt = Math.min(100, Math.round(((min || 0) / safeMax) * 100))
  const fillColour = tone === 'warn' ? 'bg-[#c8a84b]' : tone === 'err' ? 'bg-red-600' : 'bg-[#1a3a6b]'
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] font-extrabold text-[#1a3a6b] tabular-nums">{label}</span>
        {min > 0 ? <span className="text-xs font-semibold text-slate-500 tabular-nums">{minLabel}</span> : null}
      </div>
      <div
        className="relative mt-2 h-3 rounded-full bg-[#dde3ef]"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={hours}
        aria-label={label}
      >
        <div className={`h-full rounded-full transition-[width] duration-500 ${fillColour}`} style={{ width: `${fill}%` }} />
        {min > 0 && minAt < 100 ? (
          <span
            className="absolute -top-1 h-5 w-0.5 rounded-full bg-[#12284c]"
            style={{ insetInlineStart: `calc(${minAt}% - 1px)` }}
            aria-hidden="true"
          />
        ) : null}
      </div>
      {message ? <p className="mt-2 text-sm text-slate-600">{message}</p> : null}
    </div>
  )
}

/**
 * The student's week as a compact agenda: one column per teaching day, classes in time order.
 * Friday and Saturday only appear when something is scheduled on them.
 */
export function WeekStrip({ classes, language, emptyText }) {
  const byDay = new Map()
  for (const cls of classes || []) {
    for (const slot of cls.class_schedules || []) {
      const day = String(slot.day_of_week || '').toLowerCase()
      if (!DAY_ORDER.includes(day)) continue
      if (!byDay.has(day)) byDay.set(day, [])
      byDay.get(day).push({ code: cls.subjects?.code || cls.code, start: slot.start_time, end: slot.end_time, key: `${cls.id}-${slot.start_time}` })
    }
  }
  if (byDay.size === 0) {
    return <p className="rounded-xl border border-dashed border-[#c3cee3] px-4 py-5 text-center text-sm text-slate-500">{emptyText}</p>
  }
  const days = DAY_ORDER.filter((day) => WORK_WEEK.includes(day) || byDay.has(day))
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[520px] gap-2" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
        {days.map((day) => {
          const slots = (byDay.get(day) || []).sort((a, b) => String(a.start).localeCompare(String(b.start)))
          return (
            <div key={day} className="rounded-xl bg-[#eef2f9]/70 p-2">
              <div className="px-1 pb-1.5 text-xs font-bold text-slate-500">{dayName(day, language)}</div>
              <div className="space-y-1.5">
                {slots.length === 0 ? (
                  <div className="h-9 rounded-lg border border-dashed border-[#dde3ef]" aria-hidden="true" />
                ) : (
                  slots.map((slot) => (
                    <div key={slot.key} className="rounded-lg border-s-[3px] border-[#c8a84b] bg-white px-2 py-1.5 shadow-sm">
                      <div className="truncate text-xs font-extrabold text-[#1a3a6b]" dir="ltr">
                        {slot.code}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        <TimeRange start={slot.start} end={slot.end} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
