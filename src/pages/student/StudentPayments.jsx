import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import PaymentModal from '../../components/payment/PaymentModal'
import { calculateFinancialMilestone, getMilestoneInfo } from '../../utils/financePermissions'
import { useNavigate } from 'react-router-dom'
import { 
  CreditCard, DollarSign, AlertCircle, CheckCircle, Clock, FileText,
  Download, Eye, Loader2, GraduationCap
} from 'lucide-react'

export default function StudentPayments() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  const [semesterStatuses, setSemesterStatuses] = useState([]) // Per-semester financial status
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchData()
  }, [user])

  const fetchData = async () => {
    if (!user?.email) return

    setLoading(true)
    try {
      // Fetch student data
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('id, student_id, name_en, email, financial_hold_reason_code, college_id')
        .eq('email', user.email)
        .eq('status', 'active')
        .single()

      if (studentError) throw studentError
      setStudent(studentData)

      // Fetch all invoices for this student (grouped by semester)
      const { data: invoicesData, error: invoicesError } = await supabase
        .from('invoices')
        .select(`
          id,
          invoice_number,
          invoice_date,
          due_date,
          invoice_type,
          status,
          total_amount,
          paid_amount,
          pending_amount,
          student_id,
          college_id,
          semester_id,
          semesters (id, name_en, code, start_date)
        `)
        .eq('student_id', studentData.id)
        .order('invoice_date', { ascending: false })

      if (invoicesError) throw invoicesError
      setInvoices(invoicesData || [])

      // Fetch per-semester financial statuses
      const { data: semesterStatusesData, error: statusesError } = await supabase
        .from('student_semester_financial_status')
        .select(`
          id,
          semester_id,
          financial_milestone_code,
          total_due,
          total_paid,
          financial_hold_reason_code,
          semesters (id, name_en, code, start_date)
        `)
        .eq('student_id', studentData.id)
        .order('semesters(start_date)', { ascending: false })

      if (statusesError) {
        console.error('Error fetching semester statuses:', statusesError)
        // If table doesn't exist yet, continue without it
        setSemesterStatuses([])
      } else {
        setSemesterStatuses(semesterStatusesData || [])
      }

      // Fetch payment history
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select(`
          id,
          payment_number,
          payment_date,
          payment_method,
          amount,
          status,
          invoices (invoice_number, invoice_type)
        `)
        .eq('student_id', studentData.id)
        .order('payment_date', { ascending: false })
        .limit(20)

      if (paymentsError) throw paymentsError
      setPayments(paymentsData || [])
    } catch (err) {
      console.error('Error fetching payment data:', err)
      setError(err.message || 'Failed to load payment information')
    } finally {
      setLoading(false)
    }
  }

  const handlePayInvoice = (invoice) => {
    if (invoice.status === 'paid') {
      alert(t('payments.alreadyPaid'))
      return
    }
    setSelectedInvoice(invoice)
    setShowPaymentModal(true)
  }

  const handlePaymentSuccess = async (newMilestone, payment) => {
    // Refresh data after payment to get updated financial milestone
    await fetchData()
    setShowPaymentModal(false)
    setSelectedInvoice(null)
    
    if (newMilestone) {
      // Show success message
      alert(t('payments.paymentSuccessful'))
    }

    // If we have a real payment row, take student to the receipt
    if (payment?.id) {
      navigate(`/student/payments/receipt/${payment.id}`)
    }
  }

  const openLatestReceiptForInvoice = async (invoiceId) => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('id')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (data?.id) {
        navigate(`/student/payments/receipt/${data.id}`)
      } else {
        alert(t('payments.noReceiptYet', { defaultValue: 'No receipt available yet for this invoice.' }))
      }
    } catch (e) {
      console.error('openLatestReceiptForInvoice error:', e)
      alert(t('payments.noReceiptYet', { defaultValue: 'No receipt available yet for this invoice.' }))
    }
  }


  const getStatusColor = (status) => {
    const colors = {
      'paid': 'bg-green-100 text-green-800 border-green-200',
      'pending': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'partially_paid': 'bg-blue-100 text-blue-800 border-blue-200',
      'overdue': 'bg-red-100 text-red-800 border-red-200',
      'cancelled': 'bg-gray-100 text-gray-800 border-gray-200'
    }
    return colors[status] || colors.pending
  }

  // Calculate totals across all semesters (excluding admission fees)
  const allSemesterInvoices = invoices.filter(inv => inv.invoice_type !== 'admission_fee' && inv.semester_id)
  const totalDue = allSemesterInvoices.reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0)
  const totalPaid = allSemesterInvoices
    .filter(inv => inv.status === 'paid' || inv.status === 'partially_paid')
    .reduce((sum, inv) => sum + parseFloat(inv.paid_amount || 0), 0)
  const outstandingBalance = totalDue - totalPaid

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-red-800">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t('payments.title')}</h1>
        <p className="text-gray-600 mt-1">{t('payments.subtitle')}</p>
      </div>

      {/* Overall Financial Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-2">
            <DollarSign className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-600">{t('payments.totalDue')}</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">${totalDue.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">All semesters (excluding registration fees)</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <span className="text-sm text-gray-600">{t('payments.totalPaid')}</span>
          </div>
          <p className="text-2xl font-bold text-green-600">${totalPaid.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">Total paid across all semesters</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center space-x-3 mb-2">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            <span className="text-sm text-gray-600">{t('payments.outstandingBalance')}</span>
          </div>
          <p className="text-2xl font-bold text-orange-600">${outstandingBalance.toFixed(2)}</p>
          <p className="text-xs text-gray-500 mt-1">Outstanding balance</p>
        </div>
      </div>

      {/* Per-Semester Financial Status */}
      {semesterStatuses.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
            <GraduationCap className="w-5 h-5 text-primary-600" />
            <span>Per-Semester Payment Status</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {semesterStatuses.map((status) => {
              const milestoneInfo = getMilestoneInfo(status.financial_milestone_code || 'PM00')
              const percentage = status.total_due > 0 
                ? ((status.total_paid / status.total_due) * 100).toFixed(1)
                : '0'
              
              return (
                <div key={status.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{status.semesters?.name_en || 'N/A'}</h3>
                      <p className="text-xs text-gray-500">{status.semesters?.code || ''}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded ${milestoneInfo.color}`}>
                      {milestoneInfo.label}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Due:</span>
                      <span className="font-semibold">${parseFloat(status.total_due || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Paid:</span>
                      <span className="font-semibold text-green-600">${parseFloat(status.total_paid || 0).toFixed(2)}</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                      <div 
                        className={`h-2 rounded-full transition-all ${
                          percentage >= 100 ? 'bg-green-500' :
                          percentage >= 60 ? 'bg-orange-500' :
                          percentage >= 30 ? 'bg-yellow-500' :
                          percentage >= 10 ? 'bg-blue-500' :
                          'bg-gray-400'
                        }`}
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 text-center mt-1">{percentage}% paid</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Financial Hold Warning */}
      {student?.financial_hold_reason_code && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-900">{t('payments.financialHold')}</p>
              <p className="text-sm text-red-700 mt-1">
                {t('payments.financialHoldMessage', { code: student.financial_hold_reason_code })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Outstanding Invoices */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">{t('payments.outstandingInvoices')}</h2>
        {invoices.filter(inv => inv.status !== 'paid').length > 0 ? (
          <div className="space-y-4">
              {(() => {
                // Group outstanding invoices by semester
                const outstandingInvoices = invoices.filter(inv => inv.status !== 'paid')
                const groupedBySemester = outstandingInvoices.reduce((acc, invoice) => {
                  const key = invoice.semester_id ? `semester_${invoice.semester_id}` : 'no_semester'
                  if (!acc[key]) {
                    acc[key] = {
                      semester: invoice.semesters,
                      invoices: []
                    }
                  }
                  acc[key].invoices.push(invoice)
                  return acc
                }, {})

                return Object.entries(groupedBySemester).map(([key, group]) => (
                  <div key={key} className="mb-6 last:mb-0">
                    {group.semester && (
                      <div className="mb-3 pb-2 border-b border-gray-200">
                        <h3 className="font-semibold text-gray-900">{group.semester.name_en}</h3>
                        <p className="text-xs text-gray-500">{group.semester.code}</p>
                      </div>
                    )}
                    {key === 'no_semester' && (
                      <div className="mb-3 pb-2 border-b border-gray-200">
                        <h3 className="font-semibold text-gray-900">Registration/Admission Fees</h3>
                      </div>
                    )}
                    <div className="space-y-3">
                      {group.invoices.map(invoice => (
                        <div
                          key={invoice.id}
                          className="border border-gray-200 rounded-lg p-4 hover:border-primary-300 transition-colors bg-gray-50"
                        >
                          <div className="flex items-center justify-between flex-wrap gap-4">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3 mb-2">
                                <FileText className="w-4 h-4 text-gray-400" />
                                <span className="font-semibold text-gray-900 text-sm">{invoice.invoice_number}</span>
                                <span className={`text-xs px-2 py-1 rounded border ${getStatusColor(invoice.status)}`}>
                                  {invoice.status.replace('_', ' ').toUpperCase()}
                                </span>
                              </div>
                              <p className="text-sm text-gray-600">
                                {invoice.invoice_type.replace('_', ' ')} • Due: {new Date(invoice.due_date || invoice.invoice_date).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-gray-900">${invoice.pending_amount?.toFixed(2) || invoice.total_amount?.toFixed(2)}</p>
                              {invoice.status !== 'paid' && (
                                <button
                                  onClick={() => handlePayInvoice(invoice)}
                                  className="mt-2 px-3 py-1.5 bg-primary-gradient text-white rounded-lg font-semibold hover:shadow-lg transition-all text-xs"
                                >
                                  {t('payments.payNow')}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              })()}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">{t('payments.noOutstandingInvoices')}</p>
        )}
      </div>

      {/* All Invoices */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">{t('payments.allInvoices')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">{t('payments.invoiceNumber')}</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">{t('payments.invoiceDate')}</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">{t('payments.invoiceType')}</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Semester</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">{t('payments.total')}</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">{t('payments.paid')}</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">{t('common.status')}</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(invoice => (
                <tr key={invoice.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-mono">{invoice.invoice_number}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {new Date(invoice.invoice_date).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {invoice.invoice_type.replace('_', ' ')}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {invoice.semesters ? `${invoice.semesters.name_en} (${invoice.semesters.code})` : 'N/A'}
                  </td>
                  <td className="py-3 px-4 text-sm font-semibold">${invoice.total_amount?.toFixed(2)}</td>
                  <td className="py-3 px-4 text-sm text-green-600">${invoice.paid_amount?.toFixed(2)}</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-1 rounded border ${getStatusColor(invoice.status)}`}>
                      {invoice.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center space-x-2">
                      {invoice.status !== 'paid' && (
                        <button
                          onClick={() => handlePayInvoice(invoice)}
                          className="text-primary-600 hover:text-primary-700 text-sm font-semibold"
                        >
                          {t('payments.payNow')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-gray-400 hover:text-gray-600"
                        title={t('payments.downloadReceipt')}
                        onClick={() => openLatestReceiptForInvoice(invoice.id)}
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">{t('payments.paymentHistory')}</h2>
        {payments.length > 0 ? (
          <div className="space-y-3">
            {payments.map(payment => (
              <div
                key={payment.id}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center space-x-3 mb-1">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span className="font-semibold text-gray-900 font-mono">{payment.payment_number}</span>
                      <span className={`text-xs px-2 py-1 rounded ${
                        payment.status === 'verified' 
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {payment.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {new Date(payment.payment_date).toLocaleDateString()} • {payment.payment_method?.replace('_', ' ')}
                      {payment.invoices && ` • Invoice: ${payment.invoices.invoice_number}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-600">${payment.amount?.toFixed(2)}</p>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className="text-sm font-semibold text-primary-600 hover:text-primary-700"
                    onClick={() => navigate(`/student/payments/receipt/${payment.id}`)}
                  >
                    {t('payments.viewReceipt', { defaultValue: 'View receipt' })}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">{t('payments.noPaymentHistory')}</p>
        )}
      </div>

      {/* Payment Modal */}
      {selectedInvoice && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false)
            setSelectedInvoice(null)
          }}
          invoice={selectedInvoice}
          student={student}
          onPaymentSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  )
}

