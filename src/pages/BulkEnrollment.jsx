import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, BookOpen, Check, CheckCircle2, ListChecks, RotateCcw, Search, Users, X } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { useCollege } from '../contexts/CollegeContext'
import { supabase } from '../lib/supabase'
import { getSemesterCreditsFromUniversitySettings } from '../utils/getCollegeSettings'
import { hasUniversityWideScope } from '../utils/menuPermissions'
import { creditLimits, describeRegistrationState, fetchPrerequisites, isDraftSemester, isFinishedSemester, registrationState } from '../utils/registrationRules'
import { applyBulkRegistration, fetchPassedByStudent, fetchSemesterEnrollments, planBulkRegistration, selectionWarnings } from '../utils/bulkRegistration'
import { Badge, Button, ConfirmDialog, EmptyState, PageHeader, Panel, Skeleton, toast } from '../components/ui'
import { ScheduleLine } from '../components/registration/RegistrationWidgets'

const NS = 'enrollments.bulkPage'

const SEMESTER_SELECT = `
  id, name_en, name_ar, code, status, start_date, end_date, college_id, is_university_wide,
  registration_start_date, registration_end_date, late_registration_end_date,
  course_registration_allowed, late_registration_allowed,
  min_credit_hours, max_credit_hours, max_credit_hours_with_permission,
  academic_years ( id, registration_open )
`
const CLASS_SELECT = `
  id, code, section, capacity, enrolled, status, subject_id, college_id, is_university_wide,
  subjects ( id, name_en, name_ar, code, credit_hours ),
  instructors ( id, name_en, name_ar ),
  class_schedules ( day_of_week, start_time, end_time )
`
const STUDENT_SELECT = `
  id, student_id, name_en, name_ar, first_name, last_name, first_name_ar, last_name_ar,
  major_id, college_id, enrollment_date,
  majors ( id, name_en, name_ar, code )
`

const fieldClass =
  'h-10 w-full rounded-xl border border-[#dde3ef] bg-white px-3 text-sm text-slate-800 outline-none transition-colors focus:border-[#1a3a6b] disabled:bg-slate-50 disabled:text-slate-400'
const tidy = (value) => String(value || '').trim()
const intakeYear = (student) => (student.enrollment_date ? String(student.enrollment_date).slice(0, 4) : '')

