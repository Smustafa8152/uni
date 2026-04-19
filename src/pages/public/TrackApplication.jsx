import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Search, Calendar, AlertCircle, CheckCircle, XCircle, Clock, FileText, CreditCard, UserCheck, GraduationCap } from 'lucide-react'

export default function TrackApplication() {
  const navigate = useNavigate()
  const [applicationNumber, setApplicationNumber] = useState('')
  const [dateOfBirth, setDateOfBirth] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [application, setApplication] = useState(null)

  const handleSearch = async (e) => {
    e.preventDefault()
    
    if (!applicationNumber.trim() || !dateOfBirth) {
      setError('Please enter both application number and date of birth')
      return
    }

    setLoading(true)
    setError('')
    setApplication(null)

    try {
      const { data, error: fetchError } = await supabase
        .from('applications')
        .select(`
          *,
          majors (
            name_en,
            code
          ),
          semesters (
            name_en,
            code
          ),
          colleges (
            name_en,
            code
          )
        `)
        .eq('application_number', applicationNumber.trim().toUpperCase())
        .eq('date_of_birth', dateOfBirth)
        .single()

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          setError('Application not found. Please check your application number and date of birth.')
        } else {
          throw fetchError
        }
        return
      }

      setApplication(data)
      // Navigate to status page with application ID
      navigate(`/application-status/${data.id}`, { state: { application: data } })
    } catch (err) {
      console.error('Error fetching application:', err)
      setError(err.message || 'Failed to fetch application. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const getStatusInfo = (statusCode) => {
    const statusMap = {
      'APDR': { label: 'Draft', color: 'bg-gray-100 text-gray-800', icon: FileText },
      'APSB': { label: 'Submitted', color: 'bg-blue-100 text-blue-800', icon: Clock },
      'APIV': { label: 'Invalid', color: 'bg-red-100 text-red-800', icon: XCircle },
      'APPN': { label: 'Payment Pending', color: 'bg-yellow-100 text-yellow-800', icon: CreditCard },
      'APPC': { label: 'Payment Confirmed', color: 'bg-green-100 text-green-800', icon: CheckCircle },
      'RVQU': { label: 'Review Queue', color: 'bg-blue-100 text-blue-800', icon: Clock },
      'RVIN': { label: 'Under Review', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      'RVHL': { label: 'On Hold', color: 'bg-orange-100 text-orange-800', icon: AlertCircle },
      'RVRI': { label: 'Info Required', color: 'bg-purple-100 text-purple-800', icon: FileText },
      'RVRC': { label: 'Info Received', color: 'bg-blue-100 text-blue-800', icon: CheckCircle },
      'RVDV': { label: 'Documents Verification', color: 'bg-yellow-100 text-yellow-800', icon: FileText },
      'RVIV': { label: 'Interview Required', color: 'bg-purple-100 text-purple-800', icon: UserCheck },
      'RVEX': { label: 'Entrance Exam Required', color: 'bg-purple-100 text-purple-800', icon: GraduationCap },
      'DCPN': { label: 'Decision Pending', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      'DCCA': { label: 'Accepted (Conditional)', color: 'bg-green-100 text-green-800', icon: CheckCircle },
      'DCFA': { label: 'Accepted (Final)', color: 'bg-green-100 text-green-800', icon: CheckCircle },
      'DCWL': { label: 'Waitlisted', color: 'bg-blue-100 text-blue-800', icon: Clock },
      'DCRJ': { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: XCircle },
      'ENPN': { label: 'Enrollment Pending', color: 'bg-blue-100 text-blue-800', icon: Clock },
      'ENCF': { label: 'Enrollment Confirmed', color: 'bg-green-100 text-green-800', icon: CheckCircle },
      'ENAC': { label: 'Enrolled (Active)', color: 'bg-green-100 text-green-800', icon: CheckCircle },
    }
    return statusMap[statusCode] || { label: statusCode, color: 'bg-gray-100 text-gray-800', icon: Clock }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl p-8 md:p-12">
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Search className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Track Your Application</h1>
          <p className="text-gray-600">Enter your application number and date of birth to view your application status</p>
        </div>

        <form onSubmit={handleSearch} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Application Number *
            </label>
            <input
              type="text"
              value={applicationNumber}
              onChange={(e) => setApplicationNumber(e.target.value.toUpperCase())}
              placeholder="APP-2025-000001"
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Date of Birth *
            </label>
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 bg-primary-gradient text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Searching...</span>
              </>
            ) : (
              <>
                <Search className="w-5 h-5" />
                <span>Track Application</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-600 text-center">
            Don't have an application number?{' '}
            <button
              onClick={() => navigate('/register')}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Register here
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}






