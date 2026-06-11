import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { getActiveInstructorByEmail } from '../utils/getActiveInstructorByEmail'
import { formatInstructorDisplayName } from '../utils/academicTitle'
import { ChevronDown } from 'lucide-react'
import '../styles/instructor-portal.css'

const instructorNavigation = [
  { translationKey: 'instructorPortal.dashboard', href: '/instructor/dashboard', icon: '🏠' },
  { translationKey: 'instructorPortal.myCourses', href: '/instructor/courses', icon: '📚' },
  { translationKey: 'instructorPortal.curriculumMap', href: '/instructor/curriculum-map', icon: '🗺️' },
  { translationKey: 'instructorPortal.navLessonContent', href: '/instructor/build-lessons', icon: '✏️' },
  { translationKey: 'instructorPortal.contentRelease', href: '/instructor/content-release', icon: '📅' },
  { translationKey: 'instructorPortal.questionBank', href: '/instructor/question-bank', icon: '🗃️' },
  { translationKey: 'instructorPortal.createAssessments', href: '/instructor/assessments', icon: '📝' },
  { translationKey: 'instructorPortal.gradebook', href: '/instructor/gradebook', icon: '📊' },
  { translationKey: 'instructorPortal.analyticsAndEngagement', href: '/instructor/analytics', icon: '📈' },
  { translationKey: 'instructorPortal.communicationNav', href: '/instructor/communication', icon: '💬' },
  { translationKey: 'instructorPortal.integrityCasesNav', href: '/instructor/integrity-cases', icon: '⚖️' },
  { translationKey: 'instructorPortal.workloadNav', href: '/instructor/workload', icon: '📋' },
  { translationKey: 'instructorPortal.reportsNav', href: '/instructor/reports', icon: '📑' },
]

