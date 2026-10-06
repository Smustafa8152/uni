import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, Search, Eye, Edit, CalendarDays, AlertTriangle } from 'lucide-react'
import { Badge, Button, EmptyState, PageHeader, Skeleton } from '../../components/ui'
import { Facts, Mark, Register, RegisterRow, fieldClass } from '../../components/academic/catalogUi'
import { describeRegistrationState, isDraftSemester, isFinishedSemester, isRunningSemester, registrationState } from '../../utils/registrationRules'

export default function Semesters() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const navigate = useNavigate()
  const { userRole, collegeId } = useAuth()
  const formatDate = (value) =>
    new Date(value).toLocaleDateString(language === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const [semesters, setSemesters] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [kpis, setKpis] = useState({
    currentSemester: null,
    activeSemesters: 0,
    registrationStatus: 'closed',
    daysRemaining: 0,
    semesterHealth: 'healthy'
  })
  const [semesterStats, setSemesterStats] = useState({}) // Store enrollments, courses, classes counts per semester
  const [statsLoaded, setStatsLoaded] = useState(false)

  useEffect(() => {
    if (userRole === 'admin') {
      fetchSemesters()
    } else if ((userRole === 'user' || userRole === 'instructor') && collegeId) {
      fetchSemesters()
    }
  }, [collegeId, userRole])

  const fetchSemesters = async () => {
    if ((userRole === 'user' || userRole === 'instructor') && !collegeId) return

    try {
      setLoading(true)
      let query = supabase
        .from('semesters')
        .select('*, academic_years(name_en, name_ar, code, start_date, end_date, registration_open), colleges(id, name_en, name_ar, code)')
        .order('start_date', { ascending: false })

      if ((userRole === 'user' || userRole === 'instructor') && collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      }

      const { data, error } = await query
      if (error) throw error
      
      // Fetch college data separately if needed
      const collegeIds = [...new Set((data || []).filter(s => s.college_id).map(s => s.college_id))]
      let collegesMap = {}
      
      if (collegeIds.length > 0) {
        const { data: collegesData } = await supabase
          .from('colleges')
          .select('id, name_en, name_ar, code')
          .in('id', collegeIds)
        
        if (collegesData) {
          collegesMap = collegesData.reduce((acc, college) => {
            acc[college.id] = college
            return acc
          }, {})
        }
      }
      
      // Attach college data to semesters
      const semestersWithColleges = (data || []).map(semester => ({
        ...semester,
        colleges: semester.college_id ? collegesMap[semester.college_id] : null
      }))
      
      setSemesters(semestersWithColleges)
      calculateKPIs(semestersWithColleges)
      
      // Fetch statistics for each semester
      if (semestersWithColleges.length > 0) {
        fetchSemesterStatistics(semestersWithColleges)
      }
    } catch (err) {
      console.error('Error fetching semesters:', err)
      setSemesters([])
    } finally {
      setLoading(false)
    }
  }

  /**
   * Classes, courses and registered students per semester, from one read of the classes table.
   * "Registered" is the sum of each class's seat counter, the same number the class pages show.
   */
  const fetchSemesterStatistics = async (semesters) => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('id, semester_id, subject_id, enrolled')
        .in('semester_id', semesters.map(s => s.id))
      if (error) throw error

      const stats = {}
      const subjects = {}
      for (const row of data || []) {
        if (!stats[row.semester_id]) {
          stats[row.semester_id] = { enrollmentCount: 0, courseCount: 0, classCount: 0 }
          subjects[row.semester_id] = new Set()
        }
        stats[row.semester_id].classCount += 1
        stats[row.semester_id].enrollmentCount += row.enrolled || 0
        if (row.subject_id) subjects[row.semester_id].add(row.subject_id)
      }
      Object.keys(stats).forEach(id => { stats[id].courseCount = subjects[id].size })
      setSemesterStats(stats)
      setStatsLoaded(true)
    } catch (err) {
      console.error('Error fetching semester statistics:', err)
    }
  }

  const calculateKPIs = (semestersArray) => {
    const semesters = Array.isArray(semestersArray) ? semestersArray : []
    
    if (!semesters || semesters.length === 0) {
      setKpis({
        currentSemester: null,
        activeSemesters: 0,
        registrationStatus: 'closed',
        daysRemaining: 0,
        semesterHealth: 'unknown'
      })
      return
    }

    const now = new Date()
    const running = semesters
      .filter(semester => isRunningSemester(semester, now))
      .sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')))
    const currentSemester = semesters.find(semester => semester.is_current && !isFinishedSemester(semester, now)) || running[0] || null
    const activeSemesters = running.length

    // Registration is "open" when students can register in at least one semester today.
    const openSemester = semesters
      .filter(semester => registrationState(semester, now).allowed)
      .sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')))[0] || null
    const registrationStatus = openSemester ? 'open' : 'closed'

    let daysRemaining = 0
    if (currentSemester) {
      const endDate = new Date(currentSemester.end_date)
      daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))
    }

    const semesterHealth = currentSemester ? 'healthy' : 'unknown'

    setKpis({
      currentSemester,
      activeSemesters,
      registrationStatus,
      openSemester,
      daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
      semesterHealth
    })
  }

  const filteredSemesters = semesters.filter(semester => {
    const name = getLocalizedName(semester, isRTL)
    return name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      semester.code.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const getStatusBadge = (status) => {
    const statusMap = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-600' },
      planned: { bg: 'bg-gray-100', text: 'text-gray-600', key: 'draft' },
      scheduled: { bg: 'bg-blue-100', text: 'text-blue-700' },
      registration_open: { bg: 'bg-green-100', text: 'text-green-700' },
      registration_closed: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
      in_progress: { bg: 'bg-green-100', text: 'text-green-700' },
      active: { bg: 'bg-green-100', text: 'text-green-700', key: 'in_progress' },
      ending: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
      completed: { bg: 'bg-gray-100', text: 'text-gray-500', key: 'closed' },
      closed: { bg: 'bg-gray-100', text: 'text-gray-500' },
      archived: { bg: 'bg-gray-50', text: 'text-gray-400' }
    }
    const style = statusMap[status] || { bg: 'bg-gray-100', text: 'text-gray-600' }
    return (
      <span className={`px-3 py-1 ${style.bg} ${style.text} rounded-full text-xs font-semibold whitespace-nowrap`}>
        {t(`academic.semesters.statusLabels.${style.key || status}`, { defaultValue: String(status || '') })}
      </span>
    )
  }

  /** What is wrong with a semester's setup for registration, if anything. */
  const setupIssues = (semester) => {
    const issues = []
    const stats = semesterStats[semester.id]
    const state = registrationState(semester)
    if (state.allowed && statsLoaded && !(stats?.classCount > 0)) issues.push(t('academic.semesters.issueNoClasses'))
    if (state.allowed && isDraftSemester(semester)) issues.push(t('academic.semesters.issueDraftOpen'))
    if (isDraftSemester(semester) && !isFinishedSemester(semester) && semester.start_date && new Date(semester.start_date) <= new Date()) {
      issues.push(t('academic.semesters.issueDraftStarted', { date: formatDate(semester.start_date) }))
    }
    if (isFinishedSemester(semester) && semester.start_date && new Date(semester.start_date) > new Date()) issues.push(t('academic.semesters.issueClosedBeforeStart'))
    return issues
  }
  const allIssues = semesters.flatMap(semester => setupIssues(semester).map(text => ({ semester, text })))

  const getCollegeName = (semester) => {
    if (semester.is_university_wide) return t('academic.semesters.universityWide')
    if (semester.colleges) return getLocalizedName(semester.colleges, isRTL)
    return t('academic.semesters.collegeSpecific')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('academic.semesters.title')}
        subtitle={t('academic.semesters.subtitle')}
        actions={
          <Button icon={Plus} onClick={() => navigate('/academic/semesters/create')}>
            {t('academic.semesters.create')}
          </Button>
        }
      />

      <Facts
        items={[
          { label: t('academic.semesters.currentSemester'), value: kpis.currentSemester ? (getLocalizedName(kpis.currentSemester, isRTL) || kpis.currentSemester.code) : t('academic.semesters.noCurrent') },
          { label: t('academic.semesters.activeSemesters'), value: kpis.activeSemesters },
          { label: t('academic.semesters.registrationStatus'), value: kpis.registrationStatus === 'open' ? t('academic.semesters.open') : t('academic.semesters.closed') },
          { label: t('academic.semesters.daysRemaining'), value: kpis.daysRemaining },
          { label: t('academic.semesters.semesterHealth'), value: allIssues.length === 0 ? t('academic.semesters.healthy') : t('academic.semesters.needsAttention', { count: allIssues.length }) },
        ]}
      />

      <Register
        toolbar={
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              placeholder={t('academic.semesters.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`${fieldClass} ps-9`}
              aria-label={t('academic.semesters.searchPlaceholder')}
            />
          </div>
        }
      >
        {loading ? (
          <div className="space-y-px p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : filteredSemesters.length === 0 ? (
          <EmptyState icon={CalendarDays} title={t('academic.semesters.title')} hint={t('academic.semesters.searchPlaceholder')} />
        ) : (
          filteredSemesters.map((semester) => {
            const stats = semesterStats[semester.id] || { enrollmentCount: 0, courseCount: 0, classCount: 0 }
            const regState = registrationState(semester)
            const issues = setupIssues(semester)
            return (
              <RegisterRow
                key={semester.id}
                accent={isRunningSemester(semester)}
                mark={<Mark icon={CalendarDays} />}
                title={getLocalizedName(semester, isRTL)}
                code={semester.code}
                tags={
                  <>
                    {getStatusBadge(semester.status)}
                    <Badge>{semester.is_university_wide ? t('academic.semesters.universityWide') : t('academic.semesters.collegeSpecific')}</Badge>
                  </>
                }
                detail={
                  <span className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>{t('academic.semesters.academicYear')}: {getLocalizedName(semester.academic_years, isRTL)}</span>
                    <span>{t('academic.semesters.start')} {formatDate(semester.start_date)}</span>
                    <span>{t('academic.semesters.end')} {formatDate(semester.end_date)}</span>
                    <span>{stats.enrollmentCount} {t('academic.semesters.enrollments')}</span>
                    <span>{stats.courseCount} {t('academic.semesters.courses')}</span>
                    <span>{stats.classCount} {t('academic.semesters.classes')}</span>
                  </span>
                }
                note={
                  <div className={`mt-2 text-xs ${issues.length > 0 ? 'text-amber-800' : regState.allowed ? 'text-emerald-800' : 'text-slate-500'}`}>
                    <div className="font-semibold">{t('academic.semesters.forStudents')} {describeRegistrationState(regState, t, formatDate)}</div>
                    {issues.map((text) => (
                      <div key={text} className="mt-1 flex items-start gap-1.5">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span>{text}</span>
                      </div>
                    ))}
                  </div>
                }
                actions={
                  <>
                    <Button variant="quiet" size="sm" icon={Eye} onClick={() => navigate(`/academic/semesters/${semester.id}`)}>
                      {t('academic.semesters.view')}
                    </Button>
                    <Button size="sm" icon={Edit} onClick={() => navigate(`/academic/semesters/${semester.id}/edit`)}>
                      {t('academic.semesters.edit')}
                    </Button>
                  </>
                }
              />
            )
          })
        )}
      </Register>
    </div>
  )
}
