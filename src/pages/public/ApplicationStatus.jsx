import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate, useParams, useLocation, Link, useOutletContext } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase, SUPABASE_STORAGE_BUCKET } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'
import { canLoginWithoutSemesterPm10Milestone } from '../../utils/financePermissions'
import PaymentModal from '../../components/payment/PaymentModal'
import {
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  CreditCard,
  UserCheck,
  GraduationCap,
  AlertCircle,
  Upload,
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
  Loader2,
  LogIn,
  Printer,
} from 'lucide-react'

// Same document types as in register form; uploadable on track page if not filled at registration
const UPLOADABLE_DOCUMENT_TYPES = [
  { key: 'id_photo', labelKey: 'track.documents.idPhoto', accept: 'image/jpeg,image/png,image/webp,application/pdf' },
  { key: 'transcript', labelKey: 'track.documents.transcript', accept: 'image/jpeg,image/png,application/pdf' },
]
const MAX_FILE_SIZE_MB = 10

const STAGE_ORDER = [
  'APDR', 'APSB', 'APPN', 'APPC', 'RVQU', 'RVIN', 'RVDV', 'RVHL', 'RVRI', 'RVRC', 'RVIV', 'RVEX',
  'DCPN', 'DCCA', 'DCFA', 'DCWL', 'DCRJ', 'ENPN', 'ENCF', 'ENAC',
]

function getStageIndex(code) {
  const i = STAGE_ORDER.indexOf(code || '')
  return i >= 0 ? i : 0
}

function getApplicantDisplayName(application, isRTL) {
  if (!application) return ''
  if (isRTL) {
    const ar = [application.first_name_ar, application.middle_name_ar, application.last_name_ar].filter(Boolean).join(' ').trim()
    if (ar) return ar
    return [application.first_name, application.middle_name, application.last_name].filter(Boolean).join(' ').trim()
  }
  const en = [application.first_name, application.middle_name, application.last_name].filter(Boolean).join(' ').trim()
  if (en) return en
  return [application.first_name_ar, application.middle_name_ar, application.last_name_ar].filter(Boolean).join(' ').trim()
}

