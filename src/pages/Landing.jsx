import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../contexts/LanguageContext'
import LanguageToggle from '../components/LanguageToggle'

export default function Landing() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="relative min-h-screen overflow-hidden">
        <div className={`absolute top-6 ${isRTL ? 'left-6' : 'right-6'} z-20`}>
          <LanguageToggle />
        </div>
        {/* Background */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -left-32 h-[520px] w-[520px] rounded-full bg-orange-200/60 blur-3xl" />
          <div className="absolute -bottom-32 -right-32 h-[520px] w-[520px] rounded-full bg-indigo-200/60 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.045]"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%230f172a' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
            }}
          />
        </div>

        <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center px-6 py-16">
          <img src="/assets/IBU Logo.png" alt="IBU Logo" className="h-24 sm:h-28 lg:h-32 w-auto object-contain" />

          <h1 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 text-center">
            {t('landing.title', 'University Portal')}
          </h1>
          <p className="mt-3 max-w-2xl text-center text-base sm:text-lg text-slate-600">
            {t(
              'landing.subtitle',
              'University Management System for learning, admissions, academics, and student services.'
            )}
          </p>

          <div className="mt-10 w-full max-w-xl rounded-3xl bg-white/85 backdrop-blur shadow-xl ring-1 ring-slate-200 p-6 sm:p-7">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <div className="rounded-2xl bg-white/80 ring-1 ring-slate-200 px-4 py-3">
                <div className="text-xs font-extrabold text-slate-500">{t('landing.newAdmissionTitle', 'New admission')}</div>
                <div className="mt-1 text-sm font-extrabold text-slate-900">
                  {t('landing.newAdmissionDesc', 'Create a new applicant account & start your application.')}
                </div>
              </div>
              <div className="rounded-2xl bg-white/80 ring-1 ring-slate-200 px-4 py-3">
                <div className="text-xs font-extrabold text-slate-500">{t('landing.trackStatusTitle', 'Track status')}</div>
                <div className="mt-1 text-sm font-extrabold text-slate-900">
                  {t('landing.trackStatusDesc', 'Sign in to view your application status and updates.')}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Link
                to="/apply"
                className="flex-1 rounded-2xl bg-slate-900 text-white px-5 py-3 text-center font-extrabold shadow-lg shadow-slate-900/10 transition hover:bg-slate-800"
              >
                {t('landing.applyButton', 'Apply for admission')}
              </Link>
              <Link
                to="/portal"
                className="flex-1 rounded-2xl bg-white text-slate-900 px-5 py-3 text-center font-extrabold ring-1 ring-slate-200 shadow-sm transition hover:bg-slate-50"
              >
                {t('landing.portalButton', 'Applicant portal')}
              </Link>
            </div>
          </div>

          <div className="mt-8 text-xs text-slate-500 text-center">
            © {new Date().getFullYear()} {t('landing.footer', 'Imam Bukhari University (IBU). All rights reserved.')}
          </div>
        </div>
      </div>
    </div>
  )
}

