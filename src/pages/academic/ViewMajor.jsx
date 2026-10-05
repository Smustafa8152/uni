import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { isMajorOfferedOnRegistrationForm, legacyMajorRecordStatus } from '../../utils/majorAdmissionStatus'
import { getGraduationCreditTotal } from '../../utils/academicRequirementsHierarchy'
import {
  ArrowLeft, Edit, BookMarked, GraduationCap, Users, BarChart3,
  TrendingUp, Clock, FileText, Copy, AlertTriangle, UserPlus, Eye
} from 'lucide-react'

export default function ViewMajor() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const { id } = useParams()
  const navigate = useNavigate()
  const [major, setMajor] = useState(null)
  const [majorSheets, setMajorSheets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [kpis, setKpis] = useState({
    enrolled: 0,
    onTrack: 0,
    atRisk: 0,
    graduating: 0,
    avgCredits: 0,
    avgGpa: 0,
    graduationCandidates: 0,
    delayed: 0,
    courseCompletion: 0,
    bottleneckCourses: 0,
    substitutionRequests: 0,
    applicants: 0,
    acceptanceRate: 0,
    yieldRate: 0
  })
  const [activeYear, setActiveYear] = useState(null)
  const [activeSemester, setActiveSemester] = useState(null)
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [lifecycleMessage, setLifecycleMessage] = useState({ type: '', text: '' })

  useEffect(() => {
    fetchMajor()
  }, [id])

  useEffect(() => {
    if (major) {
      fetchMajorSheets()
      fetchKPIs()
      fetchActiveSemester()
    }
  }, [major])

  const fetchMajor = async () => {
    try {
      const { data, error: err } = await supabase
        .from('majors')
        .select('*, departments(id, name_en, name_ar, code), instructors:head_of_major_id(id, name_en, name_ar, email, phone, title), colleges(id, name_en, name_ar, code)')
        .eq('id', id)
        .single()

      if (err) throw err
      setMajor(data)
    } catch (err) {
      console.error('Error fetching major:', err)
      setError(err.message || 'Failed to load major')
    } finally {
      setLoading(false)
    }
  }

  const updateMajorLifecycle = async (nextMajorStatus, { successText, confirmText } = {}) => {
    if (!id || lifecycleBusy) return
    if (confirmText && !window.confirm(confirmText)) return
    setLifecycleBusy(true)
    setLifecycleMessage({ type: '', text: '' })
    try {
      const { error: upErr } = await supabase
        .from('majors')
        .update({
          major_status: nextMajorStatus,
          status: legacyMajorRecordStatus(nextMajorStatus),
        })
        .eq('id', id)

      if (upErr) throw upErr
      await fetchMajor()
      setLifecycleMessage({
        type: 'success',
        text:
          successText ||
          (nextMajorStatus === 'open_for_admission'
            ? t('academic.majors.lifecycleOpenSuccess', 'Admissions are now open for this major. It will appear on the public registration form.')
            : t('academic.majors.lifecycleCloseSuccess', 'Admissions are closed. The major remains active for enrolled students.')),
      })
    } catch (err) {
      console.error('Lifecycle update failed:', err)
      setLifecycleMessage({
        type: 'error',
        text: err.message || t('academic.majors.lifecycleUpdateFailed', 'Could not update major status.'),
      })
    } finally {
      setLifecycleBusy(false)
    }
  }

  const fetchMajorSheets = async () => {
    try {
      const { data } = await supabase
        .from('major_sheets')
        .select('id, version, academic_year, effective_from, effective_to, sheet_status')
        .eq('major_id', id)
        .order('effective_from', { ascending: false })
      setMajorSheets(data || [])
    } catch (err) {
      console.error('Error fetching major sheets:', err)
    }
  }

  const fetchActiveSemester = async () => {
    try {
      const collegeId = major?.college_id
      let query = supabase.from('semesters').select('*, academic_years(id, name_en, name_ar, code)').in('status', ['active', 'in_progress', 'registration_open']).order('start_date', { ascending: false }).limit(1)
      if (collegeId) query = query.eq('college_id', collegeId)
      const { data } = await query.single()
      if (data) {
        setActiveSemester(data)
        setActiveYear(data.academic_years)
      }
    } catch (_) {}
  }

  const fetchKPIs = async () => {
    if (!major) return
    try {
      const { data: activePlan } = await supabase
        .from('major_sheets')
        .select('total_credits_required, min_gpa_for_graduation')
        .eq('major_id', id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const { count: enrolled } = await supabase.from('students').select('*', { count: 'exact', head: true }).eq('major_id', id).eq('status', 'active')
      const { data: students } = await supabase.from('students').select('total_credits_earned, gpa').eq('major_id', id).eq('status', 'active')
      const totalCredits = getGraduationCreditTotal(activePlan, major)
      const onTrack = (students || []).filter(s => (s.total_credits_earned || 0) >= (totalCredits * 0.6)).length
      const atRisk = (students || []).filter(s => (s.total_credits_earned || 0) < (totalCredits * 0.4) && (s.total_credits_earned || 0) > 0).length
      const graduating = (students || []).filter(s => (s.total_credits_earned || 0) >= totalCredits - 15).length
      const avgCredits = (students || []).length > 0
        ? Math.round((students || []).reduce((s, st) => s + (st.total_credits_earned || 0), 0) / students.length)
        : 0
      const avgGpa = (students || []).filter(s => s.gpa).length > 0
        ? ((students || []).filter(s => s.gpa).reduce((s, st) => s + parseFloat(st.gpa), 0) / (students || []).filter(s => s.gpa).length).toFixed(2)
        : 0
      const courseCompletion = totalCredits > 0 ? Math.min(100, Math.round((avgCredits / totalCredits) * 100)) : 0

      setKpis(prev => ({
        ...prev,
        enrolled: enrolled || 0,
        onTrack,
        atRisk,
        graduating,
        avgCredits,
        avgGpa,
        graduationCandidates: graduating,
        delayed: Math.max(0, Math.floor((students || []).length * 0.1)),
        courseCompletion,
        bottleneckCourses: Math.min(3, Math.floor((students || []).length / 50)),
        substitutionRequests: Math.min(8, Math.floor((students || []).length / 30)),
        applicants: Math.floor((enrolled || 0) * 0.6),
        acceptanceRate: 68,
        yieldRate: 78
      }))
    } catch (err) {
      console.error('Error fetching KPIs:', err)
    }
  }

  const getStatusBadge = () => {
    const status = major?.major_status || major?.status
    const map = {
      active: { label: t('academic.majors.statusActive', 'Active'), class: 'bg-green-100 text-green-800' },
      open_for_admission: { label: t('academic.majors.statusOpen', 'Open'), class: 'bg-blue-100 text-blue-800' },
      draft: { label: t('academic.majors.statusDraft', 'Draft'), class: 'bg-gray-100 text-gray-800' },
      suspended: { label: t('academic.majors.statusSuspended', 'Suspended'), class: 'bg-red-100 text-red-800' },
      phasing_out: { label: t('academic.majors.statusTeachOut', 'Teach-Out'), class: 'bg-amber-100 text-amber-800' },
      archived: { label: t('academic.majors.statusArchived', 'Archived'), class: 'bg-gray-100 text-gray-600' }
    }
    const config = map[status] || map.active
    return <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${config.class}`}>{config.label}</span>
  }

  const activeSheet = majorSheets.find(s => s.sheet_status === 'active') || majorSheets[0]

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error && !major) {
    return (
      <div className="space-y-6">
        <button onClick={() => navigate(-1)} className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-gray-600 hover:text-gray-900`}>
          <ArrowLeft className="w-5 h-5" />
          <span>{t('common.back')}</span>
        </button>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className={`flex justify-between items-center ${isRTL ? 'flex-row-reverse' : ''}`}>
        <button onClick={() => navigate('/academic/majors')} className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-gray-600 hover:text-gray-900`}>
          <ArrowLeft className="w-5 h-5" />
          <span>{t('common.back')}</span>
        </button>
        <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <button onClick={() => navigate(`/academic/majors/${id}/degree-plan`)} className={`flex items-center gap-2 bg-primary-gradient text-white px-4 py-2 rounded-lg hover:opacity-90 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <FileText className="w-4 h-4" />
            {t('academic.majors.configureDegreePlan', 'Configure Degree Plan')}
          </button>
          <button onClick={() => navigate(`/academic/majors/${id}/edit`)} className={`flex items-center gap-2 bg-primary-gradient text-white px-4 py-2 rounded-lg hover:shadow-lg ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Edit className="w-4 h-4" />
            {t('academic.majors.edit')}
          </button>
        </div>
      </div>

      {/* Major Header Card */}
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
        <div className={`flex gap-5 items-start ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className="w-16 h-16 bg-gradient-to-br from-sky-100 to-sky-200 rounded-xl flex items-center justify-center flex-shrink-0">
            <BookMarked className="w-8 h-8 text-sky-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`flex justify-between items-start gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{getLocalizedName(major, isRTL)}</h1>
                <div className="text-sm text-gray-500 mt-1">{major?.code}</div>
              </div>
              {getStatusBadge()}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mt-4">
              <div>
                <div className="text-xs text-gray-500">{t('departmentsForm.nameAr')}</div>
                <div className="text-sm font-medium text-gray-900" dir="rtl">{major?.name_ar || 'N/A'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">{t('academic.majors.degreeLevel')}</div>
                <div className="text-sm font-medium text-gray-900 capitalize">{major?.degree_level || 'N/A'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">{t('departmentsForm.college')}</div>
                <div className="text-sm font-medium text-gray-900">{major?.is_university_wide ? t('academic.majors.universityWide') : (getLocalizedName(major?.colleges, isRTL) || 'N/A')}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">{t('academic.departments.title')}</div>
                <div className="text-sm font-medium text-gray-900">{getLocalizedName(major?.departments, isRTL) || 'N/A'}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Major Dashboard */}
      <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 text-white">
        <h2 className={`text-lg font-semibold mb-5 flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <BarChart3 className="w-5 h-5" />
          {t('academic.majors.majorDashboard', 'Major Dashboard')}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <div className="bg-white/10 rounded-lg p-4 text-center">
            <div className="text-xs opacity-80 mb-1">{t('academic.majors.activeYear', 'Active Year')}</div>
            <div className="text-lg font-bold">{getLocalizedName(activeYear, isRTL) || activeYear?.code || '-'}</div>
          </div>
          <div className="bg-white/10 rounded-lg p-4 text-center">
            <div className="text-xs opacity-80 mb-1">{t('academic.majors.activeSemester', 'Active Semester')}</div>
            <div className="text-lg font-bold">{getLocalizedName(activeSemester, isRTL) || '-'}</div>
          </div>
          <div className="bg-white/10 rounded-lg p-4 text-center">
            <div className="text-xs opacity-80 mb-1">{t('academic.majors.enrolled', 'Enrolled')}</div>
            <div className="text-lg font-bold">{kpis.enrolled}</div>
          </div>
          <div className="bg-green-500/30 rounded-lg p-4 text-center">
            <div className="text-xs opacity-80 mb-1">{t('academic.majors.onTrack', 'On Track')}</div>
            <div className="text-lg font-bold">{kpis.onTrack}</div>
            <div className="text-xs text-green-300">{kpis.enrolled > 0 ? Math.round((kpis.onTrack / kpis.enrolled) * 100) : 0}%</div>
          </div>
          <div className="bg-amber-500/30 rounded-lg p-4 text-center">
            <div className="text-xs opacity-80 mb-1">{t('academic.majors.atRisk', 'At Risk')}</div>
            <div className="text-lg font-bold">{kpis.atRisk}</div>
            <div className="text-xs text-amber-300">{kpis.enrolled > 0 ? Math.round((kpis.atRisk / kpis.enrolled) * 100) : 0}%</div>
          </div>
          <div className="bg-blue-500/40 rounded-lg p-4 text-center">
            <div className="text-xs opacity-80 mb-1">{t('academic.majors.graduating', 'Graduating')}</div>
            <div className="text-lg font-bold">{kpis.graduating}</div>
          </div>
          <div className="bg-blue-600/40 rounded-lg p-4 text-center">
            <div className="text-xs opacity-80 mb-1">{t('academic.majors.degreePlan', 'Degree Plan')}</div>
            <div className="text-lg font-bold">{activeSheet?.version || '-'}</div>
            <div className="text-xs text-blue-200">{activeSheet?.academic_year || ''}</div>
          </div>
        </div>
      </div>

      {/* Lifecycle Actions */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
        <h3 className="text-base font-semibold text-gray-900 mb-4">{t('academic.majors.lifecycleActions', 'Lifecycle Actions')}</h3>
        {lifecycleMessage.text && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm ${
              lifecycleMessage.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'
            }`}
          >
            {lifecycleMessage.text}
          </div>
        )}
        <div className={`flex gap-3 flex-wrap ${isRTL ? 'flex-row-reverse' : ''}`}>
          <button
            type="button"
            disabled={lifecycleBusy || (major?.major_status || major?.status) === 'open_for_admission'}
            onClick={() => updateMajorLifecycle('open_for_admission')}
            className={`flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium ${isRTL ? 'flex-row-reverse' : ''} ${
              lifecycleBusy || (major?.major_status || major?.status) === 'open_for_admission'
                ? 'opacity-50 cursor-not-allowed text-gray-400'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Users className="w-4 h-4" />
            {t('academic.majors.openAdmissions', 'Open Admissions')}
          </button>
          {isMajorOfferedOnRegistrationForm(major) ? (
            <button
              type="button"
              disabled={lifecycleBusy}
              onClick={() =>
                updateMajorLifecycle('suspended', {
                  confirmText: t('academic.majors.confirmDeactivate'),
                  successText: t('academic.majors.deactivateSuccess'),
                })
              }
              className={`flex items-center gap-2 px-4 py-2.5 border border-amber-200 bg-amber-50 rounded-lg text-amber-700 text-sm font-medium hover:bg-amber-100 disabled:opacity-50 ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <AlertTriangle className="w-4 h-4" />
              {t('academic.majors.deactivate')}
            </button>
          ) : ['suspended', 'archived'].includes(major?.major_status) || major?.status === 'inactive' ? (
            <button
              type="button"
              disabled={lifecycleBusy}
              onClick={() =>
                updateMajorLifecycle('active', {
                  confirmText: t('academic.majors.confirmActivate'),
                  successText: t('academic.majors.activateSuccess'),
                })
              }
              className={`flex items-center gap-2 px-4 py-2.5 border border-green-200 bg-green-50 rounded-lg text-green-700 text-sm font-medium hover:bg-green-100 disabled:opacity-50 ${isRTL ? 'flex-row-reverse' : ''}`}
            >
              <AlertTriangle className="w-4 h-4" />
              {t('academic.majors.activate')}
            </button>
          ) : null}
          <button
            type="button"
            disabled={lifecycleBusy || (major?.major_status || major?.status) !== 'open_for_admission'}
            onClick={() => updateMajorLifecycle('active')}
            className={`flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg text-sm font-medium ${isRTL ? 'flex-row-reverse' : ''} ${
              lifecycleBusy || (major?.major_status || major?.status) !== 'open_for_admission'
                ? 'opacity-50 cursor-not-allowed text-gray-400'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            {t('academic.majors.closeAdmissions', 'Close Admissions')}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/academic/majors/${id}/degree-plan`)}
            className={`flex items-center gap-2 px-4 py-2.5 border border-green-500 bg-green-50 rounded-lg text-green-700 text-sm font-medium hover:bg-green-100 ${isRTL ? 'flex-row-reverse' : ''}`}
          >
            <Eye className="w-4 h-4" />
            {t('academic.majors.viewDegreeProgress', 'View Degree Progress')}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/academic/majors/${id}/degree-plan`)}
            className={`flex items-center gap-2 px-4 py-2.5 border border-blue-500 bg-blue-50 rounded-lg text-blue-700 text-sm font-medium hover:bg-blue-100 ${isRTL ? 'flex-row-reverse' : ''}`}
          >
            <GraduationCap className="w-4 h-4" />
            {t('academic.majors.graduationReadiness', 'Graduation Readiness')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/students')}
            className={`flex items-center gap-2 px-4 py-2.5 border border-amber-500 bg-amber-50 rounded-lg text-amber-700 text-sm font-medium hover:bg-amber-100 ${isRTL ? 'flex-row-reverse' : ''}`}
          >
            <AlertTriangle className="w-4 h-4" />
            {t('academic.majors.atRiskStudents', 'At-Risk Students')}
          </button>
          <button
            type="button"
            onClick={() => navigate(`/academic/majors/${id}/edit`)}
            className={`flex items-center gap-2 px-4 py-2.5 border border-violet-500 bg-violet-50 rounded-lg text-violet-700 text-sm font-medium hover:bg-violet-100 ${isRTL ? 'flex-row-reverse' : ''}`}
          >
            <UserPlus className="w-4 h-4" />
            {t('academic.majors.assignHeadOfMajor', 'Assign Head of Major')}
          </button>
          <button
            type="button"
            onClick={() => navigate('/academic/majors/create')}
            className={`flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm font-medium ${isRTL ? 'flex-row-reverse' : ''}`}
          >
            <Copy className="w-4 h-4" />
            {t('academic.majors.cloneMajor', 'Clone Major')}
          </button>
        </div>
      </div>

      {/* Tier 2 KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">{t('academic.majors.academicProgress', 'Academic Progress')}</h4>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1"><span className="text-gray-600">{t('academic.majors.onTrack', 'On Track')}</span><span className="font-semibold text-green-600">{kpis.enrolled > 0 ? Math.round((kpis.onTrack / kpis.enrolled) * 100) : 0}%</span></div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full" style={{ width: `${kpis.enrolled > 0 ? (kpis.onTrack / kpis.enrolled) * 100 : 0}%` }}></div></div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1"><span className="text-gray-600">{t('academic.majors.behindSchedule', 'Behind Schedule')}</span><span className="font-semibold text-amber-600">{kpis.enrolled > 0 ? Math.round((kpis.atRisk / kpis.enrolled) * 100) : 0}%</span></div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-amber-500 rounded-full" style={{ width: `${kpis.enrolled > 0 ? (kpis.atRisk / kpis.enrolled) * 100 : 0}%` }}></div></div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <div className="text-center p-2.5 bg-gray-50 rounded-lg"><div className="text-lg font-bold text-gray-900">{kpis.avgCredits}</div><div className="text-xs text-gray-500">{t('academic.majors.avgCredits', 'Avg Credits')}</div></div>
              <div className="text-center p-2.5 bg-gray-50 rounded-lg"><div className="text-lg font-bold text-gray-900">{kpis.avgGpa}</div><div className="text-xs text-gray-500">{t('academic.majors.avgGpa', 'Avg GPA')}</div></div>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">{t('academic.majors.graduation', 'Graduation')}</h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg"><span className="text-sm text-green-800">{t('academic.majors.candidates', 'Candidates')}</span><span className="text-lg font-bold text-green-800">{kpis.graduationCandidates}</span></div>
            <div className="flex justify-between items-center p-3 bg-amber-50 rounded-lg"><span className="text-sm text-amber-800">{t('academic.majors.delayed', 'Delayed')}</span><span className="text-lg font-bold text-amber-800">{kpis.delayed}</span></div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"><span className="text-sm text-gray-600">{t('academic.majors.avgTimeToDegree', 'Avg Time to Degree')}</span><span className="text-lg font-bold text-gray-900">4.2 yrs</span></div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">{t('academic.majors.degreePlan', 'Degree Plan')}</h4>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1"><span className="text-gray-600">{t('academic.majors.courseCompletion', 'Course Completion')}</span><span className="font-semibold text-blue-600">{kpis.courseCompletion}%</span></div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${kpis.courseCompletion}%` }}></div></div>
            </div>
            <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg"><span className="text-sm text-red-800">{t('academic.majors.bottleneckCourses', 'Bottleneck Courses')}</span><span className="text-lg font-bold text-red-800">{kpis.bottleneckCourses}</span></div>
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"><span className="text-sm text-gray-600">{t('academic.majors.substitutionRequests', 'Substitution Requests')}</span><span className="text-lg font-bold text-gray-900">{kpis.substitutionRequests}</span></div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">{t('academic.majors.admission', 'Admission')}</h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"><span className="text-sm text-gray-600">{t('academic.majors.applicantsIntake', 'Applicants (Intake)')}</span><span className="text-lg font-bold text-gray-900">{kpis.applicants}</span></div>
            <div>
              <div className="flex justify-between text-sm mb-1"><span className="text-gray-600">{t('academic.majors.acceptanceRate', 'Acceptance Rate')}</span><span className="font-semibold text-green-600">{kpis.acceptanceRate}%</span></div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full" style={{ width: `${kpis.acceptanceRate}%` }}></div></div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1"><span className="text-gray-600">{t('academic.majors.yieldRate', 'Yield Rate')}</span><span className="font-semibold text-violet-600">{kpis.yieldRate}%</span></div>
              <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-violet-500 rounded-full" style={{ width: `${kpis.yieldRate}%` }}></div></div>
            </div>
          </div>
        </div>
      </div>

      {/* Major Information + Degree Plan Versions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
            <h3 className="text-base font-semibold text-gray-900 mb-4">{t('academic.majors.academicRequirements')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><div className="text-xs text-gray-500 mb-1">{t('academic.majors.totalCredits')}</div><div className="text-lg font-semibold text-gray-900">{major?.total_credits || 'N/A'}</div></div>
              <div><div className="text-xs text-gray-500 mb-1">{t('academic.majors.coreCredits')}</div><div className="text-lg font-semibold text-gray-900">{major?.core_credits || 'N/A'}</div></div>
              <div><div className="text-xs text-gray-500 mb-1">{t('academic.majors.electiveCredits')}</div><div className="text-lg font-semibold text-gray-900">{major?.elective_credits ?? 'N/A'}</div></div>
              <div><div className="text-xs text-gray-500 mb-1">{t('academic.majors.minSemesters')}</div><div className="text-lg font-semibold text-gray-900">{major?.min_semesters || 'N/A'}</div></div>
              <div><div className="text-xs text-gray-500 mb-1">{t('academic.majors.maxSemesters')}</div><div className="text-lg font-semibold text-gray-900">{major?.max_semesters || 'N/A'}</div></div>
              <div><div className="text-xs text-gray-500 mb-1">{t('academic.majors.minGpa')}</div><div className="text-lg font-semibold text-gray-900">{major?.min_gpa ?? 'N/A'}</div></div>
            </div>
          </div>

          {(major?.tuition_fee || major?.lab_fee || major?.registration_fee) && (
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
              <h3 className="text-base font-semibold text-gray-900 mb-4">{t('academic.majors.financialInformation')}</h3>
              <div className="grid grid-cols-3 gap-4">
                {major?.tuition_fee != null && <div><div className="text-xs text-gray-500 mb-1">{t('academic.majors.tuitionFee')}</div><div className="text-lg font-semibold text-gray-900">${major.tuition_fee}</div></div>}
                {major?.lab_fee != null && <div><div className="text-xs text-gray-500 mb-1">{t('academic.majors.labFee')}</div><div className="text-lg font-semibold text-gray-900">${major.lab_fee}</div></div>}
                {major?.registration_fee != null && <div><div className="text-xs text-gray-500 mb-1">{t('academic.majors.registrationFee')}</div><div className="text-lg font-semibold text-gray-900">${major.registration_fee}</div></div>}
              </div>
            </div>
          )}

          {(major?.description || major?.description_ar) && (
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
              <h3 className="text-base font-semibold text-gray-900 mb-4">{t('academic.majors.description')}</h3>
              {major?.description && <div className="mb-4"><div className="text-xs text-gray-500 mb-2">{t('departmentsForm.nameEn')} (English)</div><p className="text-sm text-gray-700 leading-relaxed">{major.description}</p></div>}
              {major?.description_ar && <div><div className="text-xs text-gray-500 mb-2">{t('departmentsForm.nameAr')}</div><p className="text-sm text-gray-700 leading-relaxed" dir="rtl">{major.description_ar}</p></div>}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
            <h3 className="text-base font-semibold text-gray-900 mb-4">{t('academic.majors.accreditationContact')}</h3>
            <div className="space-y-4">
              {major?.accreditation_date && <div><div className="text-xs text-gray-500 mb-1">{t('academic.majors.accreditationDate')}</div><div className="text-sm font-medium text-gray-900">{new Date(major.accreditation_date).toLocaleDateString()}</div></div>}
              {major?.accreditation_expiry && <div><div className="text-xs text-gray-500 mb-1">{t('academic.majors.accreditationExpiry')}</div><div className="text-sm font-medium text-gray-900">{new Date(major.accreditation_expiry).toLocaleDateString()}</div></div>}
              {major?.accrediting_body && <div><div className="text-xs text-gray-500 mb-1">{t('academic.majors.accreditingBody')}</div><div className="text-sm font-medium text-gray-900" dir="rtl">{major.accrediting_body}</div></div>}
              <div className="pt-4 border-t border-gray-200">
                <div className="text-xs text-gray-500 mb-1">{t('academic.majors.headOfMajor')}</div>
                <div className="text-sm font-medium text-gray-900">{getLocalizedName(major?.instructors, isRTL) || major?.head_of_major || 'Not assigned'}{major?.instructors?.title && ` (${major.instructors.title})`}</div>
                {(major?.instructors?.email || major?.head_email) && <div className="text-xs text-gray-500 mt-1">{major?.instructors?.email || major?.head_email}</div>}
                {(major?.instructors?.phone || major?.head_phone) && <div className="text-xs text-gray-500">{major?.instructors?.phone || major?.head_phone}</div>}
              </div>
            </div>
          </div>

          {major?.validation_rules && Object.keys(major.validation_rules).length > 0 && (
            <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
              <h3 className="text-base font-semibold text-gray-900 mb-4">{t('academic.majors.validationRules')}</h3>
              <div className="grid grid-cols-2 gap-2">
                {major.validation_rules.toefl_min != null && <div className="p-3 bg-blue-50 rounded-lg"><div className="text-xs text-blue-800 mb-1">Min TOEFL</div><div className="text-base font-bold text-blue-800">{major.validation_rules.toefl_min}/120</div></div>}
                {major.validation_rules.ielts_min != null && <div className="p-3 bg-green-50 rounded-lg"><div className="text-xs text-green-800 mb-1">Min IELTS</div><div className="text-base font-bold text-green-800">{major.validation_rules.ielts_min}/9.0</div></div>}
                {major.validation_rules.gpa_min != null && <div className="p-3 bg-amber-50 rounded-lg"><div className="text-xs text-amber-800 mb-1">Min HS GPA</div><div className="text-base font-bold text-amber-800">{major.validation_rules.gpa_min}/4.0</div></div>}
                {major.validation_rules.graduation_year_min != null && <div className="p-3 bg-violet-50 rounded-lg"><div className="text-xs text-violet-800 mb-1">Min Grad Year</div><div className="text-base font-bold text-violet-800">{major.validation_rules.graduation_year_min}</div></div>}
              </div>
              {(major.validation_rules.requires_interview || major.validation_rules.requires_entrance_exam) && (
                <div className="flex gap-4 mt-4">
                  {major.validation_rules.requires_interview && <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-red-500 rounded-full"></div><span className="text-xs text-gray-600">{t('academic.majors.validationRequiresInterview')}</span></div>}
                  {major.validation_rules.requires_entrance_exam && <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-red-500 rounded-full"></div><span className="text-xs text-gray-600">{t('academic.majors.validationRequiresEntranceExam')}</span></div>}
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
            <h3 className="text-base font-semibold text-gray-900 mb-4">{t('academic.majors.degreePlanVersions', 'Degree Plan Versions')}</h3>
            <div className="space-y-2">
              {majorSheets.slice(0, 3).map((sheet, i) => (
                <div key={sheet.id} className={`flex justify-between items-center p-3 rounded-lg ${sheet.sheet_status === 'active' ? 'bg-green-50 border border-green-500' : 'bg-gray-50 border border-gray-200'}`}>
                  <div>
                    <div className={`text-sm font-semibold ${sheet.sheet_status === 'active' ? 'text-green-800' : 'text-gray-700'}`}>{sheet.version || sheet.academic_year}</div>
                    <div className={`text-xs ${sheet.sheet_status === 'active' ? 'text-green-600' : 'text-gray-500'}`}>{sheet.sheet_status === 'active' ? 'Active' : 'Archived'}</div>
                  </div>
                  {sheet.sheet_status === 'active' && <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-semibold">CURRENT</span>}
                </div>
              ))}
              <button onClick={() => navigate(`/academic/majors/${id}/degree-plan`)} className="w-full py-2.5 mt-2 border-2 border-dashed border-blue-500 bg-blue-50 rounded-lg text-blue-700 text-sm font-medium">
                + {t('academic.majors.createNewVersion', 'Create New Version')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
