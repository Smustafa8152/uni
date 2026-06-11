import { useState, useEffect, useMemo } from 'react'
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
const DEFAULT_TIME_SLOTS = ['08:00', '09:30', '11:00', '12:30', '14:00', '15:30', '17:00']

const COLORS = ['bg-slate-700', 'bg-blue-600', 'bg-emerald-600', 'bg-amber-600', 'bg-orange-500', 'bg-rose-500']

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
  const [timeSlots, setTimeSlots] = useState(DEFAULT_TIME_SLOTS)
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
      const slotSet = new Set(DEFAULT_TIME_SLOTS)
      enrollments?.forEach((enr, idx) => {
        const cls = enr.classes
        if (!cls?.class_schedules?.length) return
        const sub = cls.subjects
        const code = sub?.code || cls.code || '—'
        const name = getLocalizedName(sub, language === 'ar') || '—'
        const color = COLORS[idx % COLORS.length]
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
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const currentSemester = semesters.find(s => String(s.id) === selectedSemesterId)
  const displayDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday']

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

  return (
    <div className={`space-y-6 ${isRTL ? 'text-right' : 'text-left'}`}>
      <p className="text-slate-500 text-sm">
        {t('studentPortal.classSchedule', 'Class schedule')} / {t('studentPortal.studentPortal', 'Student Portal')} / {t('studentPortal.main', 'Main')}
      </p>
      <div className={`flex flex-wrap items-center justify-between gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('studentPortal.weeklySchedule', 'Weekly schedule')}</h1>
          <p className="text-slate-600 text-sm mt-1">
            {currentSemester ? getLocalizedName(currentSemester, language === 'ar') : ''} {student ? `| ${getLocalizedName(student, language === 'ar')}` : ''}
          </p>
        </div>
        <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <button className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-sm font-medium">
            <Calendar className="w-4 h-4" />
            {t('studentPortal.icsExport', 'ICS Export')}
          </button>
          <button className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 text-sm font-medium">
            <Printer className="w-4 h-4" />
            {t('common.print', 'Print')}
          </button>
        </div>
      </div>

      {semesters.length > 0 && (
        <select
          value={selectedSemesterId}
          onChange={(e) => setSelectedSemesterId(e.target.value)}
          className="px-4 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-slate-500 focus:border-transparent"
        >
          {semesters.map((s) => (
            <option key={s.id} value={s.id}>{getLocalizedName(s, language === 'ar')}</option>
          ))}
        </select>
      )}

      <div className="bg-white rounded-2xl shadow-md border border-slate-200 overflow-hidden">
        <div className={`overflow-x-auto ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'}>
          <table className="w-full min-w-[700px] border-collapse" dir={isRTL ? 'rtl' : 'ltr'}>
            <thead>
              <tr>
                <th className={`bg-slate-800 text-white px-3 py-3 text-sm font-semibold w-28 ${isRTL ? 'text-right' : 'text-left'}`}>{t('studentPortal.time', 'Time')}</th>
                {displayDays.map((day) => (
                  <th key={day} className={`bg-slate-800 text-white px-2 py-3 text-sm font-semibold ${isRTL ? 'text-right' : 'text-left'}`}>
                    {language === 'ar' ? DAY_NAMES_AR[day] : DAY_NAMES_EN[day]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timeSlots.map((slot) => (
                <tr key={slot} className="border-b border-slate-100">
                  <td className={`px-3 py-2 text-slate-600 text-sm font-medium bg-slate-50 align-top whitespace-nowrap ${isRTL ? 'text-right' : 'text-left'}`}>
                    {rowTimeLabels[slot] || formatTime12h(slot, isArabic)}
                  </td>
                  {displayDays.map((day) => {
                    const key = `${day}_${slot}`
                    const cells = grid[key] || []
                    return (
                      <td key={day} className={`p-1.5 align-top border-slate-100 min-w-[120px] ${isRTL ? 'text-right border-r' : 'text-left border-l'}`}>
                        {cells.length === 0 ? (
                          <span className="text-slate-300 text-sm">—</span>
                        ) : (
                          <div className={`space-y-1 ${isRTL ? 'text-right' : 'text-left'}`}>
                            {cells.map((c, i) => (
                              <button
                                key={`${c.scheduleId || c.code}-${i}`}
                                type="button"
                                onClick={() => setSelectedSession(c)}
                                className={`w-full rounded-lg p-2.5 text-white text-xs shadow-sm text-left transition-transform hover:scale-[1.02] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-white/60 ${c.color} ${isRTL ? 'text-right' : 'text-left'} ${c.joinUrl ? 'cursor-pointer' : 'cursor-pointer opacity-95'}`}
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
          <div className={`flex flex-wrap gap-4 p-4 bg-slate-50 border-t border-slate-200 ${isRTL ? 'flex-row-reverse' : ''}`}>
            {courseList.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={`w-4 h-4 rounded flex-shrink-0 ${c.color}`} />
                <span className="text-sm text-slate-700">{c.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

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
            <div className={`flex items-start justify-between gap-3 mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
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
              <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <dt className="text-slate-500 shrink-0">{t('studentPortal.time', 'Time')}:</dt>
                <dd className="font-medium text-slate-800">
                  {formatTimeRange12h(selectedSession.startTime, selectedSession.endTime, isArabic)}
                </dd>
              </div>
              <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <dt className="text-slate-500 shrink-0">{t('classes.location', 'Location')}:</dt>
                <dd className="font-medium text-slate-800">{selectedSession.location}</dd>
              </div>
              <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <dt className="text-slate-500 shrink-0">{t('classes.instructor', 'Instructor')}:</dt>
                <dd className="font-medium text-slate-800">{selectedSession.instructor}</dd>
              </div>
            </dl>

            {selectedSession.joinUrl ? (
              <a
                href={selectedSession.joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors ${isRTL ? 'flex-row-reverse' : ''}`}
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
