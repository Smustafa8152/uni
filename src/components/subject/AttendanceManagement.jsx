import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { getPersonName } from '../../utils/localizedName'
import { Save, X, CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react'

export default function AttendanceManagement({ classId, sessionId, enrollmentIds, onClose, onSave }) {
  const { t } = useTranslation()
  const { userRole } = useAuth()
  const { isRTL } = useLanguage()
  const canRecordAttendance = userRole === 'instructor'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [students, setStudents] = useState([])
  const [attendanceRecords, setAttendanceRecords] = useState({})
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => {
    if (enrollmentIds && enrollmentIds.length > 0) {
      fetchStudents()
      fetchExistingAttendance()
    }
  }, [enrollmentIds, sessionId])

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('enrollments')
        .select(`
          id,
          student_id,
          students(id, name_en, name_ar, first_name, middle_name, last_name, first_name_ar, middle_name_ar, last_name_ar, student_id, email)
        `)
        .in('id', enrollmentIds)
        .eq('status', 'enrolled')

      if (error) throw error

      const studentsList = (data || []).map(e => ({
        enrollmentId: e.id,
        studentId: e.student_id,
        ...e.students,
      }))
      setStudents(studentsList)

      // Initialize attendance records
      const initialRecords = {}
      studentsList.forEach(student => {
        initialRecords[student.enrollmentId] = 'present'
      })
      setAttendanceRecords(initialRecords)
    } catch (err) {
      console.error('Error fetching students:', err)
      setError('Failed to load students')
    }
  }

  const fetchExistingAttendance = async () => {
    if (!sessionId) return

    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('*')
        .eq('session_id', sessionId)
        .in('enrollment_id', enrollmentIds)

      if (error) throw error

      const existingRecords = {}
      data?.forEach(record => {
        existingRecords[record.enrollment_id] = record.status
      })
      setAttendanceRecords(existingRecords)
    } catch (err) {
      console.error('Error fetching existing attendance:', err)
    }
  }

  const handleAttendanceChange = (enrollmentId, status) => {
    if (!canRecordAttendance) return
    setAttendanceRecords(prev => ({
      ...prev,
      [enrollmentId]: status
    }))
  }

  const handleSave = async () => {
    if (!canRecordAttendance) return
    setLoading(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: userData } = await supabase
        .from('users')
        .select('id')
        .eq('email', user.email)
        .single()

      const recordsToInsert = Object.entries(attendanceRecords).map(([enrollmentId, status]) => {
        const student = students.find(s => s.enrollmentId === parseInt(enrollmentId))
        return {
          enrollment_id: parseInt(enrollmentId),
          class_id: classId,
          student_id: student?.studentId,
          date: sessionDate,
          status,
          session_id: sessionId || null,
          recorded_by: userData.id,
        }
      })

      // Delete existing records for this session if updating
      if (sessionId) {
        await supabase
          .from('attendance')
          .delete()
          .eq('session_id', sessionId)
          .in('enrollment_id', enrollmentIds)
      }

      // Insert new records
      const { error: insertError } = await supabase
        .from('attendance')
        .insert(recordsToInsert)

      if (insertError) throw insertError

      if (onSave) onSave()
      if (onClose) onClose()
    } catch (err) {
      console.error('Error saving attendance:', err)
      setError(err.message || 'Failed to save attendance')
    } finally {
      setLoading(false)
    }
  }

  const statusOptions = [
    { value: 'present', labelKey: 'attendance.takeAttendance.present', icon: CheckCircle, color: 'text-green-600' },
    { value: 'absent', labelKey: 'attendance.takeAttendance.absent', icon: XCircle, color: 'text-red-600' },
    { value: 'late', labelKey: 'attendance.takeAttendance.late', icon: Clock, color: 'text-yellow-600' },
    { value: 'excused', labelKey: 'attendance.takeAttendance.excused', icon: AlertCircle, color: 'text-blue-600' },
  ]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {canRecordAttendance ? t('attendance.takeAttendance.title') : t('attendance.takeAttendance.viewTitle')}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {students.length} {t('common.students')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          )}

          {!canRecordAttendance && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-900 text-sm">
              {t('attendance.takeAttendance.viewOnlyHint')}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('attendance.takeAttendance.sessionDateLabel')}
              {canRecordAttendance ? ' *' : ''}
            </label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              readOnly={!canRecordAttendance}
              disabled={!canRecordAttendance}
              required={canRecordAttendance}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>

          <div className="space-y-3">
            {students.map(student => {
              const currentStatus = attendanceRecords[student.enrollmentId] || 'present'
              return (
                <div key={student.enrollmentId} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold text-gray-900">{getPersonName(student, isRTL) || 'Unknown Student'}</p>
                      <p className="text-sm text-gray-600">ID: {student.student_id || student.email}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {statusOptions.map(option => {
                      const OptionIcon = option.icon
                      const isSelected = currentStatus === option.value
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={!canRecordAttendance}
                          onClick={() => handleAttendanceChange(student.enrollmentId, option.value)}
                          className={`flex items-center justify-center space-x-2 p-3 border-2 rounded-lg transition-all ${
                            isSelected
                              ? 'border-primary-600 bg-primary-50 text-primary-900'
                              : 'border-gray-200 hover:border-gray-300 text-gray-700'
                          } disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-gray-200`}
                        >
                          <OptionIcon className={`w-5 h-5 ${option.color}`} />
                          <span className="font-medium">{t(option.labelKey)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="flex items-center justify-end space-x-4 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {canRecordAttendance ? t('attendance.takeAttendance.cancel') : t('common.close')}
            </button>
            {canRecordAttendance && (
              <button
                type="button"
                onClick={handleSave}
                disabled={loading}
                className="flex items-center space-x-2 px-6 py-2 bg-primary-gradient text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-5 h-5" />
                <span>
                  {loading ? t('attendance.takeAttendance.saving') : t('attendance.takeAttendance.saveAttendance')}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}






