import { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase, SUPABASE_STORAGE_BUCKET } from '../../lib/supabase'
import { MAJOR_STATUS_FOR_APPLICATION_DROPDOWN } from '../../utils/majorAdmissionStatus'
import { getPaymentsEnabled } from '../../utils/getPaymentsEnabled'
import { getApplicationFormDefaults } from '../../utils/getApplicationFormDefaults'
import { normalizeNationalityCode } from '../../utils/nationalities'
import NationalitySelect from '../../components/common/NationalitySelect'
import { ArrowLeft, ArrowRight, Save, User, Phone, AlertCircle, GraduationCap, FileText, BookOpen, Building2, CheckCircle, Copy, Upload, Award } from 'lucide-react'

const CORE_DOCUMENT_SPECS = [
  { key: 'id_photo', accept: 'image/jpeg,image/png,image/webp,application/pdf' },
  { key: 'certificate', accept: 'image/jpeg,image/png,application/pdf' },
  { key: 'transcript', accept: 'image/jpeg,image/png,application/pdf' },
  { key: 'medical_certificate', accept: 'image/jpeg,image/png,application/pdf' },
  { key: 'recommendation_letter_1', accept: 'image/jpeg,image/png,application/pdf' },
  { key: 'recommendation_letter_2', accept: 'image/jpeg,image/png,application/pdf' },
]
const SCHOLARSHIP_DOCUMENT_SPECS = [
  { key: 'scholarship_letter', accept: 'image/jpeg,image/png,application/pdf' },
  { key: 'scholarship_financial', accept: 'image/jpeg,image/png,application/pdf' },
  { key: 'scholarship_recommendation', accept: 'image/jpeg,image/png,application/pdf' },
]
const ALL_DOCUMENT_SPECS = [...CORE_DOCUMENT_SPECS, ...SCHOLARSHIP_DOCUMENT_SPECS]

const CORE_DOCUMENT_LABEL_KEYS = {
  id_photo: 'idCardPassport',
  certificate: 'certificate',
  transcript: 'transcript',
  medical_certificate: 'medicalCertificate',
  recommendation_letter_1: 'recommendationLetter1',
  recommendation_letter_2: 'recommendationLetter2',
}

const PAST_SEMESTER_STATUSES = new Set([
  'completed',
  'archived',
  'closed',
  'cancelled',
  'ended',
])

function isUpcomingSemester(semester, today = new Date()) {
  if (!semester) return false
  const status = String(semester.status || '').toLowerCase()
  if (PAST_SEMESTER_STATUSES.has(status)) return false

  const day = new Date(today)
  day.setHours(0, 0, 0, 0)

  if (semester.end_date) {
    const end = new Date(semester.end_date)
    if (!Number.isNaN(end.getTime())) {
      end.setHours(0, 0, 0, 0)
      return end >= day
    }
  }
  if (semester.start_date) {
    const start = new Date(semester.start_date)
    if (!Number.isNaN(start.getTime())) {
      start.setHours(0, 0, 0, 0)
      return start >= day
    }
  }
  // Keep current / registration-open when dates are missing
  return ['active', 'registration_open', 'in_progress', 'scheduled', 'planned', 'draft'].includes(status)
}

function coreDocumentLabelKey(key) {
  return CORE_DOCUMENT_LABEL_KEYS[key] || key
}

