import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import {
  Plus, BookMarked, Search, Eye, Edit, Users, GraduationCap,
  FileText, Download
} from 'lucide-react'
import { Badge, Button, EmptyState, PageHeader, Panel, Skeleton } from '../../components/ui'
import { Stat, fieldClass } from '../../components/academic/catalogUi'
import { exportMajorsList } from '../../utils/exportMajors'
import { isMajorOfferedOnRegistrationForm, legacyMajorRecordStatus } from '../../utils/majorAdmissionStatus'

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
  const [updatingId, setUpdatingId] = useState(null)
  const [statusError, setStatusError] = useState('')

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

  const toggleMajorStatus = async (major) => {
    const offered = isMajorOfferedOnRegistrationForm(major)
    const nextMajorStatus = offered ? 'suspended' : 'active'
    const confirmed = window.confirm(
      offered ? t('academic.majors.confirmDeactivate') : t('academic.majors.confirmActivate')
    )
    if (!confirmed) return

    setUpdatingId(major.id)
    setStatusError('')
    try {
      const { error } = await supabase
        .from('majors')
        .update({
          major_status: nextMajorStatus,
          status: legacyMajorRecordStatus(nextMajorStatus),
        })
        .eq('id', major.id)
      if (error) throw error
      const next = majors.map((row) =>
        row.id === major.id
          ? { ...row, major_status: nextMajorStatus, status: legacyMajorRecordStatus(nextMajorStatus) }
          : row
      )
      setMajors(next)
      calculateKPIs(next)
    } catch (error) {
      console.error('Error updating major status:', error)
      setStatusError(error.message || t('academic.majors.lifecycleUpdateFailed'))
    } finally {
      setUpdatingId(null)
    }
  }

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
    <div className="space-y-5">
      <PageHeader
        title={t('academic.majors.title')}
        subtitle={t('academic.majors.subtitle')}
        actions={
          <>
            <Button variant="quiet" icon={Download} loading={exporting} disabled={loading || filteredMajors.length === 0} onClick={handleExportExcel}>
              {t('academic.majors.exportExcel', 'Export Excel')}
            </Button>
            <Button icon={Plus} onClick={() => navigate('/academic/majors/create')}>
              {t('academic.majors.create')}
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={t('academic.majors.kpiActiveMajors', 'Active Majors')} value={kpis.activeMajors} tone="ok" />
        <Stat label={t('academic.majors.kpiTotalEnrolled', 'Total Enrolled')} value={kpis.totalEnrolled} />
        <Stat label={t('academic.majors.kpiAdmissionFunnel', 'Admission Funnel')} value={`${kpis.admissionFunnel}%`} hint={t('academic.majors.kpiYieldRate', 'Yield Rate')} />
        <Stat label={t('academic.majors.kpiGraduationReady', 'Graduation Ready')} value={kpis.graduationReady} hint={t('academic.majors.kpiCandidatesThisYear', 'Candidates this year')} tone="gold" />
        <div className="rounded-2xl border border-[#dde3ef] bg-white px-4 py-3.5">
          <div className="text-xs font-semibold text-slate-500">{t('academic.majors.kpiPortfolioHealth', 'Portfolio Health')}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="ok">{kpis.healthy} {t('academic.majors.healthHealthy', 'Healthy')}</Badge>
            <Badge tone="warn">{kpis.attention} {t('academic.majors.healthAttention', 'Attention')}</Badge>
            <Badge tone="err">{kpis.critical} {t('academic.majors.healthCritical', 'Critical')}</Badge>
          </div>
        </div>
      </div>

      <Panel>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input type="text" placeholder={t('academic.majors.searchPlaceholder')} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={`${fieldClass} ps-9`} aria-label={t('academic.majors.searchPlaceholder')} />
          </div>
          {userRole === 'admin' && (
            <select value={collegeFilter} onChange={(e) => setCollegeFilter(e.target.value)} className={fieldClass} aria-label={t('academic.majors.filterAllColleges', 'All Colleges')}>
              <option value="">{t('academic.majors.filterAllColleges', 'All Colleges')}</option>
              {colleges.map(c => (
                <option key={c.id} value={c.id}>{getLocalizedName(c, isRTL)}</option>
              ))}
            </select>
          )}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={fieldClass} aria-label={t('academic.majors.filterAllStatuses', 'All Statuses')}>
            <option value="">{t('academic.majors.filterAllStatuses', 'All Statuses')}</option>
            <option value="open_for_admission">{t('academic.majors.statusOpen', 'Open for Admission')}</option>
            <option value="active">{t('academic.majors.statusActive', 'Active')}</option>
            <option value="phasing_out">{t('academic.majors.statusTeachOut', 'Teach-Out')}</option>
            <option value="suspended">{t('academic.majors.statusSuspended', 'Suspended')}</option>
            <option value="draft">{t('academic.majors.statusDraft', 'Draft')}</option>
          </select>
          <select value={degreeLevelFilter} onChange={(e) => setDegreeLevelFilter(e.target.value)} className={fieldClass} aria-label={t('academic.majors.filterAllDegreeLevels', 'All Degree Levels')}>
            <option value="">{t('academic.majors.filterAllDegreeLevels', 'All Degree Levels')}</option>
            <option value="bachelor">{t('academic.majors.bachelor')}</option>
            <option value="master">{t('academic.majors.master')}</option>
            <option value="diploma">{t('academic.majors.diploma')}</option>
            <option value="phd">{t('academic.majors.phd')}</option>
          </select>
        </div>
      </Panel>

      {statusError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">{statusError}</div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-56" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredMajors.map((major) => {
            const stats = majorStats[major.id] || {}
            const health = getHealthIndicator(major, majorStats)
            return (
              <div
                key={major.id}
                className="overflow-hidden rounded-2xl border border-[#dde3ef] bg-white p-5"
              >
                <div className={`flex gap-4 mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#eef2f9] text-[#1a3a6b]">
                    <BookMarked className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className={`flex justify-between items-start gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <div className="min-w-0 flex-1 overflow-hidden">
                        <h3 className="truncate font-extrabold text-[#1a3a6b]">{getLocalizedName(major, isRTL)}</h3>
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

                <button
                  type="button"
                  onClick={() => toggleMajorStatus(major)}
                  disabled={updatingId === major.id}
                  className={`w-full mb-3 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 ${
                    isMajorOfferedOnRegistrationForm(major)
                      ? 'bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100'
                      : 'bg-green-50 border border-green-200 text-green-700 hover:bg-green-100'
                  }`}
                >
                  {isMajorOfferedOnRegistrationForm(major) ? t('academic.majors.deactivate') : t('academic.majors.activate')}
                </button>
                <div className="flex gap-2">
                  <Button variant="quiet" size="sm" className="flex-1" icon={Eye} onClick={() => navigate(`/academic/majors/${major.id}`)}>
                    {t('academic.majors.view')}
                  </Button>
                  <Button size="sm" className="flex-1" icon={Edit} onClick={() => navigate(`/academic/majors/${major.id}/edit`)}>
                    {t('academic.majors.edit')}
                  </Button>
                  <Button variant="gold" size="sm" className="flex-1" icon={FileText} onClick={() => navigate(`/academic/majors/${major.id}/degree-plan`)}>
                    {t('academic.majors.degreePlan', 'Degree Plan')}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!loading && filteredMajors.length === 0 && (
        <Panel>
          <EmptyState icon={BookMarked} title={t('academic.majors.noMajorsFound', 'No majors found')} hint={t('academic.majors.searchPlaceholder')} />
        </Panel>
      )}
    </div>
  )
}
