import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, BookOpen, Calendar, CreditCard, Lock, Plus, Search, Trash2, Users } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { getSemesterCreditsFromUniversitySettings } from '../../utils/getCollegeSettings'
import { getStudentSemesterMilestone, checkFinancePermission } from '../../utils/financePermissions'
import { getPaymentsEnabled } from '../../utils/getPaymentsEnabled'
import {
  creditLimits,
  describeRegistrationState,
  fetchPassedSubjects,
  fetchPrerequisites,
  hasTimeConflict,
  isDraftSemester,
  isFinishedSemester,
  registrationState,
  unmetPrerequisites,
} from '../../utils/registrationRules'
import { Badge, Button, ConfirmDialog, EmptyState, PageHeader, Panel, Skeleton, toast } from '../../components/ui'
import { HoursMeter, ScheduleLine, WeekStrip } from '../../components/registration/RegistrationWidgets'

const NS = 'studentPortal.registrationPage'

const CLASS_SELECT = `
  id, code, section, capacity, enrolled, subject_id, room, building,
  subjects ( id, name_en, name_ar, code, credit_hours ),
  instructors ( id, name_en, name_ar ),
  class_schedules ( day_of_week, start_time, end_time, location )
`

const creditsOf = (subject) => parseInt(subject?.credit_hours, 10) || 0

/** A semester offered to students: not over, and not a draft that is still closed. */
function isOfferedSemester(semester) {
  if (isFinishedSemester(semester)) return false
  return !isDraftSemester(semester) || registrationState(semester).allowed
}

