import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useCollege } from '../contexts/CollegeContext'
import { getLocalizedName } from '../utils/localizedName'
import { buildStudentSearchOrFilter } from '../utils/studentSearchQuery'
import { ArrowLeft, ArrowRight, ShoppingCart, Calendar, Search, Plus, X, Eye, Trash2, Check, Save, Loader, Building2 } from 'lucide-react'
import { resolveEffectiveCollegeId } from '../utils/menuPermissions'

export default function BulkEnrollment() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const navigate = useNavigate()
  const { userRole, collegeId: authCollegeId } = useAuth()
  const { selectedCollegeId, requiresCollegeSelection, colleges, setSelectedCollegeId } = useCollege()
  const collegeId = resolveEffectiveCollegeId(userRole, authCollegeId, selectedCollegeId)
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [academicYears, setAcademicYears] = useState([])
  const [semesters, setSemesters] = useState([])
  const [students, setStudents] = useState([])
  const [availableClasses, setAvailableClasses] = useState([])
  const [currentEnrollments, setCurrentEnrollments] = useState([])
  const [selectedClasses, setSelectedClasses] = useState([])
  const [studentSearch, setStudentSearch] = useState('')
  const [classSearch, setClassSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [subjects, setSubjects] = useState([])

  const [formData, setFormData] = useState({
    academic_year_id: '',
    semester_id: '',
    student_id: '',
  })

  useEffect(() => {
    if (requiresCollegeSelection) {
      return
    }
    if (collegeId) {
      fetchAcademicYears()
      fetchSemesters()
    } else {
      setAcademicYears([])
      setSemesters([])
    }
  }, [collegeId, userRole, requiresCollegeSelection])

  useEffect(() => {
    if (formData.semester_id) {
      fetchStudents()
      fetchSubjects()
    }
  }, [formData.semester_id])

  useEffect(() => {
    if (formData.student_id && formData.semester_id) {
      fetchAvailableClasses()
      fetchCurrentEnrollments()
    }
  }, [formData.student_id, formData.semester_id])

  useEffect(() => {
    if (studentSearch) {
      const timeoutId = setTimeout(() => {
        fetchStudents()
      }, 300)
      return () => clearTimeout(timeoutId)
    } else {
      fetchStudents()
    }
  }, [studentSearch, formData.semester_id])

  const fetchAcademicYears = async () => {
    if (!collegeId) return
    try {
      let query = supabase
        .from('academic_years')
        .select('id, name_en, name_ar, code, start_date, end_date')
        .order('start_date', { ascending: false })

      query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)

      const { data, error } = await query
      if (error) throw error
      setAcademicYears(data || [])
    } catch (err) {
      console.error('Error fetching academic years:', err)
    }
  }

  const fetchSemesters = async () => {
    // Don't fetch if we don't have required data
    if (userRole === 'user' && !collegeId) return
    if (userRole === 'instructor' && !collegeId) return

    try {
      let query = supabase
        .from('semesters')
        .select('id, name_en, name_ar, code, start_date, end_date, status, academic_year_id')
        .order('start_date', { ascending: false })

      // Filter by college: show college's semesters OR university-wide
      if (collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      }

      const { data, error } = await query
      if (error) throw error
      setSemesters(data || [])
    } catch (err) {
      console.error('Error fetching semesters:', err)
      setError('Failed to load semesters')
      setSemesters([]) // Set empty array on error to prevent showing stale data
    }
  }

  const fetchStudents = async () => {
    try {
      let query = supabase
        .from('students')
        .select('id, first_name, last_name, student_id, email, majors(name_en, name_ar, code), status')
        .eq('status', 'active')
        .order('first_name')

      if (collegeId) {
        query = query.eq('college_id', collegeId)
      }

      if (studentSearch) {
        const orFilter = buildStudentSearchOrFilter(studentSearch)
        if (orFilter) {
          query = query.or(orFilter)
        } else {
          query = query.ilike('student_id', `%${studentSearch}%`)
        }
      }

      const { data, error } = await query
      if (error) throw error
      setStudents(data || [])
    } catch (err) {
      console.error('Error fetching students:', err)
    }
  }

  const fetchSubjects = async () => {
    try {
      let query = supabase
        .from('subjects')
        .select('id, name_en, name_ar, code')
        .eq('status', 'active')
        .order('name_en')

      if (collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      }

      const { data, error } = await query
      if (error) throw error
      setSubjects(data || [])
    } catch (err) {
      console.error('Error fetching subjects:', err)
    }
  }

  const fetchAvailableClasses = async () => {
    try {
      let query = supabase
        .from('classes')
        .select(`
          id,
          code,
          section,
          capacity,
          enrolled,
          subjects (
            id,
            name_en,
            name_ar,
            code,
            credit_hours
          ),
          instructors (
            id,
            name_en,
            name_ar,
            email
          ),
          class_schedules (
            day_of_week,
            start_time,
            end_time,
            location
          )
        `)
        .eq('semester_id', formData.semester_id)
        .eq('status', 'active')
        .order('code')

      if (collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      }

      if (classSearch) {
        query = query.or(`code.ilike.%${classSearch}%,subjects.name_en.ilike.%${classSearch}%,subjects.name_ar.ilike.%${classSearch}%`)
      }

      if (subjectFilter !== 'all') {
        query = query.eq('subject_id', parseInt(subjectFilter))
      }

      const { data, error } = await query
      if (error) throw error
      setAvailableClasses(data || [])
    } catch (err) {
      console.error('Error fetching classes:', err)
      setError('Failed to load classes')
    }
  }

  const fetchCurrentEnrollments = async () => {
    try {
      const { data, error } = await supabase
        .from('enrollments')
        .select(`
          id,
          class_id,
          classes (
            id,
            code,
            class_schedules (
              day_of_week,
              start_time,
              end_time
            )
          )
        `)
        .eq('student_id', parseInt(formData.student_id))
        .eq('semester_id', parseInt(formData.semester_id))
        .eq('status', 'enrolled')

      if (error) throw error
      setCurrentEnrollments(data || [])
    } catch (err) {
      console.error('Error fetching current enrollments:', err)
    }
  }

  const addToCart = (classItem) => {
    // Check if already in cart
    if (selectedClasses.find(c => c.id === classItem.id)) {
      return
    }

    // Check if already enrolled
    if (currentEnrollments.find(e => e.class_id === classItem.id)) {
      setError(t('enrollments.alreadyEnrolled'))
      return
    }

    // Check capacity
    const available = (classItem.capacity || 0) - (classItem.enrolled || 0)
    if (available <= 0) {
      setError(t('enrollments.bulkClassFull'))
      return
    }

    setSelectedClasses([...selectedClasses, classItem])
    setError('')
  }

  const removeFromCart = (classId) => {
    setSelectedClasses(selectedClasses.filter(c => c.id !== classId))
  }

  const hasTimeConflict = (class1, class2) => {
    const schedules1 = class1.class_schedules || []
    const schedules2 = class2.class_schedules || []

    for (const s1 of schedules1) {
      for (const s2 of schedules2) {
        if (s1.day_of_week === s2.day_of_week) {
          const start1 = s1.start_time
          const end1 = s1.end_time
          const start2 = s2.start_time
          const end2 = s2.end_time

          if ((start1 <= start2 && end1 > start2) || (start2 <= start1 && end2 > start1)) {
            return true
          }
        }
      }
    }
    return false
  }

  const checkConflicts = (newClass) => {
    const conflicts = []
    for (const selected of selectedClasses) {
      if (hasTimeConflict(newClass, selected)) {
        conflicts.push(selected.code)
      }
    }
    for (const enrolled of currentEnrollments) {
      if (enrolled.classes && hasTimeConflict(newClass, enrolled.classes)) {
        conflicts.push(enrolled.classes.code)
      }
    }
    return conflicts
  }

  const generateScheduleGrid = () => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const times = []
    for (let hour = 8; hour <= 17; hour++) {
      times.push(`${hour.toString().padStart(2, '0')}:00`)
    }

    const grid = {}
    days.forEach(day => {
      grid[day] = {}
      times.forEach(time => {
        grid[day][time] = []
      })
    })

    // Add current enrollments (blue)
    currentEnrollments.forEach(enrollment => {
      if (enrollment.classes?.class_schedules) {
        enrollment.classes.class_schedules.forEach(schedule => {
          const day = schedule.day_of_week
          const start = schedule.start_time?.substring(0, 5)
          const end = schedule.end_time?.substring(0, 5)
          if (grid[day] && start && end) {
            const startHour = parseInt(start.split(':')[0])
            const endHour = parseInt(end.split(':')[0])
            for (let h = startHour; h < endHour; h++) {
              const timeKey = `${h.toString().padStart(2, '0')}:00`
              if (grid[day][timeKey]) {
                grid[day][timeKey].push({
                  type: 'enrolled',
                  class: enrollment.classes.code,
                  start,
                  end
                })
              }
            }
          }
        })
      }
    })

    // Add selected classes (green)
    selectedClasses.forEach(classItem => {
      if (classItem.class_schedules) {
        classItem.class_schedules.forEach(schedule => {
          const day = schedule.day_of_week
          const start = schedule.start_time?.substring(0, 5)
          const end = schedule.end_time?.substring(0, 5)
          if (grid[day] && start && end) {
            const startHour = parseInt(start.split(':')[0])
            const endHour = parseInt(end.split(':')[0])
            for (let h = startHour; h < endHour; h++) {
              const timeKey = `${h.toString().padStart(2, '0')}:00`
              if (grid[day][timeKey]) {
                grid[day][timeKey].push({
                  type: 'selected',
                  class: classItem.code,
                  start,
                  end
                })
              }
            }
          }
        })
      }
    })

    return { grid, days, times }
  }

  const calculateTotals = () => {
    const totalCredits = selectedClasses.reduce((sum, c) => sum + (c.subjects?.credit_hours || 0), 0)
    const currentCredits = currentEnrollments.reduce((sum, e) => {
      // Would need to fetch subject credit hours for enrolled classes
      return sum + 0 // Placeholder
    }, 0)
    const totalTuition = selectedClasses.reduce((sum, c) => {
      const creditHours = c.subjects?.credit_hours || 0
      const feePerCredit = 500 // This should come from college financial settings
      return sum + (creditHours * feePerCredit)
    }, 0)

    return {
      totalCredits,
      currentCredits,
      totalTuition,
      maxCredits: 18 // This should come from college academic settings
    }
  }

  const handleNext = () => {
    if (currentStep === 1 && !formData.semester_id) {
      setError(t('enrollments.bulkSelectSemester'))
      return
    }
    if (currentStep === 2 && !formData.student_id) {
      setError(t('enrollments.bulkSelectStudent'))
      return
    }
    setError('')
    setCurrentStep(prev => Math.min(prev + 1, 3))
  }

  const handleBack = () => {
    setError('')
    setCurrentStep(prev => Math.max(prev - 1, 1))
  }

  const handleSubmit = async () => {
    if (selectedClasses.length === 0) {
      setError(t('enrollments.bulkSelectAtLeastOne'))
      return
    }

    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      // Check for conflicts before enrolling
      const conflicts = []
      for (const selectedClass of selectedClasses) {
        const classConflicts = checkConflicts(selectedClass)
        if (classConflicts.length > 0) {
          conflicts.push(`${selectedClass.code} conflicts with: ${classConflicts.join(', ')}`)
        }
      }

      if (conflicts.length > 0) {
        setError(t('enrollments.bulkTimeConflicts') + ': ' + conflicts.join('; '))
        setLoading(false)
        return
      }

      // Create enrollments
      const enrollments = selectedClasses.map(classItem => ({
        student_id: parseInt(formData.student_id),
        class_id: classItem.id,
        semester_id: parseInt(formData.semester_id),
        status: 'enrolled',
        enrollment_date: new Date().toISOString(),
      }))

      const { data: createdEnrollments, error: insertError } = await supabase
        .from('enrollments')
        .insert(enrollments)
        .select()

      if (insertError) throw insertError

      // Update class enrollment counts
      for (const classItem of selectedClasses) {
        const { data: classData } = await supabase
          .from('classes')
          .select('enrolled')
          .eq('id', classItem.id)
          .limit(1)

        if (classData && classData.length > 0) {
          await supabase
            .from('classes')
            .update({ enrolled: (classData[0].enrolled || 0) + 1 })
            .eq('id', classItem.id)
        }
      }

      setSuccess(true)
      setTimeout(() => {
        navigate('/enrollments')
      }, 2000)
    } catch (err) {
      console.error('Error creating enrollments:', err)
      setError(err.message || 'Failed to create enrollments')
    } finally {
      setLoading(false)
    }
  }

  const { grid, days, times } = generateScheduleGrid()
  const totals = calculateTotals()
  const selectedStudent = students.find(s => s.id === parseInt(formData.student_id))
  const selectedSemester = semesters.find(s => s.id === parseInt(formData.semester_id))

  return (
    <div className="w-full max-w-none space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Header: dir=ltr on row so title block can be pinned to the visual right in Arabic */}
      <div className="flex items-center justify-between gap-4" dir="ltr">
        {isRTL ? (
          <>
            <button
              type="button"
              onClick={() => navigate('/enrollments')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex-shrink-0"
            >
              {t('enrollments.backToList')}
            </button>
            <div className="flex flex-1 items-center justify-end gap-3 min-w-0">
              <div className="min-w-0 text-right">
                <h1 className="text-3xl font-bold text-gray-900 text-right">{t('enrollments.bulkEnrollmentTitle')}</h1>
                <p className="text-gray-600 mt-1 text-right">{t('enrollments.bulkEnrollmentSubtitle')}</p>
              </div>
              <div className="w-12 h-12 bg-primary-gradient rounded-lg flex items-center justify-center flex-shrink-0">
                <ShoppingCart className="w-6 h-6 text-white" />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 bg-primary-gradient rounded-lg flex items-center justify-center flex-shrink-0">
                <ShoppingCart className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-3xl font-bold text-gray-900 text-left">{t('enrollments.bulkEnrollmentTitle')}</h1>
                <p className="text-gray-600 mt-1 text-left">{t('enrollments.bulkEnrollmentSubtitle')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/enrollments')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 flex-shrink-0"
            >
              {t('enrollments.backToList')}
            </button>
          </>
        )}
      </div>

      {/* College Selector for Admin */}
      {requiresCollegeSelection && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          {isRTL ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between" dir="ltr">
              <select
                value={selectedCollegeId || ''}
                onChange={(e) => setSelectedCollegeId(parseInt(e.target.value))}
                className="px-4 py-2 border border-yellow-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent min-w-[250px] w-full sm:w-auto flex-shrink-0"
                required
              >
                <option value="">{t('enrollments.selectCollege')}</option>
                {colleges.map(college => (
                  <option key={college.id} value={college.id}>
                    {getLocalizedName(college, isRTL)} ({college.code})
                  </option>
                ))}
              </select>
              <div className="flex flex-1 items-start gap-3 justify-end sm:flex-row-reverse min-w-0">
                <Building2 className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 text-right">
                  <p className="text-sm font-semibold text-yellow-900">{t('enrollments.collegeSelectionRequired')}</p>
                  <p className="text-xs text-yellow-700">{t('enrollments.collegeSelectionMessage')}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between" dir="ltr">
              <div className="flex flex-1 items-start gap-3 min-w-0">
                <Building2 className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="min-w-0 text-left">
                  <p className="text-sm font-semibold text-yellow-900">{t('enrollments.collegeSelectionRequired')}</p>
                  <p className="text-xs text-yellow-700">{t('enrollments.collegeSelectionMessage')}</p>
                </div>
              </div>
              <select
                value={selectedCollegeId || ''}
                onChange={(e) => setSelectedCollegeId(parseInt(e.target.value))}
                className="px-4 py-2 border border-yellow-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-yellow-500 focus:border-transparent min-w-[250px] w-full sm:w-auto flex-shrink-0"
                required
              >
                <option value="">{t('enrollments.selectCollege')}</option>
                {colleges.map(college => (
                  <option key={college.id} value={college.id}>
                    {getLocalizedName(college, isRTL)} ({college.code})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className={`bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
          <Check className="w-5 h-5" />
          <span>{t('enrollments.bulkCreatedSuccess')}</span>
        </div>
      )}

      <div className={`grid grid-cols-1 gap-6 ${isRTL ? '' : 'lg:grid-cols-3'}`}>
        {/* Left Panel */}
        <div className={`${isRTL ? 'col-span-1' : 'lg:col-span-2'} space-y-6`}>
          {/* Step 1: Select Academic Year and Semester */}
          {currentStep === 1 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className={`mb-4 flex w-full items-center ${isRTL ? 'justify-end' : 'justify-start'}`} dir="ltr">
                <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
                  <span className="w-8 h-8 bg-primary-gradient rounded-full flex items-center justify-center text-white font-bold">1</span>
                  <h2 className={`text-xl font-bold text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>{t('enrollments.bulkSelectSemester')}</h2>
                </div>
              </div>
              <div className="mb-4">
                <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
                  {t('enrollments.selectAcademicYear', { defaultValue: t('academic.semesters.selectAcademicYear', { defaultValue: 'Select Academic Year...' }) })}
                </label>
                <select
                  value={formData.academic_year_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, academic_year_id: e.target.value, semester_id: '' }))}
                  className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isRTL ? 'text-right' : 'text-left'}`}
                >
                  <option value="">{t('enrollments.allAcademicYears') || 'All Academic Years'}</option>
                  {academicYears.map(year => (
                    <option key={year.id} value={year.id}>{getLocalizedName(year, isRTL)} ({year.code})</option>
                  ))}
                </select>
              </div>
              <div className="w-full space-y-3 max-h-96 overflow-y-auto">
                {(formData.academic_year_id
                  ? semesters.filter(s => s.academic_year_id === parseInt(formData.academic_year_id))
                  : semesters
                ).map(semester => (
                  <button
                    key={semester.id}
                    onClick={() => {
                      setFormData(prev => ({ ...prev, semester_id: semester.id.toString() }))
                      setError('')
                    }}
                    className={`w-full ${isRTL ? 'text-right' : 'text-left'} p-4 rounded-lg border-2 transition-all ${
                      formData.semester_id === semester.id.toString()
                        ? 'border-primary-600 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold text-gray-900">{getLocalizedName(semester, isRTL)}</div>
                    <div className="text-sm text-gray-500">
                      {semester.code} - {t(`common.${semester.status}`, { defaultValue: semester.status })}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Select Student */}
          {currentStep === 2 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className={`mb-4 flex w-full items-center ${isRTL ? 'justify-end' : 'justify-start'}`} dir="ltr">
                <div className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : 'flex-row'}`}>
                  <span className="w-8 h-8 bg-primary-gradient rounded-full flex items-center justify-center text-white font-bold">2</span>
                  <h2 className={`text-xl font-bold text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>{t('enrollments.bulkSelectStudent')}</h2>
                </div>
              </div>
              <div className="mb-4">
                <div className="relative">
                  <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400`} />
                  <input
                    type="text"
                    placeholder={t('enrollments.bulkSearchStudent')}
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className={`w-full ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
                  />
                </div>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {students.map(student => (
                  <button
                    key={student.id}
                    onClick={() => {
                      setFormData(prev => ({ ...prev, student_id: student.id.toString() }))
                      setError('')
                    }}
                    className={`w-full ${isRTL ? 'text-right' : 'text-left'} p-4 rounded-lg border-2 transition-all ${
                      formData.student_id === student.id.toString()
                        ? 'border-primary-600 bg-primary-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold text-gray-900">
                      {student.first_name} {student.last_name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {student.student_id} • {getLocalizedName(student.majors, isRTL) || 'N/A'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Select Classes */}
          {currentStep === 3 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className="mb-4 flex w-full items-center justify-between gap-3" dir="ltr">
                {isRTL ? (
                  <>
                    <span className="text-sm text-gray-500 flex-shrink-0">
                      ({availableClasses.length} {t('enrollments.bulkClasses')})
                    </span>
                    <div className="flex items-center gap-2 flex-row-reverse min-w-0">
                      <span className="w-8 h-8 bg-primary-gradient rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">3</span>
                      <h2 className="text-xl font-bold text-gray-900 text-right truncate">{t('enrollments.bulkAvailableClasses')}</h2>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-8 h-8 bg-primary-gradient rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">3</span>
                      <h2 className="text-xl font-bold text-gray-900 text-left truncate">{t('enrollments.bulkAvailableClasses')}</h2>
                    </div>
                    <span className="text-sm text-gray-500 flex-shrink-0">
                      ({availableClasses.length} {t('enrollments.bulkClasses')})
                    </span>
                  </>
                )}
              </div>

              {/* Search and Filters */}
              <div className="mb-4 space-y-3">
                <div className="relative">
                  <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400`} />
                  <input
                    type="text"
                    placeholder={t('enrollments.bulkSearchClass')}
                    value={classSearch}
                    onChange={(e) => {
                      setClassSearch(e.target.value)
                      fetchAvailableClasses()
                    }}
                    className={`w-full ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
                  />
                </div>
                <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                  <select
                    value={subjectFilter}
                    onChange={(e) => {
                      setSubjectFilter(e.target.value)
                      fetchAvailableClasses()
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="all">{t('enrollments.bulkAllSubjects')}</option>
                    {subjects.map(subject => (
                    <option key={subject.id} value={subject.id}>
                        {subject.code} - {getLocalizedName(subject, isRTL)}
                    </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      setClassSearch('')
                      setSubjectFilter('all')
                      fetchAvailableClasses()
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                  >
                    {t('enrollments.bulkReset')}
                  </button>
                </div>
              </div>

              {/* Class List */}
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {availableClasses.map(classItem => {
                  const available = (classItem.capacity || 0) - (classItem.enrolled || 0)
                  const isInCart = selectedClasses.find(c => c.id === classItem.id)
                  const isEnrolled = currentEnrollments.find(e => e.class_id === classItem.id)
                  const conflicts = checkConflicts(classItem)

                  return (
                    <div
                      key={classItem.id}
                      className={`p-4 rounded-lg border-2 ${
                        isInCart
                          ? 'border-green-500 bg-green-50'
                          : conflicts.length > 0
                          ? 'border-yellow-500 bg-yellow-50'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className={`flex items-start justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900">
                            {classItem.code} - {getLocalizedName(classItem.subjects, isRTL)}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            {getLocalizedName(classItem.instructors, isRTL) || 'TBA'} • {classItem.class_schedules?.[0]?.location || 'TBA'} • {available}/{classItem.capacity} seats
                          </div>
                          <div className="text-sm font-medium text-gray-900 mt-2">
                            {classItem.subjects?.credit_hours || 0} Credits • ${((classItem.subjects?.credit_hours || 0) * 500).toFixed(2)}
                          </div>
                          {conflicts.length > 0 && !isInCart && (
                            <div className="text-xs text-yellow-700 mt-1">
                              ⚠️ Time conflict with: {conflicts.join(', ')}
                            </div>
                          )}
                        </div>
                        <div className={`flex items-center space-x-2 ${isRTL ? 'space-x-reverse mr-4' : 'ml-4'}`}>
                          {!isEnrolled && !isInCart && (
                            <button
                              onClick={() => addToCart(classItem)}
                              disabled={available <= 0}
                              className={`px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-1'}`}
                            >
                              <Plus className="w-4 h-4" />
                              <span>{t('enrollments.bulkAddToCart')}</span>
                            </button>
                          )}
                          {isInCart && (
                            <button
                              onClick={() => removeFromCart(classItem.id)}
                              className={`px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-1'}`}
                            >
                              <X className="w-4 h-4" />
                              <span>{t('enrollments.bulkRemove')}</span>
                            </button>
                          )}
                          {isEnrolled && (
                            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-lg text-sm font-medium">
                              {t('enrollments.enrolled')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Schedule Preview and Summary */}
        <div className="space-y-6">
          {/* Weekly Schedule Preview */}
          {(currentStep === 3 || (formData.student_id && formData.semester_id)) && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} mb-4`}>
                <Calendar className="w-5 h-5 text-gray-600" />
                <h3 className={`text-lg font-semibold text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>{t('enrollments.bulkWeeklySchedule')}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="w-16 p-2"></th>
                      {days.slice(0, 5).map(day => (
                        <th key={day} className="p-2 text-center font-medium text-gray-700">
                          {day.charAt(0).toUpperCase() + day.slice(1, 3)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {times.map(time => (
                      <tr key={time}>
                        <td className={`p-2 text-gray-500 ${isRTL ? 'text-left' : 'text-right'}`}>{time}</td>
                        {days.slice(0, 5).map(day => {
                          const cellData = grid[day]?.[time] || []
                          const enrolled = cellData.find(d => d.type === 'enrolled')
                          const selected = cellData.find(d => d.type === 'selected')
                          
                          return (
                            <td key={`${day}-${time}`} className="p-1 border border-gray-200 relative h-8">
                              {enrolled && (
                                <div className="absolute inset-0 bg-blue-500 rounded text-white text-xs flex items-center justify-center font-medium">
                                  {enrolled.class}
                                </div>
                              )}
                              {selected && !enrolled && (
                                <div className="absolute inset-0 bg-green-500 rounded text-white text-xs flex items-center justify-center font-medium">
                                  {selected.class}
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className={`mt-4 flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-4'} text-xs`}>
                <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                  <div className="w-4 h-4 bg-blue-500 rounded"></div>
                  <span className="text-gray-600">{t('enrollments.bulkCurrentlyEnrolled')}</span>
                </div>
                <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                  <div className="w-4 h-4 bg-green-500 rounded"></div>
                  <span className="text-gray-600">{t('enrollments.bulkSelectedInCart')}</span>
                </div>
              </div>
            </div>
          )}

          {/* Selected Classes Summary */}
          {currentStep === 3 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} mb-4`}>
                <ShoppingCart className="w-5 h-5 text-gray-600" />
                <h3 className={`text-lg font-semibold text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>
                  {t('enrollments.bulkSelectedClasses')}
                </h3>
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                  {selectedClasses.length}
                </span>
              </div>

              {selectedClasses.length === 0 ? (
                <div className={`text-center py-8 text-gray-500 ${isRTL ? 'text-right' : 'text-left'}`}>
                  <p>{t('enrollments.bulkNoClassesSelected')}</p>
                  <p className="text-sm mt-2">{t('enrollments.bulkNoClassesHint')}</p>
                </div>
              ) : (
                <div className="space-y-2 mb-4">
                  {selectedClasses.map(classItem => (
                    <div key={classItem.id} className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} p-3 bg-gray-50 rounded-lg`}>
                      <div className={isRTL ? 'text-right' : 'text-left'}>
                        <div className="font-medium text-gray-900">{classItem.code}</div>
                        <div className="text-sm text-gray-600">
                          {classItem.subjects?.credit_hours || 0} {t('enrollments.bulkCredits')}
                        </div>
                      </div>
                      <button
                        onClick={() => removeFromCart(classItem.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Credit Hours Progress */}
              <div className="mb-4">
                <div className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} mb-2`}>
                  <span className={`text-sm font-medium text-gray-700 ${isRTL ? 'text-right' : 'text-left'}`}>{t('enrollments.bulkCreditHours')}</span>
                  <span className="text-sm text-gray-600">
                    {totals.currentCredits + totals.totalCredits}/{totals.maxCredits}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-primary-600 h-2 rounded-full transition-all"
                    style={{ width: `${Math.min(100, ((totals.currentCredits + totals.totalCredits) / totals.maxCredits) * 100)}%` }}
                  ></div>
                </div>
                <div className={`text-xs text-gray-500 mt-1 ${isRTL ? 'text-right' : 'text-left'}`}>
                  {t('enrollments.bulkCurrent')} ({totals.currentCredits}) + {t('enrollments.bulkSelected')} ({totals.totalCredits})
                </div>
              </div>

              {/* Summary */}
              <div className={`space-y-2 pt-4 border-t ${isRTL ? 'text-right' : 'text-left'}`}>
                <div className={`flex ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} text-sm`}>
                  <span className="text-gray-600">{t('enrollments.bulkSelectedClasses')}:</span>
                  <span className="font-medium text-gray-900">{selectedClasses.length}</span>
                </div>
                <div className={`flex ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} text-sm`}>
                  <span className="text-gray-600">{t('enrollments.bulkTotalTuition')}:</span>
                  <span className="font-medium text-gray-900">${totals.totalTuition.toFixed(2)}</span>
                </div>
                <div className={`flex ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} text-sm`}>
                  <span className="text-gray-600">{t('enrollments.bulkTotalCredits')}:</span>
                  <span className="font-medium text-gray-900">{totals.totalCredits}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 space-y-2">
                <button
                  onClick={handleSubmit}
                  disabled={loading || selectedClasses.length === 0}
                  className={`w-full flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} justify-center px-4 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Check className="w-5 h-5" />
                  <span>{loading ? t('enrollments.bulkEnrolling') : t('enrollments.bulkEnrollSelected')}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className={`flex ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'}`}>
        <button
          onClick={handleBack}
          disabled={currentStep === 1}
          className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isRTL ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          <span>{t('enrollments.previous')}</span>
        </button>
        {currentStep < 3 ? (
          <button
            onClick={handleNext}
            className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-6 py-2 bg-primary-gradient text-white rounded-lg font-semibold hover:shadow-lg transition-all`}
          >
            <span>{t('enrollments.next')}</span>
            {isRTL ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
          </button>
        ) : null}
      </div>
    </div>
  )
}
