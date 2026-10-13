import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ArrowUpRight, CalendarRange, ClipboardList, FileCheck2, GraduationCap, RefreshCw, UserCheck, Users, Wallet } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { getLocalizedName } from '../utils/localizedName'
import { getCurrencyCodeFromFinancialSettings } from '../utils/getCollegeSettings'
import { describeRegistrationState, isDraftSemester, isFinishedSemester, isRunningSemester, registrationState } from '../utils/registrationRules'
import { Button, Panel, Skeleton } from '../components/ui'
import StudentDashboard from './student/StudentDashboard'
import { BarList, ColumnChart, Funnel, SplitBar, TrendLine, chartColors } from '../components/dashboard/Charts'

const NS = 'dashboardHome'

/** The same groups the applications list filters by, so a number here matches the list it opens. */
const PENDING_CODES = new Set(['APSB', 'APPN', 'RVQU', 'RVIN', 'DCPN', 'ENPN'])
const ACCEPTED_CODES = new Set(['DCFA', 'DCCA', 'ENCF', 'ENAC'])
/** An application waiting longer than this is flagged. */
const WAITING_DAYS = 7
const VOID_INVOICE = new Set(['cancelled', 'canceled', 'void', 'voided', 'draft', 'refunded'])
const DAY = 24 * 60 * 60 * 1000

const num = (value) => {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? '0'))
  return Number.isFinite(n) ? n : 0
}

/** Reads every row of a query, 1000 at a time (the API returns at most 1000 per request). */
async function fetchAll(build) {
  const rows = []
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return rows
}

export default function Dashboard() {
  const { userRole } = useAuth()
  if (userRole === 'student') return <StudentDashboard />
  if (userRole === 'instructor') return <Navigate to="/instructor/dashboard" replace />
  return <StaffDashboard />
}

