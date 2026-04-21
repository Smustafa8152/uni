import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { getLocalizedName } from '../../utils/localizedName'
import { getStudentSemesterMilestone, checkFinancePermission } from '../../utils/financePermissions'
import { supabase } from '../../lib/supabase'

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
  warn: '#b45309',
  err: '#b91c1c',
}

export default function StudentCourseCatalog() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(null)
  const [semesters, setSemesters] = useState([])
  const [selectedSemesterId, setSelectedSemesterId] = useState('')
  const [currentSemester, setCurrentSemester] = useState(null)
  const [classes, setClasses] = useState([])
  const [prereqMap, setPrereqMap] = useState({})
  const [financialHold, setFinancialHold] = useState(false)
  const [registrationAllowed, setRegistrationAllowed] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [availFilter, setAvailFilter] = useState('') // '' | 'open' | 'waitlist' | 'closed'

  const isArabic = isRTL || language === 'ar'

  useEffect(() => {
    if (user?.email) fetchStudentAndSemesters()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email])

  useEffect(() => {
    if (student?.id && selectedSemesterId) {
      fetchClassesAndPrereqs()
      checkFinancialStatus()
    } else {
      setClasses([])
      setCurrentSemester(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [student?.id, selectedSemesterId])

  const isRegistrationOpenForSemester = (sem) => {
    if (!sem) return false
    if (sem.status === 'registration_open' || sem.status === 'active') return true
    const today = new Date().toISOString().split('T')[0]
    if (sem.registration_start_date && sem.registration_end_date) {
      if (today >= sem.registration_start_date && today <= sem.registration_end_date) return true
    }
    if (sem.late_registration_end_date && today <= sem.late_registration_end_date) return true
    return false
  }

  const getCatalogStatus = (cls) => {
    const openWindow = currentSemester && isRegistrationOpenForSemester(currentSemester)
    const capacity = cls.capacity ?? 0
    const enrolled = cls.enrolled ?? 0
    const hasSeats = capacity > enrolled
    if (!openWindow) return 'closed'
    if (!hasSeats) return 'waitlist'
    return 'open'
  }

  const fetchStudentAndSemesters = async () => {
    if (!user?.email) return
    try {
      setLoading(true)
      const { data: studentData, error: studentErr } = await supabase
        .from('students')
        .select('id, student_id, college_id, major_id, enrollment_date')
        .eq('email', user.email)
        .eq('status', 'active')
        .single()
      if (studentErr || !studentData) {
        setLoading(false)
        return
      }
      setStudent(studentData)

      const { data: semestersData, error: semErr } = await supabase
        .from('semesters')
        .select('id, name_en, name_ar, code, start_date, end_date, registration_start_date, registration_end_date, late_registration_end_date, status')
        .or(`college_id.eq.${studentData.college_id},is_university_wide.eq.true`)
        .order('start_date', { ascending: false })
      if (!semErr && semestersData?.length) {
        setSemesters(semestersData)
        if (!selectedSemesterId) {
          const active = semestersData.find((s) => s.status === 'active' || s.status === 'registration_open')
          setSelectedSemesterId(String(active?.id || semestersData[0].id))
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const checkFinancialStatus = async () => {
    if (!student?.id || !selectedSemesterId) return
    const { milestone, hold } = await getStudentSemesterMilestone(student.id, parseInt(selectedSemesterId))
    const check = checkFinancePermission('SE_REG', milestone, hold)
    setRegistrationAllowed(check.allowed)
    setFinancialHold(!!hold || !check.allowed)
  }

  const fetchClassesAndPrereqs = async () => {
    if (!student?.college_id || !selectedSemesterId) return
    try {
      setLoading(true)
      const semesterId = parseInt(selectedSemesterId)

      let query = supabase
        .from('classes')
        .select(
          `
          id,
          code,
          section,
          capacity,
          enrolled,
          room,
          building,
          subject_id,
          subjects(id, name_en, name_ar, code, credit_hours),
          instructors(id, name_en, name_ar)
        `,
        )
        .eq('semester_id', semesterId)
        .eq('status', 'active')
        .order('code')

      query = query.or(`college_id.eq.${student.college_id},is_university_wide.eq.true`)
      const { data: classesData, error } = await query
      if (error) throw error

      const list = classesData || []
      setClasses(list)

      const sem = semesters.find((s) => String(s.id) === selectedSemesterId)
      setCurrentSemester(sem || null)

      const subjectIds = [...new Set(list.map((c) => c.subject_id).filter(Boolean))]
      if (subjectIds.length === 0) {
        setPrereqMap({})
        setLoading(false)
        return
      }

      const { data: sp } = await supabase
        .from('subject_prerequisites')
        .select('subject_id, prerequisite_subject_id')
        .in('subject_id', subjectIds)

      const prereqIds = [...new Set((sp || []).map((p) => p.prerequisite_subject_id))]
      const codeMap = {}
      if (prereqIds.length > 0) {
        const { data: subj } = await supabase.from('subjects').select('id, code').in('id', prereqIds)
        ;(subj || []).forEach((s) => {
          codeMap[s.id] = s.code || ''
        })
      }

      const map = {}
      ;(sp || []).forEach((p) => {
        if (!map[p.subject_id]) map[p.subject_id] = []
        if (codeMap[p.prerequisite_subject_id]) map[p.subject_id].push(codeMap[p.prerequisite_subject_id])
      })
      setPrereqMap(map)
    } catch (e) {
      console.error(e)
      setClasses([])
      setPrereqMap({})
    } finally {
      setLoading(false)
    }
  }

  const deptOptions = useMemo(() => {
    const prefixes = new Set()
    for (const c of classes) {
      const code = String(c.subjects?.code || '')
      const p = code.match(/^[A-Za-z]+/)?.[0]?.toUpperCase()
      if (p) prefixes.add(p)
    }
    return Array.from(prefixes).sort()
  }, [classes])

  const filtered = useMemo(() => {
    let list = classes
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter((cls) => {
        const name = getLocalizedName(cls.subjects, isArabic) || ''
        const code = cls.subjects?.code || ''
        return name.toLowerCase().includes(q) || String(code).toLowerCase().includes(q)
      })
    }
    if (deptFilter) {
      list = list.filter((cls) => {
        const code = String(cls.subjects?.code || '')
        const prefix = code.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() || ''
        return prefix === deptFilter
      })
    }
    if (levelFilter) {
      list = list.filter((cls) => {
        const code = String(cls.subjects?.code || '')
        const num = code.match(/(\d{3})/)?.[1] || ''
        if (!num) return false
        const level = String(levelFilter)
        return num.startsWith(level.slice(0, 1))
      })
    }
    if (availFilter) {
      list = list.filter((cls) => getCatalogStatus(cls) === availFilter)
    }
    return list
  }, [classes, searchQuery, deptFilter, levelFilter, availFilter, isArabic, currentSemester])

  const semesterName = currentSemester ? getLocalizedName(currentSemester, isArabic) : ''

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
        <p className="text-amber-800">{t('studentPortal.noStudentData', 'Student data not found.')}</p>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${isArabic ? 'text-right' : 'text-left'}`} dir={isArabic ? 'rtl' : 'ltr'}>
      <nav className="flex flex-wrap items-center gap-2 text-sm" style={{ color: UI.muted }} aria-label="مسار التنقل">
        <a href="/" className="no-underline hover:underline" style={{ color: UI.muted }}>
          {t('studentPortal.profile.breadcrumbHome', { defaultValue: 'Home' })}
        </a>
        <span style={{ color: UI.bdr }}>/</span>
        <a href="/dashboard" className="no-underline hover:underline" style={{ color: UI.muted }}>
          {t('studentPortal.studentPortal', { defaultValue: 'Student Portal' })}
        </a>
        <span style={{ color: UI.bdr }}>/</span>
        <span className="font-semibold" style={{ color: UI.p }}>
          {t('studentPortal.courseGuide', { defaultValue: 'Course catalog' })}
        </span>
      </nav>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: UI.p }}>
            {t('studentPortal.courseGuide', { defaultValue: 'Course catalog' })}
          </h1>
          <p className="text-sm" style={{ color: UI.muted }}>
            {t('studentPortal.catalog.subtitle', {
              defaultValue: 'Browse available courses for registration — {{semester}}',
              semester: semesterName || (isArabic ? '—' : '—'),
            })}
          </p>
        </div>
      </div>

      {financialHold && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          🚫 {t('studentPortal.catalog.financialHold', { defaultValue: 'You have an active financial hold — you cannot register until it is lifted.' })}{' '}
          <button type="button" className="underline" onClick={() => navigate('/student/payments')}>
            {t('studentPortal.viewComments', { defaultValue: 'View holds' })}
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm p-6" style={{ borderColor: UI.bdr }}>
        <div className="flex gap-3 flex-wrap">
          <input
            className="w-full px-3 py-2.5 rounded-md border"
            style={{ borderColor: UI.bdr, maxWidth: 260 }}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('studentPortal.searchByNameOrCode', { defaultValue: 'Search by name or code...' })}
          />
          <select
            className="w-full px-3 py-2.5 rounded-md border"
            style={{ borderColor: UI.bdr, maxWidth: 180 }}
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="">{t('studentPortal.courseGuideDeptAll', { defaultValue: 'All departments' })}</option>
            {deptOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            className="w-full px-3 py-2.5 rounded-md border"
            style={{ borderColor: UI.bdr, maxWidth: 180 }}
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
          >
            <option value="">{t('studentPortal.courseGuideLevelAll', { defaultValue: 'All levels' })}</option>
            <option value="100">{t('studentPortal.courseGuideLevel100', { defaultValue: 'Level 100' })}</option>
            <option value="200">{t('studentPortal.courseGuideLevel200', { defaultValue: 'Level 200' })}</option>
            <option value="300">{t('studentPortal.courseGuideLevel300', { defaultValue: 'Level 300' })}</option>
          </select>
          <select
            className="w-full px-3 py-2.5 rounded-md border"
            style={{ borderColor: UI.bdr, maxWidth: 180 }}
            value={availFilter}
            onChange={(e) => setAvailFilter(e.target.value)}
          >
            <option value="">{t('studentPortal.allConditions', { defaultValue: 'All cases' })}</option>
            <option value="open">{t('studentPortal.available', { defaultValue: 'Available' })}</option>
            <option value="waitlist">{t('studentPortal.waitingList', { defaultValue: 'Waitlist' })}</option>
            <option value="closed">{t('studentPortal.closed', { defaultValue: 'Closed' })}</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: UI.bdr }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: UI.p, color: 'white' }}>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.courseCode', { defaultValue: 'Course code' })}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.courseName', { defaultValue: 'Course name' })}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.hours', { defaultValue: 'Hours' })}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.professor', { defaultValue: 'Professor' })}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.theHall', { defaultValue: 'Hall' })}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.seats', { defaultValue: 'Seats' })}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.prerequisite', { defaultValue: 'Prerequisite' })}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.condition', { defaultValue: 'Status' })}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.procedure', { defaultValue: 'Action' })}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center" style={{ color: UI.muted }}>
                    {loading ? t('common.loading', { defaultValue: 'Loading…' }) : t('studentPortal.noCoursesMatch', { defaultValue: 'No courses match your filters.' })}
                  </td>
                </tr>
              ) : (
                filtered.map((cls) => {
                  const status = getCatalogStatus(cls)
                  const prereqCodes = prereqMap[cls.subject_id] || []
                  const instructorName = cls.instructors
                    ? (isArabic && cls.instructors.name_ar ? cls.instructors.name_ar : cls.instructors.name_en) || '—'
                    : '—'
                  const hall = [cls.building, cls.room].filter(Boolean).join(' ') || '—'
                  const capacity = cls.capacity ?? 0
                  const enrolled = cls.enrolled ?? 0
                  const seatsAvailable = Math.max(0, capacity - enrolled)
                  const canRegister = registrationAllowed && status === 'open'

                  return (
                    <tr key={cls.id} className="border-b hover:bg-slate-50" style={{ borderColor: UI.bdr }}>
                      <td className="px-4 py-3">
                        <strong>{cls.subjects?.code || '—'}</strong>
                      </td>
                      <td className="px-4 py-3">{getLocalizedName(cls.subjects, isArabic) || '—'}</td>
                      <td className="px-4 py-3">{cls.subjects?.credit_hours ?? '—'}</td>
                      <td className="px-4 py-3">{instructorName}</td>
                      <td className="px-4 py-3">{hall}</td>
                      <td className="px-4 py-3">
                        <span style={{ color: seatsAvailable > 0 ? UI.ok : UI.err, fontWeight: 800 }}>{seatsAvailable}</span> / {capacity}
                      </td>
                      <td className="px-4 py-3">{prereqCodes.length ? prereqCodes.join(', ') : '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold"
                          style={{
                            backgroundColor: status === 'open' ? '#e6f7ef' : status === 'waitlist' ? '#fef3c7' : '#f3f4f6',
                            color: status === 'open' ? UI.ok : status === 'waitlist' ? UI.warn : '#4b5563',
                          }}
                        >
                          {status === 'open'
                            ? t('studentPortal.available', { defaultValue: 'Available' })
                            : status === 'waitlist'
                              ? t('studentPortal.waiting', { defaultValue: 'Waitlist' })
                              : t('studentPortal.closed', { defaultValue: 'Closed' })}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {status === 'waitlist' ? (
                          <button type="button" disabled className="px-3 py-1.5 rounded-md text-xs font-extrabold text-white" style={{ backgroundColor: '#d97706', opacity: 0.7 }}>
                            {t('studentPortal.waitingList', { defaultValue: 'Waitlist' })}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!canRegister}
                            title={!canRegister && financialHold ? t('studentPortal.financialHoldAlert', { defaultValue: 'Financial hold' }) : ''}
                            className="px-3 py-1.5 rounded-md border text-xs font-extrabold"
                            style={{
                              backgroundColor: UI.bg,
                              borderColor: UI.bdr,
                              color: UI.txt,
                              opacity: canRegister ? 1 : 0.6,
                              cursor: canRegister ? 'pointer' : 'not-allowed',
                            }}
                            onClick={() => navigate(selectedSemesterId ? `/student/enroll?semester=${selectedSemesterId}` : '/student/enroll')}
                          >
                            {t('studentPortal.registration', { defaultValue: 'Register' })}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

