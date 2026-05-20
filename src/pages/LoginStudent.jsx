import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { canLoginWithoutSemesterPm10Milestone, checkFinancePermission } from '../utils/financePermissions'
import { getPaymentsEnabled } from '../utils/getPaymentsEnabled'
import { getEmailLookupCandidates } from '../utils/emailLookup'
import { Mail, Lock, Eye, EyeOff, ArrowLeft, AlertCircle } from 'lucide-react'
import LanguageToggle from '../components/LanguageToggle'

export default function LoginStudent() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, signOut, user, userRole, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user && userRole === 'student') {
      navigate('/dashboard', { replace: true })
    }
  }, [user, userRole, authLoading, navigate])

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-slate-300 border-t-slate-700 mx-auto" />
          <p className="mt-4 text-slate-600 font-medium">Loading…</p>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const { data, error: signInError } = await signIn(email, password, 'student')
      if (signInError) throw signInError

      const sessionEmail = data?.user?.email || email

      // Check if student has FA_LGN (Login permission) based on financial milestone
      // For login, check if student has at least one active semester with PM10+ milestone
      let studentData = null
      let studentError = null
      for (const candidate of getEmailLookupCandidates(sessionEmail)) {
        const res = await supabase
          .from('students')
          .select('id, college_id, financial_hold_reason_code, current_status_code')
          .eq('email', candidate)
          .eq('status', 'active')
          .maybeSingle()
        if (res.data) {
          studentData = res.data
          studentError = null
          break
        }
        studentError = res.error
      }

      if (studentError || !studentData) {
        console.error('Error fetching student data:', studentError)
        // Allow login even if student data fetch fails (might be new account)
        navigate('/dashboard')
        return
      }

      const paymentsEnabled = await getPaymentsEnabled(studentData.college_id).catch(() => true)

      // Prefer PM10+ on any semester when present; otherwise allow enrolled students with no hold
      // (student_semester_financial_status is often empty until semester tuition invoices exist).
      const { data: semesterStatuses } = await supabase
        .from('student_semester_financial_status')
        .select('financial_milestone_code')
        .eq('student_id', studentData.id)
        .in('financial_milestone_code', ['PM10', 'PM30', 'PM60', 'PM90', 'PM100'])
        .limit(1)

      const hasPm10PlusRow = semesterStatuses && semesterStatuses.length > 0
      const loginMilestone = hasPm10PlusRow ? semesterStatuses[0].financial_milestone_code : 'PM00'

      const enrolledNoMilestoneYet =
        !hasPm10PlusRow &&
        canLoginWithoutSemesterPm10Milestone(
          studentData.financial_hold_reason_code || null,
          studentData.current_status_code || ''
        )

      const permission = enrolledNoMilestoneYet
        ? { allowed: true, reason: null }
        : checkFinancePermission(
            'SA_LGN',
            loginMilestone,
            studentData.financial_hold_reason_code || null,
            null,
            paymentsEnabled
          )

      if (!permission.allowed) {
        // Intentionally sign out so the user is not left in a half-logged-in state (auth session exists but portal access denied)
        if (signOut) {
          await signOut()
        }
        setError(`Access Denied: ${permission.reason || 'You need to make an initial payment (10%) to access the student portal. Please contact the finance office or make a payment.'}`)
        setLoading(false)
        return
      }

      // Check if student status allows login (enrollment lifecycle). When payments are disabled
      // university-wide or for this college, skip this gate so finance-off deployments don't lock students out.
      const allowedStatuses = ['ENAC', 'ACAC', 'ACPR', 'ENCF', 'ENPN']
      if (
        paymentsEnabled &&
        !allowedStatuses.includes(studentData.current_status_code || '')
      ) {
        // Sign out the user since their status doesn't allow login
        if (signOut) {
          await signOut()
        }
        setError(`Access Denied: Your account status (${studentData.current_status_code || 'Unknown'}) does not allow portal access. Please contact the admissions office.`)
        setLoading(false)
        return
      }

      navigate('/dashboard')
    } catch (err) {
      setError(err.message || 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="relative min-h-screen">
        <div className="absolute top-6 right-6 z-20">
          <LanguageToggle />
        </div>
        {/* Back button */}
        <Link
          to="/"
          className="absolute top-6 left-6 z-20 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur hover:bg-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 lg:grid-cols-2">
          {/* Left: Brand/Visual */}
          <div className="relative hidden lg:flex flex-col justify-between p-10">
            <div className="absolute inset-0">
              <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-orange-200 blur-3xl opacity-70" />
              <div className="absolute bottom-10 right-0 h-80 w-80 rounded-full bg-red-200 blur-3xl opacity-70" />
              <div
                className="absolute inset-0 opacity-[0.05]"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f172a' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
                }}
              />
            </div>

            <div className="relative">
              <img src="/assets/IBU Logo.png" alt="IBU Logo" className="h-20 w-auto object-contain" />
              <div className="mt-10 max-w-lg">
                <div className="inline-flex items-center rounded-full bg-white/70 px-3 py-1 text-xs font-extrabold text-slate-700 ring-1 ring-slate-200">
                  Student Portal
                </div>
                <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-900">
                  Learn, track progress, and manage your studies.
                </h1>
                <p className="mt-3 text-slate-600">
                  Sign in to access courseware, grades, requests, and all your student services in one place.
                </p>

                <div className="mt-7 grid grid-cols-1 gap-3">
                  <div className="rounded-2xl bg-white/70 ring-1 ring-slate-200 px-4 py-3">
                    <div className="text-xs font-extrabold text-slate-500">Courseware</div>
                    <div className="mt-1 text-sm font-extrabold text-slate-900">Lessons, quizzes, exams</div>
                  </div>
                  <div className="rounded-2xl bg-white/70 ring-1 ring-slate-200 px-4 py-3">
                    <div className="text-xs font-extrabold text-slate-500">Progress</div>
                    <div className="mt-1 text-sm font-extrabold text-slate-900">Track completion & performance</div>
                  </div>
                  <div className="rounded-2xl bg-white/70 ring-1 ring-slate-200 px-4 py-3">
                    <div className="text-xs font-extrabold text-slate-500">Requests</div>
                    <div className="mt-1 text-sm font-extrabold text-slate-900">Submit and follow up easily</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative text-sm text-slate-500">
              University Management System • Imam Bukhari University (IBU)
            </div>
          </div>

          {/* Right: Form */}
          <div className="flex items-center justify-center p-6 lg:p-10">
            <div className="w-full max-w-md">
              <div className="lg:hidden mb-8">
                <img src="/assets/IBU Logo.png" alt="IBU Logo" className="h-16 w-auto object-contain" />
              </div>

              <div className="rounded-3xl bg-white shadow-xl ring-1 ring-slate-200 p-7 lg:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900">Welcome back</h2>
                    <p className="mt-1 text-sm text-slate-600">Sign in with your student account.</p>
                  </div>
                  <div className="hidden sm:flex items-center rounded-full bg-slate-50 px-3 py-1 text-xs font-extrabold text-slate-700 ring-1 ring-slate-200">
                    Student
                  </div>
                </div>

                {error && (
                  <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <div className="flex gap-2">
                      <AlertCircle className="h-5 w-5 mt-0.5" />
                      <div className="leading-5">{error}</div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                  <div>
                    <label htmlFor="email" className="block text-sm font-bold text-slate-700 mb-2">
                      Email address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        className="block w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-3 py-3 text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                        placeholder="you@university.edu"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-bold text-slate-700 mb-2">
                      Password
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                        className="block w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-12 py-3 text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                        placeholder="Enter your password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    <Link to="/forgot-password" className="text-sm font-bold text-slate-700 hover:text-slate-900">
                      Forgot password?
                    </Link>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-2xl bg-slate-900 text-white py-3.5 font-extrabold shadow-lg shadow-slate-900/10 transition hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-5 w-5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                        Signing in…
                      </span>
                    ) : (
                      'Sign in'
                    )}
                  </button>

                  <p className="text-center text-xs text-slate-500">
                    By signing in, you agree to the university’s acceptable use policy.
                  </p>
                </form>
              </div>

              <p className="mt-6 text-center text-xs text-slate-500 lg:hidden">
                University Management System • Imam Bukhari University (IBU)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