function StaffDashboard() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const { userRole, collegeId } = useAuth()
  const collegeScope = userRole === 'user' && collegeId ? Number(collegeId) : null

  const [state, setState] = useState({ loading: true })

  const load = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: '' }))
    try {
      const scoped = (query, column = 'college_id') => (collegeScope ? query.eq(column, collegeScope) : query)
      const [students, applications, colleges, semesters, codes, settings, instructors, audit, majors, enrollments, subjects] = await Promise.all([
        fetchAll(() => scoped(supabase.from('students').select('id, status, college_id, created_at, major_id, enrollment_date, has_scholarship'))),
        fetchAll(() => scoped(supabase.from('applications').select('id, status_code, created_at, college_id, status_changed_at, gender, nationality, major_id, referral_source, offer_sent_at, interview_at, exam_at'))),
        supabase.from('colleges').select('id, name_en, name_ar, status').eq('status', 'active'),
        supabase
          .from('semesters')
          .select(
            `id, name_en, name_ar, code, status, start_date, end_date, college_id, is_university_wide,
             registration_start_date, registration_end_date, late_registration_end_date,
             course_registration_allowed, late_registration_allowed, academic_years ( id, registration_open )`
          )
          .order('start_date', { ascending: false }),
        supabase.from('student_status_codes').select('code, name_en, name_ar, category'),
        supabase.from('university_settings').select('financial_settings').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
        fetchAll(() => scoped(supabase.from('instructors').select('id, name_en, name_ar').eq('status', 'active'))),
        supabase.from('status_change_audit_log').select('id, entity_type, entity_id, to_status_code, created_at').eq('entity_type', 'application').order('created_at', { ascending: false }).limit(40),
        supabase.from('majors').select('id, name_en, name_ar'),
        fetchAll(() => scoped(supabase.from('enrollments').select('id, semester_id, status, grade, grade_points'))).catch(() => []),
        supabase.from('subjects').select('id', { count: 'exact', head: true }),
      ])

      const semesterRows = (semesters.data || []).filter((s) => !collegeScope || s.is_university_wide || Number(s.college_id) === collegeScope)
      const focus =
        semesterRows.filter((s) => registrationState(s).allowed).sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))[0] ||
        semesterRows.find((s) => isRunningSemester(s)) ||
        null

      // Classes of every semester that is not over: counts per semester, seats, missing instructors.
      const liveIds = semesterRows.filter((s) => !isFinishedSemester(s)).map((s) => s.id)
      const classes = liveIds.length
        ? await fetchAll(() => scoped(supabase.from('classes').select('id, semester_id, enrolled, capacity, instructor_id, status').in('semester_id', liveIds)))
        : []

      const [invoices, unverifiedDocs] = await Promise.all([
        fetchAll(() => scoped(supabase.from('invoices').select('id, status, total_amount, paid_amount, pending_amount, due_date, parent_invoice_id'))).catch(() => []),
        fetchAll(() => supabase.from('application_documents').select('application_id').is('verified_at', null)).catch(() => []),
      ])

      // Names for the activity feed.
      const auditRows = (audit.data || []).filter((r) => r.entity_id)
      const feedIds = [...new Set(auditRows.map((r) => r.entity_id))].slice(0, 40)
      const feedApps = feedIds.length
        ? (await supabase.from('applications').select('id, application_number, first_name, last_name, first_name_ar, college_id').in('id', feedIds)).data || []
        : []

      setState({
        loading: false,
        students,
        applications,
        colleges: colleges.data || [],
        semesters: semesterRows,
        focus,
        classes,
        invoices,
        unverifiedDocs,
        codes: Object.fromEntries((codes.data || []).map((c) => [c.code, c])),
        currency: getCurrencyCodeFromFinancialSettings(settings.data?.financial_settings) || null,
        instructors: instructors.length,
        instructorRows: Object.fromEntries(instructors.map((i) => [i.id, i])),
        enrollments,
        subjects: subjects.count ?? null,
        audit: auditRows,
        feedApps: Object.fromEntries(feedApps.map((a) => [a.id, a])),
        majors: Object.fromEntries((majors.data || []).map((m) => [m.id, m])),
        loadedAt: new Date(),
      })
    } catch (err) {
      console.error('Dashboard load failed:', err)
      setState({ loading: false, error: err.message || String(err) })
    }
  }, [collegeScope])

  useEffect(() => {
    load()
  }, [load])

  // ---- figures ----
  const f = useMemo(() => {
    if (state.loading || state.error) return null
    const now = Date.now()
    const monthStart = new Date()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const activeStudents = state.students.filter((s) => s.status === 'active')
    const newStudents = state.students.filter((s) => s.created_at && new Date(s.created_at) >= monthStart).length

    const apps = state.applications
    const pending = apps.filter((a) => PENDING_CODES.has(a.status_code))
    const waitingLong = pending.filter((a) => a.created_at && now - new Date(a.created_at).getTime() > WAITING_DAYS * DAY)
    const oldestDays = pending.reduce((max, a) => Math.max(max, a.created_at ? Math.floor((now - new Date(a.created_at).getTime()) / DAY) : 0), 0)
    const accepted = apps.filter((a) => ACCEPTED_CODES.has(a.status_code)).length
    const newApps = apps.filter((a) => a.created_at && new Date(a.created_at) >= monthStart).length

    const pendingIds = new Set(pending.map((a) => a.id))
    const appsWithUnverified = new Set(state.unverifiedDocs.map((d) => d.application_id).filter((id) => pendingIds.has(id))).size

    // Applications per month, the last six months including this one.
    const months = []
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date()
      d.setDate(1)
      d.setMonth(d.getMonth() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      months.push({ key, date: d, count: 0 })
    }
    for (const a of apps) {
      const key = String(a.created_at || '').slice(0, 7)
      const m = months.find((x) => x.key === key)
      if (m) m.count += 1
    }

    // Where applications stand, by status, largest first.
    const byStatus = new Map()
    for (const a of apps) byStatus.set(a.status_code || '—', (byStatus.get(a.status_code || '—') || 0) + 1)
    const statuses = [...byStatus.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count)

    // Students by college.
    const byCollege = new Map()
    for (const s of activeStudents) byCollege.set(s.college_id, (byCollege.get(s.college_id) || 0) + 1)
    const colleges = state.colleges
      .map((c) => ({ id: c.id, name: (getLocalizedName(c, isRTL) || c.name_en || '').trim(), count: byCollege.get(c.id) || 0 }))
      .filter((c) => c.count > 0 || !collegeScope)
      .sort((a, b) => b.count - a.count)

    // Money (a split semester invoice counts through its portions only).
    const parents = new Set(state.invoices.map((r) => r.parent_invoice_id).filter(Boolean))
    const payable = state.invoices.filter((r) => !parents.has(r.id) && !VOID_INVOICE.has(String(r.status || '').toLowerCase()))
    const today = new Date().toISOString().slice(0, 10)
    const money = {
      count: payable.length,
      billed: payable.reduce((s, r) => s + num(r.total_amount), 0),
      paid: payable.reduce((s, r) => s + num(r.paid_amount), 0),
      due: payable.reduce((s, r) => s + num(r.pending_amount), 0),
      overdue: payable.filter((r) => num(r.pending_amount) > 0 && r.due_date && r.due_date < today).length,
    }

    // The semester staff are working on.
    const focusClasses = state.focus ? state.classes.filter((c) => c.semester_id === state.focus.id && c.status !== 'inactive') : []
    const semester = state.focus
      ? {
          row: state.focus,
          state: registrationState(state.focus),
          classes: focusClasses.length,
          seats: focusClasses.reduce((s, c) => s + num(c.enrolled), 0),
          capacity: focusClasses.reduce((s, c) => s + num(c.capacity), 0),
          noInstructor: focusClasses.filter((c) => !c.instructor_id).length,
        }
      : null

    // Semester set-up problems, the same checks as the Semesters page.
    const classCount = new Map()
    for (const c of state.classes) classCount.set(c.semester_id, (classCount.get(c.semester_id) || 0) + 1)
    const semesterIssues = []
    for (const s of state.semesters) {
      const reg = registrationState(s)
      if (reg.allowed && !(classCount.get(s.id) > 0)) semesterIssues.push({ s, key: 'openNoClasses' })
      else if (isDraftSemester(s) && !isFinishedSemester(s) && s.start_date && new Date(s.start_date) <= new Date()) semesterIssues.push({ s, key: 'draftStarted' })
    }

    // ---- admissions analytics ----
    const category = (code) => state.codes[code]?.category || ''
    const LATER = new Set(['review', 'decision', 'enrollment', 'academic', 'graduation'])
    const received = apps.filter((a) => a.status_code !== 'APDR')
    const reviewed = received.filter((a) => LATER.has(category(a.status_code)))
    const decided = reviewed.filter((a) => (category(a.status_code) === 'decision' && a.status_code !== 'DCPN') || ['enrollment', 'academic', 'graduation'].includes(category(a.status_code)))
    const enrolledApps = apps.filter((a) => a.status_code === 'ENCF' || a.status_code === 'ENAC')
    const funnel = [
      { key: 'received', count: received.length },
      { key: 'reviewed', count: reviewed.length },
      { key: 'decided', count: decided.length },
      { key: 'accepted', count: accepted },
      { key: 'enrolled', count: enrolledApps.length },
    ]

    // Days from applying to the decision (accepted or rejected, decision still current).
    const decisionDays = apps
      .filter((a) => ['DCFA', 'DCCA', 'DCRJ'].includes(a.status_code) && a.status_changed_at && a.created_at)
      .map((a) => (new Date(a.status_changed_at) - new Date(a.created_at)) / DAY)
      .filter((d) => d >= 0)
      .sort((a, b) => a - b)
    const medianDecision = decisionDays.length ? decisionDays[Math.floor(decisionDays.length / 2)] : null
    const rejected = apps.filter((a) => a.status_code === 'DCRJ').length
    const offers = apps.filter((a) => a.offer_sent_at).length
    const soon = now + 14 * DAY
    const upcoming = apps.reduce((sum, a) => sum + [a.interview_at, a.exam_at].filter((d) => d && new Date(d).getTime() >= now && new Date(d).getTime() <= soon).length, 0)

    // Applications per day, the last 30 days.
    const days = []
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(now - i * DAY)
      days.push({ key: d.toLocaleDateString('en-CA'), date: d, count: 0 })
    }
    const dayIndex = new Map(days.map((d, i) => [d.key, i]))
    for (const a of apps) {
      if (!a.created_at) continue
      const i = dayIndex.get(new Date(a.created_at).toLocaleDateString('en-CA'))
      if (i != null) days[i].count += 1
    }
    const last30 = days.reduce((s, d) => s + d.count, 0)

    const tally = (rows, pick) => {
      const m = new Map()
      for (const r of rows) {
        const k = pick(r)
        m.set(k, (m.get(k) || 0) + 1)
      }
      return [...m.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)
    }
    const topWithOther = (list, size) => {
      const known = list.filter((x) => x.key !== '')
      const head = known.slice(0, size)
      const rest = known.slice(size).reduce((s, x) => s + x.count, 0)
      return { head, rest, unknown: list.find((x) => x.key === '')?.count || 0 }
    }
    const nationalities = topWithOther(tally(received, (a) => String(a.nationality || '').trim().toUpperCase()), 6)
    const majors = topWithOther(tally(received, (a) => (a.major_id ? String(a.major_id) : '')), 6)
    const gender = tally(received, (a) => {
      const g = String(a.gender || '').toLowerCase()
      return g === 'male' || g === 'female' ? g : ''
    })
    const referral = tally(received, (a) => String(a.referral_source || '').trim().toLowerCase()).filter((x) => x.key !== '')
    const referralAnswered = referral.reduce((s, x) => s + x.count, 0)

    // ---- teaching ----
    const takenRegs = state.enrollments.filter((e) => String(e.status || '').toLowerCase() !== 'dropped')
    const regsBySemester = tally(takenRegs, (e) => String(e.semester_id || ''))
    const semesterById = new Map(state.semesters.map((x) => [String(x.id), x]))
    const registrations = regsBySemester
      .filter((r) => r.key && semesterById.has(r.key))
      .map((r) => ({ ...r, row: semesterById.get(r.key) }))
      .sort((a, b) => String(b.row.start_date || '').localeCompare(String(a.row.start_date || '')))
    const GRADE_ORDER = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F']
    const graded = takenRegs.filter((e) => GRADE_ORDER.includes(String(e.grade || '').trim().toUpperCase()))
    const letterOf = (e) => String(e.grade).trim().toUpperCase()
    const gradeCounts = ['A', 'B', 'C', 'D', 'F'].map((g) => ({ key: g, count: graded.filter((e) => letterOf(e).charAt(0) === g).length }))
    const failed = gradeCounts.find((g) => g.key === 'F').count
    // Pass rate per semester (graded courses only), newest first.
    const passBySemester = registrations
      .map((r) => {
        const rows = graded.filter((e) => String(e.semester_id) === r.key)
        const pass = rows.filter((e) => letterOf(e) !== 'F').length
        return { key: r.key, row: r.row, graded: rows.length, rate: rows.length ? Math.round((pass / rows.length) * 100) : null }
      })
      .filter((r) => r.graded > 0)
    const passRate = graded.length ? ((graded.length - failed) / graded.length) * 100 : null

    // ---- students ----
    const studentMajors = topWithOther(tally(activeStudents, (x) => (x.major_id ? String(x.major_id) : '')), 6)
    const thisYear = new Date().getFullYear()
    const intake = []
    for (let y = thisYear - 5; y <= thisYear; y += 1) intake.push({ key: String(y), count: 0 })
    for (const x of state.students) {
      const y = String(x.enrollment_date || x.created_at || '').slice(0, 4)
      const slot = intake.find((i) => i.key === y)
      if (slot) slot.count += 1
    }

    return {
      registrationsTotal: takenRegs.length,
      scholarshipStudents: activeStudents.filter((x) => x.has_scholarship === true).length,
      registrations,
      gradeCounts,
      gradedCount: graded.length,
      passRate,
      passBySemester,
      studentMajors,
      intake,
      funnel,
      medianDecision,
      decisionCount: decisionDays.length,
      rejected,
      offers,
      upcoming,
      days,
      last30,
      nationalities,
      majors,
      gender,
      referral,
      referralAnswered,
      received: received.length,
      activeStudents: activeStudents.length,
      newStudents,
      pending: pending.length,
      waitingLong: waitingLong.length,
      oldestDays,
      accepted,
      totalApps: apps.length,
      newApps,
      appsWithUnverified,
      months,
      statuses,
      colleges,
      money,
      semester,
      semesterIssues,
    }
  }, [state, isRTL, collegeScope])

  // ---- words ----
  const locale = language === 'ar' ? 'ar-u-nu-latn' : 'en-GB'
  const n = (value) => Number(value || 0).toLocaleString(locale)
  const money = (value) => {
    const text = num(value).toLocaleString(locale, { maximumFractionDigits: 0 })
    return state.currency ? `${text} ${state.currency}` : text
  }
  const fmtDate = (value) => (value ? new Date(value).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) : '')
  const codeName = (code) => {
    const row = state.codes?.[code]
    return row ? (language === 'ar' ? row.name_ar || row.name_en : row.name_en || row.name_ar) : code
  }
  const nameOf = (row) => (row ? getLocalizedName(row, isRTL) || row.name_en || row.name_ar || '' : '')
  const ago = (value) => {
    const diff = (new Date(value).getTime() - Date.now()) / 1000
    const rtf = new Intl.RelativeTimeFormat(language === 'ar' ? 'ar' : 'en', { numeric: 'auto' })
    const abs = Math.abs(diff)
    if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
    if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
    if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day')
    return fmtDate(value)
  }
  const applicantName = (app) => {
    if (!app) return ''
    const latin = [app.first_name, app.last_name].filter(Boolean).join(' ').trim()
    const arabic = String(app.first_name_ar || '').trim()
    return (language === 'ar' ? arabic || latin : latin || arabic) || app.application_number || `#${app.id}`
  }

  const attention = []
  if (f) {
    if (f.waitingLong > 0) attention.push({ tone: 'err', text: t(`${NS}.attention.waiting`, { count: f.waitingLong, days: WAITING_DAYS }), to: '/admissions/applications?status=pending' })
    if (f.appsWithUnverified > 0) attention.push({ tone: 'warn', text: t(`${NS}.attention.documents`, { count: f.appsWithUnverified }), to: '/admissions/applications?status=pending' })
    for (const issue of f.semesterIssues) {
      attention.push({ tone: 'warn', text: t(`${NS}.attention.${issue.key}`, { name: nameOf(issue.s), date: fmtDate(issue.s.start_date) }), to: `/academic/semesters/${issue.s.id}` })
    }
    if (f.semester?.noInstructor > 0) attention.push({ tone: 'warn', text: t(`${NS}.attention.noInstructor`, { count: f.semester.noInstructor, name: nameOf(f.semester.row) }), to: '/academic/classes' })
    if (f.money.overdue > 0) attention.push({ tone: 'err', text: t(`${NS}.attention.overdue`, { count: f.money.overdue }), to: '/finance/invoices' })
  }
  const toneClass = { err: 'border-red-200 bg-red-50 text-red-800', warn: 'border-amber-200 bg-amber-50 text-amber-900' }

  // ---- render ----
  if (state.loading && !f) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-64" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (state.error) {
    return (
      <Panel>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-600" aria-hidden="true" />
          <p className="font-bold text-slate-800">{t(`${NS}.loadFailed`)}</p>
          <p className="max-w-md text-sm text-slate-500">{state.error}</p>
          <Button icon={RefreshCw} onClick={load}>
            {t(`${NS}.retry`)}
          </Button>
        </div>
      </Panel>
    )
  }

  const cards = [
    {
      icon: Users,
      label: t(`${NS}.cards.students`),
      value: n(f.activeStudents),
      hint: f.newStudents ? t(`${NS}.cards.studentsNew`, { count: f.newStudents }) : t(`${NS}.cards.studentsNoneNew`),
      to: '/students',
    },
    {
      icon: ClipboardList,
      label: t(`${NS}.cards.toReview`),
      value: n(f.pending),
      hint: f.pending ? t(`${NS}.cards.oldest`, { count: f.oldestDays }) : t(`${NS}.cards.nothingWaiting`),
      to: '/admissions/applications?status=pending',
      alert: f.waitingLong > 0,
    },
    {
      icon: UserCheck,
      label: t(`${NS}.cards.accepted`),
      value: n(f.accepted),
      hint: t(`${NS}.cards.acceptedOf`, { count: f.totalApps, rate: f.totalApps ? Math.round((f.accepted / f.totalApps) * 100) : 0 }),
      to: '/admissions/applications?status=accepted',
    },
    {
      icon: Wallet,
      label: t(`${NS}.cards.collected`),
      value: f.money.count ? money(f.money.paid) : '—',
      hint: f.money.count ? t(`${NS}.cards.outstanding`, { amount: money(f.money.due) }) : t(`${NS}.cards.noInvoices`),
      to: '/finance/invoices',
    },
  ]

  const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0)
  const days1 = (value) => (value == null ? '—' : value < 10 ? value.toLocaleString(locale, { maximumFractionDigits: 1 }) : n(Math.round(value)))
  const regionNames = (() => {
    try {
      return new Intl.DisplayNames([language === 'ar' ? 'ar' : 'en'], { type: 'region' })
    } catch {
      return null
    }
  })()
  const countryName = (code) => {
    if (/^[A-Z]{2}$/.test(code) && regionNames) {
      try {
        return regionNames.of(code) || code
      } catch {
        return code
      }
    }
    return code
  }
  const withTail = ({ head, rest, unknown }, labelOf) => [
    ...head.map((x) => ({ key: x.key, label: labelOf(x.key), count: x.count })),
    ...(rest ? [{ key: '__other', label: t(`${NS}.other`), count: rest, muted: true }] : []),
    ...(unknown ? [{ key: '__unknown', label: t(`${NS}.notStated`), count: unknown, muted: true }] : []),
  ]

  const kpis = [
    { label: t(`${NS}.kpi.instructors`), value: n(state.instructors), hint: t(`${NS}.kpi.instructorsHint`) },
    { label: t(`${NS}.kpi.subjects`), value: state.subjects == null ? '—' : n(state.subjects), hint: t(`${NS}.kpi.majorsHint`, { count: Object.keys(state.majors).length }) },
    { label: t(`${NS}.kpi.registrations`), value: n(f.registrationsTotal), hint: t(`${NS}.kpi.registrationsHint`, { count: f.registrations.length }) },
    { label: t(`${NS}.kpi.passRate`), value: f.passRate == null ? '—' : `${Math.round(f.passRate)}%`, hint: t(`${NS}.kpi.passHint`, { count: f.gradedCount, n: n(f.gradedCount) }) },
    { label: t(`${NS}.kpi.applications`), value: n(f.totalApps), hint: t(`${NS}.kpi.last30`, { count: f.last30 }) },
    { label: t(`${NS}.kpi.scholarships`), value: n(f.scholarshipStudents), hint: t(`${NS}.kpi.scholarshipsHint`, { rate: pct(f.scholarshipStudents, f.activeStudents) }) },
    { label: t(`${NS}.kpi.decisionTime`), value: days1(f.medianDecision), hint: t(`${NS}.kpi.decisionHint`, { count: f.decisionCount }) },
    { label: t(`${NS}.kpi.offers`), value: n(f.offers), hint: f.upcoming ? t(`${NS}.kpi.upcomingShort`, { count: f.upcoming }) : t(`${NS}.kpi.offersHint`) },
  ]

  const registrationItems = f.registrations.map((r) => ({ key: r.key, label: nameOf(r.row), count: r.count }))
  const gradeItems = f.gradeCounts.map((g) => ({ key: g.key, count: g.count, title: g.key, short: g.key }))
  const passItems = f.passBySemester.map((r) => ({ key: r.key, label: nameOf(r.row), count: r.rate }))
  const studentMajorItems = withTail(f.studentMajors, (id) => nameOf(state.majors[id]) || `#${id}`)
  const intakeItems = f.intake.map((y) => ({ key: y.key, count: y.count, title: y.key, short: y.key }))
  const dayItems = f.days.map((d) => ({
    key: d.key,
    count: d.count,
    title: d.date.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'long' }),
    short: d.date.toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
  }))
  const funnelStages = f.funnel.map((s) => ({ ...s, label: t(`${NS}.funnel.${s.key}`) }))
  const genderCount = (k) => f.gender.find((g) => g.key === k)?.count || 0
  const genderParts = [
    { key: 'male', label: t(`${NS}.male`), count: genderCount('male'), color: chartColors.NAVY },
    { key: 'female', label: t(`${NS}.female`), count: genderCount('female'), color: chartColors.GOLD },
    { key: 'unknown', label: t(`${NS}.notStated`), count: genderCount(''), color: chartColors.MUTED },
  ]
  const referralItems = f.referral.slice(0, 7).map((r) => ({ key: r.key, label: t(`${NS}.referral.${r.key}`, { defaultValue: r.key.replace(/_/g, ' ') }), count: r.count }))
  const collegeItems = f.colleges.map((c) => ({ key: String(c.id), label: c.name, count: c.count }))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#1a3a6b] sm:text-[28px]">{collegeScope ? t(`${NS}.titleCollege`) : t(`${NS}.title`)}</h1>
          <p className="mt-1 text-sm text-slate-500">{t(`${NS}.subtitle`, { date: fmtDate(state.loadedAt) })}</p>
        </div>
        <Button variant="quiet" icon={RefreshCw} loading={state.loading} onClick={load}>
          {t(`${NS}.refresh`)}
        </Button>
      </div>

      {/* Four numbers, each opening the list behind it */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <Link
              key={c.label}
              to={c.to}
              className={`group rounded-2xl border bg-white p-4 transition-colors hover:border-[#9fb0d1] sm:p-5 ${c.alert ? 'border-amber-300' : 'border-[#dde3ef]'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef2f9] text-[#1a3a6b]">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <ArrowUpRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-[#1a3a6b] rtl:-scale-x-100" aria-hidden="true" />
              </div>
              <div className="mt-3 text-xs font-semibold text-slate-500">{c.label}</div>
              <div className="mt-0.5 text-2xl font-extrabold tabular-nums text-[#1a3a6b] sm:text-[28px]" dir="ltr" style={{ textAlign: 'start' }}>
                {c.value}
              </div>
              <div className={`mt-1 text-xs ${c.alert ? 'font-semibold text-amber-800' : 'text-slate-500'}`}>{c.hint}</div>
            </Link>
          )
        })}
      </div>

      {/* Admissions and teaching at a glance */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#dde3ef] bg-[#dde3ef] sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white px-4 py-3.5">
            <div className="text-[11px] font-semibold text-slate-500">{k.label}</div>
            <div className="mt-0.5 text-xl font-extrabold tabular-nums text-[#1a3a6b]" dir="ltr" style={{ textAlign: 'start' }}>
              {k.value}
            </div>
            <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{k.hint}</div>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        {/* What needs doing */}
        <Panel title={t(`${NS}.attentionTitle`)} className="lg:col-span-2">
          {attention.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-emerald-700">
              <FileCheck2 className="h-4 w-4" aria-hidden="true" />
              {t(`${NS}.allClear`)}
            </p>
          ) : (
            <ul className="space-y-2">
              {attention.map((a, i) => (
                <li key={i}>
                  <Link to={a.to} className={`flex items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm hover:opacity-90 ${toneClass[a.tone]}`}>
                    <span className="flex min-w-0 items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{a.text}</span>
                    </span>
                    <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* The semester being run */}
        <Panel
          title={t(`${NS}.semesterTitle`)}
          aside={
            f.semester ? (
              <Link to={`/academic/semesters/${f.semester.row.id}`} className="text-xs font-bold text-[#1a3a6b] hover:underline">
                {t(`${NS}.open`)}
              </Link>
            ) : null
          }
        >
          {f.semester ? (
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 text-base font-extrabold text-slate-800">
                  <CalendarRange className="h-4 w-4 text-[#c8a84b]" aria-hidden="true" />
                  {nameOf(f.semester.row)}
                </div>
                <p className={`mt-1 text-sm ${f.semester.state.allowed ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {describeRegistrationState(f.semester.state, t, fmtDate)}
                </p>
              </div>
              <dl className="grid grid-cols-3 gap-3 text-center">
                {[
                  [t(`${NS}.classes`), n(f.semester.classes)],
                  [t(`${NS}.seatsTaken`), f.semester.capacity ? `${n(f.semester.seats)}/${n(f.semester.capacity)}` : n(f.semester.seats)],
                  [t(`${NS}.instructors`), n(state.instructors)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-[#f4f6fb] px-2 py-3">
                    <dd className="text-lg font-extrabold tabular-nums text-[#1a3a6b]" dir="ltr">
                      {value}
                    </dd>
                    <dt className="text-[11px] font-semibold text-slate-500">{label}</dt>
                  </div>
                ))}
              </dl>
              <div className="flex flex-wrap gap-2">
                <Link
                  to="/enrollments/bulk"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#dde3ef] bg-white px-3 py-2 text-sm font-semibold text-[#1a3a6b] hover:bg-[#eef2f9]"
                >
                  <GraduationCap className="h-4 w-4" aria-hidden />
                  {t(`${NS}.bulkRegister`)}
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">{t(`${NS}.noSemester`)}</p>
          )}
        </Panel>
      </div>

      <h2 className="pt-2 text-base font-extrabold text-[#1a3a6b]">{t(`${NS}.section.teaching`)}</h2>
      <div className="grid items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
        <Panel title={t(`${NS}.bySemester`)}>
          <BarList items={registrationItems} format={n} empty={t(`${NS}.noRegistrations`)} />
        </Panel>
        <Panel title={t(`${NS}.gradeDistribution`)} aside={<span className="text-xs text-slate-500">{t(`${NS}.gradedHint`, { count: f.gradedCount, n: n(f.gradedCount) })}</span>}>
          {f.gradedCount ? <ColumnChart items={gradeItems} format={n} label={t(`${NS}.gradeDistribution`)} /> : <p className="text-sm text-slate-500">{t(`${NS}.noGrades`)}</p>}
        </Panel>
        <Panel title={t(`${NS}.passBySemester`)} aside={<span className="text-xs text-slate-500">{t(`${NS}.passBySemesterHint`)}</span>}>
          <BarList items={passItems} max={100} format={(v) => `${v}%`} color={chartColors.GOLD} empty={t(`${NS}.noGrades`)} />
        </Panel>
      </div>

      <h2 className="pt-2 text-base font-extrabold text-[#1a3a6b]">{t(`${NS}.section.students`)}</h2>
      <div className="grid items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
        <Panel title={t(`${NS}.byCollege`)}>
          <BarList items={collegeItems} format={n} share empty={t(`${NS}.noStudents`)} />
        </Panel>
        <Panel title={t(`${NS}.studentsByMajor`)}>
          <BarList items={studentMajorItems} format={n} share empty={t(`${NS}.noStudents`)} />
        </Panel>
        <Panel title={t(`${NS}.intakeByYear`)}>
          <ColumnChart items={intakeItems} format={n} label={t(`${NS}.intakeByYear`)} />
        </Panel>
      </div>

      <h2 className="pt-2 text-base font-extrabold text-[#1a3a6b]">{t(`${NS}.section.admissions`)}</h2>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Panel
          title={t(`${NS}.perDay`)}
          className="lg:col-span-2"
          aside={<span className="text-xs text-slate-500">{t(`${NS}.kpi.last30`, { count: f.last30 })}</span>}
        >
          <TrendLine items={dayItems} format={n} label={t(`${NS}.perDay`)} isRTL={isRTL} />
        </Panel>
        <Panel title={t(`${NS}.funnelTitle`)} aside={<span className="text-xs text-slate-500">{t(`${NS}.funnelHint`)}</span>}>
          <Funnel stages={funnelStages} format={n} />
        </Panel>
      </div>
      <div className="grid items-start gap-5 md:grid-cols-2 lg:grid-cols-3">
        <Panel title={t(`${NS}.byNationality`)}>
          <BarList items={withTail(f.nationalities, countryName)} format={n} share empty={t(`${NS}.noApplications`)} />
        </Panel>
        <Panel title={t(`${NS}.byMajor`)}>
          <BarList items={withTail(f.majors, (id) => nameOf(state.majors[id]) || `#${id}`)} format={n} share empty={t(`${NS}.noApplications`)} />
        </Panel>
        <Panel title={t(`${NS}.byGender`)} aside={<span className="text-xs text-slate-500">{t(`${NS}.ofApplicants`, { count: f.received })}</span>}>
          <SplitBar parts={genderParts} format={n} />
          {referralItems.length ? (
            <div className="mt-5 border-t border-[#dde3ef] pt-4">
              <div className="mb-2.5 flex items-baseline justify-between gap-2">
                <span className="text-xs font-bold text-slate-700">{t(`${NS}.bySource`)}</span>
                <span className="text-[11px] text-slate-500">{t(`${NS}.answered`, { count: f.referralAnswered, total: n(f.received) })}</span>
              </div>
              <BarList items={referralItems.slice(0, 4)} format={n} share color={chartColors.GOLD} empty="" />
            </div>
          ) : null}
        </Panel>
      </div>

      {/* What happened lately */}
      <Panel flush title={t(`${NS}.activity`)} aside={<Link to="/admissions/applications" className="text-xs font-bold text-[#1a3a6b] hover:underline">{t(`${NS}.allApplications`)}</Link>}>
        {state.audit.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">{t(`${NS}.noActivity`)}</p>
        ) : (
          <ul className="divide-y divide-[#dde3ef]">
            {state.audit.slice(0, 8).map((row) => {
              const app = state.feedApps[row.entity_id]
              return (
                <li key={row.id}>
                  <Link to={`/admissions/applications/${row.entity_id}`} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="font-semibold text-slate-800">{applicantName(app)}</span>
                      <span className="text-slate-400"> · </span>
                      <span className="text-slate-600">{codeName(row.to_status_code)}</span>
                    </span>
                    <span className="text-xs text-slate-500">{ago(row.created_at)}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
    </div>
  )
}
