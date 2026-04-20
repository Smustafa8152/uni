import { useMemo, useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { AlertTriangle, CreditCard, Calendar, GraduationCap, PenLine, Bell, Search, Receipt, GitBranch, HelpCircle, ClipboardList } from 'lucide-react'

const STUDENT_PORTAL_BG = '#1a3a6b'

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const DAY_NAMES_EN = { sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday' }
const DAY_NAMES_AR = { sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء', wednesday: 'الأربعاء', thursday: 'الخميس', friday: 'الجمعة', saturday: 'السبت' }

export default function StudentDashboard() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [activeSemester, setActiveSemester] = useState(null)
  const [todaySchedule, setTodaySchedule] = useState([])
  const [totalCreditsRequired, setTotalCreditsRequired] = useState(120)
  const [completedCredits, setCompletedCredits] = useState(0)
  const [currentSemesterCredits, setCurrentSemesterCredits] = useState(0)
  const [computedGpa, setComputedGpa] = useState(null)

  useEffect(() => {
    if (user?.email) fetchData()
  }, [user?.email])

  const fetchData = async () => {
    if (!user?.email) return
    try {
      setLoading(true)
      const { data: studentData, error: studentErr } = await supabase
        .from('students')
        .select('id, student_id, name_en, name_ar, first_name, last_name, gpa, college_id, major_id, financial_hold_reason_code, financial_milestone_code, colleges(id, name_en, name_ar), majors(id, name_en, name_ar)')
        .eq('email', user.email)
        .eq('status', 'active')
        .single()
      if (studentErr || !studentData) {
        setLoading(false)
        return
      }
      setStudent(studentData)

      const { data: invData } = await supabase
        .from('invoices')
        .select('id, invoice_number, total_amount, paid_amount, pending_amount, status, invoice_type, due_date, invoice_date')
        .eq('student_id', studentData.id)
      setInvoices(invData || [])

      const { data: semData } = await supabase
        .from('semesters')
        .select('id, name_en, name_ar, start_date, end_date, status')
        .in('status', ['active', 'registration_open'])
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      setActiveSemester(semData)

      const { data: enrollData } = await supabase
        .from('enrollments')
        .select(`
          id,
          status,
          grade_points,
          grade,
          numeric_grade,
          classes(
            subjects(credit_hours, code, name_en, name_ar),
            class_schedules(day_of_week, start_time, end_time, location),
            instructors(name_en, name_ar)
          )
        `)
        .eq('student_id', studentData.id)
      setEnrollments(enrollData || [])

      const creditsFromEnrollments = (enrollData || []).reduce((sum, e) => {
        const cred = e.classes?.subjects?.credit_hours
        return sum + (typeof cred === 'number' ? cred : parseInt(cred, 10) || 3)
      }, 0)
      setCompletedCredits(creditsFromEnrollments)
      setCurrentSemesterCredits(creditsFromEnrollments)

      // Cumulative GPA from enrollments that have grade_points (weighted by credit hours)
      let gpaFromEnrollments = null
      let totalWeighted = 0
      let totalCreditsGraded = 0
      ;(enrollData || []).forEach((e) => {
        const points = e.grade_points != null ? Number(e.grade_points) : null
        if (points == null || points === '') return
        const cred = e.classes?.subjects?.credit_hours
        const ch = typeof cred === 'number' ? cred : parseInt(cred, 10) || 3
        totalWeighted += points * ch
        totalCreditsGraded += ch
      })
      if (totalCreditsGraded > 0) {
        gpaFromEnrollments = totalWeighted / totalCreditsGraded
      }
      setComputedGpa(gpaFromEnrollments)

      const dayIndex = new Date().getDay()
      const todayKey = DAYS[dayIndex]
      const todayItems = (enrollData || [])
        .filter(e => e.classes?.class_schedules?.some(s => String(s.day_of_week).toLowerCase() === todayKey))
        .map(e => {
          const sched = e.classes?.class_schedules?.find(s => String(s.day_of_week).toLowerCase() === todayKey)
          return {
            code: e.classes?.subjects?.code || '—',
            name: getLocalizedName(e.classes?.subjects, language === 'ar') || '—',
            location: sched?.location || '—',
            instructor: getLocalizedName(e.classes?.instructors, language === 'ar') || '—',
            start: sched?.start_time,
            end: sched?.end_time,
          }
        })
        .sort((a, b) => (a.start || '').localeCompare(b.start || ''))
      setTodaySchedule(todayItems)
    } catch (err) {
      console.error('Student dashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const balanceDue = invoices.reduce((sum, inv) => sum + parseFloat(inv.pending_amount || 0), 0)
  const amountPaid = invoices.reduce((sum, inv) => sum + parseFloat(inv.paid_amount || 0), 0)
  const hasFinancialHold = balanceDue > 0 || !!student?.financial_hold_reason_code
  const dayNum = new Date().getDay()
  const dayName = language === 'ar' ? DAY_NAMES_AR[DAYS[dayNum]] : DAY_NAMES_EN[DAYS[dayNum]]
  // Prefer GPA computed from enrollment grades; fallback to students.gpa
  const displayGpa = computedGpa != null ? computedGpa : (student?.gpa != null ? Number(student.gpa) : 0)

  const isArabic = isRTL || language === 'ar'
  const tx = (ar, en) => (isArabic ? ar : en)

  const activeHoldCount = hasFinancialHold ? 1 : 0
  const registeredCourses = enrollments.filter((e) => String(e.status || '').toLowerCase() === 'enrolled').length
  const waitlistedCourses = enrollments.filter((e) => String(e.status || '').toLowerCase() === 'waitlisted').length
  const registeredHours = currentSemesterCredits || 0
  const maxHoursThisTerm = 21
  const daysRemaining = useMemo(() => {
    const end = activeSemester?.end_date || null
    if (!end) return null
    const diff = Math.ceil((new Date(end).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return Number.isFinite(diff) ? Math.max(0, diff) : null
  }, [activeSemester?.end_date])

  const registrationWindowStatus = useMemo(() => {
    const st = String(activeSemester?.status || '').toLowerCase()
    if (st === 'registration_open') return { label: tx('مفتوحة', 'Open'), color: 'bg-emerald-50 text-emerald-800 border-emerald-200' }
    if (st === 'active') return { label: tx('نشطة', 'Active'), color: 'bg-blue-50 text-blue-800 border-blue-200' }
    return { label: tx('غير متوفر', 'N/A'), color: 'bg-gray-50 text-gray-700 border-gray-200' }
  }, [activeSemester?.status, isArabic])

  const financialDueDate = useMemo(() => {
    const due = (invoices || []).map((i) => i?.due_date || i?.invoice_date).filter(Boolean).sort().at(0)
    return due ? new Date(due).toLocaleDateString(isArabic ? 'ar' : undefined) : null
  }, [invoices, isArabic])

  const initials = useMemo(() => {
    const name = (isArabic ? (student?.name_ar || '') : (student?.name_en || '')) || ''
    const s = name.trim()
    if (s) return s[0]
    const email = user?.email || ''
    return email ? email[0].toUpperCase() : 'S'
  }, [student?.name_ar, student?.name_en, user?.email, isArabic])

  const displayName = useMemo(() => {
    const fallback = user?.email?.split('@')[0] || '—'
    const ar = student?.name_ar || null
    const en = student?.name_en || null
    return (isArabic ? (ar || en) : (en || ar)) || fallback
  }, [student?.name_ar, student?.name_en, user?.email, isArabic])

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
        <p className="text-amber-800">{t('studentPortal.noStudentData', 'No student data found.')}</p>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${isRTL ? 'text-right' : 'text-left'}`} dir={isArabic ? 'rtl' : 'ltr'}>
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
        <Link to="/" className="hover:text-slate-900 no-underline">
          {tx('الرئيسية', 'Home')}
        </Link>
        <span className="text-slate-300">/</span>
        <span className="text-slate-700 font-semibold">{tx('بوابة الطالب', 'Student portal')}</span>
      </nav>

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: STUDENT_PORTAL_BG }}>
            {tx('لوحة التحكم', 'Dashboard')}
          </h1>
          <p className="text-sm text-slate-500">{tx('نظرة عامة على وضعك الأكاديمي والمالي لهذا الفصل.', 'Overview of your academic and financial status this term.')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-9 w-9 rounded-full border border-slate-200 bg-white flex items-center justify-center"
            title={tx('بحث', 'Search')}
            onClick={() => navigate('/student/coming-soon')}
          >
            <Search className="w-4 h-4 text-slate-700" />
          </button>
          <button
            type="button"
            className="relative h-9 w-9 rounded-full border border-slate-200 bg-white flex items-center justify-center"
            title={tx('الإشعارات', 'Notifications')}
            onClick={() => navigate('/student/coming-soon')}
          >
            <Bell className="w-4 h-4 text-slate-700" />
            {activeHoldCount > 0 && <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-600" />}
          </button>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <div className="h-9 w-9 rounded-full flex items-center justify-center font-bold text-white" style={{ backgroundColor: STUDENT_PORTAL_BG }}>
              {initials}
            </div>
            <span className="font-semibold text-slate-800">{displayName}</span>
          </div>
        </div>
      </div>

      {/* Next Action Card */}
      {hasFinancialHold && (
        <div
          className={`rounded-2xl p-6 text-white flex items-start justify-between gap-4 flex-wrap`}
          style={{ background: `linear-gradient(135deg, ${STUDENT_PORTAL_BG} 0%, #2a5298 100%)` }}
        >
          <div className="flex items-start gap-4">
            <div className="text-4xl leading-none">⚠️</div>
            <div className="min-w-0">
              <div className="text-xs font-extrabold tracking-wider opacity-80">{tx('الإجراء التالي المطلوب', 'Next required action')}</div>
              <div className="text-xl font-extrabold mt-1">{tx('لديك تعليق مالي — التسجيل موقوف', 'Financial hold — registration suspended')}</div>
              <div className="text-sm opacity-90 mt-1">
                {tx(
                  `يجب سداد الرسوم المستحقة (${balanceDue.toFixed(2)} ر.س) قبل التمكن من التسجيل في المقررات.`,
                  `Please pay outstanding fees (${balanceDue.toFixed(2)} SAR) before course registration is allowed.`
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => navigate('/student/payments')}
              className="px-5 py-3 rounded-lg font-extrabold flex items-center justify-center gap-2"
              style={{ backgroundColor: '#c8a84b', color: STUDENT_PORTAL_BG }}
            >
              <CreditCard className="w-4 h-4" />
              {tx('ادفع الآن', 'Pay now')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/student/payments')}
              className="px-5 py-2 rounded-lg border border-white/30 bg-white/10 hover:bg-white/15"
            >
              {tx('عرض التعليقات', 'View holds')}
            </button>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-t-4" style={{ borderTopColor: '#c8a84b' }}>
          <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">{tx('الساعات المسجّلة', 'Registered hours')}</div>
          <div className="text-3xl font-extrabold mt-1" style={{ color: STUDENT_PORTAL_BG }}>{registeredHours}</div>
          <div className="text-xs text-slate-500">{tx(`من ${maxHoursThisTerm} ساعة`, `of ${maxHoursThisTerm} hours`)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-t-4" style={{ borderTopColor: '#1a7a4a' }}>
          <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">{tx('المعدل التراكمي', 'Cumulative GPA')}</div>
          <div className="text-3xl font-extrabold mt-1" style={{ color: STUDENT_PORTAL_BG }}>{displayGpa.toFixed(2)}</div>
          <div className="text-xs text-slate-500">{tx('من 4.00', 'of 4.00')}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-t-4" style={{ borderTopColor: '#b45309' }}>
          <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">{tx('الرصيد المستحق', 'Balance due')}</div>
          <div className="text-3xl font-extrabold mt-1" style={{ color: STUDENT_PORTAL_BG }}>{balanceDue.toFixed(0)}</div>
          <div className="text-xs text-slate-500">{tx('ريال سعودي', 'SAR')}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-t-4" style={{ borderTopColor: '#1d4ed8' }}>
          <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">{tx('الساعات المكتملة', 'Completed hours')}</div>
          <div className="text-3xl font-extrabold mt-1" style={{ color: STUDENT_PORTAL_BG }}>{completedCredits}</div>
          <div className="text-xs text-slate-500">{tx(`من ${totalCreditsRequired} ساعة`, `of ${totalCreditsRequired} hours`)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-t-4" style={{ borderTopColor: '#b91c1c' }}>
          <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide">{tx('تعليقات نشطة', 'Active holds')}</div>
          <div className="text-3xl font-extrabold mt-1" style={{ color: STUDENT_PORTAL_BG }}>{activeHoldCount}</div>
          <div className="text-xs text-slate-500">{hasFinancialHold ? tx('تعليق مالي', 'Financial hold') : '—'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
        <div className="space-y-6">
          {/* Registration window */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-start justify-between gap-3 flex-wrap border-b border-slate-200 pb-4 mb-5">
              <div>
                <div className="text-lg font-extrabold" style={{ color: STUDENT_PORTAL_BG }}>
                  {tx('نافذة التسجيل', 'Registration window')}
                  {activeSemester ? ` — ${getLocalizedName(activeSemester, isArabic) || activeSemester.name_en || ''}` : ''}
                </div>
                <div className="text-sm text-slate-500">
                  {daysRemaining != null
                    ? tx(`مفتوحة حتى ${new Date(activeSemester?.end_date).toLocaleDateString('ar')}`, `Open until ${new Date(activeSemester?.end_date).toLocaleDateString()}`)
                    : tx('مفتوحة حتى —', 'Open until —')}
                </div>
              </div>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold border ${registrationWindowStatus.color}`}>
                {registrationWindowStatus.label}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-center">
                <div className="text-2xl font-extrabold" style={{ color: STUDENT_PORTAL_BG }}>{registeredCourses || 0}</div>
                <div className="text-slate-500">{tx('مقررات مسجّلة', 'Registered courses')}</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-center">
                <div className="text-2xl font-extrabold text-amber-700">{waitlistedCourses || 0}</div>
                <div className="text-slate-500">{tx('في قائمة انتظار', 'Waitlisted')}</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 text-center">
                <div className="text-2xl font-extrabold text-emerald-700">{daysRemaining != null ? daysRemaining : '—'}</div>
                <div className="text-slate-500">{tx('يوماً متبقياً', 'Days remaining')}</div>
              </div>
            </div>

            <div className="flex gap-2 mt-4 flex-wrap">
              <button
                type="button"
                onClick={() => navigate('/student/enroll')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-white"
                style={{ backgroundColor: STUDENT_PORTAL_BG }}
              >
                <PenLine className="w-4 h-4" />
                {tx('تسجيل المقررات', 'Course registration')}
              </button>
              <button
                type="button"
                onClick={() => navigate('/student/schedule')}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold border border-slate-200 bg-slate-50 text-slate-800"
              >
                <Calendar className="w-4 h-4" />
                {tx('الجدول الدراسي', 'Timetable')}
              </button>
            </div>
          </div>

          {/* Today's schedule */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="text-lg font-extrabold" style={{ color: STUDENT_PORTAL_BG }}>
                {tx(`جدول اليوم — ${dayName}`, `Today's schedule — ${dayName}`)}
              </div>
              <button
                type="button"
                className="text-sm font-bold text-slate-600 hover:text-slate-900"
                onClick={() => navigate('/student/schedule')}
              >
                {tx('الجدول الكامل', 'Full timetable')}
              </button>
            </div>

            <div className="space-y-3">
              {todaySchedule.length === 0 ? (
                <div className="text-sm text-slate-500">{tx('لا توجد محاضرات اليوم', 'No classes scheduled for today')}</div>
              ) : (
                todaySchedule.slice(0, 3).map((c, idx) => (
                  <div
                    key={`${c.code}-${idx}`}
                    className="flex items-center gap-4 p-4 rounded-lg border border-slate-200"
                    style={{
                      backgroundColor: idx === 0 ? '#dbeafe' : idx === 1 ? '#e6f7ef' : '#fef3c7',
                      borderRight: isArabic ? `4px solid ${idx === 0 ? '#1d4ed8' : idx === 1 ? '#1a7a4a' : '#b45309'}` : undefined,
                      borderLeft: !isArabic ? `4px solid ${idx === 0 ? '#1d4ed8' : idx === 1 ? '#1a7a4a' : '#b45309'}` : undefined,
                    }}
                  >
                    <div className="text-xs font-extrabold min-w-[92px]" style={{ color: idx === 0 ? '#1d4ed8' : idx === 1 ? '#1a7a4a' : '#b45309' }}>
                      {(c.start && c.end) ? `${c.start} - ${c.end}` : '—'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-extrabold text-sm text-slate-900 truncate">{c.code} — {c.name}</div>
                      <div className="text-xs text-slate-600 truncate">{c.location} | {c.instructor}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Financial summary */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="text-lg font-extrabold" style={{ color: STUDENT_PORTAL_BG }}>{tx('الملخص المالي', 'Financial summary')}</div>
              <button type="button" className="text-sm font-bold text-slate-600 hover:text-slate-900" onClick={() => navigate('/student/payments')}>
                {tx('عرض الفواتير', 'View invoices')}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg border p-4" style={{ borderColor: '#b91c1c', backgroundColor: '#fee2e2' }}>
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-red-700">{tx('مستحق الدفع', 'Due')}</div>
                <div className="text-2xl font-extrabold text-red-700 mt-1">{balanceDue.toFixed(0)} {tx('ر.س', 'SAR')}</div>
                <div className="text-xs text-red-700 mt-1">{financialDueDate ? tx(`آخر موعد: ${financialDueDate}`, `Deadline: ${financialDueDate}`) : tx('آخر موعد: —', 'Deadline: —')}</div>
              </div>
              <div className="rounded-lg border p-4" style={{ borderColor: '#1a7a4a', backgroundColor: '#e6f7ef' }}>
                <div className="text-[11px] font-extrabold uppercase tracking-wide text-emerald-800">{tx('مدفوع', 'Paid')}</div>
                <div className="text-2xl font-extrabold text-emerald-800 mt-1">{amountPaid.toFixed(0)} {tx('ر.س', 'SAR')}</div>
                <div className="text-xs text-emerald-800 mt-1">{tx('ملخص المدفوعات', 'Payment summary')}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/student/payments')}
              className="mt-4 w-full py-3 rounded-lg font-extrabold text-white flex items-center justify-center gap-2"
              style={{ backgroundColor: '#1a7a4a' }}
            >
              <CreditCard className="w-5 h-5" />
              {tx('ادفع الرسوم المستحقة', 'Pay outstanding fees')}
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {/* Academic progress */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="text-lg font-extrabold" style={{ color: STUDENT_PORTAL_BG }}>{tx('التقدم الأكاديمي', 'Academic progress')}</div>
              <button type="button" className="text-sm font-bold text-slate-600 hover:text-slate-900" onClick={() => navigate('/student/graduation-path')}>
                {tx('التفاصيل', 'Details')}
              </button>
            </div>
            <div className="text-center py-2">
              <div className="text-5xl font-extrabold" style={{ color: STUDENT_PORTAL_BG }}>{displayGpa.toFixed(2)}</div>
              <div className="text-sm text-slate-500">{tx('المعدل التراكمي', 'Cumulative GPA')}</div>
            </div>
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">{tx('الساعات المكتملة', 'Completed hours')}</span>
                <span className="font-extrabold text-slate-800">{completedCredits} / {totalCreditsRequired}</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, (completedCredits / totalCreditsRequired) * 100)}%` }} />
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/student/graduation-path')}
              className="mt-5 w-full py-3 rounded-lg font-extrabold text-white flex items-center justify-center gap-2"
              style={{ backgroundColor: STUDENT_PORTAL_BG }}
            >
              <GitBranch className="w-5 h-5" />
              {tx('عرض مسار التخرج', 'View graduation path')}
            </button>
          </div>

          {/* Notifications */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div className="text-lg font-extrabold" style={{ color: STUDENT_PORTAL_BG }}>{tx('آخر الإشعارات', 'Latest notifications')}</div>
              <button type="button" className="text-sm font-bold text-slate-600 hover:text-slate-900" onClick={() => navigate('/student/coming-soon')}>
                {tx('الكل', 'All')}
              </button>
            </div>
            <div className="space-y-4">
              {hasFinancialHold && (
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-full flex items-center justify-center border-2" style={{ backgroundColor: '#dbeafe', borderColor: '#1d4ed8' }}>⚠️</div>
                  <div className="pt-1">
                    <div className="font-extrabold text-sm text-slate-900">{tx('تعليق مالي نشط', 'Active financial hold')}</div>
                    <div className="text-xs text-slate-500">{tx('حديثاً', 'Recently')}</div>
                  </div>
                </div>
              )}
              {activeSemester && (
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-full flex items-center justify-center border-2" style={{ backgroundColor: '#e6f7ef', borderColor: '#1a7a4a' }}>✓</div>
                  <div className="pt-1">
                    <div className="font-extrabold text-sm text-slate-900">{tx('نافذة التسجيل مفتوحة', 'Registration window open')}</div>
                    <div className="text-xs text-slate-500">{tx('هذا الفصل', 'This term')}</div>
                  </div>
                </div>
              )}
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full flex items-center justify-center border-2 bg-slate-50 border-slate-200">📋</div>
                <div className="pt-1">
                  <div className="font-extrabold text-sm text-slate-900">{tx('طلب خدمة قيد المراجعة', 'Service request in review')}</div>
                  <div className="text-xs text-slate-500">{tx('منذ أسبوع', '1 week ago')}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick links */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="text-lg font-extrabold mb-4" style={{ color: STUDENT_PORTAL_BG }}>{tx('روابط سريعة', 'Quick links')}</div>
            <div className="space-y-2">
              <button type="button" onClick={() => navigate('/student/coming-soon')} className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 font-bold text-slate-800 flex items-center justify-center gap-2">
                <ClipboardList className="w-4 h-4" />
                {tx('تقديم طلب خدمة', 'Submit service request')}
              </button>
              <button type="button" onClick={() => navigate('/student/grades')} className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 font-bold text-slate-800 flex items-center justify-center gap-2">
                <Receipt className="w-4 h-4" />
                {tx('السجل الأكاديمي', 'Transcript')}
              </button>
              <button type="button" onClick={() => navigate('/student/coming-soon')} className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 font-bold text-slate-800 flex items-center justify-center gap-2">
                <GraduationCap className="w-4 h-4" />
                {tx('موعد إرشاد أكاديمي', 'Academic advising')}
              </button>
              <button type="button" onClick={() => navigate('/student/coming-soon')} className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-slate-50 font-bold text-slate-800 flex items-center justify-center gap-2">
                <HelpCircle className="w-4 h-4" />
                {tx('مركز المساعدة', 'Help center')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
