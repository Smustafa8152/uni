/** Default how long an exam stays enterable once published (availability window). */
export const DEFAULT_AVAILABILITY_HOURS = 24

/** Normalize DB `time` to `HH:mm` for `<input type="datetime-local" />` fragment. */
export function timeToHmFragment(t) {
  if (t == null || t === '') return '09:00'
  const s = String(t)
  return s.length >= 5 ? s.slice(0, 5) : s.padStart(5, '0')
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

/** Calendar date in the browser's local timezone (NOT UTC). */
export function toLocalYmd(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function toLocalHms(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

function toDatetimeLocalValue(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  return `${toLocalYmd(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/**
 * Parse a date-only string (YYYY-MM-DD) as a local calendar date.
 * Avoids `new Date('YYYY-MM-DD')` which is treated as UTC midnight.
 */
export function parseLocalDateOnly(dateStr) {
  if (!dateStr) return null
  const s = String(dateStr).slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Combine local date + time columns into a Date in local timezone. */
export function combineLocalDateTime(dateStr, timeStr) {
  if (!dateStr) return null
  const day = parseLocalDateOnly(dateStr)
  if (!day) return null
  const t = String(timeStr || '00:00:00').slice(0, 8)
  const [hh = '0', mm = '0', ss = '0'] = t.split(':')
  day.setHours(Number(hh) || 0, Number(mm) || 0, Number(ss) || 0, 0)
  return day
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
  const start = combineLocalDateTime(exam.scheduled_date, exam.start_time)
  if (!start) return { start: null, end: null }

  let end = exam.end_time ? combineLocalDateTime(exam.scheduled_date, exam.end_time) : null
  if (end && end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000)
  }
  if (!end) {
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
/**
 * Parse `<input type="datetime-local" />` value as local wall-clock time.
 * Avoid relying on Date parsing quirks across browsers.
 */
export function parseDatetimeLocal(value) {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(value).trim())
  if (!m) {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6] || 0),
    0,
  )
  return Number.isNaN(d.getTime()) ? null : d
}

export function datetimeLocalsToExamPayload(startLocal, endLocal, durationMinutes, availabilityHours = DEFAULT_AVAILABILITY_HOURS) {
  const hours = Math.max(1, Number(availabilityHours) || DEFAULT_AVAILABILITY_HOURS)
  let start = parseDatetimeLocal(startLocal) || new Date()
  if (Number.isNaN(start.getTime())) start = new Date()

  let end = parseDatetimeLocal(endLocal)
  if (!end || Number.isNaN(end.getTime()) || end <= start) {
    end = new Date(start.getTime() + hours * 60 * 60 * 1000)
  }

  // scheduled_date/start_time/end_time must be LOCAL calendar parts (what the instructor typed).
  // window_* stay as absolute ISO for countdown / enter checks across timezones.
  return {
    scheduled_date: toLocalYmd(start),
    start_time: toLocalHms(start),
    end_time: toLocalHms(end),
    duration_minutes: Math.max(1, Number(durationMinutes) || 90),
    window_start_at: start.toISOString(),
    window_end_at: end.toISOString(),
    availability_hours: hours,
  }
}

/** Suggested end datetime-local = start + 24h */
export function defaultEndFromStart(startLocal, hours = DEFAULT_AVAILABILITY_HOURS) {
  if (!startLocal) return ''
  const start = parseDatetimeLocal(startLocal)
  if (!start) return ''
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

/** True when the student's attempt is already finalized (cannot keep answering). */
export function isExamSubmissionComplete(submission) {
  if (!submission) return false
  if (submission.status === 'EX_SUB' || submission.status === 'EX_GRD') return true
  const data = submission.submission_data
  return !!(data && (data.submitted === true || data.autoGrade))
}

/**
 * Whether the student may start/continue answering.
 * Default max_attempts = 1 → one submission and done.
 * Instructor/admin re-exam resets the row to EX_DRF (see reset_exam_submission_for_retake).
 */
export function canStudentAttemptExam(exam, submission, now = new Date()) {
  if (!isExamEnterableForStudent(exam, now)) return false
  if (!isExamSubmissionComplete(submission)) return true

  const settings =
    exam?.assessment_settings && typeof exam.assessment_settings === 'object'
      ? exam.assessment_settings
      : {}
  const maxAttempts = Math.max(1, Number(settings.max_attempts) || 1)
  const used = Math.max(
    1,
    Number(submission?.submission_data?.attempt_count) ||
      Number(submission?.attempt_count) ||
      1,
  )
  // Unique (exam_id, student_id) → one row; retakes only when max_attempts > used
  return used < maxAttempts
}
