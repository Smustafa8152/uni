import { useMemo, useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getSemesterCreditsFromUniversitySettings } from '../../utils/getCollegeSettings'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { ArrowLeft, CreditCard } from 'lucide-react'
import { getStudentSemesterMilestone, checkFinancePermission } from '../../utils/financePermissions'

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

export default function StudentEnrollment() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const location = useLocation()
  const navigate = useNavigate()
  const { user, userRole } = useAuth()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [fetching, setFetching] = useState(true)

  const [student, setStudent] = useState(null)
  const [semesters, setSemesters] = useState([])
  const [classes, setClasses] = useState([])
  const [selectedClassObjs, setSelectedClassObjs] = useState([])
  const [validationWarnings, setValidationWarnings] = useState([])
  const [validationErrors, setValidationErrors] = useState([])
  const [currentSemesterCredits, setCurrentSemesterCredits] = useState(0)
  const [studentMajorSheet, setStudentMajorSheet] = useState(null)
  const [currentSemester, setCurrentSemester] = useState(null)
  const [registrationStatus, setRegistrationStatus] = useState(null) // { allowed: boolean, reason: string }
  const [semesterCreditsFromUni, setSemesterCreditsFromUni] = useState({
    min_credit_hours: 12,
    max_credit_hours: 18,
    max_credit_hours_with_permission: 21,
    min_gpa_for_max_credits: 3.0,
  })

  const [formData, setFormData] = useState({
    semester_id: '',
    student_id: '',
    class_ids: [],
    status: 'enrolled',
  })
  const [courseGroups, setCourseGroups] = useState([])
  const [enrolledRows, setEnrolledRows] = useState([]) // current registered courses for semester
  const [financeBlockReason, setFinanceBlockReason] = useState('')

  const scheduleToText = (sched) => {
    if (!sched?.length) return '—'
    const one = sched[0]
    return `${one.day_of_week} ${one.start_time}-${one.end_time}`
  }

  // Must be declared before any early returns to keep hooks order stable.
  const availableToAdd = useMemo(() => {
    const enrolledClassIds = new Set((enrolledRows || []).map((r) => r.class_id))
    return (classes || [])
      .filter((c) => !enrolledClassIds.has(c.id))
      .map((c) => {
        const seats = (c.capacity || 0) - (c.enrolled || 0)
        return { ...c, _seats: seats }
      })
  }, [classes, enrolledRows])

  useEffect(() => {
    if (user?.email) {
      fetchStudent()
    }
  }, [user])

  useEffect(() => {
    if (student?.id) {
      setFormData(prev => ({ ...prev, student_id: student.id.toString() }))
      fetchSemesters()
    }
  }, [student])

  // Preselect semester from querystring (?semester=ID)
  useEffect(() => {
    const qs = new URLSearchParams(location.search || '')
    const sem = qs.get('semester')
    if (sem && !formData.semester_id) {
      setFormData((p) => ({ ...p, semester_id: String(sem), class_ids: [] }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search])

  useEffect(() => {
    if (formData.semester_id && student?.id) {
      fetchSemesterDetails()
      checkRegistrationDeadline()
      fetchClasses()
      fetchStudentMajorSheet()
      fetchCurrentSemesterEnrollments()
      fetchEnrolledRows()
      checkFinanceGate()
    }
  }, [formData.semester_id, student])

  useEffect(() => {
    if (formData.student_id && formData.semester_id && formData.class_ids.length > 0) {
      validateEnrollment()
    } else {
      setValidationWarnings([])
      setValidationErrors([])
    }
  }, [formData.student_id, formData.class_ids, formData.semester_id, studentMajorSheet, currentSemesterCredits, semesterCreditsFromUni])

  useEffect(() => {
    if (formData.semester_id && formData.student_id && studentMajorSheet) {
      fetchClasses()
    }
  }, [studentMajorSheet, formData.student_id, formData.semester_id])

  useEffect(() => {
    if (formData.class_ids && classes.length > 0) {
      const selected = classes.filter(c => formData.class_ids.includes(c.id.toString()))
      setSelectedClassObjs(selected)
    } else {
      setSelectedClassObjs([])
    }
  }, [formData.class_ids, classes])

  useEffect(() => {
    const fetchCredits = async () => {
      const credits = await getSemesterCreditsFromUniversitySettings()
      setSemesterCreditsFromUni(credits)
    }
    fetchCredits()
  }, [])

  const fetchStudent = async () => {
    try {
      if (!user?.email) return

      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('id, student_id, first_name, last_name, email, major_id, enrollment_date, college_id')
        .eq('email', user.email)
        .eq('status', 'active')
        .single()

      if (studentError) throw studentError
      setStudent(studentData)
    } catch (err) {
      console.error('Error fetching student:', err)
      setError(err.message || 'Failed to load student data')
    } finally {
      setFetching(false)
    }
  }

  const fetchSemesters = async () => {
    if (!student?.college_id) return

    try {
      // Load all semesters for the college (any status) so dropdown always shows available semesters.
      // Registration allowed/blocked is enforced by checkRegistrationDeadline when user selects a semester.
      const { data, error } = await supabase
        .from('semesters')
        .select('id, name_en, code, start_date, end_date, registration_start_date, registration_end_date, late_registration_end_date, status, college_id, is_university_wide')
        .or(`college_id.eq.${student.college_id},is_university_wide.eq.true`)
        .order('start_date', { ascending: false })

      if (error) throw error

      setSemesters(data || [])

      // Default semester if none selected yet
      if (!formData.semester_id && data?.length) {
        const active = data.find((s) => s.status === 'registration_open' || s.status === 'active')
        setFormData((p) => ({ ...p, semester_id: String(active?.id || data[0].id) }))
      }
    } catch (err) {
      console.error('Error fetching semesters:', err)
      setError(err.message || 'Failed to load semesters')
    }
  }

  const checkFinanceGate = async () => {
    try {
      if (!student?.id || !formData.semester_id) return
      const { milestone, hold } = await getStudentSemesterMilestone(student.id, parseInt(formData.semester_id))
      const check = checkFinancePermission('SE_REG', milestone, hold)
      setFinanceBlockReason(check.allowed ? '' : (check.reason || 'Financial hold'))
    } catch (e) {
      console.error('Finance gate error:', e)
      setFinanceBlockReason('')
    }
  }

  const fetchEnrolledRows = async () => {
    try {
      if (!student?.id || !formData.semester_id) return
      const { data, error } = await supabase
        .from('enrollments')
        .select(`
          id,
          class_id,
          status,
          classes (
            id,
            code,
            section,
            room,
            building,
            class_schedules(day_of_week, start_time, end_time, location),
            subjects(code, name_en, name_ar, credit_hours)
          )
        `)
        .eq('student_id', student.id)
        .eq('semester_id', parseInt(formData.semester_id))
        .eq('status', 'enrolled')
        .order('id', { ascending: false })
      if (error) throw error
      setEnrolledRows(data || [])
    } catch (e) {
      console.error('Fetch enrolled rows error:', e)
      setEnrolledRows([])
    }
  }

  const dropEnrollment = async (enrollmentId, classId) => {
    try {
      setLoading(true)
      setError('')
      const { error: updErr } = await supabase
        .from('enrollments')
        .update({ status: 'dropped', updated_at: new Date().toISOString() })
        .eq('id', enrollmentId)
      if (updErr) throw updErr
      await updateClassEnrollmentCount(classId, -1)
      await fetchCurrentSemesterEnrollments()
      await fetchEnrolledRows()
    } catch (e) {
      console.error('Drop enrollment error:', e)
      setError(e?.message || 'Failed to drop course')
    } finally {
      setLoading(false)
    }
  }

  const checkRegistrationDeadline = async () => {
    if (!formData.semester_id || !currentSemester) return

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]

    const status = {
      allowed: false,
      reason: '',
      isLateRegistration: false
    }

    try {
      // Check registration start date
      if (currentSemester.registration_start_date) {
        const startDate = new Date(currentSemester.registration_start_date)
        startDate.setHours(0, 0, 0, 0)
        if (today < startDate) {
          status.allowed = false
          status.reason = `Registration has not started yet. Registration opens on ${new Date(currentSemester.registration_start_date).toLocaleDateString()}.`
          setRegistrationStatus(status)
          return
        }
      }

      // Check regular registration end date
      if (currentSemester.registration_end_date) {
        const endDate = new Date(currentSemester.registration_end_date)
        endDate.setHours(23, 59, 59, 999)
        if (today <= endDate) {
          status.allowed = true
          status.reason = ''
          setRegistrationStatus(status)
          return
        }
      }

      // Check late registration
      if (currentSemester.late_registration_end_date) {
        const lateEndDate = new Date(currentSemester.late_registration_end_date)
        lateEndDate.setHours(23, 59, 59, 999)
        if (today <= lateEndDate) {
          status.allowed = true
          status.isLateRegistration = true
          status.reason = `Late registration period. Late registration ends on ${new Date(currentSemester.late_registration_end_date).toLocaleDateString()}.`
          setRegistrationStatus(status)
          return
        }
      }

      // If no dates set but status is registration_open or active, allow it
      if (currentSemester.status === 'registration_open' || currentSemester.status === 'active') {
        if (!currentSemester.registration_start_date && !currentSemester.registration_end_date) {
          status.allowed = true
          status.reason = ''
          setRegistrationStatus(status)
          return
        }
      }

      // Registration period has ended
      status.allowed = false
      const lastDeadline = currentSemester.late_registration_end_date || currentSemester.registration_end_date
      if (lastDeadline) {
        status.reason = `Registration period has ended. The deadline was ${new Date(lastDeadline).toLocaleDateString()}. Please contact the registrar's office.`
      } else {
        status.reason = 'Registration period has ended. Please contact the registrar\'s office.'
      }
      setRegistrationStatus(status)
    } catch (err) {
      console.error('Error checking registration deadline:', err)
      status.allowed = false
      status.reason = 'Error checking registration deadline. Please try again.'
      setRegistrationStatus(status)
    }
  }

  const fetchSemesterDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('semesters')
        .select('*')
        .eq('id', formData.semester_id)
        .single()

      if (error) throw error
      setCurrentSemester(data)
    } catch (err) {
      console.error('Error fetching semester details:', err)
    }
  }

  const fetchStudentMajorSheet = async () => {
    try {
      if (!formData.student_id) return

      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('id, major_id, enrollment_date')
        .eq('id', parseInt(formData.student_id))
        .single()

      if (studentError) throw studentError
      if (!studentData) return

      const admissionYear = studentData.enrollment_date 
        ? new Date(studentData.enrollment_date).getFullYear().toString()
        : new Date().getFullYear().toString()

      const { data: studentMajorSheetData, error: sheetError } = await supabase
        .from('student_major_sheets')
        .select(`
          *,
          major_sheets (
            *,
            major_id
          )
        `)
        .eq('student_id', parseInt(formData.student_id))
        .eq('is_active', true)
        .maybeSingle()

      if (sheetError && sheetError.code !== 'PGRST116') {
        console.error('Error fetching student major sheet:', sheetError)
        return
      }

      if (!studentMajorSheetData && studentData.major_id) {
        const { data: majorSheetData, error: majorSheetError } = await supabase
          .from('major_sheets')
          .select('*')
          .eq('major_id', studentData.major_id)
          .eq('is_active', true)
          .ilike('academic_year', `%${admissionYear}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!majorSheetError && majorSheetData) {
          setStudentMajorSheet({
            major_sheet: majorSheetData
          })
          await fetchCourseGroups(majorSheetData.id)
        }
      } else if (studentMajorSheetData) {
        setStudentMajorSheet(studentMajorSheetData)
        await fetchCourseGroups(studentMajorSheetData.major_sheet.id)
      }
    } catch (err) {
      console.error('Error fetching student major sheet:', err)
    }
  }

  const fetchCourseGroups = async (majorSheetId) => {
    try {
      const { data: groups, error } = await supabase
        .from('course_groups')
        .select(`
          *,
          major_sheet_courses (
            subject_id
          )
        `)
        .eq('major_sheet_id', majorSheetId)
        .eq('is_active', true)
        .order('group_number')

      if (error) throw error
      setCourseGroups(groups || [])
    } catch (err) {
      console.error('Error fetching course groups:', err)
      setCourseGroups([])
    }
  }

  const fetchCurrentSemesterEnrollments = async () => {
    try {
      if (!formData.student_id || !formData.semester_id) return

      const { data: enrollments, error } = await supabase
        .from('enrollments')
        .select(`
          *,
          classes (
            subjects (credit_hours)
          )
        `)
        .eq('student_id', parseInt(formData.student_id))
        .eq('semester_id', parseInt(formData.semester_id))
        .eq('status', 'enrolled')

      if (error) throw error

      const credits = (enrollments || []).reduce((sum, enrollment) => {
        if (enrollment.classes?.subjects?.credit_hours) {
          return sum + parseInt(enrollment.classes.subjects.credit_hours)
        }
        return sum
      }, 0) || 0

      setCurrentSemesterCredits(credits)
    } catch (err) {
      console.error('Error fetching current semester enrollments:', err)
    }
  }

  const fetchClasses = async () => {
    try {
      if (!formData.semester_id) return

      let query = supabase
        .from('classes')
        .select(`
          *,
          subjects (
            id, name_en, code, credit_hours
          ),
          instructors (
            id, name_en, name_ar
          )
        `)
        .eq('semester_id', parseInt(formData.semester_id))
        .eq('status', 'active')

      // Filter by major sheet if available
      if (studentMajorSheet?.major_sheet) {
        const { data: majorSheetCourses, error: mscError } = await supabase
          .from('major_sheet_courses')
          .select('subject_id')
          .eq('major_sheet_id', studentMajorSheet.major_sheet.id)

        if (!mscError && majorSheetCourses && majorSheetCourses.length > 0) {
          const subjectIds = majorSheetCourses.map(c => c.subject_id)
          query = query.in('subject_id', subjectIds)
        }
      }

      const { data, error } = await query.order('code')

      if (error) throw error
      setClasses(data || [])
    } catch (err) {
      console.error('Error fetching classes:', err)
      setError(err.message || 'Failed to load classes')
    }
  }

  const validateEnrollment = async () => {
    if (!formData.student_id || !formData.class_ids || formData.class_ids.length === 0 || !formData.semester_id) {
      setValidationWarnings([])
      setValidationErrors([])
      return
    }

    const warnings = []
    const errors = []

    try {
      const selectedClasses = classes.filter(c => formData.class_ids.includes(c.id.toString()))
      if (selectedClasses.length === 0) {
        setValidationErrors(['Please select at least one class'])
        return
      }

      const selectedCredits = selectedClasses.reduce((sum, cls) => {
        return sum + (parseInt(cls.subjects?.credit_hours) || 0)
      }, 0)
      const newTotalCredits = currentSemesterCredits + selectedCredits

      // Check registration deadline
      if (!registrationStatus?.allowed) {
        errors.push(registrationStatus?.reason || 'Registration is not currently open for this semester.')
      }

      // Check financial milestone (requires PM30 for enrollment)
      if (currentSemester) {
        const { milestone, hold } = await getStudentSemesterMilestone(parseInt(formData.student_id), currentSemester.id)
        const financeCheck = checkFinancePermission('SE_REG', milestone, hold)
        if (!financeCheck.allowed) {
          errors.push(`Financial: ${financeCheck.reason}`)
        }
      }

      // Credit limits validation - use university settings only
      const minCredits = semesterCreditsFromUni.min_credit_hours
      const maxCredits = semesterCreditsFromUni.max_credit_hours_with_permission

      if (newTotalCredits < minCredits) {
        warnings.push(`Total credits (${currentSemesterCredits} current + ${selectedCredits} new = ${newTotalCredits} total) will be below minimum required (${minCredits}) for this semester.`)
      }

      if (newTotalCredits > maxCredits) {
        errors.push(`Total credits (${currentSemesterCredits} current + ${selectedCredits} new = ${newTotalCredits} total) exceeds maximum allowed (${maxCredits}) for this semester.`)
      }

      setValidationWarnings(warnings)
      setValidationErrors(errors)
    } catch (err) {
      console.error('Error validating enrollment:', err)
      setValidationErrors(['Error validating enrollment. Please try again.'])
    }
  }

  const handleClassToggle = (classId) => {
    const classIdStr = classId.toString()
    setFormData(prev => {
      const currentIds = prev.class_ids || []
      if (currentIds.includes(classIdStr)) {
        return { ...prev, class_ids: currentIds.filter(id => id !== classIdStr) }
      } else {
        return { ...prev, class_ids: [...currentIds, classIdStr] }
      }
    })
  }

  const handleSubmit = async () => {
    if (validationErrors.length > 0) {
      setError('Please fix the errors before submitting.')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Create enrollments for each selected class
      for (const classId of formData.class_ids) {
        // Check if enrollment already exists
        const { data: existingEnrollment, error: checkError } = await supabase
          .from('enrollments')
          .select('id, status')
          .eq('student_id', parseInt(formData.student_id))
          .eq('class_id', parseInt(classId))
          .eq('semester_id', parseInt(formData.semester_id))
          .maybeSingle()

        if (checkError && checkError.code !== 'PGRST116') {
          throw checkError
        }

        if (existingEnrollment) {
          // Update existing enrollment
          const { error: updateError } = await supabase
            .from('enrollments')
            .update({
              status: 'enrolled',
              updated_at: new Date().toISOString()
            })
            .eq('id', existingEnrollment.id)

          if (updateError) throw updateError

          // Update class enrolled count if status was not enrolled
          if (existingEnrollment.status !== 'enrolled') {
            await updateClassEnrollmentCount(parseInt(classId), 1)
          }
        } else {
          // Create new enrollment
          const { error: insertError } = await supabase
            .from('enrollments')
            .insert({
              student_id: parseInt(formData.student_id),
              class_id: parseInt(classId),
              semester_id: parseInt(formData.semester_id),
              status: 'enrolled',
              enrolled_at: new Date().toISOString()
            })

          if (insertError) throw insertError

          // Update class enrolled count
          await updateClassEnrollmentCount(parseInt(classId), 1)
        }
      }

      setSuccess(true)
      setTimeout(() => {
        navigate('/courses')
      }, 2000)
    } catch (err) {
      console.error('Error creating enrollment:', err)
      setError(err.message || 'Failed to enroll in classes')
    } finally {
      setLoading(false)
    }
  }

  const updateClassEnrollmentCount = async (classId, increment) => {
    try {
      const { data: classDataArray, error } = await supabase
        .from('classes')
        .select('enrolled')
        .eq('id', classId)

      if (error) throw error

      const classData = classDataArray && classDataArray.length > 0 ? classDataArray[0] : null

      if (classData) {
        await supabase
          .from('classes')
          .update({ enrolled: (classData.enrolled || 0) + increment })
          .eq('id', classId)
      }
    } catch (err) {
      console.error('Error updating class enrollment count:', err)
    }
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!student) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate(-1)}
          className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-gray-600 hover:text-gray-900`}
        >
          <ArrowLeft className="w-5 h-5" />
          <span>{t('common.back')}</span>
        </button>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          Student not found or inactive. Please contact support.
        </div>
      </div>
    )
  }

  const canRegisterNow = !!registrationStatus?.allowed && !financeBlockReason
  const totalHours = currentSemesterCredits
  const waitlistedCount = 0
  const maxHours = semesterCreditsFromUni?.max_credit_hours_with_permission || 21

  return (
    <div className={`space-y-6 ${isRTL ? 'text-right' : 'text-left'}`}>
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-2 text-sm" style={{ color: UI.muted }}>
        <a href="/" className="no-underline hover:underline" style={{ color: UI.muted }}>{t('studentPortal.profile.breadcrumbHome', { defaultValue: 'Home' })}</a>
        <span style={{ color: UI.bdr }}>/</span>
        <a href="/dashboard" className="no-underline hover:underline" style={{ color: UI.muted }}>{t('studentPortal.studentPortal', { defaultValue: 'Student Portal' })}</a>
        <span style={{ color: UI.bdr }}>/</span>
        <span className="font-semibold" style={{ color: UI.p }}>{t('studentPortal.courseRegistration', { defaultValue: 'Course registration' })}</span>
      </nav>

      <div>
        <h1 className="text-2xl font-extrabold" style={{ color: UI.p }}>{t('studentPortal.courseRegistration', { defaultValue: 'Course registration' })}</h1>
        <p className="text-sm" style={{ color: UI.muted }}>
          {currentSemester?.name_en ? `${currentSemester?.name_en}` : t('studentPortal.currentSemester', { defaultValue: 'Current semester' })}
        </p>
      </div>

      {(financeBlockReason || !registrationStatus?.allowed) && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          🚫 <strong>{t('studentPortal.enrollmentBlocked', { defaultValue: 'Registration is blocked' })}</strong> —{' '}
          {financeBlockReason ? financeBlockReason : (registrationStatus?.reason || t('studentPortal.registrationClosed', { defaultValue: 'Registration is closed.' }))}
          {' '}
          <a href="/student/payments" className="underline inline-flex items-center gap-1">
            <CreditCard className="w-4 h-4" />
            {t('studentPortal.payNow', { defaultValue: 'Pay now' })}
          </a>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
        <div className="space-y-6">
          {/* Registered courses */}
          <div className="bg-white rounded-xl border shadow-sm" style={{ borderColor: UI.bdr }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: UI.bdr }}>
              <div className="text-base font-extrabold" style={{ color: UI.p }}>
                {t('studentPortal.registration.currentRegistered', { defaultValue: 'Currently registered courses' })}
              </div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold" style={{ backgroundColor: '#e6f7ef', color: UI.ok }}>
                {totalHours} {t('studentPortal.hours', { defaultValue: 'hours' })}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: UI.p, color: 'white' }}>
                    <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.registration.course', { defaultValue: 'Course' })}</th>
                    <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.hours', { defaultValue: 'Hours' })}</th>
                    <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.registration.time', { defaultValue: 'Time' })}</th>
                    <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.theHall', { defaultValue: 'Hall' })}</th>
                    <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.registration.status', { defaultValue: 'Status' })}</th>
                    <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.documents.colActions', { defaultValue: 'Actions' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {enrolledRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center" style={{ color: UI.muted }}>
                        {t('studentPortal.registration.none', { defaultValue: 'No registered courses yet.' })}
                      </td>
                    </tr>
                  ) : (
                    enrolledRows.map((r) => {
                      const subj = r.classes?.subjects
                      const hall = [r.classes?.building, r.classes?.room].filter(Boolean).join(' ') || '—'
                      return (
                        <tr key={r.id} className="border-b" style={{ borderColor: UI.bdr }}>
                          <td className="px-4 py-3">
                            <strong>{subj?.code || '—'}</strong> — {subj?.name_en || '—'}
                          </td>
                          <td className="px-4 py-3">{subj?.credit_hours || 0}</td>
                          <td className="px-4 py-3">{scheduleToText(r.classes?.class_schedules)}</td>
                          <td className="px-4 py-3">{hall}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold" style={{ backgroundColor: '#e6f7ef', color: UI.ok }}>
                              {t('studentPortal.registration.confirmed', { defaultValue: 'Confirmed' })}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              disabled={!canRegisterNow || loading}
                              onClick={() => dropEnrollment(r.id, r.class_id)}
                              className="px-3 py-1.5 rounded-md text-xs font-extrabold text-white disabled:opacity-50"
                              style={{ backgroundColor: UI.err }}
                            >
                              {t('studentPortal.registration.drop', { defaultValue: 'Drop' })}
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ backgroundColor: UI.bg, fontWeight: 800 }}>
                    <td className="px-4 py-3" colSpan={5}>{t('studentPortal.registration.totalHours', { defaultValue: 'Total registered hours' })}</td>
                    <td className="px-4 py-3">{totalHours} {t('studentPortal.hours', { defaultValue: 'hours' })}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Add course */}
          <div className={`bg-white rounded-xl border shadow-sm ${!canRegisterNow ? 'opacity-60 pointer-events-none' : ''}`} style={{ borderColor: UI.bdr }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: UI.bdr }}>
              <div className="text-base font-extrabold" style={{ color: UI.p }}>{t('studentPortal.registration.addCourse', { defaultValue: 'Add course' })}</div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold" style={{ backgroundColor: '#fee2e2', color: UI.err }}>
                {canRegisterNow ? t('studentPortal.documents.statusActive', { defaultValue: 'Active' }) : t('studentPortal.registration.blocked', { defaultValue: 'Blocked' })}
              </span>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-4 items-end">
              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: UI.txt }}>{t('studentPortal.registration.pickCourse', { defaultValue: 'Choose course' })}</label>
                <select
                  className="w-full px-3 py-2.5 rounded-md border bg-white"
                  style={{ borderColor: UI.bdr }}
                  value={formData.class_ids?.[0] || ''}
                  onChange={(e) => setFormData((p) => ({ ...p, class_ids: e.target.value ? [e.target.value] : [] }))}
                >
                  <option value="">{t('common.select', { defaultValue: 'Select' })}</option>
                  {availableToAdd.map((c) => (
                    <option key={c.id} value={String(c.id)} disabled={c._seats <= 0}>
                      {c.subjects?.code} — {c.subjects?.name_en} ({c._seats} seats)
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={!canRegisterNow || loading || (formData.class_ids || []).length === 0 || validationErrors.length > 0}
                onClick={handleSubmit}
                className="px-5 py-2.5 rounded-md font-extrabold text-white disabled:opacity-50"
                style={{ backgroundColor: UI.p }}
              >
                + {t('studentPortal.registration.add', { defaultValue: 'Add' })}
              </button>
            </div>
            {validationErrors.length > 0 && (
              <div className="px-6 pb-5 text-sm text-red-700">
                {validationErrors[0]}
              </div>
            )}
          </div>

          {/* Rules */}
          <div className="bg-white rounded-xl border shadow-sm" style={{ borderColor: UI.bdr }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: UI.bdr }}>
              <div className="text-base font-extrabold" style={{ color: UI.p }}>{t('studentPortal.registration.rules', { defaultValue: 'Registration rules applied' })}</div>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-md" style={{ backgroundColor: UI.bg }}>
                <div className="font-extrabold mb-1">{t('studentPortal.registration.minHours', { defaultValue: 'Minimum hours' })}</div>
                <div style={{ color: UI.muted }}>{semesterCreditsFromUni.min_credit_hours} {t('studentPortal.hours', { defaultValue: 'hours' })}</div>
              </div>
              <div className="p-3 rounded-md" style={{ backgroundColor: UI.bg }}>
                <div className="font-extrabold mb-1">{t('studentPortal.registration.maxHours', { defaultValue: 'Maximum hours' })}</div>
                <div style={{ color: UI.muted }}>{maxHours} {t('studentPortal.hours', { defaultValue: 'hours' })}</div>
              </div>
              <div className="p-3 rounded-md" style={{ backgroundColor: UI.bg }}>
                <div className="font-extrabold mb-1">{t('studentPortal.registration.prereqs', { defaultValue: 'Prerequisites' })}</div>
                <div style={{ color: UI.muted }}>{t('studentPortal.registration.prereqsAuto', { defaultValue: 'Applied automatically when adding' })}</div>
              </div>
              <div className="p-3 rounded-md" style={{ backgroundColor: UI.bg }}>
                <div className="font-extrabold mb-1">{t('studentPortal.registration.conflicts', { defaultValue: 'Schedule conflicts' })}</div>
                <div style={{ color: UI.muted }}>{t('studentPortal.registration.conflictsAuto', { defaultValue: 'Detected and reported immediately' })}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-white rounded-xl border shadow-sm" style={{ borderColor: UI.bdr }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: UI.bdr }}>
              <div className="text-base font-extrabold" style={{ color: UI.p }}>{t('studentPortal.registration.summary', { defaultValue: 'Registration summary' })}</div>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: UI.bdr }}>
                <span style={{ color: UI.muted }}>{t('studentPortal.registration.registeredHours', { defaultValue: 'Registered hours' })}</span>
                <strong>{totalHours}</strong>
              </div>
              <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: UI.bdr }}>
                <span style={{ color: UI.muted }}>{t('studentPortal.registration.max', { defaultValue: 'Maximum' })}</span>
                <strong>{maxHours} {t('studentPortal.hours', { defaultValue: 'hours' })}</strong>
              </div>
              <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: UI.bdr }}>
                <span style={{ color: UI.muted }}>{t('studentPortal.registration.waitlisted', { defaultValue: 'Waitlisted' })}</span>
                <strong>{waitlistedCount}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: UI.muted }}>{t('studentPortal.registration.state', { defaultValue: 'Registration status' })}</span>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold" style={{ backgroundColor: canRegisterNow ? '#e6f7ef' : '#fee2e2', color: canRegisterNow ? UI.ok : UI.err }}>
                  {canRegisterNow ? t('studentPortal.registration.active', { defaultValue: 'Active' }) : t('studentPortal.registration.blocked', { defaultValue: 'Blocked' })}
                </span>
              </div>
            </div>
            {!canRegisterNow && (
              <a
                href="/student/payments"
                className="mx-6 mb-6 inline-flex items-center justify-center gap-2 w-[calc(100%-3rem)] px-4 py-3 rounded-md font-extrabold text-white no-underline"
                style={{ backgroundColor: UI.err }}
              >
                💳 {t('studentPortal.registration.payToLift', { defaultValue: 'Pay to lift the hold' })}
              </a>
            )}
          </div>
        </div>
      </div>
      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {t('enrollments.createdSuccess', { defaultValue: 'Enrollment saved successfully.' })}
        </div>
      )}
    </div>
  )
}

