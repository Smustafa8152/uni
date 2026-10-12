import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
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
import { getCurrencyCodeFromFinancialSettings } from '../utils/getCollegeSettings'
import { finalGradePoints, isFinishedSemester } from '../utils/registrationRules'
import { getApplicantStatus } from '../utils/applicationStatusDisplay'
import { Badge, Button, ConfirmDialog, EmptyState, Panel, Skeleton, toast as showToast } from '../components/ui'
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CheckCircle,
  ChevronRight,
  Copy,
  CreditCard,
  Edit,
  ExternalLink,
  FileText,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  Mail,
  MessageCircle,
  MoreVertical,
  Paperclip,
  Phone,
  Plus,
  User,
  UserCheck,
  UserPlus,
  UserX,
} from 'lucide-react'

const TABS = [
  { id: 'profile', labelKey: 'viewStudent.profile.tabs.profile', icon: User },
  { id: 'documents', labelKey: 'viewStudent.profile.tabs.documents', icon: Paperclip },
  { id: 'application', labelKey: 'viewStudent.profile.tabs.application', icon: FileText },
  { id: 'overview', labelKey: 'viewStudent.profile.tabs.overview', icon: LayoutDashboard },
  { id: 'courses', labelKey: 'viewStudent.profile.tabs.courses', icon: BookOpen },
  { id: 'attendance', labelKey: 'viewStudent.profile.tabs.attendance', icon: CalendarCheck },
  { id: 'payments', labelKey: 'viewStudent.profile.tabs.payments', icon: CreditCard },
]
/** The tab a student page opens on. */
const DEFAULT_TAB = TABS[0].id

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

/** Counted as attended, the same rule the student sees in "My attendance". */
const ATTENDED = new Set(['present', 'late', 'excused'])
/** Below this rate a course is flagged on the profile. */
const LOW_ATTENDANCE = 75
const CLOSED_REQUEST = new Set(['closed', 'completed', 'resolved', 'rejected', 'cancelled', 'canceled'])
const VOID_INVOICE = new Set(['cancelled', 'canceled', 'void', 'voided', 'draft', 'refunded'])

const fieldClass =
  'h-10 rounded-xl border border-[#dde3ef] bg-white px-3 text-sm text-slate-800 outline-none transition-colors focus:border-[#1a3a6b] disabled:bg-slate-50'

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

const num = (value) => {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '0'))
  return Number.isFinite(n) ? n : 0
}

/**
 * Invoices that carry money: a semester invoice split into portions has a summary parent
 * and one child per portion, so only the children count. Cancelled and draft rows never count.
 */
function payableInvoices(rows) {
  const parents = new Set((rows || []).map((r) => r.parent_invoice_id).filter(Boolean))
  return (rows || []).filter((r) => !parents.has(r.id) && !VOID_INVOICE.has(String(r.status || '').toLowerCase()))
}

/** Attendance counts for a set of attendance rows. rate is null when nothing was recorded. */
function attendanceSummary(rows) {
  const s = { present: 0, late: 0, excused: 0, absent: 0, total: 0, rate: null }
  for (const r of rows || []) {
    const status = String(r.status || '').toLowerCase()
    if (status in s) s[status] += 1
    s.total += 1
  }
  if (s.total > 0) s.rate = Math.round(((rows || []).filter((r) => ATTENDED.has(String(r.status || '').toLowerCase())).length / s.total) * 100)
  return s
}

function Field({ label, value, dir }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-semibold text-slate-800" dir={dir}>
        {value === null || value === undefined || value === '' ? '—' : value}
      </dd>
    </div>
  )
}

function FieldGrid({ title, items }) {
  return (
    <Panel title={title}>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([label, value, dir]) => (
          <Field key={label} label={label} value={value} dir={dir} />
        ))}
      </dl>
    </Panel>
  )
}

