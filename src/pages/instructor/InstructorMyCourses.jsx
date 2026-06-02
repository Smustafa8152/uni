import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { sumTeachingMinutes, uniqueLocationsFromSchedules } from '../../utils/instructorTimetable'
import { formatRelativeTimePast } from '../../utils/formatRelativeTimePast'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'
import {
  fetchSemestersForInstructor,
  effectiveGradeEntryAllowed,
  effectiveAttendanceEditingAllowed,
} from '../../utils/instructorSemesters'
import InstructorMyCoursesSchedule from './InstructorMyCoursesSchedule'

const COURSE_GRADIENTS = [
  'linear-gradient(135deg, var(--p), var(--pl))',
  'linear-gradient(135deg, #1a5276, #2e86c1)',
  'linear-gradient(135deg, #1a4a2e, #27ae60)',
  'linear-gradient(135deg, #6c3483, #9b59b6)',
]

/** Maps `classes.type` (class_type enum) to instructorPortal i18n key suffix. */
function deliveryKeyFromClassType(type) {
  if (type === 'online') return 'courseTypeOnline'
  if (type === 'hybrid') return 'courseTypeBlended'
  return 'courseTypeInPerson'
}

export default function InstructorMyCourses() {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [instructor, setInstructor] = useState(null)
  const [semesters, setSemesters] = useState([])
  const [selectedSemesterId, setSelectedSemesterId] = useState(null)
  const [courses, setCourses] = useState([])
  const [previousCourses, setPreviousCourses] = useState([])
  const [lessonStats, setLessonStats] = useState({})
  const [enrollmentCounts, setEnrollmentCounts] = useState({})
  const [upcomingAssessmentsWeek, setUpcomingAssessmentsWeek] = useState(0)
  const [scheduleRows, setScheduleRows] = useState([])
  const [lessonLastModified, setLessonLastModified] = useState({})

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
    if (instructor?.id && selectedSemesterId) {
      fetchCourses()
      fetchPreviousCourses()
    }
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

  const fetchCourses = async () => {
    setLoading(true)
    try {
      const { data: classesData, error } = await supabase
        .from('classes')
        .select(`
          id,
          code,
          section,
          subject_id,
          semester_id,
          status,
          type,
          subjects(id, code, name_en, name_ar, credit_hours)
        `)
        .eq('instructor_id', instructor.id)
        .eq('semester_id', selectedSemesterId)
        .eq('status', 'active')

      if (error) throw error

      const classIds = (classesData || []).map((c) => c.id)
      setCourses(classesData || [])

      if (!classIds.length) {
        setLessonStats({})
        setEnrollmentCounts({})
        setUpcomingAssessmentsWeek(0)
        setScheduleRows([])
        setLessonLastModified({})
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

      const today = new Date().toISOString().slice(0, 10)
      const weekEnd = new Date()
      weekEnd.setDate(weekEnd.getDate() + 7)
      const weekEndStr = weekEnd.toISOString().slice(0, 10)

      const windowStart = new Date()
      windowStart.setHours(0, 0, 0, 0)
      const windowEnd = new Date(windowStart)
      windowEnd.setDate(windowEnd.getDate() + 7)
      windowEnd.setHours(23, 59, 59, 999)

      let examCount = 0
      let homeworkCount = 0
      try {
        const [{ count: ex }, { count: hw }] = await Promise.all([
          supabase
            .from('subject_exams')
            .select('id', { count: 'exact', head: true })
            .in('class_id', classIds)
            .gte('scheduled_date', today)
            .lte('scheduled_date', weekEndStr),
          supabase
            .from('subject_homework')
            .select('id', { count: 'exact', head: true })
            .in('class_id', classIds)
            .in('status', ['HW_PUB', 'HW_CLD'])
            .gte('due_date', windowStart.toISOString())
            .lte('due_date', windowEnd.toISOString()),
        ])
        examCount = ex || 0
        homeworkCount = hw || 0
      } catch {
        examCount = 0
        homeworkCount = 0
      }

      const [{ data: lessonsData }, { data: enrollmentsData }] = await Promise.all([
        supabase.from('class_lessons').select('class_id, status, updated_at').in('class_id', classIds),
        supabase.from('enrollments').select('class_id, id').in('class_id', classIds).eq('status', 'enrolled'),
      ])

      setUpcomingAssessmentsWeek(examCount + homeworkCount)

      const nextLessonStats = {}
      const nextLessonLastModified = {}
      for (const classId of classIds) {
        nextLessonStats[classId] = { total: 0, published: 0 }
      }

      for (const lesson of lessonsData || []) {
        if (!nextLessonStats[lesson.class_id]) {
          nextLessonStats[lesson.class_id] = { total: 0, published: 0 }
        }
        nextLessonStats[lesson.class_id].total += 1
        if (lesson.status === 'published') nextLessonStats[lesson.class_id].published += 1
        const u = lesson.updated_at
        if (u) {
          const prev = nextLessonLastModified[lesson.class_id]
          if (!prev || new Date(u) > new Date(prev)) nextLessonLastModified[lesson.class_id] = u
        }
      }
      setLessonLastModified(nextLessonLastModified)

      const nextEnrollmentCounts = {}
      for (const classId of classIds) {
        nextEnrollmentCounts[classId] = 0
      }
      for (const enrollment of enrollmentsData || []) {
        nextEnrollmentCounts[enrollment.class_id] = (nextEnrollmentCounts[enrollment.class_id] || 0) + 1
      }

      setLessonStats(nextLessonStats)
      setEnrollmentCounts(nextEnrollmentCounts)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchPreviousCourses = async () => {
    try {
      const { data } = await supabase
        .from('classes')
        .select(`
          id,
          code,
          section,
          subject_id,
          semester_id,
          status,
          subjects(id, code, name_en, name_ar),
          semesters(id, name_en, name_ar, code, start_date)
        `)
        .eq('instructor_id', instructor.id)
        .neq('semester_id', selectedSemesterId)
        .order('id', { ascending: false })
        .limit(30)

      const list = data || []
      const classIds = list.map((c) => c.id)

      if (!classIds.length) {
        setPreviousCourses([])
        return
      }

      const { data: enrollmentsData } = await supabase
        .from('enrollments')
        .select('class_id, id')
        .in('class_id', classIds)
        .eq('status', 'enrolled')

      const counts = {}
      for (const id of classIds) counts[id] = 0
      for (const row of enrollmentsData || []) counts[row.class_id] = (counts[row.class_id] || 0) + 1

      setPreviousCourses(
        list.map((row) => ({
          ...row,
          enrolled_count: counts[row.id] || 0,
        }))
      )
    } catch (err) {
      console.error(err)
    }
  }

  const currentSemester = useMemo(
    () => semesters.find((s) => s.id === selectedSemesterId),
    [semesters, selectedSemesterId]
  )

  const semesterOpsFlags = useMemo(() => {
    if (!currentSemester) return { grade: true, attendance: true }
    return {
      grade: effectiveGradeEntryAllowed(currentSemester),
      attendance: effectiveAttendanceEditingAllowed(currentSemester),
    }
  }, [currentSemester])

  const semesterLabel = currentSemester ? getLocalizedName(currentSemester, language === 'ar') : ''

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

  const distinctRooms = useMemo(() => uniqueLocationsFromSchedules(scheduleRows), [scheduleRows])

  if (loading && !instructor) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--bdr)', borderTopColor: 'var(--p)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  return (
    <>
      <nav className="bc" aria-label={t('instructorPortal.breadcrumbMain')}>
        <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
        <span className="bc-sep">›</span>
        <span>{t('instructorPortal.myCourses')}</span>
      </nav>

      <div className="ph">
        <div>
          <h1>{t('instructorPortal.myCourses')}</h1>
          <p className="ph-sub">
            {t('instructorPortal.myCoursesSubtitleLine', {
              semester: semesterLabel || '—',
              count: courses.length,
            })}
          </p>
        </div>

        <div className="ph-acts">
          <select
            className="fc"
            style={{ width: 'auto' }}
            data-field="term_filter"
            value={selectedSemesterId || ''}
            onChange={(e) => setSelectedSemesterId(e.target.value ? Number(e.target.value) : null)}
            aria-label={t('instructorPortal.filterSemester')}
          >
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {getLocalizedName(s, language === 'ar')} — {t(`instructorPortal.semesterStatus.${s.status}`, s.status)}
              </option>
            ))}
            {semesters.length === 0 && <option value="">{semesterLabel || ''}</option>}
          </select>
        </div>
      </div>

      {currentSemester && (
        <>
          {(currentSemester.status === 'draft' || currentSemester.status === 'archived') && (
            <div className="alert alert-warn" role="status" style={{ marginBottom: 12 }}>
              {currentSemester.status === 'draft'
                ? t('instructorPortal.semesterLifecycle.bannerDraft')
                : t('instructorPortal.semesterLifecycle.bannerArchived')}
            </div>
          )}
          {(!semesterOpsFlags.grade || !semesterOpsFlags.attendance) && (
            <div className="alert alert-ok" role="status" style={{ marginBottom: 16 }}>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {!semesterOpsFlags.grade && (
                  <li>{t('instructorPortal.semesterLifecycle.flagGradeEntryOff')}</li>
                )}
                {!semesterOpsFlags.attendance && (
                  <li>{t('instructorPortal.semesterLifecycle.flagAttendanceOff')}</li>
                )}
              </ul>
            </div>
          )}
        </>
      )}

      <div className="sg">
        <div className="sc info">
          <div className="sc-lbl">{t('instructorPortal.statActiveCourses')}</div>
          <div className="sc-val" data-field="active_courses">
            {courses.length}
          </div>
          <div className="sc-sub">{t('instructorPortal.statActiveCoursesSub')}</div>
        </div>
        <div className="sc ok">
          <div className="sc-lbl">{t('instructorPortal.statTotalStudents')}</div>
          <div className="sc-val" data-field="total_students">
            {totalStudents}
          </div>
          <div className="sc-sub">{t('instructorPortal.statTotalStudentsSub')}</div>
        </div>
        <div className="sc warn">
          <div className="sc-lbl">{t('instructorPortal.statTeachingHours')}</div>
          <div className="sc-val" data-field="teaching_hours">
            {teachingHoursWeek}
          </div>
          <div className="sc-sub">{t('instructorPortal.statTeachingHoursSub')}</div>
        </div>
        <div className="sc acc">
          <div className="sc-lbl">{t('instructorPortal.statUpcomingAssessments')}</div>
          <div className="sc-val" data-field="upcoming_assessments">
            {upcomingAssessmentsWeek}
          </div>
          <div className="sc-sub">{t('instructorPortal.statUpcomingAssessmentsSub')}</div>
        </div>
      </div>

      <div className="course-grid course-grid-mb">
        {courses.map((cls, index) => {
          const stats = lessonStats[cls.id] || { total: 0, published: 0 }
          const total = Math.max(stats.total, 0)
          const published = Math.min(stats.published || 0, total)
          const pct = total ? Math.round((published / total) * 100) : 0
          const isComplete = total > 0 && pct >= 100
          const gradient = COURSE_GRADIENTS[index % COURSE_GRADIENTS.length]
          const hours = cls.subjects?.credit_hours || 0
          const students = enrollmentCounts[cls.id] || 0
          const courseName = getLocalizedName(cls.subjects, language === 'ar')
          const deliveryKey = deliveryKeyFromClassType(cls.type)
          const lastMod = lessonLastModified[cls.id]
          const allDraft = total > 0 && published === 0

          return (
            <div key={cls.id} className="course-card">
              <div className="course-top" style={{ background: gradient }}>
                <div className="course-code">
                  {cls.subjects?.code} — {t('instructorPortal.section')} {cls.section}
                </div>
                <h3>{courseName}</h3>
                <div className="course-term">{t(`instructorPortal.${deliveryKey}`)}</div>
              </div>
              <div className="course-body">
                <div className="course-meta">
                  <div className="course-mi">
                    <strong data-field="student_count">{students}</strong>
                    {t('instructorPortal.studentsLabel')}
                  </div>
                  <div className="course-mi">
                    <strong data-field="lesson_count">{total}</strong>
                    {t('instructorPortal.lessonsLabel')}
                  </div>
                  <div className="course-mi">
                    <strong data-field="credit_hours">{hours}</strong>
                    {t('instructorPortal.hours')}
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span>{t('instructorPortal.contentPublishProgress')}</span>
                    <span style={{ fontWeight: 700 }}>
                      {published}/{total}
                    </span>
                  </div>
                  <div className="prog-bar">
                    <div
                      className={`prog-fill ${isComplete ? 'ok' : pct >= 60 ? 'acc' : 'warn'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <span data-status="active" className="badge">
                    {t('instructorPortal.badgeActive')}
                  </span>
                  {isComplete ? (
                    <span
                      style={{
                        background: 'var(--ok-bg)',
                        color: 'var(--ok)',
                        fontSize: 12,
                        padding: '2px 8px',
                        borderRadius: 20,
                        fontWeight: 600,
                      }}
                    >
                      ✓ {t('instructorPortal.contentComplete')}
                    </span>
                  ) : allDraft ? (
                    <span
                      style={{
                        background: 'var(--warn-bg)',
                        color: 'var(--warn)',
                        fontSize: 12,
                        padding: '2px 8px',
                        borderRadius: 20,
                        fontWeight: 600,
                      }}
                    >
                      ⚠️ {t('instructorPortal.allLessonsDraftShort')}
                    </span>
                  ) : lastMod ? (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {t('instructorPortal.lastModified', {
                        time: formatRelativeTimePast(lastMod, language === 'ar' ? 'ar' : 'en'),
                      })}
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('instructorPortal.noLessonsYetShort')}</span>
                  )}
                </div>
                <div className="course-actions">
                  <Link to={`/instructor/subjects/${cls.subject_id}`} className="btn btn-p btn-sm">
                    {t('instructorPortal.openCourse')}
                  </Link>
                  <Link to={`/instructor/gradebook?classId=${cls.id}`} className="btn btn-gh btn-sm">
                    {t('instructorPortal.grades')}
                  </Link>
                  <Link to={`/instructor/analytics?classId=${cls.id}`} className="btn btn-gh btn-sm">
                    {t('instructorPortal.analytics')}
                  </Link>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <InstructorMyCoursesSchedule
        semesterLabel={semesterLabel}
        schedules={scheduleRows}
        summaryTeachingHours={teachingHoursWeek}
        summaryOfficeHours={null}
        summaryAssessWeek={upcomingAssessmentsWeek}
        summaryStudents={totalStudents}
        summaryRooms={distinctRooms}
      />

      <div className="card">
        <div className="card-hd">
          <div className="card-title">{t('instructorPortal.previousSemestersCoursesTitle')}</div>
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('instructorPortal.courseCode')}</th>
                <th scope="col">{t('instructorPortal.courseName')}</th>
                <th scope="col">{t('instructorPortal.semesterCol')}</th>
                <th scope="col">{t('instructorPortal.studentsCol')}</th>
                <th scope="col">{t('instructorPortal.statusCol')}</th>
                <th scope="col">{t('instructorPortal.actionsCol')}</th>
              </tr>
            </thead>
            <tbody>
              {previousCourses.map((row) => (
                <tr key={row.id}>
                  <td data-field="course_code">{row.subjects?.code || row.code}</td>
                  <td>{getLocalizedName(row.subjects, language === 'ar')}</td>
                  <td data-field="term">{getLocalizedName(row.semesters, language === 'ar') || row.semesters?.code || '-'}</td>
                  <td data-field="student_count">{row.enrolled_count}</td>
                  <td>
                    <span data-status="closed" className="badge">
                      {row.status === 'active' ? t('instructorPortal.badgeActive') : t('instructorPortal.closed')}
                    </span>
                  </td>
                  <td>
                    <Link to={`/instructor/subjects/${row.subject_id}`} className="btn btn-gh btn-sm">
                      {t('instructorPortal.view')}
                    </Link>
                  </td>
                </tr>
              ))}
              {previousCourses.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    {t('instructorPortal.noData', 'No data available')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
