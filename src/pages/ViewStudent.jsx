import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase, SUPABASE_STORAGE_BUCKET } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { invokeAdminPasswordReset } from '../utils/invokeAdminPasswordReset'
import PasswordResetModal from '../components/admin/PasswordResetModal'
import CreatePortalAccountModal from '../components/admin/CreatePortalAccountModal'
import { getLocalizedName } from '../utils/localizedName'
import { getNationalityLabel } from '../utils/nationalities'
import { getStudentSemesterMilestone, checkFinancePermission, getMilestoneInfo } from '../utils/financePermissions'
import {
  ArrowLeft,
  Edit,
  GraduationCap,
  Building2,
  Mail,
  Phone,
  MapPin,
  User,
  BookOpen,
  Calendar,
  FileText,
  Heart,
  AlertCircle,
  CheckCircle,
  CreditCard,
  Award,
  Stethoscope,
  Paperclip,
  ExternalLink,
  MoreVertical,
  KeyRound,
  UserX,
  UserCheck,
  UserPlus,
} from 'lucide-react'

const TABS = [
  { id: 'overview', labelKey: 'viewStudent.tabs.overview', icon: GraduationCap },
  { id: 'personal', labelKey: 'viewStudent.tabs.personal', icon: User },
  { id: 'contact', labelKey: 'viewStudent.tabs.contact', icon: Mail },
  { id: 'academic', labelKey: 'viewStudent.tabs.academic', icon: BookOpen },
  { id: 'previous', labelKey: 'viewStudent.tabs.previousEducation', icon: Award },
  { id: 'identity', labelKey: 'viewStudent.tabs.identity', icon: FileText },
  { id: 'documents', labelKey: 'viewStudent.tabs.documents', icon: Paperclip },
  { id: 'requests', labelKey: 'viewStudent.tabs.requests', icon: FileText },
  { id: 'payments', labelKey: 'viewStudent.tabs.payments', icon: CreditCard },
  { id: 'emergency', labelKey: 'viewStudent.tabs.emergency', icon: Heart },
  { id: 'other', labelKey: 'viewStudent.tabs.other', icon: Stethoscope },
]

const STUDENT_DOCUMENT_LABELS = {
  id_photo: 'viewStudent.documents.idCardPassport',
  certificate: 'viewStudent.documents.certificate',
  transcript: 'viewStudent.documents.transcript',
  medical_certificate: 'viewStudent.documents.medicalCertificate',
  medication_certificate: 'viewStudent.documents.medicalCertificate',
  recommendation_letter_1: 'viewStudent.documents.recommendationLetter1',
  recommendation_letter_2: 'viewStudent.documents.recommendationLetter2',
  scholarship_letter: 'viewStudent.documents.scholarshipLetter',
  scholarship_financial: 'viewStudent.documents.scholarshipFinancial',
  scholarship_recommendation: 'viewStudent.documents.scholarshipRecommendation',
}

function getInitials(student, isRTL) {
  if (!student) return '?'
  const nameForInitials = isRTL ? (student.name_ar || student.name_en) : (student.name_en || student.name_ar)
  const first = (student.first_name || student.name_en || '').trim().charAt(0)
  const last = (student.last_name || '').trim().charAt(0)
  if (first && last) return `${first}${last}`.toUpperCase()
  const name = (nameForInitials || '').trim()
  if (name.length >= 2) return name.slice(0, 2).toUpperCase()
  return (first || name.charAt(0) || '?').toUpperCase()
}

