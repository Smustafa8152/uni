import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { formatInstructorDisplayName } from '../../utils/academicTitle'
import { formatSubjectOptionLabel, SUBJECT_OPTION_SELECT } from '../../utils/subjectOptionLabel'
import { supabase, SUPABASE_STORAGE_BUCKET } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { ArrowLeft, Save, Check, Plus, Trash2, Upload } from 'lucide-react'
import SearchableMultiSelect from '../../components/SearchableMultiSelect'

export default function CreateSubject() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { userRole, collegeId: authCollegeId } = useAuth()
  const [loading, setLoading] = useState(false)
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
  const [contentTypes, setContentTypes] = useState([])
  const [subjectMaterials, setSubjectMaterials] = useState([])

  const [formData, setFormData] = useState({
    major_scope: 'specific_majors', // 'university_wide' | 'all_majors_of_college' | 'specific_majors'
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
    // New fields for subject actions system
    syllabus_content: '',
    syllabus_content_ar: '',
    attendance_method: 'AT_MAN',
    allow_excused_absence: true,
    max_absences: '',
    grades_visibility_status: 'GV_HID',
    requires_payment_completion: false,
    allowed_student_actions: [],
    allowed_teacher_actions: [],
  })

  useEffect(() => {
    // Check if college ID is passed via URL parameter
    const urlCollegeId = searchParams.get('collegeId')
    if (urlCollegeId && userRole === 'admin') {
      const collegeIdInt = parseInt(urlCollegeId)
      setCollegeId(collegeIdInt)
      setSelectedCollegeId(collegeIdInt)
      setFormData(prev => ({ ...prev, college_id: collegeIdInt, is_university_wide: false }))
    } else if (userRole === 'user' && authCollegeId) {
      // For college admins, use their college ID
      setCollegeId(authCollegeId)
      setSelectedCollegeId(authCollegeId)
      setFormData(prev => ({ ...prev, college_id: authCollegeId, is_university_wide: false }))
    } else {
      fetchUserCollege()
    }
    
    if (userRole === 'admin') {
      fetchColleges()
    }
    fetchMajors()
    fetchInstructors()
    fetchGradeTypes()
    fetchContentTypes()
  }, [userRole, authCollegeId, collegeId, searchParams])

  const fetchContentTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('subject_content_types')
        .select('*')
        .eq('is_active', true)
        .order('name_en')
      if (error) throw error
      setContentTypes(data || [])
    } catch (err) {
      console.error('Error fetching content types:', err)
    }
  }

  useEffect(() => {
    fetchSubjects()
  }, [collegeId, authCollegeId, formData.major_scope, userRole])

  const fetchUserCollege = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) return

      const { data: userData } = await supabase
        .from('users')
        .select('college_id')
        .eq('email', user.email)
        .single()

      if (userData?.college_id) {
        setCollegeId(userData.college_id)
        setSelectedCollegeId(userData.college_id)
        setFormData(prev => ({ ...prev, college_id: userData.college_id }))
      }
    } catch (err) {
      console.error('Error fetching college ID:', err)
    }
  }

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

      // For college admins (user role): show college's majors OR university-wide majors
      if (userRole === 'user' && authCollegeId) {
        query = query.or(`college_id.eq.${authCollegeId},is_university_wide.eq.true`)
      }
      // For super admins with selected college: show college's majors OR university-wide majors
      else if (userRole === 'admin' && collegeId) {
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

      // University-wide subject (admin): prerequisites can reference any active subject — no college filter
      if (formData.major_scope === 'university_wide' && userRole === 'admin') {
        const { data, error } = await supabase
          .from('subjects')
          .select(SUBJECT_OPTION_SELECT)
          .eq('status', 'active')
          .order('code')
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
        .order('code')

      query = query.or(`college_id.eq.${targetCollegeId},is_university_wide.eq.true`)

      const { data, error } = await query
      if (error) throw error
      setAllSubjects(data || [])
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

      // For college admins (user role), always filter by their college
      if (userRole === 'user' && authCollegeId) {
        query = query.eq('college_id', authCollegeId)
      }
      // For super admins, filter by selected college
      else if (userRole === 'admin' && collegeId) {
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

  const handleAddGradeType = () => {
    const selectedTypeCode = document.getElementById('grade-type-select')?.value
    if (!selectedTypeCode) return

    const selectedType = gradeTypes.find(gt => gt.code === selectedTypeCode)
    if (!selectedType) return

    // Check if this type is already added
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
    // Reset select
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

  const subjectSelectOptions = useMemo(
    () =>
      allSubjects.map((s) => ({
        value: s.id,
        label: formatSubjectOptionLabel(s, isRTL, t),
      })),
    [allSubjects, isRTL, t]
  )

  const addSubjectMaterial = () => {
    setSubjectMaterials(prev => [...prev, { content_type_code: '', title: '', title_ar: '', description: '', external_link: '', file: null, display_order: prev.length }])
  }
  const removeSubjectMaterial = (idx) => {
    setSubjectMaterials(prev => prev.filter((_, i) => i !== idx))
  }
  const updateSubjectMaterial = (idx, field, value) => {
    setSubjectMaterials(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      const targetCollegeId = formData.college_id || collegeId || authCollegeId

      // Validate based on scope
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

      const { data: subject, error: insertError } = await supabase
        .from('subjects')
        .insert(submitData)
        .select()
        .single()

      if (insertError) throw insertError

      // Insert subject_majors for specific majors scope
      if (formData.major_scope === 'specific_majors' && formData.selected_major_ids?.length > 0) {
        const subjectMajorsData = formData.selected_major_ids.map(mid => ({
          subject_id: subject.id,
          major_id: parseInt(mid),
        }))
        await supabase.from('subject_majors').insert(subjectMajorsData)
      }

      // Insert subject materials
      const { data: { user } } = await supabase.auth.getUser()
      const { data: userData } = await supabase.from('users').select('id').eq('email', user?.email).single()
      for (let i = 0; i < subjectMaterials.length; i++) {
        const m = subjectMaterials[i]
        if (!m.content_type_code || !m.title?.trim()) continue
        const isLink = m.content_type_code === 'CT_LNK'
        let fileUrl = null
        if (!isLink && m.file) {
          const ext = m.file.name.split('.').pop()
          const filePath = `materials/${subject.id}/${Date.now()}_${i}.${ext}`
          const { error: upErr } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).upload(filePath, m.file)
          if (!upErr) {
            const { data: { publicUrl } } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(filePath)
            fileUrl = publicUrl
          }
        }
        await supabase.from('subject_materials').insert({
          subject_id: subject.id,
          content_type_code: m.content_type_code,
          title: m.title.trim(),
          title_ar: m.title_ar?.trim() || null,
          description: m.description?.trim() || null,
          file_url: isLink ? null : (fileUrl || null),
          external_link: isLink ? (m.external_link?.trim() || null) : null,
          display_order: i,
          is_published: true,
          published_at: new Date().toISOString(),
          access_level: 'all',
          created_by: userData?.id,
        })
      }

      // Insert prerequisites
      if (formData.prerequisites.length > 0) {
        const prereqData = formData.prerequisites.map(prereqId => ({
          subject_id: subject.id,
          prerequisite_subject_id: prereqId
        }))
        await supabase.from('subject_prerequisites').insert(prereqData)
      }

      // Insert corequisites
      if (formData.corequisites.length > 0) {
        const coreqData = formData.corequisites.map(coreqId => ({
          subject_id: subject.id,
          corequisite_subject_id: coreqId
        }))
        await supabase.from('subject_corequisites').insert(coreqData)
      }

      setSuccess(true)
      setTimeout(() => {
        navigate('/academic/subjects')
      }, 2000)
    } catch (err) {
      setError(err.message || 'Failed to create subject')
      console.error('Error creating subject:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-gray-600 hover:text-gray-900 mb-4`}
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{t('universitySettings.back')}</span>
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{t('subjectsForm.createTitle')}</h1>
          <p className="text-gray-600 mt-1">{t('subjectsForm.createSubtitle')}</p>
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
                <span>{t('subjectsForm.created')}</span>
              </div>
            )}

            <div className="space-y-6">
              {userRole === 'admin' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('subjectsForm.college')} {formData.major_scope !== 'university_wide' ? '*' : ''}
                  </label>
                  <select
                    value={selectedCollegeId || ''}
                    onChange={(e) => {
                      const collegeIdValue = e.target.value ? parseInt(e.target.value) : null
                      setCollegeId(collegeIdValue)
                      setSelectedCollegeId(collegeIdValue)
                      setFormData(prev => ({ ...prev, college_id: collegeIdValue, selected_major_ids: [] }))
                      fetchMajors()
                    }}
                    required={formData.major_scope !== 'university_wide'}
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

              {/* Major scope: University-wide | All majors of college | Specific majors */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-gray-700">{t('subjectsForm.majorScope')}</h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="major_scope"
                      value="university_wide"
                      checked={formData.major_scope === 'university_wide'}
                      onChange={(e) => handleChange('major_scope', e.target.value)}
                      className="rounded-full"
                    />
                    <div>
                      <span className="font-medium">{t('subjectsForm.universityWideSubject')}</span>
                      <p className="text-xs text-gray-500">{t('subjectsForm.universityWideSubjectDesc')}</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="major_scope"
                      value="all_majors_of_college"
                      checked={formData.major_scope === 'all_majors_of_college'}
                      onChange={(e) => handleChange('major_scope', e.target.value)}
                      disabled={!collegeId && !authCollegeId}
                      className="rounded-full"
                    />
                    <div>
                      <span className="font-medium">{t('subjectsForm.allMajorsOfCollege')}</span>
                      <p className="text-xs text-gray-500">{t('subjectsForm.allMajorsOfCollegeDesc')}</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="radio"
                      name="major_scope"
                      value="specific_majors"
                      checked={formData.major_scope === 'specific_majors'}
                      onChange={(e) => handleChange('major_scope', e.target.value)}
                      disabled={!collegeId && !authCollegeId}
                      className="rounded-full"
                    />
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
                          <input
                            type="checkbox"
                            checked={(formData.selected_major_ids || []).includes(String(major.id))}
                            onChange={(e) => {
                              const ids = formData.selected_major_ids || []
                              const newIds = e.target.checked
                                ? [...ids, String(major.id)]
                                : ids.filter(id => id !== String(major.id))
                              handleChange('selected_major_ids', newIds)
                            }}
                          />
                          <span>{getLocalizedName(major, isRTL)} ({major.code})</span>
                        </label>
                      ))}
                      {majors.length === 0 && (
                        <p className="text-sm text-gray-500">{t('subjectsForm.noMajorsInCollege')}</p>
                      )}
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
                <select
                  value={formData.type}
                  onChange={(e) => handleChange('type', e.target.value)}
                  required
                  className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="core">{t('subjectsForm.typeCore')}</option>
                  <option value="elective">{t('subjectsForm.typeElective')}</option>
                  <option value="general">{t('subjectsForm.typeGeneral')}</option>
                </select>
              </div>

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
                        inputId="subject-prerequisites"
                        value={formData.prerequisites}
                        onChange={(ids) => setFormData((prev) => ({ ...prev, prerequisites: ids }))}
                        options={subjectSelectOptions}
                        placeholder={t('subjectsForm.searchSubjectsPlaceholder')}
                        noOptionsMessage={t('subjectsForm.noSubjectsInCollege')}
                        isRTL={isRTL}
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        {t('subjectsForm.prerequisitesHint')}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t('subjectsForm.corequisites')}</label>
                      <SearchableMultiSelect
                        inputId="subject-corequisites"
                        value={formData.corequisites}
                        onChange={(ids) => setFormData((prev) => ({ ...prev, corequisites: ids }))}
                        options={subjectSelectOptions}
                        placeholder={t('subjectsForm.searchSubjectsPlaceholder')}
                        noOptionsMessage={t('subjectsForm.noSubjectsInCollege')}
                        isRTL={isRTL}
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        {t('subjectsForm.corequisitesHint')}
                      </p>
                    </div>
                  </div>
                  ) : (
                    <p className="text-sm text-gray-500">{t('subjectsForm.noSubjectsInCollege')}</p>
                  )
                ) : (
                  <p className="text-sm text-gray-500">{t('subjectsForm.selectCollegeFirst')}</p>
                )}
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('subjectsForm.optionalInfo')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('subjectsForm.instructor')} ({t('subjectsForm.headOfSubject') || 'Head of Subject (Administrative)'})
                    </label>
                    <p className="text-xs text-gray-500 mb-2">
                      {t('subjectsForm.headOfSubjectHint') || 'This is the administrative head of the subject. Teaching instructors are assigned per class when creating classes.'}
                    </p>
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

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('subjectsForm.subjectMaterials')}</h3>
                <p className="text-sm text-gray-600 mb-4">{t('subjectsForm.subjectMaterialsDesc')}</p>
                {subjectMaterials.map((m, idx) => (
                  <div key={idx} className="mb-4 p-4 border rounded-lg bg-gray-50">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-medium text-gray-700">{t('subjectsForm.material')} {idx + 1}</span>
                      <button type="button" onClick={() => removeSubjectMaterial(idx)} className="text-red-600 hover:text-red-800">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('subjectsForm.contentType')}</label>
                        <select
                          value={m.content_type_code}
                          onChange={(e) => updateSubjectMaterial(idx, 'content_type_code', e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                        >
                          <option value="">{t('subjectsForm.selectContentType')}</option>
                          {contentTypes.map(ct => (
                            <option key={ct.code} value={ct.code}>{getLocalizedName(ct, isRTL)}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-1">
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('subjectsForm.title')} *</label>
                        <input
                          type="text"
                          value={m.title}
                          onChange={(e) => updateSubjectMaterial(idx, 'title', e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg text-sm"
                          placeholder={t('subjectsForm.materialTitlePlaceholder')}
                        />
                      </div>
                      {m.content_type_code === 'CT_LNK' ? (
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('subjectsForm.externalLink')}</label>
                          <input
                            type="url"
                            value={m.external_link || ''}
                            onChange={(e) => updateSubjectMaterial(idx, 'external_link', e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                            placeholder="https://..."
                          />
                        </div>
                      ) : (
                        <div className="md:col-span-2">
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('subjectsForm.uploadFile')}</label>
                          <input
                            type="file"
                            onChange={(e) => { if (e.target.files[0]) updateSubjectMaterial(idx, 'file', e.target.files[0]) }}
                            className="w-full text-sm"
                            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.mp4,.mp3"
                          />
                          {m.file && <span className="text-xs text-green-600">{m.file.name}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addSubjectMaterial}
                  className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-4 py-2 border border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-primary-500 hover:text-primary-600 text-sm`}
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('subjectsForm.addMaterial')}</span>
                </button>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('subjectsForm.gradeConfiguration')}</h3>
                <p className="text-sm text-gray-600 mb-4">{t('subjectsForm.gradeConfigurationDesc')}</p>
                
                {gradeTypes.length === 0 ? (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700">
                    <p>{t('subjectsForm.noGradeTypes')}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Add Grade Type */}
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

                    {/* Configured Grade Types */}
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
                                  value={config.weight}
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
              onClick={() => navigate(-1)}
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
              <span>{loading ? t('subjectsForm.creating') : t('subjectsForm.create')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


