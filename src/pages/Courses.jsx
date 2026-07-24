import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { Search, Plus, BookOpen, Users, Clock, Award, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function Courses() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const navigate = useNavigate()
  const { user, userRole, collegeId: authCollegeId } = useAuth()
  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSemesterId, setSelectedSemesterId] = useState('')
  const [selectedMajorId, setSelectedMajorId] = useState('')
  const [semesters, setSemesters] = useState([])
  const [majors, setMajors] = useState([])
  const [student, setStudent] = useState(null)
  const [instructor, setInstructor] = useState(null)

  useEffect(() => {
    if (userRole === 'student' && user?.email) {
      fetchStudentData()
    } else if (userRole === 'instructor' && user?.email) {
      fetchInstructorData()
    } else {
      fetchCourses()
      fetchSemesters()
      fetchMajors()
    }
  }, [userRole, user, selectedSemesterId, selectedMajorId])

  useEffect(() => {
    if (userRole === 'student' && student?.id && selectedSemesterId) {
      fetchStudentCourses()
    } else if (userRole === 'instructor' && instructor?.id) {
      fetchInstructorSubjects()
    }
  }, [student, instructor, selectedSemesterId])

  const fetchStudentData = async () => {
    try {
      setLoading(true)
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('id, student_id, name_en, college_id, major_id')
        .eq('email', user.email)
        .eq('status', 'active')
        .single()

      if (studentError) throw studentError
      setStudent(studentData)

      // Fetch semesters where student has enrollments
      if (studentData?.id) {
        const { data: enrollmentsData } = await supabase
          .from('enrollments')
          .select('semester_id')
          .eq('student_id', studentData.id)
          .eq('status', 'enrolled')

        const semesterIds = [...new Set((enrollmentsData || []).map(e => e.semester_id))]

        if (semesterIds.length > 0) {
          const { data: semestersData, error: semestersError } = await supabase
            .from('semesters')
            .select('id, name_en, code, start_date, end_date')
            .in('id', semesterIds)
            .order('start_date', { ascending: false })

          if (!semestersError && semestersData) {
            setSemesters(semestersData)
            if (!selectedSemesterId && semestersData.length > 0) {
              const currentSemester = semestersData.find(s => s.status === 'active') || semestersData[0]
              setSelectedSemesterId(String(currentSemester.id))
            }
          }
        }
      }
    } catch (err) {
      console.error('Error fetching student data:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchInstructorData = async () => {
    try {
      setLoading(true)
      const { data: instructorData, error: instructorError } = await supabase
        .from('instructors')
        .select('id, name_en, email, college_id')
        .eq('email', user.email)
        .eq('status', 'active')
        .single()

      if (instructorError) throw instructorError
      setInstructor(instructorData)
    } catch (err) {
      console.error('Error fetching instructor data:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchInstructorSubjects = async () => {
    if (!instructor?.id) return

    try {
      setLoading(true)
      const { data: subjects, error: subjectsError } = await supabase
        .from('subjects')
        .select(`
          id,
          name_en,
          code,
          credit_hours,
          semester_number,
          type,
          majors(
            id,
            name_en,
            code
          ),
          colleges(
            id,
            name_en,
            code
          )
        `)
        .eq('instructor_id', instructor.id)
        .eq('status', 'active')
        .order('code')

      if (subjectsError) throw subjectsError

      // Transform subjects to courses format
      const coursesData = (subjects || []).map(subject => ({
        id: subject.id,
        subjectId: subject.id,
        code: subject.code || '',
        name: subject.name_en || '',
        major: subject.majors?.name_en || '',
        credits: subject.credit_hours || 0,
        semester: `Semester ${subject.semester_number || 'N/A'}`,
        type: subject.type || '',
        college: subject.colleges?.name_en || '',
      }))

      setCourses(coursesData)
    } catch (err) {
      console.error('Error fetching instructor subjects:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchStudentCourses = async () => {
    if (!student?.id || !selectedSemesterId) return

    try {
      setLoading(true)
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from('enrollments')
        .select(`
          id,
          enrollment_date,
          status,
          classes(
            id,
            code,
            section,
            capacity,
            enrolled,
            room,
            building,
            subject_id,
            subjects(
              id,
              name_en,
              code,
              credit_hours,
              majors(
                id,
                name_en,
                code
              )
            ),
            instructors(
              id,
              name_en
            )
          ),
          semesters(
            id,
            name_en,
            code
          ),
          grade_components(
            numeric_grade,
            letter_grade,
            gpa_points
          )
        `)
        .eq('student_id', student.id)
        .eq('status', 'enrolled')
        .eq('semester_id', selectedSemesterId)
        .order('enrollment_date', { ascending: false })

      if (enrollmentsError) throw enrollmentsError

      // Transform enrollments to courses format
      const coursesData = (enrollments || []).map(enrollment => {
        const classData = enrollment.classes
        const subject = classData?.subjects
        const grade = enrollment.grade_components
        const comp = Array.isArray(grade) ? grade[0] : grade
        return {
          id: enrollment.id,
          enrollmentId: enrollment.id,
          subjectId: subject?.id || classData?.subject_id,
          code: subject?.code || '',
          name: subject?.name_en || '',
          classCode: classData?.code || '',
          section: classData?.section || '',
          major: classData?.subjects?.majors?.name_en || '',
          credits: subject?.credit_hours || 0,
          enrolled: classData?.enrolled || 0,
          capacity: classData?.capacity || 0,
          instructor: classData?.instructors?.name_en || 'TBA',
          semester: enrollment.semesters?.name_en || '',
          semesterId: enrollment.semester_id,
          enrollmentDate: enrollment.enrollment_date,
          status: enrollment.status,
          grade: comp?.letter_grade || enrollment.grade || null,
          numericGrade: comp?.numeric_grade ?? enrollment.numeric_grade ?? null,
          gpaPoints: comp?.gpa_points ?? enrollment.grade_points ?? null,
          room: classData?.room || '',
          building: classData?.building || '',
        }
      })

      setCourses(coursesData)
    } catch (err) {
      console.error('Error fetching student courses:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchCourses = async () => {
    try {
      setLoading(true)
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
          subjects(
            id,
            name_en,
            code,
            credit_hours,
            majors(
              id,
              name_en,
              code
            )
          ),
          instructors(id, name_en),
          semesters(id, name_en, code)
        `)
        .eq('status', 'active')
        .order('code')

      // Filter by college for college admins
      if (userRole === 'user' && authCollegeId) {
        query = query.or(`college_id.eq.${authCollegeId},is_university_wide.eq.true`)
      }

      // Filter by semester
      if (selectedSemesterId) {
        query = query.eq('semester_id', selectedSemesterId)
      }

      const { data, error } = await query
      if (error) throw error

      // Transform classes to courses format
      const coursesData = (data || []).map(classItem => ({
        id: classItem.id,
        subjectId: classItem.subjects?.id || classItem.subject_id || null,
        code: classItem.subjects?.code || '',
        name: classItem.subjects?.name_en || '',
        classCode: classItem.code,
        section: classItem.section,
        major: classItem.subjects?.majors?.name_en || '',
        credits: classItem.subjects?.credit_hours || 0,
        enrolled: classItem.enrolled || 0,
        capacity: classItem.capacity || 0,
        instructor: classItem.instructors?.name_en || 'TBA',
        semester: classItem.semesters?.name_en || '',
        room: classItem.room || '',
        building: classItem.building || '',
      }))

      // Filter by major if selected
      const filteredCourses = selectedMajorId
        ? coursesData.filter(c => c.majorId === parseInt(selectedMajorId))
        : coursesData

      setCourses(filteredCourses)
    } catch (err) {
      console.error('Error fetching courses:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchSemesters = async () => {
    try {
      let query = supabase
        .from('semesters')
        .select('id, name_en, code, start_date, end_date')
        .eq('status', 'active')
        .order('start_date', { ascending: false })

      if (userRole === 'user' && authCollegeId) {
        query = query.eq('college_id', authCollegeId)
      }

      const { data, error } = await query
      if (error) throw error
      setSemesters(data || [])
    } catch (err) {
      console.error('Error fetching semesters:', err)
    }
  }

  const fetchMajors = async () => {
    try {
      let query = supabase
        .from('majors')
        .select('id, name_en, code')
        .order('name_en')

      if (userRole === 'user' && authCollegeId) {
        query = query.eq('college_id', authCollegeId)
      }

      const { data, error } = await query
      if (error) throw error
      setMajors(data || [])
    } catch (err) {
      console.error('Error fetching majors:', err)
    }
  }

  const getEnrollmentPercentage = (enrolled, capacity) => {
    if (!capacity || capacity === 0) return 0
    return Math.round((enrolled / capacity) * 100)
  }

  const getEnrollmentColor = (percentage) => {
    if (percentage >= 90) return 'bg-red-500'
    if (percentage >= 75) return 'bg-yellow-500'
    return 'bg-green-500'
  }

  const filteredCourses = courses.filter(course => {
    const matchesSearch = searchQuery === '' || 
      course.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      course.classCode?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSearch
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'}`}>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {userRole === 'student' ? t('navigation.mySubjects') : userRole === 'instructor' ? t('navigation.mySubjects') : t('courses.title')}
          </h1>
          <p className="text-gray-600 mt-1">
            {userRole === 'student' 
              ? t('courses.subtitleStudent') 
              : userRole === 'instructor'
              ? 'View and manage your assigned subjects'
              : t('courses.subtitle')
            }
          </p>
        </div>
        {(userRole === 'admin' || userRole === 'user') && (
          <button 
            onClick={() => navigate('/academic/classes/create')}
            className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} bg-primary-gradient text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all`}
          >
            <Plus className="w-5 h-5" />
            <span>{t('navigation.coursesAddCourse')}</span>
          </button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className={`flex flex-col md:flex-row gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className={`flex-1 relative ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400`} />
            <input
              type="text"
              placeholder={t('navigation.coursesSearchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
            />
          </div>
          {!selectedMajorId && userRole !== 'student' && majors.length > 0 && (
            <select
              value={selectedMajorId}
              onChange={(e) => setSelectedMajorId(e.target.value)}
              className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">{t('navigation.coursesAllMajors')}</option>
              {majors.map(major => (
                <option key={major.id} value={major.id}>
                  {major.name_en} ({major.code})
                </option>
              ))}
            </select>
          )}
          {(semesters.length > 0 || userRole === 'student') && (
            <select
              value={selectedSemesterId}
              onChange={(e) => setSelectedSemesterId(e.target.value)}
              className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">{t('navigation.coursesAllSemesters')}</option>
              {semesters.map(semester => (
                <option key={semester.id} value={semester.id}>
                  {semester.name_en} ({semester.code})
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Courses Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : filteredCourses.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
          <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>
            {userRole === 'student' 
              ? t('navigation.coursesNoCoursesEnrolled')
              : userRole === 'instructor'
              ? 'No subjects assigned to you yet'
              : t('navigation.coursesNoCoursesFound')
            }
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCourses.map((course) => {
            const enrollmentPercentage = getEnrollmentPercentage(course.enrolled, course.capacity)
            return (
              <div
                key={course.id}
                className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
              >
                <div className={`flex items-start ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} mb-4`}>
                  <div className={isRTL ? 'text-right' : 'text-left'}>
                    <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} mb-2`}>
                      <BookOpen className="w-5 h-5 text-primary-600" />
                      <span className="text-sm font-semibold text-primary-600">{course.code}</span>
                      {course.classCode && (
                        <span className="text-xs text-gray-500">({course.classCode})</span>
                      )}
                    </div>
                    <h3 className={`text-lg font-bold text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>{course.name}</h3>
                    {course.section && (
                      <p className={`text-sm text-gray-500 mt-1 ${isRTL ? 'text-right' : 'text-left'}`}>
                        {t('navigation.coursesSection')}: {course.section}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-3 mb-4">
                  {course.major && (
                    <div className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} text-sm`}>
                      <span className="text-gray-600">{t('navigation.coursesMajor')}:</span>
                      <span className={`font-medium text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>{course.major}</span>
                    </div>
                  )}
                  <div className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} text-sm`}>
                    <span className="text-gray-600">{t('navigation.coursesInstructor')}:</span>
                    <span className={`font-medium text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>{course.instructor}</span>
                  </div>
                  {course.semester && (
                    <div className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} text-sm`}>
                      <span className="text-gray-600">{t('navigation.coursesSemester')}:</span>
                      <span className={`font-medium text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>{course.semester}</span>
                    </div>
                  )}
                  {(course.room || course.building) && (
                    <div className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} text-sm`}>
                      <span className="text-gray-600">{t('navigation.coursesLocation')}:</span>
                      <span className={`font-medium text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>
                        {[course.building, course.room].filter(Boolean).join(' - ') || 'TBA'}
                      </span>
                    </div>
                  )}
                  {course.grade && (
                    <div className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} text-sm`}>
                      <span className="text-gray-600">{t('navigation.coursesGrade')}:</span>
                      <span className={`font-medium text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>{course.grade}</span>
                    </div>
                  )}
                  <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-4'} text-sm`}>
                    <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-1'}`}>
                      <Award className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-600">{course.credits} {t('navigation.coursesCredits')}</span>
                    </div>
                  </div>
                </div>

                {(userRole === 'admin' || userRole === 'user') && course.capacity > 0 && (
                  <div className="pt-4 border-t border-gray-200">
                    <div className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} mb-2`}>
                      <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                        <Users className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-600">{t('navigation.coursesEnrollment')}</span>
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        {course.enrolled}/{course.capacity}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${getEnrollmentColor(enrollmentPercentage)}`}
                        style={{ width: `${enrollmentPercentage}%` }}
                      />
                    </div>
                    <p className={`text-xs text-gray-500 mt-1 ${isRTL ? 'text-right' : 'text-left'}`}>{enrollmentPercentage}% {t('navigation.coursesFull')}</p>
                  </div>
                )}

                <div className={`pt-4 border-t border-gray-200 ${isRTL ? 'text-right' : 'text-left'}`}>
                  {(userRole === 'student' || userRole === 'instructor') ? (
                    <button
                      onClick={() => {
                        const subjectId = course.subjectId || course.id
                        if (userRole === 'student' && subjectId) {
                          navigate(`/student/subjects/${subjectId}`)
                        } else if (userRole === 'instructor' && subjectId) {
                          navigate(`/instructor/subjects/${subjectId}`)
                        }
                      }}
                      className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-primary-600 hover:text-primary-800 text-sm font-medium`}
                    >
                      <Eye className="w-4 h-4" />
                      <span>View Subject</span>
                    </button>
                  ) : (
                    course.subjectId && (
                      <button
                        onClick={() => navigate(`/academic/subjects/${course.subjectId}`)}
                        className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-primary-600 hover:text-primary-800 text-sm font-medium`}
                      >
                        <Eye className="w-4 h-4" />
                        <span>{t('navigation.coursesViewDetails')}</span>
                      </button>
                    )
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}




