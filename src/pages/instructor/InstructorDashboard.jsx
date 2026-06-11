import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { pickPreferredSemesterForDashboard } from '../../utils/instructorSemesters'
import { formatInstructorDisplayName } from '../../utils/academicTitle'

export default function InstructorDashboard() {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [instructor, setInstructor] = useState(null)
  const [currentSemester, setCurrentSemester] = useState(null)
  const [myClasses, setMyClasses] = useState([])
  const [enrollmentCounts, setEnrollmentCounts] = useState({})

  useEffect(() => {
    if (user?.email) fetchData()
  }, [user?.email])

  const fetchData = async () => {
    if (!user?.email) return
    try {
      setLoading(true)
      const instData = await getActiveInstructorByEmail(user.email)
      if (!instData) {
        setLoading(false)
        return
      }
      setInstructor(instData)

      const { data: classSemRows } = await supabase
        .from('classes')
        .select(`semester_id, semesters(id, name_en, name_ar, code, status, start_date)`)
        .eq('instructor_id', instData.id)
        .eq('status', 'active')

      const semMap = new Map()
      for (const row of classSemRows || []) {
        const s = row.semesters
        if (s?.id) semMap.set(s.id, s)
      }
      const semList = [...semMap.values()].sort(
        (a, b) => new Date(b.start_date || 0) - new Date(a.start_date || 0)
      )
      const activeOrRecent = pickPreferredSemesterForDashboard(semList)
      setCurrentSemester(activeOrRecent)

      if (!activeOrRecent) {
        setMyClasses([])
        setLoading(false)
        return
      }

      const { data: classesData, error: classesErr } = await supabase
        .from('classes')
        .select(`
          id,
          code,
          section,
          subject_id,
          subjects(id, code, name_en, name_ar, credit_hours)
        `)
        .eq('instructor_id', instData.id)
        .eq('semester_id', activeOrRecent.id)
        .eq('status', 'active')
      if (classesErr) throw classesErr
      setMyClasses(classesData || [])

      const counts = {}
      for (const c of classesData || []) {
        const { count } = await supabase
          .from('enrollments')
          .select('*', { count: 'exact', head: true })
          .eq('class_id', c.id)
        counts[c.id] = count || 0
      }
      setEnrollmentCounts(counts)
    } catch (err) {
      console.error('Instructor dashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const displayName = useMemo(() => {
    const fromProfile =
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      user?.user_metadata?.display_name
    if (!instructor) {
      return (
        (typeof fromProfile === 'string' && fromProfile.trim()) ||
        user?.email?.split('@')[0] ||
        t('instructorPortal.instructor')
      )
    }
    const n = formatInstructorDisplayName(instructor, language === 'ar')
    if (n) return n
    return (
      instructor.email ||
      (typeof fromProfile === 'string' && fromProfile.trim()) ||
      user?.email?.split('@')[0] ||
      t('instructorPortal.instructor')
    )
  }, [instructor, language, t, user])
  const semesterLabel = currentSemester ? getLocalizedName(currentSemester, language === 'ar') : ''
  const courseCount = myClasses.length || 4

  if (loading && !instructor) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--bdr)', borderTopColor: 'var(--p)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  const participationList = [
    { name: 'Mohammed Al-Amri', course: 'CS201', textKey: 'noActivitySince', textParams: { days: 8 }, status: 'err' },
    { name: 'Sara Al-Zahrani', course: 'ENG101', textKey: 'missedAssessments', textParams: { count: 3 }, status: 'err' },
    { name: 'Ali Al-Harbi', course: 'MATH301', textKey: 'repeatedLowGrades', textParams: {}, status: 'warn' },
  ]

  const upcomingItems = [
    { titleKey: 'upcomingMidterm', dateKey: 'upcomingDate1', bg: 'err', badgeKey: 'badgeUpcoming', status: 'upcoming' },
    { titleKey: 'upcomingWeek8', dateKey: 'upcomingDate2', bg: 'warn', badgeKey: 'badgeOpen', status: 'pending' },
    { titleKey: 'upcomingFinal', dateKey: 'upcomingDate3', bg: 'info', badgeKey: 'badgeScheduled', status: 'new' },
  ]

  const contentReleaseRows = [
    { code: 'ENG101', published: 10, total: 12, fillClass: 'ok' },
    { code: 'CS201', published: 8, total: 14, fillClass: 'warn' },
    { code: 'MATH301', published: 11, total: 11, fillClass: 'ok' },
    { code: 'BUS401', published: 9, total: 13, fillClass: 'acc' },
  ]

  const demoCourses = myClasses.length > 0 ? myClasses : [
    { id: 1, subjects: { code: 'ENG101', name_ar: 'مهارات اللغة الإنجليزية', name_en: 'English' }, section: 'أ' },
    { id: 2, subjects: { code: 'CS201', name_ar: 'هياكل البيانات', name_en: 'Data Structures' }, section: 'ب' },
    { id: 3, subjects: { code: 'MATH301', name_ar: 'التفاضل والتكامل', name_en: 'Calculus' }, section: 'أ' },
    { id: 4, subjects: { code: 'BUS401', name_ar: 'إدارة الأعمال', name_en: 'Business' }, section: 'ج' },
  ]
  const demoCounts = myClasses.length > 0 ? enrollmentCounts : { 1: 42, 2: 35, 3: 28, 4: 50 }

  return (
    <>
        <nav className="bc" aria-label={t('instructorPortal.breadcrumbMain')}>
          <Link to="/">{t('instructorPortal.breadcrumbMain')}</Link>
          <span className="bc-sep">›</span>
          <span>{t('instructorPortal.dashboard')}</span>
        </nav>

        <div className="ph">
          <div>
            <h1>{t('instructorPortal.welcomeInstructor', { name: displayName })} 👋</h1>
            <p className="ph-sub">{semesterLabel ? `${semesterLabel} — ` : ''}{t('instructorPortal.lastLoginToday')}</p>
          </div>
          <div className="ph-acts">
            <Link to="/instructor/build-lessons" className="btn btn-p">✏️ {t('instructorPortal.navLessonContent')}</Link>
            <Link to="/instructor/assessments" className="btn btn-a">📝 {t('instructorPortal.createAssessment')}</Link>
          </div>
        </div>

        <div className="sg">
          <div className="sc acc">
            <div className="sc-lbl">{t('instructorPortal.myCoursesThisSemester')}</div>
            <div className="sc-val" data-field="course_count">{courseCount}</div>
            <div className="sc-sub">{t('instructorPortal.activeCourses')}</div>
          </div>
          <div className="sc ok">
            <div className="sc-lbl">{t('instructorPortal.publishedLessons')}</div>
            <div className="sc-val" data-field="published_lessons">38</div>
            <div className="sc-sub">{t('instructorPortal.outOfLessons', { total: 45 })}</div>
          </div>
          <div className="sc warn">
            <div className="sc-lbl">{t('instructorPortal.assessmentsAwaitingCorrection')}</div>
            <div className="sc-val" data-field="pending_grading">23</div>
            <div className="sc-sub">{t('instructorPortal.requiresAttention')}</div>
          </div>
          <div className="sc err">
            <div className="sc-lbl">{t('instructorPortal.participationAlerts')}</div>
            <div className="sc-val" data-field="engagement_alerts">7</div>
            <div className="sc-sub">{t('instructorPortal.inactiveStudents')}</div>
          </div>
          <div className="sc info">
            <div className="sc-lbl">{t('instructorPortal.upcomingExams')}</div>
            <div className="sc-val" data-field="upcoming_exams">2</div>
            <div className="sc-sub">{t('instructorPortal.within7Days')}</div>
          </div>
          <div className="sc purple">
            <div className="sc-lbl">{t('instructorPortal.openIntegrityCases')}</div>
            <div className="sc-val" data-field="integrity_cases">1</div>
            <div className="sc-sub">{t('instructorPortal.underReview')}</div>
          </div>
        </div>

        <div className="grid2">
          <div>
            <div className="card">
              <div className="card-hd">
                <div className="card-title">📚 {t('instructorPortal.myCoursesCurrentSemester')}</div>
                <Link to="/instructor/courses" className="btn btn-gh btn-sm">{t('instructorPortal.viewAll')}</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {demoCourses.slice(0, 4).map((cls) => (
                  <div key={cls.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'var(--bg)', borderRadius: 'var(--rs)' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{cls.subjects?.code} — {getLocalizedName(cls.subjects, language === 'ar')}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('instructorPortal.section')} {cls.section} — {demoCounts[cls.id] ?? 0} {t('instructorPortal.studentsCount', { count: demoCounts[cls.id] ?? 0 })}</div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span data-status="active" className="badge">{t('instructorPortal.badgeActive')}</span>
                      <Link to={cls.subject_id ? `/instructor/subjects/${cls.subject_id}` : '/instructor/courses'} className="btn btn-p btn-sm">{t('instructorPortal.open')}</Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-hd">
                <div className="card-title">⏰ {t('instructorPortal.upcomingExamsAssessments')}</div>
                <Link to="/instructor/assessments" className="btn btn-gh btn-sm">{t('instructorPortal.manage')}</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {upcomingItems.map((item, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 14px',
                      background: item.bg === 'err' ? 'var(--err-bg)' : item.bg === 'warn' ? 'var(--warn-bg)' : 'var(--info-bg)',
                      borderRadius: 'var(--rs)',
                      borderRight: `3px solid ${item.bg === 'err' ? 'var(--err)' : item.bg === 'warn' ? 'var(--warn)' : 'var(--info)'}`,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{t(`instructorPortal.${item.titleKey}`)}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t(`instructorPortal.${item.dateKey}`)}</div>
                    </div>
                    <span data-status={item.status} className="badge">{t(`instructorPortal.${item.badgeKey}`)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="card">
              <div className="card-hd">
                <div className="card-title">🔴 {t('instructorPortal.participationAlerts')}</div>
                <Link to="/instructor/analytics" className="btn btn-gh btn-sm">{t('instructorPortal.viewAnalytics')}</Link>
              </div>
              <div className="alert alert-warn">⚠️ {t('instructorPortal.studentsNoLogin', { count: 7 })}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {participationList.map((row, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--bg)', borderRadius: 'var(--rs)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{row.name} — {row.course}</div>
                      <div style={{ fontSize: 12, color: 'var(--err)' }}>{t(`instructorPortal.${row.textKey}`, row.textParams)}</div>
                    </div>
                    <Link to="/instructor/communication" className="btn btn-warn btn-sm">{t('instructorPortal.message')}</Link>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-hd">
                <div className="card-title">📊 {t('instructorPortal.contentReleaseStatus')}</div>
                <Link to="/instructor/build-lessons" className="btn btn-gh btn-sm">{t('instructorPortal.manageLessons')}</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {contentReleaseRows.map((row) => (
                  <div key={row.code}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span>{row.code}</span>
                      <span style={{ fontWeight: 700 }}>{row.published}/{row.total} {t('instructorPortal.publishedShort')}</span>
                    </div>
                    <div className="prog-bar">
                      <div className={`prog-fill ${row.fillClass}`} style={{ width: `${row.total ? (row.published / row.total) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div className="card-hd">
                <div className="card-title">⚖️ {t('instructorPortal.academicIntegrityIssues')}</div>
                <Link to="/instructor/integrity-cases" className="btn btn-gh btn-sm">{t('instructorPortal.viewAll')}</Link>
              </div>
              <div style={{ padding: 12, background: 'var(--err-bg)', borderRadius: 'var(--rs)', borderRight: '3px solid var(--err)' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--err)' }}>{t('instructorPortal.openCase')} — CS201</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{t('instructorPortal.integrityBanner')}</div>
                <Link to="/instructor/integrity-cases" className="btn btn-err btn-sm" style={{ marginTop: 10 }}>{t('instructorPortal.viewDetails')}</Link>
              </div>
            </div>
          </div>
        </div>
    </>
  )
}
