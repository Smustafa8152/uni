import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, Menu, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { FlagAr, FlagEn } from './LanguageFlags'

const UI = {
  p: '#1a3a6b',
  pl: '#2a5298',
  acc: '#c8a84b',
  bg: '#f4f6fb',
  sur: '#ffffff',
  bdr: '#dde3ef',
  muted: '#6b7a99',
  teams: '#6264a7',
}

const NAV = [
  {
    label: { ar: 'التعلم الإلكتروني', en: 'e‑Learning' },
    items: [
      { href: '/student/elearning/sessions', label: { ar: 'جلسات Teams', en: 'Teams sessions' }, icon: '📹' },
      { href: '/student/elearning/sessions/history', label: { ar: 'التسجيلات السابقة', en: 'Recordings' }, icon: '📼' },
      { href: '/student/elearning/courseware', label: { ar: 'محتوى المقررات', en: 'Courseware' }, icon: '📖' },
      { href: '/student/elearning/exams', label: { ar: 'الاختبارات', en: 'Exams' }, icon: '📋' },
      { href: '/student/elearning/study-planner', label: { ar: 'مخطط الدراسة', en: 'Study planner' }, icon: '📅' },
      { href: '/student/elearning/elibrary', label: { ar: 'المكتبة الإلكترونية', en: 'e‑Library' }, icon: '📚' },
      { href: '/student/elearning/progress', label: { ar: 'تقدمي الدراسي', en: 'Progress' }, icon: '📈' },
    ],
  },
]

