import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCollege } from '../../contexts/CollegeContext'
import { getLocalizedName } from '../../utils/localizedName'
import { MAJOR_STATUS_FOR_APPLICATION_DROPDOWN } from '../../utils/majorAdmissionStatus'
import { normalizeNationalityCode } from '../../utils/nationalities'
import NationalitySelect from '../../components/common/NationalitySelect'
import { getPaymentsEnabled } from '../../utils/getPaymentsEnabled'
import { ArrowLeft, ArrowRight, Save, User, Phone, AlertCircle, GraduationCap, FileText, BookOpen, Building2 } from 'lucide-react'
import { resolveEffectiveCollegeId, hasUniversityWideScope } from '../../utils/menuPermissions'

export default function CreateApplication() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabicLayout =
    isRTL ||
    language === 'ar' ||
    (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl')

  const steps = useMemo(
    () => [
      { id: 1, name: t('admissions.steps.personal'), icon: User },
      { id: 2, name: t('admissions.steps.contact'), icon: Phone },
      { id: 3, name: t('admissions.steps.emergency'), icon: AlertCircle },
      { id: 4, name: t('admissions.steps.academic'), icon: GraduationCap },
      { id: 5, name: t('admissions.steps.tests'), icon: FileText },
      { id: 6, name: t('admissions.steps.transfer'), icon: BookOpen },
      { id: 7, name: t('admissions.steps.additional'), icon: FileText },
    ],
    [t]
  )
  const navigate = useNavigate()
  const { userRole, collegeId: authCollegeId } = useAuth()
  const { selectedCollegeId, requiresCollegeSelection, colleges, setSelectedCollegeId, loading: collegesLoading } = useCollege()
  const collegeId = resolveEffectiveCollegeId(userRole, authCollegeId, selectedCollegeId)
  const universityWide = hasUniversityWideScope(userRole, authCollegeId)
  const [paymentsEnabled, setPaymentsEnabled] = useState(true)
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [majors, setMajors] = useState([])
  const [semesters, setSemesters] = useState([])

  const [formData, setFormData] = useState({
    // Personal Information
    first_name: '',
    middle_name: '',
    last_name: '',
    first_name_ar: '',
    middle_name_ar: '',
    last_name_ar: '',
    email: '',
    phone: '',
    date_of_birth: '',
    gender: '',
    nationality: '',
    religion: '',
    place_of_birth: '',
    
    // Contact Information
    street_address: '',
    city: '',
    state_province: '',
    postal_code: '',
    country: '',
    
    // Emergency Contact
    emergency_contact_name: '',
    emergency_contact_relationship: '',
    emergency_contact_phone: '',
    emergency_contact_email: '',
    
    // Academic Information
    major_id: '',
    semester_id: '',
    high_school_name: '',
    high_school_country: '',
    graduation_year: '',
    gpa: '',
    certificate_type: '',
    
    // Test Scores
    toefl_score: '',
    ielts_score: '',
    sat_score: '',
    gmat_score: '',
    gre_score: '',
    
    // Transfer Information
    is_transfer_student: false,
    previous_university: '',
    previous_degree: '',
    transfer_credits: '',
    
    // Additional Information
    personal_statement: '',
    scholarship_request: false,
    scholarship_percentage: '',
    
    // Application Status
    status_code: 'APDR', // Application Draft by default
    submit_as_draft: false, // If true, stays as APDR, otherwise moves to APSB
  })

  useEffect(() => {
    if (requiresCollegeSelection) return
    if (collegeId) {
      fetchMajors()
      fetchSemesters()
      getPaymentsEnabled(collegeId).then(setPaymentsEnabled).catch(() => setPaymentsEnabled(true))
      // Clear selected major and semester when college changes
      setFormData(prev => ({
        ...prev,
        major_id: '',
        semester_id: '',
      }))
    } else {
      // Clear majors and semesters if no college selected
      setMajors([])
      setSemesters([])
    }
  }, [collegeId, userRole, requiresCollegeSelection])

  const fetchMajors = async () => {
    if (!collegeId) return
    try {
      let query = supabase
        .from('majors')
        .select('id, name_en, name_ar, code, degree_level')
        .in('major_status', MAJOR_STATUS_FOR_APPLICATION_DROPDOWN)
        .order('name_en')

      if (collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      }

      const { data, error } = await query
      if (error) throw error
      setMajors(data || [])
    } catch (err) {
      console.error('Error fetching majors:', err)
    }
  }

  const fetchSemesters = async () => {
    if (!collegeId) return
    try {
      let query = supabase
        .from('semesters')
        .select('id, name_en, name_ar, code, start_date, end_date')
        .order('start_date', { ascending: false })

      if (collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      }

      const { data, error } = await query
      if (error) throw error
      setSemesters(data || [])
    } catch (err) {
      console.error('Error fetching semesters:', err)
    }
  }

  const validateStep = (step) => {
    switch (step) {
      case 1: // Personal Information
        if (!formData.first_name || !formData.last_name || !formData.email || !formData.date_of_birth) {
          return 'Please fill in all required fields in Personal Information'
        }
        break
      case 2: // Contact Information
        // All optional
        break
      case 3: // Emergency Contact
        // All optional
        break
      case 4: // Academic Information
        if (!formData.major_id) {
          return 'Please select a major'
        }
        break
      case 5: // Test Scores
        // All optional
        break
      case 6: // Transfer Information
        // All optional
        break
      case 7: // Additional Information
        // All optional
        break
    }
    return null
  }

  const handleNext = () => {
    const validationError = validateStep(currentStep)
    if (validationError) {
      setError(validationError)
      return
    }
    setError('')
    setCurrentStep(prev => Math.min(prev + 1, steps.length))
  }

  const handleBack = () => {
    setError('')
    setCurrentStep(prev => Math.max(prev - 1, 1))
  }

  const handleSubmit = async () => {
    const validationError = validateStep(currentStep)
    if (validationError) {
      setError(validationError)
      return
    }

    if (!collegeId) {
      setError('College ID is required')
      return
    }

    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      // No auto-validation / auto-rejection based on major rules.
      // Submissions follow the normal workflow for manual review.
      const finalStatusCode = formData.submit_as_draft ? 'APDR' : 'APSB'
      const triggerCode = formData.submit_as_draft ? null : 'TRSB' // Submitted
      const legacyStatus = 'pending'

      const { data: application, error } = await supabase
        .from('applications')
        .insert({
          first_name: formData.first_name.trim(),
          middle_name: formData.middle_name.trim() || null,
          last_name: formData.last_name.trim(),
          first_name_ar: formData.first_name_ar.trim() || null,
          middle_name_ar: formData.middle_name_ar.trim() || null,
          last_name_ar: formData.last_name_ar.trim() || null,
          email: formData.email.trim(),
          phone: formData.phone.trim() || null,
          date_of_birth: formData.date_of_birth,
          gender: formData.gender || null,
          nationality: normalizeNationalityCode(formData.nationality) || null,
          religion: formData.religion.trim() || null,
          place_of_birth: formData.place_of_birth.trim() || null,
          street_address: formData.street_address.trim() || null,
          city: formData.city.trim() || null,
          state_province: formData.state_province.trim() || null,
          postal_code: formData.postal_code.trim() || null,
          country: formData.country.trim() || null,
          emergency_contact_name: formData.emergency_contact_name.trim() || null,
          emergency_contact_relationship: formData.emergency_contact_relationship.trim() || null,
          emergency_contact_phone: formData.emergency_contact_phone.trim() || null,
          emergency_contact_email: formData.emergency_contact_email.trim() || null,
          major_id: formData.major_id ? parseInt(formData.major_id) : null,
          semester_id: formData.semester_id ? parseInt(formData.semester_id) : null,
          high_school_name: formData.high_school_name.trim() || null,
          high_school_country: formData.high_school_country.trim() || null,
          graduation_year: formData.graduation_year ? parseInt(formData.graduation_year) : null,
          gpa: formData.gpa ? parseFloat(formData.gpa) : null,
          certificate_type: formData.certificate_type.trim() || null,
          toefl_score: formData.toefl_score ? parseInt(formData.toefl_score) : null,
          ielts_score: formData.ielts_score ? parseFloat(formData.ielts_score) : null,
          sat_score: formData.sat_score ? parseInt(formData.sat_score) : null,
          gmat_score: formData.gmat_score ? parseInt(formData.gmat_score) : null,
          gre_score: formData.gre_score ? parseInt(formData.gre_score) : null,
          is_transfer_student: formData.is_transfer_student,
          previous_university: formData.previous_university.trim() || null,
          previous_degree: formData.previous_degree.trim() || null,
          transfer_credits: formData.transfer_credits ? parseInt(formData.transfer_credits) : null,
          personal_statement: formData.personal_statement.trim() || null,
          scholarship_request: formData.scholarship_request,
          scholarship_percentage: formData.scholarship_percentage ? parseFloat(formData.scholarship_percentage) : null,
          college_id: collegeId,
          status: legacyStatus,
          status_code: finalStatusCode,
          financial_milestone_code: 'PM00', // Start with no payment
          status_changed_at: new Date().toISOString(),
          review_notes: null,
        })
        .select()
        .single()

      if (error) throw error

      // Log the status change to audit log
      if (triggerCode) {
        const { error: auditError } = await supabase
          .from('status_change_audit_log')
          .insert({
            entity_type: 'application',
            entity_id: application.id,
            from_status_code: formData.submit_as_draft ? 'APDR' : null,
            to_status_code: finalStatusCode,
            trigger_code: triggerCode,
            triggered_by: null, // System-triggered
            notes: 'Application submitted.',
          })

        if (auditError) console.error('Error logging status change:', auditError)
      }

      setSuccess(true)
      setTimeout(() => {
        navigate('/admissions/applications')
      }, 1500)
    } catch (err) {
      console.error('Error creating application:', err)
      setError(err.message || 'Failed to create application')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
    if (error) setError('')
  }

  return (
    <div className="space-y-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'}`}>
        <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
          <button
            type="button"
            onClick={() => navigate('/admissions/applications')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {isArabicLayout ? <ArrowRight className="w-5 h-5 text-gray-600" /> : <ArrowLeft className="w-5 h-5 text-gray-600" />}
          </button>
          <div className={isRTL ? 'text-right' : 'text-left'}>
            <h1 className={`text-3xl font-bold text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>{t('admissions.newApplication')}</h1>
            <p className={`text-gray-600 mt-1 ${isRTL ? 'text-right' : 'text-left'}`}>{t('admissions.newApplicationSubtitle')}</p>
          </div>
        </div>
      </div>

      {/* College Selector for university-wide staff / admin */}
      {universityWide && (
        <div className={`rounded-xl shadow-sm p-6 ${requiresCollegeSelection ? 'bg-yellow-50 border-2 border-yellow-400' : 'bg-white border-2 border-blue-200'}`}>
          <div className={`flex flex-col ${isRTL ? 'items-end' : 'items-start'} md:flex-row md:items-center ${isRTL ? 'md:flex-row-reverse md:space-x-reverse' : 'md:space-x-4'} gap-4`}>
            <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
              <div className={`p-3 rounded-lg ${requiresCollegeSelection ? 'bg-yellow-100' : 'bg-blue-100'}`}>
                <Building2 className={`w-6 h-6 ${requiresCollegeSelection ? 'text-yellow-700' : 'text-blue-700'}`} />
              </div>
              <div className={isRTL ? 'text-right' : 'text-left'}>
                <p className={`text-base font-bold ${requiresCollegeSelection ? 'text-yellow-900' : 'text-blue-900'}`}>
                  {requiresCollegeSelection ? (t('admissions.collegeSelectionRequired') || 'College Selection Required') : (t('admissions.selectedCollege') || 'Selected College')}
                </p>
                <p className={`text-sm ${requiresCollegeSelection ? 'text-yellow-700' : 'text-blue-700'} mt-1`}>
                  {requiresCollegeSelection 
                    ? (t('admissions.collegeSelectionMessage') || 'Please select a college to create an application for')
                    : `${t('admissions.workingWith') || 'Working with'}: ${colleges.find(c => c.id === selectedCollegeId)?.name_en || t('common.unknown') || 'Unknown'}`}
                </p>
              </div>
            </div>
            <div className={`flex-1 ${isRTL ? 'text-right' : 'text-left'} w-full md:w-auto`}>
              <label className={`block text-sm font-medium mb-2 ${requiresCollegeSelection ? 'text-yellow-800' : 'text-gray-700'}`}>
                {t('admissions.selectCollege') || 'Select College'} *
              </label>
              <select
                value={selectedCollegeId || ''}
                onChange={(e) => {
                  const newCollegeId = e.target.value ? parseInt(e.target.value) : null
                  setSelectedCollegeId(newCollegeId)
                  // Clear any errors when college changes
                  if (error) setError('')
                }}
                disabled={collegesLoading}
                className={`w-full px-4 py-3 border-2 rounded-lg text-sm font-medium bg-white focus:ring-2 focus:border-transparent transition-all ${
                  requiresCollegeSelection 
                    ? 'border-yellow-400 focus:ring-yellow-500 text-yellow-900' 
                    : 'border-blue-300 focus:ring-blue-500 text-gray-900'
                } ${collegesLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                required
              >
                <option value="">
                  {collegesLoading 
                    ? (t('admissions.loadingColleges') || 'Loading colleges...') 
                    : (t('admissions.selectCollege') || '-- Select a College --')}
                </option>
                {colleges.length > 0 ? (
                  colleges.map((college) => (
                    <option key={college.id} value={college.id}>
                      {getLocalizedName(college, isArabicLayout) || college.name_en}{' '}
                      {college.abbreviation ? `(${college.abbreviation})` : college.code ? `(${college.code})` : ''}
                    </option>
                  ))
                ) : !collegesLoading && (
                  <option value="" disabled>{t('admissions.noCollegesAvailable') || 'No colleges available'}</option>
                )}
              </select>
              {collegesLoading && (
                <p className="text-xs text-gray-500 mt-1 flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-500"></div>
                  <span>{t('admissions.loadingColleges') || 'Loading available colleges...'}</span>
                </p>
              )}
              {!collegesLoading && colleges.length === 0 && (
                <p className="text-xs text-red-500 mt-1">{t('admissions.noCollegesAvailable') || 'No active colleges found. Please contact the administrator.'}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Progress Steps */}
      <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-6 ${requiresCollegeSelection ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="flex items-center justify-between overflow-x-auto pb-4">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-shrink-0">
              <div className="flex flex-col items-center">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                    currentStep >= step.id
                      ? 'bg-primary-gradient border-primary-600 text-white'
                      : 'bg-gray-100 border-gray-300 text-gray-400'
                  }`}
                >
                  <step.icon className="w-5 h-5" />
                </div>
                <div className="mt-2 text-xs font-medium text-gray-600 text-center max-w-[100px]">
                  {step.name}
                </div>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`w-16 h-1 mx-2 ${
                    currentStep > step.id ? 'bg-primary-600' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className={`bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 ${isRTL ? 'text-right' : 'text-left'}`}>
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-green-700">
          Application created successfully! Redirecting...
        </div>
      )}

      {/* Step Content */}
      <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-8 ${requiresCollegeSelection ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* Step 1: Personal Information */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Personal Information</h2>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Basic Information (English)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name *
                  </label>
                  <input
                    type="text"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleChange}
                    placeholder="Enter first name"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Middle Name
                  </label>
                  <input
                    type="text"
                    name="middle_name"
                    value={formData.middle_name}
                    onChange={handleChange}
                    placeholder="Enter middle name (optional)"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name *
                  </label>
                  <input
                    type="text"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleChange}
                    placeholder="Enter last name"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Basic Information (Arabic - Optional)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    First Name (Arabic)
                  </label>
                  <input
                    type="text"
                    name="first_name_ar"
                    value={formData.first_name_ar}
                    onChange={handleChange}
                    placeholder="الاسم الأول"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    dir="rtl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Middle Name (Arabic)
                  </label>
                  <input
                    type="text"
                    name="middle_name_ar"
                    value={formData.middle_name_ar}
                    onChange={handleChange}
                    placeholder="اسم الأب"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    dir="rtl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Last Name (Arabic)
                  </label>
                  <input
                    type="text"
                    name="last_name_ar"
                    value={formData.last_name_ar}
                    onChange={handleChange}
                    placeholder="اسم العائلة"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    dir="rtl"
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Personal Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="student@example.com"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="+1 (555) 123-4567"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    name="date_of_birth"
                    value={formData.date_of_birth}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gender
                  </label>
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nationality
                  </label>
                  <NationalitySelect
                    name="nationality"
                    value={formData.nationality}
                    onChange={(code) => setFormData((prev) => ({ ...prev, nationality: code }))}
                    placeholder={t('common.select', 'Select…')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Religion
                  </label>
                  <input
                    type="text"
                    name="religion"
                    value={formData.religion}
                    onChange={handleChange}
                    placeholder="Enter religion (optional)"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Place of Birth
                  </label>
                  <input
                    type="text"
                    name="place_of_birth"
                    value={formData.place_of_birth}
                    onChange={handleChange}
                    placeholder="City, Country"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Contact Information */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Contact Information</h2>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Address Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Street Address
                  </label>
                  <input
                    type="text"
                    name="street_address"
                    value={formData.street_address}
                    onChange={handleChange}
                    placeholder="Street address, P.O. box, company name"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    City
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="City"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    State / Province
                  </label>
                  <input
                    type="text"
                    name="state_province"
                    value={formData.state_province}
                    onChange={handleChange}
                    placeholder="State or Province"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Postal / ZIP Code
                  </label>
                  <input
                    type="text"
                    name="postal_code"
                    value={formData.postal_code}
                    onChange={handleChange}
                    placeholder="12345"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Country
                  </label>
                  <input
                    type="text"
                    name="country"
                    value={formData.country}
                    onChange={handleChange}
                    placeholder="Country"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Emergency Contact */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Emergency Contact</h2>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Emergency Contact Information</h3>
              <p className="text-sm text-gray-600 mb-6">Please provide details of a person we can contact in case of emergency</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Contact Name
                  </label>
                  <input
                    type="text"
                    name="emergency_contact_name"
                    value={formData.emergency_contact_name}
                    onChange={handleChange}
                    placeholder="Full name of emergency contact"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Relationship
                  </label>
                  <input
                    type="text"
                    name="emergency_contact_relationship"
                    value={formData.emergency_contact_relationship}
                    onChange={handleChange}
                    placeholder="e.g., Parent, Sibling, Spouse"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    name="emergency_contact_phone"
                    value={formData.emergency_contact_phone}
                    onChange={handleChange}
                    placeholder="+1 (555) 123-4567"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    name="emergency_contact_email"
                    value={formData.emergency_contact_email}
                    onChange={handleChange}
                    placeholder="emergency.contact@example.com"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Academic Information */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Academic Information</h2>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Program Selection</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Major *
                  </label>
                  <select
                    name="major_id"
                    value={formData.major_id}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  >
                    <option value="">Select Major</option>
                    {majors.map((major) => (
                      <option key={major.id} value={major.id}>
                        {getLocalizedName(major, isArabicLayout) || major.name_en} ({major.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Semester
                  </label>
                  <select
                    name="semester_id"
                    value={formData.semester_id}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select Semester</option>
                    {semesters.map((semester) => (
                      <option key={semester.id} value={semester.id}>
                        {getLocalizedName(semester, isArabicLayout) || semester.name_en} ({semester.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">High School / Secondary Education</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    High School Name
                  </label>
                  <input
                    type="text"
                    name="high_school_name"
                    value={formData.high_school_name}
                    onChange={handleChange}
                    placeholder="Name of high school"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    High School Country
                  </label>
                  <input
                    type="text"
                    name="high_school_country"
                    value={formData.high_school_country}
                    onChange={handleChange}
                    placeholder="Country"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Graduation Year
                  </label>
                  <input
                    type="number"
                    name="graduation_year"
                    value={formData.graduation_year}
                    onChange={handleChange}
                    placeholder="2024"
                    min="1950"
                    max="2100"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GPA / Grade
                  </label>
                  <input
                    type="number"
                    name="gpa"
                    value={formData.gpa}
                    onChange={handleChange}
                    placeholder="3.5"
                    min="0"
                    max="4"
                    step="0.01"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">On a 4.0 scale</p>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Certificate Type
                  </label>
                  <input
                    type="text"
                    name="certificate_type"
                    value={formData.certificate_type}
                    onChange={handleChange}
                    placeholder="e.g., IB, A-Levels, Tawjihi"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: Test Scores */}
        {currentStep === 5 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Test Scores</h2>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Standardized Test Scores</h3>
              <p className="text-sm text-gray-600 mb-6">Please enter any standardized test scores you have. All fields are optional.</p>
              
              <div className="mb-6">
                <h4 className="text-md font-medium text-gray-700 mb-4">English Language Proficiency</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      TOEFL Score
                    </label>
                    <input
                      type="number"
                      name="toefl_score"
                      value={formData.toefl_score}
                      onChange={handleChange}
                      placeholder="0-120"
                      min="0"
                      max="120"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">Out of 120</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      IELTS Score
                    </label>
                    <input
                      type="number"
                      name="ielts_score"
                      value={formData.ielts_score}
                      onChange={handleChange}
                      placeholder="0.0-9.0"
                      min="0"
                      max="9"
                      step="0.1"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">Out of 9.0</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-md font-medium text-gray-700 mb-4">Standardized Test Scores</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      SAT Score
                    </label>
                    <input
                      type="number"
                      name="sat_score"
                      value={formData.sat_score}
                      onChange={handleChange}
                      placeholder="400-1600"
                      min="400"
                      max="1600"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">Out of 1600</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      GMAT Score
                    </label>
                    <input
                      type="number"
                      name="gmat_score"
                      value={formData.gmat_score}
                      onChange={handleChange}
                      placeholder="200-800"
                      min="200"
                      max="800"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">Out of 800</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      GRE Score
                    </label>
                    <input
                      type="number"
                      name="gre_score"
                      value={formData.gre_score}
                      onChange={handleChange}
                      placeholder="260-340"
                      min="260"
                      max="340"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-500 mt-1">Out of 340</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 6: Transfer Information */}
        {currentStep === 6 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Transfer Information</h2>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Transfer Student Status</h3>
              <div className="space-y-6">
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    name="is_transfer_student"
                    checked={formData.is_transfer_student}
                    onChange={handleChange}
                    className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                  />
                  <label className="text-sm font-medium text-gray-700">
                    I am a transfer student (currently or previously enrolled in another university)
                  </label>
                </div>

                {formData.is_transfer_student && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pl-8 border-l-2 border-gray-200">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Previous University
                      </label>
                      <input
                        type="text"
                        name="previous_university"
                        value={formData.previous_university}
                        onChange={handleChange}
                        placeholder="Name of previous university"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Previous Degree
                      </label>
                      <input
                        type="text"
                        name="previous_degree"
                        value={formData.previous_degree}
                        onChange={handleChange}
                        placeholder="e.g., Bachelor's, Associate's"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Transfer Credits
                      </label>
                      <input
                        type="number"
                        name="transfer_credits"
                        value={formData.transfer_credits}
                        onChange={handleChange}
                        placeholder="Number of credits"
                        min="0"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Step 7: Additional Information */}
        {currentStep === 7 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Additional Information</h2>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Personal Statement / Statement of Purpose
              </label>
              <textarea
                name="personal_statement"
                value={formData.personal_statement}
                onChange={handleChange}
                placeholder="Tell us about yourself, your academic goals, and why you want to study at our university..."
                rows={8}
                maxLength={5000}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Maximum 5000 characters ({formData.personal_statement.length}/5000)
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  name="scholarship_request"
                  checked={formData.scholarship_request}
                  onChange={handleChange}
                  className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <label className="text-sm font-medium text-gray-700">
                  I would like to apply for a scholarship
                </label>
              </div>

              {formData.scholarship_request && (
                <div className="pl-8">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Scholarship Percentage Requested
                  </label>
                  <div className="relative max-w-xs">
                    <input
                      type="number"
                      name="scholarship_percentage"
                      value={formData.scholarship_percentage}
                      onChange={handleChange}
                      placeholder="0-100"
                      min="0"
                      max="100"
                      step="0.01"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-500">%</span>
                  </div>
                </div>
              )}
            </div>

            {/* Submit Options */}
            <div className="border-t pt-6 mt-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Submission Options</h3>
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  name="submit_as_draft"
                  checked={formData.submit_as_draft}
                  onChange={handleChange}
                  className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
                />
                <label className="text-sm font-medium text-gray-700">
                  Save as draft (I will submit later)
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                If unchecked, the application will be submitted immediately. Draft applications can be edited later.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex justify-between">
        <button
          onClick={handleBack}
          disabled={currentStep === 1 || requiresCollegeSelection}
          className="flex items-center space-x-2 px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        {currentStep < steps.length ? (
          <button
            onClick={handleNext}
            disabled={requiresCollegeSelection}
            className="flex items-center space-x-2 px-6 py-2 bg-primary-gradient text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>Next</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading || requiresCollegeSelection}
            className="flex items-center space-x-2 px-6 py-2 bg-primary-gradient text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                <span>Submit Application</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}



