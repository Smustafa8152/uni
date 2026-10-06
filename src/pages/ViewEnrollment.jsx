import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Edit, X, User, Trash2, Calendar, DollarSign, GraduationCap, CheckCircle } from 'lucide-react'

export default function ViewEnrollment() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [enrollment, setEnrollment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [financialTransactions, setFinancialTransactions] = useState([])

  useEffect(() => {
    fetchEnrollment()
    fetchAttendance()
    fetchFinancialTransactions()
  }, [id])

  const fetchEnrollment = async () => {
    try {
      const { data, error } = await supabase
        .from('enrollments')
        .select(`
          id,
          enrollment_date,
          status,
          grade,
          numeric_grade,
          grade_points,
          created_at,
          updated_at,
          students (
            id,
            first_name,
            last_name,
            student_id,
            email,
            phone
          ),
          classes (
            id,
            code,
            section,
            subjects (
              id,
              name_en,
              code,
              credit_hours
            ),
            instructors (
              id,
              name_en,
              email
            ),
            class_schedules (
              day_of_week,
              start_time,
              end_time,
              location
            )
          ),
          semesters (
            id,
            name_en,
            code,
            start_date,
            end_date
          )
        `)
        .eq('id', id)
        .single()

      if (error) throw error
      setEnrollment(data)
    } catch (err) {
      console.error('Error fetching enrollment:', err)
      setError(err.message || 'Failed to load enrollment')
    } finally {
      setLoading(false)
    }
  }

  const fetchAttendance = async () => {
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select('*, class_sessions(session_date, start_time, end_time)')
        .eq('enrollment_id', id)
        .order('date', { ascending: false })
        .limit(10)

      if (error) throw error
      setAttendanceRecords(data || [])
    } catch (err) {
      console.error('Error fetching attendance:', err)
    }
  }

  const fetchFinancialTransactions = async () => {
    if (!enrollment?.students?.id) return
    
    try {
      const { data, error } = await supabase
        .from('financial_transactions')
        .select('*')
        .eq('student_id', enrollment.students.id)
        .in('type', ['tuition', 'lab_fee', 'registration'])
        .order('created_at', { ascending: false })

      if (error) throw error
      setFinancialTransactions(data || [])
    } catch (err) {
      console.error('Error fetching financial transactions:', err)
    }
  }

  useEffect(() => {
    if (enrollment?.students?.id) {
      fetchFinancialTransactions()
    }
  }, [enrollment])

  const handleDropEnrollment = async () => {
    if (!confirm('Are you sure you want to drop this enrollment? This action can be reversed later.')) {
      return
    }

    try {
      const { error } = await supabase
        .from('enrollments')
        .update({ status: 'dropped' })
        .eq('id', id)

      if (error) throw error

      // Update class enrollment count
      if (enrollment?.classes?.id) {
        const { data: classData } = await supabase
          .from('classes')
          .select('enrolled')
          .eq('id', enrollment.classes.id)
          .limit(1)

        if (classData && classData.length > 0) {
          await supabase
            .from('classes')
            .update({ enrolled: Math.max(0, (classData[0].enrolled || 0) - 1) })
            .eq('id', enrollment.classes.id)
        }
      }

      navigate('/enrollments')
    } catch (err) {
      console.error('Error dropping enrollment:', err)
      setError(err.message || 'Failed to drop enrollment')
    }
  }

  const handleDeleteEnrollment = async () => {
    if (!confirm('Are you sure you want to delete this enrollment? This action cannot be undone.')) {
      return
    }

    try {
      const { error } = await supabase
        .from('enrollments')
        .delete()
        .eq('id', id)

      if (error) throw error

      // An enrolled record was holding a seat; give it back to the class.
      if (enrollment?.status === 'enrolled' && enrollment?.classes?.id) {
        const { data: classData } = await supabase
          .from('classes')
          .select('enrolled')
          .eq('id', enrollment.classes.id)
          .limit(1)

        if (classData && classData.length > 0) {
          await supabase
            .from('classes')
            .update({ enrolled: Math.max(0, (classData[0].enrolled || 0) - 1) })
            .eq('id', enrollment.classes.id)
        }
      }

      navigate('/enrollments')
    } catch (err) {
      console.error('Error deleting enrollment:', err)
      setError(err.message || 'Failed to delete enrollment')
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'enrolled':
        return 'bg-green-100 text-green-800'
      case 'dropped':
        return 'bg-red-100 text-red-800'
      case 'completed':
        return 'bg-blue-100 text-blue-800'
      case 'failed':
        return 'bg-red-100 text-red-800'
      case 'withdrawn':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getGradeStatus = (grade) => {
    if (!grade || grade === 'Not graded yet') return 'Not Passed'
    const gradePoints = enrollment?.grade_points || 0
    if (gradePoints >= 2.0) return 'Passed'
    return 'Not Passed'
  }

  const formatSchedule = (schedules) => {
    if (!schedules || schedules.length === 0) return 'TBA'
    return schedules.map(s => {
      const day = s.day_of_week?.charAt(0).toUpperCase() + s.day_of_week?.slice(1) || ''
      const time = s.start_time && s.end_time 
        ? `${s.start_time.substring(0, 5)} - ${s.end_time.substring(0, 5)}`
        : ''
      return `${day} ${time}`.trim()
    }).join(', ') || 'TBA'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error && !enrollment) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    )
  }

  // Calculate financial information
  const tuitionFee = enrollment?.classes?.subjects?.lab_fee 
    ? parseFloat(enrollment.classes.subjects.lab_fee) 
    : 300.00 // Default or from subject/class fees
  
  const totalFees = tuitionFee
  const paidAmount = financialTransactions
    .filter(t => t.status === 'paid')
    .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0)
  const outstanding = totalFees - paidAmount
  const paymentStatus = outstanding <= 0 ? 'Paid' : 'Unpaid'

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <div className="flex items-center space-x-2 text-sm text-gray-600">
        <span>Home</span>
        <span>/</span>
        <span>Academic</span>
        <span>/</span>
        <button onClick={() => navigate('/enrollments')} className="hover:text-primary-600">
          Enrollments
        </button>
        <span>/</span>
        <span className="text-gray-900">Details</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-primary-gradient rounded-lg flex items-center justify-center">
            <CheckCircle className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Details</h1>
            <p className="text-gray-600">- {enrollment?.classes?.code || 'N/A'}</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <span className={`px-4 py-2 rounded-full text-sm font-medium ${getStatusColor(enrollment?.status)}`}>
            {enrollment?.status || 'enrolled'}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center space-x-3">
        <button
          onClick={() => navigate(`/enrollments/${id}/edit`)}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
        >
          <Edit className="w-4 h-4" />
          <span>Edit Enrollment</span>
        </button>
        {enrollment?.status !== 'dropped' && enrollment?.status !== 'withdrawn' && (
          <button
            onClick={handleDropEnrollment}
            className="flex items-center space-x-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-all"
          >
            <X className="w-4 h-4" />
            <span>Drop Enrollment</span>
          </button>
        )}
        <button
          onClick={() => navigate(`/students/${enrollment?.students?.id}`)}
          className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all"
        >
          <User className="w-4 h-4" />
          <span>View Student</span>
        </button>
        <button
          onClick={() => navigate('/enrollments')}
          className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to List</span>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Enrollment Information */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-blue-600 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">Enrollment Information</h2>
            </div>
            <div className="p-6 space-y-6">
              {/* Student Information */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-4">Student Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500">Name:</label>
                    <p className="text-gray-900 font-medium">
                      {enrollment?.students?.first_name} {enrollment?.students?.last_name}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Student ID:</label>
                    <p className="text-gray-900 font-medium">{enrollment?.students?.student_id || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Email:</label>
                    <p className="text-gray-900 font-medium">{enrollment?.students?.email || 'N/A'}</p>
                  </div>
                </div>
              </div>

              {/* Class Information */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-4">Class Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500">Class:</label>
                    <p className="text-gray-900 font-medium">{enrollment?.classes?.code || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Subject:</label>
                    <p className="text-gray-900 font-medium">
                      {enrollment?.classes?.subjects?.code} - {enrollment?.classes?.subjects?.name_en}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Code:</label>
                    <p className="text-gray-900 font-medium">{enrollment?.classes?.subjects?.code || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 flex items-center space-x-1">
                      <Calendar className="w-3 h-3" />
                      <span>Schedule:</span>
                    </label>
                    <p className="text-gray-900 font-medium">
                      {formatSchedule(enrollment?.classes?.class_schedules)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Enrollment Details */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-4">Enrollment Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500">Semester:</label>
                    <p className="text-gray-900 font-medium">{enrollment?.semesters?.name_en || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Enrollment Date:</label>
                    <p className="text-gray-900 font-medium">
                      {new Date(enrollment?.enrollment_date).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Registration Type:</label>
                    <p className="text-gray-900 font-medium">Regular</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Registered By:</label>
                    <p className="text-gray-900 font-medium">Admin</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Registration Source:</label>
                    <p className="text-gray-900 font-medium">Admin</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Academic Performance */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-green-600 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">Academic Performance</h2>
            </div>
            <div className="p-6 space-y-6">
              {/* Grade Information */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-4">Grade Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500">Letter Grade:</label>
                    <p className="text-gray-900 font-medium">{enrollment?.grade || 'Not graded yet'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Status:</label>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                      getGradeStatus(enrollment?.grade) === 'Passed' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {getGradeStatus(enrollment?.grade)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Attendance */}
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-4">Attendance</h3>
                {attendanceRecords.length === 0 ? (
                  <p className="text-gray-500">No attendance records yet</p>
                ) : (
                  <div className="space-y-2">
                    {attendanceRecords.map((record, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm text-gray-700">
                          {new Date(record.date).toLocaleDateString()}
                        </span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          record.status === 'present' 
                            ? 'bg-green-100 text-green-800' 
                            : record.status === 'absent'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {record.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Financial Information */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-yellow-600 px-6 py-4">
              <h2 className="text-lg font-semibold text-white flex items-center space-x-2">
                <DollarSign className="w-5 h-5" />
                <span>Financial Information</span>
              </h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Tuition Fee:</span>
                <span className="text-gray-900 font-medium">₹{totalFees.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Total Fees:</span>
                <span className="text-gray-900 font-medium">₹{totalFees.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Outstanding:</span>
                <span className="text-gray-900 font-medium">₹{outstanding.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="text-sm text-gray-500">Payment Status:</span>
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  paymentStatus === 'Paid' 
                    ? 'bg-green-100 text-green-800' 
                    : 'bg-red-100 text-red-800'
                }`}>
                  {paymentStatus}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-900 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">Quick Actions</h2>
            </div>
            <div className="p-4 space-y-2">
              <button
                onClick={() => navigate(`/enrollments/${id}/edit`)}
                className="w-full flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all"
              >
                <Edit className="w-4 h-4" />
                <span>Edit Enrollment</span>
              </button>
              <button
                onClick={() => navigate(`/students/${enrollment?.students?.id}`)}
                className="w-full flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all"
              >
                <User className="w-4 h-4" />
                <span>View Student Profile</span>
              </button>
              {enrollment?.status !== 'dropped' && enrollment?.status !== 'withdrawn' && (
                <button
                  onClick={handleDropEnrollment}
                  className="w-full flex items-center space-x-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-all"
                >
                  <X className="w-4 h-4" />
                  <span>Drop Enrollment</span>
                </button>
              )}
              <button
                onClick={handleDeleteEnrollment}
                className="w-full flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Enrollment</span>
              </button>
            </div>
          </div>

          {/* Academic Settings */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-600 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">Academic Settings</h2>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700">Affects GPA:</span>
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                  Yes
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-700">Counts Toward Degree:</span>
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                  Yes
                </span>
              </div>
            </div>
          </div>

          {/* Audit Trail */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-600 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">Audit Trail</h2>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-gray-500">Registered By:</label>
                <p className="text-gray-900 font-medium">Admin</p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Date:</label>
                <p className="text-gray-900 font-medium">
                  {new Date(enrollment?.created_at).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500">Status:</label>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(enrollment?.status)}`}>
                  {enrollment?.status === 'enrolled' ? 'Active' : enrollment?.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

