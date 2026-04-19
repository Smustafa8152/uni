import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { Mail, Lock, Loader2 } from 'lucide-react'

export default function LoginApplicant() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const { signIn, user, userRole, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from || '/portal'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!authLoading && user && userRole === 'applicant') {
      navigate(from, { replace: true })
    }
  }, [user, userRole, authLoading, navigate, from])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { error: signErr } = await signIn(email.trim(), password, 'applicant')
      if (signErr) throw signErr
      navigate(from, { replace: true })
    } catch (err) {
      setError(err.message || t('applicantLogin.failed'))
    } finally {
      setLoading(false)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f6fb]">
        <Loader2 className="w-10 h-10 text-[#1a3a6b] animate-spin" />
      </div>
    )
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
          <h1 className="text-xl font-extrabold text-[#1a3a6b]">{t('applicantLogin.title')}</h1>
          <p className="text-sm text-[#6b7a99] mt-1">{t('applicantLogin.subtitle')}</p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-[#1e2a3a] mb-1.5">{t('applicantLogin.email')}</label>
            <div className="relative">
              <Mail className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7a99] ${isRTL ? 'right-3' : 'left-3'}`} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full rounded-lg border border-[#dde3ef] py-2.5 text-sm focus:ring-2 focus:ring-[#2a5298] outline-none ${
                  isRTL ? 'pr-10 pl-3' : 'pl-10 pr-3'
                }`}
                required
                autoComplete="email"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-[#1e2a3a] mb-1.5">{t('applicantLogin.password')}</label>
            <div className="relative">
              <Lock className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7a99] ${isRTL ? 'right-3' : 'left-3'}`} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full rounded-lg border border-[#dde3ef] py-2.5 text-sm focus:ring-2 focus:ring-[#2a5298] outline-none ${
                  isRTL ? 'pr-10 pl-3' : 'pl-10 pr-3'
                }`}
                required
                autoComplete="current-password"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-[#1a3a6b] text-white font-bold text-sm hover:bg-[#2a5298] disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
            {t('applicantLogin.submit')}
          </button>
        </form>

        <p className="text-center text-sm text-[#6b7a99] mt-6">
          {t('applicantLogin.noAccount')}{' '}
          <Link to="/register" className="text-[#2a5298] font-bold hover:underline">
            {t('applicantLogin.createAccount')}
          </Link>
        </p>
      </div>
    </div>
  )
}
