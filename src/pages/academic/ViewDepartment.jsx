import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import {
  ArrowLeft, Edit, Building2, Trash2, Check, X, UserPlus, Copy, Download,
  BookOpen, Users, GraduationCap, BarChart3, TrendingUp
} from 'lucide-react'

export default function ViewDepartment() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const { id } = useParams()
  const navigate = useNavigate()
  const [department, setDepartment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [kpis, setKpis] = useState({
    totalCourses: 0,
    totalInstructors: 0,
    enrolledStudents: 0,
    averageGPA: 0,
    gradesSubmitted: 92,
    attendanceRate: 87,
    passRate: 94,
    studentSatisfaction: 4.5
  })
  const [subjects, setSubjects] = useState([])
  const [instructors, setInstructors] = useState([])
  const [students, setStudents] = useState([])

  useEffect(() => {
    fetchDepartment()
  }, [id])

  useEffect(() => {
    if (department) {
      fetchKPIs()
      fetchTabData()
    }
  }, [department])

  const fetchDepartment = async () => {
    try {
      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      let collegeData = null
      if (data.college_id) {
        const { data: college } = await supabase.from('colleges').select('id, name_en, name_ar, code').eq('id', data.college_id).maybeSingle()
        collegeData = college
      }
      let instructorData = null
      if (data.head_id) {
        const { data: inst } = await supabase.from('instructors').select('id, name_en, name_ar, email, phone, title').eq('id', data.head_id).maybeSingle()
        instructorData = inst
      }
      setDepartment({ ...data, colleges: collegeData, instructors: instructorData })
    } catch (err) {
      console.error('Error fetching department:', err)
      setError(err.message || 'Failed to load department')
    } finally {
      setLoading(false)
    }
  }

  const fetchKPIs = async () => {
    if (!department) return
    try {
      const { data: majors } = await supabase.from('majors').select('id').eq('department_id', department.id)
      const majorIds = (majors || []).map(m => m.id)
      const { data: subs } = await supabase.from('subjects').select('id').in('major_id', majorIds)
      const subjectIds = (subs || []).map(s => s.id)
      const { count: courseCount } = await supabase.from('subjects').select('*', { count: 'exact', head: true }).in('major_id', majorIds)
      const { count: instructorCount } = await supabase.from('instructors').select('*', { count: 'exact', head: true }).eq('department_id', department.id)
      const { count: studentCount } = await supabase.from('students').select('*', { count: 'exact', head: true }).in('major_id', majorIds)
      const { data: studentData } = await supabase.from('students').select('gpa').in('major_id', majorIds)
      const gpas = (studentData || []).map(s => s.gpa).filter(Boolean)
      const avgGPA = gpas.length > 0 ? (gpas.reduce((a, b) => a + parseFloat(b), 0) / gpas.length).toFixed(2) : 0
      setKpis(prev => ({
        ...prev,
        totalCourses: courseCount || 0,
        totalInstructors: instructorCount || 0,
        enrolledStudents: studentCount || 0,
        averageGPA: parseFloat(avgGPA)
      }))
    } catch (err) {
      console.error('Error fetching KPIs:', err)
    }
  }

  const fetchTabData = async () => {
    if (!department) return
    try {
      const { data: majors } = await supabase.from('majors').select('id').eq('department_id', department.id)
      const majorIds = (majors || []).map(m => m.id)
      if (majorIds.length > 0) {
        const { data: subs } = await supabase.from('subjects').select('id, code, name_en, name_ar, credit_hours').in('major_id', majorIds)
        setSubjects(subs || [])
        const { data: studs } = await supabase.from('students').select('id, student_id, name_en, name_ar, gpa, status').in('major_id', majorIds).limit(50)
        setStudents(studs || [])
      }
      const { data: insts } = await supabase.from('instructors').select('id, name_en, name_ar, email, title, status').eq('department_id', department.id)
      setInstructors(insts || [])
    } catch (err) {
      console.error('Error fetching tab data:', err)
    }
  }

  const handleWorkflowAction = async (action) => {
    if (!department) return
    if (action === 'activate' || action === 'deactivate') {
      const confirmed = window.confirm(
        action === 'deactivate'
          ? t('academic.departments.confirmDeactivate')
          : t('academic.departments.confirmActivate')
      )
      if (!confirmed) return
    }
    try {
      if (action === 'activate') {
        const { error: updateError } = await supabase.from('departments').update({ status: 'active' }).eq('id', id)
        if (updateError) throw updateError
      } else if (action === 'deactivate') {
        const { error: updateError } = await supabase.from('departments').update({ status: 'inactive' }).eq('id', id)
        if (updateError) throw updateError
      } else if (action === 'clone') {
        const cloneData = {
          code: `${department.code}-copy`,
          name_en: `${department.name_en} (Copy)`,
          name_ar: department.name_ar ? `${department.name_ar} (نسخة)` : null,
          description: department.description,
          description_ar: department.description_ar,
          status: 'active',
          college_id: department.college_id,
          is_university_wide: department.is_university_wide,
          head_id: null,
          email: department.email,
          phone: department.phone,
          building: department.building,
          floor: department.floor,
          room: department.room,
          established_date: department.established_date,
          can_offer_courses: department.can_offer_courses !== false,
          can_have_majors: department.can_have_majors !== false,
          can_enroll_students: department.can_enroll_students !== false,
          is_research: department.is_research || false,
          has_graduate_programs: department.has_graduate_programs || false,
          has_external_partnerships: department.has_external_partnerships || false,
          min_credit_hours: department.min_credit_hours ?? 12,
          max_credit_hours: department.max_credit_hours ?? 21,
          min_gpa_required: department.min_gpa_required ?? 2.0,
          max_students: department.max_students ?? 500,
          graduation_credits: department.graduation_credits ?? 120,
          expected_duration: department.expected_duration ?? 8,
        }
        const { data: cloned } = await supabase.from('departments').insert(cloneData).select().single()
        if (cloned) navigate(`/academic/departments/${cloned.id}`)
      } else if (action === 'export') {
        alert(t('academic.departments.exportComingSoon', 'Export feature coming soon'))
      }
      fetchDepartment()
    } catch (err) {
      console.error('Error performing action:', err)
      setError(err.message)
    }
  }

  const handleDelete = async () => {
    if (!confirm(t('academic.departments.deleteConfirm', 'Are you sure you want to delete this department?'))) return
    setDeleting(true)
    try {
      const { data: majors } = await supabase.from('majors').select('id').eq('department_id', id)
      const majorIds = (majors || []).map(m => m.id)
      const { count: studentCount } = await supabase.from('students').select('*', { count: 'exact', head: true }).in('major_id', majorIds)
      if (studentCount > 0) throw new Error(t('academic.departments.cannotDeleteWithStudents', 'Cannot delete department with enrolled students'))
      const { count: subjectCount } = await supabase.from('subjects').select('*', { count: 'exact', head: true }).in('major_id', majorIds)
      if (subjectCount > 0) throw new Error(t('academic.departments.cannotDeleteWithCourses', 'Cannot delete department with active courses'))
      const { error } = await supabase.from('departments').delete().eq('id', id)
      if (error) throw error
      navigate('/academic/departments')
    } catch (err) {
      setError(err.message || 'Failed to delete department')
      console.error('Error deleting department:', err)
    } finally {
      setDeleting(false)
    }
  }

  const tabs = [
    { id: 'overview', label: t('academic.departments.overview', 'Overview') },
    { id: 'courses', label: t('academic.departments.courses', 'Courses') },
    { id: 'instructors', label: t('academic.departments.instructors', 'Instructors') },
    { id: 'students', label: t('academic.departments.students', 'Students') },
    { id: 'performance', label: t('academic.departments.performance', 'Performance') }
  ]
  const departmentStatusLabel = department?.status ? t(`common.${department.status}`, department.status) : ''

  if (loading) {
    return (
      <div className="flex justify-center min-h-[50vh] items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error && !department) {
    return (
      <div className="space-y-6">
        <button onClick={() => navigate(-1)} className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-gray-600 hover:text-gray-900`}>
          <ArrowLeft className="w-5 h-5" />
          <span>{t('common.back')}</span>
        </button>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">{error}</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
        <button onClick={() => navigate(-1)} className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-gray-500 hover:text-gray-900 text-sm font-medium`}>
          <ArrowLeft className="w-5 h-5" />
          <span>{t('common.back')}</span>
        </button>
        <div className={`flex gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <button onClick={() => navigate(`/academic/departments/${id}/edit`)} className={`flex items-center gap-2 bg-primary-gradient text-white px-5 py-2.5 rounded-xl font-medium hover:shadow-lg ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Edit className="w-4 h-4" />
            {t('academic.departments.edit')}
          </button>
          <button onClick={handleDelete} disabled={deleting} className={`flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Trash2 className="w-4 h-4" />
            {deleting ? t('common.deleting', 'Deleting...') : t('common.delete')}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">{error}</div>}

      {/* Header Card: RTL = title block on the right, icon on the left (logical order via DOM + dir) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className="flex items-start gap-6" dir={isRTL ? 'rtl' : 'ltr'}>
          {isRTL ? (
            <>
              <div className="flex-1 min-w-0 text-right">
                <div className="flex items-center gap-4 mb-2 flex-wrap justify-start" dir="rtl">
                  <h1 className="text-3xl font-bold text-gray-900">{getLocalizedName(department, isRTL)}</h1>
                  <span className={`px-4 py-1.5 rounded-full text-sm font-semibold flex-shrink-0 ${department?.status === 'active' ? 'bg-green-100 text-green-700' : department?.status === 'archived' ? 'bg-gray-100 text-gray-500' : 'bg-gray-100 text-gray-600'}`}>
                    {departmentStatusLabel}
                  </span>
                </div>
                <div className="text-sm text-gray-500 mb-1">{department?.code}</div>
                {department?.name_ar && (
                  <div className="text-sm text-gray-500" dir="rtl">{department.name_ar}</div>
                )}
              </div>
              <div className="w-20 h-20 bg-primary-gradient rounded-2xl flex items-center justify-center flex-shrink-0" aria-hidden>
                <Building2 className="w-10 h-10 text-white" />
              </div>
            </>
          ) : (
            <>
              <div className="w-20 h-20 bg-primary-gradient rounded-2xl flex items-center justify-center flex-shrink-0" aria-hidden>
                <Building2 className="w-10 h-10 text-white" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center gap-4 mb-2 flex-wrap">
                  <h1 className="text-3xl font-bold text-gray-900">{getLocalizedName(department, isRTL)}</h1>
                  <span className={`px-4 py-1.5 rounded-full text-sm font-semibold flex-shrink-0 ${department?.status === 'active' ? 'bg-green-100 text-green-700' : department?.status === 'archived' ? 'bg-gray-100 text-gray-500' : 'bg-gray-100 text-gray-600'}`}>
                    {departmentStatusLabel}
                  </span>
                </div>
                <div className="text-sm text-gray-500 mb-1">{department?.code}</div>
                {department?.name_ar && (
                  <div className="text-sm text-gray-500" dir="rtl">{department.name_ar}</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div dir={isRTL ? 'rtl' : 'ltr'} className="flex border-b border-gray-200">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-6 py-4 text-sm font-medium border-b-2 transition-colors text-center ${activeTab === tab.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content: Overview */}
        {activeTab === 'overview' && (
          <div className="p-6 space-y-6">
            {/* Workflow Actions */}
            <div>
              <h3 className={`text-base font-semibold text-gray-900 mb-4 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.departments.workflowActions', 'Workflow Actions')}</h3>
              <div className={`flex flex-wrap gap-3 ${isRTL ? 'justify-end flex-row-reverse' : ''}`}>
                {department?.status !== 'active' && (
                  <button onClick={() => handleWorkflowAction('activate')} className={`flex items-center gap-2 px-5 py-2.5 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-medium hover:bg-green-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <Check className="w-4 h-4" />
                    {t('academic.departments.activate', 'Activate')}
                  </button>
                )}
                {department?.status === 'active' && (
                  <button onClick={() => handleWorkflowAction('deactivate')} className={`flex items-center gap-2 px-5 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-700 text-sm font-medium hover:bg-amber-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <X className="w-4 h-4" />
                    {t('academic.departments.deactivate', 'Deactivate')}
                  </button>
                )}
                <button onClick={() => navigate(`/academic/departments/${id}/edit`)} className={`flex items-center gap-2 px-5 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm font-medium hover:bg-blue-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <UserPlus className="w-4 h-4" />
                  {t('academic.departments.assignHoD')}
                </button>
                <button onClick={() => handleWorkflowAction('clone')} className={`flex items-center gap-2 px-5 py-2.5 bg-purple-50 border border-purple-200 rounded-xl text-purple-700 text-sm font-medium hover:bg-purple-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <Copy className="w-4 h-4" />
                  {t('academic.departments.cloneDepartment', 'Clone Department')}
                </button>
                <button onClick={() => handleWorkflowAction('export')} className={`flex items-center gap-2 px-5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-600 text-sm font-medium hover:bg-gray-100 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <Download className="w-4 h-4" />
                  {t('academic.departments.exportData', 'Export Data')}
                </button>
              </div>
            </div>

            {/* Tier 2 KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              {[
                [kpis.totalCourses, t('academic.departments.totalCourses', 'Total Courses'), t('academic.departments.activeThisSemester', '8 active this semester')],
                [kpis.totalInstructors, t('academic.departments.totalInstructors', 'Total Instructors'), t('academic.departments.fullTimePartTime', '6 full-time, 2 part-time')],
                [kpis.enrolledStudents, t('academic.departments.enrolledStudents', 'Enrolled Students'), t('academic.departments.enrollmentVsLastSemester', '↑ 15% vs last semester')],
                [kpis.averageGPA.toFixed(2), t('academic.departments.averageGPA', 'Average GPA'), t('academic.departments.aboveUniversityAvg', 'Above university avg (3.25)')]
              ].map(([val, label, sub], i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="text-sm text-gray-500 mb-2">{label}</div>
                  <div className="text-2xl font-bold text-gray-900">{val}</div>
                  <div className="text-xs text-green-600 mt-1">{sub}</div>
                </div>
              ))}
            </div>

            {/* Department Info + HoD */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className={`lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 ${isRTL ? 'text-right' : 'text-left'}`}>
                <h3 className="text-base font-semibold text-gray-900 mb-5">{t('academic.departments.departmentInfo', 'Department Information')}</h3>
                <div className="grid grid-cols-2 gap-5">
                  {[
                    [t('departmentsForm.nameEn'), getLocalizedName(department, isRTL)],
                    [t('departmentsForm.nameAr'), department?.name_ar],
                    [t('departmentsForm.code'), department?.code],
                    [t('common.status'), t(`common.${department?.status}`, department?.status)],
                    [t('academic.departments.scope', 'Scope'), department?.is_university_wide ? t('academic.departments.universityWide') : t('academic.departments.collegeSpecific')],
                    [t('departmentsForm.college'), getLocalizedName(department?.colleges, isRTL) || (department?.is_university_wide ? t('academic.departments.allColleges') : 'N/A')]
                  ].map(([l, v], i) => (
                    <div key={i}>
                      <div className="text-xs text-gray-400 mb-1">{l}</div>
                      <div className="text-sm font-medium text-gray-900">{v || 'N/A'}</div>
                    </div>
                  ))}
                </div>
                {department?.description && (
                  <div className="mt-5 pt-5 border-t border-gray-200">
                    <div className="text-xs text-gray-400 mb-1">{t('departmentsForm.description')}</div>
                    <div className="text-sm text-gray-900 leading-relaxed">{department.description}</div>
                  </div>
                )}
              </div>
              <div className={`bg-white rounded-xl border border-gray-200 p-6 ${isRTL ? 'text-right' : 'text-left'}`}>
                <h3 className="text-base font-semibold text-gray-900 mb-5">{t('departmentsForm.head')}</h3>
                {department?.instructors ? (
                  <>
                    <div className={`flex items-center gap-4 p-5 bg-gray-50 rounded-xl mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <div className="w-16 h-16 bg-primary-gradient rounded-full flex items-center justify-center text-white text-xl font-semibold">
                        {getLocalizedName(department.instructors, isRTL)?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-900">{getLocalizedName(department.instructors, isRTL)}</div>
                        <div className="text-sm text-gray-500">{department.instructors.title}</div>
                      </div>
                    </div>
                    {department.instructors.email && (
                      <div className={`mb-2 ${isRTL ? 'grid grid-cols-[auto,1fr] items-center gap-x-3' : 'flex items-center gap-2'}`}>
                        <span className={`text-xs text-gray-400 ${isRTL ? 'col-start-1 text-right' : ''}`}>{t('common.email')}:</span>
                        <span className={`text-sm ${isRTL ? 'col-start-2 text-left justify-self-start' : ''}`} dir="ltr">{department.instructors.email}</span>
                      </div>
                    )}
                    {department.instructors.phone && (
                      <div className={isRTL ? 'grid grid-cols-[auto,1fr] items-center gap-x-3' : 'flex items-center gap-2'}>
                        <span className={`text-xs text-gray-400 ${isRTL ? 'col-start-1 text-right' : ''}`}>{t('common.phone')}:</span>
                        <span className={`text-sm ${isRTL ? 'col-start-2 text-left justify-self-start' : ''}`} dir="ltr">{department.instructors.phone}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-gray-500 italic">{t('academic.departments.notAssigned')}</div>
                )}
              </div>
            </div>

            {/* Additional KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
              {[
                [kpis.gradesSubmitted + '%', t('academic.departments.gradesSubmitted', 'Grades Submitted'), kpis.gradesSubmitted],
                [kpis.attendanceRate + '%', t('academic.departments.attendanceRate', 'Attendance Rate'), kpis.attendanceRate],
                [kpis.passRate + '%', t('academic.departments.passRate', 'Pass Rate'), kpis.passRate],
                [kpis.studentSatisfaction + '/5', t('academic.departments.studentSatisfaction', 'Student Satisfaction'), 90]
              ].map(([val, label, pct], i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="text-sm text-gray-500 mb-2">{label}</div>
                  <div className="text-2xl font-bold text-gray-900">{val}</div>
                  <div className="w-full h-1.5 bg-gray-200 rounded-full mt-3">
                    <div className="h-full bg-primary-600 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Audit */}
            <div className={`bg-gray-50 rounded-xl border border-gray-200 p-6 ${isRTL ? 'text-right' : 'text-left'}`}>
              <h3 className="text-sm font-semibold text-gray-500 mb-4">{t('academic.departments.auditInfo', 'Audit Information')}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                <div><div className="text-xs text-gray-400">{t('academic.departments.createdBy', 'Created By')}</div><div className="text-sm">{department?.created_by || 'N/A'}</div></div>
                <div><div className="text-xs text-gray-400">{t('academic.departments.createdDate', 'Created Date')}</div><div className="text-sm">{department?.created_at ? new Date(department.created_at).toLocaleDateString() : 'N/A'}</div></div>
                <div><div className="text-xs text-gray-400">{t('academic.departments.lastModifiedBy', 'Last Modified By')}</div><div className="text-sm">{department?.updated_by || 'N/A'}</div></div>
                <div><div className="text-xs text-gray-400">{t('academic.departments.lastModifiedDate', 'Last Modified Date')}</div><div className="text-sm">{department?.updated_at ? new Date(department.updated_at).toLocaleDateString() : 'N/A'}</div></div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'courses' && (
          <div className="p-6">
            <div className={`flex justify-between items-center mb-5 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <h3 className="text-lg font-semibold text-gray-900">{t('academic.departments.departmentCourses', 'Department Courses')}</h3>
              <button onClick={() => navigate('/academic/subjects/create')} className="px-4 py-2 bg-primary-gradient text-white rounded-lg text-sm font-medium">{t('academic.departments.addCourse', '+ Add Course')}</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className={`${isRTL ? 'text-right' : 'text-left'} py-3 px-4 text-xs font-semibold text-gray-500 uppercase`}>{t('academic.departments.courseCode', 'Course Code')}</th>
                    <th className={`${isRTL ? 'text-right' : 'text-left'} py-3 px-4 text-xs font-semibold text-gray-500 uppercase`}>{t('academic.departments.courseName', 'Course Name')}</th>
                    <th className={`${isRTL ? 'text-right' : 'text-left'} py-3 px-4 text-xs font-semibold text-gray-500 uppercase`}>{t('academic.departments.credits', 'Credits')}</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map(s => (
                    <tr key={s.id} className="border-b border-gray-100">
                      <td className={`py-4 px-4 font-medium text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>{s.code}</td>
                      <td className={`py-4 px-4 text-gray-700 ${isRTL ? 'text-right' : 'text-left'}`}>{getLocalizedName(s, isRTL)}</td>
                      <td className={`py-4 px-4 text-gray-500 ${isRTL ? 'text-right' : 'text-left'}`}>{s.credit_hours}</td>
                    </tr>
                  ))}
                  {subjects.length === 0 && (
                    <tr><td colSpan={3} className="py-8 text-center text-gray-500">{t('common.noData')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'instructors' && (
          <div className="p-6">
            <div className={`flex justify-between items-center mb-5 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <h3 className="text-lg font-semibold text-gray-900">{t('academic.departments.departmentInstructors', 'Department Instructors')}</h3>
              <button onClick={() => navigate('/instructors/create')} className="px-4 py-2 bg-primary-gradient text-white rounded-lg text-sm font-medium">{t('academic.departments.assignInstructor', '+ Assign Instructor')}</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {instructors.map(inst => (
                <div key={inst.id} className={`p-5 bg-gray-50 rounded-xl border border-gray-200 ${isRTL ? 'text-right' : 'text-left'}`}>
                  <div className={`flex items-center gap-3 mb-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <div className="w-12 h-12 bg-primary-gradient rounded-full flex items-center justify-center text-white font-semibold">
                      {getLocalizedName(inst, isRTL)?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <div className="font-semibold text-gray-900">{getLocalizedName(inst, isRTL)}</div>
                      <div className="text-sm text-gray-500">{inst.title}</div>
                    </div>
                  </div>
                  <span className={`inline-block px-2 py-1 rounded text-xs ${inst.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{t(`common.${inst.status}`, inst.status)}</span>
                </div>
              ))}
              {instructors.length === 0 && <div className="col-span-3 text-center py-8 text-gray-500">{t('common.noData')}</div>}
            </div>
          </div>
        )}

        {activeTab === 'students' && (
          <div className="p-6">
            <div className={`flex justify-between items-center mb-5 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <h3 className="text-lg font-semibold text-gray-900">{t('academic.departments.enrolledStudents', 'Enrolled Students')} ({students.length})</h3>
              <input type="text" placeholder={t('common.search')} className={`px-4 py-2 border border-gray-200 rounded-lg text-sm w-64 ${isRTL ? 'text-right' : 'text-left'}`} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className={`${isRTL ? 'text-right' : 'text-left'} py-3 px-4 text-xs font-semibold text-gray-500 uppercase`}>{t('academic.departments.studentId', 'Student ID')}</th>
                    <th className={`${isRTL ? 'text-right' : 'text-left'} py-3 px-4 text-xs font-semibold text-gray-500 uppercase`}>{t('academic.departments.name', 'Name')}</th>
                    <th className={`${isRTL ? 'text-right' : 'text-left'} py-3 px-4 text-xs font-semibold text-gray-500 uppercase`}>GPA</th>
                    <th className={`${isRTL ? 'text-right' : 'text-left'} py-3 px-4 text-xs font-semibold text-gray-500 uppercase`}>{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map(s => (
                    <tr key={s.id} className="border-b border-gray-100">
                      <td className={`py-4 px-4 font-medium text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>{s.student_id}</td>
                      <td className={`py-4 px-4 ${isRTL ? 'text-right' : 'text-left'}`}>{getLocalizedName(s, isRTL)}</td>
                      <td className={`py-4 px-4 ${isRTL ? 'text-right' : 'text-left'}`}>{s.gpa || 'N/A'}</td>
                      <td className={`py-4 px-4 ${isRTL ? 'text-right' : 'text-left'}`}><span className={`px-2 py-1 rounded text-xs ${s.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{t(`common.${s.status}`, s.status)}</span></td>
                    </tr>
                  ))}
                  {students.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-gray-500">{t('common.noData')}</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'performance' && (
          <div className="p-6">
            <h3 className={`text-lg font-semibold text-gray-900 mb-5 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.departments.performance', 'Performance')}</h3>
            <div dir={isRTL ? 'rtl' : 'ltr'} className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className={`bg-white rounded-xl border border-gray-200 p-6 ${isRTL ? 'text-right' : 'text-left'}`}>
                <h4 className={`font-semibold text-gray-900 mb-4 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.departments.gradeDistribution', 'Grade Distribution')}</h4>
                <div className="space-y-3">
                  {['A', 'B', 'C', 'D/F'].map((grade, i) => {
                    const pct = [35, 40, 19, 6][i]
                    return (
                      <div
                        key={grade}
                        className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}
                        dir="ltr"
                      >
                        <div className={`flex items-center gap-2 flex-shrink-0 ${isRTL ? 'text-right' : 'text-left'}`}>
                          <span className="w-9 font-semibold text-gray-900 tabular-nums">{grade}</span>
                          <span className="w-10 text-sm text-gray-500 tabular-nums">{pct}%</span>
                        </div>
                        <div className="flex-1 h-6 bg-gray-200 rounded overflow-hidden min-w-0">
                          <div
                            className="h-full bg-primary-600 rounded-sm"
                            style={{
                              width: `${pct}%`,
                              ...(isRTL ? { marginLeft: 'auto' } : {}),
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className={`bg-white rounded-xl border border-gray-200 p-6 ${isRTL ? 'text-right' : 'text-left'}`}>
                <h4 className="font-semibold text-gray-900 mb-4">{t('academic.departments.semesterTrends', 'Semester Trends')}</h4>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    [t('academic.departments.avgGpaTrend', 'Avg GPA Trend'), '+0.15', t('academic.departments.vsLastSemester', 'vs last semester'), 'green'],
                    [t('academic.departments.enrollmentTrend', 'Enrollment Trend'), '+12%', t('academic.departments.vsLastSemester', 'vs last semester'), 'blue'],
                    [t('academic.departments.attendanceTrend', 'Attendance Trend'), '-2%', t('academic.departments.vsLastSemester', 'vs last semester'), 'amber'],
                    [t('academic.departments.passRateTrend', 'Pass Rate Trend'), '+3%', t('academic.departments.vsLastSemester', 'vs last semester'), 'green']
                  ].map(([l, v, sub, c], i) => (
                    <div key={i} className={`p-4 rounded-xl ${c === 'green' ? 'bg-green-50' : c === 'blue' ? 'bg-blue-50' : 'bg-amber-50'}`}>
                      <div className="text-xs text-gray-600 mb-1">{l}</div>
                      <div className="text-lg font-bold text-gray-900" dir="ltr">{v}</div>
                      <div className="text-xs text-gray-500">{sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
