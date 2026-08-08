import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { resolvePortalAccountByEmail } from '../utils/resolvePortalAccountByEmail'
import { Mail, Lock, Eye, EyeOff, ArrowLeft, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import LanguageToggle from '../components/LanguageToggle'

export default function LoginInstructor() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [errorKind, setErrorKind] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, user, userRole, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  // Redirect if already logged in to instructor portal
  useEffect(() => {
    if (!authLoading && user && userRole === 'instructor') {
      navigate('/instructor/dashboard', { replace: true })
    }
  }, [user, userRole, authLoading, navigate])

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-2 border-slate-300 border-t-slate-700 mx-auto" />
          <p className="mt-4 text-slate-600 font-medium">{t('instructorLogin.loading')}</p>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setErrorKind('')
    setLoading(true)

    try {
      const em = email.trim().toLowerCase()
      const kind = await resolvePortalAccountByEmail(em)
      if (kind === 'applicant') {
        setErrorKind('applicant')
        throw new Error(
          t(
            'instructorLogin.emailIsApplicant',
            'This email belongs to an applicant account. Please use Applicant Portal sign-in, not the Instructor Portal.',
          ),
        )
      }
      if (kind === 'student') {
        setErrorKind('student')
        throw new Error(
          t(
            'instructorLogin.emailIsStudent',
            'This email belongs to a student account. Please use Student Portal sign-in.',
          ),
        )
      }

      const { data, error: signInError } = await signIn(em, password, 'instructor')
      if (signInError) {
        if (signInError.code === 'ROLE_APPLICANT' || /applicant/i.test(signInError.message || '')) {
          setErrorKind('applicant')
          throw new Error(
            t(
              'instructorLogin.emailIsApplicant',
              'This email belongs to an applicant account. Please use Applicant Portal sign-in, not the Instructor Portal.',
            ),
          )
        }
        throw signInError
      }
      navigate('/instructor/dashboard')
    } catch (err) {
      setError(err.message || t('instructorLogin.failedToSignIn'))
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
        <Link
          to="/"
          className="absolute top-6 left-6 z-20 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur hover:bg-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('instructorLogin.back')}
        </Link>

        <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 lg:grid-cols-2">
          {/* Left: Brand/Visual */}
          <div className="relative hidden lg:flex flex-col justify-between p-10">
            <div className="absolute inset-0">
              <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-emerald-200 blur-3xl opacity-70" />
              <div className="absolute bottom-10 right-0 h-80 w-80 rounded-full bg-teal-200 blur-3xl opacity-70" />
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
                  {t('instructorLogin.portalBadge')}
                </div>
                <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-900">{t('instructorLogin.heroTitle')}</h1>
                <p className="mt-3 text-slate-600">{t('instructorLogin.heroSubtitle')}</p>

                <div className="mt-7 grid grid-cols-1 gap-3">
                  <div className="rounded-2xl bg-white/70 ring-1 ring-slate-200 px-4 py-3">
                    <div className="text-xs font-extrabold text-slate-500">{t('instructorLogin.cards.teaching.title')}</div>
                    <div className="mt-1 text-sm font-extrabold text-slate-900">{t('instructorLogin.cards.teaching.value')}</div>
                  </div>
                  <div className="rounded-2xl bg-white/70 ring-1 ring-slate-200 px-4 py-3">
                    <div className="text-xs font-extrabold text-slate-500">{t('instructorLogin.cards.assessments.title')}</div>
                    <div className="mt-1 text-sm font-extrabold text-slate-900">{t('instructorLogin.cards.assessments.value')}</div>
                  </div>
                  <div className="rounded-2xl bg-white/70 ring-1 ring-slate-200 px-4 py-3">
                    <div className="text-xs font-extrabold text-slate-500">{t('instructorLogin.cards.analytics.title')}</div>
                    <div className="mt-1 text-sm font-extrabold text-slate-900">{t('instructorLogin.cards.analytics.value')}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative text-sm text-slate-500">{t('instructorLogin.footer')}</div>
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
                    <h2 className="text-2xl font-black text-slate-900">{t('instructorLogin.title')}</h2>
                    <p className="mt-1 text-sm text-slate-600">{t('instructorLogin.subtitle')}</p>
                  </div>
                  <div className="hidden sm:flex items-center rounded-full bg-slate-50 px-3 py-1 text-xs font-extrabold text-slate-700 ring-1 ring-slate-200">
                    {t('instructorLogin.rolePill')}
                  </div>
                </div>

                {error && (
                  <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <div className="flex gap-2">
                      <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                      <div className="leading-5 space-y-2">
                        <div>{error}</div>
                        {errorKind === 'applicant' && (
                          <Link
                            to="/login/applicant"
                            className="inline-flex font-extrabold text-red-800 underline underline-offset-2 hover:text-red-900"
                          >
                            {t('instructorLogin.goToApplicantLogin', 'Go to Applicant Portal sign-in')}
                          </Link>
                        )}
                        {errorKind === 'student' && (
                          <Link
                            to="/login/student"
                            className="inline-flex font-extrabold text-red-800 underline underline-offset-2 hover:text-red-900"
                          >
                            {t('instructorLogin.goToStudentLogin', 'Go to Student Portal sign-in')}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                  <div>
                    <label htmlFor="email" className="block text-sm font-bold text-slate-700 mb-2">
                      {t('instructorLogin.emailAddress')}
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
                        placeholder={t('instructorLogin.emailPlaceholder')}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="password" className="block text-sm font-bold text-slate-700 mb-2">
                      {t('instructorLogin.password')}
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
                        placeholder={t('instructorLogin.enterPassword')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700"
                        aria-label={showPassword ? t('instructorLogin.hidePassword') : t('instructorLogin.showPassword')}
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    <Link to="/forgot-password" className="text-sm font-bold text-slate-700 hover:text-slate-900">
                      {t('instructorLogin.forgotPassword')}
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
                        {t('instructorLogin.signingIn')}
                      </span>
                    ) : (
                      t('instructorLogin.signIn')
                    )}
                  </button>
                </form>
              </div>

              <p className="mt-6 text-center text-xs text-slate-500 lg:hidden">{t('instructorLogin.footer')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