export default function BulkEnrollment() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const navigate = useNavigate()
  const { userRole, collegeId: authCollegeId } = useAuth()
  const { selectedCollegeId, colleges } = useCollege()
  const universityWide = hasUniversityWideScope(userRole, authCollegeId)

  const localName = useCallback((row) => tidy(isRTL ? row?.name_ar || row?.name_en : row?.name_en || row?.name_ar), [isRTL])
  const studentName = useCallback(
    (s) => {
      const en = tidy(s.name_en) || tidy(`${s.first_name || ''} ${s.last_name || ''}`)
      const ar = tidy(s.name_ar) || tidy(`${s.first_name_ar || ''} ${s.last_name_ar || ''}`)
      return (isRTL ? ar || en : en || ar) || `#${s.id}`
    },
    [isRTL]
  )
  const formatDate = useCallback(
    (value) => new Date(value).toLocaleDateString(language === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    [language]
  )

  // ---- what the page knows ---------------------------------------------------
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [semesters, setSemesters] = useState([])
  const [semesterId, setSemesterId] = useState('')
  const [settings, setSettings] = useState({})
  const [collegeFilter, setCollegeFilter] = useState(universityWide ? (selectedCollegeId ? String(selectedCollegeId) : '') : String(authCollegeId || ''))

  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [loadingClasses, setLoadingClasses] = useState(false)

  // ---- what the person chose ---------------------------------------------------
  const [classQuery, setClassQuery] = useState('')
  const [studentQuery, setStudentQuery] = useState('')
  const [majorFilter, setMajorFilter] = useState('')
  const [yearFilter, setYearFilter] = useState('')
  const [pickedClasses, setPickedClasses] = useState(() => new Set())
  const [pickedStudents, setPickedStudents] = useState(() => new Set())

  // ---- check and save ----------------------------------------------------------
  const [phase, setPhase] = useState('pick') // pick | checking | checked | saving | done
  const [progress, setProgress] = useState('')
  const [plan, setPlan] = useState(null)
  const [prerequisiteCodes, setPrerequisiteCodes] = useState({})
  const [prerequisitesKnown, setPrerequisitesKnown] = useState(true)
  const [onlyProblems, setOnlyProblems] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [result, setResult] = useState(null)

  const semester = useMemo(() => semesters.find((s) => String(s.id) === String(semesterId)) || null, [semesters, semesterId])
  const limits = useMemo(() => creditLimits(semester, settings), [semester, settings])
  const studentState = useMemo(() => registrationState(semester), [semester])

  // ---- loading -----------------------------------------------------------------
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        let semesterRequest = supabase.from('semesters').select(SEMESTER_SELECT).order('start_date', { ascending: false })
        let studentRequest = supabase.from('students').select(STUDENT_SELECT).eq('status', 'active').order('student_id').range(0, 4999)
        if (!universityWide && authCollegeId) {
          semesterRequest = semesterRequest.or(`college_id.eq.${authCollegeId},is_university_wide.eq.true`)
          studentRequest = studentRequest.eq('college_id', authCollegeId)
        }
        const [semesterResult, studentResult, credits] = await Promise.all([semesterRequest, studentRequest, getSemesterCreditsFromUniversitySettings()])
        if (semesterResult.error) throw semesterResult.error
        if (studentResult.error) throw studentResult.error
        if (!alive) return
        const list = semesterResult.data || []
        setSemesters(list)
        setStudents(studentResult.data || [])
        setSettings(credits || {})
        const upcoming = list.filter((s) => !isFinishedSemester(s)).sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')))
        const chosen = upcoming.find((s) => registrationState(s).allowed) || upcoming[0] || list[0]
        setSemesterId(chosen ? String(chosen.id) : '')
      } catch (err) {
        console.error('Bulk registration: could not load', err)
        if (alive) setError(err.message || t(`${NS}.errors.load`))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universityWide, authCollegeId])

  const loadClasses = useCallback(async () => {
    if (!semesterId) return
    setLoadingClasses(true)
    try {
      const { data, error: classError } = await supabase.from('classes').select(CLASS_SELECT).eq('semester_id', parseInt(semesterId, 10)).eq('status', 'active').order('code')
      if (classError) throw classError
      setClasses(data || [])
    } catch (err) {
      console.error('Bulk registration: could not load classes', err)
      setError(err.message || t(`${NS}.errors.load`))
      setClasses([])
    } finally {
      setLoadingClasses(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semesterId])

  useEffect(() => {
    setPickedClasses(new Set())
    setPlan(null)
    setResult(null)
    setPhase('pick')
    loadClasses()
  }, [loadClasses])

  // ---- lists as shown ----------------------------------------------------------
  const inCollege = useCallback(
    (row) => !collegeFilter || String(row.college_id) === String(collegeFilter) || row.is_university_wide === true,
    [collegeFilter]
  )

  const shownClasses = useMemo(() => {
    const needle = classQuery.trim().toLowerCase()
    return classes.filter((cls) => {
      if (!inCollege(cls)) return false
      if (!needle) return true
      const s = cls.subjects || {}
      return [s.code, s.name_en, s.name_ar, cls.code, cls.section].some((v) => String(v || '').toLowerCase().includes(needle))
    })
  }, [classes, classQuery, inCollege])

  const collegeStudents = useMemo(() => students.filter((s) => !collegeFilter || String(s.college_id) === String(collegeFilter)), [students, collegeFilter])

  const majors = useMemo(() => {
    const seen = new Map()
    for (const s of collegeStudents) if (s.majors?.id && !seen.has(s.majors.id)) seen.set(s.majors.id, s.majors)
    return [...seen.values()].sort((a, b) => localName(a).localeCompare(localName(b)))
  }, [collegeStudents, localName])

  const years = useMemo(() => [...new Set(collegeStudents.map(intakeYear).filter(Boolean))].sort().reverse(), [collegeStudents])

  const shownStudents = useMemo(() => {
    const needle = studentQuery.trim().toLowerCase()
    return collegeStudents.filter((s) => {
      if (majorFilter && String(s.major_id) !== String(majorFilter)) return false
      if (yearFilter && intakeYear(s) !== yearFilter) return false
      if (!needle) return true
      return [s.student_id, s.name_en, s.name_ar, s.first_name, s.last_name, s.first_name_ar, s.last_name_ar].some((v) => String(v || '').toLowerCase().includes(needle))
    })
  }, [collegeStudents, majorFilter, yearFilter, studentQuery])

  const chosenClasses = useMemo(() => classes.filter((c) => pickedClasses.has(c.id)), [classes, pickedClasses])
  const chosenStudents = useMemo(() => students.filter((s) => pickedStudents.has(s.id)), [students, pickedStudents])
  const warnings = useMemo(() => selectionWarnings(chosenClasses), [chosenClasses])
  const allShownPicked = shownStudents.length > 0 && shownStudents.every((s) => pickedStudents.has(s.id))
  const pairCount = chosenClasses.length * chosenStudents.length
  const locked = phase === 'checking' || phase === 'saving'

  /** Any change to the choice makes the last check stale. */
  const touch = () => {
    setPlan(null)
    setResult(null)
    setPhase('pick')
  }
  const toggle = (setter) => (id) => {
    if (locked) return
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    touch()
  }
  const toggleClass = toggle(setPickedClasses)
  const toggleStudent = toggle(setPickedStudents)
  const toggleAllShown = () => {
    if (locked) return
    setPickedStudents((prev) => {
      const next = new Set(prev)
      for (const s of shownStudents) {
        if (allShownPicked) next.delete(s.id)
        else next.add(s.id)
      }
      return next
    })
    touch()
  }

  // ---- check -------------------------------------------------------------------
  const runCheck = async () => {
    if (pairCount === 0 || !semester) return
    setPhase('checking')
    setError('')
    setProgress(t(`${NS}.progress.seats`))
    try {
      const classIds = chosenClasses.map((c) => c.id)
      const studentIds = chosenStudents.map((s) => s.id)

      // Seats may have changed since the list was loaded.
      const { data: fresh, error: freshError } = await supabase.from('classes').select('id, capacity, enrolled').in('id', classIds)
      if (freshError) throw freshError
      const freshById = new Map((fresh || []).map((row) => [row.id, row]))
      const currentClasses = chosenClasses.map((cls) => ({ ...cls, ...(freshById.get(cls.id) || {}) }))

      const prerequisites = await fetchPrerequisites(
        supabase,
        currentClasses.map((c) => c.subject_id)
      )
      setPrerequisitesKnown(prerequisites !== null)
      const neededIds = prerequisites ? [...new Set([...prerequisites.values()].flat().map((need) => need.subjectId))] : []

      const existing = await fetchSemesterEnrollments(supabase, semester.id, studentIds, (done, total) =>
        setProgress(t(`${NS}.progress.existing`, { done, total }))
      )

      let passedByStudent = null
      if (neededIds.length > 0) {
        passedByStudent = await fetchPassedByStudent(supabase, studentIds, neededIds, (done, total) => setProgress(t(`${NS}.progress.history`, { done, total })))
        const { data: subjectRows } = await supabase.from('subjects').select('id, code').in('id', neededIds)
        setPrerequisiteCodes(Object.fromEntries((subjectRows || []).map((s) => [s.id, tidy(s.code)])))
      }

      setPlan(planBulkRegistration({ students: chosenStudents, classes: currentClasses, existing, prerequisites, passedByStudent, maxHours: limits.maxWithPermission }))
      setOnlyProblems(false)
      setPhase('checked')
    } catch (err) {
      console.error('Bulk registration: check failed', err)
      setError(t(`${NS}.errors.check`, { message: err.message || '' }))
      setPhase('pick')
    } finally {
      setProgress('')
    }
  }

  // ---- save --------------------------------------------------------------------
  const toWrite = plan ? plan.totals.add + plan.totals.reactivate : 0

  const save = async () => {
    setConfirmOpen(false)
    setPhase('saving')
    setError('')
    try {
      const outcome = await applyBulkRegistration(supabase, {
        semesterId: semester.id,
        plan,
        onProgress: (done, total) => setProgress(t(`${NS}.progress.saving`, { done, total })),
      })
      setResult(outcome)
      setPhase('done')
      if (outcome.failed.length === 0) toast(t(`${NS}.saved`, { count: outcome.added }))
      else toast(t(`${NS}.savedWithProblems`, { count: outcome.added, failed: outcome.failed.length }), 'err')
      loadClasses()
    } catch (err) {
      console.error('Bulk registration: save failed', err)
      setError(t(`${NS}.errors.save`, { message: err.message || '' }))
      setPhase('checked')
    } finally {
      setProgress('')
    }
  }

  const startAgain = () => {
    setPickedClasses(new Set())
    setPickedStudents(new Set())
    touch()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ---- words for one student x class decision ------------------------------------
  const describe = (item) => {
    const code = tidy(item.cls.subjects?.code) || tidy(item.cls.code)
    if (item.action === 'add') return { tone: 'ok', icon: Check, text: t(`${NS}.item.add`, { code }) }
    if (item.action === 'reactivate') return { tone: 'ok', icon: RotateCcw, text: t(`${NS}.item.reactivate`, { code }) }
    switch (item.reason) {
      case 'already':
        return { tone: 'neutral', text: t(`${NS}.item.already`, { code }) }
      case 'otherSection':
        return { tone: 'neutral', text: t(`${NS}.item.otherSection`, { code }) }
      case 'full':
        return { tone: 'err', text: t(`${NS}.item.full`, { code }) }
      case 'prerequisite':
        return { tone: 'warn', text: t(`${NS}.item.prerequisite`, { code, needs: (item.detail || []).map((id) => prerequisiteCodes[id] || `#${id}`).join(isRTL ? '، ' : ', ') }) }
      case 'clash':
        return { tone: 'warn', text: t(`${NS}.item.clash`, { code, other: tidy(item.detail) }) }
      default:
        return { tone: 'warn', text: t(`${NS}.item.overMax`, { code, max: limits.maxWithPermission }) }
    }
  }

  const planRows = useMemo(() => (plan ? (onlyProblems ? plan.rows.filter((row) => row.blocked) : plan.rows) : []), [plan, onlyProblems])

  // ---- render --------------------------------------------------------------------
  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    )
  }

  const upcomingSemesters = semesters.filter((s) => !isFinishedSemester(s))
  const pastSemesters = semesters.filter((s) => isFinishedSemester(s))
  const semesterOption = (s) => (
    <option key={s.id} value={s.id}>
      {localName(s)} ({tidy(s.code)})
    </option>
  )

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        title={t(`${NS}.title`)}
        subtitle={t(`${NS}.subtitle`)}
        actions={
          <Button variant="quiet" onClick={() => navigate('/enrollments')}>
            {t('enrollments.backToList')}
          </Button>
        }
      />

      {error ? (
        <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Semester and college */}
      <Panel>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">{t('enrollments.semester')}</span>
            <select className={fieldClass} value={semesterId} disabled={locked} onChange={(e) => setSemesterId(e.target.value)}>
              {upcomingSemesters.length > 0 ? <optgroup label={t(`${NS}.semestersCurrent`)}>{upcomingSemesters.map(semesterOption)}</optgroup> : null}
              {pastSemesters.length > 0 ? <optgroup label={t(`${NS}.semestersPast`)}>{pastSemesters.map(semesterOption)}</optgroup> : null}
            </select>
          </label>
          {universityWide ? (
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">{t(`${NS}.college`)}</span>
              <select
                className={fieldClass}
                value={collegeFilter}
                disabled={locked}
                onChange={(e) => {
                  setCollegeFilter(e.target.value)
                  setMajorFilter('')
                  setYearFilter('')
                }}
              >
                <option value="">{t(`${NS}.allColleges`)}</option>
                {colleges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {localName(c)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {semester ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-600">
            <Badge tone={studentState.allowed ? 'ok' : 'neutral'}>{t(`${NS}.forStudents`)}</Badge>
            <span>{describeRegistrationState(studentState, t, formatDate)}</span>
            {!studentState.allowed ? <span className="text-slate-500">{t(`${NS}.staffCanStill`)}</span> : null}
            {studentState.allowed && isDraftSemester(semester) ? <Badge tone="warn" icon={AlertTriangle}>{t(`${NS}.draftButOpen`)}</Badge> : null}
          </div>
        ) : null}
      </Panel>

      {semesters.length === 0 ? (
        <Panel>
          <EmptyState icon={BookOpen} title={t(`${NS}.noSemestersTitle`)} hint={t(`${NS}.noSemestersHint`)} action={<Button onClick={() => navigate('/academic/semesters')}>{t(`${NS}.openSemesters`)}</Button>} />
        </Panel>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-2">
          {/* 1. Classes */}
          <Panel
            flush
            title={t(`${NS}.classesTitle`)}
            aside={<Badge tone={chosenClasses.length ? 'info' : 'neutral'}>{t(`${NS}.chosenCount`, { count: chosenClasses.length })}</Badge>}
          >
            <div className="border-b border-[#dde3ef] p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input className={`${fieldClass} ps-9`} value={classQuery} onChange={(e) => setClassQuery(e.target.value)} placeholder={t(`${NS}.classSearch`)} aria-label={t(`${NS}.classSearch`)} />
              </div>
            </div>
            {loadingClasses ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : classes.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title={t(`${NS}.noClassesTitle`)}
                hint={t(`${NS}.noClassesHint`)}
                action={<Button onClick={() => navigate('/academic/classes/create')}>{t(`${NS}.createClass`)}</Button>}
              />
            ) : shownClasses.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">{t(`${NS}.noMatch`)}</p>
            ) : (
              <ul className="max-h-[26rem] divide-y divide-[#dde3ef] overflow-y-auto">
                {shownClasses.map((cls) => {
                  const picked = pickedClasses.has(cls.id)
                  const seats = Math.max(0, (cls.capacity || 0) - (cls.enrolled || 0))
                  return (
                    <li key={cls.id}>
                      <label className={`flex cursor-pointer items-start gap-3 px-4 py-3 ${picked ? 'bg-[#eef2f9]' : 'hover:bg-slate-50'}`}>
                        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#1a3a6b]" checked={picked} disabled={locked} onChange={() => toggleClass(cls.id)} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-sm font-extrabold text-[#1a3a6b]" dir="ltr">
                              {tidy(cls.subjects?.code) || tidy(cls.code)}
                            </span>
                            <span className="text-sm font-semibold text-slate-800">{localName(cls.subjects)}</span>
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {t('enrollments.section')} {tidy(cls.section) || '—'}
                            {cls.instructors ? ` · ${localName(cls.instructors)}` : ''}
                            {' · '}
                            <ScheduleLine schedules={cls.class_schedules} language={language} empty={t(`${NS}.noTime`)} />
                          </span>
                        </span>
                        <Badge tone={seats > 0 ? 'neutral' : 'err'} className="shrink-0 tabular-nums">
                          {t(`${NS}.seats`, { taken: cls.enrolled || 0, capacity: cls.capacity || 0 })}
                        </Badge>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
            {warnings.sameSubject.length + warnings.overlapping.length > 0 ? (
              <div className="space-y-1 border-t border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {warnings.sameSubject.map(([a, b]) => (
                  <p key={`s-${a.id}-${b.id}`}>{t(`${NS}.warnSameSubject`, { code: tidy(a.subjects?.code), a: tidy(a.section), b: tidy(b.section) })}</p>
                ))}
                {warnings.overlapping.map(([a, b]) => (
                  <p key={`o-${a.id}-${b.id}`}>{t(`${NS}.warnOverlap`, { a: tidy(a.subjects?.code), b: tidy(b.subjects?.code) })}</p>
                ))}
              </div>
            ) : null}
          </Panel>

          {/* 2. Students */}
          <Panel
            flush
            title={t(`${NS}.studentsTitle`)}
            aside={<Badge tone={chosenStudents.length ? 'info' : 'neutral'}>{t(`${NS}.chosenCount`, { count: chosenStudents.length })}</Badge>}
          >
            <div className="grid gap-2 border-b border-[#dde3ef] p-3 sm:grid-cols-2">
              <select className={fieldClass} value={majorFilter} onChange={(e) => setMajorFilter(e.target.value)} aria-label={t(`${NS}.major`)}>
                <option value="">{t(`${NS}.allMajors`)}</option>
                {majors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {localName(m)}
                  </option>
                ))}
              </select>
              <select className={fieldClass} value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} aria-label={t(`${NS}.intake`)}>
                <option value="">{t(`${NS}.allIntakes`)}</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {t(`${NS}.intakeYear`, { year: y })}
                  </option>
                ))}
              </select>
              <div className="relative sm:col-span-2">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input className={`${fieldClass} ps-9`} value={studentQuery} onChange={(e) => setStudentQuery(e.target.value)} placeholder={t(`${NS}.studentSearch`)} aria-label={t(`${NS}.studentSearch`)} />
              </div>
            </div>
            {shownStudents.length === 0 ? (
              <EmptyState icon={Users} title={t(`${NS}.noStudentsTitle`)} hint={t(`${NS}.noStudentsHint`)} />
            ) : (
              <>
                <label className="flex cursor-pointer items-center gap-3 border-b border-[#dde3ef] bg-slate-50 px-4 py-2.5 text-sm font-bold text-slate-700">
                  <input type="checkbox" className="h-4 w-4 accent-[#1a3a6b]" checked={allShownPicked} disabled={locked} onChange={toggleAllShown} />
                  {t(`${NS}.selectAllShown`, { count: shownStudents.length })}
                </label>
                <ul className="max-h-[22.5rem] divide-y divide-[#dde3ef] overflow-y-auto">
                  {shownStudents.map((s) => {
                    const picked = pickedStudents.has(s.id)
                    return (
                      <li key={s.id}>
                        <label className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 ${picked ? 'bg-[#eef2f9]' : 'hover:bg-slate-50'}`}>
                          <input type="checkbox" className="h-4 w-4 shrink-0 accent-[#1a3a6b]" checked={picked} disabled={locked} onChange={() => toggleStudent(s.id)} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-800">{studentName(s)}</span>
                            <span className="block truncate text-xs text-slate-500">
                              <span dir="ltr">{tidy(s.student_id) || '—'}</span>
                              {s.majors ? ` · ${localName(s.majors)}` : ''}
                              {intakeYear(s) ? ` · ${intakeYear(s)}` : ''}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </Panel>
        </div>
      )}

      {/* 3. Check */}
      {plan && phase !== 'done' ? (
        <Panel
          flush
          title={t(`${NS}.checkTitle`)}
          aside={
            plan.totals.studentsBlocked > 0 ? (
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-600">
                <input type="checkbox" className="h-4 w-4 accent-[#1a3a6b]" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
                {t(`${NS}.onlyProblems`)}
              </label>
            ) : null
          }
        >
          <div className="grid gap-3 border-b border-[#dde3ef] p-4 sm:grid-cols-3">
            <div className="rounded-xl bg-emerald-50 px-4 py-3">
              <div className="text-2xl font-extrabold tabular-nums text-emerald-800">{toWrite}</div>
              <div className="text-sm font-semibold text-emerald-900">{t(`${NS}.sumWillRegister`, { students: plan.totals.studentsChanged })}</div>
            </div>
            <div className="rounded-xl bg-slate-100 px-4 py-3">
              <div className="text-2xl font-extrabold tabular-nums text-slate-700">{plan.totals.skip}</div>
              <div className="text-sm font-semibold text-slate-700">{t(`${NS}.sumAlready`)}</div>
            </div>
            <div className={`rounded-xl px-4 py-3 ${plan.totals.blocked ? 'bg-amber-50' : 'bg-slate-100'}`}>
              <div className={`text-2xl font-extrabold tabular-nums ${plan.totals.blocked ? 'text-amber-800' : 'text-slate-700'}`}>{plan.totals.blocked}</div>
              <div className={`text-sm font-semibold ${plan.totals.blocked ? 'text-amber-900' : 'text-slate-700'}`}>{t(`${NS}.sumBlocked`, { students: plan.totals.studentsBlocked })}</div>
            </div>
          </div>
          {!prerequisitesKnown ? <p className="border-b border-[#dde3ef] bg-amber-50 px-4 py-2.5 text-sm text-amber-900">{t(`${NS}.prerequisitesUnknown`)}</p> : null}
          <ul className="max-h-[32rem] divide-y divide-[#dde3ef] overflow-y-auto">
            {planRows.map((row) => (
              <li key={row.student.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-start md:gap-4">
                <div className="min-w-0 md:w-64 md:shrink-0">
                  <div className="truncate text-sm font-bold text-slate-800">{studentName(row.student)}</div>
                  <div className="text-xs text-slate-500">
                    <span dir="ltr">{tidy(row.student.student_id) || '—'}</span>
                    {' · '}
                    {row.hoursAfter === row.hoursBefore ? t(`${NS}.hoursSame`, { hours: row.hoursBefore }) : t(`${NS}.hoursChange`, { before: row.hoursBefore, after: row.hoursAfter })}
                    {row.hoursAfter > 0 && row.hoursAfter < limits.min ? ` · ${t(`${NS}.belowMin`, { min: limits.min })}` : ''}
                  </div>
                </div>
                <div className="flex flex-1 flex-wrap gap-1.5">
                  {row.items.map((item) => {
                    const d = describe(item)
                    return (
                      <Badge key={item.cls.id} tone={d.tone} icon={d.icon} className="!whitespace-normal !leading-snug">
                        {d.text}
                      </Badge>
                    )
                  })}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* 4. Result */}
      {phase === 'done' && result ? (
        <Panel>
          <div className="flex flex-col items-center px-2 py-4 text-center">
            <span className={`mb-3 flex h-14 w-14 items-center justify-center rounded-2xl ${result.failed.length ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {result.failed.length ? <AlertTriangle className="h-7 w-7" aria-hidden="true" /> : <CheckCircle2 className="h-7 w-7" aria-hidden="true" />}
            </span>
            <p className="text-lg font-extrabold text-[#1a3a6b]">{t(`${NS}.saved`, { count: result.added })}</p>
            <p className="mt-1 text-sm text-slate-600">{t(`${NS}.savedIn`, { semester: localName(semester) })}</p>
            {result.counterProblems.length > 0 ? <p className="mt-2 text-sm text-amber-800">{t(`${NS}.counterProblem`)}</p> : null}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button onClick={() => navigate(`/enrollments?semester=${semester.id}`)}>{t(`${NS}.viewList`)}</Button>
              <Button variant="quiet" onClick={startAgain}>
                {t(`${NS}.another`)}
              </Button>
            </div>
          </div>
          {result.failed.length > 0 ? (
            <div className="mt-4 rounded-xl border border-red-200">
              <p className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-800">{t(`${NS}.failedTitle`, { count: result.failed.length })}</p>
              <ul className="divide-y divide-red-100 text-sm">
                {result.failed.map((f, i) => (
                  <li key={`${f.student.id}-${f.cls.id}-${i}`} className="flex flex-wrap gap-x-3 px-4 py-2">
                    <span className="font-semibold text-slate-800">{studentName(f.student)}</span>
                    <span dir="ltr" className="text-slate-600">
                      {tidy(f.cls.subjects?.code) || tidy(f.cls.code)}
                    </span>
                    <span className="text-red-700">{f.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {/* Action bar */}
      {phase !== 'done' && semesters.length > 0 ? (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dde3ef] bg-white/95 px-4 py-3 shadow-lg shadow-[#1a3a6b]/10 backdrop-blur">
          <div className="min-w-0 text-sm text-slate-600">
            {locked ? (
              <span className="font-semibold text-[#1a3a6b]">{progress || t('common.loading')}</span>
            ) : pairCount === 0 ? (
              t(`${NS}.barEmpty`)
            ) : (
              <span>
                <strong className="text-slate-800">{t(`${NS}.barChoice`, { classes: chosenClasses.length, students: chosenStudents.length })}</strong>
                {plan ? ` · ${t(`${NS}.barReady`, { count: toWrite })}` : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {(pickedClasses.size > 0 || pickedStudents.size > 0) && !locked ? (
              <Button variant="ghost" icon={X} onClick={startAgain}>
                {t(`${NS}.clear`)}
              </Button>
            ) : null}
            {plan && phase !== 'checking' ? (
              <Button icon={Check} loading={phase === 'saving'} disabled={toWrite === 0} onClick={() => setConfirmOpen(true)}>
                {t(`${NS}.register`, { count: toWrite })}
              </Button>
            ) : (
              <Button icon={ListChecks} loading={phase === 'checking'} disabled={pairCount === 0} onClick={runCheck}>
                {t(`${NS}.check`)}
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        tone="primary"
        title={t(`${NS}.confirmTitle`, { count: toWrite })}
        body={t(`${NS}.confirmBody`, { count: toWrite, students: plan?.totals.studentsChanged || 0, semester: localName(semester) })}
        confirmLabel={t(`${NS}.register`, { count: toWrite })}
        cancelLabel={t('common.cancel')}
        onConfirm={save}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
