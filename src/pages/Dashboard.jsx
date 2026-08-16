import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../contexts/LanguageContext'
import { getLocalizedName } from '../utils/localizedName'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { 
  Users, 
  GraduationCap, 
  BookOpen, 
  DollarSign, 
  TrendingUp, 
  Download,
  Activity,
  Server,
  HardDrive,
  Clock,
  BarChart3
} from 'lucide-react'
import StudentDashboard from './student/StudentDashboard'

export default function Dashboard() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const navigate = useNavigate()
  const { userRole, collegeId } = useAuth()

  if (userRole === 'student') {
    return <StudentDashboard />
  }
  if (userRole === 'instructor') {
    return <Navigate to="/instructor/dashboard" replace />
  }
  const [loading, setLoading] = useState(true)
  const [kpiData, setKpiData] = useState({
    totalStudents: 0,
    totalInstructors: 0,
    activeCourses: 0,
    totalRevenue: 0,
    averageGPA: 0,
    graduationRate: 0,
    attendanceRate: 0,
    passRate: 0,
    honorRollStudents: 0,
    collegePerformance: [],
    feeCollectionRate: 0,
    scholarshipUtilization: 0,
    outstandingPayments: 0,
    collectedAmount: 0,
    pendingAmount: 0,
    applicationsReceived: 0,
    applicationsAccepted: 0,
    applicationsPending: 0,
    applicationsRejected: 0,
    applicationsEnrolled: 0,
    yieldRate: 0,
  })

  useEffect(() => {
    fetchKPIData()
  }, [userRole])

  const fetchKPIData = async () => {
    try {
      setLoading(true)

      const isAdminOrCollege = userRole === 'admin' || userRole === 'user'

      let studentsCount = 0
      let instructorsCount = 0
      let coursesCount = 0
      let totalRevenue = 0
      let collectedAmount = 0
      let pendingAmount = 0
      let totalInvoiced = 0
      let feeCollectionRate = 0
      let avgGPA = 0
      let honorRollCount = 0
      let applicationsReceived = 0
      let applicationsAccepted = 0
      let applicationsPending = 0
      let applicationsRejected = 0
      let applicationsEnrolled = 0
      let yieldRate = 0
      let collegePerformance = []

      if (isAdminOrCollege) {
        // Only fetch university-wide KPIs for admin and college admin (not for students/instructors)
        const [{ count: studentsCountRes }, { count: instructorsCountRes }, { count: coursesCountRes }] = await Promise.all([
          supabase.from('students').select('*', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('instructors').select('*', { count: 'exact', head: true }).eq('status', 'active'),
          supabase.from('classes').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        ])
        studentsCount = studentsCountRes || 0
        instructorsCount = instructorsCountRes || 0
        coursesCount = coursesCountRes || 0

        const { data: invoicesData } = await supabase
          .from('invoices')
          .select('total_amount, paid_amount, pending_amount, status')

        totalRevenue = invoicesData?.reduce((sum, inv) => sum + parseFloat(inv.paid_amount || 0), 0) || 0
        collectedAmount = invoicesData?.reduce((sum, inv) => sum + parseFloat(inv.paid_amount || 0), 0) || 0
        pendingAmount = invoicesData?.reduce((sum, inv) => sum + parseFloat(inv.pending_amount || 0), 0) || 0
        totalInvoiced = invoicesData?.reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0) || 0
        feeCollectionRate = totalInvoiced > 0 ? (collectedAmount / totalInvoiced) * 100 : 0

        const { data: studentsData } = await supabase
          .from('students')
          .select('gpa')
          .not('gpa', 'is', null)

        avgGPA = studentsData && studentsData.length > 0
          ? studentsData.reduce((sum, s) => sum + parseFloat(s.gpa || 0), 0) / studentsData.length
          : 0

        const { count: honorRollCountRes } = await supabase
          .from('students')
          .select('*', { count: 'exact', head: true })
          .gte('gpa', 3.5)
          .eq('status', 'active')
        honorRollCount = honorRollCountRes || 0

        const { data: applicationsData } = await supabase
          .from('applications')
          .select('status_code')

        applicationsReceived = applicationsData?.length || 0
        applicationsAccepted = applicationsData?.filter(a => ['DCFA', 'DCCA', 'ENCF', 'ENAC'].includes(a.status_code)).length || 0
        applicationsPending = applicationsData?.filter(a => ['APSB', 'APPN', 'RVQU', 'RVIN', 'DCPN', 'ENPN'].includes(a.status_code)).length || 0
        applicationsRejected = applicationsData?.filter(a => a.status_code === 'DCRJ').length || 0
        applicationsEnrolled = applicationsData?.filter(a => ['ENCF', 'ENAC'].includes(a.status_code)).length || 0
        yieldRate = applicationsAccepted > 0 ? (applicationsEnrolled / applicationsAccepted) * 100 : 0

        const { data: collegesData } = await supabase
          .from('colleges')
          .select('id, name_en, name_ar')
          .eq('status', 'active')

        collegePerformance = await Promise.all(
          (collegesData || []).map(async (college) => {
            const { count: collegeStudents } = await supabase
              .from('students')
              .select('*', { count: 'exact', head: true })
              .eq('college_id', college.id)
              .eq('status', 'active')

            const { data: collegeStudentsData } = await supabase
              .from('students')
              .select('gpa')
              .eq('college_id', college.id)
              .not('gpa', 'is', null)

            const collegeAvgGPA = collegeStudentsData && collegeStudentsData.length > 0
              ? collegeStudentsData.reduce((sum, s) => sum + parseFloat(s.gpa || 0), 0) / collegeStudentsData.length
              : 0

            return {
              name: getLocalizedName(college, isRTL),
              students: collegeStudents || 0,
              avgGPA: collegeAvgGPA,
              attendance: 92,
            }
          })
        )
      }

      // Calculate graduation rate (simplified - would need actual graduation data)
      const graduationRate = 87 // Placeholder
      const attendanceRate = 92 // Placeholder
      const passRate = 94 // Placeholder
      const scholarshipUtilization = 65 // Placeholder

      setKpiData({
        totalStudents: studentsCount || 0,
        totalInstructors: instructorsCount || 0,
        activeCourses: coursesCount || 0,
        totalRevenue,
        averageGPA: avgGPA,
        graduationRate,
        attendanceRate,
        passRate,
        honorRollStudents: honorRollCount || 0,
        collegePerformance,
        feeCollectionRate,
        scholarshipUtilization,
        outstandingPayments: pendingAmount,
        collectedAmount,
        pendingAmount,
        applicationsReceived,
        applicationsAccepted,
        applicationsPending,
        applicationsRejected,
        applicationsEnrolled,
        yieldRate,
      })
    } catch (err) {
      console.error('Error fetching KPI data:', err)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount) => {
    if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(0)}K`
    }
    return `$${amount.toFixed(2)}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* College Admin - College KPIs Card */}
      {userRole === 'user' && collegeId && (
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl p-6 text-white shadow-lg">
          <div className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'}`}>
            <div>
              <h2 className="text-2xl font-bold mb-2">{t('kpis.dashboard.collegeKPIs.title')}</h2>
              <p className="text-purple-100">{t('kpis.dashboard.collegeKPIs.description')}</p>
            </div>
            <button
              onClick={() => navigate('/college/kpis')}
              className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} bg-white text-purple-600 px-6 py-3 rounded-lg font-semibold hover:bg-purple-50 transition-colors`}
            >
              <BarChart3 className="w-5 h-5" />
              <span>{t('kpis.dashboard.collegeKPIs.viewButton')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'}`}>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">
            {userRole === 'user' && collegeId
              ? t('kpis.universityKPIs.collegeDashboard')
              : t('kpis.universityKPIs.title')}
          </h1>
          <p className="text-gray-600 mt-1">
            {userRole === 'user' && collegeId
              ? t('kpis.universityKPIs.monitorCollege')
              : t('kpis.universityKPIs.monitorUniversity')}
          </p>
        </div>
        <div className={`flex gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <select className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent">
            <option>{t('common.academicYear')} 2025-2026</option>
            <option>{t('common.academicYear')} 2024-2025</option>
            <option>{t('common.academicYear')} 2023-2024</option>
          </select>
          <select className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent">
            <option>{t('common.allSemesters')}</option>
            <option>{t('common.fallSemester')}</option>
            <option>{t('common.springSemester')}</option>
            <option>{t('common.summerSemester')}</option>
          </select>
          <button className={`flex items-center gap-2 bg-primary-gradient text-white px-4 py-2 rounded-lg text-sm font-medium hover:shadow-lg transition-all ${isRTL ? 'flex-row-reverse' : ''}`}>
            <Download className="w-4 h-4" />
            <span>{t('kpis.universityKPIs.exportReport')}</span>
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Students */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-white" />
            </div>
            <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-medium">+12.5%</span>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">{kpiData.totalStudents.toLocaleString()}</div>
          <div className="text-sm text-gray-600">{t('kpis.universityKPIs.totalStudents')}</div>
          <div className="text-xs text-gray-500 mt-2">{t('kpis.universityKPIs.acrossAllColleges')}</div>
        </div>

        {/* Total Instructors */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-medium">+5.2%</span>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">{kpiData.totalInstructors.toLocaleString()}</div>
          <div className="text-sm text-gray-600">{t('kpis.universityKPIs.totalInstructors')}</div>
          <div className="text-xs text-gray-500 mt-2">{t('kpis.universityKPIs.fulltimeParttime')}</div>
        </div>

        {/* Active Courses */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-white" />
            </div>
            <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-medium">+2.1%</span>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">{kpiData.activeCourses.toLocaleString()}</div>
          <div className="text-sm text-gray-600">{t('kpis.universityKPIs.activeCourses')}</div>
          <div className="text-xs text-gray-500 mt-2">{t('kpis.universityKPIs.currentSemester')}</div>
        </div>

        {/* Revenue */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-xl flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-medium">+18.3%</span>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">{formatCurrency(kpiData.totalRevenue)}</div>
          <div className="text-sm text-gray-600">{t('kpis.universityKPIs.totalRevenue')}</div>
          <div className="text-xs text-gray-500 mt-2">{t('kpis.universityKPIs.yearToDate')}</div>
        </div>
      </div>

      {/* Academic Performance Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">{t('kpis.universityKPIs.academicPerformanceOverview')}</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Average GPA */}
          <div className="text-center p-5 bg-gray-50 rounded-xl">
            <div className="text-4xl font-bold text-primary-600 mb-2">{kpiData.averageGPA.toFixed(2)}</div>
            <div className="text-sm text-gray-600 mb-1">{t('kpis.universityKPIs.averageGPA')}</div>
            <div className="text-xs text-green-600">↑ 0.12 {t('kpis.universityKPIs.fromLastYear')}</div>
          </div>
          
          {/* Graduation Rate */}
          <div className="text-center p-5 bg-gray-50 rounded-xl">
            <div className="text-4xl font-bold text-green-600 mb-2">{kpiData.graduationRate}%</div>
            <div className="text-sm text-gray-600 mb-1">{t('kpis.universityKPIs.graduationRate')}</div>
            <div className="text-xs text-green-600">↑ 3% {t('kpis.universityKPIs.fromLastYear')}</div>
          </div>
          
          {/* Attendance Rate */}
          <div className="text-center p-5 bg-gray-50 rounded-xl">
            <div className="text-4xl font-bold text-blue-600 mb-2">{kpiData.attendanceRate}%</div>
            <div className="text-sm text-gray-600 mb-1">{t('kpis.universityKPIs.attendanceRate')}</div>
            <div className="text-xs text-green-600">↑ 1.5% {t('kpis.universityKPIs.fromLastSemester')}</div>
          </div>
          
          {/* Pass Rate */}
          <div className="text-center p-5 bg-gray-50 rounded-xl">
            <div className="text-4xl font-bold text-purple-600 mb-2">{kpiData.passRate}%</div>
            <div className="text-sm text-gray-600 mb-1">{t('kpis.universityKPIs.coursePassRate')}</div>
            <div className="text-xs text-green-600">↑ 2% {t('kpis.universityKPIs.fromLastSemester')}</div>
          </div>
          
          {/* Honor Roll */}
          <div className="text-center p-5 bg-gray-50 rounded-xl">
            <div className="text-4xl font-bold text-amber-600 mb-2">{kpiData.honorRollStudents.toLocaleString()}</div>
            <div className="text-sm text-gray-600 mb-1">{t('kpis.universityKPIs.honorRollStudents')}</div>
            <div className="text-xs text-green-600">↑ 156 {t('kpis.universityKPIs.fromLastSemester')}</div>
          </div>
        </div>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* College Performance Comparison */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">{t('kpis.universityKPIs.collegePerformanceComparison')}</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-2 text-xs font-semibold text-gray-500 uppercase">{t('kpis.universityKPIs.college')}</th>
                  <th className="text-center py-3 px-2 text-xs font-semibold text-gray-500 uppercase">{t('kpis.universityKPIs.students')}</th>
                  <th className="text-center py-3 px-2 text-xs font-semibold text-gray-500 uppercase">{t('kpis.universityKPIs.avgGPA')}</th>
                  <th className="text-center py-3 px-2 text-xs font-semibold text-gray-500 uppercase">{t('kpis.universityKPIs.attendance')}</th>
                </tr>
              </thead>
              <tbody>
                {kpiData.collegePerformance.map((college, index) => (
                  <tr key={index} className="border-b border-gray-100">
                    <td className="py-3 px-2 text-sm font-medium text-gray-900 text-left">{college.name}</td>
                    <td className="py-3 px-2 text-sm text-gray-600 text-center">{college.students.toLocaleString()}</td>
                    <td className={`py-3 px-2 text-sm font-semibold text-center ${college.avgGPA >= 3.5 ? 'text-green-600' : 'text-amber-600'}`}>
                      {college.avgGPA.toFixed(2)}
                    </td>
                    <td className="py-3 px-2 text-sm text-gray-600 text-center">{college.attendance}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Financial Overview */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">{t('kpis.universityKPIs.financialOverview')}</h2>
          
          <div className="space-y-6">
            {/* Fee Collection Rate */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">{t('kpis.universityKPIs.feeCollectionRate')}</span>
                <span className="text-sm font-semibold text-gray-900">{kpiData.feeCollectionRate.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-green-500 to-green-600 rounded-full"
                  style={{ width: `${kpiData.feeCollectionRate}%` }}
                ></div>
              </div>
            </div>
            
            {/* Scholarship Utilization */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">{t('kpis.universityKPIs.scholarshipUtilization')}</span>
                <span className="text-sm font-semibold text-gray-900">{kpiData.scholarshipUtilization}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full"
                  style={{ width: `${kpiData.scholarshipUtilization}%` }}
                ></div>
              </div>
            </div>
            
            {/* Outstanding Payments */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">{t('kpis.universityKPIs.outstandingPayments')}</span>
                <span className="text-sm font-semibold text-gray-900">{formatCurrency(kpiData.outstandingPayments)}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 to-amber-600 rounded-full"
                  style={{ width: `${Math.min((kpiData.outstandingPayments / (kpiData.collectedAmount + kpiData.outstandingPayments)) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
            
            {/* Summary Cards */}
            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-700">{formatCurrency(kpiData.collectedAmount)}</div>
                <div className="text-xs text-gray-600 mt-1">{t('kpis.universityKPIs.collected')}</div>
              </div>
              <div className="text-center p-4 bg-amber-50 rounded-lg">
                <div className="text-2xl font-bold text-amber-700">{formatCurrency(kpiData.pendingAmount)}</div>
                <div className="text-xs text-gray-600 mt-1">{t('kpis.universityKPIs.pending')}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Enrollment & Admission Stats */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">{t('kpis.universityKPIs.enrollmentAdmissionStatistics')}</h2>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="text-center p-5 bg-blue-50 rounded-xl">
            <div className="text-3xl font-bold text-blue-700 mb-2">{kpiData.applicationsReceived.toLocaleString()}</div>
            <div className="text-xs text-gray-600">{t('kpis.universityKPIs.applicationsReceived')}</div>
          </div>
          <div className="text-center p-5 bg-green-50 rounded-xl">
            <div className="text-3xl font-bold text-green-700 mb-2">{kpiData.applicationsAccepted.toLocaleString()}</div>
            <div className="text-xs text-gray-600">{t('kpis.universityKPIs.accepted')}</div>
          </div>
          <div className="text-center p-5 bg-yellow-50 rounded-xl">
            <div className="text-3xl font-bold text-yellow-700 mb-2">{kpiData.applicationsPending.toLocaleString()}</div>
            <div className="text-xs text-gray-600">{t('kpis.universityKPIs.pendingReview')}</div>
          </div>
          <div className="text-center p-5 bg-red-50 rounded-xl">
            <div className="text-3xl font-bold text-red-700 mb-2">{kpiData.applicationsRejected.toLocaleString()}</div>
            <div className="text-xs text-gray-600">{t('kpis.universityKPIs.rejected')}</div>
          </div>
          <div className="text-center p-5 bg-purple-50 rounded-xl">
            <div className="text-3xl font-bold text-purple-700 mb-2">{kpiData.applicationsEnrolled.toLocaleString()}</div>
            <div className="text-xs text-gray-600">{t('kpis.universityKPIs.enrolled')}</div>
          </div>
          <div className="text-center p-5 bg-emerald-50 rounded-xl">
            <div className="text-3xl font-bold text-emerald-700 mb-2">{kpiData.yieldRate.toFixed(0)}%</div>
            <div className="text-xs text-gray-600">{t('kpis.universityKPIs.yieldRate')}</div>
          </div>
        </div>
      </div>

      {/* System Health & Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Health */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">{t('kpis.universityKPIs.systemHealth')}</h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-green-50 rounded-lg border-l-4 border-green-500">
              <div className="text-xs text-gray-600 mb-1">{t('kpis.universityKPIs.systemUptime')}</div>
              <div className="text-xl font-bold text-green-700">99.9%</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
              <div className="text-xs text-gray-600 mb-1">{t('kpis.universityKPIs.activeUsers')}</div>
              <div className="text-xl font-bold text-blue-700">1,245</div>
            </div>
            <div className="p-4 bg-yellow-50 rounded-lg border-l-4 border-yellow-500">
              <div className="text-xs text-gray-600 mb-1">{t('kpis.universityKPIs.storageUsed')}</div>
              <div className="text-xl font-bold text-yellow-700">67%</div>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg border-l-4 border-purple-500">
              <div className="text-xs text-gray-600 mb-1">{t('kpis.universityKPIs.lastBackup')}</div>
              <div className="text-xl font-bold text-purple-700">2h {t('kpis.universityKPIs.ago')}</div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">{t('kpis.universityKPIs.recentActivity')}</h2>
          
          <div className="space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <div className="flex-1">
                <div className="text-sm text-gray-900">{t('kpis.universityKPIs.newStudentEnrollment')}</div>
                <div className="text-xs text-gray-500">College of Economics - 5 {t('kpis.universityKPIs.ago')}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <div className="flex-1">
                <div className="text-sm text-gray-900">{t('kpis.universityKPIs.gradeSubmission')}</div>
                <div className="text-xs text-gray-500">College of Hadith - 15 {t('kpis.universityKPIs.ago')}</div>
              </div>
            </div>
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
              <div className="flex-1">
                <div className="text-sm text-gray-900">{t('kpis.universityKPIs.paymentReceived')}</div>
                <div className="text-xs text-gray-500">Finance System - 32 {t('kpis.universityKPIs.ago')}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
              <div className="flex-1">
                <div className="text-sm text-gray-900">{t('kpis.universityKPIs.newCourseAdded')}</div>
                <div className="text-xs text-gray-500">College of Arabic - 1 hour {t('kpis.universityKPIs.ago')}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

