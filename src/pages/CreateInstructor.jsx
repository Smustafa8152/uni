import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { createAuthUser } from '../lib/createAuthUser'
import { generateInstructorEmployeeId } from '../utils/collegeIdFormat'
import {
  ACADEMIC_TITLE_CUSTOM,
  getAcademicTitlePresetOptions,
  parseAcademicTitleFromStorage,
  resolveAcademicTitleForSave,
  formatNameWithAcademicTitle,
} from '../utils/academicTitle'
import { ArrowLeft, ArrowRight, Save, User, GraduationCap, Briefcase, Award, Globe, Plus, X, Lock } from 'lucide-react'

const ISO_COUNTRY_CODES = [
  'AF', 'AL', 'DZ', 'AD', 'AO', 'AG', 'AR', 'AM', 'AU', 'AT', 'AZ', 'BS', 'BH', 'BD', 'BB', 'BY', 'BE', 'BZ',
  'BJ', 'BT', 'BO', 'BA', 'BW', 'BR', 'BN', 'BG', 'BF', 'BI', 'CV', 'KH', 'CM', 'CA', 'CF', 'TD', 'CL', 'CN',
  'CO', 'KM', 'CG', 'CD', 'CR', 'CI', 'HR', 'CU', 'CY', 'CZ', 'DK', 'DJ', 'DM', 'DO', 'EC', 'EG', 'SV', 'GQ',
  'ER', 'EE', 'SZ', 'ET', 'FJ', 'FI', 'FR', 'GA', 'GM', 'GE', 'DE', 'GH', 'GR', 'GD', 'GT', 'GN', 'GW', 'GY',
  'HT', 'HN', 'HU', 'IS', 'IN', 'ID', 'IR', 'IQ', 'IE', 'IL', 'IT', 'JM', 'JP', 'JO', 'KZ', 'KE', 'KI', 'KP',
  'KR', 'KW', 'KG', 'LA', 'LV', 'LB', 'LS', 'LR', 'LY', 'LI', 'LT', 'LU', 'MG', 'MW', 'MY', 'MV', 'ML', 'MT',
  'MH', 'MR', 'MU', 'MX', 'FM', 'MD', 'MC', 'MN', 'ME', 'MA', 'MZ', 'MM', 'NA', 'NR', 'NP', 'NL', 'NZ', 'NI',
  'NE', 'NG', 'MK', 'NO', 'OM', 'PK', 'PW', 'PS', 'PA', 'PG', 'PY', 'PE', 'PH', 'PL', 'PT', 'QA', 'RO', 'RU',
  'RW', 'KN', 'LC', 'VC', 'WS', 'SM', 'ST', 'SA', 'SN', 'RS', 'SC', 'SL', 'SG', 'SK', 'SI', 'SB', 'SO', 'ZA',
  'SS', 'ES', 'LK', 'SD', 'SR', 'SE', 'CH', 'SY', 'TJ', 'TZ', 'TH', 'TL', 'TG', 'TO', 'TT', 'TN', 'TR', 'TM',
  'TV', 'UG', 'UA', 'AE', 'GB', 'US', 'UY', 'UZ', 'VU', 'VA', 'VE', 'VN', 'YE', 'ZM', 'ZW', 'TW'
]

function splitFullName(full) {
  if (!full || !String(full).trim()) return { first: '', middle: '', last: '' }
  const parts = String(full).trim().split(/\s+/)
  if (parts.length === 1) return { first: parts[0], middle: '', last: '' }
  if (parts.length === 2) return { first: parts[0], middle: '', last: parts[1] }
  return { first: parts[0], middle: parts.slice(1, -1).join(' '), last: parts[parts.length - 1] }
}

