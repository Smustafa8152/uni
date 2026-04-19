import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { syncApplicantProfile } from '../../utils/syncApplicantProfile'
import { useAuth } from '../../contexts/AuthContext'
import { Mail, KeyRound, Lock, ArrowRight, Loader2 } from 'lucide-react'

export default function ApplicantRegister() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const navigate = useNavigate()
  const { refreshUserRole, user, userRole } = useAuth()

  useEffect(() => {
    if (user && userRole === 'applicant') {
      navigate('/portal', { replace: true })
    }
  }, [user, userRole, navigate])

  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [password2, setPassword2] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // After clicking the email magic link, PKCE completes in AuthContext; resume at password step only then.
  useEffect(() => {
    let pkcePending = false
    try {
      pkcePending = sessionStorage.getItem('ums_auth_pkce_exchange') === '1'
    } catch (_) {
      return
    }
    if (!pkcePending) return
    if (!user?.email) return
    if (userRole === 'applicant') {
      try {
        sessionStorage.removeItem('ums_auth_pkce_exchange')
      } catch (_) {
        /* ignore */
      }
      return
    }
    if (userRole != null && userRole !== 'applicant') {
      try {
        sessionStorage.removeItem('ums_auth_pkce_exchange')
      } catch (_) {
        /* ignore */
      }
      return
    }
    if (step !== 1) return
    try {
      sessionStorage.removeItem('ums_auth_pkce_exchange')
    } catch (_) {
      /* ignore */
    }
    setEmail(user.email.trim().toLowerCase())
    setStep(3)
  }, [user, userRole, step])

  const sendOtp = async (e) => {
    e.preventDefault()
    setError('')
    const em = email.trim().toLowerCase()
    if (!em || !em.includes('@')) {
      setError(t('applicantRegister.invalidEmail'))
      return
    }
    setLoading(true)
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : ''
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: em,
        options: {
          shouldCreateUser: true,
          // Keeps the optional one-time link pointed at registration (PKCE still works if they click it).
          emailRedirectTo: origin ? `${origin}/register` : undefined,
        },
      })
      if (otpErr) throw otpErr
      setEmail(em)
      setStep(2)
    } catch (err) {
      setError(err.message || t('applicantRegister.otpSendFailed'))
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async (e) => {
    e.preventDefault()
    setError('')
    const code = otp.trim().replace(/\s/g, '')
    if (code.length < 6) {
      setError(t('applicantRegister.invalidOtp'))
      return
    }
    setLoading(true)
    try {
      const { error: vErr } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code,
        type: 'email',
      })
      if (vErr) throw vErr
      setStep(3)
    } catch (err) {
      setError(err.message || t('applicantRegister.otpVerifyFailed'))
    } finally {
      setLoading(false)
    }
  }

  const completeRegistration = async (e) => {
    e.preventDefault()
    setError('')
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
      const { error: uErr } = await supabase.auth.updateUser({ password })
      if (uErr) throw uErr

      await syncApplicantProfile({ name: displayName.trim() || undefined })
      await refreshUserRole()
      navigate('/portal', { replace: true })
    } catch (err) {
      setError(err.message || t('applicantRegister.completeFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen bg-[#f4f6fb] flex items-center justify-center p-4"
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{ fontFamily: "'Cairo', system-ui, sans-serif" }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl border border-[#dde3ef] shadow-lg p-8">
        <div className="text-center mb-6">
          <img src="/assets/IBU Logo.png" alt="" className="h-14 mx-auto mb-3 object-contain" />
          <h1 className="text-xl font-extrabold text-[#1a3a6b]">{t('applicantRegister.title')}</h1>
          <p className="text-sm text-[#6b7a99] mt-1">{t('applicantRegister.subtitle')}</p>
        </div>

        <div className="flex justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 flex-1 rounded-full max-w-[72px] ${step >= s ? 'bg-[#1a3a6b]' : 'bg-[#dde3ef]'}`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}

        {step === 1 && (
          <form onSubmit={sendOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#1e2a3a] mb-1.5">{t('applicantRegister.email')}</label>
              <div className="relative">
                <Mail className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7a99] ${isRTL ? 'right-3' : 'left-3'}`} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full rounded-lg border border-[#dde3ef] py-2.5 text-sm focus:ring-2 focus:ring-[#2a5298] focus:border-transparent outline-none ${
                    isRTL ? 'pr-10 pl-3' : 'pl-10 pr-3'
                  }`}
                  placeholder="name@university.edu"
                  autoComplete="email"
                  required
                />
              </div>
              <p className="text-xs text-[#6b7a99] mt-1.5">{t('applicantRegister.emailHint')}</p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-[#1a3a6b] text-white font-bold text-sm hover:bg-[#2a5298] disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
              {t('applicantRegister.sendCode')}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={verifyOtp} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#1e2a3a] mb-1.5">{t('applicantRegister.otpLabel')}</label>
              <div className="relative">
                <KeyRound className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7a99] ${isRTL ? 'right-3' : 'left-3'}`} />
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  className={`w-full rounded-lg border border-[#dde3ef] py-2.5 text-sm tracking-widest font-mono focus:ring-2 focus:ring-[#2a5298] outline-none ${
                    isRTL ? 'pr-10 pl-3' : 'pl-10 pr-3'
                  }`}
                  placeholder="••••••"
                  required
                />
              </div>
              <p className="text-xs text-[#6b7a99] mt-1.5">{t('applicantRegister.otpHint', { email })}</p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-[#1a3a6b] text-white font-bold text-sm hover:bg-[#2a5298] disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {t('applicantRegister.verify')}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep(1)
                setOtp('')
                setError('')
              }}
              className="w-full text-sm text-[#2a5298] font-semibold hover:underline"
            >
              {t('applicantRegister.changeEmail')}
            </button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={completeRegistration} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[#1e2a3a] mb-1.5">{t('applicantRegister.displayName')}</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full rounded-lg border border-[#dde3ef] py-2.5 px-3 text-sm focus:ring-2 focus:ring-[#2a5298] outline-none"
                placeholder={t('applicantRegister.displayNamePlaceholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1e2a3a] mb-1.5">{t('applicantRegister.password')}</label>
              <div className="relative">
                <Lock className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7a99] ${isRTL ? 'right-3' : 'left-3'}`} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full rounded-lg border border-[#dde3ef] py-2.5 text-sm focus:ring-2 focus:ring-[#2a5298] outline-none ${
                    isRTL ? 'pr-10 pl-3' : 'pl-10 pr-3'
                  }`}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-[#1e2a3a] mb-1.5">{t('applicantRegister.passwordConfirm')}</label>
              <input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                className="w-full rounded-lg border border-[#dde3ef] py-2.5 px-3 text-sm focus:ring-2 focus:ring-[#2a5298] outline-none"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
            <p className="text-xs text-[#6b7a99]">{t('applicantRegister.noStudentRow')}</p>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-[#c8a84b] text-[#1a3a6b] font-bold text-sm hover:bg-[#b8942e] disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {t('applicantRegister.finish')}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-[#6b7a99] mt-6">
          {t('applicantRegister.haveAccount')}{' '}
          <Link to="/login/applicant" className="text-[#2a5298] font-bold hover:underline">
            {t('applicantRegister.signIn')}
          </Link>
        </p>
      </div>
    </div>
  )
}