export default function StudentELearningLayout({ children }) {
  const { isRTL, language, changeLanguage } = useLanguage()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const { user, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const isArabic = language === 'ar' || isRTL
  const tx = (val) => (typeof val === 'string' ? val : (isArabic ? val?.ar : val?.en) || val?.ar || val?.en || '')

  const displayName = useMemo(() => user?.email?.split('@')[0] || '—', [user?.email])
  const avatarLetter = useMemo(() => (displayName || 'م').charAt(0).toUpperCase(), [displayName])

  const pageTitle = useMemo(() => {
    const path = location.pathname
    if (path.startsWith('/student/elearning/sessions/history')) return isArabic ? 'التسجيلات السابقة' : 'Recordings'
    if (path.startsWith('/student/elearning/sessions')) return isArabic ? 'جلسات Teams' : 'Teams sessions'
    if (path.startsWith('/student/elearning/courseware')) return isArabic ? 'محتوى المقررات' : 'Courseware'
    if (path.startsWith('/student/elearning/exams')) return isArabic ? 'الاختبارات' : 'Exams'
    return isArabic ? 'التعلم الإلكتروني' : 'e‑Learning'
  }, [location.pathname, isArabic])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login/student')
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: UI.bg }} dir={isRTL ? 'rtl' : 'ltr'}>
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      {langMenuOpen && <div className="fixed inset-0 z-20" onClick={() => setLangMenuOpen(false)} />}

      <aside
        className={`fixed top-0 bottom-0 w-[270px] z-50 overflow-y-auto transition-transform duration-300 lg:translate-x-0 ${
          isRTL ? 'right-0' : 'left-0'
        } ${sidebarOpen ? 'translate-x-0' : isRTL ? 'translate-x-full' : '-translate-x-full'}`}
        style={{ backgroundColor: UI.p }}
        aria-label="eLearning sidebar"
      >
        <div className="flex flex-col min-h-full">
          <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
            <img src="/assets/IBU Logo.png" alt="IBU" className="w-11 h-11 object-contain rounded-lg bg-white p-1" />
            <div className="leading-tight">
              <div className="text-white font-extrabold text-sm">جامعة IBU</div>
              <div className="text-xs font-medium" style={{ color: UI.acc }}>
                {isArabic ? 'بوابة التعلم الإلكتروني' : 'e‑Learning portal'}
              </div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden ml-auto text-white/70 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>

          <nav className="px-2 py-3 flex-1">
            {NAV.map((section) => (
              <div key={tx(section.label)} className="mb-3">
                <div className="px-3 pt-3 pb-1 text-[10px] font-extrabold tracking-wider uppercase text-white/35">{tx(section.label)}</div>
                <ul className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = location.pathname === item.href || location.pathname.startsWith(item.href)
                    return (
                      <li key={`${item.href}`}>
                        <Link
                          to={item.href}
                          onClick={() => setSidebarOpen(false)}
                          aria-current={isActive ? 'page' : undefined}
                          className={`flex items-center gap-2 px-3 py-2 rounded-md text-[13.5px] font-semibold transition-colors ${
                            isActive ? 'bg-[#c8a84b] text-[#1a3a6b]' : 'text-[#cdd8f0] hover:bg-[#2a5298] hover:text-white'
                          }`}
                        >
                          <span className="w-5 text-center text-[15px]">{item.icon}</span>
                          <span>{tx(item.label)}</span>
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="mt-auto px-4 py-4 border-t border-white/10 text-white/45 text-xs">
            <Link to="/dashboard" className="text-white/70 hover:text-white text-xs">
              ⬅ {isArabic ? 'العودة لبوابة الطالب' : 'Back to Student portal'}
            </Link>
            <div className="mt-1">الإصدار 1.0.0</div>
          </div>
        </div>
      </aside>

      <div className={`${isRTL ? 'lg:mr-[270px]' : 'lg:ml-[270px]'} min-h-screen flex flex-col`}>
        <header className="sticky top-0 z-30 h-16 flex items-center justify-between px-6 shadow-sm border-b" style={{ backgroundColor: UI.sur, borderColor: UI.bdr }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-md border" style={{ borderColor: UI.bdr, backgroundColor: UI.bg }}>
              <Menu className="w-5 h-5" style={{ color: UI.p }} />
            </button>
            <div className="text-[17px] font-extrabold" style={{ color: UI.p }}>{pageTitle}</div>
            <span className="hidden sm:inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold" style={{ backgroundColor: '#e8e8f5', color: UI.teams }}>
              Microsoft Teams
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative z-30">
              <button
                type="button"
                onClick={() => setLangMenuOpen((v) => !v)}
                className="h-9 px-3 rounded-full border flex items-center gap-2 text-sm font-semibold"
                style={{ backgroundColor: UI.bg, borderColor: UI.bdr, color: '#1e2a3a' }}
              >
                {language === 'ar' ? <FlagAr /> : <FlagEn />}
                <span>{language === 'ar' ? 'العربية' : 'English'}</span>
                <ChevronDown className="w-4 h-4" style={{ color: UI.muted }} />
              </button>
              {langMenuOpen && (
                <div
                  className={`absolute top-full mt-2 min-w-[140px] rounded-xl border shadow-md overflow-hidden ${isRTL ? 'right-0' : 'left-0'}`}
                  style={{ backgroundColor: UI.sur, borderColor: UI.bdr }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      changeLanguage('ar')
                      setLangMenuOpen(false)
                    }}
                    className={`inline-flex w-full items-center justify-end gap-2 px-4 py-2.5 text-sm text-right hover:bg-[#f4f6fb] ${language === 'ar' ? 'font-extrabold text-[#1a3a6b]' : 'font-semibold text-[#1e2a3a]'}`}
                  >
                    <FlagAr />
                    العربية
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      changeLanguage('en')
                      setLangMenuOpen(false)
                    }}
                    className={`w-full px-4 py-2.5 text-sm text-right hover:bg-[#f4f6fb] inline-flex items-center justify-end gap-2 ${language === 'en' ? 'font-extrabold text-[#1a3a6b]' : 'font-semibold text-[#1e2a3a]'}`}
                  >
                    <FlagEn />
                    English
                  </button>
                </div>
              )}
            </div>

            <Link
              to="/dashboard"
              className="h-9 px-3 rounded-full border flex items-center gap-2 text-sm font-semibold"
              style={{ backgroundColor: UI.bg, borderColor: UI.bdr, color: UI.p }}
              title={isArabic ? 'العودة لبوابة الطالب' : 'Back to Student portal'}
            >
              ⬅ {isArabic ? 'بوابة الطالب' : 'Student portal'}
            </Link>

            <div className="flex items-center gap-2 text-sm" style={{ color: UI.muted }}>
              <div className="h-9 w-9 rounded-full flex items-center justify-center font-extrabold text-white" style={{ backgroundColor: UI.p }}>
                {avatarLetter}
              </div>
              <span className="font-semibold hidden sm:inline">{displayName}</span>
              <button
                type="button"
                onClick={handleSignOut}
                className="px-3 py-1.5 rounded-md border text-sm font-semibold"
                style={{ backgroundColor: UI.bg, borderColor: UI.bdr, color: '#1e2a3a' }}
              >
                {isArabic ? 'خروج' : 'Sign out'}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-8 py-7" style={{ backgroundColor: UI.bg }}>
          {children}
        </main>
      </div>
    </div>
  )
}