export default function StudentEnrollment() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const location = useLocation()
  const { user } = useAuth()

  const localName = useCallback((row) => (isRTL && row?.name_ar ? row.name_ar : row?.name_en) || '', [isRTL])
  const formatDate = useCallback(
    (value) => new Date(value).toLocaleDateString(language === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    [language]
  )

  const [student, setStudent] = useState(null)
  const [loadingStudent, setLoadingStudent] = useState(true)
  const [semesters, setSemesters] = useState([])
  const [semesterId, setSemesterId] = useState('')
  const [limits, setLimits] = useState({ min_credit_hours: 12, max_credit_hours: 18, max_credit_hours_with_permission: 21 })

  const [loadingSemester, setLoadingSemester] = useState(false)
  const [enrolledRows, setEnrolledRows] = useState([])
  const [classes, setClasses] = useState([])
  const [fromDegreePlan, setFromDegreePlan] = useState(false)
  const [financeBlockReason, setFinanceBlockReason] = useState('')
  const [passedSubjects, setPassedSubjects] = useState(null)
  const [prerequisites, setPrerequisites] = useState(null)
  const [subjectCodes, setSubjectCodes] = useState({})

  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [onlyAddable, setOnlyAddable] = useState(false)
  const [busyClassId, setBusyClassId] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)
  const [dropping, setDropping] = useState(false)

  // ---- who is registering -------------------------------------------------
  useEffect(() => {
    if (!user?.email) return
    let alive = true
    ;(async () => {
      try {
        const { data, error: studentError } = await supabase
          .from('students')
          .select('id, student_id, first_name, last_name, email, major_id, enrollment_date, college_id')
          .eq('email', user.email)
          .eq('status', 'active')
          .maybeSingle()
        if (studentError) throw studentError
        if (alive) setStudent(data || null)
      } catch (err) {
        console.error('Error fetching student:', err)
        if (alive) setError(err.message || t(`${NS}.errors.loadStudent`))
      } finally {
        if (alive) setLoadingStudent(false)
      }
    })()
    getSemesterCreditsFromUniversitySettings().then((credits) => alive && setLimits(credits))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email])

  // ---- semesters and the student's record of passed courses ----------------
  useEffect(() => {
    if (!student?.id) return
    let alive = true
    ;(async () => {
      try {
        const { data, error: semError } = await supabase
          .from('semesters')
          .select(
            `id, name_en, name_ar, code, start_date, end_date, status, college_id, is_university_wide,
             registration_start_date, registration_end_date, late_registration_end_date,
             course_registration_allowed, late_registration_allowed,
             min_credit_hours, max_credit_hours, max_credit_hours_with_permission,
             academic_years ( id, registration_open )`
          )
          .or(`college_id.eq.${student.college_id},is_university_wide.eq.true`)
          .order('start_date', { ascending: false })
        if (semError) throw semError
        if (!alive) return
        const all = data || []
        // Past semesters and grade-import terms are not registration choices; soonest first.
        let list = all.filter(isOfferedSemester).sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')))
        const fromLink = new URLSearchParams(location.search || '').get('semester')
        const linked = fromLink ? all.find((s) => String(s.id) === String(fromLink)) : null
        if (linked && !list.includes(linked)) list = [linked, ...list]
        // Nothing open or upcoming: keep the latest term so the page can say registration has ended.
        if (list.length === 0 && all.length > 0) list = [all[0]]
        setSemesters(list)
        const open = list.find((s) => registrationState(s).allowed)
        const chosen = linked || open || list[0]
        setSemesterId((prev) => prev || (chosen ? String(chosen.id) : ''))
      } catch (err) {
        console.error('Error fetching semesters:', err)
        if (alive) setError(err.message || t(`${NS}.errors.loadSemesters`))
      }
    })()
    fetchPassedSubjects(supabase, student.id).then((passed) => alive && setPassedSubjects(passed))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id])

  const semester = useMemo(() => semesters.find((s) => String(s.id) === String(semesterId)) || null, [semesters, semesterId])

  // ---- everything that depends on the chosen semester ----------------------
  const loadEnrolled = useCallback(async () => {
    if (!student?.id || !semesterId) return []
    const { data, error: enrollError } = await supabase
      .from('enrollments')
      .select(`id, class_id, status, classes ( ${CLASS_SELECT} )`)
      .eq('student_id', student.id)
      .eq('semester_id', parseInt(semesterId, 10))
      .eq('status', 'enrolled')
      .order('id', { ascending: false })
    if (enrollError) throw enrollError
    setEnrolledRows(data || [])
    return data || []
  }, [student?.id, semesterId])

  /** Subject ids of the student's degree plan, or null when no plan is on record. */
  const loadDegreePlanSubjects = useCallback(async () => {
    const { data: assigned, error: assignedError } = await supabase
      .from('student_major_sheets')
      .select('major_sheet_id, major_sheets ( id )')
      .eq('student_id', student.id)
      .eq('is_active', true)
      .maybeSingle()
    if (assignedError && assignedError.code !== 'PGRST116') console.error('Error fetching assigned degree plan:', assignedError)

    const joined = Array.isArray(assigned?.major_sheets) ? assigned.major_sheets[0] : assigned?.major_sheets
    let sheetId = joined?.id || assigned?.major_sheet_id || null

    if (!sheetId && student.major_id) {
      const admissionYear = student.enrollment_date ? new Date(student.enrollment_date).getFullYear() : new Date().getFullYear()
      const { data: byMajor } = await supabase
        .from('major_sheets')
        .select('id')
        .eq('major_id', student.major_id)
        .eq('is_active', true)
        .ilike('academic_year', `%${admissionYear}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      sheetId = byMajor?.id || null
    }
    if (!sheetId) return null

    const { data: courses, error: coursesError } = await supabase.from('major_sheet_courses').select('subject_id').eq('major_sheet_id', sheetId)
    if (coursesError || !courses?.length) return null
    return courses.map((c) => c.subject_id)
  }, [student])

  const loadClasses = useCallback(async () => {
    const planSubjectIds = await loadDegreePlanSubjects()
    let request = supabase.from('classes').select(CLASS_SELECT).eq('semester_id', parseInt(semesterId, 10)).eq('status', 'active')
    if (planSubjectIds) request = request.in('subject_id', planSubjectIds)
    const { data, error: classError } = await request.order('code')
    if (classError) throw classError
    setFromDegreePlan(Boolean(planSubjectIds))
    setClasses(data || [])

    const subjectIds = (data || []).map((c) => c.subject_id)
    const needs = await fetchPrerequisites(supabase, subjectIds)
    setPrerequisites(needs)
    const prerequisiteIds = needs ? [...new Set([...needs.values()].flat().map((x) => x.subjectId))] : []
    if (prerequisiteIds.length > 0) {
      const { data: subjectRows } = await supabase.from('subjects').select('id, code').in('id', prerequisiteIds)
      setSubjectCodes(Object.fromEntries((subjectRows || []).map((s) => [s.id, s.code])))
    }
  }, [loadDegreePlanSubjects, semesterId])

  const loadFinanceGate = useCallback(async () => {
    try {
      const paymentsEnabled = await getPaymentsEnabled(student.college_id).catch(() => true)
      const { milestone, hold } = await getStudentSemesterMilestone(student.id, parseInt(semesterId, 10))
      const check = checkFinancePermission('SE_REG', milestone, hold, null, paymentsEnabled)
      setFinanceBlockReason(check.allowed ? '' : check.reason || t(`${NS}.financeHold`))
    } catch (err) {
      console.error('Finance gate error:', err)
      setFinanceBlockReason('')
    }
  }, [student, semesterId, t])

  useEffect(() => {
    if (!student?.id || !semesterId) return
    let alive = true
    setLoadingSemester(true)
    setError('')
    setClasses([])
    setEnrolledRows([])
    Promise.all([loadEnrolled(), loadClasses(), loadFinanceGate()])
      .catch((err) => {
        console.error('Error loading registration data:', err)
        if (alive) setError(err.message || t(`${NS}.errors.loadClasses`))
      })
      .finally(() => alive && setLoadingSemester(false))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id, semesterId])

  // ---- derived state --------------------------------------------------------
  // The same rule the admin pages use: semester over -> year switch -> semester switch -> dates.
  const windowState = useMemo(() => (semester ? registrationState(semester) : null), [semester])
  const windowText = useMemo(() => (windowState ? describeRegistrationState(windowState, t, formatDate) : ''), [windowState, t, formatDate])
  const canRegisterNow = Boolean(windowState?.allowed) && !financeBlockReason
  const blockedReason = financeBlockReason || (windowState && !windowState.allowed ? windowText : '')

  const enrolledClasses = useMemo(() => enrolledRows.map((r) => r.classes).filter(Boolean), [enrolledRows])
  const totalHours = useMemo(() => enrolledClasses.reduce((sum, c) => sum + creditsOf(c.subjects), 0), [enrolledClasses])
  // The semester's own hour limits come first; the university settings fill any gap.
  const hourLimits = useMemo(() => creditLimits(semester, limits), [semester, limits])
  const minHours = hourLimits.min
  const maxHours = hourLimits.maxWithPermission

  /** Why a section can or cannot be added right now. The first failing rule is the one shown. */
  const stateOf = useCallback(
    (cls) => {
      const seats = (cls.capacity || 0) - (cls.enrolled || 0)
      if (enrolledClasses.some((c) => c.subject_id === cls.subject_id)) {
        return { ok: false, tone: 'neutral', text: t(`${NS}.otherSection`) }
      }
      if (seats <= 0) return { ok: false, tone: 'err', text: t(`${NS}.full`) }
      const unmet = unmetPrerequisites(cls.subject_id, prerequisites, passedSubjects)
      if (unmet.length > 0) {
        const codes = unmet.map((need) => subjectCodes[need.subjectId] || `#${need.subjectId}`).join(isRTL ? '، ' : ', ')
        return { ok: false, tone: 'warn', text: t(`${NS}.needs`, { codes }) }
      }
      const clash = enrolledClasses.find((c) => hasTimeConflict(cls, c))
      if (clash) return { ok: false, tone: 'warn', text: t(`${NS}.conflictWith`, { code: clash.subjects?.code || clash.code }) }
      if (totalHours + creditsOf(cls.subjects) > maxHours) return { ok: false, tone: 'warn', text: t(`${NS}.overMax`, { max: maxHours }) }
      return { ok: true, tone: 'ok', text: t(`${NS}.seatsLeft`, { count: seats }) }
    },
    [enrolledClasses, prerequisites, passedSubjects, subjectCodes, totalHours, maxHours, t, isRTL]
  )

  const courseGroups = useMemo(() => {
    const enrolledIds = new Set(enrolledRows.map((r) => r.class_id))
    const needle = query.trim().toLowerCase()
    const groups = new Map()
    for (const cls of classes) {
      if (enrolledIds.has(cls.id)) continue
      const subject = cls.subjects || {}
      if (needle && ![subject.code, subject.name_en, subject.name_ar, cls.code].some((v) => String(v || '').toLowerCase().includes(needle))) continue
      const state = stateOf(cls)
      if (onlyAddable && !state.ok) continue
      const key = cls.subject_id || `class-${cls.id}`
      if (!groups.has(key)) groups.set(key, { key, subject, sections: [] })
      groups.get(key).sections.push({ cls, state })
    }
    return [...groups.values()]
  }, [classes, enrolledRows, query, onlyAddable, stateOf])

  const availableCount = useMemo(() => {
    const enrolledIds = new Set(enrolledRows.map((r) => r.class_id))
    return classes.filter((c) => !enrolledIds.has(c.id)).length
  }, [classes, enrolledRows])

  // ---- actions -------------------------------------------------------------
  const adjustSeatCount = async (classId, change) => {
    try {
      const { data } = await supabase.from('classes').select('enrolled').eq('id', classId).limit(1)
      if (!data?.length) return
      await supabase
        .from('classes')
        .update({ enrolled: Math.max(0, (data[0].enrolled || 0) + change) })
        .eq('id', classId)
    } catch (err) {
      console.error('Error updating class enrollment count:', err)
    }
  }

  const refresh = async () => {
    await Promise.all([loadEnrolled(), loadClasses()])
  }

  const addCourse = async (cls) => {
    if (!canRegisterNow || busyClassId) return
    setBusyClassId(cls.id)
    setError('')
    try {
      // The list can be minutes old; read the seat count again before taking a place.
      const { data: fresh, error: freshError } = await supabase.from('classes').select('capacity, enrolled').eq('id', cls.id).limit(1)
      if (freshError) throw freshError
      if (fresh?.length && (fresh[0].capacity || 0) - (fresh[0].enrolled || 0) <= 0) {
        toast(t(`${NS}.seatTaken`), 'err')
        await refresh()
        return
      }

      const { data: existing, error: checkError } = await supabase
        .from('enrollments')
        .select('id, status')
        .eq('student_id', student.id)
        .eq('class_id', cls.id)
        .eq('semester_id', parseInt(semesterId, 10))
        .limit(1)
      if (checkError) throw checkError

      if (existing?.length) {
        if (existing[0].status !== 'enrolled') {
          const { error: updateError } = await supabase
            .from('enrollments')
            .update({ status: 'enrolled', updated_at: new Date().toISOString() })
            .eq('id', existing[0].id)
          if (updateError) throw updateError
          await adjustSeatCount(cls.id, 1)
        }
      } else {
        const { error: insertError } = await supabase.from('enrollments').insert({
          student_id: student.id,
          class_id: cls.id,
          semester_id: parseInt(semesterId, 10),
          status: 'enrolled',
          enrollment_date: new Date().toISOString(),
        })
        if (insertError) throw insertError
        await adjustSeatCount(cls.id, 1)
      }
      await refresh()
      toast(t(`${NS}.added`, { code: cls.subjects?.code || cls.code }))
    } catch (err) {
      console.error('Error creating enrollment:', err)
      toast(err.message || t(`${NS}.errors.enrollFailed`), 'err')
    } finally {
      setBusyClassId(null)
    }
  }

  const confirmDrop = async () => {
    if (!dropTarget) return
    setDropping(true)
    try {
      const { error: updateError } = await supabase
        .from('enrollments')
        .update({ status: 'dropped', updated_at: new Date().toISOString() })
        .eq('id', dropTarget.id)
      if (updateError) throw updateError
      await adjustSeatCount(dropTarget.class_id, -1)
      await refresh()
      toast(t(`${NS}.dropped`, { code: dropTarget.classes?.subjects?.code || dropTarget.classes?.code || '' }))
      setDropTarget(null)
    } catch (err) {
      console.error('Drop enrollment error:', err)
      toast(err?.message || t(`${NS}.errors.dropFailed`), 'err')
    } finally {
      setDropping(false)
    }
  }

  // ---- render ----------------------------------------------------------------
  if (loadingStudent) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!student) {
    return (
      <Panel>
        <EmptyState icon={AlertTriangle} title={t(`${NS}.studentNotFound`)} hint={error || undefined} />
      </Panel>
    )
  }

  const hoursShort = Math.max(0, minHours - totalHours)
  const meterMessage =
    totalHours >= maxHours ? t(`${NS}.hoursFull`) : hoursShort > 0 ? t(`${NS}.hoursNeedMore`, { n: hoursShort, min: minHours }) : t(`${NS}.hoursWithin`)
  const dropCode = dropTarget?.classes?.subjects?.code || dropTarget?.classes?.code || ''

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('studentPortal.courseRegistration')}
        subtitle={[semesters.length === 1 ? localName(semester) : '', canRegisterNow ? windowText : ''].filter(Boolean).join(' · ') || undefined}
        actions={
          semesters.length > 1 ? (
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
              <span className="hidden sm:inline">{t(`${NS}.semesterLabel`)}</span>
              <select
                value={semesterId}
                onChange={(e) => setSemesterId(e.target.value)}
                className="h-10 max-w-[70vw] rounded-xl border border-[#dde3ef] bg-white px-3 text-sm font-bold text-[#1a3a6b] focus:border-[#9fb0d1] focus:outline-none focus:ring-4 focus:ring-[#1a3a6b]/10"
                aria-label={t(`${NS}.semesterLabel`)}
              >
                {semesters.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {localName(s)}
                  </option>
                ))}
              </select>
            </label>
          ) : null
        }
      />

      {blockedReason && !loadingSemester ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">
            <strong>{t('studentPortal.enrollmentBlocked')}</strong> — {blockedReason}
          </p>
          {financeBlockReason ? (
            <Link to="/student/payments" className="inline-flex items-center gap-1.5 rounded-lg bg-red-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-800">
              <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
              {t('studentPortal.payNow')}
            </Link>
          ) : null}
        </div>
      ) : null}

      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div> : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="order-2 space-y-5 lg:order-1">
          {/* What the student already holds this semester */}
          <Panel
            title={t(`${NS}.currentRegistered`)}
            aside={<Badge tone="info">{t(`${NS}.hoursCount`, { count: totalHours })}</Badge>}
            flush
          >
            {loadingSemester ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : enrolledRows.length === 0 ? (
              <EmptyState icon={BookOpen} title={t(`${NS}.myCoursesEmptyTitle`)} hint={canRegisterNow ? t(`${NS}.myCoursesEmptyHint`) : undefined} />
            ) : (
              <ul className="divide-y divide-[#dde3ef]">
                {enrolledRows.map((row) => {
                  const cls = row.classes || {}
                  const hall = [cls.building, cls.room].filter(Boolean).join(' ')
                  return (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 sm:px-5">
                      <div className="min-w-0 flex-1 basis-full sm:basis-0">
                        <p className="font-bold text-slate-900">
                          <span dir="ltr" className="text-[#1a3a6b]">
                            {cls.subjects?.code}
                          </span>{' '}
                          {localName(cls.subjects)}
                        </p>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {t(`${NS}.section`, { s: cls.section || '—' })}
                          {' · '}
                          <ScheduleLine schedules={cls.class_schedules} language={language} empty={t(`${NS}.noTimeYet`)} />
                          {hall ? ` · ${hall}` : ''}
                        </p>
                      </div>
                      <span className="text-sm font-bold text-slate-700 tabular-nums">{t(`${NS}.hoursCount`, { count: creditsOf(cls.subjects) })}</span>
                      <Button variant="danger" size="sm" icon={Trash2} disabled={!canRegisterNow} onClick={() => setDropTarget(row)}>
                        {t(`${NS}.drop`)}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>

          {/* What can be added */}
          <Panel title={t(`${NS}.available`)} aside={!loadingSemester && fromDegreePlan ? <Badge tone="gold">{t(`${NS}.planNote`)}</Badge> : null} flush>
            <div className="flex flex-wrap items-center gap-2 border-b border-[#dde3ef] px-4 py-3 sm:px-5">
              <label className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t(`${NS}.searchPlaceholder`)}
                  className="h-10 w-full rounded-xl border border-[#dde3ef] bg-[#eef2f9]/50 text-sm placeholder:text-slate-400 focus:border-[#9fb0d1] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#1a3a6b]/10 ps-9 pe-3"
                />
              </label>
              <div className="inline-flex rounded-xl border border-[#dde3ef] bg-white p-1" role="group">
                {[
                  { value: false, label: t(`${NS}.filterAll`) },
                  { value: true, label: t(`${NS}.filterCanAdd`) },
                ].map((option) => (
                  <button
                    key={String(option.value)}
                    type="button"
                    aria-pressed={onlyAddable === option.value}
                    onClick={() => setOnlyAddable(option.value)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                      onlyAddable === option.value ? 'bg-[#1a3a6b] text-white' : 'text-slate-600 hover:bg-[#eef2f9]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {loadingSemester ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : availableCount === 0 ? (
              <EmptyState icon={Calendar} title={t(`${NS}.availableEmptyTitle`)} hint={t(`${NS}.availableEmptyHint`)} />
            ) : courseGroups.length === 0 ? (
              <EmptyState icon={Search} title={t(`${NS}.noMatch`)} />
            ) : (
              <ul className="divide-y divide-[#dde3ef]">
                {courseGroups.map((group) => (
                  <li key={group.key} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="font-bold text-slate-900">
                        <span dir="ltr" className="text-[#1a3a6b]">
                          {group.subject.code}
                        </span>{' '}
                        {localName(group.subject)}
                      </p>
                      <span className="text-sm font-semibold text-slate-500 tabular-nums">{t(`${NS}.hoursCount`, { count: creditsOf(group.subject) })}</span>
                    </div>
                    <ul className="mt-2.5 space-y-2">
                      {group.sections.map(({ cls, state }) => (
                        <li key={cls.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl bg-[#eef2f9]/60 px-3 py-2.5">
                          <div className="min-w-0 flex-1 basis-full text-sm sm:basis-0">
                            <p className="font-semibold text-slate-800">
                              {t(`${NS}.section`, { s: cls.section || '—' })}
                              <span className="font-normal text-slate-500">
                                {' · '}
                                {localName(cls.instructors) || t(`${NS}.instructorTba`)}
                              </span>
                            </p>
                            <p className="mt-0.5 text-slate-500">
                              <ScheduleLine schedules={cls.class_schedules} language={language} empty={t(`${NS}.noTimeYet`)} />
                            </p>
                          </div>
                          <Badge tone={state.tone} icon={state.ok ? Users : undefined}>
                            {state.text}
                          </Badge>
                          <Button
                            size="sm"
                            icon={Plus}
                            loading={busyClassId === cls.id}
                            disabled={!canRegisterNow || !state.ok || (busyClassId != null && busyClassId !== cls.id)}
                            onClick={() => addCourse(cls)}
                          >
                            {t(`${NS}.add`)}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-[#dde3ef] px-4 py-3 text-xs text-slate-500 sm:px-5">{t(`${NS}.checksNote`)}</p>
          </Panel>
        </div>

        {/* Load and timetable: first on a phone, beside the lists on a wide screen */}
        <aside className="order-1 space-y-5 lg:order-2 lg:sticky lg:top-20 lg:self-start">
          <Panel>
            <HoursMeter
              hours={totalHours}
              min={minHours}
              max={maxHours}
              label={t(`${NS}.hoursOf`, { n: totalHours, max: maxHours })}
              minLabel={t(`${NS}.minMark`, { n: minHours })}
              message={meterMessage}
              tone={totalHours >= maxHours ? 'warn' : 'info'}
            />
          </Panel>
          <Panel title={t(`${NS}.myWeek`)}>
            <WeekStrip classes={enrolledClasses} language={language} emptyText={t(`${NS}.weekEmpty`)} />
          </Panel>
        </aside>
      </div>

      <ConfirmDialog
        open={Boolean(dropTarget)}
        title={t(`${NS}.dropTitle`, { code: dropCode })}
        body={t(`${NS}.dropBody`)}
        confirmLabel={t(`${NS}.dropConfirm`)}
        cancelLabel={t(`${NS}.keep`)}
        busy={dropping}
        onConfirm={confirmDrop}
        onCancel={() => setDropTarget(null)}
      />
    </div>
  )
}
