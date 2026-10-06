import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { legacyMajorRecordStatus } from '../../utils/majorAdmissionStatus'
import { useAuth } from '../../contexts/AuthContext'
import { ArrowLeft, Save, Check } from 'lucide-react'

export default function EditMajor() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const { id } = useParams()
  const navigate = useNavigate()
  const { userRole, collegeId: authCollegeId } = useAuth()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [collegeId, setCollegeId] = useState(authCollegeId)
  const [colleges, setColleges] = useState([])
  const [departments, setDepartments] = useState([])
  const [instructors, setInstructors] = useState([])
  const [isUniversityWide, setIsUniversityWide] = useState(false)

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
    major_status: 'active',
    max_study_duration_years: '',
    min_gpa_override: '',
    enable_substitution_workflow: false,
    enable_prerequisite_override: false,
    enforce_graduation_threshold: false,
  })

  useEffect(() => {
    fetchMajor()
    if (userRole === 'admin') {
      fetchColleges()
    }
    fetchDepartments()
    fetchInstructors()
  }, [id, userRole])

  useEffect(() => {
    if (collegeId || isUniversityWide) {
      fetchInstructors()
      fetchDepartments()
    }
  }, [collegeId, isUniversityWide])

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

  const fetchMajor = async () => {
    try {
      const { data, error } = await supabase
        .from('majors')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      const validationRules = data.validation_rules || {}

      setFormData({
        faculty_id: data.faculty_id || '',
        department_id: data.department_id || '',
        code: data.code || '',
        name_en: data.name_en || '',
        name_ar: data.name_ar || '',
        degree_level: data.degree_level || 'bachelor',
        degree_title_en: data.degree_title_en || '',
        degree_title_ar: data.degree_title_ar || '',
        total_credits: data.total_credits || 120,
        core_credits: data.core_credits || 90,
        elective_credits: data.elective_credits || 30,
        min_semesters: data.min_semesters || 8,
        max_semesters: data.max_semesters || 12,
        min_gpa: data.min_gpa || 2.0,
        tuition_fee: data.tuition_fee || '',
        lab_fee: data.lab_fee || '',
        registration_fee: data.registration_fee || '',
        accreditation_date: data.accreditation_date || '',
        accreditation_expiry: data.accreditation_expiry || '',
        accrediting_body: data.accrediting_body || '',
        head_of_major_id: data.head_of_major_id || '',
        head_of_major: data.head_of_major || '',
        head_email: data.head_email || '',
        head_phone: data.head_phone || '',
        description: data.description || '',
        description_ar: data.description_ar || '',
        status: data.status || 'active',
        college_id: data.college_id,
        is_university_wide: data.is_university_wide || false,
        // Validation Rules
        validation_toefl_min: validationRules.toefl_min || '',
        validation_ielts_min: validationRules.ielts_min || '',
        validation_gpa_min: validationRules.gpa_min || '',
        validation_graduation_year_min: validationRules.graduation_year_min || '',
        validation_certificate_types: Array.isArray(validationRules.certificate_types_allowed) ? validationRules.certificate_types_allowed : (validationRules.certificate_types_allowed ? [validationRules.certificate_types_allowed] : []),
        validation_requires_interview: validationRules.requires_interview || false,
        validation_requires_entrance_exam: validationRules.requires_entrance_exam || false,
        major_status: data.major_status || (data.status === 'active' ? 'active' : 'draft'),
        max_study_duration_years: data.max_study_duration_years || '',
        min_gpa_override: data.min_gpa_override || '',
        enable_substitution_workflow: data.enable_substitution_workflow || false,
        enable_prerequisite_override: data.enable_prerequisite_override || false,
        enforce_graduation_threshold: data.enforce_graduation_threshold || false,
      })
      setCollegeId(data.college_id || authCollegeId)
      setIsUniversityWide(data.is_university_wide || false)
    } catch (err) {
      console.error('Error fetching major:', err)
      setError(err.message || 'Failed to load major')
    } finally {
      setFetching(false)
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (error) setError('')
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

      const { error: updateError } = await supabase
        .from('majors')
        .update(submitData)
        .eq('id', id)

      if (updateError) throw updateError

      setSuccess(true)
      setTimeout(() => {
        navigate('/academic/majors')
      }, 2000)
    } catch (err) {
      setError(err.message || 'Failed to update major')
      console.error('Error updating major:', err)
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
            onClick={() => navigate(-1)}
            className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-gray-600 hover:text-gray-900 mb-4`}
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{t('academic.majors.back')}</span>
          </button>
          <h1 className={`text-3xl font-bold text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.edit') || 'Edit Major'}</h1>
          <p className={`text-gray-600 mt-1 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.createSubtitle') || 'Update major information'}</p>
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
                <span>{t('academic.majors.updatedSuccess')}</span>
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
                      handleChange('college_id', e.target.value ? parseInt(e.target.value) : null)
                      fetchDepartments()
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
                    <option value="suspended">{t('academic.majors.statusSuspended', 'Suspended')}</option>
                    <option value="phasing_out">{t('academic.majors.statusTeachOut', 'Teach-Out')}</option>
                    <option value="archived">{t('academic.majors.statusArchived', 'Archived')}</option>
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
                  checked={formData.major_status === 'active'}
                  onChange={(e) => handleChange('major_status', e.target.checked ? 'active' : 'draft')}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label className={`text-sm font-medium text-gray-700 ${isRTL ? 'text-right' : 'text-left'}`}>{t('academic.majors.active')}</label>
              </div>
            </div>
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
              <span>{loading ? t('academic.majors.updating') : t('academic.majors.update')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}