function Meter({ value, max, tone = 'navy' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#dde3ef]" aria-hidden="true">
      <div className={`h-full rounded-full ${tone === 'gold' ? 'bg-[#c8a84b]' : tone === 'warn' ? 'bg-amber-500' : 'bg-[#1a3a6b]'}`} style={{ width: `${pct}%` }} />
    </div>
  )
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
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const activeTab = TABS.some((tab) => tab.id === requestedTab) ? requestedTab : DEFAULT_TAB
  const setActiveTab = (tabId) => {
    const next = new URLSearchParams(searchParams)
    if (tabId === DEFAULT_TAB) next.delete('tab')
    else next.set('tab', tabId)
    setSearchParams(next, { replace: true })
  }
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


  // ---- the student's record across the system (courses, attendance, lessons, money, application) ----
  const [record, setRecord] = useState({ loading: true })
  const [confirmStatus, setConfirmStatus] = useState(null)

  const loadRecord = useCallback(async () => {
    if (!student?.id) return
    const sid = student.id
    const safe = (p) => p.then((r) => (r.error ? { data: null, error: r.error } : r)).catch((error) => ({ data: null, error }))
    const [enr, att, inv, pay, prog, plan, settings, apps] = await Promise.all([
      safe(
        supabase
          .from('enrollments')
          .select(
            `id, status, grade, numeric_grade, grade_points, semester_id, class_id, enrollment_date,
             semesters ( id, name_en, name_ar, code, start_date, end_date, status ),
             classes ( id, code, section, subject_id, subjects ( id, code, name_en, name_ar, credit_hours ), instructors ( id, name_en, name_ar ) ),
             grade_components ( status, gpa_points, letter_grade, numeric_grade )`
          )
          .eq('student_id', sid)
      ),
      safe(supabase.from('attendance').select('id, status, date, class_id, session_id').eq('student_id', sid).order('date', { ascending: false }).limit(1000)),
      safe(
        supabase
          .from('invoices')
          .select('id, invoice_number, invoice_type, status, total_amount, paid_amount, pending_amount, due_date, invoice_date, parent_invoice_id, semester_id')
          .eq('student_id', sid)
      ),
      safe(
        supabase
          .from('payments')
          .select('id, payment_number, payment_date, payment_method, amount, status, invoices ( invoice_number )')
          .eq('student_id', sid)
          .order('payment_date', { ascending: false })
          .limit(50)
      ),
      safe(supabase.from('class_lesson_progress').select('lesson_id, class_id, status, progress_percent, last_activity_at').eq('student_id', sid)),
      safe(
        supabase
          .from('student_major_sheets')
          .select('is_active, major_sheets ( id, total_credits_required )')
          .eq('student_id', sid)
          .eq('is_active', true)
          .maybeSingle()
      ),
      safe(supabase.from('university_settings').select('financial_settings').order('updated_at', { ascending: false }).limit(1).maybeSingle()),
      student.email
        ? safe(
            supabase
              .from('applications')
              .select('id, application_number, status_code, created_at, college_id, major_id, semester_id')
              .ilike('email', student.email.trim())
              .order('created_at', { ascending: false })
              .limit(1)
          )
        : Promise.resolve({ data: [] }),
    ])

    // Required hours: the assigned degree plan, else the active plan of the major.
    let planRow = Array.isArray(plan.data?.major_sheets) ? plan.data.major_sheets[0] : plan.data?.major_sheets
    if (!planRow && student.major_id) {
      const byMajor = await safe(
        supabase.from('major_sheets').select('id, total_credits_required').eq('major_id', student.major_id).eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle()
      )
      planRow = byMajor.data || null
    }

    // Lessons of the classes the student is registered in now.
    const enrolledClassIds = [...new Set((enr.data || []).filter((r) => r.status === 'enrolled').map((r) => r.class_id).filter(Boolean))]
    let lessons = []
    if (enrolledClassIds.length) {
      const res = await safe(supabase.from('class_lessons').select('id, class_id, status').in('class_id', enrolledClassIds))
      lessons = res.data || []
    }

    // Applications point at majors and colleges twice (first and second choice), so names are read separately.
    let application = (apps.data || [])[0] || null
    if (application) {
      const named = async (table, rowId) =>
        rowId ? (await safe(supabase.from(table).select('name_en, name_ar').eq('id', rowId).maybeSingle())).data || null : null
      const [majors, colleges, semesters] = await Promise.all([
        named('majors', application.major_id),
        named('colleges', application.college_id),
        named('semesters', application.semester_id),
      ])
      application = { ...application, majors, colleges, semesters }
    }
    const codes = [student.current_status_code, application?.status_code].filter(Boolean)
    let statusNames = {}
    if (codes.length) {
      const res = await safe(supabase.from('student_status_codes').select('code, name_en, name_ar').in('code', codes))
      statusNames = Object.fromEntries((res.data || []).map((r) => [r.code, r]))
    }

    setRecord({
      loading: false,
      enrollments: enr.data || [],
      attendance: att.data || [],
      invoices: inv.data || [],
      payments: pay.data || [],
      progress: prog.data || [],
      lessons,
      planCredits: num(planRow?.total_credits_required) || null,
      currency: getCurrencyCodeFromFinancialSettings(settings.data?.financial_settings) || null,
      application,
      statusNames,
      failed: [enr, att, inv, pay].filter((r) => r.error).length,
    })
  }, [student])

  useEffect(() => {
    loadRecord()
  }, [loadRecord])

  /** Everything the cards and tabs show, worked out once from the loaded record. */
  const facts = useMemo(() => {
    if (record.loading) return null
    const rows = (record.enrollments || []).map((row) => {
      const credits = num(row.classes?.subjects?.credit_hours)
      const points = finalGradePoints(row)
      const component = Array.isArray(row.grade_components) ? row.grade_components[0] : row.grade_components
      return { ...row, credits, points, letter: component?.letter_grade || row.grade || null }
    })

    // Cumulative GPA over courses with a final grade (an F counts as 0 points).
    let qualityPoints = 0
    let gradedCredits = 0
    let earnedCredits = 0
    let gradedCourses = 0
    for (const r of rows) {
      if (r.points == null) continue
      gradedCourses += 1
      if (r.credits > 0) {
        qualityPoints += r.points * r.credits
        gradedCredits += r.credits
      }
      if (r.points > 0) earnedCredits += r.credits
    }
    const gpa = gradedCredits > 0 ? qualityPoints / gradedCredits : null

    // Semesters, newest first, each with its own GPA.
    const groups = new Map()
    for (const r of rows) {
      const key = r.semester_id || 'none'
      if (!groups.has(key)) groups.set(key, { key, semester: r.semesters || null, rows: [] })
      groups.get(key).rows.push(r)
    }
    const semesters = [...groups.values()]
      .map((g) => {
        let qp = 0
        let cr = 0
        for (const r of g.rows) if (r.points != null && r.credits > 0) {
          qp += r.points * r.credits
          cr += r.credits
        }
        return { ...g, gpa: cr > 0 ? qp / cr : null, credits: g.rows.reduce((s, r) => s + r.credits, 0) }
      })
      .sort((a, b) => String(b.semester?.start_date || '').localeCompare(String(a.semester?.start_date || '')))

    // Current semester: the latest one that is still running and has registered courses.
    const current =
      semesters.find((g) => g.semester && !isFinishedSemester(g.semester) && g.rows.some((r) => r.status === 'enrolled')) || null
    const currentRows = current ? current.rows.filter((r) => r.status === 'enrolled') : []
    const currentClassIds = new Set(currentRows.map((r) => r.class_id))

    // Attendance, per class and for the current semester.
    const attendanceByClass = new Map()
    for (const a of record.attendance || []) {
      if (!attendanceByClass.has(a.class_id)) attendanceByClass.set(a.class_id, [])
      attendanceByClass.get(a.class_id).push(a)
    }
    const attendanceRows = current ? (record.attendance || []).filter((a) => currentClassIds.has(a.class_id)) : record.attendance || []
    const attendance = attendanceSummary(attendanceRows)

    // Lessons released to the student, and how many they finished.
    const doneLessons = new Set((record.progress || []).filter((p) => String(p.status) === 'completed').map((p) => p.lesson_id))
    const lessonsByClass = new Map()
    for (const l of record.lessons || []) {
      if (String(l.status || '').toLowerCase() === 'draft') continue
      const entry = lessonsByClass.get(l.class_id) || { total: 0, done: 0 }
      entry.total += 1
      if (doneLessons.has(l.id)) entry.done += 1
      lessonsByClass.set(l.class_id, entry)
    }

    // Money.
    const payable = payableInvoices(record.invoices)
    const today = new Date().toISOString().slice(0, 10)
    const billed = payable.reduce((s, r) => s + num(r.total_amount), 0)
    const paid = payable.reduce((s, r) => s + num(r.paid_amount), 0)
    const due = payable.reduce((s, r) => s + num(r.pending_amount), 0)
    const overdue = payable.filter((r) => num(r.pending_amount) > 0 && r.due_date && r.due_date < today)

    return {
      rows,
      gpa,
      gradedCourses,
      earnedCredits,
      semesters,
      current,
      currentRows,
      attendance,
      attendanceByClass,
      lessonsByClass,
      money: { invoices: payable.length, billed, paid, due, overdue },
    }
  }, [record])

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    )
  }

  if (error && !student) {
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => navigate('/students')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-[#1a3a6b]">
          {isArabicLayout ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
          {t('viewStudent.profile.allStudents')}
        </button>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
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

  // ---- presentation helpers ----
  const lang = isArabicLayout ? 'ar' : 'en'
  const fmtDate = (value) => {
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toLocaleDateString(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  const fmtMoney = (value) => {
    const amount = num(value).toLocaleString(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return record.currency ? `${amount} ${record.currency}` : amount
  }
  const nameOf = (row) => (row ? getLocalizedName(row, isArabicLayout) || row.name_en || row.name_ar || '' : '')
  const statusName = (code) => {
    const row = record.statusNames?.[code]
    return row ? (isArabicLayout ? row.name_ar || row.name_en : row.name_en || row.name_ar) : code
  }
  const phoneNumber = student?.mobile_phone || student?.phone || ''
  const whatsappDigits = String(phoneNumber).replace(/\D/g, '')
  const copyStudentNumber = () => {
    try {
      navigator.clipboard.writeText(String(student?.student_id || '')).then(() => showToast(t('viewStudent.profile.numberCopied')), () => {})
    } catch (_) {
      /* clipboard not available */
    }
  }

  const docsInReview = studentDocuments.filter((d) => {
    const expired = d.expiry_date ? new Date(d.expiry_date) < new Date(new Date().toDateString()) : false
    return expired || !(d.status === 'verified' || d.verified_at)
  }).length
  const openRequests = studentRequests.filter((r) => !CLOSED_REQUEST.has(String(r.status || '').toLowerCase())).length
  const lowAttendance = facts
    ? facts.currentRows.filter((r) => {
        const s = attendanceSummary(facts.attendanceByClass.get(r.class_id))
        return s.total >= 3 && s.rate != null && s.rate < LOW_ATTENDANCE
      })
    : []

  /** What staff should look at first. Each line says what is wrong and where to fix it. */
  const attention = []
  if (enrollmentEligibility && !enrollmentEligibility.allowed) {
    attention.push({ tone: 'err', text: `${t('viewStudent.profile.attention.cannotRegister')} ${enrollmentEligibility.reasons.join(' · ')}`, tab: 'payments' })
  }
  if (facts?.money.overdue.length) {
    attention.push({ tone: 'err', text: t('viewStudent.profile.attention.overdue', { count: facts.money.overdue.length, amount: fmtMoney(facts.money.overdue.reduce((s, r) => s + num(r.pending_amount), 0)) }), tab: 'payments' })
  } else if (facts?.money.due > 0) {
    attention.push({ tone: 'warn', text: t('viewStudent.profile.attention.balance', { amount: fmtMoney(facts.money.due) }), tab: 'payments' })
  }
  for (const r of lowAttendance) {
    const s = attendanceSummary(facts.attendanceByClass.get(r.class_id))
    attention.push({ tone: 'warn', text: t('viewStudent.profile.attention.lowAttendance', { code: r.classes?.subjects?.code || r.classes?.code, rate: s.rate }), tab: 'attendance' })
  }
  if (docsInReview > 0) attention.push({ tone: 'warn', text: t('viewStudent.profile.attention.documents', { count: docsInReview }), tab: 'documents' })
  if (openRequests > 0) attention.push({ tone: 'info', text: t('viewStudent.profile.attention.requests', { count: openRequests }), tab: 'documents' })
  if (student && !student.user_id && student.status !== 'inactive') attention.push({ tone: 'info', text: t('viewStudent.profile.attention.noLogin'), tab: null })

  const toneClass = { err: 'border-red-200 bg-red-50 text-red-800', warn: 'border-amber-200 bg-amber-50 text-amber-900', info: 'border-[#dde3ef] bg-[#eef2f9] text-[#1a3a6b]' }

  const gradeTone = (r) => (r.points == null ? 'neutral' : r.points > 0 ? 'ok' : 'err')
  const courseTitle = (r) => (
    <span className="min-w-0">
      <span className="font-bold text-[#1a3a6b]" dir="ltr">
        {r.classes?.subjects?.code || r.classes?.code}
      </span>{' '}
      <span className="text-slate-800">{nameOf(r.classes?.subjects)}</span>
    </span>
  )

  const kpis = facts
    ? [
        {
          label: t('viewStudent.profile.kpi.gpa'),
          value: facts.gpa != null ? facts.gpa.toFixed(2) : '—',
          hint: facts.gpa != null ? t('viewStudent.profile.kpi.gpaFrom', { count: facts.gradedCourses }) : t('viewStudent.profile.kpi.noGrades'),
        },
        {
          label: t('viewStudent.profile.kpi.credits'),
          value: record.planCredits ? `${facts.earnedCredits} / ${record.planCredits}` : String(facts.earnedCredits),
          hint: record.planCredits ? t('viewStudent.profile.kpi.creditsLeft', { count: Math.max(0, record.planCredits - facts.earnedCredits) }) : t('viewStudent.profile.kpi.noPlan'),
          meter: record.planCredits ? [facts.earnedCredits, record.planCredits] : null,
        },
        {
          label: t('viewStudent.profile.kpi.attendance'),
          value: facts.attendance.rate != null ? `${facts.attendance.rate}%` : '—',
          hint: facts.attendance.total ? t('viewStudent.profile.kpi.sessions', { count: facts.attendance.total }) : t('viewStudent.profile.kpi.noSessions'),
          meter: facts.attendance.rate != null ? [facts.attendance.rate, 100] : null,
          tone: facts.attendance.rate != null && facts.attendance.rate < LOW_ATTENDANCE ? 'warn' : 'navy',
        },
        {
          label: t('viewStudent.profile.kpi.balance'),
          value: facts.money.invoices ? fmtMoney(facts.money.due) : '—',
          hint: facts.money.invoices ? t('viewStudent.profile.kpi.paidOf', { paid: fmtMoney(facts.money.paid), billed: fmtMoney(facts.money.billed) }) : t('viewStudent.profile.kpi.noInvoices'),
          meter: facts.money.billed > 0 ? [facts.money.paid, facts.money.billed] : null,
          tone: 'gold',
        },
      ]
    : []

  const application = record.application
  const applicantSees = application ? t(getApplicantStatus(application.status_code).labelKey) : ''

  return (
    <div className="space-y-5">
      {/* Back and actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => navigate('/students')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-[#1a3a6b]">
          {isArabicLayout ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
          {t('viewStudent.profile.allStudents')}
        </button>
        <div className="flex items-center gap-2">
          {canManageThisStudent ? (
            <div className="relative">
              <Button variant="quiet" icon={MoreVertical} onClick={() => setAdminMenuOpen((v) => !v)} aria-label={t('instructors.moreActions')}>
                <span className="hidden sm:inline">{t('instructors.moreActions')}</span>
              </Button>
              {adminMenuOpen ? (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setAdminMenuOpen(false)} />
                  <div className="absolute end-0 top-full z-20 mt-1 w-60 rounded-xl border border-[#dde3ef] bg-white py-1 shadow-lg">
                    {student?.status !== 'inactive' ? (
                      <>
                        {student?.user_id ? (
                          <button
                            type="button"
                            onClick={() => {
                              setPwdModalOpen(true)
                              setPwdError('')
                              setAdminMenuOpen(false)
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <KeyRound className="h-4 w-4 shrink-0" />
                            {t('students.resetPassword')}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setAdminMenuOpen(false)
                              if (!student?.email?.trim()) {
                                showToast(t('adminAccount.noEmailForAccount'), 'err')
                                return
                              }
                              setLinkPortalModalOpen(true)
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <UserPlus className="h-4 w-4 shrink-0" />
                            {t('students.createPortalLogin')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setAdminMenuOpen(false)
                            setConfirmStatus('inactive')
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-amber-800 hover:bg-amber-50"
                        >
                          <UserX className="h-4 w-4 shrink-0" />
                          {t('students.deactivate')}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setAdminMenuOpen(false)
                          setConfirmStatus('active')
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm text-emerald-800 hover:bg-emerald-50"
                      >
                        <UserCheck className="h-4 w-4 shrink-0" />
                        {t('students.reactivate')}
                      </button>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
          <Button icon={Edit} onClick={() => navigate(`/students/${id}/edit`)}>
            {t('common.edit')}
          </Button>
        </div>
      </div>

      {toast ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            toast.startsWith('ERR::') ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {toast.startsWith('ERR::') ? toast.slice(5) : toast}
        </div>
      ) : null}

      {/* Who the student is */}
      <div className="rounded-2xl border border-[#dde3ef] bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#1a3a6b] text-xl font-extrabold text-white sm:h-20 sm:w-20 sm:text-2xl">
            {getInitials(student, isRTL)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={student?.status === 'active' ? 'ok' : 'neutral'}>{translateStudentStatusValue(student?.status)}</Badge>
              {student?.current_status_code ? <Badge tone="info">{statusName(student.current_status_code)}</Badge> : null}
            </div>
            <h1 className="mt-2 break-words text-2xl font-extrabold tracking-tight text-[#1a3a6b] sm:text-[28px]">{primaryDisplayName}</h1>
            {secondaryDisplayName && secondaryDisplayName.trim() !== String(primaryDisplayName || '').trim() ? <p className="text-sm text-slate-500">{secondaryDisplayName}</p> : null}
            <p className="mt-1.5 text-sm font-semibold text-slate-700">
              {majorName}
              <span className="text-slate-400"> · </span>
              {collegeName}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={copyStudentNumber}
                title={t('viewStudent.profile.copyNumber')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#eef2f9] px-2.5 py-1.5 font-mono text-sm font-bold text-[#1a3a6b] hover:bg-[#dde3ef]"
              >
                <span dir="ltr">{student?.student_id || '—'}</span>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              {student?.email ? (
                <a href={`mailto:${student.email}`} className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-[#dde3ef] px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                  <span dir="ltr" className="truncate">
                    {student.email}
                  </span>
                </a>
              ) : null}
              {phoneNumber ? (
                <a href={`tel:${phoneNumber}`} className="inline-flex items-center gap-1.5 rounded-lg border border-[#dde3ef] px-2.5 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                  <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                  <span dir="ltr">{phoneNumber}</span>
                </a>
              ) : null}
              {whatsappDigits.length >= 8 ? (
                <a
                  href={`https://wa.me/${whatsappDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              ) : null}
            </div>
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-3 border-t border-[#dde3ef] pt-4 sm:block sm:space-y-3 sm:border-0 sm:pt-0 sm:text-end">
            <Field label={t('viewStudent.profile.enrolledSince')} value={fmtDate(student?.enrollment_date)} />
            <Field label={t('viewStudent.studyType')} value={translateStudyType(student?.study_type)} />
          </dl>
        </div>
      </div>

      {/* The four numbers that tell how the student is doing */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {record.loading
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[104px] rounded-2xl" />)
          : kpis.map((k) => (
              <div key={k.label} className="rounded-2xl border border-[#dde3ef] bg-white p-4">
                <div className="text-xs font-semibold text-slate-500">{k.label}</div>
                <div className="mt-1 text-xl font-extrabold tabular-nums text-[#1a3a6b] sm:text-2xl" dir="ltr" style={{ textAlign: 'start' }}>
                  {k.value}
                </div>
                {k.meter ? <Meter value={k.meter[0]} max={k.meter[1]} tone={k.tone} /> : null}
                <div className="mt-1.5 text-xs text-slate-500">{k.hint}</div>
              </div>
            ))}
      </div>

      {/* What needs attention */}
      {!record.loading && attention.length > 0 ? (
        <div className="space-y-2">
          {attention.map((a, i) => (
            <div key={i} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm ${toneClass[a.tone]}`}>
              <span className="flex min-w-0 items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{a.text}</span>
              </span>
              {a.tab ? (
                <button type="button" onClick={() => setActiveTab(a.tab)} className="inline-flex items-center gap-1 text-xs font-bold underline-offset-2 hover:underline">
                  {t('viewStudent.profile.open')}
                  <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" />
                </button>
              ) : canManageThisStudent ? (
                <button type="button" onClick={() => setLinkPortalModalOpen(true)} className="inline-flex items-center gap-1 text-xs font-bold underline-offset-2 hover:underline">
                  {t('students.createPortalLogin')}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {!record.loading && record.failed > 0 ? <p className="text-xs text-amber-800">{t('viewStudent.profile.partial')}</p> : null}

      {/* Tabs */}
      <div className="overflow-x-auto rounded-2xl border border-[#dde3ef] bg-white p-1.5" role="tablist">
        <div className="flex min-w-max gap-1">
          {TABS.map((tab) => {
            const selected = activeTab === tab.id
            const TabIcon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={(e) => {
                  setActiveTab(tab.id)
                  e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest' })
                }}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${
                  selected ? 'bg-[#1a3a6b] text-white' : 'text-slate-600 hover:bg-[#eef2f9] hover:text-[#1a3a6b]'
                }`}
              >
                <TabIcon className="h-4 w-4" aria-hidden="true" />
                {t(tab.labelKey)}
              </button>
            )
          })}
        </div>
      </div>

      {/* Overview */}
      {activeTab === 'overview' ? (
        <div className="grid items-start gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Panel
              flush
              title={facts?.current ? `${t('viewStudent.profile.thisSemester')} · ${nameOf(facts.current.semester)}` : t('viewStudent.profile.thisSemester')}
              aside={
                <Button size="sm" variant="quiet" icon={Plus} onClick={() => navigate(`/enrollments/create?student=${id}`)}>
                  {t('viewStudent.profile.registerCourses')}
                </Button>
              }
            >
              {record.loading ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-12" />
                  <Skeleton className="h-12" />
                </div>
              ) : facts.currentRows.length === 0 ? (
                <EmptyState icon={BookOpen} title={t('viewStudent.profile.noCurrentTitle')} hint={t('viewStudent.profile.noCurrentHint')} />
              ) : (
                <ul className="divide-y divide-[#dde3ef]">
                  {facts.currentRows.map((r) => {
                    const att = attendanceSummary(facts.attendanceByClass.get(r.class_id))
                    const les = facts.lessonsByClass.get(r.class_id)
                    return (
                      <li key={r.id} className="grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_9rem] sm:items-center">
                        <div className="min-w-0 text-sm">
                          {courseTitle(r)}
                          <div className="mt-0.5 text-xs text-slate-500">
                            {t('enrollments.section')} {r.classes?.section || '—'}
                            {r.classes?.instructors ? ` · ${nameOf(r.classes.instructors)}` : ''} · {t('viewStudent.profile.creditsShort', { count: r.credits })}
                          </div>
                        </div>
                        <div className="text-xs text-slate-600">
                          <div className="flex items-center justify-between gap-2">
                            <span>{t('viewStudent.profile.kpi.attendance')}</span>
                            <strong className="tabular-nums">{att.rate != null ? `${att.rate}%` : '—'}</strong>
                          </div>
                          {att.rate != null ? <Meter value={att.rate} max={100} tone={att.rate < LOW_ATTENDANCE ? 'warn' : 'navy'} /> : null}
                        </div>
                        <div className="text-xs text-slate-600">
                          <div className="flex items-center justify-between gap-2">
                            <span>{t('viewStudent.profile.lessons')}</span>
                            <strong className="tabular-nums">{les ? `${les.done}/${les.total}` : '—'}</strong>
                          </div>
                          {les ? <Meter value={les.done} max={les.total} tone="gold" /> : null}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Panel>

            {enrollmentEligibility != null ? (
              <div className={`rounded-2xl border p-4 ${enrollmentEligibility.allowed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900">
                  {enrollmentEligibility.allowed ? <CheckCircle className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                  {t('viewStudent.enrollmentEligibility')}
                </h3>
                {!enrollmentEligibility.allowed && enrollmentEligibility.reasons?.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-900">
                    {enrollmentEligibility.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                ) : null}
                {enrollmentEligibility.warnings?.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc text-sm text-amber-800">
                    {enrollmentEligibility.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                ) : null}
                {enrollmentEligibility.allowed && enrollmentEligibility.reasons?.length === 0 ? <p className="mt-1 text-sm text-emerald-800">{t('viewStudent.eligibleToEnroll')}</p> : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-5">
            <Panel
              title={t('viewStudent.profile.tabs.application')}
              aside={
                application ? (
                  <Button size="sm" variant="ghost" icon={ExternalLink} onClick={() => navigate(`/admissions/applications/${application.id}`)}>
                    {t('viewStudent.profile.open')}
                  </Button>
                ) : null
              }
            >
              {record.loading ? (
                <Skeleton className="h-16" />
              ) : application ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field label={t('viewStudent.profile.applicationNumber')} value={application.application_number || `#${application.id}`} dir="ltr" />
                  <Field label={t('viewStudent.profile.submitted')} value={fmtDate(application.created_at)} />
                  <div className="col-span-2">
                    <Field label={t('common.status')} value={statusName(application.status_code)} />
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-slate-500">{t('viewStudent.profile.noApplication')}</p>
              )}
            </Panel>

            <Panel
              title={t('viewStudent.profile.tabs.payments')}
              aside={
                <Button size="sm" variant="ghost" onClick={() => setActiveTab('payments')}>
                  {t('viewStudent.profile.open')}
                </Button>
              }
            >
              {record.loading ? (
                <Skeleton className="h-16" />
              ) : record.payments.length === 0 ? (
                <p className="text-sm text-slate-500">{facts.money.invoices ? t('viewStudent.profile.noPaymentsYet') : t('viewStudent.profile.kpi.noInvoices')}</p>
              ) : (
                <ul className="space-y-2">
                  {record.payments.slice(0, 4).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="block font-semibold text-slate-800">{fmtDate(p.payment_date)}</span>
                        <span className="block truncate text-xs text-slate-500">{String(p.payment_method || '').replace(/_/g, ' ')}</span>
                      </span>
                      <span className="font-bold tabular-nums text-emerald-700" dir="ltr">
                        {fmtMoney(p.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      ) : null}

      {/* Courses and grades */}
      {activeTab === 'courses' ? (
        record.loading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : facts.semesters.length === 0 ? (
          <Panel>
            <EmptyState
              icon={GraduationCap}
              title={t('viewStudent.profile.noCoursesTitle')}
              hint={t('viewStudent.profile.noCoursesHint')}
              action={
                <Button icon={Plus} onClick={() => navigate(`/enrollments/create?student=${id}`)}>
                  {t('viewStudent.profile.registerCourses')}
                </Button>
              }
            />
          </Panel>
        ) : (
          <div className="space-y-5">
            {facts.semesters.map((g) => (
              <Panel
                key={g.key}
                flush
                title={g.semester ? nameOf(g.semester) : t('viewStudent.profile.noSemester')}
                aside={
                  <span className="text-xs font-semibold text-slate-500">
                    {t('viewStudent.profile.creditsShort', { count: g.credits })}
                    {g.gpa != null ? ` · ${t('viewStudent.profile.semesterGpa', { gpa: g.gpa.toFixed(2) })}` : ''}
                  </span>
                }
              >
                <ul className="divide-y divide-[#dde3ef]">
                  {g.rows.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm">
                      <div className="min-w-0 flex-1">
                        {courseTitle(r)}
                        <div className="mt-0.5 text-xs text-slate-500">
                          {t('viewStudent.profile.creditsShort', { count: r.credits })} · {t(`enrollments.${r.status || 'enrolled'}`, { defaultValue: r.status })}
                        </div>
                      </div>
                      <Badge tone={gradeTone(r)} className="tabular-nums">
                        {r.letter ? `${r.letter}${r.points != null ? ` · ${r.points.toFixed(2)}` : ''}` : t('viewStudent.profile.noGradeYet')}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
        )
      ) : null}

      {/* Attendance */}
      {activeTab === 'attendance' ? (
        record.loading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : record.attendance.length === 0 ? (
          <Panel>
            <EmptyState icon={CalendarCheck} title={t('viewStudent.profile.noAttendanceTitle')} hint={t('viewStudent.profile.noAttendanceHint')} />
          </Panel>
        ) : (
          <div className="space-y-5">
            <Panel flush title={facts.current ? `${t('viewStudent.profile.byCourse')} · ${nameOf(facts.current.semester)}` : t('viewStudent.profile.byCourse')}>
              <ul className="divide-y divide-[#dde3ef]">
                {(facts.currentRows.length ? facts.currentRows : facts.rows.filter((r) => facts.attendanceByClass.has(r.class_id))).map((r) => {
                  const s = attendanceSummary(facts.attendanceByClass.get(r.class_id))
                  return (
                    <li key={r.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_14rem] sm:items-center">
                      <div className="min-w-0 text-sm">{courseTitle(r)}</div>
                      <div className="text-xs text-slate-600">
                        <div className="flex items-center justify-between gap-2">
                          <span>
                            {t('viewStudent.profile.att.present')} {s.present} · {t('viewStudent.profile.att.late')} {s.late} · {t('viewStudent.profile.att.excused')} {s.excused} ·{' '}
                            {t('viewStudent.profile.att.absent')} {s.absent}
                          </span>
                          <strong className="tabular-nums">{s.rate != null ? `${s.rate}%` : '—'}</strong>
                        </div>
                        {s.rate != null ? <Meter value={s.rate} max={100} tone={s.rate < LOW_ATTENDANCE ? 'warn' : 'navy'} /> : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </Panel>
            <Panel flush title={t('viewStudent.profile.recentRecords')}>
              <ul className="divide-y divide-[#dde3ef]">
                {record.attendance.slice(0, 15).map((a) => {
                  const row = facts.rows.find((r) => r.class_id === a.class_id)
                  const status = String(a.status || '').toLowerCase()
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0">
                        <span className="font-semibold text-slate-800">{fmtDate(a.date)}</span>
                        <span className="text-slate-500"> · </span>
                        <span dir="ltr" className="text-slate-600">
                          {row?.classes?.subjects?.code || row?.classes?.code || '—'}
                        </span>
                      </span>
                      <Badge tone={status === 'absent' ? 'err' : status === 'late' ? 'warn' : status === 'excused' ? 'info' : 'ok'}>
                        {t(`viewStudent.profile.att.${status}`, { defaultValue: status })}
                      </Badge>
                    </li>
                  )
                })}
              </ul>
            </Panel>
          </div>
        )
      ) : null}

      {/* Payments */}
      {activeTab === 'payments' ? (
        <div className="space-y-5">
          <Panel
            title={t('viewStudent.payments.title', 'Payments')}
            aside={
              <div className="flex flex-wrap items-center gap-2">
                <select className={fieldClass} value={selectedSemesterId} onChange={(e) => setSelectedSemesterId(e.target.value)} aria-label={t('viewStudent.payments.selectSemester')}>
                  <option value="">{t('viewStudent.payments.selectSemester', 'Select semester')}</option>
                  {semesterOptions.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      {(isRTL ? s.name_ar : s.name_en) || s.code || `#${s.id}`}
                    </option>
                  ))}
                </select>
                <Button icon={FileText} loading={genLoading} disabled={!selectedSemesterId} onClick={generateSemesterInvoice}>
                  {t('viewStudent.payments.generateInvoice', 'Generate semester invoice')}
                </Button>
              </div>
            }
          >
            <p className="text-sm text-slate-600">{t('viewStudent.payments.subtitle', 'Generate invoices for semester/major fees and review payments.')}</p>
            {genError ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{genError}</div> : null}
            {genToast ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{genToast}</div> : null}
          </Panel>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            <Panel flush title={t('viewStudent.payments.invoices', 'Invoices')} aside={financeLoading ? <span className="text-xs text-slate-500">{t('common.loading')}</span> : null}>
              {adminInvoices.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500">{t('viewStudent.payments.noInvoices', 'No invoices found for this semester.')}</p>
              ) : (
                <ul className="divide-y divide-[#dde3ef]">
                  {adminInvoices.map((inv) => (
                    <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="min-w-0">
                        <span className="block font-mono text-xs font-bold text-slate-800" dir="ltr">
                          {inv.invoice_number}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {fmtDate(inv.invoice_date)}
                          {inv.due_date ? ` · ${t('viewStudent.profile.dueOn', { date: fmtDate(inv.due_date) })}` : ''}
                        </span>
                      </span>
                      <span className="text-end">
                        <span className="block font-bold tabular-nums text-slate-800" dir="ltr">
                          {fmtMoney(inv.total_amount)}
                        </span>
                        {num(inv.pending_amount) > 0 ? (
                          <span className="block text-xs font-semibold tabular-nums text-amber-700" dir="ltr">
                            {t('viewStudent.payments.pending', 'Pending')} {fmtMoney(inv.pending_amount)}
                          </span>
                        ) : (
                          <Badge tone="ok">{t('viewStudent.profile.paid')}</Badge>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel flush title={t('viewStudent.payments.paymentHistory', 'Payment history')}>
              {adminPayments.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500">{t('viewStudent.payments.noPayments', 'No payments yet.')}</p>
              ) : (
                <ul className="divide-y divide-[#dde3ef]">
                  {adminPayments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="min-w-0">
                        <span className="block font-mono text-xs font-bold text-slate-800" dir="ltr">
                          {p.payment_number}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {fmtDate(p.payment_date)} · {String(p.payment_method || '').replace(/_/g, ' ')}
                          {p.invoices?.invoice_number ? ` · ${p.invoices.invoice_number}` : ''}
                        </span>
                      </span>
                      <span className="font-bold tabular-nums text-emerald-700" dir="ltr">
                        {fmtMoney(p.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <p className="rounded-xl border border-[#dde3ef] bg-[#eef2f9] px-4 py-3 text-sm text-[#1a3a6b]">
            {t('viewStudent.payments.note', 'Note: These invoices form the base for PM10/PM30 milestones (admission_fee invoices are excluded). Once generated, the student can pay from Student Portal.')}
          </p>
        </div>
      ) : null}

      {/* Application */}
      {activeTab === 'application' ? (
        record.loading ? (
          <Skeleton className="h-40 rounded-2xl" />
        ) : application ? (
          <Panel
            title={t('viewStudent.profile.tabs.application')}
            aside={
              <Button size="sm" icon={ExternalLink} onClick={() => navigate(`/admissions/applications/${application.id}`)}>
                {t('viewStudent.profile.openApplication')}
              </Button>
            }
          >
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label={t('viewStudent.profile.applicationNumber')} value={application.application_number || `#${application.id}`} dir="ltr" />
              <Field label={t('common.status')} value={statusName(application.status_code)} />
              <Field label={t('viewStudent.profile.applicantSees')} value={applicantSees} />
              <Field label={t('viewStudent.profile.submitted')} value={fmtDate(application.created_at)} />
              <Field label={t('viewStudent.major')} value={nameOf(application.majors)} />
              <Field label={t('viewStudent.college')} value={nameOf(application.colleges)} />
              <Field label={t('enrollments.semester')} value={nameOf(application.semesters)} />
            </dl>
          </Panel>
        ) : (
          <Panel>
            <EmptyState icon={FileText} title={t('viewStudent.profile.noApplication')} hint={t('viewStudent.profile.noApplicationHint')} />
          </Panel>
        )
      ) : null}

      {/* Documents and requests */}
      {activeTab === 'documents' ? (
        <div className="space-y-5">
          <Panel flush title={t('viewStudent.tabs.documents')}>
            {studentDocuments.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">{t('viewStudent.noDocuments', 'No documents on file.')}</p>
            ) : (
              <ul className="divide-y divide-[#dde3ef]">
                {studentDocuments.map((doc) => {
                  const { data: urlData } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(doc.file_path)
                  const label = STUDENT_DOCUMENT_LABELS[doc.document_type]
                  const expired = doc.expiry_date ? new Date(doc.expiry_date) < new Date(new Date().toDateString()) : false
                  const status = expired ? 'expired' : doc.status || (doc.verified_at ? 'verified' : 'in_review')
                  return (
                    <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="flex min-w-0 items-start gap-3">
                        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                        <span className="min-w-0">
                          <span className="block font-semibold text-slate-800">{t(label || doc.document_type)}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <Badge tone={status === 'verified' ? 'ok' : status === 'expired' ? 'err' : 'info'}>
                              {status === 'verified' ? t('common.verified', 'Verified') : status === 'expired' ? t('common.expired', 'Expired') : t('common.inReview', 'In review')}
                            </Badge>
                            {doc.uploaded_at ? fmtDate(doc.uploaded_at) : null}
                            {doc.expiry_date ? ` · ${t('viewStudent.documentsExpiry', 'Expiry')}: ${fmtDate(doc.expiry_date)}` : null}
                          </span>
                        </span>
                      </span>
                      <a href={urlData?.publicUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-bold text-[#1a3a6b] hover:underline">
                        <ExternalLink className="h-4 w-4" />
                        {t('viewStudent.viewDocument', 'View / Download')}
                      </a>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
          <Panel flush title={t('viewStudent.tabs.requests')}>
            {studentRequests.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">{t('viewStudent.noRequests', 'No requests on file.')}</p>
            ) : (
              <ul className="divide-y divide-[#dde3ef]">
                {studentRequests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-800">
                        <span dir="ltr">{r.request_number}</span> · {r.request_type}
                      </span>
                      {r.description ? <span className="block truncate text-xs text-slate-500">{r.description}</span> : null}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {fmtDate(r.created_at)}
                      <Badge tone={CLOSED_REQUEST.has(String(r.status || '').toLowerCase()) ? 'neutral' : 'info'}>{r.status || '—'}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      ) : null}

      {/* Everything on file about the person */}
      {activeTab === 'profile' ? (
        <div className="space-y-5">
          <FieldGrid
            title={t('viewStudent.tabs.personal')}
            items={[
              [t('viewStudent.firstName'), (isRTL ? [student?.first_name_ar, student?.first_name] : [student?.first_name, student?.first_name_ar]).filter(Boolean).join(' / ')],
              [t('viewStudent.lastName'), (isRTL ? [student?.last_name_ar, student?.last_name] : [student?.last_name, student?.last_name_ar]).filter(Boolean).join(' / ')],
              [t('viewStudent.dateOfBirth'), student?.date_of_birth ? fmtDate(student.date_of_birth) : null],
              [t('viewStudent.gender'), student?.gender],
              [t('viewStudent.nationality'), getNationalityLabel(student?.nationality, isRTL)],
              [t('viewStudent.religion'), student?.religion],
              [t('viewStudent.maritalStatus'), student?.marital_status],
              [t('viewStudent.bloodType'), student?.blood_type],
              [t('viewStudent.international'), student?.is_international ? t('common.yes') : t('common.no')],
            ]}
          />
          <FieldGrid
            title={t('viewStudent.tabs.contact')}
            items={[
              [t('viewStudent.email'), student?.email, 'ltr'],
              [t('viewStudent.phone'), student?.phone, 'ltr'],
              [t('viewStudent.mobilePhone'), student?.mobile_phone, 'ltr'],
              [t('viewStudent.address'), student?.address],
              [t('viewStudent.city'), student?.city],
              [t('viewStudent.state'), student?.state],
              [t('viewStudent.country'), student?.country],
              [t('viewStudent.postalCode'), student?.postal_code],
            ]}
          />
          <FieldGrid
            title={t('viewStudent.tabs.academic')}
            items={[
              [t('viewStudent.major'), majorName],
              [t('viewStudent.college'), collegeName],
              [t('viewStudent.studyType'), translateStudyType(student?.study_type)],
              [t('viewStudent.studyLoad'), translateStudyLoad(student?.study_load || '—')],
              [t('viewStudent.studyApproach'), translateStudyApproach(student?.study_approach || '—')],
              [t('viewStudent.creditHours'), student?.credit_hours],
              [t('viewStudent.enrollmentDate'), student?.enrollment_date ? fmtDate(student.enrollment_date) : null],
              [t('viewStudent.status'), translateStudentStatusValue(student?.status)],
            ]}
          />
          <FieldGrid
            title={t('viewStudent.tabs.previousEducation')}
            items={[
              [t('viewStudent.highSchoolName'), student?.high_school_name],
              [t('viewStudent.highSchoolCountry'), student?.high_school_country],
              [t('viewStudent.graduationYear'), student?.graduation_year],
              [t('viewStudent.highSchoolGpa'), student?.high_school_gpa != null ? Number(student.high_school_gpa).toFixed(2) : null],
            ]}
          />
          <FieldGrid
            title={t('viewStudent.tabs.identity')}
            items={[
              [t('viewStudent.nationalId'), student?.national_id, 'ltr'],
              [t('viewStudent.passportNumber'), student?.passport_number, 'ltr'],
              [t('viewStudent.passportExpiry'), student?.passport_expiry ? fmtDate(student.passport_expiry) : null],
              [t('viewStudent.visaNumber'), student?.visa_number, 'ltr'],
              [t('viewStudent.visaExpiry'), student?.visa_expiry ? fmtDate(student.visa_expiry) : null],
              [t('viewStudent.residencePermitNumber'), student?.residence_permit_number, 'ltr'],
              [t('viewStudent.residencePermitExpiry'), student?.residence_permit_expiry ? fmtDate(student.residence_permit_expiry) : null],
            ]}
          />
          <FieldGrid
            title={t('viewStudent.tabs.emergency')}
            items={[
              [t('viewStudent.emergencyContactName'), student?.emergency_contact_name],
              [t('viewStudent.emergencyContactRelation'), student?.emergency_contact_relation],
              [t('viewStudent.emergencyPhone'), student?.emergency_phone, 'ltr'],
              [t('viewStudent.emergencyContactEmail'), student?.emergency_contact_email, 'ltr'],
            ]}
          />
          <FieldGrid
            title={t('viewStudent.tabs.other')}
            items={[
              [t('viewStudent.hasScholarship'), student?.has_scholarship ? t('common.yes') : t('common.no')],
              [t('viewStudent.type'), student?.scholarship_type],
              [t('viewStudent.percentage'), student?.scholarship_percentage != null ? `${student.scholarship_percentage}%` : null],
              [t('viewStudent.scholarshipDetails'), student?.scholarship_details],
              [t('viewStudent.conditions'), student?.medical_conditions],
              [t('viewStudent.allergies'), student?.allergies],
              [t('viewStudent.medications'), student?.medications],
              [t('viewStudent.notes'), student?.notes],
            ]}
          />
        </div>
      ) : null}

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
      <ConfirmDialog
        open={Boolean(confirmStatus)}
        tone={confirmStatus === 'inactive' ? 'danger' : 'primary'}
        title={confirmStatus === 'inactive' ? t('students.deactivate') : t('students.reactivate')}
        body={confirmStatus === 'inactive' ? t('students.confirmDeactivate') : t('students.confirmReactivate')}
        confirmLabel={confirmStatus === 'inactive' ? t('students.deactivate') : t('students.reactivate')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          const next = confirmStatus
          setConfirmStatus(null)
          setStudentStatus(next)
        }}
        onCancel={() => setConfirmStatus(null)}
      />
    </div>
  )
}