function parseJsonArray(val) {
  if (!val) return []
  if (Array.isArray(val)) return val
  if (typeof val === 'string') {
    try {
      const p = JSON.parse(val)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}

export default function CreateInstructor() {
  const { t, i18n } = useTranslation()
  const { isRTL } = useLanguage()
  const isArabicLayout = isRTL ||
    i18n?.language?.toLowerCase()?.startsWith('ar') ||
    (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { id: editInstructorId } = useParams()
  const isEditMode = Boolean(editInstructorId)
  const { userRole, collegeId: authCollegeId } = useAuth()
  const [loadingEdit, setLoadingEdit] = useState(false)

  const steps = [
    { id: 1, name: t('createInstructor.personalInfo'), icon: User },
    { id: 2, name: t('createInstructor.contactLocation'), icon: Globe },
    { id: 3, name: t('createInstructor.education'), icon: GraduationCap },
    { id: 4, name: t('createInstructor.experienceSkills'), icon: Briefcase },
    { id: 5, name: t('createInstructor.academicAssignment'), icon: Award },
    { id: 6, name: t('createInstructor.reviewSubmit'), icon: Save },
  ]
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [departments, setDepartments] = useState([])
  const [colleges, setColleges] = useState([])
  const [academicYears, setAcademicYears] = useState([])
  const [collegeId, setCollegeId] = useState(null)

  const localizedName = (item) => {
    if (!item) return ''
    return isArabicLayout
      ? (item.name_ar || item.name_en || '')
      : (item.name_en || item.name_ar || '')
  }

  const countryOptions = useMemo(() => {
    try {
      const locale = isArabicLayout ? 'ar' : 'en'
      const displayNames = new Intl.DisplayNames([locale], { type: 'region' })
      return ISO_COUNTRY_CODES
        .map((code) => {
          const label = displayNames.of(code)
          return { code, label: label || code }
        })
        .sort((a, b) => a.label.localeCompare(b.label, locale))
    } catch {
      return ISO_COUNTRY_CODES.map((code) => ({ code, label: code }))
    }
  }, [isArabicLayout])

  const [formData, setFormData] = useState({
    // Personal Information
    employee_id: '',
    academic_title_preset: '',
    academic_title_custom: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    first_name_ar: '',
    middle_name_ar: '',
    last_name_ar: '',
    date_of_birth: '',
    gender: '',
    nationality: '',
    national_id: '',
    passport_number: '',
    
    // Contact Information
    email: '',
    phone: '',
    address: '',
    city: '',
    country: '',
    postal_code: '',
    
    // Emergency Contact
    emergency_contact_name: '',
    emergency_contact_relation: '',
    emergency_contact_phone: '',
    emergency_contact_email: '',
    
    // Academic Assignment
    college_id: null,
    department_id: '',
    academic_year_id: '',
    title: 'lecturer',
    specialization: '',
    office_location: '',
    office_hours: '',
    hire_date: '',
    status: 'active',
    can_add_materials: false,
    
    // Education (JSONB array)
    education: [],
    
    // Work Experience (JSONB array)
    work_experience: [],
    
    // Publications (JSONB array)
    publications: [],
    
    // Certifications (JSONB array)
    certifications: [],
    
    // Languages (JSONB array)
    languages: [],
    
    // Additional
    research_interests: '',
    bio: '',
    bio_ar: '',
    photo: '',
    
    // Login Account (Optional)
    create_login_account: false,
    login_password: '',
  })

  useEffect(() => {
    fetchColleges()
    fetchAcademicYears()
    if (isEditMode) return

    const urlCollegeId = searchParams.get('collegeId')
    if (urlCollegeId && userRole === 'admin') {
      const collegeIdInt = parseInt(urlCollegeId)
      setCollegeId(collegeIdInt)
      setFormData(prev => ({ ...prev, college_id: collegeIdInt }))
    } else if (userRole === 'user' && authCollegeId) {
      setCollegeId(authCollegeId)
      setFormData(prev => ({ ...prev, college_id: authCollegeId }))
    } else {
      fetchUserCollege()
    }

    fetchDepartments()
  }, [userRole, authCollegeId, searchParams, isEditMode])

  useEffect(() => {
    if (!editInstructorId) return
    let cancelled = false
    ;(async () => {
      setLoadingEdit(true)
      setError('')
      try {
        const { data, error } = await supabase
          .from('instructors')
          .select('*')
          .eq('id', editInstructorId)
          .single()
        if (error) throw error
        if (cancelled || !data) return

        const en = splitFullName(data.name_en)
        const ar = splitFullName(data.name_ar || '')
        const academicTitleFields = parseAcademicTitleFromStorage(data.academic_title)
        setCollegeId(data.college_id)
        setFormData((prev) => ({
          ...prev,
          employee_id: data.employee_id || '',
          academic_title_preset: academicTitleFields.preset,
          academic_title_custom: academicTitleFields.custom,
          first_name: en.first,
          middle_name: en.middle,
          last_name: en.last,
          first_name_ar: ar.first,
          middle_name_ar: ar.middle,
          last_name_ar: ar.last,
          date_of_birth: data.date_of_birth ? String(data.date_of_birth).slice(0, 10) : '',
          gender: data.gender || '',
          nationality: data.nationality || '',
          national_id: data.national_id || '',
          passport_number: data.passport_number || '',
          email: data.email || '',
          phone: data.phone || '',
          address: data.address || '',
          city: data.city || '',
          country: data.country || '',
          postal_code: data.postal_code || '',
          emergency_contact_name: data.emergency_contact_name || '',
          emergency_contact_relation: data.emergency_contact_relation || '',
          emergency_contact_phone: data.emergency_contact_phone || '',
          emergency_contact_email: data.emergency_contact_email || '',
          college_id: data.college_id,
          department_id: data.department_id != null ? String(data.department_id) : '',
          academic_year_id: data.academic_year_id != null ? String(data.academic_year_id) : '',
          title: data.title || 'lecturer',
          specialization: data.specialization || '',
          office_location: data.office_location || '',
          office_hours: data.office_hours || '',
          hire_date: data.hire_date ? String(data.hire_date).slice(0, 10) : '',
          status: data.status || 'active',
          can_add_materials: !!data.can_add_materials,
          education: parseJsonArray(data.education),
          work_experience: parseJsonArray(data.work_experience),
          publications: parseJsonArray(data.publications),
          certifications: parseJsonArray(data.certifications),
          languages: parseJsonArray(data.languages),
          research_interests: data.research_interests || '',
          bio: data.bio || '',
          bio_ar: data.bio_ar || '',
          photo: data.photo || '',
          create_login_account: false,
          login_password: '',
        }))
      } catch (err) {
        console.error(err)
        setError(err.message || 'Failed to load instructor')
      } finally {
        if (!cancelled) setLoadingEdit(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editInstructorId])

  useEffect(() => {
    // Refetch departments when college changes
    if (formData.college_id || collegeId) {
      fetchDepartments()
    }
  }, [formData.college_id, collegeId])

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
      let query = supabase
        .from('colleges')
        .select('id, name_en, name_ar, code')
        .eq('status', 'active')
        .order('name_en')

      // For college admins, only fetch their college
      if (userRole === 'user' && authCollegeId) {
        query = query.eq('id', authCollegeId)
      }

      const { data, error } = await query
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
        .select('id, name_en, name_ar, code, college_id, is_university_wide')
        .order('name_en', { ascending: true })

      // For college admins (user role), filter by their college or university-wide
      if (userRole === 'user' && authCollegeId) {
        query = query.or(`college_id.eq.${authCollegeId},is_university_wide.eq.true`)
      }
      // For super admins, filter by selected college if available
      else if (userRole === 'admin' && collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      }
      // If no college filter, show all (only for super admin)

      const { data, error } = await query
      if (error) throw error
      setDepartments(data || [])
    } catch (err) {
      console.error('Error fetching departments:', err)
    }
  }

  const fetchAcademicYears = async () => {
    try {
      let query = supabase
        .from('academic_years')
        .select('id, name_en, name_ar, code, start_date, end_date')
        .order('start_date', { ascending: false })

      // For college admins (user role), filter by their college or university-wide
      if (userRole === 'user' && authCollegeId) {
        query = query.or(`college_id.eq.${authCollegeId},is_university_wide.eq.true`)
      }
      // For super admins, filter by selected college if available
      else if (userRole === 'admin' && collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      }
      // If no college filter, show all (only for super admin)

      const { data, error } = await query
      if (error) throw error
      setAcademicYears(data || [])
    } catch (err) {
      console.error('Error fetching academic years:', err)
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const addEducation = () => {
    setFormData(prev => ({
      ...prev,
      education: [...prev.education, {
        degree: '',
        field: '',
        institution: '',
        country: '',
        graduation_year: '',
        gpa: '',
        honors: '',
      }]
    }))
  }

  const removeEducation = (index) => {
    setFormData(prev => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index)
    }))
  }

  const updateEducation = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      education: prev.education.map((edu, i) => 
        i === index ? { ...edu, [field]: value } : edu
      )
    }))
  }

  const addWorkExperience = () => {
    setFormData(prev => ({
      ...prev,
      work_experience: [...prev.work_experience, {
        position: '',
        organization: '',
        start_date: '',
        end_date: '',
        current: false,
        description: '',
      }]
    }))
  }

  const removeWorkExperience = (index) => {
    setFormData(prev => ({
      ...prev,
      work_experience: prev.work_experience.filter((_, i) => i !== index)
    }))
  }

  const updateWorkExperience = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      work_experience: prev.work_experience.map((exp, i) => 
        i === index ? { ...exp, [field]: value } : exp
      )
    }))
  }

  const addLanguage = () => {
    setFormData(prev => ({
      ...prev,
      languages: [...prev.languages, { language: '', proficiency: '' }]
    }))
  }

  const removeLanguage = (index) => {
    setFormData(prev => ({
      ...prev,
      languages: prev.languages.filter((_, i) => i !== index)
    }))
  }

  const updateLanguage = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      languages: prev.languages.map((lang, i) => 
        i === index ? { ...lang, [field]: value } : lang
      )
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      const name_en = `${formData.first_name} ${formData.middle_name} ${formData.last_name}`.trim()
      const name_ar = `${formData.first_name_ar} ${formData.middle_name_ar} ${formData.last_name_ar}`.trim()

      const resolvedCollegeId = formData.college_id || collegeId
      let employeeId = formData.employee_id?.trim()
      if (!isEditMode && !employeeId && resolvedCollegeId) {
        employeeId = await generateInstructorEmployeeId(supabase, resolvedCollegeId)
      }
      if (!employeeId) {
        setLoading(false)
        setError(t('createInstructor.employeeIdRequired'))
        return
      }

      const submitData = {
        employee_id: employeeId,
        academic_title: resolveAcademicTitleForSave(formData.academic_title_preset, formData.academic_title_custom),
        name_en,
        name_ar: name_ar || name_en,
        email: formData.email,
        phone: formData.phone,
        department_id: formData.department_id ? parseInt(formData.department_id) : null,
        college_id: formData.college_id || collegeId,
        title: formData.title,
        specialization: formData.specialization || null,
        office_location: formData.office_location || null,
        office_hours: formData.office_hours || null,
        status: formData.status,
        hire_date: formData.hire_date || null,
        can_add_materials: formData.can_add_materials || false,
        date_of_birth: formData.date_of_birth || null,
        gender: formData.gender || null,
        nationality: formData.nationality || null,
        national_id: formData.national_id || null,
        passport_number: formData.passport_number || null,
        address: formData.address || null,
        city: formData.city || null,
        country: formData.country || null,
        postal_code: formData.postal_code || null,
        emergency_contact_name: formData.emergency_contact_name || null,
        emergency_contact_relation: formData.emergency_contact_relation || null,
        emergency_contact_phone: formData.emergency_contact_phone || null,
        emergency_contact_email: formData.emergency_contact_email || null,
        academic_year_id: formData.academic_year_id ? parseInt(formData.academic_year_id) : null,
        education: formData.education.length > 0 ? formData.education : null,
        work_experience: formData.work_experience.length > 0 ? formData.work_experience : null,
        publications: formData.publications.length > 0 ? formData.publications : null,
        certifications: formData.certifications.length > 0 ? formData.certifications : null,
        languages: formData.languages.length > 0 ? formData.languages : null,
        research_interests: formData.research_interests || null,
        bio: formData.bio || null,
        bio_ar: formData.bio_ar || null,
        photo: formData.photo || null,
      }

      if (isEditMode) {
        const { error: updateError } = await supabase
          .from('instructors')
          .update(submitData)
          .eq('id', editInstructorId)
        if (updateError) throw updateError
        setSuccess(true)
        setTimeout(() => {
          navigate('/instructors')
        }, 2000)
        return
      }

      const { data, error: insertError } = await supabase
        .from('instructors')
        .insert(submitData)
        .select()
        .single()

      if (insertError) throw insertError

      // Create login account if requested
      if (formData.create_login_account && formData.login_password) {
        try {
          const instructorName = `${formData.first_name} ${formData.middle_name} ${formData.last_name}`.trim()
          
          const { data: functionResult, error: functionError } = await createAuthUser({
            email: formData.email,
            password: formData.login_password,
            role: 'instructor',
            college_id: data.college_id,
            name: instructorName,
          })

          if (functionError) {
            console.warn('Failed to create auth account:', functionError.message)
            // Continue anyway - instructor is created, just no login account
          } else if (functionResult?.success) {
            console.log('✅ Instructor login account created successfully')
          } else {
            console.warn('Failed to create auth account:', functionResult?.error)
          }
        } catch (authError) {
          console.error('Error creating auth account:', authError)
          // Continue anyway - instructor is created, just no login account
        }
      }

      setSuccess(true)
      setTimeout(() => {
        navigate('/instructors')
      }, 2000)
    } catch (err) {
      setError(err.message || t('createInstructor.createdSuccess'))
      console.error('Error creating instructor:', err)
    } finally {
      setLoading(false)
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">{t('createInstructor.personalInformation')}</h2>
            
            {userRole === 'admin' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.college')} *</label>
                <select
                  value={formData.college_id || ''}
                  onChange={(e) => {
                    const collegeIdValue = e.target.value ? parseInt(e.target.value) : null
                    setCollegeId(collegeIdValue)
                    handleChange('college_id', collegeIdValue)
                    // Clear department selection when college changes
                    handleChange('department_id', '')
                  }}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">{t('createInstructor.selectCollege')}</option>
                  {colleges.map(college => (
                    <option key={college.id} value={college.id}>
                      {localizedName(college)} ({college.code})
                    </option>
                  ))}
                </select>
                {colleges.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">{t('createInstructor.loadingColleges')}</p>
                )}
              </div>
            )}

            {userRole === 'user' && authCollegeId && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>{t('createInstructor.college')}:</strong> {localizedName(colleges.find(c => c.id === authCollegeId)) || t('createInstructor.yourCollege')}
                </p>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.employeeId')}</label>
                <input
                  type="text"
                  value={formData.employee_id}
                  onChange={(e) => handleChange('employee_id', e.target.value)}
                  readOnly={isEditMode}
                  className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isEditMode ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                  placeholder={t('createInstructor.employeeIdPlaceholder')}
                />
                <p className="text-xs text-gray-500 mt-1">{t('createInstructor.employeeIdGenerateHint')}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.dateOfBirth')}</label>
                <input
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => handleChange('date_of_birth', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('createInstructor.academicTitlePrefix', 'Academic title prefix')}
                </label>
                <select
                  value={formData.academic_title_preset}
                  onChange={(e) => handleChange('academic_title_preset', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {getAcademicTitlePresetOptions(isArabicLayout).map((opt) => (
                    <option key={opt.value || 'none'} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {t('createInstructor.academicTitleHint', 'Shown before the name (e.g. Dr. John Smith).')}
                </p>
              </div>
              {formData.academic_title_preset === ACADEMIC_TITLE_CUSTOM && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('createInstructor.academicTitleCustom', 'Custom title')}
                  </label>
                  <input
                    type="text"
                    value={formData.academic_title_custom}
                    onChange={(e) => handleChange('academic_title_custom', e.target.value)}
                    placeholder={t('createInstructor.academicTitleCustomPlaceholder', 'e.g. Assoc. Prof.')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.firstNameEn')} *</label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => handleChange('first_name', e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.middleName')}</label>
                <input
                  type="text"
                  value={formData.middle_name}
                  onChange={(e) => handleChange('middle_name', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.lastNameEn')} *</label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => handleChange('last_name', e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.firstNameAr')}</label>
                <input
                  type="text"
                  value={formData.first_name_ar}
                  onChange={(e) => handleChange('first_name_ar', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.middleNameAr')}</label>
                <input
                  type="text"
                  value={formData.middle_name_ar}
                  onChange={(e) => handleChange('middle_name_ar', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.lastNameAr')}</label>
                <input
                  type="text"
                  value={formData.last_name_ar}
                  onChange={(e) => handleChange('last_name_ar', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.gender')}</label>
                <select
                  value={formData.gender}
                  onChange={(e) => handleChange('gender', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">{t('createInstructor.selectGender')}</option>
                  <option value="male">{t('createInstructor.male')}</option>
                  <option value="female">{t('createInstructor.female')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.nationality')}</label>
                <select
                  value={formData.nationality}
                  onChange={(e) => handleChange('nationality', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">{isArabicLayout ? 'اختر الجنسية...' : 'Select nationality...'}</option>
                  {countryOptions.map((country) => (
                    <option key={country.code} value={country.label}>
                      {country.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.nationalId')}</label>
                <input
                  type="text"
                  value={formData.national_id}
                  onChange={(e) => handleChange('national_id', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.passportNumber')}</label>
              <input
                type="text"
                value={formData.passport_number}
                onChange={(e) => handleChange('passport_number', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
        )

      case 2:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">{t('createInstructor.contactLocation')}</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.email')} *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.phone')} *</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.address')}</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.city')}</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.country')}</label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => handleChange('country', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.postalCode')}</label>
                <input
                  type="text"
                  value={formData.postal_code}
                  onChange={(e) => handleChange('postal_code', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('createInstructor.emergencyContact')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.contactName')}</label>
                  <input
                    type="text"
                    value={formData.emergency_contact_name}
                    onChange={(e) => handleChange('emergency_contact_name', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.relation')}</label>
                  <input
                    type="text"
                    value={formData.emergency_contact_relation}
                    onChange={(e) => handleChange('emergency_contact_relation', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.emergencyPhone')}</label>
                  <input
                    type="tel"
                    value={formData.emergency_contact_phone}
                    onChange={(e) => handleChange('emergency_contact_phone', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.emergencyEmail')}</label>
                  <input
                    type="email"
                    value={formData.emergency_contact_email}
                    onChange={(e) => handleChange('emergency_contact_email', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        )

      case 3:
        return (
          <div className="space-y-6">
            <div className={`flex items-center justify-between ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
              <h2 className="text-2xl font-bold text-gray-900">{t('createInstructor.education')}</h2>
              <button
                type="button"
                onClick={addEducation}
                className={`flex items-center ${isArabicLayout ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-4 py-2 bg-primary-gradient text-white rounded-lg hover:shadow-lg transition-all`}
              >
                <Plus className="w-4 h-4" />
                <span>{t('createInstructor.addEducation')}</span>
              </button>
            </div>

            {formData.education.length === 0 ? (
              <p className="text-gray-500 text-center py-8">{t('createInstructor.noEducationRecords')}</p>
            ) : (
              <div className="space-y-4">
                {formData.education.map((edu, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className={`flex items-center justify-between mb-4 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
                      <h4 className="font-semibold text-gray-900">{t('createInstructor.educationNumber')} {index + 1}</h4>
                      <button
                        type="button"
                        onClick={() => removeEducation(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.degree')} *</label>
                        <input
                          type="text"
                          value={edu.degree}
                          onChange={(e) => updateEducation(index, 'degree', e.target.value)}
                          required
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          placeholder={t('createInstructor.degreePlaceholder')}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.fieldOfStudy')}</label>
                        <input
                          type="text"
                          value={edu.field}
                          onChange={(e) => updateEducation(index, 'field', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          placeholder={t('createInstructor.fieldPlaceholder')}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.institution')} *</label>
                        <input
                          type="text"
                          value={edu.institution}
                          onChange={(e) => updateEducation(index, 'institution', e.target.value)}
                          required
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.country')}</label>
                        <input
                          type="text"
                          value={edu.country}
                          onChange={(e) => updateEducation(index, 'country', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.graduationYear')}</label>
                        <input
                          type="number"
                          value={edu.graduation_year}
                          onChange={(e) => updateEducation(index, 'graduation_year', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          placeholder={t('createInstructor.graduationYearPlaceholder')}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.gpa')}</label>
                        <input
                          type="text"
                          value={edu.gpa}
                          onChange={(e) => updateEducation(index, 'gpa', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          placeholder={t('createInstructor.gpaPlaceholder')}
                        />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.honorsAwards')}</label>
                        <input
                          type="text"
                          value={edu.honors}
                          onChange={(e) => updateEducation(index, 'honors', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          placeholder={t('createInstructor.honorsPlaceholder')}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )

      case 4:
        return (
          <div className="space-y-6">
            <div className={`flex items-center justify-between ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
              <h2 className="text-2xl font-bold text-gray-900">{t('createInstructor.workExperience')}</h2>
              <button
                type="button"
                onClick={addWorkExperience}
                className={`flex items-center ${isArabicLayout ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-4 py-2 bg-primary-gradient text-white rounded-lg hover:shadow-lg transition-all`}
              >
                <Plus className="w-4 h-4" />
                <span>{t('createInstructor.addExperience')}</span>
              </button>
            </div>

            {formData.work_experience.length === 0 ? (
              <p className="text-gray-500 text-center py-8">{t('createInstructor.noExperienceRecords')}</p>
            ) : (
              <div className="space-y-4">
                {formData.work_experience.map((exp, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className={`flex items-center justify-between mb-4 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
                      <h4 className="font-semibold text-gray-900">{t('createInstructor.experienceNumber')} {index + 1}</h4>
                      <button
                        type="button"
                        onClick={() => removeWorkExperience(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.position')} *</label>
                        <input
                          type="text"
                          value={exp.position}
                          onChange={(e) => updateWorkExperience(index, 'position', e.target.value)}
                          required
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.organization')} *</label>
                        <input
                          type="text"
                          value={exp.organization}
                          onChange={(e) => updateWorkExperience(index, 'organization', e.target.value)}
                          required
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.startDate')}</label>
                        <input
                          type="date"
                          value={exp.start_date}
                          onChange={(e) => updateWorkExperience(index, 'start_date', e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.endDate')}</label>
                        <input
                          type="date"
                          value={exp.end_date}
                          onChange={(e) => updateWorkExperience(index, 'end_date', e.target.value)}
                          disabled={exp.current}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100"
                        />
                      </div>
                      <div className={`flex items-center ${isArabicLayout ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                        <input
                          type="checkbox"
                          checked={exp.current}
                          onChange={(e) => updateWorkExperience(index, 'current', e.target.checked)}
                          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <label className="text-sm font-medium text-gray-700">{t('createInstructor.currentPosition')}</label>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.description')}</label>
                        <textarea
                          value={exp.description}
                          onChange={(e) => updateWorkExperience(index, 'description', e.target.value)}
                          rows={3}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('createInstructor.languages')}</h3>
              <div className={`flex items-center justify-between mb-4 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
                <span className="text-sm text-gray-600">{t('createInstructor.addLanguagesSpoken')}</span>
                <button
                  type="button"
                  onClick={addLanguage}
                  className={`flex items-center ${isArabicLayout ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all`}
                >
                  <Plus className="w-4 h-4" />
                  <span>{t('createInstructor.addLanguage')}</span>
                </button>
              </div>
              {formData.languages.length > 0 && (
                <div className="space-y-2">
                  {formData.languages.map((lang, index) => (
                    <div key={index} className={`flex items-center ${isArabicLayout ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                      <input
                        type="text"
                        value={lang.language}
                        onChange={(e) => updateLanguage(index, 'language', e.target.value)}
                        placeholder={t('createInstructor.language')}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                      <select
                        value={lang.proficiency}
                        onChange={(e) => updateLanguage(index, 'proficiency', e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        <option value="">{t('createInstructor.selectProficiency')}</option>
                        <option value="native">{t('createInstructor.native')}</option>
                        <option value="fluent">{t('createInstructor.fluent')}</option>
                        <option value="advanced">{t('createInstructor.advanced')}</option>
                        <option value="intermediate">{t('createInstructor.intermediate')}</option>
                        <option value="basic">{t('createInstructor.basic')}</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => removeLanguage(index)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('createInstructor.researchInterests')}</h3>
              <textarea
                value={formData.research_interests}
                onChange={(e) => handleChange('research_interests', e.target.value)}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder={t('createInstructor.researchInterestsPlaceholder')}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.bioEn')}</label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => handleChange('bio', e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder={t('createInstructor.bioPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.bioAr')}</label>
                <textarea
                  value={formData.bio_ar}
                  onChange={(e) => handleChange('bio_ar', e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder={t('createInstructor.bioArPlaceholder')}
                />
              </div>
            </div>
          </div>
        )

      case 5:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">{t('createInstructor.academicAssignment')}</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {userRole === 'admin' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.college')} *</label>
                  <select
                    value={formData.college_id || ''}
                    onChange={(e) => {
                      const collegeIdValue = e.target.value ? parseInt(e.target.value) : null
                      setCollegeId(collegeIdValue)
                      handleChange('college_id', collegeIdValue)
                      // Clear department selection when college changes
                      handleChange('department_id', '')
                    }}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">{t('createInstructor.selectCollege')}</option>
                    {colleges.map(college => (
                      <option key={college.id} value={college.id}>
                        {localizedName(college)} ({college.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {userRole === 'user' && authCollegeId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.college')}</label>
                  <div className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-700">
                    {localizedName(colleges.find(c => c.id === authCollegeId)) || t('createInstructor.yourCollege')}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.department')}</label>
                <select
                  value={formData.department_id}
                  onChange={(e) => handleChange('department_id', e.target.value)}
                  disabled={!formData.college_id && !authCollegeId}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">{t('createInstructor.selectDepartment')}</option>
                  {departments
                    .filter(dept => {
                      const targetCollegeId = formData.college_id || authCollegeId
                      return !targetCollegeId || dept.college_id === targetCollegeId || dept.is_university_wide
                    })
                    .map(dept => (
                      <option key={dept.id} value={dept.id}>{localizedName(dept)} ({dept.code})</option>
                    ))}
                </select>
                {(!formData.college_id && !authCollegeId) && userRole === 'admin' && (
                  <p className="text-xs text-gray-500 mt-1">{t('createInstructor.selectCollegeFirst')}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.academicYear')}</label>
                <select
                  value={formData.academic_year_id}
                  onChange={(e) => handleChange('academic_year_id', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">{t('createInstructor.selectAcademicYear')}</option>
                  {academicYears.map(year => (
                    <option key={year.id} value={year.id}>{localizedName(year)} ({year.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.titleLabel')} *</label>
                <select
                  value={formData.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="professor">{t('createInstructor.professor')}</option>
                  <option value="associate_professor">{t('createInstructor.associateProfessor')}</option>
                  <option value="assistant_professor">{t('createInstructor.assistantProfessor')}</option>
                  <option value="lecturer">{t('createInstructor.lecturer')}</option>
                  <option value="teaching_assistant">{t('createInstructor.teachingAssistant')}</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="can_add_materials"
                checked={formData.can_add_materials || false}
                onChange={(e) => handleChange('can_add_materials', e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <label htmlFor="can_add_materials" className="text-sm font-medium text-gray-700">
                {t('createInstructor.canAddMaterials') || 'Allow instructor to add materials for their classes'}
              </label>
            </div>
            <p className="text-xs text-gray-500 -mt-2">
              {t('createInstructor.canAddMaterialsDesc') || 'When assigned to a class, this instructor can add class-specific materials for students.'}
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.specialization')}</label>
              <input
                type="text"
                value={formData.specialization}
                onChange={(e) => handleChange('specialization', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder={t('createInstructor.specializationPlaceholder')}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.officeLocation')}</label>
                <input
                  type="text"
                  value={formData.office_location}
                  onChange={(e) => handleChange('office_location', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder={t('createInstructor.officeLocationPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.officeHours')}</label>
                <input
                  type="text"
                  value={formData.office_hours}
                  onChange={(e) => handleChange('office_hours', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder={t('createInstructor.officeHoursPlaceholder')}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.hireDate')}</label>
                <input
                  type="date"
                  value={formData.hire_date}
                  onChange={(e) => handleChange('hire_date', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('createInstructor.status')} *</label>
                <select
                  value={formData.status}
                  onChange={(e) => handleChange('status', e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="active">{t('createInstructor.active')}</option>
                  <option value="inactive">{t('createInstructor.inactive')}</option>
                  <option value="on_leave">{t('createInstructor.onLeave')}</option>
                  <option value="retired">{t('createInstructor.retired')}</option>
                </select>
              </div>
            </div>

            {/* Authentication Section (create only) */}
            {!isEditMode && (
            <div className="mt-8 pt-8 border-t border-gray-200">
              <h3 className={`text-lg font-semibold text-gray-900 mb-4 flex items-center ${isArabicLayout ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                <Lock className="w-5 h-5" />
                <span>{t('createInstructor.authentication')}</span>
              </h3>
              <div className="space-y-4">
                <div className={`flex items-center ${isArabicLayout ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                  <input
                    type="checkbox"
                    id="create_login_account"
                    checked={formData.create_login_account}
                    onChange={(e) => handleChange('create_login_account', e.target.checked)}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label htmlFor="create_login_account" className="text-sm font-medium text-gray-700">
                    {t('createInstructor.createLoginAccount')}
                  </label>
                </div>
                {formData.create_login_account && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('createInstructor.password')} *
                    </label>
                    <input
                      type="password"
                      value={formData.login_password}
                      onChange={(e) => handleChange('login_password', e.target.value)}
                      placeholder={t('createInstructor.passwordPlaceholder')}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      required={formData.create_login_account}
                      minLength={6}
                    />
                    <p className="text-xs text-gray-500 mt-1">{t('createInstructor.passwordHint')}</p>
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        )

      case 6:
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">{t('createInstructor.reviewTitle')}</h2>
            <div className="bg-gray-50 rounded-lg p-6 space-y-4">
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">{t('createInstructor.personalInformation')}</h3>
                <p className="text-sm text-gray-600">
                  {formatNameWithAcademicTitle(
                    `${formData.first_name} ${formData.middle_name} ${formData.last_name}`.trim(),
                    resolveAcademicTitleForSave(formData.academic_title_preset, formData.academic_title_custom),
                    isArabicLayout,
                  )}
                </p>
                <p className="text-sm text-gray-600">
                  {t('createInstructor.employeeId')}: {formData.employee_id?.trim() || t('createInstructor.employeeIdReviewPending')}
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">{t('createInstructor.contact')}</h3>
                <p className="text-sm text-gray-600">{t('createInstructor.email')}: {formData.email}</p>
                <p className="text-sm text-gray-600">{t('createInstructor.phone')}: {formData.phone}</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">{t('createInstructor.academicAssignment')}</h3>
                <p className="text-sm text-gray-600">
                  {t('createInstructor.college')}: {localizedName(colleges.find(c => c.id === formData.college_id)) || t('createInstructor.notSelected')}
                </p>
                <p className="text-sm text-gray-600">
                  {t('createInstructor.department')}: {localizedName(departments.find(d => d.id === parseInt(formData.department_id))) || t('createInstructor.notSelected')}
                </p>
                <p className="text-sm text-gray-600">{t('createInstructor.titleLabel')}: {formData.title}</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">{t('createInstructor.educationRecords')}</h3>
                <p className="text-sm text-gray-600">{formData.education.length} {t('createInstructor.recordsAdded')}</p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">{t('createInstructor.workExperienceRecords')}</h3>
                <p className="text-sm text-gray-600">{formData.work_experience.length} {t('createInstructor.recordsAdded')}</p>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const displayedSteps = steps
  const PreviousIcon = isArabicLayout ? ArrowRight : ArrowLeft
  const NextIcon = isArabicLayout ? ArrowLeft : ArrowRight

  if (isEditMode && loadingEdit) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-gray-600 hover:text-gray-900 mb-4`}
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{t('createInstructor.back')}</span>
          </button>
          <h1 className="text-3xl font-extrabold text-[#1a3a6b]">
            {isEditMode ? t('createInstructor.editModeTitle') : t('createInstructor.title')}
          </h1>
          <p className="text-gray-600 mt-1">
            {isEditMode ? t('createInstructor.editModeSubtitle') : t('createInstructor.subtitle')}
          </p>
        </div>

        {/* Progress Steps */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
          <div className="flex items-center justify-between">
            {displayedSteps.map((step, index) => {
              const StepIcon = step.icon
              const isActive = currentStep === step.id
              const isCompleted = currentStep > step.id
              
              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div className="flex flex-col items-center flex-1">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                        isActive
                          ? 'bg-[#2a5298]/15 text-[#1a3a6b] shadow-sm ring-2 ring-[#2a5298]'
                          : isCompleted
                          ? 'bg-[#2a5298] text-white'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      <StepIcon className="w-6 h-6" />
                    </div>
                    <span className={`mt-2 text-xs font-semibold ${isActive ? 'text-[#2a5298]' : 'text-gray-500'}`}>
                      {step.name}
                    </span>
                  </div>
                  {index < displayedSteps.length - 1 && (
                    <div className={`flex-1 h-1 mx-2 ${isCompleted ? 'bg-[#2a5298]' : 'bg-gray-200'}`} />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 mb-6">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                {error}
              </div>
            )}
            {success && (
              <div className={`mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                <span>{isEditMode ? t('createInstructor.updatedSuccess') : t('createInstructor.createdSuccess')}</span>
              </div>
            )}

            {renderStepContent()}
          </div>

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
              disabled={currentStep === 1}
              className={`flex items-center ${isArabicLayout ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <PreviousIcon className="w-5 h-5" />
              <span>{t('createInstructor.previous')}</span>
            </button>
            
            {currentStep < steps.length ? (
              <button
                type="button"
                onClick={() => setCurrentStep(prev => Math.min(steps.length, prev + 1))}
                className={`flex items-center ${isArabicLayout ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-6 py-2 bg-[#2a5298] text-white rounded-lg font-semibold hover:bg-[#1a3a6b] hover:shadow-lg transition-colors`}
              >
                <span>{t('createInstructor.next')}</span>
                <NextIcon className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-6 py-2 bg-[#c8a84b] text-[#1a3a6b] rounded-lg font-semibold hover:bg-[#b8942e] hover:shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Save className="w-5 h-5" />
                <span>
                  {loading
                    ? isEditMode
                      ? t('createInstructor.updating')
                      : t('createInstructor.creating')
                    : isEditMode
                      ? t('createInstructor.updateButton')
                      : t('createInstructor.createButton')}
                </span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
