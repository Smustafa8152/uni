import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, CalendarDays, Search, Eye, Edit, MoreVertical, TrendingUp, Clock, CheckCircle, Lock, Copy, XCircle } from 'lucide-react'
import { Badge, Button, EmptyState, PageHeader, Skeleton } from '../../components/ui'
import { Facts, Mark, Register, RegisterRow, fieldClass } from '../../components/academic/catalogUi'

function formatYearDate(value, isArabic) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(isArabic ? 'ar-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AcademicYears() {
  const { t, i18n } = useTranslation()
  const { isRTL } = useLanguage()
  const isArabicLayout = isRTL ||
    i18n?.language?.toLowerCase()?.startsWith('ar') ||
    (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl')
  const navigate = useNavigate()
  const { userRole, collegeId } = useAuth()
  const [academicYears, setAcademicYears] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [kpis, setKpis] = useState({
    currentYear: null,
    activeYears: 0,
    registrationStatus: 'closed',
    daysRemaining: 0,
    yearHealth: 'healthy'
  })
  const [openDropdown, setOpenDropdown] = useState(null)
  const [yearStats, setYearStats] = useState({}) // Store semester and enrollment counts per year
  const statusTransitions = {
    draft: 'scheduled',
    scheduled: 'in_progress',
    in_progress: 'closing',
    closing: 'closed',
    closed: 'archived',
    archived: null
  }
  const statusTranslationKeys = {
    draft: 'statusDraft',
    scheduled: 'statusScheduled',
    in_progress: 'statusInProgress',
    closing: 'statusClosing',
    closed: 'statusClosed',
    archived: 'statusArchived'
  }
  const legacyStatusMap = {
    planned: 'draft',
    active: 'in_progress',
    completed: 'closed'
  }
  const normalizeStatus = (status) => legacyStatusMap[status] || status

  /** True when all master switches are off (not about empty year fields). Matches status filter "pending_setup". */
  const allMasterSwitchesOff = (year) => {
    const normalized = normalizeStatus(year.status)
    if (normalized === 'closed' || normalized === 'archived') return false
    return (
      !year.registration_open &&
      !year.grade_entry_allowed &&
      !year.attendance_editing_allowed &&
      !year.financial_posting_allowed
    )
  }

  useEffect(() => {
    fetchAcademicYears()
  }, [collegeId, userRole])

  const fetchAcademicYears = async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('academic_years')
        .select('*')
        .order('start_date', { ascending: false })

      if (userRole === 'user' && collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      }

      const { data, error } = await query
      if (error) throw error
      
      // Fetch college data separately if college_id exists
      const collegeIds = [...new Set((data || []).filter(ay => ay.college_id).map(ay => ay.college_id))]
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
      
      // Attach college data to academic years
      const academicYearsWithColleges = (data || []).map(year => ({
        ...year,
        colleges: year.college_id ? collegesMap[year.college_id] : null
      }))
      
      setAcademicYears(academicYearsWithColleges)
      calculateKPIs(academicYearsWithColleges)
      
      // Fetch statistics for each academic year
      if (academicYearsWithColleges.length > 0) {
        fetchYearStatistics(academicYearsWithColleges)
      }
    } catch (err) {
      console.error('Error fetching academic years:', err)
    } finally {
      setLoading(false)
    }
  }

  /**
   * Semesters and registered students per academic year, from two quick reads.
   * "Registered" is the sum of the class seat counters of the year's semesters.
   */
  const fetchYearStatistics = async (years) => {
    try {
      const yearIds = years.map(year => year.id)
      const { data: semesters, error: semError } = await supabase
        .from('semesters')
        .select('id, academic_year_id')
        .in('academic_year_id', yearIds)
      if (semError) throw semError

      const stats = {}
      yearIds.forEach(id => { stats[id] = { semesterCount: 0, enrollmentCount: 0 } })
      const yearOfSemester = {}
      for (const semester of semesters || []) {
        yearOfSemester[semester.id] = semester.academic_year_id
        if (stats[semester.academic_year_id]) stats[semester.academic_year_id].semesterCount += 1
      }
      setYearStats({ ...stats })

      const semesterIds = Object.keys(yearOfSemester)
      if (semesterIds.length > 0) {
        const { data: classes, error: classError } = await supabase
          .from('classes')
          .select('semester_id, enrolled')
          .in('semester_id', semesterIds)
        if (classError) throw classError
        for (const row of classes || []) {
          const yearId = yearOfSemester[row.semester_id]
          if (stats[yearId]) stats[yearId].enrollmentCount += row.enrolled || 0
        }
        setYearStats({ ...stats })
      }
    } catch (err) {
      console.error('Error fetching year statistics:', err)
    }
  }

  const calculateKPIs = (years) => {
    // Ensure years is always an array - use provided years, fallback to academicYears state, or empty array
    const yearsArray = Array.isArray(years) ? years : (Array.isArray(academicYears) ? academicYears : [])
    
    if (!yearsArray || yearsArray.length === 0) {
      setKpis({
        currentYear: null,
        activeYears: 0,
        registrationStatus: 'closed',
        daysRemaining: 0,
        yearHealth: 'unknown'
      })
      return
    }

    const now = new Date()
    // The year marked "current" wins; a year that is merely in progress today is the fallback.
    const currentYear = yearsArray.find(year => year.is_current) || yearsArray.find(year => {
      const start = new Date(year.start_date)
      const end = new Date(year.end_date)
      return now >= start && now <= end && normalizeStatus(year.status) === 'in_progress'
    })

    const activeYears = yearsArray.filter(year => 
      ['scheduled', 'in_progress'].includes(normalizeStatus(year.status))
    ).length

    const registrationStatus = currentYear?.registration_open ? 'open' : 'closed'
    
    let daysRemaining = 0
    if (currentYear) {
      const endDate = new Date(currentYear.end_date)
      daysRemaining = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24))
    }

    // Calculate year health (simplified - can be enhanced)
    const yearHealth = currentYear ? 'healthy' : 'unknown'

    setKpis({
      currentYear,
      activeYears,
      registrationStatus,
      daysRemaining: daysRemaining > 0 ? daysRemaining : 0,
      yearHealth
    })
  }

  const filteredYears = academicYears.filter(year => {
    const name = getLocalizedName(year, isRTL)
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      year.code.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = (() => {
      if (!statusFilter) return true

      const normalizedStatus = normalizeStatus(year.status)
      const isReadOnly = normalizedStatus === 'closed' || normalizedStatus === 'archived'
      const isPendingSetup = allMasterSwitchesOff(year)

      switch (statusFilter) {
        case 'pending_setup':
          return isPendingSetup
        case 'registration_open':
          return year.registration_open
        case 'grade_entry_allowed':
          return year.grade_entry_allowed
        case 'attendance_editing_allowed':
          return year.attendance_editing_allowed
        case 'financial_posting_allowed':
          return year.financial_posting_allowed
        case 'current':
          return year.is_current
        case 'read_only':
          return isReadOnly
        default:
          // Lifecycle enum statuses from academic_year_status
          return normalizedStatus === statusFilter
      }
    })()
    return matchesSearch && matchesStatus
  })

  const getStatusBadge = (status) => {
    const normalized = normalizeStatus(status)
    const statusMap = {
      draft: { bg: 'bg-gray-100', text: 'text-gray-800', label: t('academic.academicYears.statusDraft') },
      scheduled: { bg: 'bg-blue-100', text: 'text-blue-700', label: t('academic.academicYears.statusScheduled') },
      in_progress: { bg: 'bg-primary-gradient', text: 'text-white', label: t('academic.academicYears.statusInProgress') },
      closing: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: t('academic.academicYears.statusClosing') },
      closed: { bg: 'bg-gray-100', text: 'text-gray-500', label: t('academic.academicYears.statusClosed') },
      archived: { bg: 'bg-gray-50', text: 'text-gray-500', label: t('academic.academicYears.statusArchived') }
    }
    const style = statusMap[normalized] || statusMap.draft
    return (
      <span className={`px-3 py-1 ${style.bg} ${style.text} rounded-full text-xs font-semibold whitespace-nowrap`}>
        {getStatusLabel(normalized).toUpperCase()}
      </span>
    )
  }

  const getCollegeName = (year) => {
    if (year.is_university_wide) return t('academic.academicYears.universityWideLabel')
    if (year.colleges) return getLocalizedName(year.colleges, isRTL)
    return t('academic.academicYears.collegeSpecific')
  }

  const toggleDropdown = (id) => {
    setOpenDropdown(openDropdown === id ? null : id)
  }

  const getStatusLabel = (status) => {
    const normalized = normalizeStatus(status)
    if (!normalized) return 'N/A'
    const translationKey = statusTranslationKeys[normalized]
    return translationKey ? t(`academic.academicYears.${translationKey}`) : normalized
  }

  const handleSetAsCurrent = async (yearId, isUniversityWide, collegeId) => {
    try {
      // First, unset all other current years (respecting scope)
      let unsetQuery = supabase
        .from('academic_years')
        .update({ is_current: false })
        .eq('is_current', true)
      
      // If this is a college-specific year, only unset other years for the same college
      if (!isUniversityWide && collegeId) {
        unsetQuery = unsetQuery.eq('college_id', collegeId)
      } else if (isUniversityWide) {
        // If setting a university-wide year as current, unset all university-wide years
        unsetQuery = unsetQuery.eq('is_university_wide', true)
      }
      
      const { error: unsetError } = await unsetQuery
      if (unsetError) throw unsetError
      
      // Now set this year as current
      const { error: setError } = await supabase
        .from('academic_years')
        .update({ is_current: true, status: 'in_progress' })
        .eq('id', yearId)
      
      if (setError) throw setError
      
      // Refresh the list
      fetchAcademicYears()
      setOpenDropdown(null)
    } catch (err) {
      console.error('Error setting academic year as current:', err)
      alert(err.message || 'Failed to set academic year as current')
    }
  }

  const handleAdvanceStatus = async (year) => {
    try {
      const nextStatus = statusTransitions[normalizeStatus(year.status)]
      if (!nextStatus) return
      if (!confirm(`${t('academic.academicYears.moveTo', 'Move to')}: ${getStatusLabel(nextStatus)}?`)) return

      const { data: { user } } = await supabase.auth.getUser()
      const userEmail = user?.email || null

      const updateData = {
        status: nextStatus,
        last_status_change: new Date().toISOString(),
        last_status_change_by: userEmail,
        last_status_change_reason: 'advance_status'
      }

      if (nextStatus === 'closing') {
        updateData.registration_open = false
      }
      if (nextStatus === 'closed' || nextStatus === 'archived') {
        updateData.registration_open = false
        updateData.grade_entry_allowed = false
        updateData.attendance_editing_allowed = false
        updateData.financial_posting_allowed = false
        updateData.is_current = false
      }

      const { error } = await supabase
        .from('academic_years')
        .update(updateData)
        .eq('id', year.id)

      if (error) throw error
      await fetchAcademicYears()
      setOpenDropdown(null)
    } catch (err) {
      console.error('Error advancing academic year status:', err)
      alert(err.message || 'Failed to advance status')
    }
  }

  const handleCloneYear = async (year) => {
    try {
      if (!confirm(t('academic.academicYears.cloneConfirm', 'Create a draft copy of this academic year?'))) return

      const { data: { user } } = await supabase.auth.getUser()
      const userEmail = user?.email || null

      let cloneCode = `${year.code}-copy`
      let counter = 1
      while (true) {
        const { data: existing } = await supabase
          .from('academic_years')
          .select('id')
          .eq('code', cloneCode)
          .maybeSingle()

        if (!existing) break
        cloneCode = `${year.code}-copy-${counter}`
        counter++
      }

      const cloneData = {
        name_en: `${year.name_en} (Copy)`,
        name_ar: year.name_ar ? `${year.name_ar} (نسخة)` : null,
        code: cloneCode,
        start_date: year.start_date,
        end_date: year.end_date,
        description: year.description,
        description_ar: year.description_ar,
        is_university_wide: year.is_university_wide,
        college_id: year.college_id,
        status: 'draft',
        is_current: false,
        registration_open: false,
        grade_entry_allowed: false,
        attendance_editing_allowed: false,
        financial_posting_allowed: false,
        created_by: userEmail
      }

      const { data: clonedYear, error: cloneError } = await supabase
        .from('academic_years')
        .insert(cloneData)
        .select()
        .single()

      if (cloneError) throw cloneError
      setOpenDropdown(null)
      if (clonedYear?.id) {
        navigate(`/academic/years/${clonedYear.id}`)
      } else {
        fetchAcademicYears()
      }
    } catch (err) {
      console.error('Error cloning academic year:', err)
      alert(err.message || 'Failed to clone academic year')
    }
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.dropdown-container')) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('academic.academicYears.title')}
        subtitle={t('academic.academicYears.subtitle')}
        actions={
          <Button icon={Plus} onClick={() => navigate('/academic/years/create')}>
            {t('academic.academicYears.create')}
          </Button>
        }
      />

      <Facts
        items={[
          { label: t('academic.academicYears.currentAcademicYear'), value: kpis.currentYear ? (getLocalizedName(kpis.currentYear, isRTL) || kpis.currentYear.code) : '—' },
          { label: t('academic.academicYears.activeYears'), value: kpis.activeYears },
          { label: t('academic.academicYears.registrationStatus'), value: kpis.registrationStatus === 'open' ? t('academic.academicYears.open') : t('academic.academicYears.closed') },
          { label: t('academic.academicYears.daysRemaining'), value: kpis.daysRemaining },
          { label: t('academic.academicYears.yearHealth'), value: kpis.yearHealth === 'healthy' ? t('academic.academicYears.healthy') : t('academic.academicYears.warning') },
        ]}
      />

      <Register
        toolbar={
          <div className="grid gap-3 md:grid-cols-[1fr_16rem]">
            <div className="relative">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="text"
                placeholder={t('academic.academicYears.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${fieldClass} ps-9`}
                aria-label={t('academic.academicYears.searchPlaceholder')}
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={fieldClass}
              aria-label={t('academic.academicYears.allStatuses')}
            >
              <option value="">{t('academic.academicYears.allStatuses')}</option>
              <option value="draft">{t('academic.academicYears.statusDraft')}</option>
              <option value="scheduled">{t('academic.academicYears.statusScheduled')}</option>
              <option value="in_progress">{t('academic.academicYears.statusInProgress')}</option>
              <option value="closing">{t('academic.academicYears.statusClosing')}</option>
              <option value="closed">{t('academic.academicYears.statusClosed')}</option>
              <option value="archived">{t('academic.academicYears.statusArchived')}</option>
              <option value="pending_setup">{t('academic.academicYears.pendingSetup')}</option>
              <option value="registration_open">{t('academic.academicYears.registrationOpen')}</option>
              <option value="grade_entry_allowed">{t('academic.academicYears.gradeEntryAllowed')}</option>
              <option value="attendance_editing_allowed">{t('academic.academicYears.attendanceEditing')}</option>
              <option value="financial_posting_allowed">{t('academic.academicYears.financialPosting')}</option>
              <option value="current">{t('academic.academicYears.current')}</option>
              <option value="read_only">{t('academic.academicYears.readOnly')}</option>
            </select>
          </div>
        }
      >
        {loading ? (
          <div className="space-y-px p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : filteredYears.length === 0 ? (
          <EmptyState icon={CalendarDays} title={t('academic.academicYears.title')} hint={t('academic.academicYears.searchPlaceholder')} />
        ) : (
          filteredYears.map((year) => {
            const stats = yearStats[year.id] || { semesterCount: 0, enrollmentCount: 0 }
            const normalizedStatus = normalizeStatus(year.status)
            const isClosed = normalizedStatus === 'closed' || normalizedStatus === 'archived'

            return (
              <RegisterRow
                key={year.id}
                accent={year.is_current}
                mark={<Mark icon={CalendarDays} />}
                title={getLocalizedName(year, isRTL)}
                code={year.code}
                tags={year.is_current ? <Badge tone="gold">{t('academic.academicYears.current')}</Badge> : getStatusBadge(normalizedStatus)}
                detail={
                  <span className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>{getCollegeName(year)}</span>
                    <span>{t('academic.academicYears.startDate')} {formatYearDate(year.start_date, isRTL)}</span>
                    <span>{t('academic.academicYears.endDate')} {formatYearDate(year.end_date, isRTL)}</span>
                    <span>{stats.semesterCount} {t('academic.academicYears.semesters')}</span>
                    <span>{stats.enrollmentCount.toLocaleString(isRTL ? 'ar-u-nu-latn' : 'en')} {t('academic.academicYears.enrollments')}</span>
                  </span>
                }
                note={
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {year.registration_open && <Badge tone="ok" icon={CheckCircle}>{t('academic.academicYears.registrationOpen')}</Badge>}
                    {year.grade_entry_allowed && <Badge tone="ok" icon={CheckCircle}>{t('academic.academicYears.gradesAllowed')}</Badge>}
                    {year.attendance_editing_allowed && <Badge tone="ok" icon={CheckCircle}>{t('academic.academicYears.attendanceEdit')}</Badge>}
                    {allMasterSwitchesOff(year) && (
                      <Badge tone="warn" icon={Clock} title={t('academic.academicYears.operationsDisabledHint')}>
                        {t('academic.academicYears.pendingSetup')}
                      </Badge>
                    )}
                    {isClosed && <Badge icon={Lock}>{t('academic.academicYears.readOnly')}</Badge>}
                  </div>
                }
                actions={
                  <>
                    <Button variant="quiet" size="sm" icon={Eye} onClick={() => navigate(`/academic/years/${year.id}`)}>
                      {t('common.view')}
                    </Button>
                    {isClosed ? (
                      <Button variant="quiet" size="sm" icon={Lock} disabled>
                        {t('academic.academicYears.locked')}
                      </Button>
                    ) : (
                      <Button size="sm" icon={Edit} onClick={() => navigate(`/academic/years/${year.id}/edit`)}>
                        {t('common.edit')}
                      </Button>
                    )}
                    <div className="relative dropdown-container">
                      <Button variant="quiet" size="sm" icon={MoreVertical} onClick={() => toggleDropdown(year.id)}>
                        {t('common.actions')}
                      </Button>
                      {openDropdown === year.id && (
                        <div className="absolute bottom-full end-0 z-10 mb-1 min-w-[200px] overflow-hidden rounded-xl border border-[#dde3ef] bg-white shadow-xl">
                          {normalizedStatus === 'scheduled' && !year.is_current && (
                            <button
                              onClick={() => handleSetAsCurrent(year.id, year.is_university_wide, year.college_id)}
                              className="flex w-full items-center gap-2 border-b border-[#eef2f9] px-4 py-3 text-start text-xs text-slate-800 hover:bg-slate-50"
                            >
                              <CheckCircle className="h-4 w-4 text-[#1a3a6b]" />
                              <span>{t('academic.academicYears.setAsCurrent')}</span>
                            </button>
                          )}
                          {statusTransitions[normalizedStatus] && (
                            <button
                              onClick={() => handleAdvanceStatus(year)}
                              className="flex w-full items-center gap-2 border-b border-[#eef2f9] px-4 py-3 text-start text-xs text-slate-800 hover:bg-slate-50"
                            >
                              <TrendingUp className="h-4 w-4 text-amber-600" />
                              <span>{`${t('academic.academicYears.moveTo', 'Move to')}: ${getStatusLabel(statusTransitions[normalizedStatus])}`}</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleCloneYear(year)}
                            className="flex w-full items-center gap-2 border-b border-[#eef2f9] px-4 py-3 text-start text-xs text-slate-800 hover:bg-slate-50"
                          >
                            <Copy className="h-4 w-4 text-emerald-700" />
                            <span>{t('academic.academicYears.cloneYear')}</span>
                          </button>
                          {normalizedStatus === 'draft' && (
                            <button
                              onClick={() => setOpenDropdown(null)}
                              className="flex w-full items-center gap-2 px-4 py-3 text-start text-xs text-red-700 hover:bg-red-50"
                            >
                              <XCircle className="h-4 w-4" />
                              <span>{t('common.delete')}</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
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
