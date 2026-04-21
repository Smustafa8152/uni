import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'
import { checkFinancePermission } from '../../utils/financePermissions'

const UI = {
  p: '#1a3a6b',
  pl: '#2a5298',
  acc: '#c8a84b',
  bg: '#f4f6fb',
  sur: '#ffffff',
  bdr: '#dde3ef',
  txt: '#1e2a3a',
  muted: '#6b7a99',
  ok: '#1a7a4a',
  okBg: '#e6f7ef',
  warn: '#b45309',
  warnBg: '#fef3c7',
  err: '#b91c1c',
  errBg: '#fee2e2',
}

const formatDate = (iso) => {
  if (!iso) return '—'
  try {
    return String(iso).slice(0, 10)
  } catch {
    return '—'
  }
}

export default function StudentHolds() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { isRTL, language } = useLanguage()

  const isArabic = isRTL || language === 'ar'

  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(null)
  const [activeSemester, setActiveSemester] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [semesterFinance, setSemesterFinance] = useState(null)
  const [holdReason, setHoldReason] = useState(null) // financial_hold_reasons row
  const [docs, setDocs] = useState([])
  const [audit, setAudit] = useState([])
  const [registrationGate, setRegistrationGate] = useState({ allowed: true, reason: '' })

  useEffect(() => {
    if (user?.email) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email])

  const fetchAll = async () => {
    if (!user?.email) return
    try {
      setLoading(true)

      const { data: studentData, error: studentErr } = await supabase
        .from('students')
        .select('id, student_id, name_en, name_ar, first_name, last_name, email, financial_hold_reason_code, college_id')
        .eq('email', user.email)
        .eq('status', 'active')
        .single()
      if (studentErr || !studentData) {
        setStudent(null)
        return
      }
      setStudent(studentData)

      const { data: semData } = await supabase
        .from('semesters')
        .select('id, name_en, name_ar, start_date, end_date, status')
        .in('status', ['active', 'registration_open'])
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      setActiveSemester(semData || null)

      const { data: invData } = await supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, paid_amount, pending_amount, status, invoice_type, due_date, invoice_date, semester_id')
        .eq('student_id', studentData.id)
      setInvoices(invData || [])

      if (semData?.id) {
        const { data: semStatus } = await supabase
          .from('student_semester_financial_status')
          .select('id, semester_id, financial_milestone_code, financial_hold_reason_code, total_due, total_paid')
          .eq('student_id', studentData.id)
          .eq('semester_id', semData.id)
          .maybeSingle()
        setSemesterFinance(semStatus || null)

        const milestone = semStatus?.financial_milestone_code || 'PM00'
        const hold = semStatus?.financial_hold_reason_code || studentData.financial_hold_reason_code || null
        const gate = checkFinancePermission('SE_REG', milestone, hold)
        setRegistrationGate(gate)

        const holdCode = hold ?? null
        if (holdCode) {
          const { data: reasonRow } = await supabase
            .from('financial_hold_reasons')
            .select('code, name_en, name_ar')
            .eq('code', holdCode)
            .maybeSingle()
          setHoldReason(reasonRow || null)
        } else {
          setHoldReason(null)
        }
      } else {
        setSemesterFinance(null)
        const gate = checkFinancePermission('SE_REG', 'PM00', studentData.financial_hold_reason_code || null)
        setRegistrationGate(gate)

        const holdCode = studentData.financial_hold_reason_code || null
        if (holdCode) {
          const { data: reasonRow } = await supabase
            .from('financial_hold_reasons')
            .select('code, name_en, name_ar')
            .eq('code', holdCode)
            .maybeSingle()
          setHoldReason(reasonRow || null)
        } else {
          setHoldReason(null)
        }
      }

      const { data: docRows } = await supabase
        .from('student_documents')
        .select('id, document_type, file_name, expiry_date, status, uploaded_at')
        .eq('student_id', studentData.id)
        .order('uploaded_at', { ascending: false })
      setDocs(docRows || [])

      const { data: auditRows } = await supabase
        .from('status_change_audit_log')
        .select('id, entity_type, entity_id, from_status_code, to_status_code, trigger_code, notes, created_at')
        .eq('entity_type', 'student')
        .eq('entity_id', studentData.id)
        .order('created_at', { ascending: false })
        .limit(10)
      setAudit(auditRows || [])
    } catch (e) {
      console.error('StudentHolds fetch error:', e)
    } finally {
      setLoading(false)
    }
  }

  const balanceDue = useMemo(() => invoices.reduce((sum, inv) => sum + parseFloat(inv.pending_amount || 0), 0), [invoices])
  const semesterLabel = useMemo(() => (activeSemester ? getLocalizedName(activeSemester, isArabic) : '—'), [activeSemester, isArabic])

  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const expiredDocs = useMemo(() => {
    return (docs || []).filter((d) => d?.expiry_date && String(d.expiry_date) < todayISO)
  }, [docs, todayISO])

  const hardHoldActive = useMemo(() => {
    // Treat any registration finance gate block as "hard hold" (matches what student sees in registration UI)
    if (registrationGate?.allowed === false) return true
    return balanceDue > 0 || !!student?.financial_hold_reason_code || !!semesterFinance?.financial_hold_reason_code
  }, [registrationGate?.allowed, balanceDue, student?.financial_hold_reason_code, semesterFinance?.financial_hold_reason_code])

  const softHoldActive = expiredDocs.length > 0

  const hardHoldTitle = useMemo(() => {
    const reasonName = holdReason ? getLocalizedName(holdReason, isArabic) : null
    if (registrationGate?.allowed === false && !reasonName) {
      return t('studentPortal.holds.registrationBlockedTitle', { defaultValue: 'Registration is blocked' })
    }
    return reasonName || t('studentPortal.holds.financialHoldDefaultTitle', { defaultValue: 'Unpaid tuition fees' })
  }, [holdReason, isArabic, t, registrationGate?.allowed])

  const hardHoldDesc = useMemo(() => {
    const sar = isArabic ? 'ر.س' : 'SAR'
    if (registrationGate?.allowed === false) {
      return (
        registrationGate?.reason ||
        t('studentPortal.holds.registrationBlockedDesc', {
          defaultValue: 'Your account is currently restricted from course registration. Please resolve the blocking condition to continue.',
        })
      )
    }
    if (balanceDue > 0) {
      return t('studentPortal.holds.financialHoldDesc', {
        defaultValue: 'There is an outstanding balance of {{amount}} for {{semester}}. Full payment is required to clear this hold.',
        amount: `${balanceDue.toFixed(0)} ${sar}`,
        semester: semesterLabel,
      })
    }
    return t('studentPortal.holds.financialHoldDescNoAmount', {
      defaultValue: 'There is an active financial hold on your account. Please contact finance office to clear it.',
    })
  }, [registrationGate?.allowed, registrationGate?.reason, balanceDue, isArabic, semesterLabel, t])

  const displayName = useMemo(() => {
    const fromStudent = student ? getLocalizedName(student, isArabic) : ''
    if (fromStudent) return fromStudent
    return student?.email?.split('@')?.[0] || '—'
  }, [student, isArabic])

  if (loading && !student) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-slate-600 border-t-transparent" />
      </div>
    )
  }

  if (!student) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-6 text-center">
        <p className="text-amber-800">{t('studentPortal.noStudentData', { defaultValue: 'Student data not found.' })}</p>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${isArabic ? 'text-right' : 'text-left'}`} dir={isArabic ? 'rtl' : 'ltr'}>
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-2 text-sm" style={{ color: UI.muted }} aria-label="مسار التنقل">
        <a href="/" className="no-underline hover:underline" style={{ color: UI.muted }}>
          {t('studentPortal.documents.breadcrumbHome', { defaultValue: 'Home' })}
        </a>
        <span style={{ color: UI.bdr }}>/</span>
        <a href="/dashboard" className="no-underline hover:underline" style={{ color: UI.muted }}>
          {t('studentPortal.studentPortal', { defaultValue: 'Student Portal' })}
        </a>
        <span style={{ color: UI.bdr }}>/</span>
        <span className="font-semibold" style={{ color: UI.p }}>
          {t('studentPortal.holds.title', { defaultValue: 'Holds & blocks' })}
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: UI.p }}>
            {t('studentPortal.holds.title', { defaultValue: 'Holds & blocks' })}
          </h1>
          <p className="text-sm" style={{ color: UI.muted }}>
            {t('studentPortal.holds.subtitle', { defaultValue: 'View active holds and how to clear them' })}
          </p>
          <div className="text-xs mt-1" style={{ color: UI.muted }}>
            {displayName}
          </div>
        </div>
      </div>

      {/* Top alert */}
      {hardHoldActive && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: UI.err, backgroundColor: UI.errBg, color: UI.err }}>
          🚫{' '}
          <strong>
            {t('studentPortal.holds.hardHoldBadge', {
              defaultValue: 'Hard Hold',
            })}
          </strong>{' '}
          — {t('studentPortal.holds.hardHoldTopMessage', { defaultValue: 'Blocks course registration and official document requests until cleared.' })}
        </div>
      )}

      {/* Active holds */}
      <div className="bg-white rounded-xl border shadow-sm p-6" style={{ borderColor: UI.bdr }}>
        <div className="flex items-center justify-between pb-4 mb-4 border-b" style={{ borderColor: UI.bdr }}>
          <div>
            <div className="text-base font-extrabold" style={{ color: UI.p }}>
              {t('studentPortal.holds.activeHolds', { defaultValue: 'Active holds' })}
            </div>
          </div>
          <span
            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold"
            style={{
              backgroundColor: hardHoldActive ? UI.errBg : UI.okBg,
              color: hardHoldActive ? UI.err : UI.ok,
            }}
          >
            {hardHoldActive
              ? t('studentPortal.holds.hardHoldCount', { defaultValue: '1 hard hold' })
              : t('studentPortal.holds.noHardHolds', { defaultValue: 'No hard holds' })}
          </span>
        </div>

        {hardHoldActive ? (
          <div className="rounded-xl border-2 p-5 flex gap-4" style={{ borderColor: UI.err, backgroundColor: UI.errBg }}>
            <div className="text-2xl leading-none" aria-hidden="true">
              💰
            </div>
            <div className="flex-1">
              <div className="text-xs font-extrabold uppercase tracking-wide mb-1" style={{ color: UI.err }}>
                {t('studentPortal.holds.financialHardHold', { defaultValue: 'Financial hold — Hard Hold' })}
              </div>
              <div className="text-sm font-extrabold mb-1" style={{ color: UI.err }}>
                {hardHoldTitle}
              </div>
              <div className="text-sm mb-3" style={{ color: UI.err }}>
                {hardHoldDesc}
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/student/payments"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-xs font-extrabold text-white"
                  style={{ backgroundColor: UI.err }}
                >
                  💳 {t('studentPortal.holds.payNow', { defaultValue: 'Pay now' })}
                </a>
                <a
                  href="/student/payments"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-xs font-extrabold"
                  style={{ backgroundColor: UI.bg, border: `1px solid ${UI.bdr}`, color: UI.txt }}
                >
                  {t('studentPortal.holds.viewInvoice', { defaultValue: 'View invoice' })}
                </a>
                <a
                  href="/student/coming-soon"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-xs font-extrabold"
                  style={{ backgroundColor: UI.bg, border: `1px solid ${UI.bdr}`, color: UI.txt }}
                >
                  ❓ {t('studentPortal.holds.contactFinance', { defaultValue: 'Contact finance office' })}
                </a>
              </div>
            </div>
            <div className="text-xs" style={{ color: UI.muted, textAlign: isArabic ? 'right' : 'left' }}>
              <div>{t('studentPortal.holds.addedOn', { defaultValue: 'Added on' })}</div>
              <div className="font-extrabold" data-field="hold_date">
                {formatDate(student?.status_updated_at || activeSemester?.start_date)}
              </div>
              <div className="mt-2">{t('studentPortal.holds.responsibleParty', { defaultValue: 'Responsible party' })}</div>
              <div className="font-extrabold">{t('studentPortal.holds.financeDept', { defaultValue: 'Finance Department' })}</div>
            </div>
          </div>
        ) : (
          <div className="text-sm" style={{ color: UI.muted }}>
            {t('studentPortal.holds.noActiveHolds', { defaultValue: 'No active holds.' })}
          </div>
        )}
      </div>

      {/* Soft holds */}
      <div className="bg-white rounded-xl border shadow-sm p-6" style={{ borderColor: UI.bdr }}>
        <div className="flex items-center justify-between pb-4 mb-4 border-b" style={{ borderColor: UI.bdr }}>
          <div className="text-base font-extrabold" style={{ color: UI.p }}>
            {t('studentPortal.holds.softHoldsTitle', { defaultValue: 'Soft holds (warnings)' })}
          </div>
          <span
            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold"
            style={{
              backgroundColor: softHoldActive ? UI.warnBg : UI.okBg,
              color: softHoldActive ? UI.warn : UI.ok,
            }}
          >
            {softHoldActive
              ? t('studentPortal.holds.softHoldCount', { defaultValue: '1 soft hold' })
              : t('studentPortal.holds.noSoftHolds', { defaultValue: 'No warnings' })}
          </span>
        </div>

        {softHoldActive ? (
          <div className="rounded-xl border-2 p-5 flex gap-4" style={{ borderColor: UI.warn, backgroundColor: UI.warnBg }}>
            <div className="text-2xl leading-none" aria-hidden="true">
              📄
            </div>
            <div className="flex-1">
              <div className="text-xs font-extrabold uppercase tracking-wide mb-1" style={{ color: UI.warn }}>
                {t('studentPortal.holds.docSoftHold', { defaultValue: 'Documents hold — Soft Hold' })}
              </div>
              <div className="text-sm font-extrabold mb-1" style={{ color: UI.warn }}>
                {t('studentPortal.holds.expiredDocTitle', { defaultValue: 'Expired document' })}
              </div>
              <div className="text-sm mb-3" style={{ color: UI.warn }}>
                {t('studentPortal.holds.expiredDocDesc', {
                  defaultValue: 'One or more of your documents is expired. Please update it within 30 days to avoid converting into a hard hold.',
                })}
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href="/student/documents"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-xs font-extrabold text-white"
                  style={{ backgroundColor: '#d97706' }}
                >
                  ↑ {t('studentPortal.holds.uploadUpdated', { defaultValue: 'Upload updated document' })}
                </a>
                <a
                  href="/student/coming-soon"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-xs font-extrabold"
                  style={{ backgroundColor: UI.bg, border: `1px solid ${UI.bdr}`, color: UI.txt }}
                >
                  ❓ {t('studentPortal.holds.help', { defaultValue: 'Help' })}
                </a>
              </div>
            </div>
            <div className="text-xs" style={{ color: UI.muted, textAlign: isArabic ? 'right' : 'left' }}>
              <div>{t('studentPortal.holds.addedOn', { defaultValue: 'Added on' })}</div>
              <div className="font-extrabold" data-field="hold_date">
                {formatDate(expiredDocs?.[0]?.expiry_date)}
              </div>
              <div className="mt-2">{t('studentPortal.holds.responsibleParty', { defaultValue: 'Responsible party' })}</div>
              <div className="font-extrabold">{t('studentPortal.holds.admissionsDept', { defaultValue: 'Admissions' })}</div>
            </div>
          </div>
        ) : (
          <div className="text-sm" style={{ color: UI.muted }}>
            {t('studentPortal.holds.noSoftHoldMessage', { defaultValue: 'No warnings at the moment.' })}
          </div>
        )}
      </div>

      {/* Cleared holds history (best-effort, from audit log) */}
      <div className="bg-white rounded-xl border shadow-sm p-6" style={{ borderColor: UI.bdr }}>
        <div className="flex items-center justify-between pb-4 mb-4 border-b" style={{ borderColor: UI.bdr }}>
          <div className="text-base font-extrabold" style={{ color: UI.p }}>
            {t('studentPortal.holds.historyTitle', { defaultValue: 'Previously cleared holds' })}
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: UI.bdr }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: UI.p, color: 'white' }}>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.holds.colType', { defaultValue: 'Hold type' })}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.holds.colReason', { defaultValue: 'Reason' })}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.holds.colAdded', { defaultValue: 'Added on' })}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.holds.colCleared', { defaultValue: 'Cleared on' })}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.holds.colClearedBy', { defaultValue: 'Cleared by' })}</th>
              </tr>
            </thead>
            <tbody>
              {(audit || []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center" style={{ color: UI.muted }}>
                    {t('studentPortal.holds.noHistory', { defaultValue: 'No history available yet.' })}
                  </td>
                </tr>
              ) : (
                audit.map((row) => (
                  <tr key={row.id} className="border-b hover:bg-slate-50" style={{ borderColor: UI.bdr }}>
                    <td className="px-4 py-3" data-field="hold_type">
                      {t('studentPortal.holds.historyGenericType', { defaultValue: 'Status' })}
                    </td>
                    <td className="px-4 py-3" data-field="hold_reason">
                      {row.notes || row.to_status_code || '—'}
                    </td>
                    <td className="px-4 py-3" data-field="hold_date">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-4 py-3" data-field="cleared_date">
                      {'—'}
                    </td>
                    <td className="px-4 py-3" data-field="cleared_by">
                      {'—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* How holds work */}
      <div className="bg-white rounded-xl border shadow-sm p-6" style={{ borderColor: UI.bdr }}>
        <div className="flex items-center justify-between pb-4 mb-4 border-b" style={{ borderColor: UI.bdr }}>
          <div className="text-base font-extrabold" style={{ color: UI.p }}>
            {t('studentPortal.holds.howTitle', { defaultValue: 'How holds work' })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="p-4 rounded-lg border" style={{ backgroundColor: UI.errBg, borderColor: UI.err, color: UI.err }}>
            <div className="font-extrabold mb-2">🚫 {t('studentPortal.holds.hardHold', { defaultValue: 'Hard Hold' })}</div>
            <ul className="list-disc pr-5 space-y-1">
              <li>{t('studentPortal.holds.hard1', { defaultValue: 'Blocks course registration' })}</li>
              <li>{t('studentPortal.holds.hard2', { defaultValue: 'Blocks official document requests' })}</li>
              <li>{t('studentPortal.holds.hard3', { defaultValue: 'May block grade viewing (depending on policy)' })}</li>
              <li>{t('studentPortal.holds.hard4', { defaultValue: 'Should be cleared immediately' })}</li>
            </ul>
          </div>
          <div className="p-4 rounded-lg border" style={{ backgroundColor: UI.warnBg, borderColor: UI.warn, color: UI.warn }}>
            <div className="font-extrabold mb-2">⚠️ {t('studentPortal.holds.softHold', { defaultValue: 'Soft Hold' })}</div>
            <ul className="list-disc pr-5 space-y-1">
              <li>{t('studentPortal.holds.soft1', { defaultValue: 'Warning — does not block services' })}</li>
              <li>{t('studentPortal.holds.soft2', { defaultValue: 'May convert to a hard hold if not resolved' })}</li>
              <li>{t('studentPortal.holds.soft3', { defaultValue: 'Shown in the dashboard' })}</li>
              <li>{t('studentPortal.holds.soft4', { defaultValue: 'Recommended to resolve soon' })}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

