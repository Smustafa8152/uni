import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { getGradingScaleFromUniversitySettings, calculateGpaWithScale } from '../../utils/getCollegeSettings'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCollege } from '../../contexts/CollegeContext'
import { Search, GraduationCap, FileText, TrendingUp } from 'lucide-react'

export default function StudentGrades() {
  const { t, i18n } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabicLayout = isRTL ||
    language === 'ar' ||
    i18n?.language?.toLowerCase()?.startsWith('ar') ||
    (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl')
  const navigate = useNavigate()
  const { userRole, collegeId: authCollegeId, departmentId } = useAuth()
  const { selectedCollegeId, colleges, setSelectedCollegeId } = useCollege()
  const [students, setStudents] = useState([])
  const [filteredStudents, setFilteredStudents] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProgram, setSelectedProgram] = useState('')
  const [loading, setLoading] = useState(false)
  const [collegeId, setCollegeId] = useState(null)
  const [gradingScale, setGradingScale] = useState([])
  const [enrollmentsByStudent, setEnrollmentsByStudent] = useState({})
  const [activeSemester, setActiveSemester] = useState(null)

  useEffect(() => {
    // Only set collegeId and fetch if we have the required data
    if (userRole === 'admin' && selectedCollegeId) {
      setCollegeId(selectedCollegeId)
    } else if (userRole === 'user' && authCollegeId) {
      setCollegeId(authCollegeId)
    } else if (userRole === 'instructor' && authCollegeId) {
      setCollegeId(authCollegeId)
    } else if (userRole === 'admin' && !selectedCollegeId) {
      // Admin without selected college - can show all or wait
      setCollegeId(null)
    }
  }, [userRole, selectedCollegeId, authCollegeId])

  useEffect(() => {
    // Only fetch when we have the necessary data based on role
    if (userRole === 'admin') {
      // Admin can fetch (with or without college filter)
      fetchStudents()
    } else if (userRole === 'user' && authCollegeId) {
      // College admin needs collegeId
      fetchStudents()
    } else if (userRole === 'instructor' && authCollegeId) {
      // Instructor needs collegeId (departmentId is optional but query handles it)
      fetchStudents()
    }
    // Don't fetch if we don't have required data
  }, [userRole, collegeId, authCollegeId, departmentId])

  useEffect(() => {
    filterStudents()
  }, [searchTerm, selectedProgram, students])

  useEffect(() => {
    getGradingScaleFromUniversitySettings().then(setGradingScale)
  }, [])

  useEffect(() => {
    if (collegeId || userRole === 'admin') {
      supabase
        .from('semesters')
        .select('id, name_en, code, status, is_current, start_date')
        .in('status', ['active', 'in_progress', 'registration_open'])
        .order('start_date', { ascending: false })
        .limit(20)
        .then(({ data }) => {
          const list = data || []
          const current = list.find((s) => s.is_current) || list[0] || null
          setActiveSemester(current)
        })
    }
  }, [collegeId, userRole])

  useEffect(() => {
    if (filteredStudents.length === 0) {
      setEnrollmentsByStudent({})
      return
    }
    const studentIds = filteredStudents.map((s) => s.id)
    // Batch to avoid oversized .in() filters
    const batchSize = 100
    const load = async () => {
      const byStudent = {}
      for (let i = 0; i < studentIds.length; i += batchSize) {
        const batch = studentIds.slice(i, i + batchSize)
        const { data } = await supabase
          .from('enrollments')
          .select(`
            student_id,
            semester_id,
            numeric_grade,
            grade_points,
            grade,
            classes(id, subjects(id, credit_hours)),
            grade_components(numeric_grade, final, gpa_points, letter_grade)
          `)
          .in('student_id', batch)
          .eq('status', 'enrolled')
        ;(data || []).forEach((e) => {
          if (!byStudent[e.student_id]) byStudent[e.student_id] = []
          byStudent[e.student_id].push(e)
        })
      }
      setEnrollmentsByStudent(byStudent)
    }
    load()
  }, [filteredStudents])

  const fetchStudents = async () => {
    // Don't fetch if we don't have required data
    if (userRole === 'user' && !authCollegeId) return
    if (userRole === 'instructor' && !authCollegeId) return

    try {
      setLoading(true)
      let query = supabase
        .from('students')
        .select(`
          id,
          student_id,
          name_en,
          name_ar,
          first_name,
          last_name,
          first_name_ar,
          last_name_ar,
          major_id,
          majors(id, name_en, name_ar),
          college_id,
          colleges(id, name_en, name_ar)
        `)
        .eq('status', 'active')

      // Filter by college for college admins
      if (userRole === 'user' && authCollegeId) {
        query = query.eq('college_id', authCollegeId)
      }
      // Filter by college and department for instructors
      else if (userRole === 'instructor' && authCollegeId) {
        query = query.eq('college_id', authCollegeId)
        // Also filter by department if instructor has a department
        if (departmentId) {
          // Get majors that belong to this department first
          const { data: departmentMajors, error: majorsError } = await supabase
            .from('majors')
            .select('id')
            .eq('department_id', departmentId)
          
          if (majorsError) throw majorsError
          
          if (departmentMajors && departmentMajors.length > 0) {
            const majorIds = departmentMajors.map(m => m.id)
            query = query.in('major_id', majorIds)
          } else {
            // No majors in this department, return empty result
            query = query.eq('major_id', -1)
          }
        }
      }
      // Filter by selected college for super admins
      else if (userRole === 'admin' && collegeId) {
        query = query.eq('college_id', collegeId)
      }

      query = query.order('name_en')

      const { data, error } = await query
      if (error) throw error
      setStudents(data || [])
    } catch (err) {
      console.error('Error fetching students:', err)
      setStudents([]) // Set empty array on error to prevent showing stale data
    } finally {
      setLoading(false)
    }
  }

  const filterStudents = () => {
    let filtered = [...students]

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter((s) =>
        s.student_id?.toLowerCase().includes(term) ||
        s.name_en?.toLowerCase().includes(term) ||
        s.name_ar?.toLowerCase().includes(term) ||
        s.first_name?.toLowerCase().includes(term) ||
        s.last_name?.toLowerCase().includes(term) ||
        s.first_name_ar?.toLowerCase().includes(term) ||
        s.last_name_ar?.toLowerCase().includes(term)
      )
    }

    if (selectedProgram) {
      filtered = filtered.filter((s) => String(s.major_id || s.majors?.id || '') === String(selectedProgram))
    }

    setFilteredStudents(filtered)
  }

  const getStudentGpas = (studentId) => {
    const enrollments = enrollmentsByStudent[studentId] || []
    const allGpa = calculateGpaWithScale(enrollments, gradingScale)
    const currentGpa = activeSemester
      ? calculateGpaWithScale(enrollments, gradingScale, activeSemester.id)
      : allGpa
    return {
      currentSemesterGpa: currentGpa.gpa,
      totalGpa: allGpa.gpa,
    }
  }

  const formatStudentId = (id) => String(id || '').replace(/^STU/i, '')

  const programOptions = useMemo(() => {
    const map = new Map()
    students.forEach((s) => {
      if (s.majors?.id) map.set(s.majors.id, s.majors)
    })
    return [...map.values()].sort((a, b) =>
      (getLocalizedName(a, isArabicLayout) || '').localeCompare(getLocalizedName(b, isArabicLayout) || '', isArabicLayout ? 'ar' : 'en')
    )
  }, [students, isArabicLayout])

  const displayStudentName = (student) => {
    if (!student) return '—'
    if (isArabicLayout) {
      const ar = [student.first_name_ar, student.last_name_ar].filter(Boolean).join(' ').trim()
      if (ar) return ar
      if (student.name_ar?.trim()) return student.name_ar.trim()
    }
    if (student.name_en?.trim()) return student.name_en.trim()
    return [student.first_name, student.last_name].filter(Boolean).join(' ').trim() || '—'
  }

  return (
    <div className="space-y-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
      <div className={isArabicLayout ? 'text-right' : 'text-left'} dir={isArabicLayout ? 'rtl' : 'ltr'}>
        <h1 className="text-3xl font-bold text-gray-900">{t('grading.studentGrades.title')}</h1>
        <p className="text-gray-600 mt-1">{t('grading.studentGrades.subtitle')}</p>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div
          className={`grid grid-cols-1 gap-4 ${userRole === 'admin' ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}
          dir={isArabicLayout ? 'rtl' : 'ltr'}
        >
          {userRole === 'admin' && (
            <div>
              <label
                className={`block text-sm font-medium text-gray-700 mb-2 ${isArabicLayout ? 'text-right' : 'text-left'}`}
              >
                {t('grading.gradeManagement.selectCollege')}
              </label>
              <select
                value={selectedCollegeId ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setSelectedCollegeId(v ? parseInt(v, 10) : null)
                }}
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isArabicLayout ? 'text-right' : 'text-left'}`}
              >
                <option value="">{t('grading.gradeManagement.allColleges')}</option>
                {colleges.map((college) => (
                  <option key={college.id} value={college.id}>
                    {getLocalizedName(college, isArabicLayout)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className={`block text-sm font-medium text-gray-700 mb-2 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
              {t('common.search')}
            </label>
            <div className="relative">
              <Search
                className={`absolute ${isArabicLayout ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none`}
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t('grading.studentGrades.searchPlaceholder')}
                className={`w-full ${isArabicLayout ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4 text-left'} py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
              />
            </div>
          </div>
          <div>
            <label className={`block text-sm font-medium text-gray-700 mb-2 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
              {t('grading.studentGrades.program')}
            </label>
            <select
              value={selectedProgram}
              onChange={(e) => setSelectedProgram(e.target.value)}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isArabicLayout ? 'text-right' : 'text-left'}`}
            >
              <option value="">{t('grading.studentGrades.allPrograms')}</option>
              {programOptions.map((major) => (
                <option key={major.id} value={String(major.id)}>
                  {getLocalizedName(major, isArabicLayout)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Students List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className={`text-xl font-bold text-gray-900 mb-4 ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.studentGrades.students')} ({filteredStudents.length})</h2>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <GraduationCap className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>{t('grading.studentGrades.noStudentsFound')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" dir={isArabicLayout ? 'rtl' : 'ltr'}>
              <thead className="bg-gray-50">
                <tr>
                  <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.studentGrades.studentId')}</th>
                  <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.studentGrades.name')}</th>
                  <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.studentGrades.program')}</th>
                  <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.studentGrades.currentSemesterGpa')}</th>
                  <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.studentGrades.totalGpa')}</th>
                  <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.studentGrades.status')}</th>
                  <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 ${isArabicLayout ? 'text-right' : 'text-left'}`} dir="ltr">
                      {formatStudentId(student.student_id)}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
                      {displayStudentName(student)}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-500 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
                      {getLocalizedName(student.majors, isArabicLayout) || '—'}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-500 ${isArabicLayout ? 'text-right' : 'text-left'}`} dir="ltr">
                      {getStudentGpas(student.id).currentSemesterGpa}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-500 ${isArabicLayout ? 'text-right' : 'text-left'}`} dir="ltr">
                      {getStudentGpas(student.id).totalGpa}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap ${isArabicLayout ? 'text-right' : 'text-left'}`}>
                      <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                        {t('grading.studentGrades.active')}
                      </span>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${isArabicLayout ? 'text-right' : 'text-left'}`}>
                      <button
                        type="button"
                        onClick={() => navigate(`/grading/students/${student.id}/report`)}
                        className="text-primary-600 hover:text-primary-900"
                      >
                        {t('grading.studentGrades.viewReport')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