export default function ApplicationStatus() {
  const { t } = useTranslation()
  const { isRTL, language, changeLanguage } = useLanguage()
  const navigate = useNavigate()
  const { id } = useParams()
  const location = useLocation()
  const outletCtx = useOutletContext()
  const portalMode = Boolean(outletCtx?.applicantPortal)
  const { user } = useAuth()
  const [application, setApplication] = useState(location.state?.application || null)
  const [activityLog, setActivityLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedInvoiceForPayment, setSelectedInvoiceForPayment] = useState(null)
  const [studentInvoices, setStudentInvoices] = useState([])
  const [applicationInvoices, setApplicationInvoices] = useState([])
  const [student, setStudent] = useState(null)
  const [hasStudentPortalAccess, setHasStudentPortalAccess] = useState(false)
  const [applicationDocuments, setApplicationDocuments] = useState([])
  const [uploadingDocType, setUploadingDocType] = useState(null)
  const [documentError, setDocumentError] = useState('')
  const applicationFetchInProgressRef = useRef(false)
  const studentInvoicesFetchedForRef = useRef(null)

  // Enforce portal ownership when user session loads after application was fetched
  useEffect(() => {
    if (!portalMode || !user?.id || !application?.id) return
    const em = (user.email || '').trim().toLowerCase()
    const appEm = (application.email || '').trim().toLowerCase()
    const uidOk = application.applicant_user_id === user.id
    const emailOk = appEm === em
    if (!uidOk && !emailOk) {
      setError(t('track.portalAccessDenied', 'You do not have access to this application.'))
      setApplication(null)
    }
  }, [portalMode, user?.id, user?.email, application?.id, application?.email, application?.applicant_user_id, t])

  // Single effect: fetch application by id once, then fetch activity log when we have the matching application
  useEffect(() => {
    if (!id) return
    const idNum = parseInt(id, 10)
    const hasMatchingApplication = application && application.id === idNum

    if (hasMatchingApplication) {
      fetchActivityLog(application.id)
      setLoading(false)
      return
    }

    // Stale or missing: clear if we have wrong application so we refetch for current id
    if (application && application.id !== idNum) {
      setApplication(null)
    }
    if (applicationFetchInProgressRef.current) return
    applicationFetchInProgressRef.current = true
    fetchApplication().finally(() => {
      applicationFetchInProgressRef.current = false
    })
  }, [id, application, portalMode, user?.id, user?.email])

  // Fetch application documents when we have application
  useEffect(() => {
    const appId = application?.id
    if (!appId) {
      setApplicationDocuments([])
      return
    }
    const fetchDocs = async () => {
      const { data, error } = await supabase
        .from('application_documents')
        .select('document_type, file_path, file_name, uploaded_at')
        .eq('application_id', appId)
      if (error) {
        console.error('Application documents fetch error:', error.message, error.code)
        setApplicationDocuments([])
        return
      }
      setApplicationDocuments(data ?? [])
    }
    fetchDocs()
  }, [application?.id])

  // Fetch student + invoices by application email once per email (avoids duplicate students/invoices calls)
  useEffect(() => {
    const email = application?.email
    if (!email) {
      setStudent(null)
      setStudentInvoices([])
      setHasStudentPortalAccess(false)
      studentInvoicesFetchedForRef.current = null
      return
    }
    if (studentInvoicesFetchedForRef.current === email) return
    studentInvoicesFetchedForRef.current = email
    fetchStudentAndInvoices(email)
  }, [application?.email])

  const fetchApplicationInvoices = useCallback(async (appId) => {
    if (!appId) {
      setApplicationInvoices([])
      return
    }
    try {
      const { data, error: invErr } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_type, status, total_amount, paid_amount, pending_amount, due_date, student_id, college_id, semester_id, application_id, invoice_date')
        .eq('application_id', appId)
        .order('invoice_date', { ascending: false })
      if (invErr) throw invErr
      setApplicationInvoices(data || [])
    } catch (err) {
      console.error('Application invoices fetch error:', err)
      setApplicationInvoices([])
    }
  }, [])

  useEffect(() => {
    if (!application?.id) {
      setApplicationInvoices([])
      return
    }
    fetchApplicationInvoices(application.id)
  }, [application?.id, fetchApplicationInvoices])

  const mergedInvoices = useMemo(() => {
    const map = new Map()
    ;[...(applicationInvoices || []), ...(studentInvoices || [])].forEach((inv) => {
      if (inv?.id != null) map.set(inv.id, inv)
    })
    return Array.from(map.values())
  }, [applicationInvoices, studentInvoices])

  const fetchStudentAndInvoices = async (email) => {
    if (!email) return
    try {
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('id, student_id, email, college_id, financial_hold_reason_code, current_status_code')
        .eq('email', email)
        .eq('status', 'active')
        .maybeSingle()
      if (studentError || !studentData) {
        setStudent(null)
        setStudentInvoices([])
        setHasStudentPortalAccess(false)
        return
      }
      setStudent(studentData)
      const { data: invoicesData, error: invError } = await supabase
        .from('invoices')
        .select('id, invoice_number, invoice_type, status, total_amount, paid_amount, pending_amount, due_date, student_id, college_id, semester_id')
        .eq('student_id', studentData.id)
        .order('invoice_date', { ascending: false })
      if (!invError) setStudentInvoices(invoicesData || [])
      else setStudentInvoices([])
      const { data: statusRows } = await supabase
        .from('student_semester_financial_status')
        .select('financial_milestone_code')
        .eq('student_id', studentData.id)
        .in('financial_milestone_code', ['PM10', 'PM30', 'PM60', 'PM90', 'PM100'])
        .limit(1)
      const hasPm10Plus = Array.isArray(statusRows) && statusRows.length > 0
      const portalOk =
        hasPm10Plus ||
        canLoginWithoutSemesterPm10Milestone(
          studentData.financial_hold_reason_code || null,
          studentData.current_status_code || ''
        )
      setHasStudentPortalAccess(portalOk)
    } catch (err) {
      setStudent(null)
      setStudentInvoices([])
      setHasStudentPortalAccess(false)
    }
  }

  const fetchApplication = async () => {
    setLoading(true)
    try {
      const { data, error: fetchError } = await supabase
        .from('applications')
        .select(`
          *,
          majors (name_en, name_ar, code),
          semesters (name_en, name_ar, code),
          colleges (name_en, name_ar, code)
        `)
        .eq('id', parseInt(id))
        .single()

      if (fetchError) throw fetchError

      if (portalMode && user?.id) {
        const em = (user.email || '').trim().toLowerCase()
        const appEm = (data.email || '').trim().toLowerCase()
        const uidOk = data.applicant_user_id === user.id
        const emailOk = appEm === em
        if (!uidOk && !emailOk) {
          setError(t('track.portalAccessDenied', 'You do not have access to this application.'))
          setApplication(null)
          return
        }
      }

      setApplication(data)
    } catch (err) {
      console.error('Error fetching application:', err)
      setError('Failed to load application. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const fetchActivityLog = async (appId = null) => {
    const applicationId = appId || application?.id
    if (!applicationId) return
    try {
      const { data: logEntries, error: logError } = await supabase
        .from('status_change_audit_log')
        .select('*')
        .eq('entity_type', 'application')
        .eq('entity_id', applicationId)
        .order('created_at', { ascending: false })

      if (logError) throw logError

      if (application?.created_at) {
        const initialEntry = {
          id: 'initial',
          from_status_code: null,
          to_status_code: application.status_code || 'APDR',
          trigger_code: 'TRSB',
          triggered_by: null,
          notes: 'Application created',
          created_at: application.created_at,
        }
        setActivityLog([initialEntry, ...(logEntries || [])])
      } else {
        setActivityLog(logEntries || [])
      }
    } catch (err) {
      console.error('Error fetching activity log:', err)
    }
  }

  const getStatusInfo = (statusCode) => {
    const statusMap = {
      'APDR': { label: 'Draft', color: 'bg-gray-100 text-gray-800 border-gray-200', icon: FileText },
      'APSB': { label: 'Submitted', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Clock },
      'APIV': { label: 'Invalid', color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle },
      'APPN': { label: 'Payment Pending', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: CreditCard },
      'APPC': { label: 'Payment Confirmed', color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle },
      'RVQU': { label: 'Review Queue', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Clock },
      'RVIN': { label: 'Under Review', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: RefreshCw },
      'RVHL': { label: 'On Hold', color: 'bg-orange-100 text-orange-800 border-orange-200', icon: AlertCircle },
      'RVRI': { label: 'Additional Info Required', color: 'bg-purple-100 text-purple-800 border-purple-200', icon: FileText },
      'RVRC': { label: 'Info Received', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: CheckCircle },
      'RVDV': { label: 'Documents Verification', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: FileText },
      'RVIV': { label: 'Interview Required', color: 'bg-purple-100 text-purple-800 border-purple-200', icon: UserCheck },
      'RVEX': { label: 'Entrance Exam Required', color: 'bg-purple-100 text-purple-800 border-purple-200', icon: GraduationCap },
      'DCPN': { label: 'Decision Pending', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: Clock },
      'DCCA': { label: 'Accepted (Conditional)', color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle },
      'DCFA': { label: 'Accepted (Final)', color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle },
      'DCWL': { label: 'Waitlisted', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Clock },
      'DCRJ': { label: 'Rejected', color: 'bg-red-100 text-red-800 border-red-200', icon: XCircle },
      'ENPN': { label: 'Enrollment Pending', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: Clock },
      'ENCF': { label: 'Enrollment Confirmed', color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle },
      'ENAC': { label: 'Enrolled (Active)', color: 'bg-green-100 text-green-800 border-green-200', icon: CheckCircle },
    }
    return statusMap[statusCode] || { label: statusCode, color: 'bg-gray-100 text-gray-800 border-gray-200', icon: Clock }
  }

  const getProcessingStages = () => {
    const code = application?.status_code || 'APDR'
    const currentIdx = getStageIndex(code)
    const created = application?.created_at
    const locale = isRTL ? 'ar-SA' : 'en-CA'
    const formatDate = (d) =>
      d ? new Date(d).toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' }) : null

    const stages = [
      {
        key: 1,
        title: t('track.stages.orderReceipt', 'Order receipt'),
        desc: t('track.stages.orderReceiptDesc', 'Your request has been received and registered in the system'),
        date: formatDate(created),
        status: currentIdx >= getStageIndex('APSB') ? 'completed' : 'pending',
      },
      {
        key: 2,
        title: t('track.stages.documentVerification', 'Document verification'),
        desc: t('track.stages.documentVerificationDesc', 'Uploaded documents are being verified'),
        date: currentIdx >= getStageIndex('APPC') ? formatDate(created) : null,
        status: currentIdx > getStageIndex('APPC') ? 'completed' : currentIdx === getStageIndex('APPC') ? 'in_progress' : 'pending',
      },
      {
        key: 3,
        title: t('track.stages.academicReview', 'Academic Review'),
        desc: t('track.stages.academicReviewDesc', 'Under review — expected to be completed within 5-7 business days'),
        date: null,
        status: currentIdx > getStageIndex('RVRC') ? 'completed' : currentIdx >= getStageIndex('RVQU') ? 'in_progress' : 'pending',
      },
      {
        key: 4,
        title: t('track.stages.admissionDecision', 'Admission decision'),
        desc: currentIdx >= getStageIndex('DCFA') ? t('track.stages.decisionMade', 'Decision made') : t('track.stages.awaitingReview', 'Awaiting completion of review'),
        date: null,
        status: currentIdx >= getStageIndex('DCFA') ? 'completed' : currentIdx === getStageIndex('DCPN') ? 'in_progress' : 'pending',
      },
      {
        key: 5,
        title: t('track.stages.acceptanceLetter', 'Sending the acceptance letter'),
        desc: currentIdx >= getStageIndex('ENCF') ? t('track.stages.sent', 'Sent') : t('track.stages.awaitingAcceptance', 'Awaiting acceptance decision'),
        date: null,
        status: currentIdx >= getStageIndex('ENCF') ? 'completed' : 'pending',
      },
    ]
    return stages
  }

  const hasDoc = (type) => applicationDocuments.some((d) => d.document_type === type)

  const documentItems = () => {
    const code = application?.status_code
    const pastDoc = getStageIndex(code) >= getStageIndex('RVDV')
    const idPhotoDone = hasDoc('id_photo')
    const transcriptDone = hasDoc('transcript')
    const allUploadableDone = idPhotoDone && transcriptDone
    return [
      { key: 'application', label: t('track.documents.applicationForm', 'Application form'), done: true, uploadable: false },
      { key: 'docVerification', label: t('track.documents.documentVerification', 'Documents verification'), done: pastDoc || allUploadableDone, uploadable: false },
      { key: 'id_photo', label: t('track.documents.idPhoto', 'ID photo'), done: idPhotoDone, uploadable: true },
      { key: 'transcript', label: t('track.documents.transcript', 'Transcript / Grades'), done: transcriptDone, uploadable: true },
    ]
  }

  const handleDocumentUpload = async (documentType, file) => {
    if (!application?.id || !file) return
    setDocumentError('')
    setUploadingDocType(documentType)
    try {
      const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
      const storagePath = `${application.id}/${documentType}/${safeName}`

      const { error: uploadError } = await supabase.storage
        .from(SUPABASE_STORAGE_BUCKET)
        .upload(storagePath, file, { upsert: true, contentType: file.type })

      if (uploadError) throw uploadError

      const { error: insertError } = await supabase.from('application_documents').upsert(
        {
          application_id: application.id,
          document_type: documentType,
          file_path: storagePath,
          file_name: file.name,
          file_size: file.size,
          content_type: file.type,
          uploaded_at: new Date().toISOString(),
        },
        { onConflict: 'application_id,document_type' }
      )
      if (insertError) throw insertError

      setApplicationDocuments((prev) => {
        const rest = prev.filter((d) => d.document_type !== documentType)
        return [...rest, { document_type: documentType, file_path: storagePath, file_name: file.name, uploaded_at: new Date().toISOString() }]
      })
    } catch (err) {
      setDocumentError(err.message || t('track.documentUploadError', 'Upload failed. Please try again.'))
    } finally {
      setUploadingDocType(null)
    }
  }

  const pendingInvoices = mergedInvoices.filter(inv => inv.status === 'pending' || inv.status === 'partially_paid')
  const hasPendingInvoices = pendingInvoices.length > 0

  if (loading && !application) {
    return (
      <div className={portalMode ? 'py-16 flex justify-center' : 'min-h-screen bg-gray-50 flex items-center justify-center'}>
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  if (error || !application) {
    return (
      <div className={portalMode ? 'py-8 px-2 flex justify-center' : 'min-h-screen bg-gray-50 flex items-center justify-center p-4'}>
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
          <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('track.notFound', 'Application Not Found')}</h2>
          <p className="text-gray-600 mb-6">{error || t('track.notFoundDesc', 'The application you are looking for does not exist.')}</p>
          <button
            onClick={() => navigate(portalMode ? '/portal' : '/lookup-application')}
            className="px-6 py-3 bg-primary-600 text-white rounded-xl font-semibold hover:bg-primary-700 transition-colors"
          >
            {portalMode ? t('track.backToPortal', 'Back to dashboard') : t('track.backToLookup', 'Back to application lookup')}
          </button>
        </div>
      </div>
    )
  }

  const statusInfo = getStatusInfo(application.status_code)
  const StatusIcon = statusInfo.icon
  const showRegistrationPayment = (application.status_code === 'APPN' || application.status_code === 'APSB') && !showPaymentModal
  const programName = getLocalizedName(application.majors, isRTL) || application.majors?.name_en || 'N/A'
  const dateLocale = isRTL ? 'ar-SA' : 'en-CA'
  const applicationDate = application.created_at
    ? new Date(application.created_at).toLocaleDateString(dateLocale, { year: 'numeric', month: '2-digit', day: '2-digit' })
    : '—'
  const processingStages = getProcessingStages()
  const documentRows = documentItems()
  const hasMissingUploadable = documentRows.some((i) => i.uploadable && !i.done)

  const handlePaymentSuccess = async () => {
    await fetchApplication()
    setShowPaymentModal(false)
    if (id) await fetchApplicationInvoices(parseInt(id, 10))
    if (application?.email) await fetchStudentAndInvoices(application.email)
  }

  const handlePrintRegistrationReceipt = (inv) => {
    const appNo = application?.application_number || '—'
    const name = getApplicantDisplayName(application, isRTL)
    const w = window.open('', '_blank')
    if (!w) return
    const paid = inv.status === 'paid'
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${inv.invoice_number}</title></head><body style="font-family:system-ui,sans-serif;padding:32px;max-width:480px;margin:0 auto;">
      <h1 style="font-size:1.25rem;margin:0 0 8px;">${t('track.paymentReceiptTitle', 'Payment receipt')}</h1>
      <p style="color:#64748b;font-size:0.875rem;margin:0 0 24px;">${t('track.paymentReceiptSubtitle', 'Registration fee — applicant')}</p>
      <table style="width:100%;font-size:0.9rem;border-collapse:collapse;">
        <tr><td style="padding:6px 0;color:#64748b;">${t('public.status.applicationNumber', 'Application #')}</td><td style="padding:6px 0;text-align:right;font-weight:600;">${appNo}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">${t('track.applicantName', 'Applicant')}</td><td style="padding:6px 0;text-align:right;">${name}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">${t('payments.invoiceNumber', 'Invoice #')}</td><td style="padding:6px 0;text-align:right;font-family:monospace;">${inv.invoice_number}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">${t('payments.total', 'Total')}</td><td style="padding:6px 0;text-align:right;">${Number(inv.total_amount || 0).toFixed(2)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">${t('payments.paid', 'Paid')}</td><td style="padding:6px 0;text-align:right;">${paid ? t('payments.paid', 'Paid') : '—'}</td></tr>
      </table>
      <p style="margin-top:32px;font-size:0.75rem;color:#94a3b8;">${t('track.receiptPrintHint', 'Use your browser Print dialog to save as PDF.')}</p>
    </body></html>`)
    w.document.close()
    w.focus()
    w.print()
  }

  const handlePayInvoice = (inv) => {
    setSelectedInvoiceForPayment(inv)
  }

  const handleInvoicePaymentSuccess = () => {
    setSelectedInvoiceForPayment(null)
    if (id) fetchApplicationInvoices(parseInt(id, 10))
    if (application?.email) fetchStudentAndInvoices(application.email)
  }

  return (
    <div
      className={
        portalMode
          ? 'bg-transparent py-0 px-0 sm:px-0'
          : 'min-h-screen bg-[#f4f6fb] py-8 px-4 sm:px-6'
      }
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {/* Registration fee payment modal */}
      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        application={application}
        onPaymentSuccess={handlePaymentSuccess}
      />
      {/* Invoice payment modal (track page – no login required) */}
      <PaymentModal
        isOpen={!!selectedInvoiceForPayment}
        onClose={() => setSelectedInvoiceForPayment(null)}
        invoice={selectedInvoiceForPayment}
        student={student}
        onPaymentSuccess={handleInvoicePaymentSuccess}
      />

      <div className="max-w-6xl mx-auto w-full min-w-0 text-start">
        {!portalMode && (
          <div className={`flex items-center justify-between gap-4 mb-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <button
              type="button"
              onClick={() => navigate('/lookup-application')}
              className="inline-flex items-center gap-2 text-[#6b7a99] hover:text-[#1a3a6b] text-sm font-medium transition-colors"
            >
              <ArrowLeft className={`w-4 h-4 shrink-0 ${isRTL ? 'rotate-180' : ''}`} />
              <span>{t('track.backToLookup', 'Back to application lookup')}</span>
            </button>
            <div className="inline-flex rounded-md border border-[#dde3ef] bg-white p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => changeLanguage('en')}
                className={`px-3 py-1.5 text-sm font-medium rounded-[6px] transition-colors ${language === 'en' ? 'bg-[#1a3a6b] text-white' : 'text-[#6b7a99] hover:bg-[#f4f6fb]'}`}
              >
                {t('applicantPortal.langEnglish', 'English')}
              </button>
              <button
                type="button"
                onClick={() => changeLanguage('ar')}
                className={`px-3 py-1.5 text-sm font-medium rounded-[6px] transition-colors ${language === 'ar' ? 'bg-[#1a3a6b] text-white' : 'text-[#6b7a99] hover:bg-[#f4f6fb]'}`}
              >
                {t('applicantPortal.langArabic', 'العربية')}
              </button>
            </div>
          </div>
        )}
        {portalMode && (
          <nav className="flex flex-wrap items-center gap-1.5 text-sm text-[#6b7a99] mb-5" aria-label="breadcrumb">
            <Link to="/" className="hover:text-[#1a3a6b] no-underline">
              {t('applicantPortal.breadcrumbHome', 'Home')}
            </Link>
            <span className="text-[#dde3ef]">/</span>
            <Link to="/portal" className="hover:text-[#1a3a6b] no-underline">
              {t('applicantPortal.breadcrumbPortal', 'Applicant portal')}
            </Link>
            <span className="text-[#dde3ef]">/</span>
            <span className="text-[#1a3a6b] font-semibold">{t('track.breadcrumbStatus', 'Application status')}</span>
          </nav>
        )}

        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-[#1a3a6b] mb-1">
              {t('track.pageHeading', 'Admission application status')}
            </h1>
            <p className="text-sm text-[#6b7a99]">
              {t('track.pageSubtitle', 'Follow the processing stages of your application')}
              {portalMode && (
                <>
                  {' · '}
                  <span className="font-semibold text-[#1e2a3a]">{getApplicantDisplayName(application, isRTL)}</span>
                </>
              )}
            </p>
          </div>
        </header>

        <div
          className={`rounded-md bg-[#e6f7ef] text-[#1a7a4a] border-s-4 border-[#1a7a4a] px-4 py-3.5 mb-6 text-sm flex items-start gap-2.5 ${isRTL ? 'flex-row-reverse' : ''}`}
          role="status"
        >
          <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
          <p className={`leading-relaxed flex-1 min-w-0 ${isRTL ? 'text-end' : 'text-start'}`}>
            <span className="me-1">{t('track.bannerReceived', 'Your order has been successfully received. Order number:')}</span>
            <strong className="font-mono font-bold">{application.application_number}</strong>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
          <div className="min-w-0">
            <div className="rounded-[10px] border border-[#dde3ef] bg-white shadow-[0_2px_12px_rgba(26,58,107,0.1)] p-6">
              <div className="flex items-center justify-between mb-4 pb-3.5 border-b border-[#dde3ef]">
                <h2 className="text-base font-bold text-[#1a3a6b]">{t('track.stagesTitle', 'Application processing stages')}</h2>
              </div>
              <div className="relative">
                <div
                  className={`absolute top-[18px] bottom-[18px] w-0.5 bg-[#dde3ef] rounded-full hidden sm:block ${isRTL ? 'right-[18px] left-auto' : 'left-[18px]'}`}
                  aria-hidden
                />
                <div className="space-y-0">
                  {processingStages.map((stage, idx) => (
                    <div
                      key={stage.key}
                      className={`relative flex gap-4 ${idx < processingStages.length - 1 ? 'pb-4 mb-4 border-b border-[#dde3ef]' : ''} ${isRTL ? 'flex-row-reverse' : ''}`}
                    >
                      <div className="relative z-10 flex flex-col items-center shrink-0 w-9">
                        {stage.status === 'completed' && (
                          <div className="w-9 h-9 rounded-full bg-[#1a7a4a] text-white flex items-center justify-center text-sm font-bold shadow-sm" aria-hidden>
                            ✓
                          </div>
                        )}
                        {stage.status === 'in_progress' && (
                          <div
                            className="w-9 h-9 rounded-full bg-[#1a3a6b] text-white flex items-center justify-center shadow-sm"
                            aria-current="step"
                          >
                            <RefreshCw className="w-4 h-4 animate-spin" aria-hidden />
                          </div>
                        )}
                        {stage.status === 'pending' && (
                          <div className="w-9 h-9 rounded-full bg-[#dde3ef] text-[#6b7a99] flex items-center justify-center text-sm font-bold">{idx + 1}</div>
                        )}
                      </div>
                      <div className={`min-w-0 flex-1 pt-0.5 ${isRTL ? 'text-end' : 'text-start'}`}>
                        <p
                          className={`text-sm ${
                            stage.status === 'pending'
                              ? 'font-semibold text-[#6b7a99]'
                              : stage.status === 'in_progress'
                                ? 'font-bold text-[#1a3a6b]'
                                : 'font-bold text-[#1e2a3a]'
                          }`}
                        >
                          {stage.title}
                        </p>
                        <p className="text-xs text-[#6b7a99] mt-1 leading-relaxed">
                          {stage.date ? `${stage.date} — ` : ''}
                          {stage.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-6">
            <div className={`rounded-[10px] border border-[#dde3ef] bg-white shadow-[0_2px_12px_rgba(26,58,107,0.1)] p-6 ${isRTL ? 'text-end' : 'text-start'}`}>
              <div className={`flex items-center justify-between mb-4 pb-3.5 border-b border-[#dde3ef] ${isRTL ? 'flex-row-reverse' : ''}`}>
                <h2 className="text-base font-bold text-[#1a3a6b]">{t('track.summaryTitle', 'Application Summary')}</h2>
              </div>
              <dl className="space-y-3 text-[13px]">
                <div>
                  <dt className="text-[#6b7a99]">{t('track.orderNumber', 'Order number')}</dt>
                  <dd className="font-mono font-bold text-[#1e2a3a] mt-0.5">{application.application_number}</dd>
                </div>
                <div>
                  <dt className="text-[#6b7a99]">{t('track.program', 'The program')}</dt>
                  <dd className="font-semibold text-[#1e2a3a] mt-0.5">{programName}</dd>
                </div>
                <div>
                  <dt className="text-[#6b7a99]">{t('track.applicationDate', 'Application date')}</dt>
                  <dd className="font-semibold text-[#1e2a3a] mt-0.5">{applicationDate}</dd>
                </div>
                <div>
                  <dt className="text-[#6b7a99]">{t('track.currentSituation', 'Current situation')}</dt>
                  <dd className="mt-1.5">
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border-0 ${statusInfo.color} ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                      {statusInfo.label}
                    </span>
                  </dd>
                </div>
              </dl>
            </div>

            {student && hasStudentPortalAccess && (
              <div className="rounded-[10px] border border-[#dde3ef] bg-[#f8fafc] shadow-sm p-5">
                <div className={`flex flex-col gap-3 ${isRTL ? 'text-end' : 'text-start'}`}>
                  <div className={`flex items-start gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <div className="w-11 h-11 rounded-lg bg-[#1a3a6b]/10 text-[#1a3a6b] flex items-center justify-center shrink-0">
                      <LogIn className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-[#1a3a6b] text-sm">{t('track.studentPortalTitle', 'Student portal access')}</h3>
                      <p className="text-xs text-[#6b7a99] mt-1">{t('track.studentPortalDesc', 'You can log in to the student portal for grades, courses, and more.')}</p>
                    </div>
                  </div>
                  <Link
                    to="/login/student"
                    className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-[#1a3a6b] hover:bg-[#2a5298] text-white text-sm font-semibold rounded-md transition-colors shadow-sm no-underline"
                  >
                    <LogIn className="w-4 h-4" />
                    {t('track.loginToStudentPortal', 'Login to student portal')}
                  </Link>
                </div>
              </div>
            )}

            <div id="status-documents-panel" className="rounded-[10px] border border-[#dde3ef] bg-white shadow-[0_2px_12px_rgba(26,58,107,0.1)] p-6">
              <div className={`flex items-center justify-between mb-4 pb-3.5 border-b border-[#dde3ef] ${isRTL ? 'flex-row-reverse' : ''}`}>
                <h2 className="text-base font-bold text-[#1a3a6b]">{t('track.documentsTitle', 'Documents')}</h2>
              </div>
              {documentError && <p className="text-sm text-[#b91c1c] mb-3">{documentError}</p>}
              <ul className="space-y-0">
                {documentRows.map((item) => (
                  <li
                    key={item.key}
                    className={`flex flex-col gap-2 py-2.5 border-b border-[#dde3ef] last:border-b-0 ${isRTL ? 'text-end' : 'text-start'}`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="font-medium text-[#1e2a3a]">{item.label}</span>
                      <span
                        className={`inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-full text-xs font-bold ${
                          item.done ? 'bg-[#e6f7ef] text-[#1a7a4a]' : 'bg-[#fef3c7] text-[#b45309]'
                        }`}
                      >
                        {item.done ? '✓' : '⚠'}
                      </span>
                    </div>
                    {item.uploadable && !item.done && (
                      <div className={`flex flex-wrap items-center gap-2 ${isRTL ? 'justify-end' : ''}`}>
                        <input
                          type="file"
                          accept={UPLOADABLE_DOCUMENT_TYPES.find((d) => d.key === item.key)?.accept || '*'}
                          className="text-xs text-[#6b7a99] file:me-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#f0f4fb] file:text-[#1a3a6b] file:font-semibold file:cursor-pointer max-w-full"
                          onChange={(e) => {
                            const f = e.target.files?.[0]
                            if (f) {
                              if (f.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
                                setDocumentError(t('track.documentFileTooBig', `File must be under ${MAX_FILE_SIZE_MB} MB`))
                                return
                              }
                              handleDocumentUpload(item.key, f)
                              e.target.value = ''
                            }
                          }}
                          disabled={uploadingDocType !== null}
                        />
                        {uploadingDocType === item.key && <Loader2 className="w-4 h-4 animate-spin text-[#1a3a6b]" />}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              {hasMissingUploadable && (
                <button
                  type="button"
                  onClick={() => {
                    const panel = document.getElementById('status-documents-panel')
                    const inp = panel?.querySelector('input[type="file"]')
                    inp?.click()
                  }}
                  className="mt-3 w-full py-2 px-3 bg-[#d97706] hover:bg-[#b45309] text-white text-sm font-semibold rounded-md flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  {t('track.uploadMissingDocument', 'Upload the missing document')}
                </button>
              )}
              {showRegistrationPayment && (
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(true)}
                  className="mt-3 w-full py-2.5 px-4 bg-[#d97706] hover:bg-[#b45309] text-white text-sm font-semibold rounded-md flex items-center justify-center gap-2 shadow-sm transition-colors"
                >
                  <CreditCard className="w-4 h-4" />
                  {t('track.payRegistrationFee', 'Pay registration fee')}
                </button>
              )}
            </div>

            {mergedInvoices.length > 0 && (
              <div className="rounded-[10px] border border-[#dde3ef] bg-white shadow-[0_2px_12px_rgba(26,58,107,0.1)] p-6">
                <div className={`flex items-center justify-between mb-4 pb-3.5 border-b border-[#dde3ef] ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <h2 className="text-base font-bold text-[#1a3a6b]">{t('track.invoicesTitle', 'Invoices')}</h2>
                </div>
                <ul className="space-y-2">
                  {mergedInvoices.map((inv) => {
                    const isPending = inv.status === 'pending' || inv.status === 'partially_paid'
                    return (
                      <li
                        key={inv.id}
                        className={`flex flex-wrap items-center justify-between gap-3 rounded-lg py-3 px-2 bg-[#f4f6fb] ${isRTL ? 'flex-row-reverse' : ''}`}
                      >
                        <div className={`flex items-center gap-2 min-w-0 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          {inv.status === 'paid' ? (
                            <div className="w-8 h-8 rounded-full bg-[#e6f7ef] flex items-center justify-center shrink-0">
                              <CheckCircle className="w-4 h-4 text-[#1a7a4a]" />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-[#fef3c7] flex items-center justify-center shrink-0">
                              <AlertTriangle className="w-4 h-4 text-[#b45309]" />
                            </div>
                          )}
                          <div className={`min-w-0 ${isRTL ? 'text-end' : 'text-start'}`}>
                            <p className="font-semibold text-[#1e2a3a] truncate text-sm">{inv.invoice_number}</p>
                            <p className="text-xs text-[#6b7a99]">
                              {inv.invoice_type?.replace(/_/g, ' ')} — {inv.status === 'paid' ? t('payments.paid', 'Paid') : `${inv.pending_amount ?? inv.total_amount} ${t('track.currency', 'SAR')}`}
                            </p>
                          </div>
                        </div>
                        <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                          {inv.status === 'paid' && (
                            <button
                              type="button"
                              onClick={() => handlePrintRegistrationReceipt(inv)}
                              className="py-2 px-3 border border-[#dde3ef] bg-white hover:bg-[#f4f6fb] text-[#1e2a3a] text-xs font-semibold rounded-md inline-flex items-center gap-1.5"
                            >
                              <Printer className="w-4 h-4" />
                              {t('track.printReceipt', 'Print receipt')}
                            </button>
                          )}
                          {isPending && student && (
                            <button
                              type="button"
                              onClick={() => handlePayInvoice(inv)}
                              className="py-2 px-3 bg-[#1a3a6b] hover:bg-[#2a5298] text-white text-xs font-semibold rounded-md shadow-sm"
                            >
                              {t('track.payNow', 'Pay')}
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
