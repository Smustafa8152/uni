import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'

const UI = {
  p: '#1a3a6b',
  pl: '#2a5298',
  acc: '#c8a84b',
  bg: '#f4f6fb',
  sur: '#ffffff',
  bdr: '#dde3ef',
  txt: '#1e2a3a',
  muted: '#6b7a99',
  ok: '#1a7a4a',
  okBg: '#e6f7ef',
  warn: '#b45309',
  warnBg: '#fef3c7',
  err: '#b91c1c',
  errBg: '#fee2e2',
  info: '#1d4ed8',
  infoBg: '#dbeafe',
  neu: '#4b5563',
  neuBg: '#f3f4f6',
  teams: '#6264a7',
  teamsBg: '#e8e8f5',
}

function startOfWeek(d) {
  const x = new Date(d)
  const day = x.getDay() // 0 sunday
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - day)
  return x
}
function endOfWeek(d) {
  const x = startOfWeek(d)
  x.setDate(x.getDate() + 7)
  return x
}
function fmtDate(d, isArabic) {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString(isArabic ? 'ar-SA' : undefined, { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })
}
function fmtTimeRange(startAt, endAt, isArabic) {
  if (!startAt || !endAt) return '—'
  const a = new Date(startAt)
  const b = new Date(endAt)
  const opts = { hour: 'numeric', minute: '2-digit', hour12: true }
  const locale = isArabic ? 'ar-SA' : 'en-US'
  return `${a.toLocaleTimeString(locale, opts)} – ${b.toLocaleTimeString(locale, opts)}`
}

const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
function dowIndex(dow) {
  const i = DOW.indexOf(String(dow || '').toLowerCase())
  return i >= 0 ? i : 0
}
function parseTimeToMinutes(t) {
  const s = String(t || '').slice(0, 5)
  const [hh, mm] = s.split(':').map((x) => parseInt(x, 10))
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  return hh * 60 + mm
}
function isoDate(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x.toISOString().slice(0, 10)
}
function combineDateTime(dateObj, timeStr) {
  const s = String(timeStr || '').slice(0, 5)
  const [hh, mm] = s.split(':').map((x) => parseInt(x, 10))
  const d = new Date(dateObj)
  d.setHours(Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0, 0, 0)
  return d
}

