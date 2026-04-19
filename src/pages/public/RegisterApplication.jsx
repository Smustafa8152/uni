import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase, SUPABASE_STORAGE_BUCKET } from '../../lib/supabase'
import { MAJOR_STATUS_FOR_APPLICATION_DROPDOWN } from '../../utils/majorAdmissionStatus'
import { ArrowLeft, ArrowRight, Save, User, Phone, AlertCircle, GraduationCap, FileText, BookOpen, Building2, CheckCircle, Copy, Upload } from 'lucide-react'

const steps = [
  { id: 1, name: 'Personal Information', icon: User },
  { id: 2, name: 'Contact Information', icon: Phone },
  { id: 3, name: 'Emergency Contact', icon: AlertCircle },
  { id: 4, name: 'Academic Information', icon: GraduationCap },
  { id: 5, name: 'Test Scores', icon: FileText },
  { id: 6, name: 'Transfer Information', icon: BookOpen },
  { id: 7, name: 'Additional Information', icon: FileText },
  { id: 8, name: 'Documents', icon: Upload },
]

const REGISTER_DOCUMENT_TYPES = [
  { key: 'id_photo', label: 'ID photo', accept: 'image/jpeg,image/png,image/webp,application/pdf' },
  { key: 'transcript', label: 'Transcript / Grades', accept: 'image/jpeg,image/png,application/pdf' },
]

