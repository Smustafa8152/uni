import { useState, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase, SUPABASE_STORAGE_BUCKET } from '../../lib/supabase'
import { MAJOR_STATUS_FOR_APPLICATION_DROPDOWN, filterMajorsForRegistration, inactiveDepartmentIdSet } from '../../utils/majorAdmissionStatus'
import { APPLICATION_DEGREE_LEVELS, getApplicationFormDefaults } from '../../utils/getApplicationFormDefaults'
import { getNationalityLabel, normalizeNationalityCode } from '../../utils/nationalities'
import { formatStoredPhone } from '../../utils/callingCodes'
import ApplyPhoneInput from '../../components/common/ApplyPhoneInput'
import { notifyApplicationSubmitted } from '../../utils/notifyApplicationSubmitted'
import { syncApplicantProfile } from '../../utils/syncApplicantProfile'
import { resolvePortalAccountByEmail } from '../../utils/resolvePortalAccountByEmail'
import NationalitySelect from '../../components/common/NationalitySelect'
import { FlagAr, FlagEn } from '../../components/LanguageFlags'
import { ArrowLeft, ArrowRight, Save, CheckCircle, Copy, Eye, EyeOff, AlertCircle, Check } from 'lucide-react'

const CORE_DOCUMENT_SPECS = [
  { key: 'id_photo', labelKey: 'idCardPassport', accept: 'image/jpeg,image/png,image/webp,application/pdf' },
  { key: 'certificate', labelKey: 'certificate', accept: 'image/jpeg,image/png,application/pdf' },
  { key: 'transcript', labelKey: 'transcript', accept: 'image/jpeg,image/png,application/pdf' },
]
const SCHOLARSHIP_DOCUMENT_SPECS = [
  { key: 'scholarship_letter', labelKey: 'scholarshipLetter', accept: 'image/jpeg,image/png,application/pdf' },
  { key: 'scholarship_financial', labelKey: 'scholarshipFinancial', accept: 'image/jpeg,image/png,application/pdf' },
  { key: 'scholarship_recommendation', labelKey: 'scholarshipRecommendation', accept: 'image/jpeg,image/png,application/pdf' },
]
const ALL_DOCUMENT_SPECS = [...CORE_DOCUMENT_SPECS, ...SCHOLARSHIP_DOCUMENT_SPECS]

const EDUCATION_LEVELS = ['high_school', 'diploma', 'bachelor', 'master', 'phd']

/** Previous qualifications that sit below the program the applicant is applying for. */
function previousEducationFor(degreeLevel) {
  const idx = EDUCATION_LEVELS.indexOf(degreeLevel)
  if (idx <= 0) return []
  return EDUCATION_LEVELS.slice(0, idx)
}
const ID_TYPES = ['passport', 'national_id', 'residence_permit', 'birth_certificate']
const STUDY_LANGUAGES = ['arabic', 'english', 'french', 'other']
const LANGUAGE_CERTIFICATES = ['toefl', 'ielts', 'muet', 'arabic_proficiency', 'other']
const REFERRAL_SOURCES = ['website', 'social_media', 'agent', 'staff', 'student', 'friend', 'advertisement', 'other']
const TITLES = ['mr', 'mrs', 'ms', 'dr']

const PAST_SEMESTER_STATUSES = new Set(['completed', 'archived', 'closed', 'cancelled', 'ended'])

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
  return ['active', 'registration_open', 'in_progress', 'scheduled', 'planned', 'draft'].includes(status)
}

const INITIAL_FORM = {
  // Program
  degree_level: '',
  study_type: 'on_campus',
  semester_id: '',
  academic_year_id: '',
  major_id: '',
  second_choice_college_id: '',
  second_choice_major_id: '',

  // Education background
  is_former_student: false,
  matric_no: '',
  highest_education_level: '',
  certificate_type: '',
  high_school_name: '',
  graduation_year: '',
  gpa: '',
  specialization: '',
  language_of_study: '',
  high_school_country: '',
  has_language_certificate: false,
  language_certificate_name: '',
  language_certificate_other: '',
  language_certificate_result: '',

  // Personal
  title: '',
  first_name: '',
  last_name: '',
  name_ar: '',
  date_of_birth: '',
  gender: '',
  religion: '',
  nationality: '',

  // Identity
  id_type: 'passport',
  id_number: '',
  id_issue_country: '',
  id_issue_date: '',
  id_expiry_date: '',

  // Contact
  email: '',
  phone: '',
  home_phone: '',
  country: '',
  state_province: '',
  city: '',
  postal_code: '',
  street_address: '',

  // Additional
  referral_source: '',
  scholarship_request: false,
  scholarship_type: '',
  scholarship_details: '',
  password: '',
  password_confirm: '',
  submit_as_draft: false,
}

const APPLY_DRAFT_KEY = 'apply-form-draft'

