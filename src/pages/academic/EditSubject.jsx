import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { formatInstructorDisplayName } from '../../utils/academicTitle'
import { formatSubjectOptionLabel, SUBJECT_OPTION_SELECT } from '../../utils/subjectOptionLabel'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { ArrowLeft, Save, Check } from 'lucide-react'
import SearchableMultiSelect from '../../components/SearchableMultiSelect'

export default function EditSubject() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { userRole, collegeId: authCollegeId } = useAuth()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [collegeId, setCollegeId] = useState(null)
  const [selectedCollegeId, setSelectedCollegeId] = useState(null)
  const [colleges, setColleges] = useState([])
  const [majors, setMajors] = useState([])
  const [allSubjects, setAllSubjects] = useState([])
  const [instructors, setInstructors] = useState([])
  const [gradeTypes, setGradeTypes] = useState([])
  const [gradeConfiguration, setGradeConfiguration] = useState([])

  const [formData, setFormData] = useState({
    major_scope: 'specific_majors',
    selected_major_ids: [],
    code: '',
    name_en: '',
    name_ar: '',
    type: 'core',
    credit_hours: 3,
    theory_hours: 3,
    lab_hours: 0,
    tutorial_hours: 0,
    lab_fee: '',
    material_fee: '',
    instructor_id: '',
    instructor_name: '',
    instructor_email: '',
    textbook: '',
    is_elective: false,
    description: '',
    description_ar: '',
    prerequisites: [],
    corequisites: [],
    status: 'active',
    college_id: null,
    is_university_wide: false,
    // New fields
    syllabus_content: '',
    syllabus_content_ar: '',
    attendance_method: 'AT_MAN',
    allow_excused_absence: true,
    max_absences: '',
    grades_visibility_status: 'GV_HID',
    requires_payment_completion: false,
  })

  useEffect(() => {
    fetchSubject()
    if (userRole === 'admin') {
      fetchColleges()
    }
    fetchMajors()
    fetchInstructors()
    fetchGradeTypes()
  }, [id, userRole])

  useEffect(() => {
    if (fetching) return
    fetchSubjects()
    fetchMajors()
  }, [collegeId, authCollegeId, formData.major_scope, userRole, fetching, id])

  const fetchColleges = async () => {
    try {
      const { data, error } = await supabase
        .from('colleges')
        .select('id, name_en, code')
        .eq('status', 'active')
        .order('name_en')

      if (error) throw error
      setColleges(data || [])
    } catch (err) {
      console.error('Error fetching colleges:', err)
    }
  }

  const fetchMajors = async () => {
    try {
      let query = supabase
        .from('majors')
        .select('id, name_en, name_ar, code')
        .order('name_en', { ascending: true })

      if (userRole === 'user' && authCollegeId) {
        query = query.or(`college_id.eq.${authCollegeId},is_university_wide.eq.true`)
      } else if (userRole === 'admin' && collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      }

      const { data, error } = await query
      if (error) throw error
      setMajors(data || [])
    } catch (err) {
      console.error('Error fetching majors:', err)
    }
  }

  const fetchSubjects = async () => {
    try {
      const targetCollegeId = collegeId || authCollegeId
      const subjectIdNum = id ? parseInt(id, 10) : null

      if (formData.major_scope === 'university_wide' && userRole === 'admin') {
        let q = supabase
          .from('subjects')
          .select(SUBJECT_OPTION_SELECT)
          .eq('status', 'active')
          .order('code')
        if (subjectIdNum) q = q.neq('id', subjectIdNum)
        const { data, error } = await q
        if (error) throw error
        setAllSubjects(data || [])
        return
      }

      if (!targetCollegeId) {
        setAllSubjects([])
        return
      }

      let query = supabase
        .from('subjects')
        .select(SUBJECT_OPTION_SELECT)
        .eq('status', 'active')
        .or(`college_id.eq.${targetCollegeId},is_university_wide.eq.true`)
        .order('code')

      const { data, error } = await query
      if (error) throw error
      const list = (data || []).filter((s) => s.id !== subjectIdNum)
      setAllSubjects(list)
    } catch (err) {
      console.error('Error fetching subjects:', err)
      setAllSubjects([])
    }
  }

  const fetchInstructors = async () => {
    try {
      let query = supabase
        .from('instructors')
        .select('id, name_en, name_ar, email, phone, title, academic_title')
        .order('name_en', { ascending: true })

      if (userRole === 'user' && authCollegeId) {
        query = query.eq('college_id', authCollegeId)
      } else if (userRole === 'admin' && collegeId) {
        query = query.eq('college_id', collegeId)
      }

      const { data, error } = await query
      if (error) throw error
      setInstructors(data || [])
    } catch (err) {
      console.error('Error fetching instructors:', err)
    }
  }

  const fetchGradeTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('university_settings')
        .select('grade_types')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') throw error
      
      if (data?.grade_types && Array.isArray(data.grade_types)) {
        setGradeTypes(data.grade_types)
      }
    } catch (err) {
      console.error('Error fetching grade types:', err)
    }
  }

  const fetchSubject = async () => {
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      // Parse JSONB fields
      let attendanceRules = { method: 'AT_MAN', allow_excused: true, max_absences: null }
      if (data.attendance_rules) {
        if (typeof data.attendance_rules === 'string') {
          try {
            attendanceRules = JSON.parse(data.attendance_rules)
          } catch (e) {
            console.warn('Failed to parse attendance_rules')
          }
        } else {
          attendanceRules = data.attendance_rules
        }
      }

      let gradeConfig = []
      if (data.grade_configuration) {
        if (typeof data.grade_configuration === 'string') {
          try {
            gradeConfig = JSON.parse(data.grade_configuration)
          } catch (e) {
            console.warn('Failed to parse grade_configuration')
          }
        } else if (Array.isArray(data.grade_configuration)) {
          gradeConfig = data.grade_configuration
        }
      }

      // Fetch prerequisites, corequisites, and subject_majors
      const [prereqData, coreqData, subjectMajorsData] = await Promise.all([
        supabase.from('subject_prerequisites').select('prerequisite_subject_id').eq('subject_id', id),
        supabase.from('subject_corequisites').select('corequisite_subject_id').eq('subject_id', id),
        supabase.from('subject_majors').select('major_id').eq('subject_id', id),
      ])

      const subjectMajorIds = (subjectMajorsData.data || []).map(sm => String(sm.major_id))
      let majorScope = 'specific_majors'
      if (data.is_university_wide) majorScope = 'university_wide'
      else if (data.applies_to_all_majors_of_college) majorScope = 'all_majors_of_college'
      else if (subjectMajorIds.length > 0) majorScope = 'specific_majors'

      setFormData({
        major_scope: majorScope,
        selected_major_ids: subjectMajorIds,
        code: data.code || '',
        name_en: data.name_en || '',
        name_ar: data.name_ar || '',
        type: data.type || 'core',
        credit_hours: data.credit_hours || 3,
        theory_hours: data.theory_hours || 3,
        lab_hours: data.lab_hours || 0,
        tutorial_hours: data.tutorial_hours || 0,
        lab_fee: data.lab_fee?.toString() || '',
        material_fee: data.material_fee?.toString() || '',
        instructor_id: data.instructor_id?.toString() || '',
        instructor_name: data.instructor_name || '',
        instructor_email: data.instructor_email || '',
        textbook: data.textbook || '',
        is_elective: data.is_elective || false,
        description: data.description || '',
        description_ar: data.description_ar || '',
        prerequisites: prereqData.data?.map(p => p.prerequisite_subject_id) || [],
        corequisites: coreqData.data?.map(c => c.corequisite_subject_id) || [],
        status: data.status || 'active',
        college_id: data.college_id,
        is_university_wide: data.is_university_wide || false,
        syllabus_content: data.syllabus_content || '',
        syllabus_content_ar: data.syllabus_content_ar || '',
        attendance_method: attendanceRules.method || 'AT_MAN',
        allow_excused_absence: attendanceRules.allow_excused !== false,
        max_absences: attendanceRules.max_absences?.toString() || '',
        grades_visibility_status: data.grades_visibility_status || 'GV_HID',
        requires_payment_completion: data.requires_payment_completion || false,
      })

      setGradeConfiguration(gradeConfig)
      setCollegeId(data.college_id)
      setSelectedCollegeId(data.college_id)
    } catch (err) {
      console.error('Error fetching subject:', err)
      setError(err.message || 'Failed to load subject')
    } finally {
      setFetching(false)
    }
  }

  const handleAddGradeType = () => {
    const selectedTypeCode = document.getElementById('grade-type-select')?.value
    if (!selectedTypeCode) return

    const selectedType = gradeTypes.find(gt => gt.code === selectedTypeCode)
    if (!selectedType) return

    if (gradeConfiguration.some(gc => gc.grade_type_code === selectedTypeCode)) {
      return
    }

    const newConfig = {
      grade_type_id: selectedType.id || selectedTypeCode,
      grade_type_code: selectedType.code,
      grade_type_name_en: selectedType.name_en,
      grade_type_name_ar: selectedType.name_ar,
      weight: ''
    }

    setGradeConfiguration([...gradeConfiguration, newConfig])
    if (document.getElementById('grade-type-select')) {
      document.getElementById('grade-type-select').value = ''
    }
  }

  const handleRemoveGradeType = (index) => {
    setGradeConfiguration(gradeConfiguration.filter((_, i) => i !== index))
  }

  const handleGradeConfigChange = (index, field, value) => {
    const updated = [...gradeConfiguration]
    updated[index] = { ...updated[index], [field]: value }
    setGradeConfiguration(updated)
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handlePrerequisiteChange = (subjectId, checked) => {
    if (checked) {
      setFormData(prev => ({
        ...prev,
        prerequisites: [...prev.prerequisites, parseInt(subjectId)]
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        prerequisites: prev.prerequisites.filter(id => id !== parseInt(subjectId))
      }))
    }
  }

  const handleCorequisiteChange = (subjectId, checked) => {
    if (checked) {
      setFormData(prev => ({
        ...prev,
        corequisites: [...prev.corequisites, parseInt(subjectId)]
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        corequisites: prev.corequisites.filter(id => id !== parseInt(subjectId))
      }))
    }
  }

  const subjectSelectOptions = useMemo(() => {
    const sid = id ? parseInt(id, 10) : null
    return allSubjects
      .filter((s) => s.id !== sid)
      .map((s) => ({
        value: s.id,
        label: formatSubjectOptionLabel(s, isRTL, t),
      }))
  }, [allSubjects, isRTL, id, t])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    try {

      const targetCollegeId = formData.college_id || collegeId || authCollegeId
      if (formData.major_scope === 'all_majors_of_college' && !targetCollegeId) {
        setError(t('subjectsForm.selectCollegeFirst'))
        setLoading(false)
        return
      }
      if (formData.major_scope === 'specific_majors') {
        if (!targetCollegeId) {
          setError(t('subjectsForm.selectCollegeFirst'))
          setLoading(false)
          return
        }
        if (!formData.selected_major_ids?.length) {
          setError(t('subjectsForm.selectAtLeastOneMajor'))
          setLoading(false)
          return
        }
      }

      const isUniversityWide = formData.major_scope === 'university_wide'
      const appliesToAllMajorsOfCollege = formData.major_scope === 'all_majors_of_college'

      const submitData = {
        major_id: null,
        code: formData.code,
        name_en: formData.name_en,
        name_ar: formData.name_ar || formData.name_en,
        type: formData.type,
        semester_number: null,
        credit_hours: parseInt(formData.credit_hours),
        theory_hours: parseInt(formData.theory_hours),
        lab_hours: parseInt(formData.lab_hours) || 0,
        tutorial_hours: parseInt(formData.tutorial_hours) || 0,
        lab_fee: formData.lab_fee ? parseFloat(formData.lab_fee) : null,
        material_fee: formData.material_fee ? parseFloat(formData.material_fee) : null,
        instructor_id: formData.instructor_id ? parseInt(formData.instructor_id) : null,
        instructor_name: formData.instructor_name || null,
        instructor_email: formData.instructor_email || null,
        textbook: formData.textbook || null,
        is_elective: formData.is_elective,
        description: formData.description || null,
        description_ar: formData.description_ar || null,
        status: formData.status,
        is_university_wide: isUniversityWide,
        applies_to_all_majors_of_college: appliesToAllMajorsOfCollege,
        college_id: isUniversityWide ? null : (formData.college_id || collegeId || authCollegeId),
        grade_configuration: gradeConfiguration.map(gc => ({
          grade_type_id: gc.grade_type_id,
          grade_type_code: gc.grade_type_code,
          grade_type_name_en: gc.grade_type_name_en,
          grade_type_name_ar: gc.grade_type_name_ar,
          weight: gc.weight ? parseFloat(gc.weight) : null,
        })),
        syllabus_content: formData.syllabus_content || null,
        syllabus_content_ar: formData.syllabus_content_ar || null,
        attendance_rules: {
          method: formData.attendance_method || 'AT_MAN',
          allow_excused: formData.allow_excused_absence !== false,
          max_absences: formData.max_absences ? parseInt(formData.max_absences) : null,
        },
        grades_visibility_status: formData.grades_visibility_status || 'GV_HID',
        allowed_student_actions: formData.allowed_student_actions || [],
        allowed_teacher_actions: formData.allowed_teacher_actions || [],
      }

      const { error: updateError } = await supabase
        .from('subjects')
        .update(submitData)
        .eq('id', id)

      if (updateError) throw updateError

      // Update subject_majors
      await supabase.from('subject_majors').delete().eq('subject_id', id)
      if (formData.major_scope === 'specific_majors' && formData.selected_major_ids?.length > 0) {
        const subjectMajorsData = formData.selected_major_ids.map(mid => ({
          subject_id: parseInt(id),
          major_id: parseInt(mid),
        }))
        await supabase.from('subject_majors').insert(subjectMajorsData)
      }

      // Update prerequisites
      await supabase.from('subject_prerequisites').delete().eq('subject_id', id)
      if (formData.prerequisites.length > 0) {
        const prereqData = formData.prerequisites.map(prereqId => ({
          subject_id: parseInt(id),
          prerequisite_subject_id: prereqId
        }))
        await supabase.from('subject_prerequisites').insert(prereqData)
      }

      // Update corequisites
      await supabase.from('subject_corequisites').delete().eq('subject_id', id)
      if (formData.corequisites.length > 0) {
        const coreqData = formData.corequisites.map(coreqId => ({
          subject_id: parseInt(id),
          corequisite_subject_id: coreqId
        }))
        await supabase.from('subject_corequisites').insert(coreqData)
      }

      setSuccess(true)
      setTimeout(() => {
        navigate(`/academic/subjects/${id}`)
      }, 2000)
    } catch (err) {
      setError(err.message || 'Failed to update subject')
      console.error('Error updating subject:', err)
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate(`/academic/subjects/${id}`)}
            className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-gray-600 hover:text-gray-900 mb-4`}
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{t('universitySettings.back')}</span>
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{t('subjectsForm.editTitle') || 'Edit Subject'}</h1>
          <p className="text-gray-600 mt-1">{t('subjectsForm.editSubtitle') || 'Update subject information'}</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                {error}
              </div>
            )}
            {success && (
              <div className={`mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                <Check className="w-5 h-5" />
                <span>{t('subjectsForm.updated') || 'Subject updated successfully! Redirecting...'}</span>
              </div>
            )}

            <div className="space-y-6">
              {userRole === 'admin' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.college')} *</label>
                  <select
                    value={selectedCollegeId || ''}
                    onChange={(e) => {
                      const collegeIdValue = e.target.value ? parseInt(e.target.value) : null
                      setCollegeId(collegeIdValue)
                      setSelectedCollegeId(collegeIdValue)
                      setFormData(prev => ({ ...prev, college_id: collegeIdValue, selected_major_ids: [] }))
                      fetchMajors()
                    }}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">{t('subjectsForm.selectCollege')}</option>
                    {colleges.map((college) => (
                      <option key={college.id} value={college.id}>
                        {college.name_en} ({college.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Major scope - same as CreateSubject */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700">{t('subjectsForm.majorScope')}</h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input type="radio" name="major_scope" value="university_wide" checked={formData.major_scope === 'university_wide'} onChange={(e) => handleChange('major_scope', e.target.value)} className="rounded-full" />
                    <div>
                      <span className="font-medium">{t('subjectsForm.universityWideSubject')}</span>
                      <p className="text-xs text-gray-500">{t('subjectsForm.universityWideSubjectDesc')}</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input type="radio" name="major_scope" value="all_majors_of_college" checked={formData.major_scope === 'all_majors_of_college'} onChange={(e) => handleChange('major_scope', e.target.value)} disabled={!collegeId && !authCollegeId} className="rounded-full" />
                    <div>
                      <span className="font-medium">{t('subjectsForm.allMajorsOfCollege')}</span>
                      <p className="text-xs text-gray-500">{t('subjectsForm.allMajorsOfCollegeDesc')}</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input type="radio" name="major_scope" value="specific_majors" checked={formData.major_scope === 'specific_majors'} onChange={(e) => handleChange('major_scope', e.target.value)} disabled={!collegeId && !authCollegeId} className="rounded-full" />
                    <div>
                      <span className="font-medium">{t('subjectsForm.specificMajors')}</span>
                      <p className="text-xs text-gray-500">{t('subjectsForm.specificMajorsDesc')}</p>
                    </div>
                  </label>
                </div>
                {formData.major_scope === 'specific_majors' && (collegeId || authCollegeId) && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.selectMajors')} *</label>
                    <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">
                      {majors.map(major => (
                        <label key={major.id} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={(formData.selected_major_ids || []).includes(String(major.id))} onChange={(e) => { const ids = formData.selected_major_ids || []; const newIds = e.target.checked ? [...ids, String(major.id)] : ids.filter(i => i !== String(major.id)); handleChange('selected_major_ids', newIds) }} />
                          <span>{getLocalizedName(major, isRTL)} ({major.code})</span>
                        </label>
                      ))}
                      {majors.length === 0 && <p className="text-sm text-gray-500">{t('subjectsForm.noMajorsInCollege')}</p>}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.code')} *</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => handleChange('code', e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="e.g., CS101"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.name')} *</label>
                  <input
                    type="text"
                    value={formData.name_en}
                    onChange={(e) => handleChange('name_en', e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="e.g., Introduction to Programming"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.nameAr')}</label>
                  <input
                    type="text"
                    value={formData.name_ar}
                    onChange={(e) => handleChange('name_ar', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="مقدمة في البرمجة"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.type')} *</label>
                <select value={formData.type} onChange={(e) => handleChange('type', e.target.value)} required className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent">
                  <option value="core">{t('subjectsForm.typeCore')}</option>
                  <option value="elective">{t('subjectsForm.typeElective')}</option>
                  <option value="general">{t('subjectsForm.typeGeneral')}</option>
                </select>
              </div>

              {/* Credit Hours */}
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('academic.semesters.creditHoursConfig')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.creditHours')} *</label>
                    <input
                      type="number"
                      value={formData.credit_hours}
                      onChange={(e) => handleChange('credit_hours', e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.theoryHours')} *</label>
                    <input
                      type="number"
                      value={formData.theory_hours}
                      onChange={(e) => handleChange('theory_hours', e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.labHours')}</label>
                    <input
                      type="number"
                      value={formData.lab_hours}
                      onChange={(e) => handleChange('lab_hours', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.tutorialHours')}</label>
                    <input
                      type="number"
                      value={formData.tutorial_hours}
                      onChange={(e) => handleChange('tutorial_hours', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              {/* Prerequisites & Corequisites - Reuse from CreateSubject */}
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('subjectsForm.prerequisitesCorequisites')}</h3>
                {(collegeId || authCollegeId || (formData.major_scope === 'university_wide' && userRole === 'admin')) ? (
                  allSubjects.length > 0 ? (
                  <div className="space-y-4">
                    {formData.major_scope === 'university_wide' && userRole === 'admin' && (
                      <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        {t('subjectsForm.prerequisitesUniversityWideAdminHint')}
                      </p>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.prerequisites')}</label>
                      <SearchableMultiSelect
                        inputId="edit-subject-prerequisites"
                        value={formData.prerequisites}
                        onChange={(ids) => setFormData((prev) => ({ ...prev, prerequisites: ids }))}
                        options={subjectSelectOptions}
                        placeholder={t('subjectsForm.searchSubjectsPlaceholder')}
                        noOptionsMessage={t('subjectsForm.noSubjectsInCollege')}
                        isRTL={isRTL}
                      />
                      <p className="text-xs text-gray-500 mt-2">{t('subjectsForm.prerequisitesHint')}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.corequisites')}</label>
                      <SearchableMultiSelect
                        inputId="edit-subject-corequisites"
                        value={formData.corequisites}
                        onChange={(ids) => setFormData((prev) => ({ ...prev, corequisites: ids }))}
                        options={subjectSelectOptions}
                        placeholder={t('subjectsForm.searchSubjectsPlaceholder')}
                        noOptionsMessage={t('subjectsForm.noSubjectsInCollege')}
                        isRTL={isRTL}
                      />
                      <p className="text-xs text-gray-500 mt-2">{t('subjectsForm.corequisitesHint')}</p>
                    </div>
                  </div>
                  ) : (
                    <p className="text-sm text-gray-500">{t('subjectsForm.noSubjectsInCollege')}</p>
                  )
                ) : (
                  <p className="text-sm text-gray-500">{t('subjectsForm.selectCollegeFirst')}</p>
                )}
              </div>

              {/* Grade Configuration - Reuse from CreateSubject */}
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('subjectsForm.gradeConfiguration')}</h3>
                <p className="text-sm text-gray-600 mb-4">{t('subjectsForm.gradeConfigurationDesc')}</p>
                
                {gradeTypes.length === 0 ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700">
                    <p>{t('subjectsForm.noGradeTypes')}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.selectGradeType')}</label>
                      <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                        <select
                          id="grade-type-select"
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        >
                          <option value="">{t('subjectsForm.selectGradeType')}</option>
                          {gradeTypes
                            .filter(gt => !gradeConfiguration.some(gc => gc.grade_type_code === gt.code))
                            .map(gradeType => (
                              <option key={gradeType.code} value={gradeType.code}>
                                {gradeType.name_en} ({gradeType.code})
                              </option>
                            ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleAddGradeType}
                          className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors`}
                        >
                          <span>{t('subjectsForm.addGradeType')}</span>
                        </button>
                      </div>
                    </div>

                    {gradeConfiguration.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="text-sm font-semibold text-gray-700">{t('subjectsForm.configuredTypes')}</h4>
                        {gradeConfiguration.map((config, index) => (
                          <div key={index} className="bg-white border border-gray-200 rounded-lg p-4">
                            <div className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} mb-4`}>
                              <h5 className="font-medium text-gray-900">
                                {config.grade_type_name_en} ({config.grade_type_code})
                              </h5>
                              <button
                                type="button"
                                onClick={() => handleRemoveGradeType(index)}
                                className="text-red-600 hover:text-red-800 text-sm"
                              >
                                {t('subjectsForm.remove')}
                              </button>
                            </div>
                            <p className="text-xs text-gray-500 mb-3">
                              {t('subjectsForm.gradeTypeScoresFromUniversity') || 'Maximum, minimum, pass and fail scores are set in University Settings → Grade Types.'}
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">{t('subjectsForm.weight')}</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={config.weight || ''}
                                  onChange={(e) => handleGradeConfigChange(index, 'weight', e.target.value)}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                                  placeholder="%"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Syllabus Section */}
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('subjectsForm.syllabus') || 'Syllabus / Course Plan'}</h3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.syllabusContent') || 'Syllabus Content (English)'}</label>
                  <textarea
                    value={formData.syllabus_content || ''}
                    onChange={(e) => handleChange('syllabus_content', e.target.value)}
                    rows={6}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Course outline, topics, learning objectives..."
                  />
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.syllabusContentAr') || 'Syllabus Content (Arabic)'}</label>
                  <textarea
                    value={formData.syllabus_content_ar || ''}
                    onChange={(e) => handleChange('syllabus_content_ar', e.target.value)}
                    rows={6}
                    dir="rtl"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="محتويات المقرر، المواضيع، أهداف التعلم..."
                  />
                </div>
              </div>

              {/* Attendance Rules Section */}
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('subjectsForm.attendanceRules') || 'Attendance Rules'}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.attendanceMethod') || 'Attendance Method'}</label>
                    <select
                      value={formData.attendance_method || 'AT_MAN'}
                      onChange={(e) => handleChange('attendance_method', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="AT_MAN">{t('subjectsForm.attendanceManual') || 'Manual Attendance'}</option>
                      <option value="AT_AUTO">{t('subjectsForm.attendanceAuto') || 'Automatic Attendance (Online)'}</option>
                    </select>
                  </div>
                  <div className="flex items-center space-x-2 mt-6">
                    <input
                      type="checkbox"
                      checked={formData.allow_excused_absence !== false}
                      onChange={(e) => handleChange('allow_excused_absence', e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <label className="text-sm font-medium text-gray-700">{t('subjectsForm.allowExcusedAbsence') || 'Allow Excused Absences'}</label>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.maxAbsences') || 'Maximum Allowed Absences'}</label>
                    <input
                      type="number"
                      value={formData.max_absences || ''}
                      onChange={(e) => handleChange('max_absences', e.target.value)}
                      min="0"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="Leave empty for unlimited"
                    />
                  </div>
                </div>
              </div>

              {/* Grades Visibility Section */}
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('subjectsForm.gradesVisibility') || 'Grades Visibility Settings'}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.gradesVisibilityStatus') || 'Grades Visibility Status'}</label>
                    <select
                      value={formData.grades_visibility_status || 'GV_HID'}
                      onChange={(e) => handleChange('grades_visibility_status', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="GV_HID">{t('subjectsForm.gradesHidden') || 'Grades Hidden'}</option>
                      <option value="GV_TMP">{t('subjectsForm.gradesVisibleTemp') || 'Grades Visible Temporarily'}</option>
                      <option value="GV_REL">{t('subjectsForm.gradesReleased') || 'Grades Released'}</option>
                      <option value="GV_FIN">{t('subjectsForm.gradesFinalLocked') || 'Final Grades Locked'}</option>
                    </select>
                  </div>
                  <div className="flex items-center space-x-2 mt-6">
                    <input
                      type="checkbox"
                      checked={formData.requires_payment_completion || false}
                      onChange={(e) => handleChange('requires_payment_completion', e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <label className="text-sm font-medium text-gray-700">{t('subjectsForm.requiresPaymentCompletion') || 'Require Full Payment (PM100) to View Grades'}</label>
                  </div>
                </div>
              </div>

              {/* Optional Info */}
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('subjectsForm.optionalInfo')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.instructor')}</label>
                    <select
                      value={formData.instructor_id}
                      onChange={(e) => {
                        const instructorId = e.target.value
                        handleChange('instructor_id', instructorId)
                        if (instructorId) {
                          const instructor = instructors.find(inst => inst.id === parseInt(instructorId))
                          if (instructor) {
                            handleChange('instructor_name', instructor.name_en || '')
                            handleChange('instructor_email', instructor.email || '')
                          }
                        } else {
                          handleChange('instructor_name', '')
                          handleChange('instructor_email', '')
                        }
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="">{t('subjectsForm.selectInstructor')}</option>
                      {instructors.map(instructor => (
                        <option key={instructor.id} value={instructor.id}>
                          {formatInstructorDisplayName(instructor, isRTL)} {instructor.title ? `(${instructor.title})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.labFee')}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.lab_fee}
                      onChange={(e) => handleChange('lab_fee', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.materialFee')}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.material_fee}
                      onChange={(e) => handleChange('material_fee', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.textbook')}</label>
                    <input
                      type="text"
                      value={formData.textbook}
                      onChange={(e) => handleChange('textbook', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="Introduction to Programming, 5th Edition"
                    />
                  </div>
                </div>
              </div>

              {/* Description Section */}
              <div className="border-t pt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.description')}</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Brief description of the subject..."
                  />
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.descriptionAr')}</label>
                  <textarea
                    value={formData.description_ar}
                    onChange={(e) => handleChange('description_ar', e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="وصف موجز للمادة..."
                  />
                </div>
              </div>

              <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                <input
                  type="checkbox"
                  checked={formData.is_elective}
                  onChange={(e) => handleChange('is_elective', e.target.checked)}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label className="text-sm font-medium text-gray-700">{t('subjectsForm.isElective')}</label>
              </div>

              <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                <input
                  type="checkbox"
                  checked={formData.status === 'active'}
                  onChange={(e) => handleChange('status', e.target.checked ? 'active' : 'inactive')}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label className="text-sm font-medium text-gray-700">{t('subjectsForm.active')}</label>
              </div>
            </div>
          </div>

          <div className={`flex ${isRTL ? 'justify-start space-x-reverse space-x-4' : 'justify-end space-x-4'}`}>
            <button
              type="button"
              onClick={() => navigate(`/academic/subjects/${id}`)}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              {t('subjectsForm.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-6 py-2 bg-primary-gradient text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Save className="w-5 h-5" />
              <span>{loading ? (t('common.updating') || 'Updating...') : (t('subjectsForm.update') || 'Update Subject')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