export default function RegisterApplication({ portal = false }) {
  const { t } = useTranslation()
  const { isRTL, language, changeLanguage } = useLanguage()

  const steps = useMemo(
    () => [
      { id: 1, nameKey: 'registerApplication.steps.personal', icon: User },
      { id: 2, nameKey: 'registerApplication.steps.contact', icon: Phone },
      { id: 3, nameKey: 'registerApplication.steps.emergency', icon: AlertCircle },
      { id: 4, nameKey: 'registerApplication.steps.academic', icon: GraduationCap },
      { id: 5, nameKey: 'registerApplication.steps.transfer', icon: BookOpen },
      { id: 6, nameKey: 'registerApplication.steps.additional', icon: FileText },
      { id: 7, nameKey: 'registerApplication.steps.scholarship', icon: Award },
      { id: 8, nameKey: 'registerApplication.steps.scholarshipDocs', icon: Upload },
      { id: 9, nameKey: 'registerApplication.steps.documents', icon: Upload },
    ],
    [t]
  )
  const navigate = useNavigate()
  const location = useLocation()
  const { user, userRole, loading: authLoading } = useAuth()
  const [colleges, setColleges] = useState([])
  const [selectedCollegeId, setSelectedCollegeId] = useState('')
  const [forcedProgram, setForcedProgram] = useState(null) // { enabled, lock_fields, college_id, major_id, semester_id }
  const [paymentsEnabled, setPaymentsEnabled] = useState(true)
  const [majors, setMajors] = useState([])
  const [semesters, setSemesters] = useState([])
  const [academicYears, setAcademicYears] = useState([])
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingColleges, setLoadingColleges] = useState(true)
  const [error, setError] = useState('')
  const [applicationNumber, setApplicationNumber] = useState(null)
  const [submittedApplication, setSubmittedApplication] = useState(null)
  const [documentFiles, setDocumentFiles] = useState(() =>
    Object.fromEntries(ALL_DOCUMENT_SPECS.map((s) => [s.key, null]))
  )

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
    academic_year_id: '',
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
    scholarship_details: '',
    
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

  // Load optional global defaults for application form
  useEffect(() => {
    let alive = true
    getApplicationFormDefaults()
      .then((cfg) => {
        if (!alive) return
        if (cfg?.enabled && cfg.college_id && cfg.major_id) {
          setForcedProgram(cfg)
          setSelectedCollegeId(String(cfg.college_id))
          setFormData((prev) => ({
            ...prev,
            major_id: String(cfg.major_id),
            semester_id: cfg.semester_id ? String(cfg.semester_id) : prev.semester_id,
            academic_year_id: cfg.academic_year_id ? String(cfg.academic_year_id) : prev.academic_year_id,
          }))
          setCurrentStep(1)
        } else {
          setForcedProgram({ enabled: false })
        }
      })
      .catch(() => setForcedProgram({ enabled: false }))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!selectedCollegeId) return
    getPaymentsEnabled(parseInt(selectedCollegeId)).then(setPaymentsEnabled).catch(() => setPaymentsEnabled(true))
  }, [selectedCollegeId])

  // Applicant portal: require selecting program first (from /portal/apply). We pass it in the URL.
  useEffect(() => {
    if (!portal) return
    // Wait until defaults are loaded before deciding to redirect.
    if (forcedProgram == null) return
    if (forcedProgram?.enabled && forcedProgram?.college_id && forcedProgram?.major_id) {
      // Defaults override portal URL params
      return
    }
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
  }, [portal, forcedProgram?.enabled])

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
      fetchAcademicYears()
      // In applicant portal, major is pre-selected from the program selection screen
      setFormData((prev) => ({
        ...prev,
        ...(portal || forcedProgram?.enabled ? {} : { major_id: '' }),
        ...(forcedProgram?.enabled ? {} : { semester_id: '' }),
        ...(forcedProgram?.enabled ? {} : { academic_year_id: '' }),
      }))
    } else {
      setMajors([])
      setSemesters([])
      setAcademicYears([])
    }
  }, [selectedCollegeId, portal, forcedProgram?.enabled])

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
      setError(t('registerApplication.loadCollegesError'))
    } finally {
      setLoadingColleges(false)
    }
  }

  const fetchMajors = async () => {
    if (!selectedCollegeId) return
    try {
      const { data, error } = await supabase
        .from('majors')
        .select('id, name_en, name_ar, code, degree_level, validation_rules')
        .in('major_status', MAJOR_STATUS_FOR_APPLICATION_DROPDOWN)
        .or(`college_id.eq.${selectedCollegeId},is_university_wide.eq.true`)
        .order('name_en')

      if (error) throw error
      setMajors(data || [])
    } catch (err) {
      console.error('Error fetching majors:', err)
    }
  }

  const selectedMajor = useMemo(
    () => majors.find((m) => String(m.id) === String(formData.major_id)),
    [majors, formData.major_id]
  )

  const certificateTypeOptions = useMemo(() => {
    const allowed = selectedMajor?.validation_rules?.certificate_types_allowed
    if (!Array.isArray(allowed)) return []
    return allowed.map((x) => String(x || '').trim()).filter(Boolean)
  }, [selectedMajor])

  useEffect(() => {
    if (certificateTypeOptions.length === 0) return
    if (!formData.certificate_type) return
    if (!certificateTypeOptions.includes(String(formData.certificate_type).trim())) {
      setFormData((prev) => ({ ...prev, certificate_type: '' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certificateTypeOptions.join('|')])

  const fetchSemesters = async () => {
    if (!selectedCollegeId) return
    try {
      const { data, error } = await supabase
        .from('semesters')
        .select('id, name_en, name_ar, code, start_date, end_date, academic_year_id, status, is_current')
        .or(`college_id.eq.${selectedCollegeId},is_university_wide.eq.true`)
        .order('start_date', { ascending: true })

      if (error) throw error
      const upcoming = (data || []).filter((s) => isUpcomingSemester(s))
      setSemesters(upcoming)
      setFormData((prev) => {
        if (!prev.semester_id) return prev
        const stillValid = upcoming.some((s) => String(s.id) === String(prev.semester_id))
        return stillValid ? prev : { ...prev, semester_id: '' }
      })
    } catch (err) {
      console.error('Error fetching semesters:', err)
    }
  }

  const fetchAcademicYears = async () => {
    if (!selectedCollegeId) return
    try {
      const { data, error } = await supabase
        .from('academic_years')
        .select('id, name_en, name_ar, code, start_date, end_date, status, is_current')
        .or(`college_id.eq.${selectedCollegeId},is_university_wide.eq.true`)
        .order('start_date', { ascending: false })
      if (error) throw error
      setAcademicYears(data || [])
    } catch (err) {
      console.error('Error fetching academic years:', err)
    }
  }

  useEffect(() => {
    if (!formData.semester_id) return
    if (forcedProgram?.enabled && forcedProgram?.academic_year_id) return
    const sem = semesters.find((s) => String(s.id) === String(formData.semester_id))
    if (sem?.academic_year_id && !formData.academic_year_id) {
      setFormData((prev) => ({ ...prev, academic_year_id: String(sem.academic_year_id) }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.semester_id, semesters])

  const parseDecimalField = (raw, { scale, min = null, max = null }) => {
    if (raw == null || String(raw).trim() === '') return { value: null, error: null }
    const s = String(raw).trim()
    // Allow only digits + optional decimal point + decimals
    if (!/^\d+(\.\d+)?$/.test(s)) return { value: null, error: 'Invalid number format' }
    const n = Number(s)
    if (!Number.isFinite(n)) return { value: null, error: 'Invalid number' }
    if (min != null && n < min) return { value: null, error: `Must be at least ${min}` }
    if (max != null && n > max) return { value: null, error: `Must be at most ${max}` }
    // Round to DB scale to avoid overflow from long decimals (e.g. 3.333333)
    const rounded = Number(n.toFixed(scale))
    return { value: rounded, error: null }
  }

  const validateStep = (step) => {
    switch (step) {
      case 1:
        if (!formData.first_name || !formData.last_name || !formData.email || !formData.date_of_birth) {
          return t('registerApplication.errors.step1Required')
        }
        break
      case 4:
        if (!formData.major_id) {
          return t('registerApplication.errors.selectMajor')
        }
        {
          const g = parseDecimalField(formData.gpa, { scale: 2, min: 0, max: 4 })
          if (g.error) return `${t('registerApplication.errors.gpaPrefix')}: ${g.error}`
        }
        break
      case 7: {
        if (!formData.scholarship_request) break
        const st = String(formData.scholarship_type || '').trim()
        if (!st) return t('registerApplication.errors.scholarshipTypeRequired')
        const sp = parseDecimalField(formData.scholarship_percentage, { scale: 2, min: 0, max: 100 })
        if (sp.error) return `${t('registerApplication.errors.scholarshipPctPrefix')}: ${sp.error}`
        break
      }
      case 8: {
        if (!formData.scholarship_request) break
        const hasSchDoc = SCHOLARSHIP_DOCUMENT_SPECS.some((s) => documentFiles[s.key])
        if (!hasSchDoc) return t('registerApplication.scholarship.requireOneDoc')
        break
      }
    }
    return null
  }

  const handleNext = () => {
    if (!selectedCollegeId) {
      setError(t('registerApplication.errors.selectCollegeFirst'))
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

  const handleSubmit = async () => {
    const validationError = validateStep(currentStep)
    if (validationError) {
      setError(validationError)
      return
    }

    if (!selectedCollegeId) {
      setError(t('registerApplication.errors.collegeRequired'))
      return
    }

    setLoading(true)
    setError('')

    try {
      // No auto-validation / auto-rejection based on major rules.
      // All submitted applications go to normal workflow for manual review.
      const finalStatusCode = formData.submit_as_draft ? 'APDR' : 'APSB'
      const triggerCode = formData.submit_as_draft ? null : 'TRSB'
      const legacyStatus = 'pending'

      // Use alias fields if main fields are empty (for compatibility)
      const streetAddress = formData.street_address || formData.address || ''
      const stateProvince = formData.state_province || formData.state || ''
      const emergencyRelationship = formData.emergency_contact_relationship || formData.emergency_contact_relation || ''
      const emergencyPhone = formData.emergency_contact_phone || formData.emergency_phone || ''
      const scholarshipRequest = formData.scholarship_request || formData.has_scholarship || false
      const gpaValue = formData.gpa || formData.high_school_gpa || ''
      const gpaParsed = parseDecimalField(gpaValue, { scale: 2, min: 0, max: 4 }).value
      const scholarshipParsed = parseDecimalField(formData.scholarship_percentage, { scale: 2, min: 0, max: 100 }).value

      const medicalLines = []
      if (formData.medical_conditions === 'yes' || formData.medical_conditions === 'no') {
        medicalLines.push(`Medical conditions: ${formData.medical_conditions}`)
      }
      if (formData.allergies === 'yes' || formData.allergies === 'no') {
        medicalLines.push(`Allergies: ${formData.allergies}`)
      }
      if (formData.medications === 'yes' || formData.medications === 'no') {
        medicalLines.push(`Medications: ${formData.medications}`)
      }
      const statementParts = [formData.personal_statement?.trim() || '']
      if (medicalLines.length) {
        statementParts.push(['Medical information:', ...medicalLines].join('\n'))
      }
      if (formData.notes?.trim()) {
        statementParts.push(formData.notes.trim())
      }
      const personalStatementCombined = statementParts.filter(Boolean).join('\n\n') || null

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
          nationality: normalizeNationalityCode(formData.nationality) || null,
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
          academic_year_id: formData.academic_year_id ? parseInt(formData.academic_year_id) : null,
          high_school_name: formData.high_school_name?.trim() || null,
          high_school_country: formData.high_school_country?.trim() || null,
          graduation_year: formData.graduation_year ? parseInt(formData.graduation_year) : null,
          gpa: gpaParsed,
          certificate_type: formData.certificate_type?.trim() || null,
          toefl_score: null,
          ielts_score: null,
          sat_score: null,
          gmat_score: null,
          gre_score: null,
          is_transfer_student: formData.is_transfer_student,
          previous_university: formData.previous_university?.trim() || null,
          previous_degree: formData.previous_degree?.trim() || null,
          transfer_credits: formData.transfer_credits ? parseInt(formData.transfer_credits) : null,
          personal_statement: personalStatementCombined,
          scholarship_request: scholarshipRequest,
          scholarship_type: scholarshipRequest ? formData.scholarship_type?.trim() || null : null,
          scholarship_percentage: scholarshipRequest ? scholarshipParsed : null,
          scholarship_details: scholarshipRequest ? formData.scholarship_details?.trim() || null : null,
          college_id: parseInt(selectedCollegeId),
          status: legacyStatus,
          status_code: finalStatusCode,
          financial_milestone_code: 'PM00',
          status_changed_at: new Date().toISOString(),
          review_notes: null,
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
            notes: 'Application submitted.',
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
      for (const { key } of ALL_DOCUMENT_SPECS) {
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
            const payload = {
              application_id: application.id,
              document_type: key,
              file_path: storagePath,
              file_name: file.name,
              file_size: file.size,
              content_type: file.type,
              uploaded_at: new Date().toISOString(),
            }
            // Partial unique index is used (core docs only), so PostgREST "on_conflict" upsert is not valid.
            // Do update-if-exists else insert.
            const { data: existing, error: exErr } = await supabase
              .from('application_documents')
              .select('id')
              .eq('application_id', application.id)
              .eq('document_type', key)
              .order('uploaded_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            if (exErr) throw exErr

            const { error: writeErr } = existing?.id
              ? await supabase.from('application_documents').update(payload).eq('id', existing.id)
              : await supabase.from('application_documents').insert(payload)
            if (writeErr) console.error('Application document record failed:', key, writeErr)
          } catch (docErr) {
            console.error('Document upload failed (applicant can upload on track page):', docErr)
          }
        }
      }

      setApplicationNumber(application.application_number)
      setSubmittedApplication(application)
    } catch (err) {
      console.error('Error creating application:', err)
      setError(err.message || t('registerApplication.errors.submitFailed'))
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
      alert(t('registerApplication.success.copied'))
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
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{t('registerApplication.success.title')}</h1>
            <p className="text-gray-600 mb-8">{t('registerApplication.success.subtitle')}</p>
            
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 mb-6">
              <p className="text-sm font-medium text-gray-700 mb-2">{t('registerApplication.success.appNumberLabel')}</p>
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
              <h3 className="font-semibold text-gray-900 mb-3">{t('registerApplication.success.nextTitle')}</h3>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start">
                  <span className="text-blue-600 me-2">•</span>
                  <span>{t('registerApplication.success.step1')}</span>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-600 me-2">•</span>
                  <span>{t('registerApplication.success.step2')}</span>
                </li>
                <li className="flex items-start">
                  <span className="text-blue-600 me-2">•</span>
                  <span>{t('registerApplication.success.step3')}</span>
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
                {portal ? t('applicantPortal.viewApplication', 'View application') : t('registerApplication.success.track')}
              </button>
              <button
                onClick={() => {
                  setApplicationNumber(null)
                  setSubmittedApplication(null)
                  setDocumentFiles(Object.fromEntries(ALL_DOCUMENT_SPECS.map((s) => [s.key, null])))
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
                    scholarship_type: '',
                    scholarship_details: '',
                    medical_conditions: '',
                    allergies: '',
                    medications: '',
                    notes: '',
                    status_code: 'APDR',
                    submit_as_draft: false,
                  })
                  setSelectedCollegeId('')
                  setCurrentStep(1)
                }}
                className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-all"
              >
                {t('registerApplication.success.another')}
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
          <h1 className="text-4xl font-bold text-gray-900 mb-2">{t('registerApplication.headerTitle')}</h1>
          <p className="text-gray-600">{t('registerApplication.headerSubtitle')}</p>
        </div>

        {/* College Selection — gap (not space-x) for RTL; logical text align + select dir */}
        <div className="bg-white rounded-2xl shadow-sm border-2 border-blue-200 p-6 mb-6">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-blue-100">
              <Building2 className="h-6 w-6 text-blue-700" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-start text-base font-bold text-blue-900">{t('registerApplication.collegeTitle')}</p>
              <p className="mt-0.5 text-start text-sm leading-snug text-blue-700">
                {t('registerApplication.collegeHint')}
              </p>
            </div>
          </div>
          <select
            value={selectedCollegeId}
            onChange={(e) => {
              setSelectedCollegeId(e.target.value)
              if (error) setError('')
            }}
            disabled={loadingColleges || (forcedProgram?.enabled && forcedProgram?.lock_fields !== false)}
            dir={isRTL ? 'rtl' : 'ltr'}
            className="w-full rounded-lg border-2 border-blue-300 bg-white px-4 py-3 text-start text-sm font-medium focus:border-transparent focus:ring-2 focus:ring-blue-500"
            required
          >
            <option value="">
              {loadingColleges ? t('registerApplication.loadingColleges') : t('registerApplication.collegePlaceholder')}
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
                    {t(step.nameKey)}
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
              <h2 className="text-xl font-bold text-gray-900 mb-6">{t('registerApplication.steps.personal')}</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.firstName')}
                  </label>
                  <input
                    type="text"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleChange}
                    dir="ltr"
                    placeholder={t('registerApplication.placeholders.firstName')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.middleName')}
                  </label>
                  <input
                    type="text"
                    name="middle_name"
                    value={formData.middle_name}
                    onChange={handleChange}
                    dir="ltr"
                    placeholder={t('registerApplication.placeholders.middleName')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.lastName')}
                  </label>
                  <input
                    type="text"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleChange}
                    dir="ltr"
                    placeholder={t('registerApplication.placeholders.lastName')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.firstNameAr')}
                  </label>
                  <input
                    type="text"
                    name="first_name_ar"
                    value={formData.first_name_ar}
                    onChange={handleChange}
                    dir="rtl"
                    placeholder={t('registerApplication.placeholders.firstNameAr')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.middleNameAr')}
                  </label>
                  <input
                    type="text"
                    name="middle_name_ar"
                    value={formData.middle_name_ar}
                    onChange={handleChange}
                    dir="rtl"
                    placeholder={t('registerApplication.placeholders.middleNameAr')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.lastNameAr')}
                  </label>
                  <input
                    type="text"
                    name="last_name_ar"
                    value={formData.last_name_ar}
                    onChange={handleChange}
                    dir="rtl"
                    placeholder={t('registerApplication.placeholders.lastNameAr')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.email')}
                  </label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder={t('registerApplication.placeholders.email')}
                    disabled={portal}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.phone')}
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder={t('registerApplication.placeholders.phone')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.dateOfBirth')}
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
                    {t('registerApplication.fields.gender')}
                  </label>
                  <select
                    name="gender"
                    value={formData.gender}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">{t('registerApplication.gender.placeholder')}</option>
                    <option value="male">{t('registerApplication.gender.male')}</option>
                    <option value="female">{t('registerApplication.gender.female')}</option>
                    <option value="other">{t('registerApplication.gender.other')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.nationality')}
                  </label>
                  <NationalitySelect
                    name="nationality"
                    value={formData.nationality}
                    onChange={(code) => setFormData((prev) => ({ ...prev, nationality: code }))}
                    placeholder={t('registerApplication.placeholders.nationality')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.religion')}
                  </label>
                  <input
                    type="text"
                    name="religion"
                    value={formData.religion}
                    onChange={handleChange}
                    placeholder={t('registerApplication.placeholders.religion')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.placeOfBirth')}
                  </label>
                  <input
                    type="text"
                    name="place_of_birth"
                    value={formData.place_of_birth}
                    onChange={handleChange}
                    placeholder={t('registerApplication.placeholders.placeOfBirth')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.maritalStatus')}
                  </label>
                  <select
                    name="marital_status"
                    value={formData.marital_status}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">{t('common.select')}</option>
                    <option value="single">{t('registerApplication.fields.maritalSingle')}</option>
                    <option value="married">{t('registerApplication.fields.maritalMarried')}</option>
                    <option value="divorced">{t('registerApplication.fields.maritalDivorced')}</option>
                    <option value="widowed">{t('registerApplication.fields.maritalWidowed')}</option>
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
                  <label className="ms-2 text-sm text-gray-700">{t('registerApplication.fields.international')}</label>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Contact Information */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">{t('registerApplication.steps.contact')}</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.mobilePhone')}
                  </label>
                  <input
                    type="tel"
                    name="mobile_phone"
                    value={formData.mobile_phone}
                    onChange={handleChange}
                    placeholder={t('registerApplication.placeholders.mobilePhone')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.streetAddress')}
                  </label>
                  <input
                    type="text"
                    name="street_address"
                    value={formData.street_address}
                    onChange={handleChange}
                    placeholder={t('registerApplication.placeholders.streetAddress')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.city')}
                  </label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    placeholder={t('registerApplication.placeholders.city')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.stateProvince')}
                  </label>
                  <input
                    type="text"
                    name="state_province"
                    value={formData.state_province}
                    onChange={handleChange}
                    placeholder={t('registerApplication.placeholders.stateProvince')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.country')}
                  </label>
                  <input
                    type="text"
                    name="country"
                    value={formData.country}
                    onChange={handleChange}
                    placeholder={t('registerApplication.placeholders.country')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.postalCode')}
                  </label>
                  <input
                    type="text"
                    name="postal_code"
                    value={formData.postal_code}
                    onChange={handleChange}
                    placeholder={t('registerApplication.placeholders.postalCode')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Emergency Contact */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">{t('registerApplication.steps.emergency')}</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.emergencyName')}
                  </label>
                  <input
                    type="text"
                    name="emergency_contact_name"
                    value={formData.emergency_contact_name}
                    onChange={handleChange}
                    placeholder={t('registerApplication.placeholders.emergencyName')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.emergencyRelation')}
                  </label>
                  <input
                    type="text"
                    name="emergency_contact_relationship"
                    value={formData.emergency_contact_relationship}
                    onChange={handleChange}
                    placeholder={t('registerApplication.placeholders.emergencyRelation')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.emergencyPhone')}
                  </label>
                  <input
                    type="tel"
                    name="emergency_contact_phone"
                    value={formData.emergency_contact_phone}
                    onChange={handleChange}
                    placeholder={t('registerApplication.placeholders.emergencyPhone')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.emergencyEmail')}
                  </label>
                  <input
                    type="email"
                    name="emergency_contact_email"
                    value={formData.emergency_contact_email}
                    onChange={handleChange}
                    placeholder={t('registerApplication.placeholders.emergencyEmail')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Academic Information */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">{t('registerApplication.steps.academic')}</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.major')}
                  </label>
                  <select
                    name="major_id"
                    value={formData.major_id}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    disabled={portal || (forcedProgram?.enabled && forcedProgram?.lock_fields !== false)}
                    required
                  >
                    <option value="">{t('registerApplication.fields.selectMajor')}</option>
                    {majors.map((major) => (
                      <option key={major.id} value={major.id}>
                        {language === 'ar' && major.name_ar ? `${major.name_ar} (${major.code})` : `${major.name_en} (${major.code})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.semester')}
                  </label>
                  <select
                    name="semester_id"
                    value={formData.semester_id}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    disabled={forcedProgram?.enabled && forcedProgram?.lock_fields !== false}
                  >
                    <option value="">{t('registerApplication.fields.selectSemester')}</option>
                    {semesters.map((semester) => (
                      <option key={semester.id} value={semester.id}>
                        {language === 'ar' && semester.name_ar ? `${semester.name_ar} (${semester.code})` : `${semester.name_en} (${semester.code})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.academicYear', 'Academic Year')}
                  </label>
                  <select
                    name="academic_year_id"
                    value={formData.academic_year_id}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    disabled={forcedProgram?.enabled && forcedProgram?.lock_fields !== false}
                  >
                    <option value="">{t('registerApplication.fields.selectAcademicYear', 'Select academic year')}</option>
                    {academicYears.map((ay) => (
                      <option key={ay.id} value={ay.id}>
                        {language === 'ar' && ay.name_ar ? `${ay.name_ar} (${ay.code})` : `${ay.name_en} (${ay.code})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.studyType')}
                  </label>
                  <select
                    name="study_type"
                    value={formData.study_type}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">{t('registerApplication.fields.selectStudyType')}</option>
                    <option value="full_time">{t('registerApplication.fields.studyTypeFull')}</option>
                    <option value="part_time">{t('registerApplication.fields.studyTypePart')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.studyLoad')}
                  </label>
                  <select
                    name="study_load"
                    value={formData.study_load}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">{t('registerApplication.fields.selectStudyLoad')}</option>
                    <option value="light">{t('registerApplication.fields.studyLoadLight')}</option>
                    <option value="normal">{t('registerApplication.fields.studyLoadNormal')}</option>
                    <option value="heavy">{t('registerApplication.fields.studyLoadHeavy')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.studyApproach')}
                  </label>
                  <select
                    name="study_approach"
                    value={formData.study_approach}
                    onChange={handleChange}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">{t('registerApplication.fields.selectStudyApproach')}</option>
                    <option value="on_campus">{t('registerApplication.fields.studyOnCampus')}</option>
                    <option value="online">{t('registerApplication.fields.studyOnline')}</option>
                    <option value="hybrid">{t('registerApplication.fields.studyHybrid')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.creditHours')}
                  </label>
                  <input
                    type="number"
                    name="credit_hours"
                    value={formData.credit_hours}
                    onChange={handleChange}
                    placeholder={t('registerApplication.placeholders.creditHours')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.enrollmentDate')}
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
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('registerApplication.fields.prevEducation')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('registerApplication.fields.highSchoolName')}
                    </label>
                    <input
                      type="text"
                      name="high_school_name"
                      value={formData.high_school_name}
                      onChange={handleChange}
                      placeholder={t('registerApplication.placeholders.highSchoolName')}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('registerApplication.fields.highSchoolCountry')}
                    </label>
                    <input
                      type="text"
                      name="high_school_country"
                      value={formData.high_school_country}
                      onChange={handleChange}
                      placeholder={t('registerApplication.placeholders.highSchoolCountry')}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('registerApplication.fields.graduationYear')}
                    </label>
                    <input
                      type="number"
                      name="graduation_year"
                      value={formData.graduation_year}
                      onChange={handleChange}
                      placeholder={t('registerApplication.placeholders.graduationYear')}
                      min="1950"
                      max="2100"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('registerApplication.fields.gpa')}
                    </label>
                    <input
                      type="number"
                      name="gpa"
                      value={formData.gpa}
                      onChange={handleChange}
                      placeholder={t('registerApplication.placeholders.gpa')}
                      min="0"
                      max="4"
                      step="0.01"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('registerApplication.fields.certificateType')}
                    </label>
                    {certificateTypeOptions.length > 0 ? (
                      <select
                        name="certificate_type"
                        value={formData.certificate_type}
                        onChange={handleChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        <option value="">{t('admissions.createApplication.certificateTypePlaceholder', 'Select certificate type')}</option>
                        {certificateTypeOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        name="certificate_type"
                        value={formData.certificate_type}
                        onChange={handleChange}
                        placeholder={t('registerApplication.placeholders.certificateType')}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: Transfer Information */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">{t('registerApplication.steps.transfer')}</h2>
              
              <div className="flex items-center mb-6">
                <input
                  type="checkbox"
                  name="is_transfer_student"
                  checked={formData.is_transfer_student}
                  onChange={handleChange}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label className="ms-2 text-sm font-medium text-gray-700">{t('registerApplication.fields.transferStudent')}</label>
              </div>

              {formData.is_transfer_student && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('registerApplication.fields.prevUniversity')}
                    </label>
                    <input
                      type="text"
                      name="previous_university"
                      value={formData.previous_university}
                      onChange={handleChange}
                      placeholder={t('registerApplication.placeholders.prevUniversity')}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('registerApplication.fields.prevDegree')}
                    </label>
                    <input
                      type="text"
                      name="previous_degree"
                      value={formData.previous_degree}
                      onChange={handleChange}
                      placeholder={t('registerApplication.placeholders.prevDegree')}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('registerApplication.fields.transferCredits')}
                    </label>
                    <input
                      type="number"
                      name="transfer_credits"
                      value={formData.transfer_credits}
                      onChange={handleChange}
                      placeholder={t('registerApplication.placeholders.transferCredits')}
                      min="0"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 6: Additional Information */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">{t('registerApplication.steps.additional')}</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('registerApplication.fields.personalStatement')}
                  </label>
                  <textarea
                    name="personal_statement"
                    value={formData.personal_statement}
                    onChange={handleChange}
                    rows={6}
                    placeholder={t('registerApplication.fields.personalStatementPh')}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  />
                </div>

                <div className="border-t pt-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('registerApplication.fields.medicalTitle')}</h3>
                  <p className="text-sm text-gray-600 mb-4">{t('registerApplication.fields.medicalYesNoHint')}</p>
                  <div className="space-y-4">
                    {[
                      { name: 'medical_conditions', labelKey: 'medicalConditions' },
                      { name: 'allergies', labelKey: 'allergies' },
                      { name: 'medications', labelKey: 'medications' },
                    ].map(({ name, labelKey }) => (
                      <div key={name}>
                        <div className="block text-sm font-medium text-gray-700 mb-2">
                          {t(`registerApplication.fields.${labelKey}`)}
                        </div>
                        <div className="flex flex-wrap gap-4">
                          <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input
                              type="radio"
                              name={name}
                              value="yes"
                              checked={formData[name] === 'yes'}
                              onChange={handleChange}
                              className="border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            {t('registerApplication.fields.yes', 'Yes')}
                          </label>
                          <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                            <input
                              type="radio"
                              name={name}
                              value="no"
                              checked={formData[name] === 'no'}
                              onChange={handleChange}
                              className="border-gray-300 text-primary-600 focus:ring-primary-500"
                            />
                            {t('registerApplication.fields.no', 'No')}
                          </label>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-gray-500">
                      {t(
                        'registerApplication.fields.medicationCertHint',
                        'If you take medication or have a medical condition, upload your medical certificate with your other documents in the final step.',
                      )}
                    </p>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('registerApplication.fields.notes')}
                    </label>
                    <textarea
                      name="notes"
                      value={formData.notes}
                      onChange={handleChange}
                      rows={4}
                      placeholder={t('registerApplication.fields.notesPh')}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 7: Scholarship details */}
          {currentStep === 7 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 mb-2">{t('registerApplication.scholarship.title')}</h2>
              <p className="text-sm text-gray-600 mb-6">{t('registerApplication.scholarship.intro')}</p>
              <div className="flex items-center mb-4">
                <input
                  type="checkbox"
                  name="scholarship_request"
                  checked={formData.scholarship_request}
                  onChange={handleChange}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label className="ms-2 text-sm font-medium text-gray-700">{t('registerApplication.scholarship.requestLabel')}</label>
              </div>
              {formData.scholarship_request && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('registerApplication.scholarship.typeLabel')}
                      </label>
                      <input
                        type="text"
                        name="scholarship_type"
                        value={formData.scholarship_type}
                        onChange={handleChange}
                        placeholder={t('registerApplication.scholarship.typePlaceholder')}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('registerApplication.scholarship.pctLabel')}
                      </label>
                      <input
                        type="number"
                        name="scholarship_percentage"
                        value={formData.scholarship_percentage}
                        onChange={handleChange}
                        min="0"
                        max="100"
                        step="0.01"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('registerApplication.scholarship.detailsLabel')}
                    </label>
                    <textarea
                      name="scholarship_details"
                      value={formData.scholarship_details}
                      onChange={handleChange}
                      rows={5}
                      placeholder={t('registerApplication.scholarship.detailsPlaceholder')}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 8: Scholarship documents */}
          {currentStep === 8 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 mb-2">{t('registerApplication.scholarship.docTitle')}</h2>
              {!formData.scholarship_request ? (
                <p className="text-sm text-gray-600">{t('registerApplication.scholarship.skipNoScholarship')}</p>
              ) : (
                <>
                  <p className="text-sm text-gray-600 mb-6">{t('registerApplication.scholarship.docIntro')}</p>
                  {SCHOLARSHIP_DOCUMENT_SPECS.map(({ key, accept }) => (
                    <div key={key} className="border border-gray-200 rounded-xl p-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t(`registerApplication.fields.${key === 'scholarship_letter' ? 'scholarshipLetter' : key === 'scholarship_financial' ? 'scholarshipFinancial' : 'scholarshipRecommendation'}`)}
                      </label>
                      <input
                        type="file"
                        accept={accept}
                        className="text-sm text-gray-600 file:me-2 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-100 file:text-primary-700"
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
                </>
              )}
            </div>
          )}

          {/* Step 9: General documents */}
          {currentStep === 9 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 mb-2">{t('registerApplication.documents.title')}</h2>
              <p className="text-sm text-gray-600 mb-6">{t('registerApplication.documents.intro')}</p>
              {CORE_DOCUMENT_SPECS.map(({ key, accept }) => (
                <div key={key} className="border border-gray-200 rounded-xl p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t(`registerApplication.documents.${coreDocumentLabelKey(key)}`)}
                  </label>
                  <input
                    type="file"
                    accept={accept}
                    className="text-sm text-gray-600 file:me-2 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-100 file:text-primary-700"
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
            <span>{t('registerApplication.navBack')}</span>
          </button>
          {currentStep < steps.length ? (
            <button
              onClick={handleNext}
              disabled={!selectedCollegeId}
              className="flex items-center space-x-2 px-6 py-2 bg-primary-gradient text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{t('registerApplication.navNext')}</span>
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
                  <span>{t('registerApplication.navSubmitting')}</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  <span>{t('registerApplication.navSubmit')}</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}




