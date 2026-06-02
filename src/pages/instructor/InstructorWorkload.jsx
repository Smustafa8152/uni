import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { fetchSemestersForInstructor } from '../../utils/instructorSemesters'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'
import {
  TIMETABLE_DAY_KEYS,
  WORKLOAD_DAY_I18N_KEYS,
  formatClassScheduleSummary,
  formatTimeRangeLabel,
  schedulesForClass,
  sumTeachingMinutes,
  uniqueLocationsFromSchedules,
} from '../../utils/instructorTimetable'

const ACCENT_BORDERS = ['var(--p)', 'var(--info)', 'var(--ok)']
const WEEK_ROW_STYLES = [
  { bg: 'var(--p-bg)', border: 'var(--p)', labelColor: 'var(--p)' },
  { bg: 'var(--info-bg)', border: 'var(--info)', labelColor: 'var(--info)' },
  { bg: 'var(--ok-bg)', border: 'var(--ok)', labelColor: 'var(--ok)' },
]

/**
 * Teaching workload & schedule — stats and week strip from `classes`, `class_schedules`, and enrollments.
 */
export default function InstructorWorkload() {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const { user } = useAuth()
  const isAr = language === 'ar'

  const [loading, setLoading] = useState(true)
  const [instructor, setInstructor] = useState(null)
  const [semesters, setSemesters] = useState([])
  const [selectedSemesterId, setSelectedSemesterId] = useState(null)
  const [courses, setCourses] = useState([])
  const [scheduleRows, setScheduleRows] = useState([])
  const [enrollmentCounts, setEnrollmentCounts] = useState({})

  useEffect(() => {
    document.title = `${t('instructorPortal.workloadBreadcrumbLast')} — ${t('instructorPortal.instructorPortalAr')} | IBU`
  }, [t])

  useEffect(() => {
    if (user?.email) fetchInstructor()
  }, [user?.email])

  useEffect(() => {
    if (instructor?.id) fetchSemesters()
  }, [instructor?.id, instructor?.college_id])

  useEffect(() => {
    if (!semesters.length) return
    setSelectedSemesterId((prev) => {
      if (prev && semesters.some((s) => s.id === prev)) return prev
      return semesters[0].id
    })
  }, [semesters])

  useEffect(() => {
    if (instructor?.id && selectedSemesterId) fetchWorkloadData()
  }, [instructor?.id, selectedSemesterId])

  const fetchInstructor = async () => {
    const data = await getActiveInstructorByEmail(user.email)
    if (data) setInstructor(data)
  }

  const fetchSemesters = async () => {
    const list = await fetchSemestersForInstructor(supabase, {
      instructorId: instructor.id,
      collegeId: instructor.college_id,
    })
    setSemesters(list)
  }

  const fetchWorkloadData = async () => {
    setLoading(true)
    try {
      const { data: classesData, error } = await supabase
        .from('classes')
        .select('id, code, section, subject_id, semester_id, status, type, location, subjects(id, code, name_en, name_ar, credit_hours)')
        .eq('instructor_id', instructor.id)
        .eq('semester_id', selectedSemesterId)
        .eq('status', 'active')

      if (error) throw error

      const list = classesData || []
      setCourses(list)
      const classIds = list.map((c) => c.id)

      if (!classIds.length) {
        setScheduleRows([])
        setEnrollmentCounts({})
        return
      }

      const { data: schedData, error: schedErr } = await supabase
        .from('class_schedules')
        .select(
          `
          id, day_of_week, start_time, end_time, location, class_id,
          classes!inner (
            id, code, section, type, location,
            subjects (code, name_en, name_ar)
          )
        `
        )
        .in('class_id', classIds)

      if (schedErr) {
        console.error(schedErr)
        setScheduleRows([])
      } else {
        setScheduleRows(schedData || [])
      }

      const { data: enrollmentsData } = await supabase
        .from('enrollments')
        .select('class_id, id')
        .in('class_id', classIds)
        .eq('status', 'enrolled')

      const nextEnrollmentCounts = {}
      for (const id of classIds) nextEnrollmentCounts[id] = 0
      for (const row of enrollmentsData || []) {
        nextEnrollmentCounts[row.class_id] = (nextEnrollmentCounts[row.class_id] || 0) + 1
      }
      setEnrollmentCounts(nextEnrollmentCounts)
    } catch (e) {
      console.error(e)
      setCourses([])
      setScheduleRows([])
      setEnrollmentCounts({})
    } finally {
      setLoading(false)
    }
  }

  const currentSemester = useMemo(
    () => semesters.find((s) => s.id === selectedSemesterId),
    [semesters, selectedSemesterId]
  )

  const semesterLabel = currentSemester ? getLocalizedName(currentSemester, isAr) : ''

  const instructorDisplayName = instructor
    ? getLocalizedName(
        { name_en: instructor.name_en, name_ar: instructor.name_ar },
        isAr
      )
    : ''

  const totalStudents = useMemo(
    () => courses.reduce((acc, c) => acc + (enrollmentCounts[c.id] || 0), 0),
    [courses, enrollmentCounts]
  )

  const teachingHoursWeek = useMemo(() => {
    const mins = sumTeachingMinutes(scheduleRows)
    if (mins > 0) return Math.round((mins / 60) * 10) / 10
    const creditSum = courses.reduce((acc, c) => acc + (Number(c.subjects?.credit_hours) || 0), 0)
    return creditSum > 0 ? creditSum : 0
  }, [courses, scheduleRows])

  /** No dedicated office-hours column in DB yet — show 0 / em dash in UI. */
  const officeHoursWeek = 0

  const totalWeekHours = teachingHoursWeek + officeHoursWeek

  const distinctRooms = useMemo(() => uniqueLocationsFromSchedules(scheduleRows), [scheduleRows])

  const weekByDay = useMemo(() => {
    const map = {}
    for (const d of TIMETABLE_DAY_KEYS) map[d] = []
    for (const row of scheduleRows) {
      const d = String(row.day_of_week || '').toLowerCase()
      if (map[d]) map[d].push(row)
    }
    return map
  }, [scheduleRows])

  const accentCard = (borderVar) => ({
    background: 'var(--bg)',
    borderRadius: 'var(--rs)',
    padding: 14,
    borderInlineStart: `3px solid ${borderVar}`,
  })

  const weekRowStyle = (style) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    background: style.bg,
    borderRadius: 'var(--rs)',
    borderInlineStart: `3px solid ${style.border}`,
    color: 'var(--txt)',
  })

  const fmtHours = (n) => {
    if (n === 0 || n === null || Number.isNaN(n)) return '0'
    return Number(n).toFixed(1).replace(/\.0$/, '')
  }

  if (loading && !instructor) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <div
          style={{
            width: 40,
            height: 40,
            border: '3px solid var(--bdr)',
            borderTopColor: 'var(--p)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      </div>
    )
  }

  return (
    <>
      <nav className="bc" aria-label={t('instructorPortal.breadcrumbMain')}>
        <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
        <span className="bc-sep">›</span>
        <span>{t('instructorPortal.workloadBreadcrumbLast')}</span>
      </nav>

      <div className="ph">
        <div>
          <h1>{t('instructorPortal.workloadPageTitle')}</h1>
          <p className="ph-sub">
            {t('instructorPortal.workloadPhSubDynamic', {
              semester: semesterLabel || '—',
              name: instructorDisplayName || '—',
            })}
          </p>
        </div>
        <div className="ph-acts">
          <select
            className="fc"
            style={{ width: 'auto' }}
            value={selectedSemesterId || ''}
            onChange={(e) => setSelectedSemesterId(e.target.value ? Number(e.target.value) : null)}
            aria-label={t('instructorPortal.filterSemester')}
          >
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {getLocalizedName(s, isAr)} — {t(`instructorPortal.semesterStatus.${s.status}`, s.status)}
              </option>
            ))}
            {semesters.length === 0 && <option value="">{semesterLabel || ''}</option>}
          </select>
          <button type="button" className="btn btn-gh" onClick={() => window.print()}>
            📥 {t('instructorPortal.workloadExportSchedule')}
          </button>
        </div>
      </div>

      <div className="sg">
        <div className="sc acc">
          <div className="sc-lbl">{t('instructorPortal.workloadStatTotalHoursLabel')}</div>
          <div className="sc-val" data-field="total_hours">
            {loading ? '—' : fmtHours(teachingHoursWeek)}
          </div>
          <div className="sc-sub">{t('instructorPortal.workloadStatTotalHoursSub')}</div>
        </div>
        <div className="sc info">
          <div className="sc-lbl">{t('instructorPortal.workloadStatCourseCountLabel')}</div>
          <div className="sc-val" data-field="course_count">
            {loading ? '—' : courses.length}
          </div>
          <div className="sc-sub">{t('instructorPortal.workloadStatCourseCountSub')}</div>
        </div>
        <div className="sc ok">
          <div className="sc-lbl">{t('instructorPortal.workloadStatStudentsLabel')}</div>
          <div className="sc-val" data-field="total_students">
            {loading ? '—' : totalStudents}
          </div>
          <div className="sc-sub">{t('instructorPortal.workloadStatStudentsSub')}</div>
        </div>
        <div className="sc warn">
          <div className="sc-lbl">{t('instructorPortal.workloadStatOfficeLabel')}</div>
          <div className="sc-val" data-field="office_hours">
            {officeHoursWeek === 0 ? '—' : fmtHours(officeHoursWeek)}
          </div>
          <div className="sc-sub">{t('instructorPortal.workloadStatOfficeSub')}</div>
        </div>
      </div>

      <div className="grid2">
        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">{t('instructorPortal.workloadAssignedSectionTitle')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {loading && (
                <div style={{ padding: 16, color: 'var(--muted)', fontSize: 14 }}>{t('common.loading')}</div>
              )}
              {!loading && courses.length === 0 && (
                <div style={{ padding: 16, color: 'var(--muted)', fontSize: 14 }}>
                  {t('instructorPortal.workloadEmptySemester')}
                </div>
              )}
              {!loading &&
                courses.map((cls, index) => {
                  const subj = cls.subjects
                  const code = subj?.code || cls.code
                  const courseName = getLocalizedName(subj, isAr)
                  const students = enrollmentCounts[cls.id] || 0
                  const schedText = formatClassScheduleSummary(scheduleRows, cls.id, t)
                  const rows = schedulesForClass(scheduleRows, cls.id)
                  const locRaw = (rows.find((r) => (r.location || '').trim())?.location || cls.location || '').trim()
                  const creditRaw = Number(subj?.credit_hours)
                  const creditDisplay = Number.isFinite(creditRaw) ? String(creditRaw) : '—'
                  const border = ACCENT_BORDERS[index % ACCENT_BORDERS.length]
                  return (
                    <div key={cls.id} style={accentCard(border)}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }} data-field="course_code">
                            {code}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {t('instructorPortal.workloadCourseLine1', {
                              name: courseName || '—',
                              count: students,
                            })}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                            {schedText
                              ? `${schedText}${locRaw ? ` | ${locRaw}` : ''}`
                              : t('instructorPortal.workloadNoScheduleYet')}
                          </div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--p)' }} data-field="credit_hours">
                            {creditDisplay}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t('instructorPortal.workloadHoursUnit')}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">{t('instructorPortal.workloadWeekSectionTitle')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {TIMETABLE_DAY_KEYS.map((dayKey, dayIdx) => {
                const rows = weekByDay[dayKey] || []
                const i18nDay = WORKLOAD_DAY_I18N_KEYS[dayKey]
                const dayLabel = i18nDay ? t(`instructorPortal.${i18nDay}`) : dayKey
                const palette = WEEK_ROW_STYLES[dayIdx % WEEK_ROW_STYLES.length]

                const codes = [
                  ...new Set(
                    rows
                      .map((r) => r.classes?.subjects?.code)
                      .filter(Boolean)
                  ),
                ]
                const title =
                  codes.length > 0
                    ? codes.join(' + ')
                    : t('instructorPortal.workloadWeekFree')

                const timeParts = [
                  ...new Set(rows.map((r) => formatTimeRangeLabel(r.start_time, r.end_time)).filter((x) => x && x !== '—')),
                ]
                const timeStr = timeParts.length ? timeParts.join(' / ') : t('instructorPortal.workloadWeekFree')

                return (
                  <div key={dayKey} style={weekRowStyle(palette)}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: palette.labelColor,
                        width: 72,
                        flexShrink: 0,
                      }}
                    >
                      {dayLabel}
                    </div>
                    <div style={{ fontSize: 13, flex: 1 }} data-field="class_title">
                      {title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{timeStr}</div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">{t('instructorPortal.workloadWorkloadSummaryTitle')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bdr)' }}>
                <span style={{ color: 'var(--muted)' }}>{t('instructorPortal.workloadSumTeachingLabel')}</span>
                <strong>{t('instructorPortal.workloadSumTeachingValDynamic', { hours: fmtHours(teachingHoursWeek) })}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bdr)' }}>
                <span style={{ color: 'var(--muted)' }}>{t('instructorPortal.workloadSumOfficeLabel')}</span>
                <strong>
                  {officeHoursWeek === 0
                    ? t('instructorPortal.workloadSumNotSet')
                    : t('instructorPortal.workloadSumOfficeValDynamic', { hours: fmtHours(officeHoursWeek) })}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bdr)' }}>
                <span style={{ color: 'var(--muted)' }}>{t('instructorPortal.workloadSumTotalLabel')}</span>
                <strong>{t('instructorPortal.workloadSumTotalValDynamic', { hours: fmtHours(totalWeekHours) })}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ color: 'var(--muted)' }}>{t('instructorPortal.workloadSumMaxLabel')}</span>
                <strong style={{ color: 'var(--ok)' }}>{t('instructorPortal.workloadSumMaxUnavailable')}</strong>
              </div>
              {distinctRooms > 0 && (
                <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
                  {t('instructorPortal.workloadDistinctRooms', { count: distinctRooms })}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
