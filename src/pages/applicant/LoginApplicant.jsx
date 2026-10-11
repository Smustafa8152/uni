import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { resolvePortalAccountByEmail } from '../../utils/resolvePortalAccountByEmail'
import { invokeApplicantForgotPassword } from '../../utils/invokeApplicantForgotPassword'
import { Mail, Lock, Eye, EyeOff, ArrowLeft, AlertCircle, Loader2 } from 'lucide-react'
import LanguageToggle from '../../components/LanguageToggle'

export default function LoginApplicant() {
  const { t, i18n } = useTranslation()
  const { isRTL } = useLanguage()
  const { signIn, user, userRole, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/portal'

  const [email, setEmail] = useState(() => String(location.state?.email || '').trim())
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorKind, setErrorKind] = useState('')
  const [notice, setNotice] = useState('')
  const [step, setStep] = useState('signin')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const forgotMessage = (err) => {
    const key = {
      no_account: 'applicantLogin.forgotNoAccount',
      not_applicant: 'applicantLogin.forgotNotApplicant',
      wait: 'applicantLogin.forgotWait',
      too_many: 'applicantLogin.forgotTooMany',
      invalid_code: 'applicantLogin.forgotInvalidCode',
      expired: 'applicantLogin.forgotExpired',
      send_failed: 'applicantLogin.forgotSendFailed',
      smtp_missing: 'applicantLogin.forgotSmtpMissing',
      invalid_email: 'applicantLogin.forgotInvalidEmail',
      password_short: 'applicantLogin.passwordShort',
    }[err?.code]
    return key ? t(key) : err?.message || t('applicantLogin.failed')
  }

  const sendCode = async (e) => {
    e?.preventDefault()
    setError('')
    setErrorKind('')
    setNotice('')
    setLoading(true)
    try {
      const em = email.trim().toLowerCase()
      await invokeApplicantForgotPassword({ action: 'send', email: em, lang: i18n.language })
      setEmail(em)
      setStep('verify')
      setNotice(t('applicantLogin.codeSent', { email: em }))
    } catch (err) {
      setError(forgotMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const saveNewPassword = async (e) => {
    e.preventDefault()
    setError('')
    setErrorKind('')
    setNotice('')
    if (newPassword.length < 8) {
      setError(t('applicantLogin.passwordShort', 'Password must be at least 8 characters.'))
      return
    }
    if (newPassword !== confirmPassword) {
      setError(t('applicantLogin.passwordMismatch', 'Passwords do not match.'))
      return
    }
    setLoading(true)
    try {
      await invokeApplicantForgotPassword({
        action: 'reset',
        email: email.trim().toLowerCase(),
        code,
        newPassword,
        lang: i18n.language,
      })
      setPassword('')
      setCode('')
      setNewPassword('')
      setConfirmPassword('')
      setStep('signin')
      setNotice(t('applicantLogin.passwordUpdated', 'Password updated. Sign in with your new password.'))
    } catch (err) {
      setError(forgotMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authLoading && user && userRole === 'applicant') {
      navigate(from, { replace: true })
    }
  }, [user, userRole, authLoading, navigate, from])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setErrorKind('')
    setLoading(true)
    try {
      const em = email.trim().toLowerCase()
      const kind = await resolvePortalAccountByEmail(em)
      if (kind === 'instructor') {
        setErrorKind('instructor')
        throw new Error(
          t(
            'applicantLogin.emailIsInstructor',
            'This email belongs to an instructor account. Please use Instructor Portal sign-in.',
          ),
        )
      }

      const { error: signErr } = await signIn(em, password, 'applicant')
      if (signErr) {
        if (signErr.code === 'ROLE_INSTRUCTOR' || /instructor|teacher/i.test(signErr.message || '')) {
          setErrorKind('instructor')
          throw new Error(
            t(
              'applicantLogin.emailIsInstructor',
              'This email belongs to an instructor account. Please use Instructor Portal sign-in.',
            ),
          )
        }
        throw signErr
      }
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || t('applicantLogin.failed'))
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-slate-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="relative min-h-screen" style={{ fontFamily: "'Cairo', system-ui, sans-serif" }}>
        <div className={`absolute top-6 ${isRTL ? 'left-6' : 'right-6'} z-20`}>
          <LanguageToggle />
        </div>
        <Link
          to="/"
          className={`absolute top-6 ${isRTL ? 'right-6' : 'left-6'} z-20 inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur hover:bg-white transition ${
            isRTL ? 'flex-row-reverse' : ''
          }`}
        >
          <ArrowLeft className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} />
          {t('login.backToRoles', 'Back')}
        </Link>

        <div className="mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 lg:grid-cols-2">
          {/* Left: Brand/Visual */}
          <div className="relative hidden lg:flex flex-col justify-between p-10">
            <div className="absolute inset-0">
              <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-blue-200 blur-3xl opacity-70" />
              <div className="absolute bottom-10 right-0 h-80 w-80 rounded-full bg-indigo-200 blur-3xl opacity-70" />
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
              <div className="mt-10 max-w-md">
                <div className="inline-flex items-center rounded-full bg-white/70 px-3 py-1 text-xs font-extrabold text-slate-700 ring-1 ring-slate-200">
                  {t('applicantLogin.title', 'Applicant Portal')}
                </div>
                <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-900">
                  {t('applicantLogin.subtitle', 'Track your application and updates.')}
                </h1>
                <p className="mt-3 text-slate-600">
                  {t('applicantLogin.subtitle2', 'Sign in to view your status, documents, and offer details.')}
                </p>

                <div className="mt-7 grid grid-cols-1 gap-3">
                  <div className="rounded-2xl bg-white/70 ring-1 ring-slate-200 px-4 py-3">
                    <div className="text-xs font-extrabold text-slate-500">{t('applicantLogin.cards.application.title')}</div>
                    <div className="mt-1 text-sm font-extrabold text-slate-900">{t('applicantLogin.cards.application.value')}</div>
                  </div>
                  <div className="rounded-2xl bg-white/70 ring-1 ring-slate-200 px-4 py-3">
                    <div className="text-xs font-extrabold text-slate-500">{t('applicantLogin.cards.updates.title')}</div>
                    <div className="mt-1 text-sm font-extrabold text-slate-900">{t('applicantLogin.cards.updates.value')}</div>
                  </div>
                  <div className="rounded-2xl bg-white/70 ring-1 ring-slate-200 px-4 py-3">
                    <div className="text-xs font-extrabold text-slate-500">{t('applicantLogin.cards.offerLetter.title')}</div>
                    <div className="mt-1 text-sm font-extrabold text-slate-900">{t('applicantLogin.cards.offerLetter.value')}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative text-sm text-slate-500">{t('applicantLogin.footer')}</div>
          </div>

          {/* Right: Form */}
          <div className="flex items-center justify-center p-6 lg:p-10">
            <div className="w-full max-w-md">
              <div className="lg:hidden mb-8 text-center">
                <img src="/assets/IBU Logo.png" alt="IBU Logo" className="h-14 w-auto object-contain mx-auto" />
              </div>

              <div className="rounded-3xl bg-white shadow-xl ring-1 ring-slate-200 p-7 lg:p-8">
                <div className={`flex items-start justify-between gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className={isRTL ? 'text-right' : ''}>
                    <h2 className="text-2xl font-black text-slate-900">
                      {step === 'signin'
                        ? t('applicantLogin.title', 'Applicant login')
                        : t('applicantLogin.forgotTitle', 'Reset your password')}
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {step === 'signin'
                        ? t('applicantLogin.subtitle', 'Sign in to your applicant account.')
                        : t('applicantLogin.forgotHint', 'We will email a 6-digit code from enrolment@ibu.edu.gm.')}
                    </p>
                  </div>
                  <div className="hidden sm:flex items-center rounded-full bg-slate-50 px-3 py-1 text-xs font-extrabold text-slate-700 ring-1 ring-slate-200">
                    {t('applicantLogin.rolePill')}
                  </div>
                </div>

                {notice && (
                  <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {notice}
                  </div>
                )}

                {error && (
                  <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                      <div className="leading-5 space-y-2">
                        <div>{error}</div>
                        {errorKind === 'instructor' && (
                          <Link
                            to="/login/instructor"
                            className="inline-flex font-extrabold text-red-800 underline underline-offset-2 hover:text-red-900"
                          >
                            {t('applicantLogin.goToInstructorLogin', 'Go to Instructor Portal sign-in')}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {step === 'signin' ? (
                <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                  <div>
                    <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>
                      {t('applicantLogin.email', 'Email address')}
                    </label>
                    <div className="relative">
                      <div className={`absolute inset-y-0 ${isRTL ? 'right-0 pr-3' : 'left-0 pl-3'} flex items-center pointer-events-none`}>
                        <Mail className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                        className={`block w-full rounded-2xl border border-slate-200 bg-white py-3 text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 ${
                          isRTL ? 'pr-10 pl-3 text-right' : 'pl-10 pr-3'
                        }`}
                        placeholder="you@email.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>
                      {t('applicantLogin.password', 'Password')}
                    </label>
                    <div className="relative">
                      <div className={`absolute inset-y-0 ${isRTL ? 'right-0 pr-3' : 'left-0 pl-3'} flex items-center pointer-events-none`}>
                        <Lock className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                        className={`block w-full rounded-2xl border border-slate-200 bg-white py-3 text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 ${
                          isRTL ? 'pr-10 pl-12 text-right' : 'pl-10 pr-12'
                        }`}
                        placeholder={t('applicantLogin.password', 'Password')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className={`absolute inset-y-0 ${isRTL ? 'left-0 pl-3' : 'right-0 pr-3'} flex items-center text-slate-400 hover:text-slate-700`}
                        aria-label={showPassword ? t('applicantLogin.hidePassword') : t('applicantLogin.showPassword')}
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    <div className={`mt-2 flex ${isRTL ? 'justify-start' : 'justify-end'}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setError('')
                          setErrorKind('')
                          setNotice('')
                          setStep('request')
                        }}
                        className="text-sm font-bold text-slate-700 hover:text-slate-900"
                      >
                        {t('applicantLogin.forgotPassword', 'Forgot password?')}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-2xl bg-slate-900 text-white py-3.5 font-extrabold shadow-lg shadow-slate-900/10 transition hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <span className={`flex items-center justify-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {t('applicantLogin.signingIn', 'Signing in…')}
                      </span>
                    ) : (
                      t('applicantLogin.submit', 'Sign in')
                    )}
                  </button>

                  <p className="text-center text-sm text-slate-600">
                    {t('applicantLogin.noAccount', "Don't have an account?")}{' '}
                    <Link to="/apply" className="font-extrabold text-slate-900 hover:underline">
                      {t('applicantLogin.createAccount', 'Apply for admission')}
                    </Link>
                  </p>
                </form>
                ) : (
                <form onSubmit={step === 'verify' ? saveNewPassword : sendCode} className="mt-6 space-y-5">
                  <div>
                    <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>
                      {t('applicantLogin.email', 'Email address')}
                    </label>
                    <div className="relative">
                      <div className={`absolute inset-y-0 ${isRTL ? 'right-0 pr-3' : 'left-0 pl-3'} flex items-center pointer-events-none`}>
                        <Mail className="h-5 w-5 text-slate-400" />
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        readOnly={step === 'verify'}
                        autoComplete="email"
                        className={`block w-full rounded-2xl border border-slate-200 bg-white py-3 text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 ${
                          step === 'verify' ? 'bg-slate-50' : ''
                        } ${isRTL ? 'pr-10 pl-3 text-right' : 'pl-10 pr-3'}`}
                        placeholder="you@email.com"
                      />
                    </div>
                  </div>

                  {step === 'verify' && (
                    <>
                      <div>
                        <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>
                          {t('applicantLogin.codeLabel', 'Code')}
                        </label>
                        <input
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          value={code}
                          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          required
                          className="block w-full rounded-2xl border border-slate-200 bg-white py-3 text-center text-2xl font-black tracking-[0.4em] text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                          placeholder="000000"
                        />
                      </div>
                      <div>
                        <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>
                          {t('applicantLogin.newPassword', 'New password')}
                        </label>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          required
                          minLength={8}
                          autoComplete="new-password"
                          className={`block w-full rounded-2xl border border-slate-200 bg-white py-3 text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 ${
                            isRTL ? 'px-3 text-right' : 'px-3'
                          }`}
                        />
                      </div>
                      <div>
                        <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>
                          {t('applicantLogin.confirmPassword', 'Confirm password')}
                        </label>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          required
                          minLength={8}
                          autoComplete="new-password"
                          className="block w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-slate-900 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                        />
                      </div>
                    </>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-2xl bg-slate-900 text-white py-3.5 font-extrabold shadow-lg shadow-slate-900/10 transition hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <span className={`flex items-center justify-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {step === 'verify'
                          ? t('applicantLogin.savingPassword', 'Saving…')
                          : t('applicantLogin.sendingCode', 'Sending code…')}
                      </span>
                    ) : step === 'verify' ? (
                      t('applicantLogin.savePassword', 'Save password')
                    ) : (
                      t('applicantLogin.sendCode', 'Send code')
                    )}
                  </button>

                  <div className={`flex items-center justify-between gap-3 text-sm ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <button
                      type="button"
                      onClick={() => {
                        setStep('signin')
                        setError('')
                        setErrorKind('')
                        setCode('')
                        setNewPassword('')
                        setConfirmPassword('')
                      }}
                      className="font-bold text-slate-700 hover:text-slate-900"
                    >
                      {t('applicantLogin.backToSignIn', 'Back to sign in')}
                    </button>
                    {step === 'verify' && (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={sendCode}
                        className="font-extrabold text-slate-900 hover:underline disabled:opacity-60"
                      >
                        {t('applicantLogin.resendCode', 'Resend code')}
                      </button>
                    )}
                  </div>
                </form>
                )}
              </div>

              <p className="mt-6 text-center text-xs text-slate-500 lg:hidden">{t('applicantLogin.footer')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
