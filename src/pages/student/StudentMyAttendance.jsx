import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Calendar, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'
import { getPersonName } from '../../utils/localizedName'

export default function StudentMyAttendance() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(null)
  const [attendance, setAttendance] = useState([])
  const [selectedSemesterId, setSelectedSemesterId] = useState('')
  const [semesters, setSemesters] = useState([])
  const [stats, setStats] = useState({
    total: 0,
    present: 0,
    absent: 0,
    late: 0,
    excused: 0,
    attendanceRate: 0,
  })

  useEffect(() => {
    if (user?.email) {
      fetchStudentData()
    }
  }, [user])

  useEffect(() => {
    if (student?.id) {
      fetchSemesters()
      if (selectedSemesterId) {
        fetchAttendance()
      }
    }
  }, [student, selectedSemesterId])

  const fetchStudentData = async () => {
    try {
      setLoading(true)
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('id, student_id, name_en, first_name, last_name, email, college_id')
        .eq('email', user.email)
        .eq('status', 'active')
        .single()

      if (studentError) throw studentError
      setStudent(studentData)
    } catch (err) {
      console.error('Error fetching student data:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchSemesters = async () => {
    try {
      // Get semesters where student has enrollments
      const { data: enrollmentsData } = await supabase
        .from('enrollments')
        .select('semester_id')
        .eq('student_id', student.id)
        .eq('status', 'enrolled')

      const semesterIds = [...new Set((enrollmentsData || []).map(e => e.semester_id))]

      if (semesterIds.length === 0) {
        setSemesters([])
        return
      }

      const { data, error } = await supabase
        .from('semesters')
        .select('id, name_en, code, start_date, end_date, status')
        .in('id', semesterIds)
        .order('start_date', { ascending: false })

      if (error) throw error
      setSemesters(data || [])
      
      // Auto-select first semester if available
      if (data && data.length > 0) {
        setSelectedSemesterId(String(data[0].id))
      }
    } catch (err) {
      console.error('Error fetching semesters:', err)
    }
  }

  const fetchAttendance = async () => {
    if (!student?.id || !selectedSemesterId) return

    try {
      setLoading(true)
      // Get enrollments for this student in the selected semester
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from('enrollments')
        .select('id, class_id')
        .eq('student_id', student.id)
        .eq('semester_id', selectedSemesterId)
        .eq('status', 'enrolled')

      if (enrollmentsError) throw enrollmentsError

      if (!enrollments || enrollments.length === 0) {
        setAttendance([])
        setStats({ total: 0, present: 0, absent: 0, late: 0, excused: 0, attendanceRate: 0 })
        setLoading(false)
        return
      }

      const enrollmentIds = enrollments.map(e => e.id)

      // Fetch attendance records
      const { data: attendanceData, error: attendanceError } = await supabase
        .from('attendance')
        .select(`
          *,
          class_sessions(
            id,
            session_date,
            start_time,
            end_time,
            classes(
              id,
              code,
              subjects(id, name_en, code)
            )
          )
        `)
        .in('enrollment_id', enrollmentIds)
        .order('date', { ascending: false })

      if (attendanceError) throw attendanceError

      // Calculate statistics
      const total = attendanceData?.length || 0
      const present = attendanceData?.filter(a => a.status === 'present').length || 0
      const absent = attendanceData?.filter(a => a.status === 'absent').length || 0
      const late = attendanceData?.filter(a => a.status === 'late').length || 0
      const excused = attendanceData?.filter(a => a.status === 'excused').length || 0
      const attendanceRate = total > 0 ? ((present + late + excused) / total * 100).toFixed(1) : 0

      setAttendance(attendanceData || [])
      setStats({ total, present, absent, late, excused, attendanceRate: parseFloat(attendanceRate) })
    } catch (err) {
      console.error('Error fetching attendance:', err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'present':
        return <CheckCircle className="w-5 h-5 text-green-600" />
      case 'absent':
        return <XCircle className="w-5 h-5 text-red-600" />
      case 'late':
        return <Clock className="w-5 h-5 text-yellow-600" />
      case 'excused':
        return <AlertCircle className="w-5 h-5 text-blue-600" />
      default:
        return <XCircle className="w-5 h-5 text-gray-600" />
    }
  }

  const getStatusText = (status) => {
    switch (status) {
      case 'present':
        return t('student.myAttendance.present')
      case 'absent':
        return t('student.myAttendance.absent')
      case 'late':
        return t('student.myAttendance.late')
      case 'excused':
        return t('student.myAttendance.excused')
      default:
        return status
    }
  }

  if (loading && !student) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!student) {
    return (
      <div className="text-center py-12 text-gray-500">
        <Calendar className="w-16 h-16 mx-auto mb-4 opacity-50" />
        <p>{t('student.myAttendance.studentNotFound')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'}`}>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('student.myAttendance.title')}</h1>
          <p className="text-gray-600 mt-1">{t('student.myAttendance.subtitle')}</p>
        </div>
      </div>

      {/* Student Info */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <h3 className={`text-sm font-medium text-gray-500 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('student.myAttendance.studentName')}</h3>
            <p className={`text-lg font-semibold text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>
              {getPersonName(student, isRTL)}
            </p>
          </div>
          <div>
            <h3 className={`text-sm font-medium text-gray-500 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>{t('student.myAttendance.studentId')}</h3>
            <p className={`text-lg font-semibold text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>{student.student_id}</p>
          </div>
          <div>
            <label className={`block text-sm font-medium text-gray-700 mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
              {t('student.myAttendance.selectSemester')}
            </label>
            <select
              value={selectedSemesterId}
              onChange={(e) => setSelectedSemesterId(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="">{t('student.myAttendance.selectSemesterPlaceholder')}</option>
              {semesters.map(semester => (
                <option key={semester.id} value={semester.id}>
                  {semester.name_en} ({semester.code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      {selectedSemesterId && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-6">
              <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('student.myAttendance.totalSessions')}</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-green-200 p-6">
              <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('student.myAttendance.present')}</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.present}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-red-200 p-6">
              <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <XCircle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('student.myAttendance.absent')}</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.absent}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-yellow-200 p-6">
              <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-6 h-6 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('student.myAttendance.late')}</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.late}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-purple-200 p-6">
              <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">{t('student.myAttendance.attendanceRate')}</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.attendanceRate}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Attendance Records Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <h2 className={`text-xl font-bold text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>
                {t('student.myAttendance.attendanceRecords')}
              </h2>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : attendance.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Calendar className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>{t('student.myAttendance.noAttendanceRecords')}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase ${isRTL ? 'text-right' : 'text-left'}`}>
                        {t('student.myAttendance.date')}
                      </th>
                      <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase ${isRTL ? 'text-right' : 'text-left'}`}>
                        {t('student.myAttendance.time')}
                      </th>
                      <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase ${isRTL ? 'text-right' : 'text-left'}`}>
                        {t('student.myAttendance.course')}
                      </th>
                      <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase ${isRTL ? 'text-right' : 'text-left'}`}>
                        {t('student.myAttendance.class')}
                      </th>
                      <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase ${isRTL ? 'text-right' : 'text-left'}`}>
                        {t('student.myAttendance.status')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {attendance.map((record) => {
                      const session = record.class_sessions
                      const classData = session?.classes
                      return (
                        <tr key={record.id} className="hover:bg-gray-50">
                          <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>
                            {new Date(record.date).toLocaleDateString()}
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>
                            {session?.start_time} - {session?.end_time}
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>
                            {classData?.subjects?.name_en || '-'}
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>
                            {classData?.code || '-'}
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap ${isRTL ? 'text-right' : 'text-left'}`}>
                            <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                              {getStatusIcon(record.status)}
                              <span className="text-sm font-medium text-gray-900">
                                {getStatusText(record.status)}
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {!selectedSemesterId && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
          <Calendar className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p>{t('student.myAttendance.selectSemesterToView')}</p>
        </div>
      )}
    </div>
  )
}