export default function StudentTeamsSessions() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabic = isRTL || language === 'ar'
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [student, setStudent] = useState(null)
  const [semesterOptions, setSemesterOptions] = useState([])
  const [selectedSemesterId, setSelectedSemesterId] = useState('')
  const [courseOptions, setCourseOptions] = useState([])
  const [courseFilter, setCourseFilter] = useState('')
  const [classesById, setClassesById] = useState({})
  const [schedules, setSchedules] = useState([])
  const [meetings, setMeetings] = useState([])
  const [attendanceByKey, setAttendanceByKey] = useState({})

  useEffect(() => {
    if (!user?.email) return
    const load = async () => {
      try {
        setLoading(true)
        setError('')

        const { data: st, error: stErr } = await supabase
          .from('students')
          .select('id, student_id, name_en, name_ar, email')
          .eq('email', user.email)
          .eq('status', 'active')
          .single()
        if (stErr) throw stErr
        setStudent(st)

        const { data: enrolls, error: eErr } = await supabase
          .from('enrollments')
          .select(
            `
            semester_id,
            class_id,
            status,
            classes(
              id,
              code,
              semester_id,
              room,
              building,
              instructors(name_en, name_ar),
              subjects(id, code, name_en, name_ar),
              class_schedules(id, day_of_week, start_time, end_time, location)
            )
          `,
          )
          .eq('student_id', st.id)
          .eq('status', 'enrolled')
        if (eErr) throw eErr

        const semIds = [...new Set((enrolls || []).map((e) => e.semester_id).filter(Boolean))]
        const cls = (enrolls || []).map((e) => e.classes).filter(Boolean)
        setCourseOptions(cls)
        const map = {}
        cls.forEach((c) => {
          map[String(c.id)] = c
        })
        setClassesById(map)

        if (semIds.length) {
          const { data: sems, error: sErr } = await supabase
            .from('semesters')
            .select('id, name_en, name_ar, start_date')
            .in('id', semIds)
            .order('start_date', { ascending: false })
          if (sErr) throw sErr
          setSemesterOptions(sems || [])
          setSelectedSemesterId(String((sems || [])[0]?.id || ''))
        }
      } catch (e) {
        console.error('StudentTeamsSessions load error:', e)
        setError(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.email])

  useEffect(() => {
    if (!student?.id || !selectedSemesterId) return
    const loadSchedules = async () => {
      try {
        setLoading(true)
        setError('')

        const { data: enrolls, error: eErr } = await supabase
          .from('enrollments')
          .select('class_id')
          .eq('student_id', student.id)
          .eq('semester_id', selectedSemesterId)
          .eq('status', 'enrolled')
        if (eErr) throw eErr
        const classIds = [...new Set((enrolls || []).map((e) => e.class_id).filter(Boolean))]

        if (!classIds.length) {
          setSchedules([])
          setAttendanceByKey({})
          return
        }

        // Load all schedules for enrolled classes (session templates)
        const { data: csRows, error: csErr } = await supabase
          .from('class_schedules')
          .select('id, class_id, day_of_week, start_time, end_time, location, teams_meeting_url')
          .in('class_id', courseFilter ? [Number(courseFilter)] : classIds)
          .order('class_id', { ascending: true })
        if (csErr) throw csErr
        setSchedules(csRows || [])

        // Load instructor-created Teams meetings for this week (real join links)
        const ws = startOfWeek(new Date())
        const we = endOfWeek(new Date())
        const { data: mtgs, error: mErr } = await supabase
          .from('class_teams_meetings')
          .select('id, class_id, meeting_title, meeting_description, meeting_date, meeting_duration_minutes, teams_join_url, is_recurring, is_active')
          .in('class_id', courseFilter ? [Number(courseFilter)] : classIds)
          .eq('is_active', true)
          .gte('meeting_date', ws.toISOString())
          .lt('meeting_date', we.toISOString())
          .order('meeting_date', { ascending: true })
        if (mErr) throw mErr
        setMeetings(mtgs || [])

        // Attendance for current week (by schedule + date)
        const scheduleIds = (csRows || []).map((x) => x.id)
        if (!scheduleIds.length) {
          setAttendanceByKey({})
          return
        }

        const { data: att, error: aErr } = await supabase
          .from('elearning_schedule_attendance')
          .select('class_schedule_id, session_date, status, joined_at, attended_minutes')
          .eq('student_id', student.id)
          .in('class_schedule_id', scheduleIds)
          .gte('session_date', isoDate(ws))
          .lt('session_date', isoDate(we))
        if (aErr) throw aErr
        const map = {}
        ;(att || []).forEach((x) => {
          map[`${x.class_schedule_id}_${x.session_date}`] = x
        })
        setAttendanceByKey(map)
      } catch (e) {
        console.error('loadSchedules error:', e)
        setError(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    }
    loadSchedules()
  }, [student?.id, selectedSemesterId, courseFilter])

  const now = Date.now()
  const occurrences = useMemo(() => {
    const ws = startOfWeek(new Date())
    const meetingByClassDate = {}
    ;(meetings || []).forEach((m) => {
      const d = m?.meeting_date ? isoDate(new Date(m.meeting_date)) : null
      if (!d) return
      const key = `${m.class_id}_${d}`
      if (!meetingByClassDate[key]) meetingByClassDate[key] = []
      meetingByClassDate[key].push(m)
    })
    const list = []
    ;(schedules || []).forEach((sc) => {
      const cls = classesById[String(sc.class_id)]
      if (!cls) return
      const d = new Date(ws)
      d.setDate(d.getDate() + dowIndex(sc.day_of_week))
      const dayIso = isoDate(d)
      const mList = meetingByClassDate[`${sc.class_id}_${dayIso}`] || []
      const meeting = mList.length ? mList[0] : null
      const schedStart = combineDateTime(d, sc.start_time)
      const schedEnd = combineDateTime(d, sc.end_time)
      const startAt = meeting?.meeting_date ? new Date(meeting.meeting_date) : schedStart
      const endAt = meeting?.meeting_date
        ? new Date(new Date(meeting.meeting_date).getTime() + (Number(meeting.meeting_duration_minutes) || 60) * 60 * 1000)
        : schedEnd
      list.push({
        key: `${sc.id}_${dayIso}`,
        class_schedule_id: sc.id,
        session_date: dayIso,
        class_id: sc.class_id,
        day_of_week: sc.day_of_week,
        startAt,
        endAt,
        location: sc.location,
        teams_meeting_url: sc.teams_meeting_url,
        meeting,
        classes: cls,
      })
    })
    return list.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
  }, [schedules, classesById, meetings])

  const liveNow = useMemo(() => {
    return (occurrences || []).find((o) => o.startAt.getTime() <= now && now <= o.endAt.getTime())
  }, [occurrences, now])

  const weekStart = useMemo(() => startOfWeek(new Date()), [])
  const weekEnd = useMemo(() => endOfWeek(new Date()), [])

  const weekSessions = useMemo(() => occurrences || [], [occurrences])

  const stats = useMemo(() => {
    const attended = Object.values(attendanceByKey || {}).filter((a) => String(a.status) === 'attended').length
    const missed = Object.values(attendanceByKey || {}).filter((a) => String(a.status) === 'missed').length
    const learningMinutes = Object.values(attendanceByKey || {}).reduce((sum, a) => sum + (Number(a.attended_minutes) || 0), 0)
    const learningHours = Math.round((learningMinutes / 60) * 10) / 10
    const weekCourses = new Set(weekSessions.map((s) => s.class_id))
    return {
      weekSessions: weekSessions.length,
      weekCourses: weekCourses.size,
      attended,
      missed,
      learningHours,
    }
  }, [attendanceByKey, weekSessions])

  const upcomingThisWeek = useMemo(() => {
    return weekSessions.filter((s) => {
      const a = s?.startAt ? s.startAt.getTime() : 0
      return a > now
    })
  }, [weekSessions, now])

  const titleFor = (o) => {
    if (o?.meeting?.meeting_title) return o.meeting.meeting_title
    const sub = o?.classes?.subjects
    const code = sub?.code || '—'
    const name = getLocalizedName(sub, isArabic) || '—'
    return isArabic ? `جلسة ${code} — ${name}` : `Session ${code} — ${name}`
  }
  const courseNameFor = (cls) => getLocalizedName(cls?.subjects, isArabic) || cls?.subjects?.code || '—'
  const instructorFor = (cls) => getLocalizedName(cls?.instructors, isArabic) || '—'

  const joinSession = async (sess) => {
    if (!student?.id || !sess?.class_schedule_id || !sess?.session_date) return
    try {
      const nowIso = new Date().toISOString()
      await supabase
        .from('elearning_schedule_attendance')
        .upsert(
          {
            class_schedule_id: sess.class_schedule_id,
            session_date: sess.session_date,
            student_id: student.id,
            status: 'attended',
            joined_at: nowIso,
          },
          { onConflict: 'class_schedule_id,session_date,student_id' },
        )
      navigate(`/student/elearning/sessions/${sess.class_schedule_id}/${sess.session_date}/lobby`)
    } catch (e) {
      console.error('joinSession error:', e)
      setError(e?.message || String(e))
    }
  }

  if (loading && !student) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-slate-600 border-t-transparent" />
      </div>
    )
  }

  if (!student) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-6 text-center">
        <p className="text-amber-800">{t('studentPortal.noStudentData', 'No student data found.')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6" dir={isArabic ? 'rtl' : 'ltr'}>
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-2 text-sm" style={{ color: UI.muted }}>
        <Link to="/dashboard" className="hover:underline" style={{ color: UI.muted }}>
          {t('studentPortal.dashboard', 'Dashboard')}
        </Link>
        <span style={{ color: UI.bdr }}>›</span>
        <span className="font-semibold" style={{ color: UI.p }}>
          {t('studentPortal.elearning.teamsSessions', 'Teams sessions')}
        </span>
      </nav>

      {/* Page header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: UI.p }}>
            {t('studentPortal.elearning.liveTeamsSessions', 'Live Teams sessions')}
          </h1>
          <p className="text-sm" style={{ color: UI.muted }}>
            {t('studentPortal.elearning.semesterAllCourses', 'Current semester — all courses')}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="px-3 py-2 rounded-md border text-sm"
            style={{ borderColor: UI.bdr }}
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            aria-label={t('studentPortal.elearning.courseFilter', 'Course filter')}
          >
            <option value="">{t('studentPortal.elearning.allCourses', 'All courses')}</option>
            {courseOptions.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {(c?.subjects?.code || c?.code || '—') + ' — ' + (courseNameFor(c) || '—')}
              </option>
            ))}
          </select>
          {semesterOptions.length > 0 && (
            <select
              className="px-3 py-2 rounded-md border text-sm"
              style={{ borderColor: UI.bdr }}
              value={selectedSemesterId}
              onChange={(e) => setSelectedSemesterId(e.target.value)}
              aria-label={t('studentPortal.elearning.semester', 'Semester')}
            >
              {semesterOptions.map((s) => (
                <option key={s.id} value={String(s.id)}>
                  {getLocalizedName(s, isArabic) || s.name_en || s.name_ar || `#${s.id}`}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: '#fecaca', backgroundColor: UI.errBg, color: UI.err }}>
          {error}
        </div>
      )}

      {/* Live alert */}
      {liveNow && (
        <div className="rounded-xl border px-5 py-4 flex items-start gap-3" style={{ borderColor: UI.teams, backgroundColor: UI.teamsBg, color: UI.teams }}>
          <div className="text-lg">🎥</div>
          <div className="flex-1">
            <div className="font-extrabold">
              {t('studentPortal.elearning.liveNow', 'Live session now!')}
            </div>
            <div className="text-sm" style={{ color: UI.txt }}>
              {((liveNow?.classes?.subjects?.code || liveNow?.classes?.code || '—') + ' ' + courseNameFor(liveNow?.classes))} — {titleFor(liveNow)}
            </div>
          </div>
          {liveNow?.meeting?.teams_join_url || liveNow?.teams_meeting_url ? (
            <a
              className="px-4 py-2 rounded-md font-extrabold text-white"
              style={{ backgroundColor: UI.teams }}
              href={liveNow?.meeting?.teams_join_url || liveNow?.teams_meeting_url}
              target="_blank"
              rel="noreferrer"
            >
              {t('studentPortal.elearning.joinNow', 'Join now')}
            </a>
          ) : (
            <button
              type="button"
              className="px-4 py-2 rounded-md font-extrabold text-white"
              style={{ backgroundColor: UI.teams }}
              onClick={() => joinSession(liveNow)}
            >
              {t('studentPortal.elearning.joinNow', 'Join now')}
            </button>
          )}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border shadow-sm px-5 py-4" style={{ borderColor: UI.bdr, borderTop: `3px solid ${UI.teams}` }}>
          <div className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: UI.muted }}>
            {t('studentPortal.elearning.sessionsThisWeek', 'Sessions this week')}
          </div>
          <div className="text-3xl font-extrabold" style={{ color: UI.p }}>{stats.weekSessions}</div>
          <div className="text-xs" style={{ color: UI.muted }}>
            {t('studentPortal.elearning.coursesCount', { count: stats.weekCourses, defaultValue: '{{count}} courses' })}
          </div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm px-5 py-4" style={{ borderColor: UI.bdr, borderTop: `3px solid ${UI.ok}` }}>
          <div className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: UI.muted }}>
            {t('studentPortal.elearning.attended', 'Attended')}
          </div>
          <div className="text-3xl font-extrabold" style={{ color: UI.p }}>{stats.attended}</div>
          <div className="text-xs" style={{ color: UI.muted }}>
            {t('studentPortal.elearning.attendedOutOf', { attended: stats.attended, total: Math.max(stats.attended + stats.missed, stats.attended), defaultValue: '{{attended}} of {{total}} sessions' })}
          </div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm px-5 py-4" style={{ borderColor: UI.bdr, borderTop: `3px solid ${UI.warn}` }}>
          <div className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: UI.muted }}>
            {t('studentPortal.elearning.missed', 'Missed')}
          </div>
          <div className="text-3xl font-extrabold" style={{ color: UI.p }}>{stats.missed}</div>
          <div className="text-xs" style={{ color: UI.muted }}>{t('studentPortal.elearning.registrationAvailable', 'Registration available')}</div>
        </div>
        <div className="bg-white rounded-xl border shadow-sm px-5 py-4" style={{ borderColor: UI.bdr, borderTop: `3px solid ${UI.info}` }}>
          <div className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: UI.muted }}>
            {t('studentPortal.elearning.learningHours', 'Learning hours')}
          </div>
          <div className="text-3xl font-extrabold" style={{ color: UI.p }}>{stats.learningHours}</div>
          <div className="text-xs" style={{ color: UI.muted }}>{t('studentPortal.elearning.thisSemester', 'This semester')}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b-2 overflow-x-auto" style={{ borderColor: UI.bdr }}>
        <Link
          to="/student/elearning/sessions"
          className="px-5 py-2.5 text-sm font-extrabold border-b-2 -mb-[2px] whitespace-nowrap"
          style={{ borderColor: UI.p, color: UI.p }}
          aria-current="page"
        >
          🔴 {t('studentPortal.elearning.currentUpcoming', 'Current & upcoming')}
        </Link>
        <Link
          to="/student/elearning/sessions/history"
          className="px-5 py-2.5 text-sm font-semibold whitespace-nowrap"
          style={{ color: UI.muted }}
        >
          📼 {t('studentPortal.elearning.previousRecordings', 'Previous recordings')}
        </Link>
      </div>

      {/* Live session card */}
      {liveNow && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: UI.bdr }}>
          <div className="p-5 flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: UI.errBg }}>
              🎥
            </div>
            <div className="flex-1">
              <div className="text-xs font-extrabold uppercase tracking-wide" style={{ color: UI.teams }}>
                {(liveNow?.classes?.subjects?.code || liveNow?.classes?.code || '—') + ' — ' + courseNameFor(liveNow?.classes)}
              </div>
              <div className="text-base font-extrabold" style={{ color: UI.txt }}>{titleFor(liveNow)}</div>
              <div className="text-sm flex flex-wrap gap-3 mt-1" style={{ color: UI.muted }}>
                <span>🕐 {t('studentPortal.elearning.startedAt', { defaultValue: 'Started {{time}}', time: liveNow?.startAt ? liveNow.startAt.toLocaleTimeString(isArabic ? 'ar-SA' : undefined, { hour: '2-digit', minute: '2-digit' }) : '—' })}</span>
                <span>👥 {t('studentPortal.elearning.attendingCount', { defaultValue: 'Attendance tracked', count: 0 })}</span>
                <span className="font-extrabold" style={{ color: UI.err }}>• {t('studentPortal.elearning.liveNowLabel', 'Live now')}</span>
              </div>
            </div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold" style={{ backgroundColor: UI.okBg, color: UI.ok }}>
              {t('studentPortal.elearning.live', 'Live')}
            </span>
          </div>
          <div className="px-5 py-4 flex flex-wrap items-center justify-between gap-3" style={{ backgroundColor: UI.bg, borderTop: `1px solid ${UI.bdr}` }}>
            <div className="text-sm" style={{ color: UI.muted }}>
              {instructorFor(liveNow?.classes)} — {liveNow?.location || [liveNow?.classes?.building, liveNow?.classes?.room].filter(Boolean).join(' ') || t('studentPortal.elearning.online', 'Online')}
            </div>
            <div className="flex gap-2">
              {liveNow?.meeting?.teams_join_url || liveNow?.teams_meeting_url ? (
                <a
                  className="px-4 py-2 rounded-md font-extrabold text-white"
                  style={{ backgroundColor: UI.teams }}
                  href={liveNow?.meeting?.teams_join_url || liveNow?.teams_meeting_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  🎥 {t('studentPortal.elearning.joinTeams', 'Join via Teams')}
                </a>
              ) : (
                <button type="button" className="px-4 py-2 rounded-md font-extrabold text-white" style={{ backgroundColor: UI.teams }} onClick={() => joinSession(liveNow)}>
                  🎥 {t('studentPortal.elearning.joinTeams', 'Join via Teams')}
                </button>
              )}
              <Link to={`/student/elearning/sessions/${liveNow.class_schedule_id}/${liveNow.session_date}/lobby`} className="px-3 py-2 rounded-md border text-sm font-semibold" style={{ borderColor: UI.bdr, backgroundColor: UI.bg, color: UI.txt }}>
                📖 {t('studentPortal.elearning.sessionMaterials', 'Session materials')}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming list */}
      <div className="bg-white rounded-xl border shadow-sm p-6" style={{ borderColor: UI.bdr }}>
        <div className="flex items-center justify-between pb-4 mb-4 border-b" style={{ borderColor: UI.bdr }}>
          <div className="text-base font-extrabold" style={{ color: UI.p }}>
            📅 {t('studentPortal.elearning.upcomingThisWeek', 'Upcoming sessions this week')}
          </div>
        </div>

        {loading ? (
          <div className="text-sm" style={{ color: UI.muted }}>{t('common.loading', 'Loading...')}</div>
        ) : upcomingThisWeek.length === 0 ? (
          <div className="text-sm" style={{ color: UI.muted }}>{t('studentPortal.elearning.noUpcoming', 'No upcoming sessions this week.')}</div>
        ) : (
          <div className="divide-y" style={{ borderColor: UI.bdr }}>
            {upcomingThisWeek.map((s) => {
              const joinHref = s?.meeting?.teams_join_url || s?.teams_meeting_url || ''
              return (
              <div key={s.key} className="py-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: UI.teamsBg }}>
                    📹
                  </div>
                  <div>
                    <div className="text-xs font-extrabold uppercase tracking-wide" style={{ color: UI.teams }}>
                      {(s?.classes?.subjects?.code || s?.classes?.code || '—') + ' — ' + courseNameFor(s?.classes)}
                    </div>
                    <div className="text-base font-extrabold" style={{ color: UI.txt }}>{titleFor(s)}</div>
                    <div className="text-sm flex flex-wrap gap-3 mt-1" style={{ color: UI.muted }}>
                      <span>📅 {fmtDate(s.startAt, isArabic)}</span>
                      <span>🕐 {fmtTimeRange(s.startAt, s.endAt, isArabic)}</span>
                      <span>📍 {s.location || t('studentPortal.elearning.online', 'Online')}</span>
                    </div>
                    <div className="text-sm mt-2" style={{ color: UI.muted }}>{instructorFor(s?.classes)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold" style={{ backgroundColor: UI.infoBg, color: UI.info }}>
                    {s?.meeting?.teams_join_url ? t('studentPortal.elearning.meetingScheduled', 'Meeting scheduled') : t('studentPortal.elearning.timetableSlot', 'Timetable slot')}
                  </span>
                  {joinHref ? (
                    <a
                      className="px-4 py-2 rounded-md font-extrabold text-white text-sm"
                      style={{ backgroundColor: UI.teams }}
                      href={joinHref}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      🎥 {t('studentPortal.elearning.joinTeams', 'Join via Teams')}
                    </a>
                  ) : (
                    <span className="text-xs" style={{ color: UI.muted }}>{t('studentPortal.elearning.noJoinLink', 'No meeting link')}</span>
                  )}
                  <button
                    type="button"
                    className="px-3 py-2 rounded-md border text-sm font-semibold"
                    style={{ borderColor: UI.bdr, backgroundColor: UI.bg, color: UI.txt }}
                    onClick={() => navigate(`/student/elearning/sessions/${s.class_schedule_id}/${s.session_date}/lobby`)}
                  >
                    📋 {t('studentPortal.elearning.sessionDetails', 'Session details')}
                  </button>
                </div>
              </div>
              )
            })}
          </div>
        )}
      </div>

      {/* This week list (so KPI matches visible list) */}
      <div className="bg-white rounded-xl border shadow-sm p-6" style={{ borderColor: UI.bdr }}>
        <div className="flex items-center justify-between pb-4 mb-4 border-b" style={{ borderColor: UI.bdr }}>
          <div className="text-base font-extrabold" style={{ color: UI.p }}>
            📆 {t('studentPortal.elearning.sessionsThisWeek', 'Sessions this week')}
          </div>
        </div>

        {loading ? (
          <div className="text-sm" style={{ color: UI.muted }}>{t('common.loading', 'Loading...')}</div>
        ) : weekSessions.length === 0 ? (
          <div className="text-sm" style={{ color: UI.muted }}>{t('common.noData', 'No data found')}</div>
        ) : (
          <div className="divide-y" style={{ borderColor: UI.bdr }}>
            {weekSessions.map((s) => {
              const st = s?.startAt ? s.startAt.getTime() : 0
              const en = s?.endAt ? s.endAt.getTime() : 0
              const status = st && en && now >= st && now <= en ? 'live' : st && now < st ? 'upcoming' : 'ended'
              const badgeBg = status === 'live' ? UI.errBg : status === 'upcoming' ? UI.infoBg : UI.neuBg
              const badgeFg = status === 'live' ? UI.err : status === 'upcoming' ? UI.info : UI.neu
              const joinHref = s?.meeting?.teams_join_url || s?.teams_meeting_url || ''
              return (
                <div key={s.key} className="py-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: UI.teamsBg }}>
                      📹
                    </div>
                    <div>
                      <div className="text-xs font-extrabold uppercase tracking-wide" style={{ color: UI.teams }}>
                        {(s?.classes?.subjects?.code || s?.classes?.code || '—') + ' — ' + courseNameFor(s?.classes)}
                      </div>
                      <div className="text-base font-extrabold" style={{ color: UI.txt }}>{titleFor(s)}</div>
                      <div className="text-sm flex flex-wrap gap-3 mt-1" style={{ color: UI.muted }}>
                        <span>📅 {fmtDate(s.startAt, isArabic)}</span>
                        <span>🕐 {fmtTimeRange(s.startAt, s.endAt, isArabic)}</span>
                        <span>📍 {s.location || t('studentPortal.elearning.online', 'Online')}</span>
                      </div>
                      <div className="text-sm mt-2" style={{ color: UI.muted }}>{instructorFor(s?.classes)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold" style={{ backgroundColor: badgeBg, color: badgeFg }}>
                      {status === 'live' ? t('studentPortal.elearning.live', 'Live') : status === 'upcoming' ? t('studentPortal.elearning.upcoming', 'Upcoming') : t('studentPortal.elearning.ended', 'Ended')}
                    </span>
                    {joinHref ? (
                      <a className="px-3 py-2 rounded-md font-extrabold text-white text-sm" style={{ backgroundColor: UI.teams }} href={joinHref} target="_blank" rel="noreferrer">
                        🎥 {t('studentPortal.elearning.joinTeams', 'Join via Teams')}
                      </a>
                    ) : (
                      <span className="text-xs" style={{ color: UI.muted }}>{t('studentPortal.elearning.noJoinLink', 'No meeting link')}</span>
                    )}
                    <button
                      type="button"
                      className="px-3 py-2 rounded-md border text-sm font-semibold"
                      style={{ borderColor: UI.bdr, backgroundColor: UI.bg, color: UI.txt }}
                      onClick={() => navigate(`/student/elearning/sessions/${s.class_schedule_id}/${s.session_date}/lobby`)}
                    >
                      📋 {t('studentPortal.elearning.sessionDetails', 'Session details')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