export default function ViewStudent() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { isRTL } = useLanguage()
  const isArabicLayout = isRTL ||
    i18n?.language?.toLowerCase()?.startsWith('ar') ||
    (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl')
  const [student, setStudent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [enrollmentEligibility, setEnrollmentEligibility] = useState(null)
  const [activeSemester, setActiveSemester] = useState(null)
  const [studentDocuments, setStudentDocuments] = useState([])
  const [studentRequests, setStudentRequests] = useState([])
  const [adminInvoices, setAdminInvoices] = useState([])
  const [adminPayments, setAdminPayments] = useState([])
  const [semesterOptions, setSemesterOptions] = useState([])
  const [selectedSemesterId, setSelectedSemesterId] = useState('')
  const [financeLoading, setFinanceLoading] = useState(false)
  const [genLoading, setGenLoading] = useState(false)
  const [genError, setGenError] = useState('')
  const [genToast, setGenToast] = useState('')
  const { userRole, collegeId } = useAuth()
  const [adminMenuOpen, setAdminMenuOpen] = useState(false)
  const [pwdModalOpen, setPwdModalOpen] = useState(false)
  const [linkPortalModalOpen, setLinkPortalModalOpen] = useState(false)
  const [pwdLoading, setPwdLoading] = useState(false)
  const [pwdError, setPwdError] = useState('')
  const [toast, setToast] = useState('')

  const canManageAccounts = userRole === 'admin' || userRole === 'user'

  useEffect(() => {
    fetchStudent()
    fetchActiveSemester()
  }, [id])

  useEffect(() => {
    if (student?.college_id) fetchSemesterOptions()
  }, [student?.college_id])

  useEffect(() => {
    if (activeSemester?.id && !selectedSemesterId) setSelectedSemesterId(String(activeSemester.id))
  }, [activeSemester?.id, selectedSemesterId])

  useEffect(() => {
    if (activeTab === 'payments' && student?.id) fetchFinanceTabData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, student?.id, selectedSemesterId])

  useEffect(() => {
    if (!id) return
    const fetchDocs = async () => {
      const { data, error } = await supabase
        .from('student_documents')
        .select('id, document_type, file_path, file_name, uploaded_at, expiry_date, status, verified_at')
        .eq('student_id', id)
        .order('uploaded_at', { ascending: false })
      if (!error) setStudentDocuments(data || [])
      else setStudentDocuments([])
    }
    fetchDocs()
  }, [id])

  useEffect(() => {
    if (!id) return
    const fetchRequests = async () => {
      const { data, error } = await supabase
        .from('student_service_requests')
        .select('id, request_number, request_type, status, description, created_at, updated_at')
        .eq('student_id', id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (!error) setStudentRequests(data || [])
      else setStudentRequests([])
    }
    fetchRequests()
  }, [id])

  useEffect(() => {
    if (student && activeSemester) checkEnrollmentEligibility()
  }, [student, activeSemester])

  const fetchActiveSemester = async () => {
    try {
      const { data } = await supabase
        .from('semesters')
        .select('*')
        .in('status', ['active', 'registration_open'])
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      setActiveSemester(data)
    } catch (err) {
      console.error('Error fetching active semester:', err)
    }
  }

  const fetchStudent = async () => {
    try {
      const { data, error: err } = await supabase
        .from('students')
        .select('*, majors(id, name_en, name_ar, code), colleges(id, name_en, name_ar, code)')
        .eq('id', id)
        .single()
      if (err) throw err
      setStudent(data)
    } catch (err) {
      setError(err.message || 'Failed to load student')
    } finally {
      setLoading(false)
    }
  }

  const fetchSemesterOptions = async () => {
    try {
      const { data } = await supabase
        .from('semesters')
        .select('id, name_en, name_ar, code, start_date, status, college_id, is_university_wide')
        .or(`college_id.eq.${student.college_id},is_university_wide.eq.true`)
        .order('start_date', { ascending: false })
        .limit(20)
      setSemesterOptions(data || [])
    } catch (e) {
      console.error('Error fetching semester options:', e)
      setSemesterOptions([])
    }
  }

  const fetchFinanceTabData = async () => {
    if (!student?.id) return
    try {
      setFinanceLoading(true)
      const semId = selectedSemesterId ? parseInt(selectedSemesterId) : null

      let invQuery = supabase
        .from('invoices')
        .select('id, invoice_number, invoice_date, due_date, invoice_type, status, total_amount, paid_amount, pending_amount, semester_id, notes, semesters(id, name_en, name_ar, code)')
        .eq('student_id', student.id)
        .order('invoice_date', { ascending: false })
      if (semId) invQuery = invQuery.eq('semester_id', semId)
      const { data: invData } = await invQuery
      setAdminInvoices(invData || [])

      const { data: payData } = await supabase
        .from('payments')
        .select('id, payment_number, payment_date, payment_method, amount, status, transaction_reference, invoice_id, invoices(invoice_number)')
        .eq('student_id', student.id)
        .order('payment_date', { ascending: false })
        .limit(30)
      setAdminPayments(payData || [])
    } catch (e) {
      console.error('Error fetching finance tab data:', e)
      setAdminInvoices([])
      setAdminPayments([])
    } finally {
      setFinanceLoading(false)
    }
  }

  const computeSemesterTotalDue = async ({ collegeId, majorId, semesterId }) => {
    const num = (v) => {
      const n = typeof v === 'number' ? v : parseFloat(String(v ?? '0'))
      return Number.isFinite(n) ? n : 0
    }

    // IMPORTANT:
    // Semester payments MUST be based on semester-scoped configuration.
    // Major.tuition_fee/lab_fee often represents a whole-program total (not semester),
    // so we only use major catalog as a LAST fallback when no semester configuration exists.

    // 1) finance_configuration totals (semester scoped + major/degree scoped)
    let degreeLevel = null
    if (majorId) {
      const { data: majorRow } = await supabase.from('majors').select('id, degree_level, tuition_fee, lab_fee').eq('id', majorId).maybeSingle()
      degreeLevel = majorRow?.degree_level || null
    }
    const { data: cfg } = await supabase
      .from('finance_configuration')
      .select('id, fee_type, fee_name_en, fee_name_ar, amount, is_university_wide, college_id, semester_id, applies_to_semester, applies_to_major, applies_to_degree_level, is_active, payment_portions')
      .eq('is_active', true)
      .or(`college_id.eq.${collegeId},is_university_wide.eq.true`)

    const matchesArray = (arr, value) => {
      if (!Array.isArray(arr) || arr.length === 0) return true
      if (value == null) return false
      return arr.includes(value)
    }

    const applicable = (cfg || []).filter((row) => {
      const feeType = String(row?.fee_type || '').toLowerCase()
      if (feeType === 'admission_fee' || feeType === 'registration_fee' || feeType === 'application_fee' || feeType === 'wallet_credit') return false
      // only include semester fees for THIS semester (supports single semester_id OR applies_to_semester array)
      const semOk =
        (row?.semester_id != null && Number(row.semester_id) === Number(semesterId)) ||
        (Array.isArray(row?.applies_to_semester) && row.applies_to_semester.includes(Number(semesterId)))
      if (!semOk) return false
      if (!matchesArray(row?.applies_to_major, Number(majorId))) return false
      if (!matchesArray(row?.applies_to_degree_level, degreeLevel)) return false
      return true
    })

    const total = applicable.reduce((acc, row) => acc + num(row?.amount), 0)

    if (total > 0) {
      const withPortions = applicable.find((r) => Array.isArray(r?.payment_portions) && r.payment_portions.length > 0) || null
      return { total, source: 'finance_configuration', items: applicable, portionsSource: withPortions }
    }

    // 2) Last fallback: major catalog (legacy). This may be whole-program total; use only if there is no semester config.
    let catalogTotal = 0
    if (majorId) {
      const { data: majorRow } = await supabase.from('majors').select('id, tuition_fee, lab_fee').eq('id', majorId).maybeSingle()
      catalogTotal = num(majorRow?.tuition_fee) + num(majorRow?.lab_fee)
    }
    return { total: catalogTotal, source: 'major_catalog_fallback' }
  }

  const generateSemesterInvoice = async () => {
    if (!student?.id) return
    setGenError('')
    setGenToast('')
    try {
      setGenLoading(true)
      const semesterId = selectedSemesterId ? parseInt(selectedSemesterId) : null
      if (!semesterId) {
        setGenError(t('viewStudent.payments.pickSemester', 'Please select a semester.'))
        return
      }

      // Avoid duplicates: if any non-admission invoice exists for this semester, do nothing
      const { data: existing } = await supabase
        .from('invoices')
        .select('id, invoice_number')
        .eq('student_id', student.id)
        .eq('semester_id', semesterId)
        .neq('invoice_type', 'admission_fee')
        .order('invoice_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (existing?.id) {
        setGenToast(t('viewStudent.payments.invoiceAlreadyExists', { defaultValue: 'Invoice already exists for this semester.' }))
        return
      }

      const { total, source, items, portionsSource } = await computeSemesterTotalDue({
        collegeId: student.college_id,
        majorId: student.major_id,
        semesterId,
      })

      if (!total || total <= 0) {
        setGenError(
          t('viewStudent.payments.noFeeConfig', {
            defaultValue: 'Could not compute semester fees. Set major tuition/lab fee or finance configuration for this semester.',
          }),
        )
        return
      }

      const invoiceDate = new Date().toISOString().split('T')[0]
      const calcDue = (portion, invDate, prevDate = null) => {
        if (portion?.deadline_type === 'custom_date') return portion.custom_date
        const days = parseInt(portion?.days || 0)
        if (portion?.deadline_type === 'days_from_previous' && prevDate) {
          const d = new Date(prevDate)
          d.setDate(d.getDate() + days)
          return d.toISOString().split('T')[0]
        }
        const d = new Date(invDate)
        d.setDate(d.getDate() + days)
        return d.toISOString().split('T')[0]
      }

      const portions = Array.isArray(portionsSource?.payment_portions) ? portionsSource.payment_portions.slice() : []
      const hasPortions = portions.length > 0

      // Parent invoice number
      const { data: parentNum, error: parentNumErr } = await supabase.rpc('generate_invoice_number', { college_id_param: student.college_id })
      if (parentNumErr) throw parentNumErr

      // Create parent invoice (summary)
      const { data: parent, error: parentErr } = await supabase
        .from('invoices')
        .insert({
          invoice_number: parentNum,
          student_id: student.id,
          college_id: student.college_id,
          invoice_date: invoiceDate,
          due_date: invoiceDate,
          invoice_type: 'course_fee',
          status: 'pending',
          subtotal: total,
          discount_amount: 0,
          scholarship_amount: 0,
          tax_amount: 0,
          total_amount: total,
          paid_amount: 0,
          pending_amount: total,
          payment_method: 'online_payment',
          notes: `Auto-generated semester fees (${source})`,
          semester_id: semesterId,
          fee_structure_id: portionsSource?.id || null,
        })
        .select()
        .single()
      if (parentErr) throw parentErr

      // If portions exist, create child invoices per portion; otherwise create a single payable child = 100%
      const portionsToCreate = hasPortions
        ? portions.sort((a, b) => (a.portion_number || 0) - (b.portion_number || 0))
        : [{ portion_number: 1, percentage: 100, deadline_type: 'days_from_invoice', days: 0 }]

      let previousDue = invoiceDate
      for (const portion of portionsToCreate) {
        const pct = parseFloat(portion?.percentage || 0)
        const portionAmount = (total * pct) / 100
        const dueDate = calcDue(portion, invoiceDate, previousDue)

        const { data: childNum, error: childNumErr } = await supabase.rpc('generate_invoice_number', { college_id_param: student.college_id })
        if (childNumErr) throw childNumErr

        const { data: child, error: childErr } = await supabase
          .from('invoices')
          .insert({
            invoice_number: childNum,
            student_id: student.id,
            college_id: student.college_id,
            invoice_date: invoiceDate,
            due_date: dueDate,
            invoice_type: 'course_fee',
            status: 'pending',
            subtotal: portionAmount,
            discount_amount: 0,
            scholarship_amount: 0,
            tax_amount: 0,
            total_amount: portionAmount,
            paid_amount: 0,
            pending_amount: portionAmount,
            payment_method: 'online_payment',
            notes: `Portion ${portion?.portion_number || 1} (${pct}%) - Auto-generated semester fees`,
            semester_id: semesterId,
            parent_invoice_id: parent.id,
            fee_structure_id: portionsSource?.id || null,
            portion_number: portion?.portion_number || 1,
            portion_percentage: pct,
          })
          .select('id')
          .single()
        if (childErr) throw childErr

        // Create invoice items proportionally for this portion
        const lines = (items || []).map((row) => {
          const amt = parseFloat(row?.amount || 0) || 0
          const lineTotal = (amt * pct) / 100
          return {
            invoice_id: child.id,
            item_type: String(row?.fee_type || 'other'),
            item_name_en: row?.fee_name_en || 'Fee',
            item_name_ar: row?.fee_name_ar || null,
            description: `Portion ${portion?.portion_number || 1} (${pct}%)`,
            quantity: 1,
            unit_price: lineTotal,
            discount_amount: 0,
            scholarship_amount: 0,
            total_amount: lineTotal,
            reference_id: row?.id || null,
            reference_type: 'finance_configuration',
          }
        })
        if (lines.length > 0) {
          const { error: itemsErr } = await supabase.from('invoice_items').insert(lines)
          if (itemsErr) throw itemsErr
        }

        previousDue = dueDate
      }

      setGenToast(t('viewStudent.payments.invoiceGenerated', { defaultValue: 'Invoice generated successfully.' }))
      await fetchFinanceTabData()
      setTimeout(() => setGenToast(''), 4000)
    } catch (e) {
      console.error('generateSemesterInvoice error:', e)
      setGenError(e?.message || String(e))
    } finally {
      setGenLoading(false)
    }
  }

  const setStudentStatus = async (status) => {
    setToast('')
    const { error: updErr } = await supabase.from('students').update({ status }).eq('id', id)
    if (updErr) {
      setToast(updErr.message)
      return
    }
    setToast(status === 'inactive' ? t('adminAccount.deactivateSuccess') : t('adminAccount.reactivateSuccess'))
    setAdminMenuOpen(false)
    await fetchStudent()
    setTimeout(() => setToast(''), 4000)
  }

  const submitPasswordReset = async (password) => {
    setPwdLoading(true)
    setPwdError('')
    try {
      await invokeAdminPasswordReset({ studentId: id, newPassword: password })
      setPwdModalOpen(false)
      setAdminMenuOpen(false)
      setToast(t('adminAccount.passwordResetSuccess'))
      setTimeout(() => setToast(''), 4000)
    } catch (e) {
      const msg = e?.message || String(e)
      if (msg.includes('Failed to fetch') || msg.includes('Function not found')) {
        setPwdError(t('adminAccount.functionNotDeployed'))
      } else {
        setPwdError(msg)
      }
    } finally {
      setPwdLoading(false)
    }
  }

  const translateFinanceReason = (reason) => {
    if (!reason) return ''
    const r = String(reason).toLowerCase()
    if (r.includes('at least 30% payment') || r.includes('30% payment is required')) {
      return t('viewStudent.financeReasonMin30')
    }
    return reason
  }

  const translateStudentStatusValue = (value) => {
    if (value == null || value === '') return t('common.unknown')
    const n = String(value).toLowerCase().replace(/\s+/g, '_')
    const map = {
      active: t('common.active'),
      inactive: t('common.inactive'),
      pending: t('common.pending'),
      graduated: t('viewStudent.statusGraduated'),
      suspended: t('viewStudent.statusSuspended'),
      withdrawn: t('viewStudent.statusWithdrawn'),
    }
    return map[n] || String(value)
  }

  const checkEnrollmentEligibility = async () => {
    if (!student || !activeSemester) return
    const eligibility = { allowed: true, reasons: [], warnings: [], financialMilestone: null, financialHold: null, outstandingInvoices: [], totalOutstanding: 0 }
    try {
      if (student.status !== 'active') {
        eligibility.allowed = false
        eligibility.reasons.push(
          t('viewStudent.eligibilityInactiveStudent', {
            status: translateStudentStatusValue(student.status),
          })
        )
      }
      const { milestone, hold } = await getStudentSemesterMilestone(parseInt(id), activeSemester.id)
      eligibility.financialMilestone = milestone
      eligibility.financialHold = hold
      const financeCheck = checkFinancePermission('SE_REG', milestone, hold)
      if (!financeCheck.allowed) {
        eligibility.allowed = false
        eligibility.reasons.push(`${t('viewStudent.financial')}: ${translateFinanceReason(financeCheck.reason)}`)
      }
      const { data: invoices } = await supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, paid_amount, pending_amount, status, due_date')
        .eq('student_id', parseInt(id))
        .eq('semester_id', activeSemester.id)
        .in('status', ['pending', 'overdue', 'partially_paid'])
      if (invoices?.length > 0) {
        eligibility.outstandingInvoices = invoices
        eligibility.totalOutstanding = invoices.reduce((sum, inv) => sum + parseFloat(inv.pending_amount || 0), 0)
        if (eligibility.totalOutstanding > 0) {
          const milestoneInfo = getMilestoneInfo(milestone)
          if (milestoneInfo.percentage < 30) {
            eligibility.warnings.push(
              `${t('viewStudent.outstandingBalance')}: ${eligibility.totalOutstanding.toFixed(2)}. ${t('viewStudent.min30Required')}`
            )
          }
        }
      }
      if (hold === 'FHCH') {
        eligibility.allowed = false
        eligibility.reasons.push(t('viewStudent.eligibilityChargeback'))
      } else if (hold === 'FHEX') {
        eligibility.allowed = false
        eligibility.reasons.push(t('viewStudent.eligibilityDeadlineExceeded'))
      }
      setEnrollmentEligibility(eligibility)
    } catch {
      eligibility.allowed = false
      eligibility.reasons.push(t('viewStudent.eligibilityCheckError'))
      setEnrollmentEligibility(eligibility)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  if (error && !student) {
    return (
      <div className="space-y-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-5 h-5" /> <span>{t('common.back')}</span>
        </button>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700">{error}</div>
      </div>
    )
  }

  const collegeName = getLocalizedName(student?.colleges, isRTL) || student?.colleges?.name_en || 'N/A'
  const majorName = getLocalizedName(student?.majors, isRTL) || student?.majors?.name_en || 'N/A'
  const displayNameEn = [student?.first_name, student?.middle_name, student?.last_name].filter(Boolean).join(' ') || student?.name_en || '—'
  const displayNameAr = [student?.first_name_ar, student?.middle_name_ar, student?.last_name_ar].filter(Boolean).join(' ') || student?.name_ar || ''
  const primaryDisplayName = getLocalizedName(student, isRTL) || (isRTL ? (displayNameAr || displayNameEn) : (displayNameEn || displayNameAr)) || '—'
  const secondaryDisplayName = isRTL ? (displayNameEn || null) : (displayNameAr || null)
  const canManageThisStudent =
    canManageAccounts &&
    (userRole === 'admin' ||
      (collegeId != null &&
        student?.college_id != null &&
        String(student.college_id) === String(collegeId)))
  const translateStudyType = (value) => {
    if (!value || value === '—') return '—'
    const normalized = String(value).toLowerCase().replace(/\s+/g, '_')
    const map = {
      full_time: t('viewStudent.studyTypeFullTime'),
      part_time: t('viewStudent.studyTypePartTime'),
      distance: t('viewStudent.studyTypeDistance'),
      online: t('viewStudent.studyTypeOnline'),
      normal: t('viewStudent.studyTypeNormal'),
      on_campus: t('viewStudent.studyApproachOnCampus'),
    }
    return map[normalized] || String(value).replace(/_/g, ' ')
  }

  const translateStudyApproach = (value) => {
    if (!value || value === '—') return '—'
    const n = String(value).toLowerCase().replace(/\s+/g, '_')
    const map = {
      normal: t('viewStudent.studyApproachNormal'),
      on_campus: t('viewStudent.studyApproachOnCampus'),
      oncampus: t('viewStudent.studyApproachOnCampus'),
      online: t('viewStudent.studyApproachOnline'),
      distance: t('viewStudent.studyApproachDistance'),
      hybrid: t('viewStudent.studyApproachHybrid'),
    }
    return map[n] || String(value).replace(/_/g, ' ')
  }

  const translateStudyLoad = (value) => {
    if (!value || value === '—') return '—'
    const n = String(value).toLowerCase().replace(/\s+/g, '_')
    const map = {
      normal: t('viewStudent.studyLoadNormal'),
      light: t('viewStudent.studyLoadLight'),
      heavy: t('viewStudent.studyLoadHeavy'),
    }
    return map[n] || String(value).replace(/_/g, ' ')
  }

  return (
    <div className="space-y-0">
      {/* Back + Edit */}
      <div className={`flex items-center justify-between mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-5 h-5" /> <span>{t('common.back')}</span>
        </button>
        <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
          {canManageThisStudent && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAdminMenuOpen((v) => !v)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50"
                title={t('instructors.moreActions')}
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {adminMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setAdminMenuOpen(false)} />
                  <div
                    className={`absolute top-full mt-1 z-20 w-56 rounded-xl border border-gray-200 bg-white py-1 shadow-lg ${
                      isArabicLayout ? 'left-0' : 'right-0'
                    }`}
                  >
                    {student?.status !== 'inactive' && (
                      <>
                        {student?.user_id ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPwdModalOpen(true)
                              setPwdError('')
                              setAdminMenuOpen(false)
                            }}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 ${
                              isArabicLayout ? 'flex-row-reverse' : ''
                            }`}
                          >
                            <KeyRound className="h-4 w-4 shrink-0" />
                            {t('students.resetPassword')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (!student?.email?.trim()) {
                                setToast(`ERR::${t('adminAccount.noEmailForAccount')}`)
                                setAdminMenuOpen(false)
                                setTimeout(() => setToast(''), 6000)
                                return
                              }
                              setLinkPortalModalOpen(true)
                              setAdminMenuOpen(false)
                            }}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 ${
                              isArabicLayout ? 'flex-row-reverse' : ''
                            }`}
                          >
                            <UserPlus className="h-4 w-4 shrink-0" />
                            {t('students.createPortalLogin')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(t('students.confirmDeactivate'))) {
                              setStudentStatus('inactive')
                            }
                            setAdminMenuOpen(false)
                          }}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-amber-800 hover:bg-amber-50 ${
                            isArabicLayout ? 'flex-row-reverse' : ''
                          }`}
                        >
                          <UserX className="h-4 w-4 shrink-0" />
                          {t('students.deactivate')}
                        </button>
                      </>
                    )}
                    {student?.status === 'inactive' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(t('students.confirmReactivate'))) {
                            setStudentStatus('active')
                          }
                          setAdminMenuOpen(false)
                        }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-50 ${
                          isArabicLayout ? 'flex-row-reverse' : ''
                        }`}
                      >
                        <UserCheck className="h-4 w-4 shrink-0" />
                        {t('students.reactivate')}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          <button
            onClick={() => navigate(`/students/${id}/edit`)}
            className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-xl hover:bg-primary-700 shadow-md"
          >
            <Edit className="w-4 h-4" /> <span>{t('common.edit')}</span>
          </button>
        </div>
      </div>

      {toast && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            toast.startsWith('ERR::')
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {toast.startsWith('ERR::') ? toast.slice(5) : toast}
        </div>
      )}

      {/* Profile header: compact avatar + name + major (no banner) */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-6">
        <div
          dir={isArabicLayout ? 'rtl' : 'ltr'}
          className="flex flex-col sm:flex-row sm:items-center gap-4"
        >
          <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-xl font-bold text-white shadow-md flex-shrink-0">
            {getInitials(student, isRTL)}
          </div>
          <div className={`min-w-0 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
            {secondaryDisplayName && (
              <p className={`text-base text-gray-600 ${isArabicLayout ? 'font-arabic' : ''}`}>{secondaryDisplayName}</p>
            )}
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mt-0.5">{primaryDisplayName}</h1>
            <p className="mt-1 text-primary-600 font-medium border-b-2 border-amber-400 pb-0.5 inline-block">
              {majorName}
            </p>
          </div>
        </div>
      </div>

      {/* Contact & affiliation card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl mx-auto">
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-gray-700">
                <Building2 className="w-5 h-5 text-primary-500 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">{t('viewStudent.college')}</p>
                  <p className="font-medium">{collegeName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-gray-700">
                <Mail className="w-5 h-5 text-primary-500 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">{t('viewStudent.email')}</p>
                  <p className="font-medium break-all">{student?.email || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-gray-700">
                <MapPin className="w-5 h-5 text-primary-500 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">{t('viewStudent.address')}</p>
                  <p className="font-medium">{student?.address || student?.city || '—'}</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-gray-700">
                <BookOpen className="w-5 h-5 text-primary-500 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">{t('viewStudent.major')}</p>
                  <p className="font-medium">{majorName}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-gray-700">
                <Phone className="w-5 h-5 text-primary-500 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">{t('viewStudent.phone')}</p>
                  <p className="font-medium">{student?.phone || student?.mobile_phone || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-gray-700">
                <Calendar className="w-5 h-5 text-primary-500 flex-shrink-0" />
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">{t('viewStudent.enrollmentDate')}</p>
                  <p className="font-medium">{student?.enrollment_date || '—'}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm text-gray-500">{t('viewStudent.studentId')}: <strong className="text-gray-800">{student?.student_id || '—'}</strong></span>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${student?.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
              {student?.status === 'active' ? t('common.active') : (student?.status || '—')}
            </span>
          </div>
        </div>

        {/* Spacer / divider between contact card and tabs */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4">{t('viewStudent.tabsLabel', 'Profile sections')}</p>
        </div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-1 border-b border-gray-200 overflow-x-auto">
          {TABS.map((tab) => {
            const TabIcon = tab.icon
            return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <TabIcon className="w-4 h-4" />
              {t(tab.labelKey)}
            </button>
          )})}
        </div>

        {/* Tab content */}
        <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          {activeTab === 'overview' && (
            <>
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-1 h-6 bg-amber-400 rounded-full" />
                {t('viewStudent.academicOverview')}
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <div className="bg-primary-100 text-primary-800 rounded-lg px-3 py-2.5 text-center border border-primary-200">
                  <p className="text-base font-semibold">{student?.gpa != null ? Number(student.gpa).toFixed(2) : (student?.high_school_gpa != null ? Number(student.high_school_gpa).toFixed(2) : '—')}</p>
                  <p className="text-xs text-primary-600 mt-0.5">{t('viewStudent.gpa')}</p>
                </div>
                <div className="bg-primary-100 text-primary-800 rounded-lg px-3 py-2.5 text-center border border-primary-200">
                  <p className="text-base font-semibold">{student?.total_credits_earned ?? student?.credit_hours ?? '—'}</p>
                  <p className="text-xs text-primary-600 mt-0.5">{t('viewStudent.credits')}</p>
                </div>
                <div className="bg-amber-50 text-amber-900 rounded-lg px-3 py-2.5 text-center border border-amber-200">
                  <p className="text-base font-semibold">{translateStudyType(student?.study_type)}</p>
                  <p className="text-xs text-amber-700 mt-0.5">{t('viewStudent.studyType')}</p>
                </div>
                <div className="bg-primary-100 text-primary-800 rounded-lg px-3 py-2.5 text-center border border-primary-200">
                  <p className="text-base font-semibold">{student?.enrollment_date || '—'}</p>
                  <p className="text-xs text-primary-600 mt-0.5">{t('viewStudent.enrolled')}</p>
                </div>
              </div>
              {enrollmentEligibility != null && (
                <div className={`rounded-xl p-4 ${enrollmentEligibility.allowed ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                  <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    {enrollmentEligibility.allowed ? <CheckCircle className="w-5 h-5 text-green-600" /> : <AlertCircle className="w-5 h-5 text-amber-600" />}
                    {t('viewStudent.enrollmentEligibility')}
                  </h3>
                  {!enrollmentEligibility.allowed && enrollmentEligibility.reasons?.length > 0 && (
                    <ul className="text-sm text-amber-800 list-disc list-inside space-y-1">
                      {enrollmentEligibility.reasons.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  )}
                  {enrollmentEligibility.warnings?.length > 0 && (
                    <ul className="text-sm text-amber-700 mt-2 list-disc list-inside">
                      {enrollmentEligibility.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                  {enrollmentEligibility.allowed && enrollmentEligibility.reasons?.length === 0 && (
                    <p className="text-sm text-green-800">{t('viewStudent.eligibleToEnroll')}</p>
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'personal' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                ['firstName', (isRTL ? [student?.first_name_ar, student?.first_name] : [student?.first_name, student?.first_name_ar]).filter(Boolean).join(' / ') || '—'],
                ['lastName', (isRTL ? [student?.last_name_ar, student?.last_name] : [student?.last_name, student?.last_name_ar]).filter(Boolean).join(' / ') || '—'],
                ['dateOfBirth', student?.date_of_birth || '—'],
                ['gender', student?.gender || '—'],
                ['nationality', getNationalityLabel(student?.nationality, isRTL) || '—'],
                ['religion', student?.religion || '—'],
                ['maritalStatus', student?.marital_status || '—'],
                ['bloodType', student?.blood_type || '—'],
                ['international', student?.is_international ? t('common.yes') : t('common.no')],
              ].map(([key, value]) => (
                <div key={key} className="rounded-xl bg-gray-50 p-4 border border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase">{t(`viewStudent.${key}`)}</p>
                  <p className="mt-1 font-medium text-gray-900">{value}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'contact' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                ['email', student?.email],
                ['phone', student?.phone],
                ['mobilePhone', student?.mobile_phone],
                ['address', student?.address],
                ['city', student?.city],
                ['state', student?.state],
                ['country', student?.country],
                ['postalCode', student?.postal_code],
              ].map(([key, value]) => (
                <div key={key} className="rounded-xl bg-gray-50 p-4 border border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase">{t(`viewStudent.${key}`)}</p>
                  <p className="mt-1 font-medium text-gray-900">{value || '—'}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'academic' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                ['major', majorName],
                ['college', collegeName],
                ['studyType', translateStudyType(student?.study_type)],
                ['studyLoad', translateStudyLoad(student?.study_load || '—')],
                ['studyApproach', translateStudyApproach(student?.study_approach || '—')],
                ['creditHours', student?.credit_hours ?? '—'],
                ['enrollmentDate', student?.enrollment_date],
                ['status', translateStudentStatusValue(student?.status)],
              ].map(([key, value]) => (
                <div key={key} className="rounded-xl bg-gray-50 p-4 border border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase">{t(`viewStudent.${key}`)}</p>
                  <p className="mt-1 font-medium text-gray-900">{value || '—'}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'previous' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                ['highSchoolName', student?.high_school_name],
                ['highSchoolCountry', student?.high_school_country],
                ['graduationYear', student?.graduation_year],
                ['highSchoolGpa', student?.high_school_gpa != null ? Number(student.high_school_gpa).toFixed(2) : null],
              ].map(([key, value]) => (
                <div key={key} className="rounded-xl bg-gray-50 p-4 border border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase">{t(`viewStudent.${key}`)}</p>
                  <p className="mt-1 font-medium text-gray-900">{value ?? '—'}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'identity' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                ['nationalId', student?.national_id],
                ['passportNumber', student?.passport_number],
                ['passportExpiry', student?.passport_expiry],
                ['visaNumber', student?.visa_number],
                ['visaExpiry', student?.visa_expiry],
                ['residencePermitNumber', student?.residence_permit_number],
                ['residencePermitExpiry', student?.residence_permit_expiry],
              ].map(([key, value]) => (
                <div key={key} className="rounded-xl bg-gray-50 p-4 border border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase">{t(`viewStudent.${key}`)}</p>
                  <p className="mt-1 font-medium text-gray-900">{value || '—'}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                {t('viewStudent.documentsIntro', 'Documents submitted with the application (ID photo, transcript, etc.) are listed below.')}
              </p>
              {studentDocuments.length === 0 ? (
                <p className="text-gray-500 italic">{t('viewStudent.noDocuments', 'No documents on file.')}</p>
              ) : (
                <ul className="space-y-3">
                  {studentDocuments.map((doc) => {
                    const { data: urlData } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(doc.file_path)
                    const label = STUDENT_DOCUMENT_LABELS[doc.document_type]
                    const expired = doc.expiry_date ? new Date(doc.expiry_date) < new Date(new Date().toDateString()) : false
                    const status = expired ? 'expired' : (doc.status || (doc.verified_at ? 'verified' : 'in_review'))
                    const badge =
                      status === 'verified'
                        ? { bg: 'bg-emerald-50', text: 'text-emerald-700', label: t('common.verified', 'Verified') }
                        : status === 'expired'
                          ? { bg: 'bg-red-50', text: 'text-red-700', label: t('common.expired', 'Expired') }
                          : { bg: 'bg-blue-50', text: 'text-blue-700', label: t('common.inReview', 'In review') }
                  return (
                    <li key={doc.id} className="flex items-center justify-between rounded-xl bg-gray-50 p-4 border border-gray-100">
                      <div className="flex items-center gap-3">
                        <FileText className="w-5 h-5 text-gray-500 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-gray-900">{t(label || doc.document_type)}</p>
                          {doc.file_name && <p className="text-sm text-gray-500">{doc.file_name}</p>}
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${badge.bg} ${badge.text}`}>
                              {badge.label}
                            </span>
                            {doc.expiry_date && (
                              <span className="text-[11px] text-gray-400">
                                {t('viewStudent.documentsExpiry', 'Expiry')}: {new Date(doc.expiry_date).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {doc.uploaded_at && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(doc.uploaded_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      </div>
                      <a
                        href={urlData?.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-primary-600 hover:text-primary-700 font-medium text-sm"
                      >
                        <ExternalLink className="w-4 h-4" />
                        {t('viewStudent.viewDocument', 'View / Download')}
                      </a>
                    </li>
                  )
                  })}
                </ul>
              )}
            </div>
          )}

          {activeTab === 'requests' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                {t('viewStudent.requestsIntro', 'Student service requests created from the student portal are listed below.')}
              </p>
              {studentRequests.length === 0 ? (
                <p className="text-gray-500 italic">{t('viewStudent.noRequests', 'No requests on file.')}</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr className="text-gray-600">
                        <th className="px-4 py-3 text-left">{t('viewStudent.requests.number', 'Request #')}</th>
                        <th className="px-4 py-3 text-left">{t('viewStudent.requests.type', 'Type')}</th>
                        <th className="px-4 py-3 text-left">{t('common.date', 'Date')}</th>
                        <th className="px-4 py-3 text-left">{t('common.status', 'Status')}</th>
                        <th className="px-4 py-3 text-left">{t('common.notes', 'Notes')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentRequests.map((r) => (
                        <tr key={r.id} className="border-t border-gray-100">
                          <td className="px-4 py-3 font-semibold" dir="ltr">{r.request_number}</td>
                          <td className="px-4 py-3">{r.request_type}</td>
                          <td className="px-4 py-3" dir="ltr">{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                          <td className="px-4 py-3">{r.status || '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{r.description || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'payments' && (
            <div className="space-y-6">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-primary-600" />
                    {t('viewStudent.payments.title', 'Payments')}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {t('viewStudent.payments.subtitle', 'Generate invoices for semester/major fees and review payments.')}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                    value={selectedSemesterId}
                    onChange={(e) => setSelectedSemesterId(e.target.value)}
                  >
                    <option value="">{t('viewStudent.payments.selectSemester', 'Select semester')}</option>
                    {semesterOptions.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {(isRTL ? s.name_ar : s.name_en) || s.code || `#${s.id}`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={generateSemesterInvoice}
                    disabled={genLoading || !selectedSemesterId}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${
                      genLoading || !selectedSemesterId
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-primary-600 text-white hover:bg-primary-700'
                    }`}
                  >
                    {genLoading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                        {t('viewStudent.payments.generating', 'Generating...')}
                      </>
                    ) : (
                      <>
                        <FileText className="w-4 h-4" />
                        {t('viewStudent.payments.generateInvoice', 'Generate semester invoice')}
                      </>
                    )}
                  </button>
                </div>
              </div>

              {genError && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-800">{genError}</div>}
              {genToast && <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">{genToast}</div>}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Invoices */}
                <div className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">{t('viewStudent.payments.invoices', 'Invoices')}</h3>
                    {financeLoading && <span className="text-xs text-gray-500">{t('common.loading', 'Loading...')}</span>}
                  </div>
                  {adminInvoices.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('viewStudent.payments.noInvoices', 'No invoices found for this semester.')}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 text-gray-600">
                            <th className="text-left py-2 pr-2">{t('viewStudent.payments.invoiceNumber', 'Invoice')}</th>
                            <th className="text-left py-2 pr-2">{t('common.status', 'Status')}</th>
                            <th className="text-left py-2 pr-2">{t('viewStudent.payments.total', 'Total')}</th>
                            <th className="text-left py-2 pr-2">{t('viewStudent.payments.pending', 'Pending')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {adminInvoices.map((inv) => (
                            <tr key={inv.id} className="border-b border-gray-100">
                              <td className="py-2 pr-2 font-mono text-xs">{inv.invoice_number}</td>
                              <td className="py-2 pr-2">
                                <span className="text-xs px-2 py-1 rounded border bg-gray-50 text-gray-700 border-gray-200">
                                  {String(inv.status || '').replace('_', ' ').toUpperCase()}
                                </span>
                              </td>
                              <td className="py-2 pr-2 font-semibold">{Number(inv.total_amount || 0).toFixed(2)}</td>
                              <td className="py-2 pr-2 text-amber-700 font-semibold">{Number(inv.pending_amount || 0).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Payments */}
                <div className="rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">{t('viewStudent.payments.paymentHistory', 'Payment history')}</h3>
                    {financeLoading && <span className="text-xs text-gray-500">{t('common.loading', 'Loading...')}</span>}
                  </div>
                  {adminPayments.length === 0 ? (
                    <p className="text-sm text-gray-500">{t('viewStudent.payments.noPayments', 'No payments yet.')}</p>
                  ) : (
                    <div className="space-y-3">
                      {adminPayments.map((p) => (
                        <div key={p.id} className="border border-gray-200 rounded-lg p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-green-600" />
                                <span className="font-mono text-xs font-semibold text-gray-900">{p.payment_number}</span>
                                <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                                  {String(p.status || '').toUpperCase()}
                                </span>
                              </div>
                              <div className="text-xs text-gray-600 mt-1">
                                {p.payment_date} • {String(p.payment_method || '').replace('_', ' ')} • {p.invoices?.invoice_number || '—'}
                              </div>
                              {p.transaction_reference && <div className="text-xs text-gray-500 mt-1">Ref: {p.transaction_reference}</div>}
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-bold text-green-700">{Number(p.amount || 0).toFixed(2)}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
                {t(
                  'viewStudent.payments.note',
                  'Note: These invoices form the base for PM10/PM30 milestones (admission_fee invoices are excluded). Once generated, the student can pay from Student Portal → Invoices & fees.'
                )}
              </div>
            </div>
          )}

          {activeTab === 'emergency' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                ['emergencyContactName', student?.emergency_contact_name],
                ['emergencyContactRelation', student?.emergency_contact_relation],
                ['emergencyPhone', student?.emergency_phone],
                ['emergencyContactEmail', student?.emergency_contact_email],
              ].map(([key, value]) => (
                <div key={key} className="rounded-xl bg-gray-50 p-4 border border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase">{t(`viewStudent.${key}`)}</p>
                  <p className="mt-1 font-medium text-gray-900">{value || '—'}</p>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'other' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase mb-2">{t('viewStudent.scholarship')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500 uppercase">{t('viewStudent.hasScholarship')}</p><p className="font-medium">{student?.has_scholarship ? t('common.yes') : t('common.no')}</p></div>
                  <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500 uppercase">{t('viewStudent.type')}</p><p className="font-medium">{student?.scholarship_type || '—'}</p></div>
                  <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500 uppercase">{t('viewStudent.percentage')}</p><p className="font-medium">{student?.scholarship_percentage != null ? `${student.scholarship_percentage}%` : '—'}</p></div>
                </div>
                {student?.scholarship_details && (
                  <div className="rounded-xl bg-gray-50 p-4 border border-gray-100">
                    <p className="text-xs font-medium text-gray-500 uppercase">{t('viewStudent.scholarshipDetails')}</p>
                    <p className="mt-2 text-gray-900 whitespace-pre-wrap">{student.scholarship_details}</p>
                  </div>
                )}
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-500 uppercase mb-2">{t('viewStudent.medical')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500 uppercase">{t('viewStudent.conditions')}</p><p className="font-medium">{student?.medical_conditions || '—'}</p></div>
                  <div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500 uppercase">{t('viewStudent.allergies')}</p><p className="font-medium">{student?.allergies || '—'}</p></div>
                  <div className="rounded-xl bg-gray-50 p-4 sm:col-span-2"><p className="text-xs text-gray-500 uppercase">{t('viewStudent.medications')}</p><p className="font-medium">{student?.medications || '—'}</p></div>
                </div>
              </div>
              {student?.notes && (
                <div className="rounded-xl bg-gray-50 p-4 border border-gray-100">
                  <p className="text-xs font-medium text-gray-500 uppercase">{t('viewStudent.notes')}</p>
                  <p className="mt-2 text-gray-900 whitespace-pre-wrap">{student.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>

      <div className="mt-8 text-center">
        <button onClick={() => navigate('/students')} className="text-primary-600 hover:text-primary-700 font-medium inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> {t('viewStudent.backToList')}
        </button>
      </div>

      <PasswordResetModal
        open={pwdModalOpen}
        onClose={() => {
          setPwdModalOpen(false)
          setPwdError('')
        }}
        onSubmit={submitPasswordReset}
        loading={pwdLoading}
        error={pwdError}
      />

      <CreatePortalAccountModal
        open={linkPortalModalOpen}
        onClose={() => setLinkPortalModalOpen(false)}
        kind="student"
        recordId={id}
        email={student?.email}
        collegeId={student?.college_id}
        displayName={primaryDisplayName}
        onLinked={() => {
          setToast(t('adminAccount.createPortalAccountSuccess'))
          setLinkPortalModalOpen(false)
          fetchStudent()
          setTimeout(() => setToast(''), 4000)
        }}
      />
    </div>
  )
}
