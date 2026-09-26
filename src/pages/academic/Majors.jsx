import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  Plus, BookMarked, Search, Eye, Edit, Users, GraduationCap,
  TrendingUp, FileText, CheckCircle, Download, Loader2
} from 'lucide-react'
import { exportMajorsList } from '../../utils/exportMajors'

export default function Majors() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const navigate = useNavigate()
  const { userRole, collegeId } = useAuth()
  const [majors, setMajors] = useState([])
  const [colleges, setColleges] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [collegeFilter, setCollegeFilter] = useState('')
  const [degreeLevelFilter, setDegreeLevelFilter] = useState('')
  const [kpis, setKpis] = useState({
    activeMajors: 0,
    totalEnrolled: 0,
    admissionFunnel: 78,
    graduationReady: 0,
    healthy: 0,
    attention: 0,
    critical: 0
  })
  const [majorStats, setMajorStats] = useState({})
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    fetchMajors()
    if (userRole === 'admin') fetchColleges()
  }, [collegeId, userRole])

  const fetchColleges = async () => {
    try {
      const { data } = await supabase
        .from('colleges')
        .select('id, name_en, name_ar, code')
        .eq('status', 'active')
        .order('name_en')
      setColleges(data || [])
    } catch (err) {
      console.error('Error fetching colleges:', err)
    }
  }

  const fetchMajors = async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('majors')
        .select('*, colleges(id, name_en, name_ar, code)')
        .order('name_en')

      if (userRole === 'user' && collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      }

      const { data, error } = await query
      if (error) throw error

      const majorsList = data || []
      setMajors(majorsList)
      fetchMajorStats(majorsList)
      calculateKPIs(majorsList)
    } catch (err) {
      console.error('Error fetching majors:', err)
      setMajors([])
    } finally {
      setLoading(false)
    }
  }

  const fetchMajorStats = async (majorsList) => {
    const stats = {}
    for (const major of majorsList) {
      const { count: enrolledCount } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('major_id', major.id)
        .eq('status', 'active')

      const { data: sheets } = await supabase
        .from('major_sheets')
        .select('id, version, academic_year, sheet_status')
        .eq('major_id', major.id)
        .order('effective_from', { ascending: false })
        .limit(1)

      const activeSheet = (sheets || []).find(s => s.sheet_status === 'active') || sheets?.[0]
      const degreePlanLabel = activeSheet ? `${activeSheet.version || activeSheet.academic_year}` : null

      const { count: graduatingCount } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('major_id', major.id)
        .eq('status', 'active')
        .gte('total_credits_earned', (major.total_credits || 120) - 15)

      stats[major.id] = {
        enrolledCount: enrolledCount || 0,
        graduatingCount: graduatingCount || 0,
        degreePlanVersion: degreePlanLabel,
        hasDegreePlan: !!activeSheet
      }
    }
    setMajorStats(stats)
  }

  const calculateKPIs = (majorsList) => {
    const active = (majorsList || []).filter(m => (m.major_status || m.status) === 'active').length
    const open = (majorsList || []).filter(m => (m.major_status || m.status) === 'open_for_admission').length
    const draft = (majorsList || []).filter(m => (m.major_status || m.status) === 'draft').length
    const teachOut = (majorsList || []).filter(m => (m.major_status || m.status) === 'phasing_out').length

    setKpis(prev => ({
      ...prev,
      activeMajors: active,
      openForAdmission: open,
      totalMajors: (majorsList || []).length,
      healthy: Math.max(0, active - 2),
      attention: Math.min(2, Math.max(0, active)),
      critical: Math.min(1, Math.max(0, teachOut))
    }))
  }

  useEffect(() => {
    if (Object.keys(majorStats).length > 0 && majors.length > 0) {
      const totalEnrolled = Object.values(majorStats).reduce((sum, s) => sum + (s.enrolledCount || 0), 0)
      const graduationReady = Object.values(majorStats).reduce((sum, s) => sum + (s.graduatingCount || 0), 0)
      setKpis(prev => ({ ...prev, totalEnrolled, graduationReady }))
    }
  }, [majorStats, majors])

  const getStatusBadge = (major) => {
    const status = major.major_status || major.status
    const statusMap = {
      active: { label: t('academic.majors.statusActive', 'Active'), class: 'bg-green-100 text-green-800' },
      open_for_admission: { label: t('academic.majors.statusOpen', 'Open'), class: 'bg-blue-100 text-blue-800' },
      draft: { label: t('academic.majors.statusDraft', 'Draft'), class: 'bg-gray-100 text-gray-800' },
      suspended: { label: t('academic.majors.statusSuspended', 'Suspended'), class: 'bg-red-100 text-red-800' },
      phasing_out: { label: t('academic.majors.statusTeachOut', 'Teach-Out'), class: 'bg-amber-100 text-amber-800' },
      archived: { label: t('academic.majors.statusArchived', 'Archived'), class: 'bg-gray-100 text-gray-600' }
    }
    const config = statusMap[status] || statusMap.active
    return <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${config.class}`}>{config.label}</span>
  }

  const getHealthIndicator = (major, stats) => {
    const s = stats[major.id] || {}
    const status = major.major_status || major.status
    if (status === 'phasing_out' || status === 'archived') return { label: t('academic.majors.healthCritical', 'Critical'), color: 'text-red-500', dot: 'bg-red-500' }
    if (!s.hasDegreePlan || (major.accreditation_expiry && new Date(major.accreditation_expiry) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000))) {
      return { label: t('academic.majors.healthAttention', 'Attention'), color: 'text-amber-500', dot: 'bg-amber-500' }
    }
    return { label: t('academic.majors.healthHealthy', 'Healthy'), color: 'text-green-500', dot: 'bg-green-500' }
  }

  const filteredMajors = majors.filter(major => {
    const matchesSearch = !searchQuery || 
      getLocalizedName(major, isRTL)?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      major.code?.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = !statusFilter || (major.major_status || major.status) === statusFilter
    const matchesCollege = !collegeFilter || major.college_id === parseInt(collegeFilter) || major.is_university_wide
    const matchesDegree = !degreeLevelFilter || major.degree_level === degreeLevelFilter
    return matchesSearch && matchesStatus && matchesCollege && matchesDegree
  })

  const handleExportExcel = () => {
    if (!filteredMajors.length || exporting) return
    try {
      setExporting(true)
      exportMajorsList({
        majors: filteredMajors,
        majorStats,
        isArabic: isRTL,
      })
    } catch (err) {
      console.error('Export majors failed:', err)
      alert(err?.message || t('academic.majors.exportFailed', 'Export failed.'))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'}`}>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('academic.majors.title')}</h1>
          <p className="text-gray-600 mt-1">{t('academic.majors.subtitle')}</p>
        </div>
        <div className={`flex flex-wrap items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <button
            type="button"
            disabled={exporting || loading || filteredMajors.length === 0}
            onClick={handleExportExcel}
            className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-5 py-3 rounded-xl font-semibold border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all`}
          >
            {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
            <span>{t('academic.majors.exportExcel', 'Export Excel')}</span>
          </button>
          <button
            onClick={() => navigate('/academic/majors/create')}
            className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} bg-primary-gradient text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all`}
          >
            <Plus className="w-5 h-5" />
            <span>{t('academic.majors.create')}</span>
          </button>
        </div>
      </div>

      {/* Tier 1 KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 border-l-4 border-l-blue-500">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t('academic.majors.kpiActiveMajors', 'Active Majors')}</div>
              <div className="text-2xl font-bold text-gray-900">{kpis.activeMajors}</div>
              <div className="text-xs text-green-600 mt-1">↑ {kpis.totalMajors - kpis.activeMajors} from total</div>
            </div>
            <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center">
              <BookMarked className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 border-l-4 border-l-green-500">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t('academic.majors.kpiTotalEnrolled', 'Total Enrolled')}</div>
              <div className="text-2xl font-bold text-gray-900">{kpis.totalEnrolled}</div>
              <div className="text-xs text-green-600 mt-1">↑ 15% vs last year</div>
            </div>
            <div className="w-11 h-11 bg-gradient-to-br from-green-500 to-green-700 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 border-l-4 border-l-violet-500">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t('academic.majors.kpiAdmissionFunnel', 'Admission Funnel')}</div>
              <div className="text-2xl font-bold text-gray-900">{kpis.admissionFunnel}%</div>
              <div className="text-xs text-gray-500 mt-1">{t('academic.majors.kpiYieldRate', 'Yield Rate')}</div>
            </div>
            <div className="w-11 h-11 bg-gradient-to-br from-violet-500 to-violet-700 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 border-l-4 border-l-amber-500">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t('academic.majors.kpiGraduationReady', 'Graduation Ready')}</div>
              <div className="text-2xl font-bold text-gray-900">{kpis.graduationReady}</div>
              <div className="text-xs text-gray-500 mt-1">{t('academic.majors.kpiCandidatesThisYear', 'Candidates this year')}</div>
            </div>
            <div className="w-11 h-11 bg-gradient-to-br from-amber-500 to-amber-700 rounded-lg flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 border-l-4 border-l-green-500">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{t('academic.majors.kpiPortfolioHealth', 'Portfolio Health')}</div>
              <div className="flex gap-2 mt-2 flex-wrap">
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">{kpis.healthy} {t('academic.majors.healthHealthy', 'Healthy')}</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">{kpis.attention} {t('academic.majors.healthAttention', 'Attention')}</span>
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">{kpis.critical} {t('academic.majors.healthCritical', 'Critical')}</span>
              </div>
            </div>
            <div className="w-11 h-11 bg-gradient-to-br from-green-500 to-green-700 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
        <div className={`flex gap-4 items-center flex-wrap ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className="flex-1 min-w-[200px] relative">
            <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400`} />
            <input
              type="text"
              placeholder={t('academic.majors.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
            />
          </div>
          {userRole === 'admin' && (
            <select
              value={collegeFilter}
              onChange={(e) => setCollegeFilter(e.target.value)}
              className="py-3 px-4 border border-gray-300 rounded-lg min-w-[160px] focus:ring-2 focus:ring-primary-500"
            >
              <option value="">{t('academic.majors.filterAllColleges', 'All Colleges')}</option>
              {colleges.map(c => (
                <option key={c.id} value={c.id}>{getLocalizedName(c, isRTL)}</option>
              ))}
            </select>
          )}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-3 px-4 border border-gray-300 rounded-lg min-w-[160px] focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t('academic.majors.filterAllStatuses', 'All Statuses')}</option>
            <option value="open_for_admission">{t('academic.majors.statusOpen', 'Open for Admission')}</option>
            <option value="active">{t('academic.majors.statusActive', 'Active')}</option>
            <option value="phasing_out">{t('academic.majors.statusTeachOut', 'Teach-Out')}</option>
            <option value="suspended">{t('academic.majors.statusSuspended', 'Suspended')}</option>
            <option value="draft">{t('academic.majors.statusDraft', 'Draft')}</option>
          </select>
          <select
            value={degreeLevelFilter}
            onChange={(e) => setDegreeLevelFilter(e.target.value)}
            className="py-3 px-4 border border-gray-300 rounded-lg min-w-[160px] focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t('academic.majors.filterAllDegreeLevels', 'All Degree Levels')}</option>
            <option value="bachelor">{t('academic.majors.bachelor')}</option>
            <option value="master">{t('academic.majors.master')}</option>
            <option value="diploma">{t('academic.majors.diploma')}</option>
            <option value="phd">{t('academic.majors.phd')}</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredMajors.map((major) => {
            const stats = majorStats[major.id] || {}
            const health = getHealthIndicator(major, majorStats)
            return (
              <div
                key={major.id}
                className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 hover:shadow-lg hover:-translate-y-0.5 transition-all overflow-hidden"
              >
                <div className={`flex gap-4 mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className="w-12 h-12 bg-gradient-to-br from-sky-100 to-sky-200 rounded-lg flex items-center justify-center flex-shrink-0">
                    <BookMarked className="w-6 h-6 text-sky-600" />
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className={`flex justify-between items-start gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <h3 className="font-semibold text-gray-900 truncate">{getLocalizedName(major, isRTL)}</h3>
                        <div className="text-sm text-gray-500 truncate">{major.code}</div>
                      </div>
                      <span className="flex-shrink-0">{getStatusBadge(major)}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-lg mb-4">
                  <div>
                    <div className="text-xs text-gray-500">{t('academic.majors.college')}</div>
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {major.is_university_wide ? t('academic.majors.universityWide') : (getLocalizedName(major.colleges, isRTL) || '-')}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">{t('academic.majors.degreeLevel')}</div>
                    <div className="text-sm font-medium text-gray-900 capitalize">{major.degree_level || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">{t('academic.majors.totalCredits')}</div>
                    <div className="text-sm font-medium text-gray-900">{major.total_credits || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">{t('academic.majors.degreePlan')}</div>
                    <div className="text-sm font-medium text-gray-900">
                      {stats.degreePlanVersion || t('academic.majors.degreePlanNotConfigured', 'Not Configured')}
                    </div>
                  </div>
                </div>

                <div className={`flex gap-4 mb-4 pb-4 border-b border-gray-200 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className={`flex items-center gap-1.5 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <Users className="w-4 h-4 text-gray-500" />
                    <span className="text-xs text-gray-600">
                      <strong className="text-gray-900">{stats.enrolledCount || 0}</strong> {t('academic.majors.enrolled', 'Enrolled')}
                    </span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <GraduationCap className="w-4 h-4 text-gray-500" />
                    <span className="text-xs text-gray-600">
                      <strong className="text-gray-900">{stats.graduatingCount || 0}</strong> {t('academic.majors.graduating', 'Graduating')}
                    </span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${health.color} ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-2 h-2 rounded-full ${health.dot}`}></div>
                    <span className="text-xs font-medium">{health.label}</span>
                  </div>
                </div>

                <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <button
                    onClick={() => navigate(`/academic/majors/${major.id}`)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm font-medium ${isRTL ? 'flex-row-reverse' : ''}`}
                  >
                    <Eye className="w-4 h-4" />
                    {t('academic.majors.view')}
                  </button>
                  <button
                    onClick={() => navigate(`/academic/majors/${major.id}/edit`)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-primary-gradient text-white rounded-lg hover:shadow-lg text-sm font-medium ${isRTL ? 'flex-row-reverse' : ''}`}
                  >
                    <Edit className="w-4 h-4" />
                    {t('academic.majors.edit')}
                  </button>
                  <button
                    onClick={() => navigate(`/academic/majors/${major.id}/degree-plan`)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-primary-gradient text-white rounded-lg hover:shadow-lg text-sm font-medium ${isRTL ? 'flex-row-reverse' : ''}`}
                  >
                    <FileText className="w-4 h-4" />
                    {t('academic.majors.degreePlan', 'Degree Plan')}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && filteredMajors.length === 0 && (
        <div className="bg-white rounded-xl p-12 text-center shadow-sm border border-gray-200">
          <BookMarked className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600">{t('academic.majors.noMajorsFound', 'No majors found')}</p>
        </div>
      )}
    </div>
  )
}
