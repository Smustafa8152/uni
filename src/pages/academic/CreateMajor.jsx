import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { legacyMajorRecordStatus } from '../../utils/majorAdmissionStatus'
import { useAuth } from '../../contexts/AuthContext'
import { ArrowLeft, Save, Check, Plus, Trash2, ChevronDown, ChevronUp, BookOpen, GraduationCap } from 'lucide-react'

export default function CreateMajor() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { userRole } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [collegeId, setCollegeId] = useState(null)
  const [colleges, setColleges] = useState([])
  const [departments, setDepartments] = useState([])
  const [instructors, setInstructors] = useState([])
  const [isUniversityWide, setIsUniversityWide] = useState(false)
  const [subjects, setSubjects] = useState([])
  const [academicYears, setAcademicYears] = useState([])
  const [showMajorSheetConfig, setShowMajorSheetConfig] = useState(false)
  
  // Major Sheet Configuration State
  const [majorSheet, setMajorSheet] = useState({
    version: '',
    academic_year: new Date().getFullYear() + '-' + (new Date().getFullYear() + 1),
    effective_from: new Date().toISOString().split('T')[0],
    effective_to: '',
    sheet_type: 'rule_based', // 'fixed_by_year' or 'rule_based'
    total_credits_required: 120,
    min_credits_per_semester: 12,
    max_credits_per_semester: 18,
    min_gpa_for_graduation: 2.0,
    description: ''
  })
  
  const [courseGroups, setCourseGroups] = useState([
    {
      group_type: 'university_requirements',
      group_name_en: 'University Requirements',
      group_name_ar: 'متطلبات الجامعة',
      group_number: 1,
      min_credits_required: 0,
      max_credits_allowed: null,
      rule_type: 'choose_n_from_m',
      choose_count: null,
      total_options: null,
      allows_substitution: false,
      requires_approval_for_substitution: true,
      min_gpa_required: null,
      description: '',
      courses: []
    },
    {
      group_type: 'college_requirements',
      group_name_en: 'College Requirements',
      group_name_ar: 'متطلبات الكلية',
      group_number: 2,
      min_credits_required: 0,
      max_credits_allowed: null,
      rule_type: 'all_required',
      choose_count: null,
      total_options: null,
      allows_substitution: false,
      requires_approval_for_substitution: true,
      min_gpa_required: null,
      description: '',
      courses: []
    },
    {
      group_type: 'major_core',
      group_name_en: 'Major Core Courses',
      group_name_ar: 'مقررات التخصص الأساسية',
      group_number: 3,
      min_credits_required: 0,
      max_credits_allowed: null,
      rule_type: 'all_required',
      choose_count: null,
      total_options: null,
      allows_substitution: false,
      requires_approval_for_substitution: true,
      min_gpa_required: null,
      description: '',
      courses: []
    },
    {
      group_type: 'major_electives',
      group_name_en: 'Major Electives',
      group_name_ar: 'مقررات التخصص الاختيارية',
      group_number: 4,
      min_credits_required: 0,
      max_credits_allowed: null,
      rule_type: 'choose_n_from_m',
      choose_count: null,
      total_options: null,
      allows_substitution: true,
      requires_approval_for_substitution: true,
      min_gpa_required: null,
      description: '',
      courses: []
    },
    {
      group_type: 'free_electives',
      group_name_en: 'Free Electives',
      group_name_ar: 'المقررات الحرة',
      group_number: 5,
      min_credits_required: 0,
      max_credits_allowed: null,
      rule_type: 'flexible',
      choose_count: null,
      total_options: null,
      allows_substitution: true,
      requires_approval_for_substitution: false,
      min_gpa_required: null,
      description: '',
      courses: []
    }
  ])
  
  const [expandedGroups, setExpandedGroups] = useState({})
  const addingCourseRef = useRef(false) // Prevent duplicate course additions

  const [formData, setFormData] = useState({
    faculty_id: '',
    department_id: '',
    code: '',
    name_en: '',
    name_ar: '',
    degree_level: 'bachelor',
    degree_title_en: '',
    degree_title_ar: '',
    total_credits: 120,
    core_credits: 90,
    elective_credits: 30,
    min_semesters: 8,
    max_semesters: 12,
    min_gpa: 2.0,
    tuition_fee: '',
    lab_fee: '',
    registration_fee: '',
    accreditation_date: '',
    accreditation_expiry: '',
    accrediting_body: '',
    head_of_major_id: '',
    head_of_major: '',
    head_email: '',
    head_phone: '',
    description: '',
    description_ar: '',
    status: 'active',
    major_status: 'draft',
    college_id: null,
    is_university_wide: false,
    // Validation Rules
    validation_toefl_min: '',
    validation_ielts_min: '',
    validation_gpa_min: '',
    validation_graduation_year_min: '',
    validation_certificate_types: [],
    validation_requires_interview: false,
    validation_requires_entrance_exam: false,
    // Major-Level Academic Controls
    max_study_duration_years: '',
    min_gpa_override: '',
    enable_substitution_workflow: false,
    enable_prerequisite_override: false,
    enforce_graduation_threshold: false,
  })

  useEffect(() => {
    // Check if college ID is passed via URL parameter
    const urlCollegeId = searchParams.get('collegeId')
    if (urlCollegeId && userRole === 'admin') {
      const collegeIdInt = parseInt(urlCollegeId)
      setCollegeId(collegeIdInt)
      setFormData(prev => ({ ...prev, college_id: collegeIdInt, is_university_wide: false }))
      setIsUniversityWide(false)
    } else {
      fetchUserCollege()
    }
    
    if (userRole === 'admin') {
      fetchColleges()
    }
    fetchInstructors()
    fetchDepartments()
    fetchAcademicYears()
    if (collegeId || isUniversityWide || formData.college_id) {
      fetchSubjects()
    }
  }, [userRole, isUniversityWide, searchParams, collegeId])
  
  // Fetch subjects and academic years when form college selection or university-wide settings change
  useEffect(() => {
    const currentCollegeId = formData.college_id || collegeId
    if (currentCollegeId || isUniversityWide) {
      fetchSubjects()
      fetchAcademicYears()
    } else if (userRole === 'admin' && !isUniversityWide) {
      // For admins, if no college is selected, don't fetch (wait for selection)
      setSubjects([])
      setAcademicYears([])
    }
  }, [formData.college_id, collegeId, isUniversityWide, userRole])

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
        .select('id, name_en, name_ar, code')
        .eq('status', 'active')
        .order('name_en')

      if (error) throw error
      setColleges(data || [])
    } catch (err) {
      console.error('Error fetching colleges:', err)
    }
  }

  const fetchDepartments = async () => {
    try {
      let query = supabase
        .from('departments')
        .select('id, name_en, name_ar, code')
        .eq('status', 'active')
        .order('name_en')

      if (!isUniversityWide && collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      } else if (isUniversityWide) {
        query = query.eq('is_university_wide', true)
      }

      const { data, error } = await query
      if (error) throw error
      setDepartments(data || [])
    } catch (err) {
      console.error('Error fetching departments:', err)
    }
  }

  const fetchInstructors = async () => {
    try {
      let query = supabase
        .from('instructors')
        .select('id, name_en, name_ar, email, phone, title')
        .eq('status', 'active')
        .order('name_en')

      if (!isUniversityWide && collegeId) {
        query = query.eq('college_id', collegeId)
      }

      const { data, error } = await query
      if (error) throw error
      setInstructors(data || [])
    } catch (err) {
      console.error('Error fetching instructors:', err)
    }
  }

  const fetchSubjects = async () => {
    try {
      // Use formData.college_id if available (for admin selection), otherwise use collegeId state
      const currentCollegeId = formData.college_id || collegeId
      
      let query = supabase
        .from('subjects')
        .select('id, code, name_en, name_ar, credit_hours, type')
        .eq('status', 'active')
        .order('code')

      if (!isUniversityWide && currentCollegeId) {
        // Show subjects for selected college + university-wide subjects
        query = query.or(`college_id.eq.${currentCollegeId},is_university_wide.eq.true`)
      } else if (isUniversityWide) {
        // University-wide mode: only show university-wide subjects
        query = query.eq('is_university_wide', true)
      } else if (userRole === 'user' && currentCollegeId) {
        // College admin: show only their college's subjects + university-wide
        query = query.or(`college_id.eq.${currentCollegeId},is_university_wide.eq.true`)
      } else if (!currentCollegeId && userRole === 'admin') {
        // Admin with no college selected: show all subjects
        // No filter applied
      }

      const { data, error } = await query
      if (error) throw error
      setSubjects(data || [])
    } catch (err) {
      console.error('Error fetching subjects:', err)
      setSubjects([])
    }
  }

  const fetchAcademicYears = async () => {
    try {
      // Use formData.college_id if available (for admin selection), otherwise use collegeId state
      const currentCollegeId = formData.college_id || collegeId
      
      let query = supabase
        .from('academic_years')
        .select('id, name_en, name_ar, code, start_date, end_date')
        .order('start_date', { ascending: false })

      // For college admins (user role): show college's academic years OR university-wide
      if (userRole === 'user' && currentCollegeId) {
        query = query.or(`college_id.eq.${currentCollegeId},is_university_wide.eq.true`)
      } else if (isUniversityWide) {
        // University-wide: show only university-wide academic years
        query = query.eq('is_university_wide', true)
      } else if (currentCollegeId && userRole === 'admin') {
        // For super admin with selected college: show that college's academic years + university-wide
        query = query.or(`college_id.eq.${currentCollegeId},is_university_wide.eq.true`)
      }
      // If no college selected and not university-wide, show all (for super admin)

      const { data, error } = await query
      if (error) throw error
      setAcademicYears(data || [])
      
      // Auto-select the first academic year if none is set and academic years are available
      if (data && data.length > 0) {
        setMajorSheet(prev => {
          // Only auto-select if academic_year is empty or matches the default auto-generated format
          const currentYear = new Date().getFullYear()
          const defaultFormat = `${currentYear}-${currentYear + 1}`
          if (!prev.academic_year || prev.academic_year === defaultFormat) {
            return { ...prev, academic_year: data[0].name_en || data[0].code }
          }
          return prev
        })
      }
    } catch (err) {
      console.error('Error fetching academic years:', err)
      setAcademicYears([])
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleMajorSheetChange = (field, value) => {
    setMajorSheet(prev => ({ ...prev, [field]: value }))
  }

  const handleCourseGroupChange = (groupIndex, field, value) => {
    setCourseGroups(prev => {
      const updated = [...prev]
      updated[groupIndex] = { ...updated[groupIndex], [field]: value }
      return updated
    })
  }

  const toggleGroupExpanded = (groupIndex) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupIndex]: !prev[groupIndex]
    }))
  }

  const addCourseToGroup = (groupIndex, subjectId) => {
    // Prevent duplicate additions (especially in React Strict Mode)
    if (addingCourseRef.current) {
      return
    }
    
    const subject = subjects.find(s => s.id === subjectId)
    if (!subject) return

    // Set flag to prevent concurrent additions
    addingCourseRef.current = true

    setCourseGroups(prev => {
      const updated = [...prev]
      
      // Check if course already exists in the group to prevent duplicates
      const courseExists = updated[groupIndex].courses.some(c => c.subject_id === subjectId)
      if (courseExists) {
        console.warn(`Course with subject_id ${subjectId} already exists in group ${groupIndex}`)
        addingCourseRef.current = false
        return prev // Return previous state if course already exists
      }
      
      const course = {
        subject_id: subjectId,
        is_mandatory: updated[groupIndex].rule_type === 'all_required',
        is_capstone: false,
        academic_year: majorSheet.sheet_type === 'fixed_by_year' ? null : null,
        semester_number: majorSheet.sheet_type === 'fixed_by_year' ? null : null,
        display_order: updated[groupIndex].courses.length,
        notes: ''
      }
      
      // Create new array for courses and new object for the group to ensure React detects changes
      const newCourses = [...updated[groupIndex].courses, course]
      updated[groupIndex] = {
        ...updated[groupIndex],
        courses: newCourses,
        // Auto-update total_options for choose_n_from_m rule type
        total_options: updated[groupIndex].rule_type === 'choose_n_from_m' ? newCourses.length : updated[groupIndex].total_options
      }
      
      // Reset flag after state update (increased timeout to handle React StrictMode double calls)
      setTimeout(() => {
        addingCourseRef.current = false
      }, 300)
      
      return updated
    })
  }

  const removeCourseFromGroup = (groupIndex, courseIndex) => {
    setCourseGroups(prev => {
      const updated = [...prev]
      updated[groupIndex].courses = updated[groupIndex].courses.filter((_, i) => i !== courseIndex)
      // Auto-update total_options for choose_n_from_m rule type
      if (updated[groupIndex].rule_type === 'choose_n_from_m') {
        updated[groupIndex].total_options = updated[groupIndex].courses.length
      }
      return updated
    })
  }

  const updateCourseInGroup = (groupIndex, courseIndex, field, value) => {
    setCourseGroups(prev => {
      const updated = [...prev]
      updated[groupIndex].courses[courseIndex] = {
        ...updated[groupIndex].courses[courseIndex],
        [field]: value
      }
      return updated
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      const submitData = {
        faculty_id: null, // No longer required - majors use instructors instead
        department_id: formData.department_id ? parseInt(formData.department_id) : null,
        code: formData.code,
        name_en: formData.name_en,
        name_ar: formData.name_ar || formData.name_en,
        degree_level: formData.degree_level,
        degree_title_en: formData.degree_title_en || null,
        degree_title_ar: formData.degree_title_ar || null,
        total_credits: parseInt(formData.total_credits),
        core_credits: parseInt(formData.core_credits),
        elective_credits: parseInt(formData.elective_credits),
        min_semesters: parseInt(formData.min_semesters),
        max_semesters: parseInt(formData.max_semesters),
        min_gpa: parseFloat(formData.min_gpa),
        tuition_fee: formData.tuition_fee ? parseFloat(formData.tuition_fee) : null,
        lab_fee: formData.lab_fee ? parseFloat(formData.lab_fee) : null,
        registration_fee: formData.registration_fee ? parseFloat(formData.registration_fee) : null,
        accreditation_date: formData.accreditation_date || null,
        accreditation_expiry: formData.accreditation_expiry || null,
        accrediting_body: formData.accrediting_body || null,
        head_of_major: formData.head_of_major || null,
        head_email: formData.head_email || null,
        head_phone: formData.head_phone || null,
        head_of_major_id: formData.head_of_major_id ? parseInt(formData.head_of_major_id) : null,
        description: formData.description || null,
        description_ar: formData.description_ar || null,
        status: legacyMajorRecordStatus(formData.major_status),
        major_status: formData.major_status,
        is_university_wide: isUniversityWide,
        college_id: isUniversityWide ? null : (formData.college_id || collegeId),
        max_study_duration_years: formData.max_study_duration_years ? parseInt(formData.max_study_duration_years) : null,
        min_gpa_override: formData.min_gpa_override ? parseFloat(formData.min_gpa_override) : null,
        enable_substitution_workflow: formData.enable_substitution_workflow,
        enable_prerequisite_override: formData.enable_prerequisite_override,
        enforce_graduation_threshold: formData.enforce_graduation_threshold,
        validation_rules: {
          toefl_min: formData.validation_toefl_min ? parseInt(formData.validation_toefl_min) : null,
          ielts_min: formData.validation_ielts_min ? parseFloat(formData.validation_ielts_min) : null,
          gpa_min: formData.validation_gpa_min ? parseFloat(formData.validation_gpa_min) : null,
          graduation_year_min: formData.validation_graduation_year_min ? parseInt(formData.validation_graduation_year_min) : null,
          certificate_types_allowed: formData.validation_certificate_types.length > 0 ? formData.validation_certificate_types : null,
          requires_interview: formData.validation_requires_interview || false,
          requires_entrance_exam: formData.validation_requires_entrance_exam || false,
        },
      }

      const { data: majorData, error: insertError } = await supabase
        .from('majors')
        .insert(submitData)
        .select()
        .single()

      if (insertError) throw insertError

      // University-wide: single record, no cloning. New colleges automatically see it via query filter.

      // Create Major Sheet if configured
      if (showMajorSheetConfig && majorSheet.version) {
        const majorSheetData = {
          major_id: majorData.id,
          version: majorSheet.version,
          academic_year: majorSheet.academic_year,
          effective_from: majorSheet.effective_from,
          effective_to: majorSheet.effective_to || null,
          sheet_type: majorSheet.sheet_type,
          total_credits_required: parseInt(majorSheet.total_credits_required),
          min_credits_per_semester: parseInt(majorSheet.min_credits_per_semester),
          max_credits_per_semester: parseInt(majorSheet.max_credits_per_semester),
          min_gpa_for_graduation: parseFloat(majorSheet.min_gpa_for_graduation),
          description: majorSheet.description || null,
          is_active: true
        }

        const { data: sheetData, error: sheetError } = await supabase
          .from('major_sheets')
          .insert(majorSheetData)
          .select()
          .single()

        if (sheetError) throw sheetError

        // Create course groups
        for (const group of courseGroups) {
          if (group.courses.length === 0 && group.rule_type === 'all_required') continue
          
          const groupData = {
            major_sheet_id: sheetData.id,
            group_type: group.group_type,
            group_name_en: group.group_name_en,
            group_name_ar: group.group_name_ar || null,
            group_number: group.group_number,
            min_credits_required: parseInt(group.min_credits_required) || 0,
            max_credits_allowed: group.max_credits_allowed ? parseInt(group.max_credits_allowed) : null,
            rule_type: group.rule_type,
            choose_count: group.choose_count ? parseInt(group.choose_count) : null,
            total_options: group.total_options ? parseInt(group.total_options) : null,
            allows_substitution: group.allows_substitution,
            requires_approval_for_substitution: group.requires_approval_for_substitution,
            min_gpa_required: group.min_gpa_required ? parseFloat(group.min_gpa_required) : null,
            description: group.description || null,
            display_order: group.group_number,
            is_active: true
          }

          const { data: groupDataResult, error: groupError } = await supabase
            .from('course_groups')
            .insert(groupData)
            .select()
            .single()

          if (groupError) throw groupError

          // Add courses to group
          for (const course of group.courses) {
            const courseData = {
              major_sheet_id: sheetData.id,
              course_group_id: groupDataResult.id,
              subject_id: parseInt(course.subject_id),
              is_mandatory: course.is_mandatory,
              is_capstone: course.is_capstone || false,
              academic_year: course.academic_year ? parseInt(course.academic_year) : null,
              semester_number: course.semester_number ? parseInt(course.semester_number) : null,
              display_order: course.display_order || 0,
              notes: course.notes || null
            }

            const { error: courseError } = await supabase
              .from('major_sheet_courses')
              .insert(courseData)

            if (courseError) throw courseError
          }
        }
      }

      setSuccess(true)
      setTimeout(() => {
        navigate('/academic/majors')
      }, 2000)
    } catch (err) {
      setError(err.message || 'Failed to create major')
      console.error('Error creating major:', err)
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
            <span>{t('academic.majors.back')}</span>
          </button>
          <h1 className={`text-3xl font-bold text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.createTitle')}</h1>
          <p className={`text-gray-600 mt-1 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.createSubtitle')}</p>
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
                <span>{t('academic.majors.createdSuccess')}</span>
              </div>
            )}

            <div className="space-y-6">
              {userRole === 'admin' && (
                <div className="flex items-center space-x-2 p-4 bg-gray-50 rounded-lg">
                  <input
                    type="checkbox"
                    checked={isUniversityWide}
                    onChange={(e) => {
                      setIsUniversityWide(e.target.checked)
                      if (e.target.checked) {
                        setFormData(prev => ({ ...prev, college_id: null }))
                      } else {
                        setFormData(prev => ({ ...prev, college_id: collegeId }))
                      }
                      fetchDepartments()
                    }}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label className={`text-sm font-medium text-gray-700 ${isRTL ? 'text-right' : 'text-left'}`}>
                    {t('academic.majors.universityWide')}
                  </label>
                </div>
              )}

              {userRole === 'admin' && !isUniversityWide && (
                <div>
                  <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.college')}</label>
                  <select
                    value={formData.college_id || ''}
                    onChange={(e) => {
                      const selectedCollegeId = e.target.value ? parseInt(e.target.value) : null
                      handleChange('college_id', selectedCollegeId)
                      setCollegeId(selectedCollegeId)
                      fetchDepartments()
                      // Subjects and academic years will be fetched by useEffect when collegeId or formData.college_id changes
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">{t('academic.majors.selectCollege')}</option>
                    {colleges.map(college => (
                      <option key={college.id} value={college.id}>{getLocalizedName(college, isRTL)}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.code')} *</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => handleChange('code', e.target.value)}
                    required
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                    placeholder={t('academic.majors.codePlaceholder')}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.initialStatus', 'Initial Status')} *</label>
                  <select
                    value={formData.major_status}
                    onChange={(e) => handleChange('major_status', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="draft">{t('academic.majors.statusDraft', 'Draft')}</option>
                    <option value="open_for_admission">{t('academic.majors.statusOpen', 'Open for Admission')}</option>
                    <option value="active">{t('academic.majors.statusActive', 'Active')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.name')} *</label>
                  <input
                    type="text"
                    value={formData.name_en}
                    onChange={(e) => handleChange('name_en', e.target.value)}
                    required
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                    placeholder={t('academic.majors.namePlaceholder')}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.nameAr')}</label>
                  <input
                    type="text"
                    value={formData.name_ar}
                    onChange={(e) => handleChange('name_ar', e.target.value)}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                    placeholder={t('academic.majors.nameArPlaceholder')}
                  />
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.degreeLevel')} *</label>
                <select
                  value={formData.degree_level}
                  onChange={(e) => handleChange('degree_level', e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="bachelor">{t('academic.majors.bachelor')}</option>
                  <option value="master">{t('academic.majors.master')}</option>
                  <option value="phd">{t('academic.majors.phd')}</option>
                  <option value="diploma">{t('academic.majors.diploma')}</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.degreeTitle')}</label>
                  <input
                    type="text"
                    value={formData.degree_title_en}
                    onChange={(e) => handleChange('degree_title_en', e.target.value)}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                    placeholder={t('academic.majors.degreeTitlePlaceholder')}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.degreeTitleAr')}</label>
                  <input
                    type="text"
                    value={formData.degree_title_ar}
                    onChange={(e) => handleChange('degree_title_ar', e.target.value)}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                    placeholder={t('academic.majors.degreeTitleArPlaceholder')}
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className={`text-lg font-semibold text-gray-900 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.academicRequirements')}</h3>
                <p
                  className={`text-sm text-gray-600 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 mb-4 ${isRTL ? 'text-right' : 'text-left'}`}
                  role="note"
                >
                  {t('academic.majors.requirementsHierarchy.majorBody')}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.totalCredits')} *</label>
                    <input
                      type="number"
                      value={formData.total_credits}
                      onChange={(e) => handleChange('total_credits', e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.coreCredits')} *</label>
                    <input
                      type="number"
                      value={formData.core_credits}
                      onChange={(e) => handleChange('core_credits', e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.electiveCredits')} *</label>
                    <input
                      type="number"
                      value={formData.elective_credits}
                      onChange={(e) => handleChange('elective_credits', e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.minSemesters')} *</label>
                    <input
                      type="number"
                      value={formData.min_semesters}
                      onChange={(e) => handleChange('min_semesters', e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.maxSemesters')} *</label>
                    <input
                      type="number"
                      value={formData.max_semesters}
                      onChange={(e) => handleChange('max_semesters', e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.minGpa')} *</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.min_gpa}
                      onChange={(e) => handleChange('min_gpa', e.target.value)}
                      required
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className={`text-lg font-semibold text-gray-900 mb-4 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.financialInformation')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.tuitionFee')}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.tuition_fee}
                      onChange={(e) => handleChange('tuition_fee', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.labFee')}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.lab_fee}
                      onChange={(e) => handleChange('lab_fee', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.registrationFee')}</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.registration_fee}
                      onChange={(e) => handleChange('registration_fee', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className={`text-lg font-semibold text-gray-900 mb-4 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.accreditationContact')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.accreditationDate')}</label>
                    <input
                      type="date"
                      value={formData.accreditation_date}
                      onChange={(e) => handleChange('accreditation_date', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.accreditationExpiry')}</label>
                    <input
                      type="date"
                      value={formData.accreditation_expiry}
                      onChange={(e) => handleChange('accreditation_expiry', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.accreditingBody')}</label>
                    <input
                      type="text"
                      value={formData.accrediting_body}
                      onChange={(e) => handleChange('accrediting_body', e.target.value)}
                      className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.headOfMajor')}</label>
                    <select
                      value={formData.head_of_major_id}
                      onChange={(e) => {
                        const instructorId = e.target.value
                        handleChange('head_of_major_id', instructorId)
                        if (instructorId) {
                          const instructor = instructors.find(inst => inst.id === parseInt(instructorId))
                          if (instructor) {
                            handleChange('head_of_major', instructor.name_en || '')
                            handleChange('head_email', instructor.email || '')
                            handleChange('head_phone', instructor.phone || '')
                          }
                        } else {
                          handleChange('head_of_major', '')
                          handleChange('head_email', '')
                          handleChange('head_phone', '')
                        }
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="">{t('academic.majors.selectInstructor')}</option>
                      {instructors.map(instructor => (
                        <option key={instructor.id} value={instructor.id}>
                          {getLocalizedName(instructor, isRTL)} {instructor.title ? `(${instructor.title})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.headEmail')}</label>
                    <input
                      type="email"
                      value={formData.head_email}
                      onChange={(e) => handleChange('head_email', e.target.value)}
                      className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                      readOnly={!!formData.head_of_major_id}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.headPhone')}</label>
                    <input
                      type="tel"
                      value={formData.head_phone}
                      onChange={(e) => handleChange('head_phone', e.target.value)}
                      className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                      readOnly={!!formData.head_of_major_id}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <div>
                  <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.description')}</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    rows={3}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                  />
                </div>
                <div className="mt-4">
                  <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.descriptionAr')}</label>
                  <textarea
                    value={formData.description_ar}
                    onChange={(e) => handleChange('description_ar', e.target.value)}
                    rows={3}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className={`text-lg font-semibold text-gray-900 mb-4 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.validationRules') || 'Admission Validation Rules'}</h3>
                <p className={`text-sm text-gray-600 mb-4 ${isRTL ? 'text-right' : 'text-left'}`}>
                  {t('academic.majors.validationRulesDesc') || 'These rules will be used to automatically validate applications submitted for this major.'}
                </p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.validationToeflMin') || 'Minimum TOEFL Score (0-120)'}</label>
                    <input
                      type="number"
                      min="0"
                      max="120"
                      value={formData.validation_toefl_min}
                      onChange={(e) => handleChange('validation_toefl_min', e.target.value)}
                      className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                      placeholder="e.g., 80"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.validationIeltsMin') || 'Minimum IELTS Score (0.0-9.0)'}</label>
                    <input
                      type="number"
                      min="0"
                      max="9"
                      step="0.1"
                      value={formData.validation_ielts_min}
                      onChange={(e) => handleChange('validation_ielts_min', e.target.value)}
                      className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                      placeholder="e.g., 6.5"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.validationGpaMin') || 'Minimum High School GPA (0.0-4.0)'}</label>
                    <input
                      type="number"
                      min="0"
                      max="4"
                      step="0.1"
                      value={formData.validation_gpa_min}
                      onChange={(e) => handleChange('validation_gpa_min', e.target.value)}
                      className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                      placeholder="e.g., 3.0"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.validationGraduationYearMin') || 'Minimum Graduation Year'}</label>
                    <input
                      type="number"
                      min="1950"
                      max="2100"
                      value={formData.validation_graduation_year_min}
                      onChange={(e) => handleChange('validation_graduation_year_min', e.target.value)}
                      className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                      placeholder="e.g., 2020"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.validationCertificateTypes') || 'Allowed Certificate Types (comma-separated)'}</label>
                  <input
                    type="text"
                    value={formData.validation_certificate_types.join(', ')}
                    onChange={(e) => {
                      const values = e.target.value.split(',').map(v => v.trim()).filter(v => v)
                      handleChange('validation_certificate_types', values)
                    }}
                    className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                    placeholder={t('academic.majors.validationCertificateTypesPlaceholder') || 'e.g., IB, A-Levels, Tawjihi, SAT'}
                  />
                  <p className={`text-xs text-gray-500 mt-1 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.validationCertificateTypesHint') || 'Enter certificate types separated by commas'}</p>
                </div>

                <div className="space-y-2">
                  <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                    <input
                      type="checkbox"
                      checked={formData.validation_requires_interview}
                      onChange={(e) => handleChange('validation_requires_interview', e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <label className={`text-sm font-medium text-gray-700 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.validationRequiresInterview') || 'Requires Interview'}</label>
                  </div>
                  <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                    <input
                      type="checkbox"
                      checked={formData.validation_requires_entrance_exam}
                      onChange={(e) => handleChange('validation_requires_entrance_exam', e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <label className={`text-sm font-medium text-gray-700 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.validationRequiresEntranceExam') || 'Requires Entrance Exam'}</label>
                  </div>
                </div>
              </div>

              {/* Major-Level Academic Controls */}
              <div className="border-t pt-6">
                <h3 className={`text-lg font-semibold text-gray-900 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.academicControls', 'Major-Level Academic Controls')}</h3>
                <p className={`text-sm text-gray-600 mb-4 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.academicControlsDesc', 'Program-specific logic and rules')}</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.maxStudyDuration', 'Maximum Study Duration (Years)')}</label>
                    <input
                      type="number"
                      value={formData.max_study_duration_years}
                      onChange={(e) => handleChange('max_study_duration_years', e.target.value)}
                      className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 ${isRTL ? 'text-right' : 'text-left'}`}
                      placeholder="e.g., 6"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.minGpaOverride', 'Major-Specific Min GPA Override')}</label>
                    <input
                      type="number"
                      step="0.1"
                      value={formData.min_gpa_override}
                      onChange={(e) => handleChange('min_gpa_override', e.target.value)}
                      className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 ${isRTL ? 'text-right' : 'text-left'}`}
                      placeholder={t('academic.majors.leaveEmptyForDefault', 'Leave empty to use default')}
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className={`flex items-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <input
                      type="checkbox"
                      checked={formData.enable_substitution_workflow}
                      onChange={(e) => handleChange('enable_substitution_workflow', e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">{t('academic.majors.enableSubstitutionWorkflow', 'Enable Course Substitution Approval Workflow')}</span>
                  </label>
                  <label className={`flex items-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <input
                      type="checkbox"
                      checked={formData.enable_prerequisite_override}
                      onChange={(e) => handleChange('enable_prerequisite_override', e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">{t('academic.majors.enablePrerequisiteOverride', 'Enable Prerequisite Override Approval (via Head of Major)')}</span>
                  </label>
                  <label className={`flex items-center gap-2 cursor-pointer ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <input
                      type="checkbox"
                      checked={formData.enforce_graduation_threshold}
                      onChange={(e) => handleChange('enforce_graduation_threshold', e.target.checked)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="text-sm text-gray-700">{t('academic.majors.enforceGraduationThreshold', 'Enforce Graduation Credit Threshold')}</span>
                  </label>
                </div>
              </div>

              <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                <input
                  type="checkbox"
                  checked={formData.status === 'active'}
                  onChange={(e) => handleChange('status', e.target.checked ? 'active' : 'inactive')}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label className={`text-sm font-medium text-gray-700 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.active')}</label>
              </div>
            </div>
          </div>

          {/* Major Sheet (Degree Plan) Configuration - HIDDEN BY DEFAULT */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex-1">
                <h3 className={`text-xl font-bold text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>
                  <GraduationCap className="inline w-6 h-6 mr-2" />
                  Major Sheet (Degree Plan) Configuration
                </h3>
                <div className={`bg-amber-50 border-l-4 border-amber-400 p-4 mt-2 rounded ${isRTL ? 'text-right border-r-4 border-l-0' : 'text-left'}`}>
                  <p className={`text-sm font-bold text-amber-900 ${isRTL ? 'text-right' : 'text-left'}`}>
                    ⚠️ Important: Configure Degree Plan Later (After Creating Subjects)
                  </p>
                  <div className={`text-xs text-amber-800 mt-3 space-y-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                    <p className="font-semibold">Recommended Workflow:</p>
                    <ol className={`list-decimal list-inside space-y-1 ml-4 ${isRTL ? 'mr-4 ml-0' : ''}`}>
                      <li>Save this major first (without degree plan)</li>
                      <li>Create subjects for this major (Subjects → Create Subject)</li>
                      <li>Return to this major's edit page to configure the degree plan</li>
                    </ol>
                    <p className="mt-3 font-medium">
                      <strong>Why?</strong> The degree plan requires subjects to exist first. You cannot add courses to course groups until subjects are created.
                    </p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowMajorSheetConfig(!showMajorSheetConfig)}
                className={`px-4 py-2 border rounded-lg text-sm font-medium whitespace-nowrap ${showMajorSheetConfig 
                  ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100' 
                  : 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100'
                }`}
              >
                {showMajorSheetConfig ? '⚠️ Hide (Configure Later)' : '⚙️ Show Config (Advanced)'}
              </button>
            </div>

            {showMajorSheetConfig && (
              <div className="space-y-6">
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                  <p className="text-sm font-medium text-yellow-800 mb-2">
                    ⚠️ Recommended: Configure Degree Plan Later
                  </p>
                  <p className="text-xs text-yellow-700">
                    It's better to configure the degree plan after creating subjects for this major. 
                    You can do this by editing the major after creation.
                  </p>
                </div>
                {/* Major Sheet Basic Info */}
                <div className="border-t pt-6">
                  <h4 className={`text-lg font-semibold text-gray-900 mb-4 ${isRTL ? 'text-right' : 'text-left'}`}>
                    Major Sheet Information
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                        Version * (e.g., "2024-2025" or "v2.1")
                      </label>
                      <input
                        type="text"
                        value={majorSheet.version}
                        onChange={(e) => handleMajorSheetChange('version', e.target.value)}
                        className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 ${isRTL ? 'text-right' : 'text-left'}`}
                        placeholder="2024-2025"
                        required={showMajorSheetConfig}
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                        Academic Year *
                      </label>
                      {academicYears.length > 0 ? (
                        <select
                          value={majorSheet.academic_year}
                          onChange={(e) => handleMajorSheetChange('academic_year', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                          required={showMajorSheetConfig}
                        >
                          <option value="">Select Academic Year...</option>
                          {academicYears.map(year => (
                            <option key={year.id} value={year.name_en || year.code}>
                              {getLocalizedName(year, isRTL) || year.code} ({new Date(year.start_date).getFullYear()}-{new Date(year.end_date).getFullYear()})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div>
                          <input
                            type="text"
                            value={majorSheet.academic_year}
                            onChange={(e) => handleMajorSheetChange('academic_year', e.target.value)}
                            className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 ${isRTL ? 'text-right' : 'text-left'}`}
                            placeholder="2024-2025"
                            required={showMajorSheetConfig}
                          />
                          <div className="text-xs text-yellow-600 mt-1 space-y-1">
                            {!formData.college_id && !collegeId && !isUniversityWide && userRole === 'admin' ? (
                              <p>
                                Please select a college first to see available academic years for that college.
                              </p>
                            ) : (
                              <>
                                <p>
                                  No academic years found for the selected college.
                                </p>
                                <p>
                                  Please create academic years for this college first, select a different college, or enter manually.
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                        Sheet Type *
                      </label>
                      <select
                        value={majorSheet.sheet_type}
                        onChange={(e) => handleMajorSheetChange('sheet_type', e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        required={showMajorSheetConfig}
                      >
                        <option value="rule_based">Rule-Based (Flexible - Choose N from M)</option>
                        <option value="fixed_by_year">Fixed-by-Year (No Student Choice)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        {majorSheet.sheet_type === 'rule_based' 
                          ? 'Students can choose courses based on rules (e.g., choose 3 from 10)'
                          : 'All courses are predefined by year/semester, no student choice'}
                      </p>
                    </div>
                    <div>
                      <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                        Effective From *
                      </label>
                      <input
                        type="date"
                        value={majorSheet.effective_from}
                        onChange={(e) => handleMajorSheetChange('effective_from', e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        required={showMajorSheetConfig}
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                        Effective To (Optional)
                      </label>
                      <input
                        type="date"
                        value={majorSheet.effective_to}
                        onChange={(e) => handleMajorSheetChange('effective_to', e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                        Total Credits Required *
                      </label>
                      <input
                        type="number"
                        value={majorSheet.total_credits_required}
                        onChange={(e) => handleMajorSheetChange('total_credits_required', e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        required={showMajorSheetConfig}
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                        Min Credits per Semester
                      </label>
                      <input
                        type="number"
                        value={majorSheet.min_credits_per_semester}
                        onChange={(e) => handleMajorSheetChange('min_credits_per_semester', e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                        Max Credits per Semester
                      </label>
                      <input
                        type="number"
                        value={majorSheet.max_credits_per_semester}
                        onChange={(e) => handleMajorSheetChange('max_credits_per_semester', e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                        Min GPA for Graduation
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={majorSheet.min_gpa_for_graduation}
                        onChange={(e) => handleMajorSheetChange('min_gpa_for_graduation', e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Course Groups */}
                <div className="border-t pt-6">
                  <h4 className={`text-lg font-semibold text-gray-900 mb-4 ${isRTL ? 'text-right' : 'text-left'}`}>
                    Course Groups Configuration
                  </h4>
                  <p className={`text-sm text-gray-600 mb-4 ${isRTL ? 'text-right' : 'text-left'}`}>
                    Configure the 5 course groups with their rules and courses. Each group defines what students must complete.
                  </p>

                  {courseGroups.map((group, groupIndex) => (
                    <div key={groupIndex} className="mb-6 border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center space-x-3">
                          <button
                            type="button"
                            onClick={() => toggleGroupExpanded(groupIndex)}
                            className="p-1 hover:bg-gray-100 rounded"
                          >
                            {expandedGroups[groupIndex] ? (
                              <ChevronUp className="w-5 h-5" />
                            ) : (
                              <ChevronDown className="w-5 h-5" />
                            )}
                          </button>
                          <div>
                            <h5 className="font-semibold text-gray-900">
                              Group {group.group_number}: {group.group_name_en}
                            </h5>
                            <p className="text-xs text-gray-500">
                              {group.group_type.replace('_', ' ').toUpperCase()}
                            </p>
                          </div>
                        </div>
                        <div className="text-sm text-gray-600">
                          {group.courses.length} course{group.courses.length !== 1 ? 's' : ''} added
                        </div>
                      </div>

                      {expandedGroups[groupIndex] && (
                        <div className="space-y-4 pl-8">
                          {/* Group Rules */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Group Name (English) *</label>
                              <input
                                type="text"
                                value={group.group_name_en}
                                onChange={(e) => handleCourseGroupChange(groupIndex, 'group_name_en', e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                required
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Group Name (Arabic)</label>
                              <input
                                type="text"
                                value={group.group_name_ar}
                                onChange={(e) => handleCourseGroupChange(groupIndex, 'group_name_ar', e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Rule Type *</label>
                              <select
                                value={group.rule_type}
                                onChange={(e) => {
                                  handleCourseGroupChange(groupIndex, 'rule_type', e.target.value)
                                  // Auto-update courses mandatory status
                                  if (e.target.value === 'all_required') {
                                    setCourseGroups(prev => {
                                      const updated = [...prev]
                                      updated[groupIndex].courses = updated[groupIndex].courses.map(c => ({
                                        ...c,
                                        is_mandatory: true
                                      }))
                                      return updated
                                    })
                                  }
                                }}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                required
                              >
                                <option value="all_required">All Required (Mandatory)</option>
                                <option value="choose_n_from_m">Choose N from M</option>
                                <option value="flexible">Flexible (Minimum Credits)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Min Credits Required *</label>
                              <input
                                type="number"
                                value={group.min_credits_required}
                                onChange={(e) => handleCourseGroupChange(groupIndex, 'min_credits_required', e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                required
                              />
                            </div>
                            {group.rule_type === 'choose_n_from_m' && (
                              <>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-2">Choose Count (N) *</label>
                                  <input
                                    type="number"
                                    value={group.choose_count || ''}
                                    onChange={(e) => handleCourseGroupChange(groupIndex, 'choose_count', e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                    placeholder="e.g., 3"
                                    required={group.rule_type === 'choose_n_from_m'}
                                  />
                                  <p className="text-xs text-gray-500 mt-1">Number of courses student must choose</p>
                                </div>
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-2">Total Options (M)</label>
                                  <input
                                    type="number"
                                    value={group.total_options || group.courses.length}
                                    onChange={(e) => handleCourseGroupChange(groupIndex, 'total_options', e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 bg-gray-50"
                                    placeholder="Auto-calculated from courses"
                                    readOnly
                                  />
                                  <p className="text-xs text-gray-500 mt-1">Total courses available (auto-updated when courses are added)</p>
                                </div>
                              </>
                            )}
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Max Credits Allowed</label>
                              <input
                                type="number"
                                value={group.max_credits_allowed || ''}
                                onChange={(e) => handleCourseGroupChange(groupIndex, 'max_credits_allowed', e.target.value || null)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                placeholder="Optional"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">Min GPA Required</label>
                              <input
                                type="number"
                                step="0.1"
                                value={group.min_gpa_required || ''}
                                onChange={(e) => handleCourseGroupChange(groupIndex, 'min_gpa_required', e.target.value || null)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                                placeholder="Optional"
                              />
                            </div>
                          </div>

                          <div className="flex items-center space-x-4">
                            <label className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                checked={group.allows_substitution}
                                onChange={(e) => handleCourseGroupChange(groupIndex, 'allows_substitution', e.target.checked)}
                                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              />
                              <span className="text-sm text-gray-700">Allows Substitution</span>
                            </label>
                            {group.allows_substitution && (
                              <label className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  checked={group.requires_approval_for_substitution}
                                  onChange={(e) => handleCourseGroupChange(groupIndex, 'requires_approval_for_substitution', e.target.checked)}
                                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-sm text-gray-700">Requires Approval for Substitution</span>
                              </label>
                            )}
                          </div>

                          {/* Add Course to Group */}
                          <div className="border-t pt-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Add Course to This Group</label>
                            <div className="flex space-x-2">
                              <select
                                value=""
                                onChange={(e) => {
                                  const selectedValue = e.target.value
                                  if (selectedValue && !addingCourseRef.current) {
                                    const subjectId = parseInt(selectedValue)
                                    addCourseToGroup(groupIndex, subjectId)
                                    // Reset select value immediately
                                    e.target.value = ''
                                  }
                                }}
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                              >
                                <option value="">Select a course...</option>
                                {subjects
                                  .filter(s => !group.courses.some(c => c.subject_id === s.id))
                                  .map(subject => (
                                    <option key={subject.id} value={subject.id}>
                                      {subject.code} - {getLocalizedName(subject, isRTL)} ({subject.credit_hours} {t('academic.majors.degreePlanSheet.credits', 'credits')})
                                    </option>
                                  ))}
                              </select>
                            </div>
                            {subjects.length === 0 && (
                              <div className="text-xs text-yellow-600 mt-2 space-y-1">
                                {!formData.college_id && !collegeId && !isUniversityWide && userRole === 'admin' ? (
                                  <p>
                                    Please select a college first to see available subjects for that college.
                                  </p>
                                ) : (
                                  <>
                                    <p>
                                      No subjects available for the selected college.
                                    </p>
                                    <p>
                                      Please create subjects for this college first, or select a different college.
                                    </p>
                                  </>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Courses in Group */}
                          {group.courses.length > 0 && (
                            <div className="border-t pt-4">
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                Courses in This Group ({group.courses.length})
                              </label>
                              <div className="space-y-2 max-h-60 overflow-y-auto">
                                {group.courses.map((course, courseIndex) => {
                                  const subject = subjects.find(s => s.id === course.subject_id)
                                  return (
                                    <div key={courseIndex} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                                      <div className="flex-1">
                                        <div className="font-medium text-sm">
                                          {subject ? `${subject.code} - ${getLocalizedName(subject, isRTL)}` : `${t('academic.subjects.subject', 'Subject')} ${course.subject_id}`}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          {subject ? `${subject.credit_hours} credits` : 'Subject not found'}
                                        </div>
                                        {majorSheet.sheet_type === 'fixed_by_year' && (
                                          <div className="grid grid-cols-2 gap-2 mt-2">
                                            <div>
                                              <label className="text-xs text-gray-600">Academic Year</label>
                                              <input
                                                type="number"
                                                min="1"
                                                max="10"
                                                value={course.academic_year || ''}
                                                onChange={(e) => updateCourseInGroup(groupIndex, courseIndex, 'academic_year', e.target.value)}
                                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                                                placeholder="Year 1-4"
                                              />
                                            </div>
                                            <div>
                                              <label className="text-xs text-gray-600">Semester</label>
                                              <select
                                                value={course.semester_number || ''}
                                                onChange={(e) => updateCourseInGroup(groupIndex, courseIndex, 'semester_number', e.target.value)}
                                                className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
                                              >
                                                <option value="">Select...</option>
                                                <option value="1">Semester 1</option>
                                                <option value="2">Semester 2</option>
                                                <option value="3">Summer</option>
                                              </select>
                                            </div>
                                          </div>
                                        )}
                                        {group.rule_type !== 'all_required' && (
                                          <label className="flex items-center space-x-2 mt-2">
                                            <input
                                              type="checkbox"
                                              checked={course.is_mandatory}
                                              onChange={(e) => updateCourseInGroup(groupIndex, courseIndex, 'is_mandatory', e.target.checked)}
                                              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                            />
                                            <span className="text-xs text-gray-700">Mandatory</span>
                                          </label>
                                        )}
                                        <label className="flex items-center space-x-2 mt-2">
                                          <input
                                            type="checkbox"
                                            checked={course.is_capstone || false}
                                            onChange={(e) => updateCourseInGroup(groupIndex, courseIndex, 'is_capstone', e.target.checked)}
                                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                          />
                                          <span className="text-xs text-gray-700">Capstone/Final Year Course</span>
                                        </label>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => removeCourseFromGroup(groupIndex, courseIndex)}
                                        className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                              {group.rule_type === 'choose_n_from_m' && (
                                <p className="text-xs text-blue-600 mt-2">
                                  Total options: {group.courses.length}. Students must choose {group.choose_count || 'N'} from these.
                                </p>
                              )}
                            </div>
                          )}

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                            <textarea
                              value={group.description}
                              onChange={(e) => handleCourseGroupChange(groupIndex, 'description', e.target.value)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                              rows="2"
                              placeholder="Optional description for this course group"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={`flex ${isRTL ? 'justify-start space-x-reverse' : 'justify-end space-x-4'}`}>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              {t('academic.majors.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-6 py-2 bg-primary-gradient text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Save className="w-5 h-5" />
              <span>{loading ? t('academic.majors.creating') : t('academic.majors.create')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