export default function InstructorLayout({ children }) {
  const { t } = useTranslation()
  const { isRTL, language, changeLanguage } = useLanguage()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [langDropdownOpen, setLangDropdownOpen] = useState(false)
  const langDropdownRef = useRef(null)
  const { user, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [instructorProfile, setInstructorProfile] = useState(null)

  useEffect(() => {
    if (!user?.email) {
      setInstructorProfile(null)
      return
    }
    let cancelled = false
    getActiveInstructorByEmail(user.email).then((data) => {
      if (!cancelled) setInstructorProfile(data)
    })
    return () => {
      cancelled = true
    }
  }, [user?.email])

  const handleLogout = async () => {
    await signOut?.()
    navigate('/login/instructor', { replace: true })
  }

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target)) setLangDropdownOpen(false)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  const handleLanguageSelect = (lang) => {
    changeLanguage(lang)
    setLangDropdownOpen(false)
  }

  const getPageTitle = () => {
    const path = location.pathname
    if (path === '/instructor/communication') {
      return t('instructorPortal.communicationPageTopbarTitle')
    }
    if (path === '/instructor/exam-settings') {
      return t('instructorPortal.examSettingsPageTopbarTitle')
    }
    if (path === '/instructor/integrity-cases') {
      return t('instructorPortal.integrityCasesPageTopbarTitle')
    }
    if (path === '/instructor/workload') {
      return t('instructorPortal.workloadPageTitle')
    }
    if (path === '/instructor/reports') {
      return t('instructorPortal.reportsPageTitle')
    }
    const current = instructorNavigation.find((n) => path === n.href || (n.href !== '/instructor/dashboard' && path.startsWith(n.href)))
    return current ? t(current.translationKey) : t('instructorPortal.dashboard')
  }

  const displayName = instructorProfile
    ? formatInstructorDisplayName(instructorProfile, language === 'ar')
    : user?.email?.split('@')[0] || t('instructorPortal.instructor')
  const avatarInitials = displayName.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?'

  return (
    <div className="instructor-portal" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="shell">
        {sidebarOpen && (
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} aria-hidden />
        )}

        <aside
          className={`sb ${sidebarOpen ? 'sidebar-open' : ''}`}
          role="navigation"
          aria-label={t('instructorPortal.sidebarAriaLabel')}
          style={{ width: 'var(--sw)' }}
        >
          <div className="sb-logo">
            <img src="/assets/IBU Logo.png" alt="IBU" width={44} height={44} onError={(e) => { e.target.style.display = 'none' }} />
            <div className="sb-logo-t">
              {t('instructorPortal.instructorPortalAr')}
              <small>{t('instructorPortal.instructorPortal')}</small>
            </div>
          </div>
          <div className="sb-sec">{t('instructorPortal.mainNavigation')}</div>
          <nav>
            <ul>
              {instructorNavigation.map((item) => {
                const isActive = location.pathname === item.href || (item.href !== '/instructor/dashboard' && location.pathname.startsWith(item.href))
                return (
                  <li key={item.href}>
                    <Link
                      to={item.href}
                      onClick={() => setSidebarOpen(false)}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <span className="ic" aria-hidden>{item.icon}</span>
                      {t(item.translationKey)}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
          <div className="sb-foot">{t('instructorPortal.footer')}</div>
        </aside>

        <div className="main">
          <header className="topbar" role="banner">
            <button
              type="button"
              className="lg:hidden btn btn-gh btn-sm"
              onClick={() => setSidebarOpen(true)}
              aria-label={t('instructorPortal.openMenu')}
            >
              ☰
            </button>
            <div className="topbar-title">{getPageTitle()}</div>
            <div className="topbar-acts">
              <div className="topbar-lang-dropdown" ref={langDropdownRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="btn btn-gh btn-sm"
                  onClick={(e) => { e.stopPropagation(); setLangDropdownOpen((o) => !o) }}
                  aria-haspopup="listbox"
                  aria-expanded={langDropdownOpen}
                  aria-label={language === 'ar' ? 'Language: Arabic' : 'Language: English'}
                >
                  {language === 'ar' ? 'العربية' : 'English'}
                  <ChevronDown className={langDropdownOpen ? 'topbar-lang-chevron-open' : ''} style={{ width: 16, height: 16, marginRight: 4 }} />
                </button>
                {langDropdownOpen && (
                  <div
                    className="topbar-lang-menu"
                    role="listbox"
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: 4,
                      minWidth: 140,
                      background: 'var(--sur)',
                      border: '1px solid var(--bdr)',
                      borderRadius: 'var(--rs)',
                      boxShadow: 'var(--shm)',
                      zIndex: 1000,
                      overflow: 'hidden',
                    }}
                  >
                    <button
                      type="button"
                      role="option"
                      aria-selected={language === 'ar'}
                      className="topbar-lang-option"
                      onClick={() => handleLanguageSelect('ar')}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '10px 14px',
                        textAlign: 'right',
                        border: 'none',
                        background: language === 'ar' ? 'var(--ok-bg)' : 'transparent',
                        color: language === 'ar' ? 'var(--ok)' : 'var(--txt)',
                        fontFamily: 'var(--font)',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      العربية
                    </button>
                    <button
                      type="button"
                      role="option"
                      aria-selected={language === 'en'}
                      className="topbar-lang-option"
                      onClick={() => handleLanguageSelect('en')}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: '10px 14px',
                        textAlign: 'right',
                        border: 'none',
                        background: language === 'en' ? 'var(--ok-bg)' : 'transparent',
                        color: language === 'en' ? 'var(--ok)' : 'var(--txt)',
                        fontFamily: 'var(--font)',
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      English
                    </button>
                  </div>
                )}
              </div>
              <Link to="/instructor/communication" className="btn btn-gh btn-sm" aria-label={t('instructorPortal.messages')}>
                ✉️ {t('instructorPortal.messages')}
              </Link>
              <Link to="/instructor/notifications" className="btn btn-gh btn-sm" aria-label={t('instructorPortal.notifications')} style={{ position: 'relative' }}>
                🔔
                <span
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    background: 'var(--err)',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 700,
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  3
                </span>
              </Link>
              <div className="topbar-user" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="avatar" aria-hidden>{avatarInitials}</div>
                <span>{displayName}</span>
                <button
                  type="button"
                  className="btn btn-gh btn-sm"
                  onClick={handleLogout}
                  aria-label={t('instructorPortal.logout')}
                >
                  {t('instructorPortal.logout')}
                </button>
              </div>
            </div>
          </header>

          <div className="body">{children}</div>
        </div>
      </div>
    </div>
  )
}
