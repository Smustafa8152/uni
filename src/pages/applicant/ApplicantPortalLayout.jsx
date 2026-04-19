import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import {
  LayoutDashboard,
  FilePlus2,
  ListChecks,
  LogOut,
  Home,
  User,
} from 'lucide-react'

const nav = [
  { to: '/portal', end: true, icon: LayoutDashboard, labelKey: 'applicantPortal.nav.dashboard' },
  { to: '/portal/profile', icon: User, labelKey: 'applicantPortal.nav.profile' },
  { to: '/portal/apply', icon: FilePlus2, labelKey: 'applicantPortal.nav.newApplication' },
  { to: '/application-status', end: true, icon: ListChecks, labelKey: 'applicantPortal.nav.trackPublic' },
]

export default function ApplicantPortalLayout() {
  const { t } = useTranslation()
  const { isRTL, language, changeLanguage } = useLanguage()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    const id = 'font-cairo-applicant'
    if (!document.getElementById(id)) {
      const l = document.createElement('link')
      l.id = id
      l.rel = 'stylesheet'
      l.href =
        'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&display=swap'
      document.head.appendChild(l)
    }
  }, [])

  const initials = (user?.email || '?').slice(0, 2).toUpperCase()

  const handleSignOut = async () => {
    await signOut()
    navigate('/register', { replace: true })
  }

  return (
    <div
      className="min-h-screen flex bg-[#f4f6fb] text-[#1e2a3a]"
      dir={isRTL ? 'rtl' : 'ltr'}
      style={{ fontFamily: "'Cairo', system-ui, sans-serif" }}
    >
      <aside
        className={`hidden md:flex w-[260px] shrink-0 bg-[#1a3a6b] text-[#cdd8f0] flex-col fixed top-0 h-screen z-[100] overflow-y-auto ${
          isRTL ? 'right-0' : 'left-0'
        }`}
        aria-label={t('applicantPortal.sidebarNav')}
      >
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
          <img
            src="/assets/IBU Logo.png"
            alt=""
            className="w-11 h-11 object-contain rounded-lg bg-white p-1"
          />
          <div>
            <div className="text-sm font-bold text-white leading-tight">IBU</div>
            <div className="text-[11px] text-[#c8a84b] font-normal">
              {t('applicantPortal.tagline')}
            </div>
          </div>
        </div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-white/35 px-4 pt-4 pb-1">
          {t('applicantPortal.mainMenu')}
        </div>
        <nav className="px-2.5 pb-4">
          <ul className="space-y-0.5">
            {nav.map(({ to, end, icon: Icon, labelKey }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm font-medium transition-colors no-underline ${
                      isActive
                        ? 'bg-[#c8a84b] text-[#1a3a6b] font-bold'
                        : 'text-[#cdd8f0] hover:bg-[#2a5298] hover:text-white'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 shrink-0 opacity-90" />
                  {t(labelKey)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto px-4 py-4 border-t border-white/10 text-xs text-white/40">
          <a href="/" className="text-white/50 hover:text-[#c8a84b] no-underline inline-flex items-center gap-1">
            <Home className="w-3.5 h-3.5" />
            {t('applicantPortal.homeSite')}
          </a>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen w-full min-w-0 md:ms-[260px]">
        <header className="h-16 w-full min-w-0 bg-white border-b border-[#dde3ef] flex items-center justify-between gap-3 px-5 md:px-8 sticky top-0 z-50 shadow-sm">
          <h1 className="text-base md:text-lg font-bold text-[#1a3a6b] truncate min-w-0 flex-1 text-start">
            {t('applicantPortal.topbarTitle')}
          </h1>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <div
              className="inline-flex rounded-lg border border-[#dde3ef] bg-[#f4f6fb] p-0.5 shrink-0"
              role="group"
              aria-label={t('applicantPortal.languageSwitchAria')}
            >
              <button
                type="button"
                onClick={() => changeLanguage('en')}
                className={`px-2 sm:px-2.5 py-1 text-xs sm:text-sm font-semibold rounded-md transition-colors ${
                  language === 'en'
                    ? 'bg-[#1a3a6b] text-white shadow-sm'
                    : 'text-[#6b7a99] hover:bg-white'
                }`}
              >
                {t('applicantPortal.langEnglish')}
              </button>
              <button
                type="button"
                onClick={() => changeLanguage('ar')}
                className={`px-2 sm:px-2.5 py-1 text-xs sm:text-sm font-semibold rounded-md transition-colors ${
                  language === 'ar'
                    ? 'bg-[#1a3a6b] text-white shadow-sm'
                    : 'text-[#6b7a99] hover:bg-white'
                }`}
              >
                {t('applicantPortal.langArabic')}
              </button>
            </div>
            <div className="w-8 h-8 rounded-full bg-[#1a3a6b] text-white flex items-center justify-center text-xs font-bold shrink-0">
              {initials}
            </div>
            <span className="text-sm text-[#6b7a99] max-w-[140px] sm:max-w-[220px] truncate hidden sm:inline">
              {user?.email}
            </span>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-md border border-[#dde3ef] bg-[#f4f6fb] text-[#1e2a3a] hover:bg-[#dde3ef]"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">{t('applicantPortal.signOut')}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 w-full min-w-0 p-5 md:p-8 pb-24 md:pb-8">
          <Outlet context={{ applicantPortal: true }} />
        </main>

        <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-[#dde3ef] flex justify-around py-2 z-50 safe-area-pb">
          <NavLink
            to="/portal"
            end
            className={({ isActive }) =>
              `flex flex-col items-center text-[11px] font-semibold no-underline ${
                isActive ? 'text-[#1a3a6b]' : 'text-[#6b7a99]'
              }`
            }
          >
            <LayoutDashboard className="w-5 h-5 mb-0.5" />
            {t('applicantPortal.nav.dashboard')}
          </NavLink>
          <NavLink
            to="/portal/profile"
            className={({ isActive }) =>
              `flex flex-col items-center text-[11px] font-semibold no-underline ${
                isActive ? 'text-[#1a3a6b]' : 'text-[#6b7a99]'
              }`
            }
          >
            <User className="w-5 h-5 mb-0.5" />
            {t('applicantPortal.nav.profileShort')}
          </NavLink>
          <NavLink
            to="/portal/apply"
            className={({ isActive }) =>
              `flex flex-col items-center text-[11px] font-semibold no-underline ${
                isActive ? 'text-[#1a3a6b]' : 'text-[#6b7a99]'
              }`
            }
          >
            <FilePlus2 className="w-5 h-5 mb-0.5" />
            {t('applicantPortal.nav.applyShort')}
          </NavLink>
          <NavLink
            to="/application-status"
            className={({ isActive }) =>
              `flex flex-col items-center text-[11px] font-semibold no-underline ${
                isActive ? 'text-[#1a3a6b]' : 'text-[#6b7a99]'
              }`
            }
          >
            <ListChecks className="w-5 h-5 mb-0.5" />
            {t('applicantPortal.nav.trackShort')}
          </NavLink>
        </nav>
      </div>
    </div>
  )
}
