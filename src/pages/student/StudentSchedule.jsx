import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { getLocalizedName } from '../../utils/localizedName'
import { getEmailLookupCandidates } from '../../utils/emailLookup'
import { formatTime12h, formatTimeRange12h, normalizeTime } from '../../utils/timeFormat'
import { formatInstructorDisplayName } from '../../utils/academicTitle'
import { supabase } from '../../lib/supabase'
import { Calendar, Printer, Video, ExternalLink, X } from 'lucide-react'

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const DAY_NAMES_EN = { sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday' }
const DAY_NAMES_AR = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس', friday: 'الجمعة', saturday: 'السبت' }
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday']
const COLORS = ['bg-[#1a3a6b]', 'bg-[#2a5298]', 'bg-emerald-700', 'bg-amber-700', 'bg-rose-700']

function downloadIcs(sessions, calendarName) {
  const pad = (n) => String(n).padStart(2, '0')
  const nextDate = (day) => {
    const want = DAYS.indexOf(day)
    const now = new Date()
    const delta = (want - now.getDay() + 7) % 7
    const d = new Date(now)
    d.setDate(now.getDate() + delta)
    return d
  }
  const stamp = (date, time) => {
    const [h, m] = String(time || '00:00').split(':')
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(h)}${pad(m || 0)}00`
  }
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//IBU//Timetable//EN', `X-WR-CALNAME:${calendarName}`]
  sessions.forEach((session, index) => {
    const day = nextDate(session.day)
    lines.push(
      'BEGIN:VEVENT',
      `UID:schedule-${session.scheduleId || index}@ibu`,
      `DTSTART:${stamp(day, session.startTime)}`,
      `DTEND:${stamp(day, session.endTime || session.startTime)}`,
      'RRULE:FREQ=WEEKLY',
      `SUMMARY:${session.code} ${session.name}`,
      `LOCATION:${session.location || ''}`,
      'END:VEVENT',
    )
  })
  lines.push('END:VCALENDAR')
  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'timetable.ics'
  a.click()
  URL.revokeObjectURL(url)
}

export default function StudentSchedule() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(null)
  const [semesters, setSemesters] = useState([])
  const [selectedSemesterId, setSelectedSemesterId] = useState('')
  const [grid, setGrid] = useState({})
  const [courseList, setCourseList] = useState([])
  const [unscheduled, setUnscheduled] = useState([])
  const [timeSlots, setTimeSlots] = useState([])
  const [selectedSession, setSelectedSession] = useState(null)

  const isArabic = isRTL || language === 'ar'

  useEffect(() => {
    if (user?.email) fetchStudent()
  }, [user?.email])

  useEffect(() => {
    if (student?.id && selectedSemesterId) fetchSchedule()
  }, [student?.id, selectedSemesterId])

  const fetchStudent = async () => {
    try {
      const emailCandidates = getEmailLookupCandidates(user.email)
      let query = supabase
        .from('students')
        .select('id, student_id, name_en, name_ar')
        .eq('status', 'active')
      query =
        emailCandidates.length > 1
          ? query.in('email', emailCandidates)
          : query.eq('email', emailCandidates[0] || user.email)
      const { data, error } = await query.maybeSingle()
      if (error || !data) return
      setStudent(data)
      const { data: enrolls } = await supabase.from('enrollments').select('semester_id').eq('student_id', data.id).eq('status', 'enrolled')
      const ids = [...new Set((enrolls || []).map(e => e.semester_id))]
      if (ids.length) {
        const { data: sems } = await supabase.from('semesters').select('id, name_en, name_ar, start_date, end_date').in('id', ids).order('start_date', { ascending: false })
        setSemesters(sems || [])
        if (!selectedSemesterId && sems?.length) setSelectedSemesterId(String(sems[0].id))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const fetchSchedule = async () => {
    if (!student?.id || !selectedSemesterId) return
    setLoading(true)
    try {
      const { data: enrollments, error } = await supabase
        .from('enrollments')
        .select(`
          classes(
            id,
            code,
            subjects(id, code, name_en, name_ar),
            class_schedules(id, day_of_week, start_time, end_time, location, teams_meeting_url),
            room,
            building,
            instructors(name_en, name_ar, academic_title)
          )
        `)
        .eq('student_id', student.id)
        .eq('semester_id', selectedSemesterId)
        .eq('status', 'enrolled')
      if (error) throw error

      const classIds = [...new Set((enrollments || []).map((e) => e.classes?.id).filter(Boolean))]
      const teamsByClass = {}
      if (classIds.length) {
        const { data: meetings } = await supabase
          .from('class_teams_meetings')
          .select('class_id, teams_join_url')
          .in('class_id', classIds)
          .eq('is_active', true)
          .order('meeting_date', { ascending: false })
        ;(meetings || []).forEach((m) => {
          if (m.class_id && m.teams_join_url && !teamsByClass[m.class_id]) {
            teamsByClass[m.class_id] = m.teams_join_url
          }
        })
      }

      const gridMap = {}
      const seen = new Set()
      const list = []
      const waiting = []
      const slotSet = new Set()
      enrollments?.forEach((enr, idx) => {
        const cls = enr.classes
        if (!cls) return
        const sub = cls.subjects
        const code = sub?.code || cls.code || '—'
        const name = getLocalizedName(sub, language === 'ar') || '—'
        const color = COLORS[idx % COLORS.length]
        if (!cls.class_schedules?.length) {
          waiting.push({ code, name })
          return
        }
        cls.class_schedules.forEach(s => {
          const day = String(s.day_of_week || '').toLowerCase()
          if (!DAYS.includes(day)) return
          const startNorm = normalizeTime(s.start_time)
          const endNorm = normalizeTime(s.end_time)
          if (startNorm) slotSet.add(startNorm)
          const key = `${day}_${startNorm}`
          if (!gridMap[key]) gridMap[key] = []
          const joinUrl = s.teams_meeting_url || teamsByClass[cls.id] || null
          gridMap[key].push({
            classId: cls.id,
            scheduleId: s.id,
            code,
            name,
            day,
            dayLabel: isArabic ? DAY_NAMES_AR[day] : DAY_NAMES_EN[day],
            location: s.location || [cls.building, cls.room].filter(Boolean).join(' ') || '—',
            instructor: formatInstructorDisplayName(cls.instructors, language === 'ar') || '—',
            startTime: startNorm,
            endTime: endNorm,
            joinUrl,
            color,
          })
          const listKey = `${code}-${name}`
          if (!seen.has(listKey)) {
            seen.add(listKey)
            list.push({ code, name, color })
          }
        })
      })
      setTimeSlots([...slotSet].sort())
      setGrid(gridMap)
      setCourseList(list)
      setUnscheduled(waiting)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const currentSemester = semesters.find(s => String(s.id) === selectedSemesterId)
  const displayDays = useMemo(() => {
    const extra = ['friday', 'saturday'].filter((day) =>
      timeSlots.some((slot) => (grid[`${day}_${slot}`] || []).length > 0)
    )
    return [...WEEKDAYS, ...extra]
  }, [timeSlots, grid])
  const sessions = useMemo(
    () => displayDays.flatMap((day) => timeSlots.flatMap((slot) => grid[`${day}_${slot}`] || [])),
    [displayDays, timeSlots, grid]
  )

  const getRowEndTime = (slot) => {
    let maxEnd = ''
    displayDays.forEach((day) => {
      const cells = grid[`${day}_${slot}`] || []
      cells.forEach((c) => {
        if (c.endTime && (!maxEnd || c.endTime > maxEnd)) maxEnd = c.endTime
      })
    })
    if (maxEnd) return maxEnd
    const idx = timeSlots.indexOf(slot)
    return idx >= 0 && idx < timeSlots.length - 1 ? timeSlots[idx + 1] : null
  }

  const rowTimeLabels = useMemo(() => {
    const labels = {}
    timeSlots.forEach((slot) => {
      const end = getRowEndTime(slot)
      labels[slot] = end
        ? formatTimeRange12h(slot, end, isArabic)
        : formatTime12h(slot, isArabic)
    })
    return labels
  }, [timeSlots, grid, isArabic])

  if (loading && !student) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-slate-600 border-t-transparent" />
      </div>
    )
  }

  const studentName = student ? getLocalizedName(student, language === 'ar') : ''

  return (
    <div className="space-y-6 text-start" dir={isRTL ? 'rtl' : 'ltr'}>
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-[#6b7a99]">
        <Link to="/" className="hover:text-[#1a3a6b] no-underline">{t('applicantPortal.breadcrumbHome', 'Home')}</Link>
        <span className="text-[#dde3ef]">/</span>
        <Link to="/dashboard" className="hover:text-[#1a3a6b] no-underline">{t('track.studentPortal', 'Student portal')}</Link>
        <span className="text-[#dde3ef]">/</span>
        <span className="font-semibold text-[#1a3a6b]">{t('studentPortal.weeklySchedule', 'Weekly schedule')}</span>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1a3a6b]">{t('studentPortal.weeklySchedule', 'Weekly schedule')}</h1>
          <p className="mt-1 text-sm text-[#6b7a99]">
            {[currentSemester ? getLocalizedName(currentSemester, language === 'ar') : '', studentName].filter(Boolean).join(' · ') || studentName}
          </p>
        </div>
        {sessions.length > 0 && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => downloadIcs(sessions, t('studentPortal.weeklySchedule', 'Weekly schedule'))}
              className="inline-flex items-center gap-2 rounded-lg border border-[#dde3ef] bg-white px-4 py-2 text-sm font-bold text-[#1e2a3a] hover:bg-[#f4f6fb]"
            >
              <Calendar className="h-4 w-4" />
              {t('studentPortal.icsExport', 'ICS Export')}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-lg border border-[#dde3ef] bg-white px-4 py-2 text-sm font-bold text-[#1e2a3a] hover:bg-[#f4f6fb]"
            >
              <Printer className="h-4 w-4" />
              {t('common.print', 'Print')}
            </button>
          </div>
        )}
      </div>

      {semesters.length > 1 && (
        <select
          value={selectedSemesterId}
          onChange={(e) => setSelectedSemesterId(e.target.value)}
          className="rounded-xl border border-[#dde3ef] bg-white px-4 py-2 text-sm text-[#1e2a3a]"
        >
          {semesters.map((s) => (
            <option key={s.id} value={s.id}>{getLocalizedName(s, language === 'ar')}</option>
          ))}
        </select>
      )}

      {sessions.length === 0 ? (
        <section className="rounded-2xl border border-[#dde3ef] bg-white px-6 py-12 text-center shadow-sm">
          <Calendar className="mx-auto h-10 w-10 text-[#1a3a6b]" />
          <h2 className="mt-4 text-lg font-extrabold text-[#1a3a6b]">{t('studentPortal.scheduleEmptyTitle')}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[#6b7a99]">{t('studentPortal.scheduleEmptyHint')}</p>
          <Link
            to="/student/enroll"
            className="mt-5 inline-flex items-center justify-center rounded-lg bg-[#1a3a6b] px-5 py-2.5 text-sm font-bold text-white no-underline hover:bg-[#2a5298]"
          >
            {t('studentPortal.scheduleGoRegister')}
          </Link>
          {unscheduled.length > 0 && (
            <ul className="mx-auto mt-6 max-w-md space-y-2 text-start">
              {unscheduled.map((course) => (
                <li key={course.code} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
                  <span className="font-bold text-[#1e2a3a]" dir="ltr">{course.code}</span>
                  <span className="mt-0.5 block text-[#6b7a99]">{course.name}</span>
                  <span className="mt-1 block text-xs font-semibold text-amber-900">{t('studentPortal.scheduleNoTime')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
      <div className="overflow-hidden rounded-2xl border border-[#dde3ef] bg-white shadow-sm">
        <div className={`overflow-x-auto ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
          <table className="w-full min-w-[700px] border-collapse" dir={isRTL ? 'rtl' : 'ltr'}>
            <thead>
              <tr>
                <th className="w-28 bg-[#1a3a6b] px-3 py-3 text-start text-sm font-semibold text-white">{t('studentPortal.time', 'Time')}</th>
                {displayDays.map((day) => (
                  <th key={day} className="bg-[#1a3a6b] px-2 py-3 text-start text-sm font-semibold text-white">
                    {language === 'ar' ? DAY_NAMES_AR[day] : DAY_NAMES_EN[day]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((slot) => (
                <tr key={slot} className="border-b border-slate-100">
                  <td className="whitespace-nowrap bg-slate-50 px-3 py-2 text-start align-top text-sm font-medium text-slate-600" dir="ltr">
                    {rowTimeLabels[slot] || formatTime12h(slot, isArabic)}
                  </td>
                  {displayDays.map((day) => {
                    const key = `${day}_${slot}`
                    const cells = grid[key] || []
                    return (
                      <td key={day} className="min-w-[120px] border-s border-slate-100 p-1.5 align-top text-start">
                        {cells.length === 0 ? (
                          <span className="block min-h-8" />
                        ) : (
                          <div className="space-y-1 text-start">
                            {cells.map((c, i) => (
                              <button
                                key={`${c.scheduleId || c.code}-${i}`}
                                type="button"
                                onClick={() => setSelectedSession(c)}
                                className={`w-full cursor-pointer rounded-lg p-2.5 text-start text-xs text-white shadow-sm transition-transform hover:scale-[1.02] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-white/60 ${c.color} ${c.joinUrl ? '' : 'opacity-95'}`}
                                title={c.joinUrl ? t('classes.joinTeamsMeeting', 'Join Teams Meeting') : t('classes.noTeamsLink', 'No Teams link yet')}
                              >
                                <p className="font-semibold">{c.code}</p>
                                <p className="opacity-95 truncate mt-0.5">{c.name}</p>
                                <p className="opacity-90 mt-1 text-[11px]">
                                  {formatTimeRange12h(c.startTime, c.endTime, isArabic)}
                                </p>
                                <p className="opacity-90 text-[11px]">{c.location}</p>
                                {c.joinUrl && (
                                  <p className="opacity-80 mt-1.5 text-[10px] font-semibold underline underline-offset-2">
                                    {t('studentPortal.elearning.joinTeams', 'Join via Teams')}
                                  </p>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {courseList.length > 0 && (
          <div className="flex flex-wrap gap-4 border-t border-[#dde3ef] bg-[#f7f9fd] p-4">
            {courseList.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={`w-4 h-4 rounded flex-shrink-0 ${c.color}`} />
                <span className="text-sm text-slate-700">{c.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      {selectedSession && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => setSelectedSession(null)}
          role="presentation"
        >
          <div
            className={`bg-white rounded-2xl shadow-xl max-w-md w-full p-6 ${isRTL ? 'text-right' : 'text-left'}`}
            dir={isRTL ? 'rtl' : 'ltr'}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-modal-title"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 id="session-modal-title" className="text-lg font-bold text-slate-900">
                  {selectedSession.code} — {selectedSession.name}
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                  {selectedSession.dayLabel} · {formatTimeRange12h(selectedSession.startTime, selectedSession.endTime, isArabic)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSession(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                aria-label={t('common.close', 'Close')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <dl className="space-y-2 text-sm mb-5">
              <div className="flex gap-2">
                <dt className="text-slate-500 shrink-0">{t('studentPortal.time', 'Time')}:</dt>
                <dd className="font-medium text-slate-800">
                  {formatTimeRange12h(selectedSession.startTime, selectedSession.endTime, isArabic)}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500 shrink-0">{t('classes.location', 'Location')}:</dt>
                <dd className="font-medium text-slate-800">{selectedSession.location}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-slate-500 shrink-0">{t('classes.instructor', 'Instructor')}:</dt>
                <dd className="font-medium text-slate-800">{selectedSession.instructor}</dd>
              </div>
            </dl>

            {selectedSession.joinUrl ? (
              <a
                href={selectedSession.joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#1a3a6b] px-4 py-3 font-semibold text-white hover:bg-[#2a5298]"
              >
                <Video className="w-5 h-5" />
                {t('classes.joinTeamsMeeting', 'Join Teams Meeting')}
                <ExternalLink className="w-4 h-4 opacity-80" />
              </a>
            ) : (
              <p className="text-sm text-slate-500 text-center py-2">
                {t('studentPortal.elearning.noJoinLink', 'No meeting link')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
