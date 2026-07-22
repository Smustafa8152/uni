import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { syncApplicantProfile } from '../../utils/syncApplicantProfile'
import { useAuth } from '../../contexts/AuthContext'
import { Mail, Lock, Eye, EyeOff, ArrowLeft, AlertCircle, Loader2 } from 'lucide-react'
import LanguageToggle from '../../components/LanguageToggle'

export default function ApplicantRegister() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const navigate = useNavigate()
  const { refreshUserRole, signIn, user, userRole } = useAuth()

  useEffect(() => {
    if (user && userRole === 'applicant') {
      navigate('/portal', { replace: true })
    }
  }, [user, userRole, navigate])

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const finishSession = async (name) => {
    await syncApplicantProfile({ name: name || undefined })
    await refreshUserRole()
    navigate('/portal', { replace: true })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const em = email.trim().toLowerCase()
    if (!em || !em.includes('@')) {
      setError(t('applicantRegister.invalidEmail'))
      return
    }
    if (password.length < 8) {
      setError(t('applicantRegister.passwordShort'))
      return
    }
    if (password !== password2) {
      setError(t('applicantRegister.passwordMismatch'))
      return
    }

    setLoading(true)
    try {
      const name = displayName.trim() || undefined
      const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
        email: em,
        password,
        options: {
          data: {
            role: 'applicant',
            name: name || em,
          },
        },
      })

      // Already registered → sign in with the same credentials
      const alreadyExists =
        signUpErr &&
        /already|registered|exists|duplicate/i.test(signUpErr.message || '')

      if (alreadyExists) {
        const { error: signInErr } = await signIn(em, password, 'applicant')
        if (signInErr) throw signInErr
        await finishSession(name)
        return
      }

      if (signUpErr) throw signUpErr

      if (signUpData?.session) {
        await finishSession(name)
        return
      }

      // Project may require email confirm; still try password login (works when confirm is off / auto-confirmed)
      const { error: signInErr } = await signIn(em, password, 'applicant')
      if (signInErr) {
        throw new Error(
          t(
            'applicantRegister.confirmEmailBlocked',
            'Account created, but sign-in needs email confirmation in Supabase. Disable “Confirm email” under Authentication → Providers → Email, or sign in from Applicant login after confirming.',
          ),
        )
      }
      await finishSession(name)
    } catch (err) {
      setError(err.message || t('applicantRegister.completeFailed'))
    } finally {
      setLoading(false)
    }
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
          <div className="relative hidden lg:flex flex-col justify-between p-10">
            <div className="absolute inset-0">
              <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-blue-200 blur-3xl opacity-70" />
              <div className="absolute bottom-10 right-0 h-80 w-80 rounded-full bg-indigo-200 blur-3xl opacity-70" />
            </div>

            <div className="relative">
              <img src="/assets/IBU Logo.png" alt="IBU Logo" className="h-20 w-auto object-contain" />
              <div className="mt-10 max-w-lg">
                <div className="inline-flex items-center rounded-full bg-white/70 px-3 py-1 text-xs font-extrabold text-slate-700 ring-1 ring-slate-200">
                  {t('applicantRegister.title')}
                </div>
                <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-900">
                  {t('applicantRegister.heroTitle', 'Create your account and continue.')}
                </h1>
                <p className="mt-3 text-slate-600">{t('applicantRegister.noStudentRow')}</p>
              </div>
            </div>

            <div className="relative text-sm text-slate-500">University Management System • Imam Bukhari University (IBU)</div>
          </div>

          <div className="flex items-center justify-center p-6 lg:p-10">
            <div className="w-full max-w-md">
              <div className="lg:hidden mb-8 text-center">
                <img src="/assets/IBU Logo.png" alt="IBU Logo" className="h-16 w-auto object-contain mx-auto" />
              </div>

              <div className="rounded-3xl bg-white shadow-xl ring-1 ring-slate-200 p-7 lg:p-8">
                <div className={`flex items-start justify-between gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <div className={isRTL ? 'text-right' : ''}>
                    <h2 className="text-2xl font-black text-slate-900">{t('applicantRegister.title')}</h2>
                    <p className="mt-1 text-sm text-slate-600">{t('applicantRegister.subtitle')}</p>
                  </div>
                  <div className="hidden sm:flex items-center rounded-full bg-slate-50 px-3 py-1 text-xs font-extrabold text-slate-700 ring-1 ring-slate-200">
                    {t('applicantLogin.title', 'Applicant')}
                  </div>
                </div>

                {error && (
                  <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    <div className={`flex gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                      <div className="leading-5">{error}</div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                  <div>
                    <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>
                      {t('applicantRegister.email')}
                    </label>
                    <div className="relative">
                      <Mail className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={`w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 ${
                          isRTL ? 'pr-10 pl-3 text-right' : 'pl-10 pr-3'
                        }`}
                        placeholder="name@email.com"
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>
                      {t('applicantRegister.displayName')}
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className={`w-full rounded-2xl border border-slate-200 bg-white py-3 px-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 ${
                        isRTL ? 'text-right' : ''
                      }`}
                      placeholder={t('applicantRegister.displayNamePlaceholder')}
                      autoComplete="name"
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>
                      {t('applicantRegister.password')}
                    </label>
                    <div className="relative">
                      <Lock className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 ${isRTL ? 'right-3' : 'left-3'}`} />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`w-full rounded-2xl border border-slate-200 bg-white py-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 ${
                          isRTL ? 'pr-10 pl-12 text-right' : 'pl-10 pr-12'
                        }`}
                        autoComplete="new-password"
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className={`absolute inset-y-0 ${isRTL ? 'left-0 pl-3' : 'right-0 pr-3'} flex items-center text-slate-400 hover:text-slate-700`}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className={`block text-sm font-bold text-slate-700 mb-2 ${isRTL ? 'text-right' : ''}`}>
                      {t('applicantRegister.passwordConfirm')}
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password2}
                      onChange={(e) => setPassword2(e.target.value)}
                      className={`w-full rounded-2xl border border-slate-200 bg-white py-3 px-3 text-sm text-slate-900 placeholder-slate-400 shadow-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100 ${
                        isRTL ? 'text-right' : ''
                      }`}
                      autoComplete="new-password"
                      required
                      minLength={8}
                    />
                  </div>

                  <p className={`text-xs text-slate-500 ${isRTL ? 'text-right' : ''}`}>{t('applicantRegister.noStudentRow')}</p>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-2xl bg-slate-900 text-white py-3.5 font-extrabold shadow-lg shadow-slate-900/10 transition hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <span className={`flex items-center justify-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {t('applicantRegister.creating', 'Creating account…')}
                      </span>
                    ) : (
                      t('applicantRegister.finish', 'Create account')
                    )}
                  </button>
                </form>

                <p className="text-center text-sm text-slate-600 mt-6">
                  {t('applicantRegister.haveAccount')}{' '}
                  <Link to="/login/applicant" className="font-extrabold text-slate-900 hover:underline">
                    {t('applicantRegister.signIn')}
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