export default function RegisterApplication({ portal = false }) {
  const { t } = useTranslation()
  const { isRTL, language, changeLanguage } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, userRole, loading: authLoading } = useAuth()
  const [colleges, setColleges] = useState([])
  const [selectedCollegeId, setSelectedCollegeId] = useState('')
  const [majors, setMajors] = useState([])
  const [semesters, setSemesters] = useState([])
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingColleges, setLoadingColleges] = useState(true)
  const [error, setError] = useState('')
  const [applicationNumber, setApplicationNumber] = useState(null)
  const [submittedApplication, setSubmittedApplication] = useState(null)
  const [documentFiles, setDocumentFiles] = useState({ id_photo: null, transcript: null })

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
    mobile_phone: '',
    date_of_birth: '',
    gender: '',
    nationality: '',
    religion: '',
    place_of_birth: '',
    marital_status: '',
    blood_type: '',
    is_international: false,
    
    // Contact Information
    street_address: '',
    address: '', // Alias for street_address
    city: '',
    state_province: '',
    state: '', // Alias for state_province
    postal_code: '',
    country: '',
    
    // Emergency Contact
    emergency_contact_name: '',
    emergency_contact_relationship: '',
    emergency_contact_relation: '', // Alias
    emergency_contact_phone: '',
    emergency_phone: '', // Alias
    emergency_contact_email: '',
    
    // Academic Information
    major_id: '',
    semester_id: '',
    study_type: '',
    study_load: '',
    study_approach: '',
    credit_hours: '',
    enrollment_date: '',
    high_school_name: '',
    high_school_country: '',
    graduation_year: '',
    gpa: '',
    high_school_gpa: '', // Alias for gpa
    certificate_type: '',
    
    // Test Scores
    toefl_score: '',
    ielts_score: '',
    sat_score: '',
    gmat_score: '',
    gre_score: '',
    
    // Identity Documents
    national_id: '',
    passport_number: '',
    passport_expiry: '',
    visa_number: '',
    visa_expiry: '',
    residence_permit_number: '',
    residence_permit_expiry: '',
    
    // Transfer Information
    is_transfer_student: false,
    previous_university: '',
    previous_degree: '',
    transfer_credits: '',
    
    // Scholarship
    scholarship_request: false,
    has_scholarship: false, // Alias
    scholarship_type: '',
    scholarship_percentage: '',
    
    // Medical
    medical_conditions: '',
    allergies: '',
    medications: '',
    
    // Additional Information
    personal_statement: '',
    notes: '',
    
    // Documents (for future file upload)
    documents: [],
    
    // Application Status
    status_code: 'APDR',
    submit_as_draft: false,
  })

  useEffect(() => {
    fetchColleges()
  }, [])

  // Applicant portal: require selecting program first (from /portal/apply). We pass it in the URL.
  useEffect(() => {
    if (!portal) return
    const sp = new URLSearchParams(location.search || '')
    const cid = sp.get('collegeId')
    const mid = sp.get('majorId')
    if (!cid || !mid) {
      navigate('/portal/apply', { replace: true })
      return
    }
    setSelectedCollegeId(String(cid))
    setFormData((prev) => ({ ...prev, major_id: String(mid) }))
    // keep step at the beginning of the application, but lock program/college context
    setCurrentStep(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portal])

  useEffect(() => {
    if (!portal) return
    if (!authLoading && (!user || userRole !== 'applicant')) {
      navigate('/login/applicant', { replace: true, state: { from: '/portal/apply' } })
    }
  }, [portal, user, userRole, authLoading, navigate])

  useEffect(() => {
    if (portal && user?.email) {
      setFormData((prev) => ({ ...prev, email: user.email }))
    }
  }, [portal, user?.email])

  useEffect(() => {
    if (selectedCollegeId) {
      fetchMajors()
      fetchSemesters()
      // In applicant portal, major is pre-selected from the program selection screen
      setFormData((prev) => ({
        ...prev,
        ...(portal ? {} : { major_id: '' }),
        semester_id: '',
      }))
    } else {
      setMajors([])
      setSemesters([])
    }
  }, [selectedCollegeId])

  const fetchColleges = async () => {
    setLoadingColleges(true)
    try {
      const { data, error } = await supabase
        .from('colleges')
        .select('id, name_en, code, abbreviation')
        .eq('status', 'active')
        .order('name_en')

      if (error) throw error
      setColleges(data || [])
    } catch (err) {
      console.error('Error fetching colleges:', err)
      setError('Failed to load colleges. Please refresh the page.')
    } finally {
      setLoadingColleges(false)
    }
  }

  const fetchMajors = async () => {
    if (!selectedCollegeId) return
    try {
      const { data, error } = await supabase
        .from('majors')
        .select('id, name_en, code, degree_level')
        .in('major_status', MAJOR_STATUS_FOR_APPLICATION_DROPDOWN)
        .or(`college_id.eq.${selectedCollegeId},is_university_wide.eq.true`)
        .order('name_en')

      if (error) throw error
      setMajors(data || [])
    } catch (err) {
      console.error('Error fetching majors:', err)
    }
  }

  const fetchSemesters = async () => {
    if (!selectedCollegeId) return
    try {
      const { data, error } = await supabase
        .from('semesters')
        .select('id, name_en, code, start_date, end_date')
        .or(`college_id.eq.${selectedCollegeId},is_university_wide.eq.true`)
        .order('start_date', { ascending: false })

      if (error) throw error
      setSemesters(data || [])
    } catch (err) {
      console.error('Error fetching semesters:', err)
    }
  }

  const validateStep = (step) => {
    switch (step) {
      case 1:
        if (!formData.first_name || !formData.last_name || !formData.email || !formData.date_of_birth) {
          return 'Please fill in all required fields in Personal Information'
        }
        break
      case 4:
        if (!formData.major_id) {
          return 'Please select a major'
        }
        break
    }
    return null
  }

  const handleNext = () => {
    if (!selectedCollegeId) {
      setError('Please select a college first')
      return
    }
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

  const validateApplicationAgainstMajor = async (majorId, applicationData) => {
    if (!majorId) return { isValid: false, errors: ['Major is required'] }

    try {
      const { data: major, error: majorError } = await supabase
        .from('majors')
        .select('id, validation_rules, registration_fee')
        .eq('id', majorId)
        .single()

      if (majorError) throw majorError
      if (!major?.validation_rules || Object.keys(major.validation_rules).length === 0) {
        return { isValid: true, errors: [], requiresFee: !!major?.registration_fee }
      }

      const rules = major.validation_rules
      const errors = []

      if (rules.toefl_min && (!applicationData.toefl_score || applicationData.toefl_score < rules.toefl_min)) {
        errors.push(`TOEFL score must be at least ${rules.toefl_min}`)
      }
      if (rules.ielts_min && (!applicationData.ielts_score || applicationData.ielts_score < rules.ielts_min)) {
        errors.push(`IELTS score must be at least ${rules.ielts_min}`)
      }
      if (rules.gpa_min && (!applicationData.gpa || applicationData.gpa < rules.gpa_min)) {
        errors.push(`High school GPA must be at least ${rules.gpa_min}`)
      }
      if (rules.graduation_year_min && (!applicationData.graduation_year || applicationData.graduation_year < rules.graduation_year_min)) {
        errors.push(`Graduation year must be ${rules.graduation_year_min} or later`)
      }
      if (rules.certificate_types_allowed && rules.certificate_types_allowed.length > 0) {
        if (!applicationData.certificate_type || !rules.certificate_types_allowed.includes(applicationData.certificate_type)) {
          errors.push(`Certificate type must be one of: ${rules.certificate_types_allowed.join(', ')}`)
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        requiresFee: !!major?.registration_fee,
      }
    } catch (err) {
      console.error('Error validating against major:', err)
      return { isValid: false, errors: ['Error validating application requirements'] }
    }
  }

  const handleSubmit = async () => {
    const validationError = validateStep(currentStep)
    if (validationError) {
      setError(validationError)
      return
    }

    if (!selectedCollegeId) {
      setError('College selection is required')
      return
    }

    setLoading(true)
    setError('')

    try {
      let finalStatusCode = formData.submit_as_draft ? 'APDR' : 'APSB'
      let triggerCode = formData.submit_as_draft ? null : 'TRSB'
      let validationResult = null
      let legacyStatus = 'pending'

      if (!formData.submit_as_draft && formData.major_id) {
        validationResult = await validateApplicationAgainstMajor(parseInt(formData.major_id), {
          toefl_score: formData.toefl_score ? parseInt(formData.toefl_score) : null,
          ielts_score: formData.ielts_score ? parseFloat(formData.ielts_score) : null,
          gpa: formData.gpa ? parseFloat(formData.gpa) : null,
          graduation_year: formData.graduation_year ? parseInt(formData.graduation_year) : null,
          certificate_type: formData.certificate_type?.trim() || null,
        })

        if (!validationResult.isValid) {
          finalStatusCode = 'APIV'
          triggerCode = 'TRVF'
          legacyStatus = 'rejected'
        } else if (validationResult.requiresFee) {
          finalStatusCode = 'APPN'
          triggerCode = 'TRPW'
          legacyStatus = 'pending'
        } else {
          finalStatusCode = 'RVQU'
          triggerCode = 'TRVP'
          legacyStatus = 'pending'
        }
      }

      // Use alias fields if main fields are empty (for compatibility)
      const streetAddress = formData.street_address || formData.address || ''
      const stateProvince = formData.state_province || formData.state || ''
      const emergencyRelationship = formData.emergency_contact_relationship || formData.emergency_contact_relation || ''
      const emergencyPhone = formData.emergency_contact_phone || formData.emergency_phone || ''
      const scholarshipRequest = formData.scholarship_request || formData.has_scholarship || false
      const gpaValue = formData.gpa || formData.high_school_gpa || ''

      // Insert application - only select essential fields to reduce query time
      const { data: application, error } = await supabase
        .from('applications')
        .insert({
          first_name: formData.first_name?.trim() || '',
          middle_name: formData.middle_name?.trim() || null,
          last_name: formData.last_name?.trim() || '',
          first_name_ar: formData.first_name_ar?.trim() || null,
          middle_name_ar: formData.middle_name_ar?.trim() || null,
          last_name_ar: formData.last_name_ar?.trim() || null,
          email: formData.email?.trim() || '',
          phone: formData.phone?.trim() || null,
          date_of_birth: formData.date_of_birth,
          gender: formData.gender || null,
          nationality: formData.nationality?.trim() || null,
          religion: formData.religion?.trim() || null,
          place_of_birth: formData.place_of_birth?.trim() || null,
          street_address: streetAddress?.trim() || null,
          city: formData.city?.trim() || null,
          state_province: stateProvince?.trim() || null,
          postal_code: formData.postal_code?.trim() || null,
          country: formData.country?.trim() || null,
          emergency_contact_name: formData.emergency_contact_name?.trim() || null,
          emergency_contact_relationship: emergencyRelationship?.trim() || null,
          emergency_contact_phone: emergencyPhone?.trim() || null,
          emergency_contact_email: formData.emergency_contact_email?.trim() || null,
          major_id: formData.major_id ? parseInt(formData.major_id) : null,
          semester_id: formData.semester_id ? parseInt(formData.semester_id) : null,
          high_school_name: formData.high_school_name?.trim() || null,
          high_school_country: formData.high_school_country?.trim() || null,
          graduation_year: formData.graduation_year ? parseInt(formData.graduation_year) : null,
          gpa: gpaValue ? parseFloat(gpaValue) : null,
          certificate_type: formData.certificate_type?.trim() || null,
          toefl_score: formData.toefl_score ? parseInt(formData.toefl_score) : null,
          ielts_score: formData.ielts_score ? parseFloat(formData.ielts_score) : null,
          sat_score: formData.sat_score ? parseInt(formData.sat_score) : null,
          gmat_score: formData.gmat_score ? parseInt(formData.gmat_score) : null,
          gre_score: formData.gre_score ? parseInt(formData.gre_score) : null,
          is_transfer_student: formData.is_transfer_student,
          previous_university: formData.previous_university?.trim() || null,
          previous_degree: formData.previous_degree?.trim() || null,
          transfer_credits: formData.transfer_credits ? parseInt(formData.transfer_credits) : null,
          personal_statement: formData.personal_statement?.trim() || null,
          scholarship_request: scholarshipRequest,
          scholarship_percentage: formData.scholarship_percentage ? parseFloat(formData.scholarship_percentage) : null,
          college_id: parseInt(selectedCollegeId),
          status: legacyStatus,
          status_code: finalStatusCode,
          financial_milestone_code: 'PM00',
          status_changed_at: new Date().toISOString(),
          review_notes: validationResult && !validationResult.isValid 
            ? `Auto-validation failed: ${validationResult.errors.join('; ')}` 
            : null,
          ...(portal && user?.id ? { applicant_user_id: user.id } : {}),
        })
        .select('id, application_number, created_at')
        .single()

      if (error) throw error

      // Insert audit log asynchronously (don't wait for it to complete)
      // This prevents timeout if audit log insert is slow
      if (triggerCode && application?.id) {
        supabase
          .from('status_change_audit_log')
          .insert({
            entity_type: 'application',
            entity_id: application.id,
            from_status_code: formData.submit_as_draft ? 'APDR' : null,
            to_status_code: finalStatusCode,
            trigger_code: triggerCode,
            triggered_by: null,
            notes: validationResult && !validationResult.isValid 
              ? `Auto-validation failed: ${validationResult.errors.join('; ')}` 
              : validationResult?.isValid && validationResult?.requiresFee
              ? 'Validation passed. Payment required.'
              : validationResult?.isValid
              ? 'Validation passed. No payment required.'
              : 'Application submitted.',
          })
          .then(() => {
            console.log('Audit log created successfully')
          })
          .catch((auditError) => {
            console.error('Error creating audit log (non-blocking):', auditError)
            // Don't throw - application was created successfully
          })
      }

      // Upload document files if provided (optional at registration; same types as track page)
      for (const { key } of REGISTER_DOCUMENT_TYPES) {
        const file = documentFiles[key]
        if (file && application?.id) {
          try {
            const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
            const storagePath = `${application.id}/${key}/${safeName}`
            const { error: uploadError } = await supabase.storage
              .from(SUPABASE_STORAGE_BUCKET)
              .upload(storagePath, file, { upsert: true, contentType: file.type })
            if (uploadError) {
              console.error('Document storage upload failed:', key, uploadError)
              continue
            }
            const { error: insertError } = await supabase.from('application_documents').upsert(
              {
                application_id: application.id,
                document_type: key,
                file_path: storagePath,
                file_name: file.name,
                file_size: file.size,
                content_type: file.type,
              },
              { onConflict: 'application_id,document_type' }
            )
            if (insertError) console.error('Application document record failed:', key, insertError)
          } catch (docErr) {
            console.error('Document upload failed (applicant can upload on track page):', docErr)
          }
        }
      }

      setApplicationNumber(application.application_number)
      setSubmittedApplication(application)
    } catch (err) {
      console.error('Error creating application:', err)
      setError(err.message || 'Failed to submit application. Please try again.')
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

  const copyApplicationNumber = () => {
    if (applicationNumber) {
      navigator.clipboard.writeText(applicationNumber)
      alert('Application number copied to clipboard!')
    }
  }

  // Show success screen with application number
  if (applicationNumber && submittedApplication) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-8 md:p-12">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">Application Submitted Successfully!</h1>
            <p className="text-gray-600 mb-8">Your application has been received. Please save your application number for tracking.</p>
            
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 mb-6">
              <p className="text-sm font-medium text-gray-700 mb-2">Your Application Number</p>
              <div className="flex items-center justify-center space-x-3">
                <p className="text-3xl font-bold text-blue-600 font-mono">{applicationNumber}</p>
                <button
                  onClick={copyApplicationNumber}
                  className="p-2 hover:bg-blue-100 rounded-lg transition-colors"
                  title="Copy to clipboard"
                >
                  <Copy className="w-5 h-5 text-blue-600" />
                </button>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-6 mb-6 text-left">
              <h3 className="font-semibold text-gray-900 mb-3">Next Steps:</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start">
                  <span className="text-blue-600 mr-2">•</span>
                  <span>Save your application number and date of birth to track your application status</span>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-600 mr-2">•</span>
                  <span>You will receive an email confirmation shortly</span>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-600 mr-2">•</span>
                  <span>Check your application status at any time using the tracking page</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() =>
                  portal && submittedApplication?.id
                    ? navigate(`/portal/applications/${submittedApplication.id}`)
                    : navigate('/lookup-application')
                }
                className="px-6 py-3 bg-primary-gradient text-white rounded-lg font-semibold hover:shadow-lg transition-all"
              >
                {portal ? t('applicantPortal.viewApplication', 'View application') : 'Track Application Status'}
              </button>
              <button
                onClick={() => {
                  setApplicationNumber(null)
                  setSubmittedApplication(null)
                  setDocumentFiles({ id_photo: null, transcript: null })
                  setFormData({
                    first_name: '',
                    middle_name: '',
                    last_name: '',
                    first_name_ar: '',
                    middle_name_ar: '',
                    last_name_ar: '',
                    email: portal && user?.email ? user.email : '',
                    phone: '',
                    date_of_birth: '',
                    gender: '',
                    nationality: '',
                    religion: '',
                    place_of_birth: '',
                    street_address: '',
                    city: '',
                    state_province: '',
                    postal_code: '',
                    country: '',
                    emergency_contact_name: '',
                    emergency_contact_relationship: '',
                    emergency_contact_phone: '',
                    emergency_contact_email: '',
                    major_id: '',
                    semester_id: '',
                    high_school_name: '',
                    high_school_country: '',
                    graduation_year: '',
                    gpa: '',
                    certificate_type: '',
                    toefl_score: '',
                    ielts_score: '',
                    sat_score: '',
                    gmat_score: '',
                    gre_score: '',
                    is_transfer_student: false,
                    previous_university: '',
                    previous_degree: '',
                    transfer_credits: '',
                    personal_statement: '',
                    scholarship_request: false,
                    scholarship_percentage: '',
                    status_code: 'APDR',
                    submit_as_draft: false,
                  })
                  setSelectedCollegeId('')
                  setCurrentStep(1)
                }}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-all"
              >
                Submit Another Application
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (portal && authLoading) {
    return (
      <div className="flex justify-center py-20" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div
      className={
        portal
          ? 'py-4 px-0 md:px-2'
          : 'min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4'
      }
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="max-w-6xl mx-auto">
        {/* Language switcher */}
        <div className={`flex justify-end mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white/80 shadow-sm p-0.5">
            <button
              type="button"
              onClick={() => changeLanguage('en')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${language === 'en' ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              English
            </button>
            <button
              type="button"
              onClick={() => changeLanguage('ar')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${language === 'ar' ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              العربية
            </button>
          </div>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Student Application</h1>
          <p className="text-gray-600">Complete the form below to apply for admission</p>
        </div>

        {/* College Selection */}
        <div className="bg-white rounded-2xl shadow-sm border-2 border-blue-200 p-6 mb-6">
          <div className="flex items-center space-x-3 mb-4">
            <div className="p-3 rounded-lg bg-blue-100">
              <Building2 className="w-6 h-6 text-blue-700" />
            </div>
            <div>
              <p className="text-base font-bold text-blue-900">Select College *</p>
              <p className="text-sm text-blue-700">Choose the college you wish to apply to</p>
            </div>
          </div>
          <select
            value={selectedCollegeId}
            onChange={(e) => {
              setSelectedCollegeId(e.target.value)
              if (error) setError('')
            }}
            disabled={loadingColleges}
            className="w-full px-4 py-3 border-2 border-blue-300 rounded-lg text-sm font-medium bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          >
            <option value="">
              {loadingColleges ? 'Loading colleges...' : '-- Select a College --'}
            </option>
            {colleges.map(college => (
              <option key={college.id} value={college.id}>
                {college.name_en} {college.abbreviation ? `(${college.abbreviation})` : `(${college.code})`}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-6">
            {error}
          </div>
        )}

        {/* Progress Steps - Mobile Responsive */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 md:p-6 mb-6 overflow-x-auto">
          <div className="flex items-center justify-between min-w-max md:min-w-0">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center flex-shrink-0">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center border-2 transition-all ${
                      currentStep >= step.id
                        ? 'bg-primary-gradient border-primary-600 text-white'
                        : 'bg-gray-100 border-gray-300 text-gray-400'
                    }`}
                  >
                    <step.icon className="w-5 h-5 md:w-6 md:h-6" />
                  </div>
                  <div className="mt-2 text-xs font-medium text-gray-600 text-center max-w-[80px] md:max-w-[100px] hidden sm:block">
                    {step.name}
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div
                    className={`w-8 md:w-16 h-1 mx-2 ${
                      currentStep > step.id ? 'bg-primary-600' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Form Content - Reuse from CreateApplication.jsx but simplified */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 md:p-8">
          {/* Step 1: Personal Information */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Personal Information</h2>
              
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
                    placeholder="الاسم الأوسط"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                  />
                </div>
              </div>

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
                    disabled={portal}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
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
                  <input
                    type="text"
                    name="nationality"
                    value={formData.nationality}
                    onChange={handleChange}
                    placeholder="Enter nationality"
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
                    placeholder="Enter religion"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Marital Status
                  </label>
                  <select
                    name="marital_status"
                    value={formData.marital_status}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select Status</option>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="divorced">Divorced</option>
                    <option value="widowed">Widowed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Blood Type
                  </label>
                  <select
                    name="blood_type"
                    value={formData.blood_type}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select Blood Type</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                </div>
                <div className="flex items-center pt-6">
                  <input
                    type="checkbox"
                    name="is_international"
                    checked={formData.is_international}
                    onChange={handleChange}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label className="ml-2 text-sm text-gray-700">International Student</label>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Contact Information */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Contact Information</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mobile Phone
                  </label>
                  <input
                    type="tel"
                    name="mobile_phone"
                    value={formData.mobile_phone}
                    onChange={handleChange}
                    placeholder="+1 (555) 123-4567"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Street Address
                  </label>
                  <input
                    type="text"
                    name="street_address"
                    value={formData.street_address}
                    onChange={handleChange}
                    placeholder="Enter street address"
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
                    placeholder="Enter city"
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
                    placeholder="Enter state or province"
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
                    placeholder="Enter country"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Postal Code
                  </label>
                  <input
                    type="text"
                    name="postal_code"
                    value={formData.postal_code}
                    onChange={handleChange}
                    placeholder="Enter postal code"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Emergency Contact */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Emergency Contact</h2>
              
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
                    placeholder="Full name"
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
                    placeholder="e.g., Parent, Spouse, Sibling"
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
                    placeholder="contact@example.com"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Academic Information */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Academic Information</h2>
              
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
                    {majors.map(major => (
                      <option key={major.id} value={major.id}>
                        {major.name_en} ({major.code})
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
                    {semesters.map(semester => (
                      <option key={semester.id} value={semester.id}>
                        {semester.name_en} ({semester.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Study Type
                  </label>
                  <select
                    name="study_type"
                    value={formData.study_type}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select Study Type</option>
                    <option value="full_time">Full Time</option>
                    <option value="part_time">Part Time</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Study Load
                  </label>
                  <select
                    name="study_load"
                    value={formData.study_load}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select Study Load</option>
                    <option value="light">Light</option>
                    <option value="normal">Normal</option>
                    <option value="heavy">Heavy</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Study Approach
                  </label>
                  <select
                    name="study_approach"
                    value={formData.study_approach}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select Study Approach</option>
                    <option value="on_campus">On Campus</option>
                    <option value="online">Online</option>
                    <option value="hybrid">Hybrid</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Credit Hours
                  </label>
                  <input
                    type="number"
                    name="credit_hours"
                    value={formData.credit_hours}
                    onChange={handleChange}
                    placeholder="Enter credit hours"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Enrollment Date
                  </label>
                  <input
                    type="date"
                    name="enrollment_date"
                    value={formData.enrollment_date}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="border-t pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Previous Education</h3>
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
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Certificate Type
                    </label>
                    <input
                      type="text"
                      name="certificate_type"
                      value={formData.certificate_type}
                      onChange={handleChange}
                      placeholder="e.g., High School Diploma"
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
              <p className="text-gray-600 mb-6">Please provide your standardized test scores (if applicable)</p>
              
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
                  <p className="text-xs text-gray-500 mt-1">Maximum score: 120</p>
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
                    step="0.5"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">Maximum score: 9.0</p>
                </div>
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
                  <p className="text-xs text-gray-500 mt-1">Maximum score: 1600</p>
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
                  <p className="text-xs text-gray-500 mt-1">Maximum score: 800</p>
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
                  <p className="text-xs text-gray-500 mt-1">Maximum score: 340</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Transfer Information */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Transfer Information</h2>
              
              <div className="flex items-center mb-6">
                <input
                  type="checkbox"
                  name="is_transfer_student"
                  checked={formData.is_transfer_student}
                  onChange={handleChange}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label className="ml-2 text-sm font-medium text-gray-700">I am a transfer student</label>
              </div>

              {formData.is_transfer_student && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
          )}

          {/* Step 7: Additional Information */}
          {currentStep === 7 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Additional Information</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Personal Statement
                  </label>
                  <textarea
                    name="personal_statement"
                    value={formData.personal_statement}
                    onChange={handleChange}
                    rows={6}
                    placeholder="Tell us about yourself, your goals, and why you want to study at this university..."
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  />
                </div>

                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Scholarship Information</h3>
                  <div className="flex items-center mb-4">
                    <input
                      type="checkbox"
                      name="scholarship_request"
                      checked={formData.scholarship_request}
                      onChange={handleChange}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <label className="ml-2 text-sm font-medium text-gray-700">Requesting Scholarship</label>
                  </div>
                  
                  {formData.scholarship_request && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Scholarship Type
                        </label>
                        <input
                          type="text"
                          name="scholarship_type"
                          value={formData.scholarship_type}
                          onChange={handleChange}
                          placeholder="e.g., Academic, Merit, Need-based"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Scholarship Percentage
                        </label>
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
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Medical Information (Optional)</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Medical Conditions
                      </label>
                      <textarea
                        name="medical_conditions"
                        value={formData.medical_conditions}
                        onChange={handleChange}
                        rows={3}
                        placeholder="List any medical conditions..."
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Allergies
                      </label>
                      <textarea
                        name="allergies"
                        value={formData.allergies}
                        onChange={handleChange}
                        rows={3}
                        placeholder="List any allergies..."
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Medications
                      </label>
                      <textarea
                        name="medications"
                        value={formData.medications}
                        onChange={handleChange}
                        rows={3}
                        placeholder="List any medications..."
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Additional Notes
                    </label>
                    <textarea
                      name="notes"
                      value={formData.notes}
                      onChange={handleChange}
                      rows={4}
                      placeholder="Any additional information you'd like to provide..."
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 8: Documents (optional; can upload on track page if not filled here) */}
          {currentStep === 8 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Documents</h2>
              <p className="text-sm text-gray-600 mb-6">
                You can upload these now or later on the track page after submitting.
              </p>
              {REGISTER_DOCUMENT_TYPES.map(({ key, label, accept }) => (
                <div key={key} className="border border-gray-200 rounded-xl p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
                  <input
                    type="file"
                    accept={accept}
                    className="text-sm text-gray-600 file:mr-2 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-100 file:text-primary-700"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      setDocumentFiles((prev) => ({ ...prev, [key]: f || null }))
                    }}
                  />
                  {documentFiles[key] && (
                    <p className="text-sm text-green-600 mt-1">{documentFiles[key].name}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between mt-6">
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className="flex items-center space-x-2 px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          {currentStep < steps.length ? (
            <button
              onClick={handleNext}
              disabled={!selectedCollegeId}
              className="flex items-center space-x-2 px-6 py-2 bg-primary-gradient text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Next</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading || !selectedCollegeId}
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
    </div>
  )
}