function readApplyDraft() {
  try {
    const raw = sessionStorage.getItem(APPLY_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function formFromDraft(draft) {
  if (!draft?.formData || typeof draft.formData !== 'object') return { ...INITIAL_FORM }
  const { password, password_confirm, ...rest } = draft.formData
  return { ...INITIAL_FORM, ...rest, password: '', password_confirm: '' }
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-[#1a3a6b] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#1a3a6b]/10 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400'

/** Keep certificate country as a readable name so existing records stay consistent. */
function countryNameForStorage(raw) {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return null
  const code = normalizeNationalityCode(trimmed)
  return code ? getNationalityLabel(code, false) : trimmed
}

function Field({ label, required, hint, invalid = false, children, className = '' }) {
  return (
    <div className={className}>
      <label className={`mb-1.5 block text-[13px] font-semibold tracking-wide ${invalid ? 'text-rose-600' : 'text-slate-600'}`}>
        {label}
        {required && <span className="ms-1 text-rose-500">*</span>}
      </label>
      <div
        className={
          invalid
            ? 'rounded-xl ring-2 ring-rose-300 [&_input]:border-rose-400 [&_input]:bg-rose-50 [&_select]:border-rose-400 [&_select]:bg-rose-50 [&_textarea]:border-rose-400 [&_textarea]:bg-rose-50'
            : ''
        }
      >
        {children}
      </div>
      {hint && <p className="mt-1.5 text-xs leading-snug text-amber-700/90">{hint}</p>}
    </div>
  )
}

function SectionCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4 sm:p-5">
      {title && <h3 className="mb-4 text-sm font-bold text-[#1a3a6b]">{title}</h3>}
      {children}
    </div>
  )
}

function Segmented({ name, value, onChange, options, disabled = false }) {
  return (
    <div className="inline-flex w-full max-w-sm rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      {options.map(({ v, label }) => {
        const active = value === v
        return (
          <button
            key={String(v)}
            type="button"
            disabled={disabled}
            onClick={() => onChange(name, v)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
              active ? 'bg-[#1a3a6b] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function YesNo({ name, value, onChange, yesLabel, noLabel }) {
  return (
    <Segmented
      name={name}
      value={value}
      onChange={onChange}
      options={[
        { v: true, label: yesLabel },
        { v: false, label: noLabel },
      ]}
    />
  )
}

function StepProgress({ steps, currentStep, onJump, t }) {
  const pct = Math.round((currentStep / steps.length) * 100)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-white/70">
        <span>
          {t('applyForm.progress.stepOf', 'Step {{current}} of {{total}}', {
            current: currentStep,
            total: steps.length,
          })}
        </span>
        <span className="text-[#c8a84b]">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/15">
        <div className="h-full rounded-full bg-gradient-to-r from-[#c8a84b] to-[#e8d5a3] transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <div className="hidden gap-1.5 sm:flex">
        {steps.map((step) => {
          const state = currentStep === step.id ? 'current' : currentStep > step.id ? 'done' : 'todo'
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => currentStep > step.id && onJump(step.id)}
              disabled={currentStep < step.id}
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-start transition ${
                state === 'current'
                  ? 'bg-[#c8a84b] text-[#1a3a6b] shadow-md'
                  : state === 'done'
                    ? 'bg-white/15 text-white hover:bg-white/20'
                    : 'bg-white/5 text-white/45'
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                  state === 'current'
                    ? 'bg-[#1a3a6b] text-white'
                    : state === 'done'
                      ? 'bg-white/25 text-white'
                      : 'bg-white/10 text-white/50'
                }`}
              >
                {state === 'done' ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : step.id}
              </span>
              <span className="truncate text-[11px] font-semibold leading-tight">{t(`applyForm.steps.${step.key}`)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function RegisterApplication({ portal = false }) {
  const { t } = useTranslation()
  const { isRTL, language, changeLanguage } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, userRole, loading: authLoading, signIn, refreshUserRole } = useAuth()

  const needsAccount = !portal && !(user && userRole === 'applicant')
  const [showPassword, setShowPassword] = useState(false)

  const steps = useMemo(
    () => [
      { id: 1, key: 'program' },
      { id: 2, key: 'education' },
      { id: 3, key: 'personal' },
      { id: 4, key: 'identity' },
      { id: 5, key: 'contact' },
      { id: 6, key: 'additional' },
    ],
    []
  )

  const [colleges, setColleges] = useState([])
  const [majors, setMajors] = useState([])
  const [semesters, setSemesters] = useState([])
  const [selectedCollegeId, setSelectedCollegeId] = useState(() => {
    if (portal) return ''
    const saved = readApplyDraft()?.selectedCollegeId
    return saved ? String(saved) : ''
  })
  const [forcedProgram, setForcedProgram] = useState(null)
  const [currentStep, setCurrentStep] = useState(() => {
    if (portal) return 1
    const step = Number(readApplyDraft()?.currentStep)
    return step >= 1 && step <= 6 ? step : 1
  })
  const [loading, setLoading] = useState(false)
  const [loadingColleges, setLoadingColleges] = useState(true)
  const [error, setError] = useState('')
  const [invalidFields, setInvalidFields] = useState([])
  const [applicationNumber, setApplicationNumber] = useState(null)
  const [submittedApplication, setSubmittedApplication] = useState(null)
  const [documentFiles, setDocumentFiles] = useState(() =>
    Object.fromEntries(ALL_DOCUMENT_SPECS.map((s) => [s.key, null]))
  )
  const [formData, setFormData] = useState(() => (portal ? { ...INITIAL_FORM } : formFromDraft(readApplyDraft())))
  const [activeDegreeLevels, setActiveDegreeLevels] = useState(() => [...APPLICATION_DEGREE_LEVELS])

  const programLocked = Boolean(forcedProgram?.enabled && forcedProgram?.lock_fields !== false)

  useEffect(() => {
    if (portal) return
    if (applicationNumber) {
      sessionStorage.removeItem(APPLY_DRAFT_KEY)
      return
    }
    const { password, password_confirm, ...safeForm } = formData
    try {
      sessionStorage.setItem(
        APPLY_DRAFT_KEY,
        JSON.stringify({
          formData: safeForm,
          currentStep,
          selectedCollegeId,
        })
      )
    } catch {
      // Session storage can be unavailable or full; the form still works in memory.
    }
  }, [portal, applicationNumber, formData, currentStep, selectedCollegeId])

  const clearInvalid = (names) => {
    const list = Array.isArray(names) ? names : [names]
    setInvalidFields((prev) => {
      const next = prev.filter((field) => !list.includes(field))
      if (prev.length > 0 && next.length === 0) setError('')
      return next
    })
  }

  const setField = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }))
    clearInvalid(name)
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setField(name, type === 'checkbox' ? checked : value)
  }

  useEffect(() => {
    let alive = true
    const load = async () => {
      setLoadingColleges(true)
      try {
        const [collegesRes, majorsRes, semestersRes, departmentsRes] = await Promise.all([
          supabase.from('colleges').select('id, name_en, name_ar, code, abbreviation').eq('status', 'active').order('name_en'),
          supabase
            .from('majors')
            .select('id, name_en, name_ar, code, degree_level, college_id, department_id, is_university_wide, validation_rules, status, major_status')
            .in('major_status', MAJOR_STATUS_FOR_APPLICATION_DROPDOWN)
            .order('name_en'),
          supabase
            .from('semesters')
            .select('id, name_en, name_ar, code, start_date, end_date, academic_year_id, status, college_id, is_university_wide')
            .order('start_date', { ascending: true }),
          supabase.from('departments').select('id, status'),
        ])
        if (!alive) return
        if (collegesRes.error) throw collegesRes.error
        if (majorsRes.error) throw majorsRes.error
        const activeColleges = collegesRes.data || []
        setColleges(activeColleges)
        setMajors(
          filterMajorsForRegistration(majorsRes.data, {
            activeCollegeIds: new Set(activeColleges.map((college) => String(college.id))),
            inactiveDepartmentIds: departmentsRes.error ? null : inactiveDepartmentIdSet(departmentsRes.data),
          })
        )
        setSemesters((semestersRes.data || []).filter((s) => isUpcomingSemester(s)))
      } catch (err) {
        console.error('Error loading program data:', err)
        if (alive) setError(t('registerApplication.loadCollegesError'))
      } finally {
        if (alive) setLoadingColleges(false)
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [t])

  // Drop a saved default program when its college or major is no longer offered
  useEffect(() => {
    if (loadingColleges) return
    if (selectedCollegeId && !colleges.some((college) => String(college.id) === String(selectedCollegeId))) {
      setSelectedCollegeId('')
    }
    if (formData.major_id && !majors.some((major) => String(major.id) === String(formData.major_id))) {
      setFormData((prev) => ({ ...prev, major_id: '' }))
      if (forcedProgram?.enabled) setForcedProgram({ enabled: false })
    }
    if (
      formData.second_choice_major_id &&
      !majors.some((major) => String(major.id) === String(formData.second_choice_major_id))
    ) {
      setFormData((prev) => ({ ...prev, second_choice_major_id: '' }))
    }
  }, [
    loadingColleges,
    colleges,
    majors,
    selectedCollegeId,
    formData.major_id,
    formData.second_choice_major_id,
    forcedProgram?.enabled,
  ])

  // Optional university-wide default program
  useEffect(() => {
    let alive = true
    getApplicationFormDefaults()
      .then((cfg) => {
        if (!alive) return
        if (Array.isArray(cfg?.active_degree_levels)) {
          setActiveDegreeLevels(cfg.active_degree_levels)
        }
        if (cfg?.enabled && cfg.college_id && cfg.major_id) {
          setForcedProgram(cfg)
          setSelectedCollegeId(String(cfg.college_id))
          setFormData((prev) => ({
            ...prev,
            major_id: String(cfg.major_id),
            semester_id: cfg.semester_id ? String(cfg.semester_id) : prev.semester_id,
            academic_year_id: cfg.academic_year_id ? String(cfg.academic_year_id) : prev.academic_year_id,
          }))
        } else {
          setForcedProgram({ enabled: false })
        }
      })
      .catch(() => setForcedProgram({ enabled: false }))
    return () => {
      alive = false
    }
  }, [])

  // Applicant portal enters with a pre-selected program
  useEffect(() => {
    if (!portal) return
    if (forcedProgram == null) return
    if (forcedProgram?.enabled && forcedProgram?.college_id && forcedProgram?.major_id) return

    const sp = new URLSearchParams(location.search || '')
    const cid = sp.get('collegeId')
    const mid = sp.get('majorId')
    if (!cid || !mid) {
      navigate('/portal/apply', { replace: true })
      return
    }
    setSelectedCollegeId(String(cid))
    setFormData((prev) => ({ ...prev, major_id: String(mid) }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portal, forcedProgram?.enabled])

  useEffect(() => {
    if (!portal) return
    if (!authLoading && (!user || userRole !== 'applicant')) {
      navigate('/login/applicant', { replace: true, state: { from: '/portal/apply' } })
    }
  }, [portal, user, userRole, authLoading, navigate])

  useEffect(() => {
    if (portal && user?.email) setFormData((prev) => ({ ...prev, email: user.email }))
  }, [portal, user?.email])

  // Derive the degree level from a pre-selected major
  useEffect(() => {
    if (formData.degree_level || !formData.major_id) return
    const major = majors.find((m) => String(m.id) === String(formData.major_id))
    if (!major?.degree_level) return
    if (!programLocked && !activeDegreeLevels.includes(major.degree_level)) return
    setFormData((prev) => ({ ...prev, degree_level: major.degree_level }))
  }, [majors, formData.major_id, formData.degree_level, programLocked, activeDegreeLevels])

  // Drop a choice whose academic level was closed, unless the program is locked by admissions.
  useEffect(() => {
    if (programLocked) return
    const major = majors.find((m) => String(m.id) === String(formData.major_id))
    const majorLevelClosed = Boolean(major?.degree_level && !activeDegreeLevels.includes(major.degree_level))
    const selectedClosed = Boolean(formData.degree_level && !activeDegreeLevels.includes(formData.degree_level))
    if (!majorLevelClosed && !selectedClosed) return
    setSelectedCollegeId('')
    setFormData((prev) => ({
      ...prev,
      degree_level: '',
      major_id: '',
      second_choice_college_id: '',
      second_choice_major_id: '',
    }))
  }, [programLocked, majors, formData.major_id, formData.degree_level, activeDegreeLevels])

  // Intake carries its own academic year
  useEffect(() => {
    if (!formData.semester_id) return
    const sem = semesters.find((s) => String(s.id) === String(formData.semester_id))
    if (sem?.academic_year_id) setFormData((prev) => ({ ...prev, academic_year_id: String(sem.academic_year_id) }))
  }, [formData.semester_id, semesters])

  // A record with no college is shared across the university, same as an explicit university-wide flag
  const belongsToCollege = (row, collegeId) =>
    row.is_university_wide || row.college_id == null || String(row.college_id) === String(collegeId)

  const availableSemesters = useMemo(
    () => semesters.filter((s) => belongsToCollege(s, selectedCollegeId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [semesters, selectedCollegeId]
  )

  // Drop an intake that the newly chosen faculty does not offer
  useEffect(() => {
    if (loadingColleges) return
    setFormData((prev) =>
      prev.semester_id && !availableSemesters.some((s) => String(s.id) === String(prev.semester_id))
        ? { ...prev, semester_id: '' }
        : prev
    )
  }, [availableSemesters, loadingColleges])

  const majorsFor = (collegeId) =>
    majors.filter(
      (m) =>
        Boolean(collegeId) &&
        (!formData.degree_level || m.degree_level === formData.degree_level) &&
        belongsToCollege(m, collegeId)
    )

  // Faculties that actually offer a program at the selected academic level
  const collegesForDegreeLevel = useMemo(() => {
    if (!formData.degree_level) return []
    const collegeIds = new Set(
      majors
        .filter((m) => m.degree_level === formData.degree_level && m.college_id != null)
        .map((m) => String(m.college_id))
    )
    return colleges.filter((c) => collegeIds.has(String(c.id)))
  }, [colleges, majors, formData.degree_level])

  // Drop faculty / program picks that no longer match the academic level
  useEffect(() => {
    if (loadingColleges || !formData.degree_level) return
    const validIds = new Set(collegesForDegreeLevel.map((c) => String(c.id)))
    if (selectedCollegeId && !validIds.has(String(selectedCollegeId))) {
      setSelectedCollegeId('')
      setFormData((prev) => ({
        ...prev,
        major_id: '',
        ...(prev.second_choice_college_id && !validIds.has(String(prev.second_choice_college_id))
          ? { second_choice_college_id: '', second_choice_major_id: '' }
          : {}),
      }))
      return
    }
    if (formData.second_choice_college_id && !validIds.has(String(formData.second_choice_college_id))) {
      setFormData((prev) => ({ ...prev, second_choice_college_id: '', second_choice_major_id: '' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.degree_level, collegesForDegreeLevel])

  const firstChoiceMajors = useMemo(
    () => majorsFor(selectedCollegeId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [majors, selectedCollegeId, formData.degree_level]
  )
  const secondChoiceMajors = useMemo(
    () => majorsFor(formData.second_choice_college_id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [majors, formData.second_choice_college_id, formData.degree_level]
  )

  const selectedMajor = useMemo(
    () => majors.find((m) => String(m.id) === String(formData.major_id)),
    [majors, formData.major_id]
  )

  const certificateTypeOptions = useMemo(() => {
    const allowed = selectedMajor?.validation_rules?.certificate_types_allowed
    if (!Array.isArray(allowed)) return []
    return allowed.map((x) => String(x || '').trim()).filter(Boolean)
  }, [selectedMajor])

  const localizedName = (row) => (language === 'ar' && row?.name_ar ? row.name_ar : row?.name_en)

  const parseDecimalField = (raw, { scale, min = null, max = null }) => {
    if (raw == null || String(raw).trim() === '') return { value: null, error: null }
    const s = String(raw).trim()
    if (!/^\d+(\.\d+)?$/.test(s)) return { value: null, error: 'Invalid number format' }
    const n = Number(s)
    if (!Number.isFinite(n)) return { value: null, error: 'Invalid number' }
    if (min != null && n < min) return { value: null, error: `Must be at least ${min}` }
    if (max != null && n > max) return { value: null, error: `Must be at most ${max}` }
    return { value: Number(n.toFixed(scale)), error: null }
  }

  const invalidFieldsForStep = (step) => {
    const fields = []
    if (step === 1) {
      if (!formData.semester_id) fields.push('semester_id')
      if (!formData.degree_level) fields.push('degree_level')
      else if (!programLocked && !activeDegreeLevels.includes(formData.degree_level)) fields.push('degree_level_inactive')
      if (!selectedCollegeId) fields.push('college_id')
      if (!formData.major_id) fields.push('major_id')
    }
    if (step === 2) {
      const allowedEducation = previousEducationFor(formData.degree_level)
      if (!formData.highest_education_level || !allowedEducation.includes(formData.highest_education_level)) {
        fields.push('highest_education_level')
      }
      const year = String(formData.graduation_year ?? '').trim()
      const yearNum = Number(year)
      if (!year || !Number.isInteger(yearNum) || yearNum < 1950 || yearNum > 2100) fields.push('graduation_year')
      const g = parseDecimalField(formData.gpa, { scale: 2, min: 0, max: 4 })
      if (g.error) fields.push('gpa')
    }
    if (step === 3) {
      if (!formData.first_name.trim()) fields.push('first_name')
      if (!formData.last_name.trim()) fields.push('last_name')
      if (!formData.date_of_birth) fields.push('date_of_birth')
    }
    if (step === 5) {
      if (!formData.email.trim()) fields.push('email')
      if (!formatStoredPhone(formData.phone)) fields.push('phone')
    }
    if (step === 6) {
      if (needsAccount) {
        if (!formData.password || formData.password.length < 8) fields.push('password')
        if (formData.password !== formData.password_confirm) fields.push('password_confirm')
      }
      for (const { key } of CORE_DOCUMENT_SPECS) {
        if (!documentFiles[key]) fields.push(`doc:${key}`)
      }
    }
    return fields
  }

  const validateStep = (step) => {
    const missing = invalidFieldsForStep(step)
    if (missing.length === 0) return null
    switch (step) {
      case 1:
        if (missing.includes('college_id')) return t('registerApplication.errors.selectCollegeFirst')
        if (missing.includes('degree_level_inactive')) return t('applyForm.errors.degreeLevelInactive', 'This academic level is not open for applications.')
        if (missing.includes('degree_level')) return t('applyForm.errors.selectDegreeLevel', 'Please select an academic level.')
        if (missing.includes('major_id')) return t('registerApplication.errors.selectMajor')
        if (missing.includes('semester_id')) return t('applyForm.errors.selectIntake', 'Please select a semester.')
        break
      case 2: {
        if (missing.includes('highest_education_level') || missing.includes('graduation_year')) {
          return t('applyForm.errors.educationRequired', 'Please select your highest education level and year of graduation.')
        }
        const g = parseDecimalField(formData.gpa, { scale: 2, min: 0, max: 4 })
        if (g.error) return `${t('registerApplication.errors.gpaPrefix')}: ${g.error}`
        break
      }
      case 3:
        return t('applyForm.errors.personalRequired', 'Please enter your full name and date of birth.')
      case 5:
        return t('applyForm.errors.contactRequired', 'Email and mobile number are required.')
      case 6: {
        if (missing.includes('password')) return t('applyForm.errors.passwordShort', 'Password must be at least 8 characters.')
        if (missing.includes('password_confirm')) return t('applyForm.errors.passwordMismatch', 'Passwords do not match.')
        if (missing.some((field) => field.startsWith('doc:'))) {
          return t('applyForm.errors.documentsRequired', 'Please upload your ID, certificate, and transcript.')
        }
        break
      }
    }
    return null
  }

  const handleNext = () => {
    const missing = invalidFieldsForStep(currentStep)
    const validationError = validateStep(currentStep)
    if (validationError) {
      setInvalidFields(missing)
      setError(validationError)
      return
    }
    setInvalidFields([])
    setError('')
    setCurrentStep((prev) => Math.min(prev + 1, steps.length))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleBack = () => {
    setError('')
    setInvalidFields([])
    setCurrentStep((prev) => Math.max(prev - 1, 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const uploadDocuments = async (applicationId) => {
    for (const { key } of ALL_DOCUMENT_SPECS) {
      const file = documentFiles[key]
      if (!file) continue
      try {
        const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
        const storagePath = `${applicationId}/${key}/${safeName}`
        const { error: uploadError } = await supabase.storage
          .from(SUPABASE_STORAGE_BUCKET)
          .upload(storagePath, file, { upsert: true, contentType: file.type })
        if (uploadError) {
          console.error('Document storage upload failed:', key, uploadError)
          continue
        }
        const payload = {
          application_id: applicationId,
          document_type: key,
          file_path: storagePath,
          file_name: file.name,
          file_size: file.size,
          content_type: file.type,
          uploaded_at: new Date().toISOString(),
        }
        const { data: existing } = await supabase
          .from('application_documents')
          .select('id')
          .eq('application_id', applicationId)
          .eq('document_type', key)
          .order('uploaded_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const { error: writeErr } = existing?.id
          ? await supabase.from('application_documents').update(payload).eq('id', existing.id)
          : await supabase.from('application_documents').insert(payload)
        if (writeErr) console.error('Application document record failed:', key, writeErr)
      } catch (docErr) {
        console.error('Document upload failed (applicant can upload later):', docErr)
      }
    }
  }

  const ensureApplicantSession = async () => {
    if (user?.id && userRole === 'applicant') return user.id

    const em = formData.email.trim().toLowerCase()
    const password = formData.password
    const displayName = [formData.first_name, formData.last_name].filter(Boolean).join(' ').trim() || undefined

    const accountKind = await resolvePortalAccountByEmail(em)
    if (accountKind === 'instructor') {
      throw new Error(
        t(
          'applicantRegister.emailIsInstructor',
          'This email belongs to an instructor account. Please use a different email, or sign in via the Instructor Portal.',
        ),
      )
    }

    const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
      email: em,
      password,
      options: {
        data: {
          role: 'applicant',
          name: displayName || em,
        },
      },
    })

    const alreadyExists =
      signUpErr?.code === 'user_already_exists' ||
      (signUpErr && /already|registered|exists|duplicate/i.test(signUpErr.message || '')) ||
      (signUpData?.user && Array.isArray(signUpData.user.identities) && signUpData.user.identities.length === 0)

    if (alreadyExists) {
      const { error: signInErr } = await signIn(em, password, 'applicant')
      if (signInErr) {
        if (signInErr?.code === 'ROLE_INSTRUCTOR' || /instructor|teacher/i.test(signInErr.message || '')) {
          throw new Error(
            t(
              'applicantRegister.emailIsInstructor',
              'This email belongs to an instructor account. Please use a different email, or sign in via the Instructor Portal.',
            ),
          )
        }
        const wrongPassword = /invalid login|invalid credentials|wrong password/i.test(signInErr.message || '')
        throw new Error(
          wrongPassword
            ? t(
                'applyForm.errors.accountExistsWrongPassword',
                'An account with this email already exists. Enter the correct password, or sign in to the applicant portal first.',
              )
            : t(
                'applyForm.errors.accountExists',
                'An account with this email already exists. Please sign in to the applicant portal, then apply from there.',
              ),
        )
      }
      await syncApplicantProfile({ name: displayName })
      await refreshUserRole()
      const {
        data: { user: signedIn },
      } = await supabase.auth.getUser()
      if (!signedIn?.id) throw new Error(t('applicantRegister.completeFailed', 'Could not create your account.'))
      return signedIn.id
    }

    if (signUpErr) throw signUpErr

    if (!signUpData?.session) {
      const { error: signInErr } = await signIn(em, password, 'applicant')
      if (signInErr) {
        throw new Error(
          t(
            'applicantRegister.confirmEmailBlocked',
            'Account created, but sign-in needs email confirmation. Disable â€œConfirm emailâ€‌ in Supabase, or confirm your email then try again.',
          ),
        )
      }
    }

    await syncApplicantProfile({ name: displayName })
    await refreshUserRole()
    const {
      data: { user: created },
    } = await supabase.auth.getUser()
    if (!created?.id) throw new Error(t('applicantRegister.completeFailed', 'Could not create your account.'))
    return created.id
  }

  const handleSubmit = async () => {
    const validationError = validateStep(currentStep)
    if (validationError) {
      setInvalidFields(invalidFieldsForStep(currentStep))
      setError(validationError)
      return
    }
    if (!selectedCollegeId) {
      setInvalidFields(['college_id'])
      setError(t('registerApplication.errors.collegeRequired'))
      return
    }

    setLoading(true)
    setError('')

    try {
      let applicantUserId = portal && user?.id ? user.id : null
      if (needsAccount || (!portal && user?.id && userRole === 'applicant')) {
        applicantUserId = await ensureApplicantSession()
      }

      const gpaParsed = parseDecimalField(formData.gpa, { scale: 2, min: 0, max: 4 }).value
      const certificateName =
        formData.language_certificate_name === 'other'
          ? formData.language_certificate_other.trim()
          : formData.language_certificate_name

      const { data: application, error: insertError } = await supabase
        .from('applications')
        .insert({
          // Program
          college_id: parseInt(selectedCollegeId),
          major_id: formData.major_id ? parseInt(formData.major_id) : null,
          semester_id: formData.semester_id ? parseInt(formData.semester_id) : null,
          academic_year_id: formData.academic_year_id ? parseInt(formData.academic_year_id) : null,
          second_choice_college_id: formData.second_choice_college_id ? parseInt(formData.second_choice_college_id) : null,
          second_choice_major_id: formData.second_choice_major_id ? parseInt(formData.second_choice_major_id) : null,
          study_type: formData.study_type || null,

          // Education background
          is_former_student: formData.is_former_student,
          matric_no: formData.is_former_student ? formData.matric_no.trim() || null : null,
          highest_education_level: formData.highest_education_level || null,
          certificate_type: formData.certificate_type.trim() || null,
          high_school_name: formData.high_school_name.trim() || null,
          high_school_country: countryNameForStorage(formData.high_school_country),
          graduation_year: formData.graduation_year ? parseInt(formData.graduation_year) : null,
          gpa: gpaParsed,
          specialization: formData.specialization.trim() || null,
          language_of_study: formData.language_of_study || null,
          language_certificate_name: formData.has_language_certificate ? certificateName || null : null,
          language_certificate_result: formData.has_language_certificate
            ? formData.language_certificate_result.trim() || null
            : null,

          // Personal
          title: formData.title || null,
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          first_name_ar: formData.name_ar.trim() || null,
          date_of_birth: formData.date_of_birth,
          gender: formData.gender || null,
          religion: formData.religion.trim() || null,
          nationality: normalizeNationalityCode(formData.nationality) || null,

          // Identity
          id_type: formData.id_type || null,
          id_number: formData.id_number.trim() || null,
          id_issue_country: formData.id_issue_country.trim() || null,
          id_issue_date: formData.id_issue_date || null,
          id_expiry_date: formData.id_expiry_date || null,

          // Contact
          email: formData.email.trim(),
          phone: formatStoredPhone(formData.phone),
          home_phone: formData.home_phone.trim() || null,
          country: formData.country.trim() || null,
          state_province: formData.state_province.trim() || null,
          city: formData.city.trim() || null,
          postal_code: formData.postal_code.trim() || null,
          street_address: formData.street_address.trim() || null,

          // Additional
          referral_source: formData.referral_source || null,
          scholarship_request: formData.scholarship_request,
          scholarship_type: formData.scholarship_request ? formData.scholarship_type.trim() || null : null,
          scholarship_percentage: null,
          scholarship_details: formData.scholarship_request ? formData.scholarship_details.trim() || null : null,

          // Workflow
          status: 'pending',
          status_code: formData.submit_as_draft ? 'APDR' : 'APSB',
          financial_milestone_code: 'PM00',
          status_changed_at: new Date().toISOString(),
          ...(applicantUserId ? { applicant_user_id: applicantUserId } : {}),
        })
        .select('id, application_number, created_at, email, college_id')
        .single()

      if (insertError) throw insertError

      if (!formData.submit_as_draft && application?.id) {
        const mailResult = await notifyApplicationSubmitted(supabase, application, { isDraft: false })
        if (!mailResult.sent && !mailResult.skipped) {
          console.warn('Submit confirmation email was not sent:', mailResult.error)
        }
      }

      if (!formData.submit_as_draft && application?.id) {
        supabase
          .from('status_change_audit_log')
          .insert({
            entity_type: 'application',
            entity_id: application.id,
            from_status_code: null,
            to_status_code: 'APSB',
            trigger_code: 'TRSB',
            triggered_by: null,
            notes: 'Application submitted.',
          })
          .then(null, (auditError) => console.error('Error creating audit log (non-blocking):', auditError))
      }

      if (application?.id) await uploadDocuments(application.id)

      setApplicationNumber(application.application_number)
      setSubmittedApplication(application)
    } catch (err) {
      console.error('Error creating application:', err)
      setError(err.message || t('registerApplication.errors.submitFailed'))
    } finally {
      setLoading(false)
    }
  }

  const copyApplicationNumber = () => {
    if (applicationNumber) {
      navigator.clipboard.writeText(applicationNumber)
      alert(t('registerApplication.success.copied'))
    }
  }

  if (applicationNumber && submittedApplication) {
    return (
      <div
        className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f4f6fb] p-4"
        dir={isRTL ? 'rtl' : 'ltr'}
        style={{ fontFamily: "'Cairo', system-ui, sans-serif" }}
      >
        <div className="pointer-events-none absolute -start-24 top-0 h-72 w-72 rounded-full bg-[#1a3a6b]/10 blur-3xl" />
        <div className="pointer-events-none absolute -end-16 bottom-10 h-72 w-72 rounded-full bg-[#c8a84b]/20 blur-3xl" />
        <div className="relative w-full max-w-lg rounded-3xl border border-slate-200/80 bg-white p-8 shadow-xl shadow-slate-900/5 md:p-10">
          <div className="text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-100">
              <CheckCircle className="h-7 w-7 text-emerald-600" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">{t('registerApplication.success.title')}</h1>
            <p className="mt-2 text-sm text-slate-500">{t('registerApplication.success.subtitle')}</p>

            <div className="mt-6 rounded-2xl bg-[#1a3a6b] px-5 py-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/70">{t('registerApplication.success.appNumberLabel')}</p>
              <div className="mt-2 flex items-center justify-center gap-2">
                <p className="font-mono text-2xl font-bold tracking-wide">{applicationNumber}</p>
                <button onClick={copyApplicationNumber} className="rounded-lg p-1.5 text-white/80 transition hover:bg-white/10 hover:text-white" title="Copy">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-start">
              <h3 className="text-sm font-bold text-slate-900">{t('registerApplication.success.nextTitle')}</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                {['step1', 'step2', 'step3'].map((k) => (
                  <li key={k} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8a84b]" />
                    <span>{t(`registerApplication.success.${k}`)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              {portal ? (
                <button
                  onClick={() =>
                    submittedApplication?.id
                      ? navigate(`/portal/applications/${submittedApplication.id}`)
                      : navigate('/portal')
                  }
                  className="rounded-xl bg-[#1a3a6b] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#1a3a6b]/20 transition hover:bg-[#152f56]"
                >
                  {t('applicantPortal.viewApplication', 'View application')}
                </button>
              ) : (
                <button
                  onClick={() =>
                    navigate('/login/applicant', {
                      state: {
                        from: submittedApplication?.id
                          ? `/portal/applications/${submittedApplication.id}`
                          : '/portal',
                        email: submittedApplication?.email || formData.email || '',
                      },
                    })
                  }
                  className="rounded-xl bg-[#1a3a6b] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[#1a3a6b]/20 transition hover:bg-[#152f56]"
                >
                  {t('registerApplication.success.signInPortal', 'Sign in to the applicant portal')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (portal && authLoading) {
    return (
      <div className="flex justify-center py-20" dir={isRTL ? 'rtl' : 'ltr'}>
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#1a3a6b] border-t-transparent" />
      </div>
    )
  }

  return (
    <div
      className={portal ? 'px-0 py-2 md:px-2' : 'relative min-h-screen overflow-hidden bg-[#f4f6fb] px-4 py-8'}
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{ fontFamily: "'Cairo', system-ui, sans-serif" }}
    >
      {!portal && (
        <>
          <div className="pointer-events-none absolute -start-20 top-10 h-80 w-80 rounded-full bg-[#1a3a6b]/8 blur-3xl" />
          <div className="pointer-events-none absolute -end-24 bottom-0 h-80 w-80 rounded-full bg-[#c8a84b]/15 blur-3xl" />
        </>
      )}

      <div className="relative mx-auto max-w-3xl">
        {!portal && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img src="/assets/IBU Logo.png" alt="IBU" className="h-11 w-auto object-contain" />
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#c8a84b]">IBU</p>
                <p className="text-sm font-semibold text-[#1a3a6b]">{t('registerApplication.headerTitle')}</p>
              </div>
            </div>
            <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5 shadow-sm">
              {[
                { code: 'en', label: 'English', Flag: FlagEn },
                { code: 'ar', label: 'العربية', Flag: FlagAr },
              ].map(({ code, label, Flag }) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => changeLanguage(code)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    language === code ? 'bg-[#1a3a6b] text-white' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Flag />
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/5">
          <div className="border-b border-slate-100 bg-gradient-to-br from-[#1a3a6b] to-[#243f73] px-5 py-5 text-white sm:px-7">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#c8a84b]">{t('registerApplication.headerSubtitle')}</p>
            <h1 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">{t(`applyForm.steps.${steps[currentStep - 1]?.key}`)}</h1>
            <div className="mt-5">
              <StepProgress steps={steps} currentStep={currentStep} onJump={setCurrentStep} t={t} />
            </div>
          </div>

          <div className="px-5 py-6 sm:px-7 sm:py-7">
            {currentStep === 1 && (
              <div className="space-y-5">
                <SectionCard title={t('applyForm.sections.program', 'Program preference')}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field
                      label={t('applyForm.fields.intake', 'Semester')}
                      required
                      invalid={invalidFields.includes('semester_id')}
                      hint={!loadingColleges && availableSemesters.length === 0 ? t('applyForm.empty.intakes', 'No semester is open for applications right now.') : null}
                    >
                      <select name="semester_id" value={formData.semester_id} onChange={handleChange} disabled={programLocked} className={inputClass}>
                        <option value="">{t('common.select', 'Please select')}</option>
                        {availableSemesters.map((s) => (
                          <option key={s.id} value={s.id}>
                            {localizedName(s)}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field label={t('applyForm.fields.workload', 'Study mode')}>
                      <Segmented
                        name="study_type"
                        value={formData.study_type}
                        disabled={programLocked}
                        onChange={(name, v) => setField(name, v)}
                        options={[
                          { v: 'on_campus', label: t('applyForm.workload.on_campus', 'On campus') },
                          { v: 'online', label: t('applyForm.workload.online', 'Online') },
                        ]}
                      />
                    </Field>

                    <Field label={t('applyForm.fields.academicLevel', 'Academic level')} required invalid={invalidFields.includes('degree_level')} className="md:col-span-2">
                      <select
                        name="degree_level"
                        value={formData.degree_level}
                        onChange={(e) => {
                          setSelectedCollegeId('')
                          setFormData((prev) => {
                            const allowedEducation = previousEducationFor(e.target.value)
                            return {
                              ...prev,
                              degree_level: e.target.value,
                              major_id: '',
                              second_choice_college_id: '',
                              second_choice_major_id: '',
                              highest_education_level: allowedEducation.includes(prev.highest_education_level)
                                ? prev.highest_education_level
                                : '',
                            }
                          })
                          clearInvalid(['degree_level', 'college_id', 'major_id', 'highest_education_level'])
                        }}
                        disabled={programLocked}
                        className={inputClass}
                      >
                        <option value="">{t('common.select', 'Please select')}</option>
                        {APPLICATION_DEGREE_LEVELS.map((lvl) => (
                          <option key={lvl} value={lvl} disabled={!activeDegreeLevels.includes(lvl)}>
                            {t(`applyForm.degreeLevels.${lvl}`)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </SectionCard>

                <SectionCard title={t('applyForm.sections.firstChoice', 'First choice')}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field
                      label={t('applyForm.fields.faculty', 'Faculty')}
                      required
                      invalid={invalidFields.includes('college_id')}
                      hint={
                        formData.degree_level && !loadingColleges && collegesForDegreeLevel.length === 0
                          ? t('applyForm.empty.faculties', 'No faculty offers programs at this academic level.')
                          : !formData.degree_level
                            ? t('applyForm.hints.selectLevelFirst', 'Select an academic level first.')
                            : null
                      }
                    >
                      <select
                        value={selectedCollegeId}
                        onChange={(e) => {
                          setSelectedCollegeId(e.target.value)
                          setFormData((prev) => ({ ...prev, major_id: '' }))
                          clearInvalid(['college_id', 'major_id'])
                        }}
                        disabled={loadingColleges || programLocked || !formData.degree_level}
                        className={inputClass}
                      >
                        <option value="">{loadingColleges ? t('registerApplication.loadingColleges') : t('common.select', 'Please select')}</option>
                        {collegesForDegreeLevel.map((c) => (
                          <option key={c.id} value={c.id}>
                            {localizedName(c)}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      label={t('applyForm.fields.firstChoice', 'First choice')}
                      required
                      invalid={invalidFields.includes('major_id')}
                      hint={
                        !selectedCollegeId
                          ? t('applyForm.hints.selectFacultyFirst', 'Select a faculty first.')
                          : selectedCollegeId && formData.degree_level && firstChoiceMajors.length === 0
                            ? t('applyForm.empty.majors', 'This faculty has no programs at the selected academic level.')
                            : null
                      }
                    >
                      <select
                        name="major_id"
                        value={formData.major_id}
                        onChange={handleChange}
                        disabled={portal || programLocked || !selectedCollegeId || !formData.degree_level}
                        className={inputClass}
                      >
                        <option value="">{t('common.select', 'Please select')}</option>
                        {firstChoiceMajors.map((m) => (
                          <option key={m.id} value={m.id}>
                            {localizedName(m)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                </SectionCard>

                <SectionCard title={t('applyForm.sections.secondChoice', 'Second choice (optional)')}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label={t('applyForm.fields.faculty2', 'Faculty (second choice)')}>
                      <select
                        name="second_choice_college_id"
                        value={formData.second_choice_college_id}
                        onChange={(e) => setFormData((prev) => ({ ...prev, second_choice_college_id: e.target.value, second_choice_major_id: '' }))}
                        disabled={!formData.degree_level}
                        className={inputClass}
                      >
                        <option value="">{t('common.select', 'Please select')}</option>
                        {collegesForDegreeLevel.map((c) => (
                          <option key={c.id} value={c.id}>
                            {localizedName(c)}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <Field
                      label={t('applyForm.fields.secondChoice', 'Second choice')}
                      hint={
                        formData.second_choice_college_id && formData.degree_level && secondChoiceMajors.length === 0
                          ? t('applyForm.empty.majors', 'This faculty has no programs at the selected academic level.')
                          : null
                      }
                    >
                      <select
                        name="second_choice_major_id"
                        value={formData.second_choice_major_id}
                        onChange={handleChange}
                        disabled={!formData.second_choice_college_id || !formData.degree_level}
                        className={inputClass}
                      >
                        <option value="">{t('common.select', 'Please select')}</option>
                        {secondChoiceMajors
                          .filter((m) => String(m.id) !== String(formData.major_id))
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {localizedName(m)}
                            </option>
                          ))}
                      </select>
                    </Field>
                  </div>
                </SectionCard>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-5">
                <SectionCard title={t('applyForm.sections.formerStudent', 'Returning student')}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label={t('applyForm.fields.isFormerStudent', 'Are you a former student of the university?')}>
                      <YesNo
                        name="is_former_student"
                        value={formData.is_former_student}
                        onChange={setField}
                        yesLabel={t('registerApplication.fields.yes', 'Yes')}
                        noLabel={t('registerApplication.fields.no', 'No')}
                      />
                    </Field>
                    <Field label={t('applyForm.fields.matricNo', 'Matric no.')}>
                      <input type="text" name="matric_no" value={formData.matric_no} onChange={handleChange} disabled={!formData.is_former_student} className={inputClass} />
                    </Field>
                  </div>
                </SectionCard>

                <SectionCard title={t('applyForm.sections.prevEducation', 'Previous education')}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field
                      label={t('applyForm.fields.highestEducationLevel', 'Highest education level')}
                      required
                      invalid={invalidFields.includes('highest_education_level')}
                      hint={t('applyForm.hints.educationForLevel', 'Qualifications below the academic level you selected.')}
                    >
                      <select name="highest_education_level" value={formData.highest_education_level} onChange={handleChange} className={inputClass}>
                        <option value="">{t('common.select', 'Please select')}</option>
                        {previousEducationFor(formData.degree_level).map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {t(`applyForm.educationLevels.${lvl}`)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={t('applyForm.fields.certificateName', 'Certificate name')}>
                      {certificateTypeOptions.length > 0 ? (
                        <select name="certificate_type" value={formData.certificate_type} onChange={handleChange} className={inputClass}>
                          <option value="">{t('common.select', 'Please select')}</option>
                          {certificateTypeOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input type="text" name="certificate_type" value={formData.certificate_type} onChange={handleChange} className={inputClass} />
                      )}
                    </Field>
                    <Field label={t('applyForm.fields.institutionName', 'Institution name')}>
                      <input type="text" name="high_school_name" value={formData.high_school_name} onChange={handleChange} className={inputClass} />
                    </Field>
                    <Field label={t('applyForm.fields.graduationYear', 'Year of graduation')} required invalid={invalidFields.includes('graduation_year')}>
                      <input type="number" name="graduation_year" value={formData.graduation_year} onChange={handleChange} min="1950" max="2100" placeholder="YYYY" className={inputClass} />
                    </Field>
                      <Field label={t('applyForm.fields.gpa', 'Grade / GPA')} invalid={invalidFields.includes('gpa')} hint={t('applyForm.hints.gpa', 'On a 4.00 scale')}>
                      <input type="number" name="gpa" value={formData.gpa} onChange={handleChange} min="0" max="4" step="0.01" className={inputClass} />
                    </Field>
                    <Field label={t('applyForm.fields.specialization', 'Specialization')}>
                      <input type="text" name="specialization" value={formData.specialization} onChange={handleChange} className={inputClass} />
                    </Field>
                    <Field label={t('applyForm.fields.languageOfStudy', 'Language of study')}>
                      <select name="language_of_study" value={formData.language_of_study} onChange={handleChange} className={inputClass}>
                        <option value="">{t('common.select', 'Please select')}</option>
                        {STUDY_LANGUAGES.map((lang) => (
                          <option key={lang} value={lang}>
                            {t(`applyForm.languages.${lang}`)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={t('applyForm.fields.educationCountry', 'Country')}>
                      <NationalitySelect
                        name="high_school_country"
                        value={formData.high_school_country}
                        onChange={(code) => setField('high_school_country', code)}
                        placeholder={t('common.select', 'Please select')}
                        className={inputClass}
                      />
                    </Field>
                  </div>
                </SectionCard>

                <SectionCard title={t('applyForm.sections.languageCert', 'Language certificate')}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <Field label={t('applyForm.fields.hasLanguageCertificate', 'Do you have a language certificate?')}>
                      <YesNo
                        name="has_language_certificate"
                        value={formData.has_language_certificate}
                        onChange={setField}
                        yesLabel={t('registerApplication.fields.yes', 'Yes')}
                        noLabel={t('registerApplication.fields.no', 'No')}
                      />
                    </Field>
                    {formData.has_language_certificate && (
                      <>
                        <Field label={t('applyForm.fields.languageCertificateName', 'Certificate name')}>
                          <select name="language_certificate_name" value={formData.language_certificate_name} onChange={handleChange} className={inputClass}>
                            <option value="">{t('common.select', 'Please select')}</option>
                            {LANGUAGE_CERTIFICATES.map((c) => (
                              <option key={c} value={c}>
                                {t(`applyForm.languageCertificates.${c}`)}
                              </option>
                            ))}
                          </select>
                        </Field>
                        {formData.language_certificate_name === 'other' && (
                          <Field label={t('applyForm.fields.languageCertificateOther', 'Please state the certificate name')}>
                            <input type="text" name="language_certificate_other" value={formData.language_certificate_other} onChange={handleChange} className={inputClass} />
                          </Field>
                        )}
                        <Field label={t('applyForm.fields.languageCertificateResult', 'Certificate result')}>
                          <input type="text" name="language_certificate_result" value={formData.language_certificate_result} onChange={handleChange} className={inputClass} />
                        </Field>
                      </>
                    )}
                  </div>
                </SectionCard>
              </div>
            )}

            {currentStep === 3 && (
              <SectionCard>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label={t('applyForm.fields.title', 'Title')}>
                    <select name="title" value={formData.title} onChange={handleChange} className={inputClass}>
                      <option value="">{t('common.select', 'Please select')}</option>
                      {TITLES.map((x) => (
                        <option key={x} value={x}>
                          {t(`applyForm.titles.${x}`)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="hidden md:block" />
                  <Field label={t('applyForm.fields.firstName', 'First name (as in ID)')} required invalid={invalidFields.includes('first_name')}>
                    <input type="text" name="first_name" value={formData.first_name} onChange={handleChange} dir="ltr" className={inputClass} />
                  </Field>
                  <Field label={t('applyForm.fields.lastName', 'Last name (as in ID)')} required invalid={invalidFields.includes('last_name')}>
                    <input type="text" name="last_name" value={formData.last_name} onChange={handleChange} dir="ltr" className={inputClass} />
                  </Field>
                  <Field label={t('applyForm.fields.nameAr', 'Full name in Arabic')} className="md:col-span-2">
                    <input type="text" name="name_ar" value={formData.name_ar} onChange={handleChange} dir="rtl" className={inputClass} />
                  </Field>
                  <Field label={t('applyForm.fields.dateOfBirth', 'Date of birth')} required invalid={invalidFields.includes('date_of_birth')}>
                    <input type="date" name="date_of_birth" value={formData.date_of_birth} onChange={handleChange} className={inputClass} />
                  </Field>
                  <Field label={t('applyForm.fields.gender', 'Gender')}>
                    <Segmented
                      name="gender"
                      value={formData.gender || ''}
                      onChange={(name, v) => setField(name, v)}
                      options={[
                        { v: 'male', label: t('registerApplication.gender.male') },
                        { v: 'female', label: t('registerApplication.gender.female') },
                      ]}
                    />
                  </Field>
                  <Field label={t('applyForm.fields.religion', 'Religion')}>
                    <input type="text" name="religion" value={formData.religion} onChange={handleChange} className={inputClass} />
                  </Field>
                  <Field label={t('applyForm.fields.citizenship', 'Citizenship')} className="md:col-span-2">
                    <NationalitySelect
                      name="nationality"
                      value={formData.nationality}
                      onChange={(code) => setField('nationality', code)}
                      placeholder={t('common.select', 'Please select')}
                      className={inputClass}
                    />
                  </Field>
                </div>
              </SectionCard>
            )}

            {currentStep === 4 && (
              <SectionCard>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label={t('applyForm.fields.idType', 'Identity type')}>
                    <select name="id_type" value={formData.id_type} onChange={handleChange} className={inputClass}>
                      {ID_TYPES.map((x) => (
                        <option key={x} value={x}>
                          {t(`applyForm.idTypes.${x}`)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t('applyForm.fields.idNumber', 'Passport / ID number')}>
                    <input type="text" name="id_number" value={formData.id_number} onChange={handleChange} dir="ltr" className={inputClass} />
                  </Field>
                  <Field label={t('applyForm.fields.idIssueCountry', 'Country of issue')}>
                    <NationalitySelect
                      name="id_issue_country"
                      value={formData.id_issue_country}
                      onChange={(code) => setField('id_issue_country', code)}
                      placeholder={t('common.select', 'Please select')}
                      className={inputClass}
                    />
                  </Field>
                  <div className="hidden md:block" />
                  <Field label={t('applyForm.fields.idIssueDate', 'Date of issue')}>
                    <input type="date" name="id_issue_date" value={formData.id_issue_date} onChange={handleChange} className={inputClass} />
                  </Field>
                  <Field label={t('applyForm.fields.idExpiryDate', 'Expiry date')}>
                    <input type="date" name="id_expiry_date" value={formData.id_expiry_date} onChange={handleChange} className={inputClass} />
                  </Field>
                </div>
              </SectionCard>
            )}

            {currentStep === 5 && (
              <SectionCard>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label={t('applyForm.fields.email', 'Email')} required invalid={invalidFields.includes('email')}>
                    <input type="email" name="email" value={formData.email} onChange={handleChange} disabled={portal} dir="ltr" className={inputClass} />
                  </Field>
                  <Field label={t('applyForm.fields.mobile', 'Mobile number')} required invalid={invalidFields.includes('phone')}>
                    <ApplyPhoneInput value={formData.phone} onChange={(phone) => setField('phone', phone)} />
                  </Field>
                  <Field label={t('applyForm.fields.homePhone', 'Home phone number')}>
                    <input type="tel" name="home_phone" value={formData.home_phone} onChange={handleChange} dir="ltr" className={inputClass} />
                  </Field>
                  <Field label={t('applyForm.fields.country', 'Country')}>
                    <input type="text" name="country" value={formData.country} onChange={handleChange} className={inputClass} />
                  </Field>
                  <Field label={t('applyForm.fields.state', 'State / province')}>
                    <input type="text" name="state_province" value={formData.state_province} onChange={handleChange} className={inputClass} />
                  </Field>
                  <Field label={t('applyForm.fields.city', 'City')}>
                    <input type="text" name="city" value={formData.city} onChange={handleChange} className={inputClass} />
                  </Field>
                  <Field label={t('applyForm.fields.postCode', 'Post code')}>
                    <input type="text" name="postal_code" value={formData.postal_code} onChange={handleChange} className={inputClass} />
                  </Field>
                  <Field label={t('applyForm.fields.address', 'Street address')} className="md:col-span-2">
                    <input type="text" name="street_address" value={formData.street_address} onChange={handleChange} className={inputClass} />
                  </Field>
                </div>
              </SectionCard>
            )}

            {currentStep === 6 && (
              <div className="space-y-5">
                <SectionCard title={t('applyForm.sections.referral', 'How you found us')}>
                  <Field label={t('applyForm.fields.referralSource', 'How did you hear about us?')}>
                    <select name="referral_source" value={formData.referral_source} onChange={handleChange} className={`${inputClass} md:max-w-md`}>
                      <option value="">{t('common.select', 'Please select')}</option>
                      {REFERRAL_SOURCES.map((x) => (
                        <option key={x} value={x}>
                          {t(`applyForm.referralSources.${x}`)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </SectionCard>

                {needsAccount && (
                  <SectionCard title={t('applyForm.account.title', 'Create your applicant account')}>
                    <p className="mb-4 text-sm text-slate-500">
                      {t(
                        'applyForm.account.intro',
                        'Set a password to track this application and receive updates. Use the email you entered in Contact details.',
                      )}
                    </p>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Field label={t('applyForm.fields.accountEmail', 'Account email')}>
                        <input type="email" value={formData.email} disabled dir="ltr" className={inputClass} />
                      </Field>
                      <div className="hidden md:block" />
                      <Field label={t('applyForm.fields.password', 'Password (at least 8 characters)')} required invalid={invalidFields.includes('password')}>
                        <div className="relative">
                          <input
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            autoComplete="new-password"
                            minLength={8}
                            className={`${inputClass} pe-10`}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute inset-y-0 end-0 flex items-center pe-3 text-slate-400 hover:text-slate-700"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </Field>
                      <Field label={t('applyForm.fields.passwordConfirm', 'Confirm password')} required invalid={invalidFields.includes('password_confirm')}>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          name="password_confirm"
                          value={formData.password_confirm}
                          onChange={handleChange}
                          autoComplete="new-password"
                          minLength={8}
                          className={inputClass}
                        />
                      </Field>
                    </div>
                  </SectionCard>
                )}

                <SectionCard title={t('registerApplication.scholarship.title')}>
                  <label className="inline-flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      name="scholarship_request"
                      checked={formData.scholarship_request}
                      onChange={handleChange}
                      className="h-4 w-4 rounded border-slate-300 text-[#1a3a6b] focus:ring-[#1a3a6b]"
                    />
                    <span className="text-sm font-semibold text-slate-700">{t('registerApplication.scholarship.requestLabel')}</span>
                  </label>
                  {formData.scholarship_request && (
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <Field label={t('registerApplication.scholarship.typeLabel')}>
                        <input type="text" name="scholarship_type" value={formData.scholarship_type} onChange={handleChange} className={inputClass} />
                      </Field>
                      <Field label={t('registerApplication.scholarship.detailsLabel')} className="md:col-span-2">
                        <textarea name="scholarship_details" value={formData.scholarship_details} onChange={handleChange} rows={4} className={`${inputClass} resize-none`} />
                      </Field>
                    </div>
                  )}
                </SectionCard>

                <SectionCard title={t('registerApplication.documents.title')}>
                  <p className="mb-4 text-sm text-slate-500">{t('applyForm.documentsIntro', 'ID, certificate, and transcript are required.')}</p>
                  <div className="space-y-2.5">
                    {[...CORE_DOCUMENT_SPECS, ...(formData.scholarship_request ? SCHOLARSHIP_DOCUMENT_SPECS : [])].map(({ key, labelKey, accept }) => {
                      const required = CORE_DOCUMENT_SPECS.some((spec) => spec.key === key)
                      const invalid = invalidFields.includes(`doc:${key}`)
                      return (
                        <div
                          key={key}
                          className={`flex flex-col gap-2 rounded-xl border border-dashed px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between ${
                            invalid ? 'border-rose-400 bg-rose-50 ring-2 ring-rose-300' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <span className={`text-sm font-semibold ${invalid ? 'text-rose-600' : 'text-slate-700'}`}>
                            {required
                              ? t(`registerApplication.documents.${labelKey}`)
                              : t(`registerApplication.fields.${labelKey}`)}
                            {required && <span className="ms-1 text-rose-500">*</span>}
                          </span>
                          <input
                            type="file"
                            accept={accept}
                            required={required}
                            className="text-xs text-slate-500 file:me-2 file:rounded-lg file:border-0 file:bg-[#1a3a6b]/10 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-[#1a3a6b]"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null
                              setDocumentFiles((prev) => ({ ...prev, [key]: file }))
                              if (file) clearInvalid(`doc:${key}`)
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>
                </SectionCard>
              </div>
            )}
          </div>

          <div className="flex items-end justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-5 py-4 sm:px-7">
            <button
              onClick={handleBack}
              disabled={currentStep === 1}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isRTL ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
              <span>{t('registerApplication.navBack')}</span>
            </button>

            <div className="flex min-w-0 flex-col items-end gap-2">
              {error && (
                <div className="flex max-w-md gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

            {currentStep < steps.length ? (
              <button
                onClick={handleNext}
                className="inline-flex items-center gap-2 rounded-xl bg-[#1a3a6b] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#1a3a6b]/20 transition hover:bg-[#152f56]"
              >
                <span>{t('registerApplication.navNext')}</span>
                {isRTL ? <ArrowLeft className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl bg-[#1a3a6b] px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-[#1a3a6b]/20 transition hover:bg-[#152f56] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>{t('registerApplication.navSubmitting')}</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>{t('registerApplication.navSubmit')}</span>
                  </>
                )}
              </button>
            )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
