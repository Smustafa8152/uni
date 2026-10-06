import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, CalendarDays, Search, Eye, Edit, MoreVertical, TrendingUp, Users, Clock, CheckCircle, Calendar, Bell, Lock, Copy, XCircle, Archive } from 'lucide-react'

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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className={isArabicLayout ? 'text-right' : 'text-left'}>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('academic.academicYears.title')}</h1>
          <p className="text-sm text-gray-500">{t('academic.academicYears.subtitle')}</p>
        </div>
        <button
          onClick={() => navigate('/academic/years/create')}
          className={`flex items-center ${isArabicLayout ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} bg-primary-gradient text-white px-6 py-3 rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all`}
        >
          <Plus className="w-4 h-4" />
          <span>{t('academic.academicYears.create')}</span>
        </button>
      </div>

      {/* Current Academic Year Banner */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
        <div className="flex items-center justify-between gap-4">
          <div className={isArabicLayout ? 'text-right' : 'text-left'}>
            <div className="text-xs text-gray-500 mb-1">{t('academic.academicYears.currentAcademicYear')}</div>
            <div className="text-xl font-bold text-gray-900">
              {kpis.currentYear ? (getLocalizedName(kpis.currentYear, isArabicLayout) || kpis.currentYear.code) : (t('common.notAvailable') || 'N/A')}
            </div>
            {kpis.currentYear?.code && (
              <div className="text-sm text-gray-500 mt-1">{kpis.currentYear.code}</div>
            )}
          </div>
          {kpis.currentYear && (
            <span className="px-3 py-1 bg-primary-gradient text-white rounded-full text-xs font-semibold whitespace-nowrap">
              {t('academic.academicYears.current').toUpperCase()}
            </span>
          )}
        </div>
      </div>

      {/* Tier 1 KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-5 mb-8">
        {/* Current Academic Year */}
        <div className="bg-primary-gradient rounded-2xl p-6 text-white shadow-lg">
          <div className={`flex items-start ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} mb-4`}>
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <CalendarDays className="w-6 h-6" />
            </div>
            {kpis.currentYear && (
              <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-semibold">
                {t('academic.academicYears.inProgress').toUpperCase()}
              </span>
            )}
          </div>
          <div className="text-xs opacity-80 mb-1">{t('academic.academicYears.currentAcademicYear')}</div>
          <div className="text-2xl font-bold">
            {kpis.currentYear ? (getLocalizedName(kpis.currentYear, isRTL) || kpis.currentYear.code) : 'N/A'}
          </div>
        </div>

        {/* Active Academic Years */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <div className="mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-400 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="text-xs text-gray-500 mb-1">{t('academic.academicYears.activeYears')}</div>
          <div className="text-3xl font-bold text-gray-900">{kpis.activeYears}</div>
          <div className="text-xs text-green-600 mt-1">{t('academic.academicYears.scheduledInProgress')}</div>
        </div>

        {/* Registration Status */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <div className={`flex items-start ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} mb-4`}>
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-400 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              kpis.registrationStatus === 'open' 
                ? 'bg-green-100 text-green-700' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              {kpis.registrationStatus === 'open' 
                ? t('academic.academicYears.open').toUpperCase() 
                : t('academic.academicYears.closed').toUpperCase()}
            </span>
          </div>
          <div className="text-xs text-gray-500 mb-1">{t('academic.academicYears.registrationStatus')}</div>
          <div className="text-lg font-bold text-gray-900">
            {kpis.registrationStatus === 'open' 
              ? t('academic.academicYears.open') 
              : t('academic.academicYears.closed')}
          </div>
          {kpis.registrationStatus === 'open' && kpis.currentYear && (
            <div className="text-xs text-gray-500 mt-1">{t('academic.academicYears.registrationBySemester')}</div>
          )}
        </div>

        {/* Days Remaining */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <div className="mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-yellow-400 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-white" />
            </div>
          </div>
          <div className="text-xs text-gray-500 mb-1">{t('academic.academicYears.daysRemaining')}</div>
          <div className="text-3xl font-bold text-yellow-600">{kpis.daysRemaining}</div>
          <div className="text-xs text-gray-500 mt-1">{t('academic.academicYears.untilYearEnd')}</div>
        </div>

        {/* Academic Year Health */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200">
          <div className={`flex items-start ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} mb-4`}>
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-400 rounded-xl flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
              kpis.yearHealth === 'healthy' 
                ? 'bg-green-100 text-green-700' 
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {kpis.yearHealth === 'healthy' 
                ? t('academic.academicYears.healthy').toUpperCase() 
                : t('academic.academicYears.warning').toUpperCase()}
            </span>
          </div>
          <div className="text-xs text-gray-500 mb-1">{t('academic.academicYears.yearHealth')}</div>
          <div className={`text-lg font-bold ${
            kpis.yearHealth === 'healthy' ? 'text-green-600' : 'text-yellow-600'
          }`}>
            {kpis.yearHealth === 'healthy' 
              ? t('academic.academicYears.healthy') 
              : t('academic.academicYears.warning')}
          </div>
          <div className="text-xs text-gray-500 mt-1">{t('academic.academicYears.noPendingIssues')}</div>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-6 py-4 mb-6">
        <div className={`flex items-center ${isRTL ? 'space-x-reverse' : 'space-x-3'}`}>
          <Search className="w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder={t('academic.academicYears.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 border-none outline-none text-sm text-gray-900 bg-transparent"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`px-4 py-2 border border-gray-200 rounded-lg text-xs text-gray-500 bg-gray-50 cursor-pointer ${isRTL ? 'text-right' : 'text-left'}`}
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
      </div>

      {/* Academic Years Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredYears.map((year) => {
            // Get semester and enrollment counts from state
            const stats = yearStats[year.id] || { semesterCount: 0, enrollmentCount: 0 }
            const semesterCount = stats.semesterCount
            const enrollmentCount = stats.enrollmentCount
            const normalizedStatus = normalizeStatus(year.status)
            const isClosed = normalizedStatus === 'closed' || normalizedStatus === 'archived'

            return (
              <div
                key={year.id}
                className={`bg-white rounded-2xl overflow-hidden shadow-sm border-2 ${
                  year.is_current ? 'border-primary-500' : 'border-gray-200'
                } ${isClosed ? 'opacity-85' : ''} hover:shadow-md transition-shadow`}
              >
                <div className="p-6">
                  <div className={`flex items-start ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-4'} mb-5`}>
                    <div className={`w-14 h-14 ${
                      normalizedStatus === 'in_progress' ? 'bg-primary-gradient' :
                      normalizedStatus === 'scheduled' ? 'bg-gradient-to-br from-blue-500 to-blue-400' :
                      'bg-gradient-to-br from-gray-400 to-gray-300'
                    } rounded-xl flex items-center justify-center flex-shrink-0`}>
                      <CalendarDays className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} mb-1`}>
                        <h3 className="text-lg font-bold text-gray-900 truncate">{getLocalizedName(year, isRTL)}</h3>
                      </div>
                      <p className="text-sm text-gray-500">{year.code} - {getCollegeName(year)}</p>
                    </div>
                    {year.is_current && (
                      <span className="bg-primary-gradient text-white px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap">
                        {t('academic.academicYears.current').toUpperCase()}
                      </span>
                    )}
                    {!year.is_current && getStatusBadge(normalizedStatus)}
                  </div>

                  {/* Dates Grid */}
                  <div className="grid grid-cols-2 gap-4 mb-5">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">{t('academic.academicYears.startDate')}</div>
                      <div className="text-sm font-semibold text-gray-900">
                        {new Date(year.start_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">{t('academic.academicYears.endDate')}</div>
                      <div className="text-sm font-semibold text-gray-900">
                        {new Date(year.end_date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                  </div>

                  {/* Mini Indicators */}
                  <div className={`flex ${isRTL ? 'space-x-reverse' : 'space-x-4'} py-3 border-t border-b border-gray-200 mb-5`}>
                    <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-1.5'}`}>
                      <CalendarDays className="w-4 h-4 text-gray-500" />
                      <span className="text-xs text-gray-500">
                        <strong className="text-gray-900">{semesterCount}</strong> {t('academic.academicYears.semesters')}
                      </span>
                    </div>
                    <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-1.5'}`}>
                      <Users className="w-4 h-4 text-gray-500" />
                      <span className="text-xs text-gray-500">
                        <strong className="text-gray-900">{enrollmentCount.toLocaleString()}</strong> {t('academic.academicYears.enrollments')}
                      </span>
                    </div>
                  </div>

                  {/* System Control Flags */}
                  <div className={`flex flex-wrap ${isRTL ? 'space-x-reverse' : 'space-x-2'} gap-2 mb-5`}>
                    {year.registration_open && (
                      <span className={`inline-flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-1'} bg-green-100 text-green-700 px-2.5 py-1 rounded-md text-xs font-medium`}>
                        <CheckCircle className="w-3 h-3" />
                        {t('academic.academicYears.registrationOpen')}
                      </span>
                    )}
                    {year.grade_entry_allowed && (
                      <span className={`inline-flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-1'} bg-green-100 text-green-700 px-2.5 py-1 rounded-md text-xs font-medium`}>
                        <CheckCircle className="w-3 h-3" />
                        {t('academic.academicYears.gradesAllowed')}
                      </span>
                    )}
                    {year.attendance_editing_allowed && (
                      <span className={`inline-flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-1'} bg-green-100 text-green-700 px-2.5 py-1 rounded-md text-xs font-medium`}>
                        <CheckCircle className="w-3 h-3" />
                        {t('academic.academicYears.attendanceEdit')}
                      </span>
                    )}
                    {allMasterSwitchesOff(year) && (
                      <span
                        title={t('academic.academicYears.operationsDisabledHint')}
                        className={`inline-flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-1'} bg-amber-50 text-amber-900 border border-amber-200 px-2.5 py-1 rounded-md text-xs font-medium max-w-full cursor-help`}
                      >
                        <Clock className="w-3 h-3 shrink-0" />
                        <span className="leading-snug">{t('academic.academicYears.pendingSetup')}</span>
                      </span>
                    )}
                    {(normalizedStatus === 'closed' || normalizedStatus === 'archived') && (
                      <span className={`inline-flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-1'} bg-gray-100 text-gray-500 px-2.5 py-1 rounded-md text-xs font-medium`}>
                        <Lock className="w-3 h-3" />
                        {t('academic.academicYears.readOnly')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-3 border-t border-gray-200">
                  <button
                    onClick={() => navigate(`/academic/years/${year.id}`)}
                    className={`flex items-center justify-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-1.5'} py-3.5 text-gray-500 text-xs font-medium border-r border-gray-200 hover:bg-gray-50 transition-colors`}
                  >
                    <Eye className="w-4 h-4" />
                    {t('common.view')}
                  </button>
                  {!isClosed ? (
                    <button
                      onClick={() => navigate(`/academic/years/${year.id}/edit`)}
                      className={`flex items-center justify-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-1.5'} py-3.5 text-primary-600 text-xs font-semibold bg-blue-50 border-r border-gray-200 hover:bg-blue-100 transition-colors`}
                    >
                      <Edit className="w-4 h-4" />
                      {t('common.edit')}
                    </button>
                  ) : (
                    <span className={`flex items-center justify-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-1.5'} py-3.5 text-gray-300 text-xs font-medium border-r border-gray-200 cursor-not-allowed`}>
                      <Lock className="w-4 h-4" />
                      {t('academic.academicYears.locked')}
                    </span>
                  )}
                  <div className="relative dropdown-container">
                    <button
                      onClick={() => toggleDropdown(year.id)}
                      className={`flex items-center justify-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-1.5'} py-3.5 text-gray-500 text-xs font-medium w-full hover:bg-gray-50 transition-colors`}
                    >
                      <MoreVertical className="w-4 h-4" />
                      {t('common.actions')}
                    </button>
                    {openDropdown === year.id && (
                      <div className={`absolute ${isRTL ? 'left-0' : 'right-0'} bottom-full mb-1 bg-white rounded-xl shadow-xl min-w-[200px] z-10 overflow-hidden border border-gray-200`}>
                        {normalizedStatus === 'scheduled' && !year.is_current && (
                          <button
                            onClick={() => handleSetAsCurrent(year.id, year.is_university_wide, year.college_id)}
                            className={`w-full text-left px-4 py-3 text-xs text-gray-900 hover:bg-gray-50 border-b border-gray-100 flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}
                          >
                            <CheckCircle className="w-4 h-4 text-primary-600" />
                            <span>{t('academic.academicYears.setAsCurrent')}</span>
                          </button>
                        )}
                        {statusTransitions[normalizedStatus] && (
                          <button
                            onClick={() => handleAdvanceStatus(year)}
                            className={`w-full text-left px-4 py-3 text-xs text-gray-900 hover:bg-gray-50 border-b border-gray-100 flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}
                          >
                            <TrendingUp className="w-4 h-4 text-amber-600" />
                            <span>{`${t('academic.academicYears.moveTo', 'Move to')}: ${getStatusLabel(statusTransitions[normalizedStatus])}`}</span>
                          </button>
                        )}
                        <button
                          onClick={() => handleCloneYear(year)}
                          className={`w-full text-left px-4 py-3 text-xs text-gray-900 hover:bg-gray-50 border-b border-gray-100 flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}
                        >
                          <Copy className="w-4 h-4 text-green-600" />
                          <span>{t('academic.academicYears.cloneYear')}</span>
                        </button>
                        {normalizedStatus === 'draft' && (
                          <button
                            onClick={() => {
                              // TODO: Implement delete
                              setOpenDropdown(null)
                            }}
                            className={`w-full text-left px-4 py-3 text-xs text-red-600 hover:bg-red-50 flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}
                          >
                            <XCircle className="w-4 h-4" />
                            <span>{t('common.delete')}</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
