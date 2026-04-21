import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { useNavigate } from 'react-router-dom'
import { getLocalizedName } from '../../utils/localizedName'
import { getStudentSemesterMilestone, checkFinancePermission } from '../../utils/financePermissions'
import { supabase } from '../../lib/supabase'
import { AlertTriangle, Search, BookOpen, UserPlus } from 'lucide-react'

const PORTAL_BG = '#1a3a6b'

export default function StudentCourseGuide() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(null)
  const [semesters, setSemesters] = useState([])
  const [selectedSemesterId, setSelectedSemesterId] = useState('')
  const [currentSemester, setCurrentSemester] = useState(null)
  const [classes, setClasses] = useState([])
  const [prereqMap, setPrereqMap] = useState({}) // subject_id -> [codes]
  const [financialHold, setFinancialHold] = useState(false)
  const [registrationAllowed, setRegistrationAllowed] = useState(false)
  const [filterCondition, setFilterCondition] = useState('all') // all | available | waiting | closed
  const [deptFilter, setDeptFilter] = useState('') // '' | 'CS' | 'EE' ...
  const [levelFilter, setLevelFilter] = useState('') // '' | '100' | '200' ...
  const [searchQuery, setSearchQuery] = useState('')
  const [majorSheetSubjectIds, setMajorSheetSubjectIds] = useState(null) // null = all, [] = none from plan, [ids] = filter
  const [enrolledOrCompletedSubjectIds, setEnrolledOrCompletedSubjectIds] = useState(new Set()) // subject_ids student already enrolled in (this sem) or completed

  useEffect(() => {
    if (user?.email) fetchStudentAndSemesters()
  }, [user?.email])

  useEffect(() => {
    if (student?.id && selectedSemesterId) {
      fetchClassesAndPrereqs()
      checkFinancialStatus()
    } else {
      setClasses([])
      setCurrentSemester(null)
    }
  }, [student?.id, selectedSemesterId])

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
          const active = semestersData.find(s => s.status === 'active' || s.status === 'registration_open')
          setSelectedSemesterId(String(active?.id || semestersData[0].id))
        }
      }

      // Resolve major sheet to get subject IDs for the plan (so we show plan-relevant courses first or only)
      let sheetId = null
      const { data: sms } = await supabase
        .from('student_major_sheets')
        .select('major_sheet_id')
        .eq('student_id', studentData.id)
        .eq('is_active', true)
        .maybeSingle()
      if (sms?.major_sheet_id) sheetId = sms.major_sheet_id
      if (!sheetId && studentData.major_id) {
        const admissionYear = studentData.enrollment_date
          ? new Date(studentData.enrollment_date).getFullYear().toString()
          : new Date().getFullYear().toString()
        const { data: ms } = await supabase
          .from('major_sheets')
          .select('id')
          .eq('major_id', studentData.major_id)
          .eq('is_active', true)
          .ilike('academic_year', `%${admissionYear}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!ms) {
          const { data: msFallback } = await supabase
            .from('major_sheets')
            .select('id')
            .eq('major_id', studentData.major_id)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (msFallback) sheetId = msFallback.id
        } else sheetId = ms.id
      }
      if (sheetId) {
        const { data: msc } = await supabase
          .from('major_sheet_courses')
          .select('subject_id')
          .eq('major_sheet_id', sheetId)
        const ids = [...new Set((msc || []).map(c => c.subject_id))]
        setMajorSheetSubjectIds(ids)
      } else {
        setMajorSheetSubjectIds([])
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

      // Courses the student already enrolled in this semester or has completed (passed) — exclude these so we show only "courses you need to enroll"
      const alreadySubjectIds = new Set()
      const { data: enrollmentsThisSem } = await supabase
        .from('enrollments')
        .select('classes(subject_id)')
        .eq('student_id', student.id)
        .eq('semester_id', semesterId)
        .in('status', ['enrolled'])
      ;(enrollmentsThisSem || []).forEach(e => {
        const sid = e.classes?.subject_id
        if (sid) alreadySubjectIds.add(sid)
      })
      const { data: completedEnrollments } = await supabase
        .from('enrollments')
        .select('classes(subject_id), grade_points, status')
        .eq('student_id', student.id)
      ;(completedEnrollments || []).forEach(e => {
        const sid = e.classes?.subject_id
        if (!sid) return
        const passed = e.status === 'completed' || e.status === 'passed' || (e.grade_points != null && Number(e.grade_points) >= 2)
        if (passed) alreadySubjectIds.add(sid)
      })
      setEnrolledOrCompletedSubjectIds(alreadySubjectIds)

      let query = supabase
        .from('classes')
        .select(`
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
        `)
        .eq('semester_id', semesterId)
        .eq('status', 'active')
        .order('code')

      query = query.or(`college_id.eq.${student.college_id},is_university_wide.eq.true`)

      const { data: classesData, error } = await query
      if (error) throw error

      let list = classesData || []
      if (majorSheetSubjectIds && majorSheetSubjectIds.length > 0) {
        list = list.filter(c => majorSheetSubjectIds.includes(c.subject_id))
      }
      // Exclude classes for subjects the student is already enrolled in (this semester) or has completed
      list = list.filter(c => !alreadySubjectIds.has(c.subject_id))

      setClasses(list)
      const sem = semesters.find(s => String(s.id) === selectedSemesterId)
      setCurrentSemester(sem || null)

      const subjectIds = [...new Set(list.map(c => c.subject_id).filter(Boolean))]
      if (subjectIds.length === 0) {
        setPrereqMap({})
        setLoading(false)
        return
      }

      const { data: sp } = await supabase
        .from('subject_prerequisites')
        .select('subject_id, prerequisite_subject_id')
        .in('subject_id', subjectIds)
      const prereqIds = [...new Set((sp || []).map(p => p.prerequisite_subject_id))]
      const codeMap = {}
      if (prereqIds.length > 0) {
        const { data: subj } = await supabase
          .from('subjects')
          .select('id, code')
          .in('id', prereqIds)
        ;(subj || []).forEach(s => { codeMap[s.id] = s.code || '' })
      }
      const { data: cp } = await supabase
        .from('course_prerequisites')
        .select('subject_id, prerequisite_subject_id')
        .in('subject_id', subjectIds)
        .eq('prerequisite_type', 'prerequisite')
      const map = {}
      ;(sp || []).forEach(p => {
        if (!map[p.subject_id]) map[p.subject_id] = []
        if (codeMap[p.prerequisite_subject_id]) map[p.subject_id].push(codeMap[p.prerequisite_subject_id])
      })
      ;(cp || []).forEach(p => {
        if (!map[p.subject_id]) map[p.subject_id] = []
        if (codeMap[p.prerequisite_subject_id] && !map[p.subject_id].includes(codeMap[p.prerequisite_subject_id])) {
          map[p.subject_id].push(codeMap[p.prerequisite_subject_id])
        }
      })
      setPrereqMap(map)
    } catch (e) {
      console.error(e)
      setClasses([])
    } finally {
      setLoading(false)
    }
  }

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

  const getCondition = (cls) => {
    const open = currentSemester && isRegistrationOpenForSemester(currentSemester)
    const capacity = cls.capacity ?? 0
    const enrolled = cls.enrolled ?? 0
    const hasSeats = capacity > enrolled
    if (!open) return 'closed'
    if (hasSeats) return 'available'
    return 'waiting'
  }

  const filteredClasses = useMemo(() => {
    let list = classes
    if (filterCondition !== 'all') {
      list = list.filter(cls => getCondition(cls) === filterCondition)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(cls => {
        const name = getLocalizedName(cls.subjects, isRTL) || ''
        const code = cls.subjects?.code || ''
        return name.toLowerCase().includes(q) || code.toLowerCase().includes(q)
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
        return num ? num.startsWith(String(levelFilter).replace(/\D/g, '').slice(0, 1)) : false
      })
    }
    return list
  }, [classes, filterCondition, searchQuery, currentSemester, isRTL, deptFilter, levelFilter])

  const deptOptions = useMemo(() => {
    const prefixes = new Set()
    for (const c of classes) {
      const code = String(c.subjects?.code || '')
      const p = code.match(/^[A-Za-z]+/)?.[0]?.toUpperCase()
      if (p) prefixes.add(p)
    }
    return Array.from(prefixes).sort()
  }, [classes])

  const goToEnroll = () => {
    navigate(selectedSemesterId ? `/student/enroll?semester=${selectedSemesterId}` : '/student/enroll')
  }

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

  const semesterName = currentSemester ? getLocalizedName(currentSemester, isRTL) : ''

  return (
    <div className={`space-y-6 ${isRTL ? 'text-right' : 'text-left'}`}>
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500" aria-label="breadcrumb">
        <a href="/" className="hover:text-slate-900 no-underline">{t('studentPortal.profile.breadcrumbHome', { defaultValue: 'Home' })}</a>
        <span className="text-slate-300">/</span>
        <a href="/dashboard" className="hover:text-slate-900 no-underline">{t('studentPortal.studentPortal', { defaultValue: 'Student Portal' })}</a>
        <span className="text-slate-300">/</span>
        <span className="text-slate-900 font-semibold">{t('studentPortal.courseGuide', 'Course Guide')}</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: PORTAL_BG }}>{t('studentPortal.courseGuide', 'Course Guide')}</h1>
          <p className="text-sm text-slate-500">
            {t('studentPortal.courseGuideSubtitle', 'Browse the courses available for registration')}
            {semesterName ? ` — ${semesterName}` : ''}
          </p>
        </div>
      </div>

      {financialHold && !registrationAllowed && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          🚫 {t('studentPortal.financialHoldAlert', 'You have an active financial hold — registration is not possible until it is lifted.')}{' '}
          <a href="/student/payments" className="underline">{t('studentPortal.viewComments', 'View comments')}</a>
        </div>
      )}

      {/* Filters card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex gap-3 flex-wrap">
          <input
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            style={{ maxWidth: 260, width: '100%' }}
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('studentPortal.searchByNameOrCode', 'Search by name or code...')}
          />
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            style={{ maxWidth: 180, width: '100%' }}
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="">{t('studentPortal.courseGuideDeptAll', { defaultValue: 'All departments' })}</option>
            {deptOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            style={{ maxWidth: 180, width: '100%' }}
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
          >
            <option value="">{t('studentPortal.courseGuideLevelAll', { defaultValue: 'All levels' })}</option>
            <option value="100">{t('studentPortal.courseGuideLevel100', { defaultValue: 'Level 100' })}</option>
            <option value="200">{t('studentPortal.courseGuideLevel200', { defaultValue: 'Level 200' })}</option>
            <option value="300">{t('studentPortal.courseGuideLevel300', { defaultValue: 'Level 300' })}</option>
          </select>
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            style={{ maxWidth: 180, width: '100%' }}
            value={filterCondition}
            onChange={(e) => setFilterCondition(e.target.value)}
          >
            <option value="all">{t('studentPortal.allConditions', 'All cases')}</option>
            <option value="available">{t('studentPortal.available', 'Available')}</option>
            <option value="waiting">{t('studentPortal.waiting', 'Waiting')}</option>
            <option value="closed">{t('studentPortal.closed', 'Closed')}</option>
          </select>
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            style={{ maxWidth: 220, width: '100%' }}
            value={selectedSemesterId}
            onChange={(e) => setSelectedSemesterId(e.target.value)}
          >
            <option value="">{t('common.select', 'Select')}</option>
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>{getLocalizedName(s, isRTL) || s.code}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto" dir={isRTL ? 'rtl' : 'ltr'}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white text-xs font-medium" style={{ backgroundColor: PORTAL_BG }}>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.courseCode', 'Course code')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.courseName', 'Course Name')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.hours', 'Hours')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.professor', 'Professor')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.theHall', 'Hall')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.seats', 'Seats')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.prerequisite', 'Prerequisite')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.condition', 'Condition')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.procedure', 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredClasses.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                    {loading ? t('common.loading', 'Loading...') : t('studentPortal.noCoursesToEnroll', 'No courses left to enroll — you have completed or are already enrolled in all courses from your major plan for this semester.')}
                  </td>
                </tr>
              ) : (
                filteredClasses.map((cls) => {
                  const condition = getCondition(cls)
                  const prereqCodes = prereqMap[cls.subject_id] || []
                  const instructorName = cls.instructors
                    ? (isRTL && cls.instructors.name_ar ? cls.instructors.name_ar : cls.instructors.name_en) || 'TBA'
                    : 'TBA'
                  const hall = [cls.building, cls.room].filter(Boolean).join(' ') || '—'
                  const capacity = cls.capacity ?? 0
                  const enrolled = cls.enrolled ?? 0
                  const hasSeats = capacity > enrolled
                  const canRegister = registrationAllowed && condition === 'available' && hasSeats

                  return (
                    <tr key={cls.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-extrabold text-slate-900 whitespace-nowrap">{cls.subjects?.code || '—'}</td>
                      <td className="px-4 py-3 text-slate-900 whitespace-nowrap">{getLocalizedName(cls.subjects, isRTL) || '—'}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{cls.subjects?.credit_hours ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{instructorName}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{hall}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={hasSeats ? 'text-green-600' : 'text-red-600'}>
                          {capacity - enrolled}
                        </span>
                        <span className="text-slate-400"> / {capacity}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{prereqCodes.length ? prereqCodes.join(', ') : '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={
                          condition === 'available' ? 'text-green-600 font-medium' :
                          condition === 'waiting' ? 'text-amber-600' : 'text-red-600'
                        }>
                          {condition === 'available' ? t('studentPortal.available') : condition === 'waiting' ? t('studentPortal.waiting') : t('studentPortal.closed')}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {condition === 'available' ? (
                          <button
                            type="button"
                            disabled={!canRegister}
                            title={!registrationAllowed ? t('studentPortal.financialHoldAlert', 'You have an active financial hold — registration is not possible until it is lifted.') : ''}
                            onClick={goToEnroll}
                            className={`px-3 py-1.5 rounded-md border text-xs font-extrabold ${
                              canRegister ? 'bg-slate-50 border-slate-200 text-slate-900 hover:bg-slate-100' : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            {t('studentPortal.courseRegistration', 'Course registration')}
                          </button>
                        ) : condition === 'waiting' ? (
                          <button type="button" disabled className="px-3 py-1.5 rounded-md bg-amber-100 text-amber-800 text-xs font-extrabold">
                            {t('studentPortal.waitingList', 'Waiting list')}
                          </button>
                        ) : (
                          <button type="button" disabled className="px-3 py-1.5 rounded-md bg-slate-100 text-slate-500 text-xs font-extrabold">
                            {t('studentPortal.closed', 'Closed')}
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
