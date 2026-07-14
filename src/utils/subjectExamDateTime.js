/** Default how long an exam stays enterable once published (availability window). */
export const DEFAULT_AVAILABILITY_HOURS = 24

/** Normalize DB `time` to `HH:mm` for `<input type="datetime-local" />` fragment. */
export function timeToHmFragment(t) {
  if (t == null || t === '') return '09:00'
  const s = String(t)
  return s.length >= 5 ? s.slice(0, 5) : s.padStart(5, '0')
}

function toDatetimeLocalValue(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Resolve absolute availability window.
 * Prefer ISO timestamps stored in assessment_settings (supports multi-day windows).
 * Fall back to scheduled_date + start/end_time (end moves to next day if <= start).
 */
export function resolveExamAvailabilityWindow(exam) {
  const settings = exam?.assessment_settings && typeof exam.assessment_settings === 'object'
    ? exam.assessment_settings
    : {}

  if (settings.window_start_at || settings.window_end_at) {
    const start = settings.window_start_at ? new Date(settings.window_start_at) : null
    const end = settings.window_end_at ? new Date(settings.window_end_at) : null
    return {
      start: start && !Number.isNaN(start.getTime()) ? start : null,
      end: end && !Number.isNaN(end.getTime()) ? end : null,
    }
  }

  if (!exam?.scheduled_date || !exam?.start_time) return { start: null, end: null }
  const d = String(exam.scheduled_date).slice(0, 10)
  const start = new Date(`${d}T${String(exam.start_time).slice(0, 8)}`)
  if (Number.isNaN(start.getTime())) return { start: null, end: null }

  let end = exam.end_time ? new Date(`${d}T${String(exam.end_time).slice(0, 8)}`) : null
  if (end && !Number.isNaN(end.getTime()) && end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
  }
  if (!end || Number.isNaN(end.getTime())) {
    const hours = Number(settings.availability_hours) || DEFAULT_AVAILABILITY_HOURS
    end = new Date(start.getTime() + hours * 60 * 60 * 1000)
  }
  return { start, end }
}

/**
 * Build datetime-local values from exam row (uses stored ISO window when present).
 * @returns {{ start: string, end: string }}
 */
export function examRowToDatetimeLocalValues(scheduled_date, start_time, end_time, assessment_settings = null) {
  const { start, end } = resolveExamAvailabilityWindow({
    scheduled_date,
    start_time,
    end_time,
    assessment_settings,
  })
  if (start || end) {
    return {
      start: start ? toDatetimeLocalValue(start) : '',
      end: end ? toDatetimeLocalValue(end) : '',
    }
  }
  if (!scheduled_date || !start_time) return { start: '', end: '' }
  const d = String(scheduled_date).slice(0, 10)
  const sh = timeToHmFragment(start_time)
  const eh = end_time ? timeToHmFragment(end_time) : sh
  return {
    start: `${d}T${sh}`,
    end: `${d}T${eh}`,
  }
}

/**
 * Map datetime-local strings + attempt duration to DB fields.
 * Availability end defaults to start + 24 hours (not attempt duration).
 * Also returns assessment_settings window patch.
 */
export function datetimeLocalsToExamPayload(startLocal, endLocal, durationMinutes, availabilityHours = DEFAULT_AVAILABILITY_HOURS) {
  const start = startLocal ? new Date(startLocal) : new Date()
  const hours = Math.max(1, Number(availabilityHours) || DEFAULT_AVAILABILITY_HOURS)
  if (Number.isNaN(start.getTime())) {
    const now = new Date()
    const end = new Date(now.getTime() + hours * 60 * 60 * 1000)
    return {
      scheduled_date: now.toISOString().slice(0, 10),
      start_time: now.toTimeString().slice(0, 8),
      end_time: end.toTimeString().slice(0, 8),
      duration_minutes: Math.max(1, Number(durationMinutes) || 90),
      window_start_at: now.toISOString(),
      window_end_at: end.toISOString(),
      availability_hours: hours,
    }
  }
  let end = endLocal ? new Date(endLocal) : new Date(start.getTime() + hours * 60 * 60 * 1000)
  if (Number.isNaN(end.getTime()) || end <= start) {
    end = new Date(start.getTime() + hours * 60 * 60 * 1000)
  }
  return {
    scheduled_date: start.toISOString().slice(0, 10),
    start_time: start.toTimeString().slice(0, 8),
    end_time: end.toTimeString().slice(0, 8),
    duration_minutes: Math.max(1, Number(durationMinutes) || 90),
    window_start_at: start.toISOString(),
    window_end_at: end.toISOString(),
    availability_hours: hours,
  }
}

/** Suggested end datetime-local = start + 24h */
export function defaultEndFromStart(startLocal, hours = DEFAULT_AVAILABILITY_HOURS) {
  if (!startLocal) return ''
  const start = new Date(startLocal)
  if (Number.isNaN(start.getTime())) return ''
  return toDatetimeLocalValue(new Date(start.getTime() + Math.max(1, hours) * 60 * 60 * 1000))
}

export const EXAM_STATUS = {
  DRAFT: 'EX_DRF',
  SCHEDULED: 'EX_SCH',
  PUBLISHED: 'EX_OPN',
}

/** Decide EX_SCH vs EX_OPN from window + now (instructor can still override manually). */
export function resolvePublishStatus(start, end, now = new Date()) {
  const t = now.getTime()
  const startMs = start instanceof Date ? start.getTime() : null
  const endMs = end instanceof Date ? end.getTime() : null
  if (startMs != null && endMs != null && t >= startMs && t <= endMs) return EXAM_STATUS.PUBLISHED
  return EXAM_STATUS.SCHEDULED
}

/**
 * True when "now" is inside the exam availability window.
 * Missing start → treat as already started; missing end → no close yet.
 */
export function isExamWithinAvailabilityWindow(exam, now = new Date()) {
  const { start, end } = resolveExamAvailabilityWindow(exam)
  const t = now instanceof Date ? now.getTime() : new Date(now).getTime()
  if (start && t < start.getTime()) return false
  if (end && t > end.getTime()) return false
  // No resolvable window → only EX_OPN is considered open (legacy rows)
  if (!start && !end) return exam?.status === EXAM_STATUS.PUBLISHED
  return true
}

/**
 * Student may enter when status is scheduled/open AND current time is in the availability window.
 * Scheduled exams open automatically at start time (no manual "Open" required).
 */
export function isExamEnterableForStudent(exam, now = new Date()) {
  if (!exam) return false
  if (exam.status !== EXAM_STATUS.SCHEDULED && exam.status !== EXAM_STATUS.PUBLISHED) return false
  return isExamWithinAvailabilityWindow(exam, now)
}
