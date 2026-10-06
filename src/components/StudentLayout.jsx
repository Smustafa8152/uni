import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { FlagAr, FlagEn } from './LanguageFlags'
import { ChevronDown, Home, LogOut, Menu, Search, Video, X } from 'lucide-react'
import { getPaymentsEnabled } from '../utils/getPaymentsEnabled'

const UI = {
  p: '#1a3a6b',
  pl: '#2a5298',
  acc: '#c8a84b',
  bg: '#f4f6fb',
  sur: '#ffffff',
  bdr: '#dde3ef',
  muted: '#6b7a99',
}

const NAV = [
  {
    label: { ar: 'الرئيسية', en: 'Main' },
    items: [
      { href: '/dashboard', label: { ar: 'لوحة التحكم', en: 'Dashboard' }, icon: '🏠' },
      { href: '/student/profile', label: { ar: 'ملفي الشخصي', en: 'My profile' }, icon: '👤' },
      { href: '/student/documents', label: { ar: 'مركز الوثائق', en: 'Document center' }, icon: '📁' },
    ],
  },
  {
    label: { ar: 'التسجيل الأكاديمي', en: 'Academic registration' },
    items: [
      { href: '/student/course-catalog', label: { ar: 'دليل المقررات', en: 'Course catalog' }, icon: '📚' },
      { href: '/student/enroll', label: { ar: 'تسجيل المقررات', en: 'Course registration' }, icon: '✏️' },
      { href: '/student/schedule', label: { ar: 'الجدول الدراسي', en: 'Timetable' }, icon: '📅' },
    ],
  },
  {
    label: { ar: 'السجل الأكاديمي', en: 'Academic record' },
    items: [
      { href: '/student/grades', label: { ar: 'الدرجات والنتائج', en: 'Grades & results' }, icon: '📊' },
      { href: '/student/graduation-path', label: { ar: 'مسار التخرج', en: 'Degree audit' }, icon: '🎯' },
    ],
  },
  {
    label: { ar: 'الشؤون المالية', en: 'Financial affairs' },
    items: [
      { href: '/student/payments', label: { ar: 'الفواتير والرسوم', en: 'Invoices & fees' }, icon: '🧾' },
      { href: '/student/payments', label: { ar: 'الدفع الإلكتروني', en: 'Online payment' }, icon: '💳' },
    ],
  },
  {
    label: { ar: 'التواصل والدعم', en: 'Support & communication' },
    items: [
      { href: '/student/messages', label: { ar: 'الرسائل والتحديثات', en: 'Messages' }, icon: '💬' },
    ],
  },
]

export default function StudentLayout({ children }) {
  const { isRTL, language, changeLanguage } = useLanguage()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const { user, signOut, collegeId } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [paymentsEnabled, setPaymentsEnabled] = useState(true)

  useEffect(() => {
    if (!collegeId) return
    getPaymentsEnabled(collegeId).then(setPaymentsEnabled).catch(() => setPaymentsEnabled(true))
  }, [collegeId])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login/student')
  }

  const pageTitleLabel = useMemo(() => {
    const path = location.pathname
    for (const section of NAV) {
      for (const item of section.items) {
        if (path === item.href || (item.href !== '/dashboard' && path.startsWith(item.href))) return item.label
      }
    }
    return { ar: 'بوابة الطالب', en: 'Student portal' }
  }, [location.pathname])

  const displayName = useMemo(() => user?.email?.split('@')[0] || '—', [user?.email])
  const avatarLetter = useMemo(() => (displayName || 'م').charAt(0).toUpperCase(), [displayName])
  const isArabic = language === 'ar' || isRTL
  const tx = (val) => (typeof val === 'string' ? val : (isArabic ? val?.ar : val?.en) || val?.ar || val?.en || '')
  const navSections = useMemo(() => {
    if (paymentsEnabled) return NAV
    return NAV.filter((s) => s?.label?.en !== 'Financial affairs')
  }, [paymentsEnabled])

  return (
    <div className="min-h-screen" style={{ backgroundColor: UI.bg }} dir={isRTL ? 'rtl' : 'ltr'}>
      {sidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      {langMenuOpen && <div className="fixed inset-0 z-20" onClick={() => setLangMenuOpen(false)} />}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 bottom-0 w-[270px] z-50 overflow-y-auto transition-transform duration-300 lg:translate-x-0 ${
          isRTL ? 'right-0' : 'left-0'
        } ${sidebarOpen ? 'translate-x-0' : isRTL ? 'translate-x-full' : '-translate-x-full'}`}
        style={{ backgroundColor: UI.p }}
        aria-label={tx({ ar: 'القائمة الجانبية', en: 'Sidebar' })}
      >
        <div className="flex flex-col min-h-full">
          <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
            <img src="/assets/IBU Logo.png" alt={tx({ ar: 'شعار جامعة IBU', en: 'IBU logo' })} className="w-11 h-11 object-contain rounded-lg bg-white p-1" />
            <div className="leading-tight">
              <div className="text-white font-extrabold text-sm">{tx({ ar: 'جامعة IBU', en: 'IBU University' })}</div>
              <div className="text-xs font-medium" style={{ color: UI.acc }}>{tx({ ar: 'بوابة الطالب', en: 'Student portal' })}</div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="lg:hidden ms-auto text-white/70 hover:text-white">
              <X className="w-6 h-6" />
            </button>
          </div>

          <nav className="px-2 py-3 flex-1">
            {navSections.map((section) => (
              <div key={tx(section.label)} className="mb-3">
                <div className="px-3 pt-3 pb-1 text-[11px] font-bold text-white/45">{tx(section.label)}</div>
                <ul className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = location.pathname === item.href || (item.href !== '/dashboard' && location.pathname.startsWith(item.href))
                    return (
                      <li key={`${item.href}-${tx(item.label)}`}>
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
            <div>
              <Link to="/" className="inline-flex items-center gap-1.5 text-white/60 hover:text-white text-xs">
                <Home className="h-3.5 w-3.5" aria-hidden="true" />
                {tx({ ar: 'الصفحة الرئيسية', en: 'Home page' })}
              </Link>
            </div>
            <div className="mt-1">{tx({ ar: 'الإصدار 1.0.0', en: 'Version 1.0.0' })}</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className={`${isRTL ? 'lg:mr-[270px]' : 'lg:ml-[270px]'} min-h-screen flex flex-col`}>
        {/* Topbar */}
        <header
          className="sticky top-0 z-30 h-16 flex items-center justify-between gap-3 px-3 sm:px-6 shadow-sm border-b"
          style={{ backgroundColor: UI.sur, borderColor: UI.bdr }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-md border" style={{ borderColor: UI.bdr, backgroundColor: UI.bg }}>
              <Menu className="w-5 h-5" style={{ color: UI.p }} />
            </button>
            <div className="truncate text-[17px] font-extrabold" style={{ color: UI.p }}>{tx(pageTitleLabel)}</div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* Language switcher */}
            <div className="relative z-30">
              <button
                type="button"
                onClick={() => setLangMenuOpen((v) => !v)}
                className="h-9 px-2.5 sm:px-3 rounded-full border flex items-center gap-1.5 sm:gap-2 text-sm font-semibold"
                style={{ backgroundColor: UI.bg, borderColor: UI.bdr, color: '#1e2a3a' }}
                aria-label={tx({ ar: 'تغيير اللغة', en: 'Change language' })}
                title={tx({ ar: 'تغيير اللغة', en: 'Change language' })}
              >
                {language === 'ar' ? <FlagAr /> : <FlagEn />}
                <span className="hidden sm:inline">{language === 'ar' ? 'العربية' : 'English'}</span>
                <ChevronDown className="w-4 h-4" style={{ color: UI.muted }} />
              </button>
              {langMenuOpen && (
                <div
                  className="absolute end-0 top-full mt-2 min-w-[140px] rounded-xl border shadow-md overflow-hidden"
                  style={{ backgroundColor: UI.sur, borderColor: UI.bdr }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      changeLanguage('ar')
                      setLangMenuOpen(false)
                    }}
                    className={`inline-flex w-full items-center justify-end gap-2 px-4 py-2.5 text-sm text-right hover:bg-[#f4f6fb] ${
                      language === 'ar' ? 'font-extrabold text-[#1a3a6b]' : 'font-semibold text-[#1e2a3a]'
                    }`}
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
                    className={`w-full px-4 py-2.5 text-sm text-right hover:bg-[#f4f6fb] inline-flex items-center justify-end gap-2 ${
                      language === 'en' ? 'font-extrabold text-[#1a3a6b]' : 'font-semibold text-[#1e2a3a]'
                    }`}
                  >
                    <FlagEn />
                    English
                  </button>
                </div>
              )}
            </div>

            <Link
              to="/student/elearning/sessions"
              className="h-9 px-3 rounded-full border flex items-center gap-2 text-sm font-semibold"
              style={{ backgroundColor: UI.bg, borderColor: UI.bdr, color: UI.p }}
              aria-label={tx({ ar: 'بوابة التعلم الإلكتروني', en: 'e-Learning portal' })}
              title={tx({ ar: 'بوابة التعلم الإلكتروني', en: 'e-Learning portal' })}
            >
              <Video className="h-4 w-4" aria-hidden="true" />
              <span className="hidden md:inline">{isArabic ? 'التعلم الإلكتروني' : 'e‑Learning'}</span>
            </Link>

            <Link
              to="/student/course-catalog"
              className="hidden h-9 w-9 rounded-full border sm:flex items-center justify-center"
              style={{ backgroundColor: UI.bg, borderColor: UI.bdr }}
              aria-label={tx({ ar: 'دليل المقررات', en: 'Course catalog' })}
              title={tx({ ar: 'دليل المقررات', en: 'Course catalog' })}
            >
              <Search className="h-4 w-4" style={{ color: UI.p }} aria-hidden="true" />
            </Link>
            <div className="flex items-center gap-2 text-sm" style={{ color: UI.muted }}>
              <div className="hidden h-9 w-9 rounded-full sm:flex items-center justify-center font-extrabold text-white" style={{ backgroundColor: UI.p }}>
                {avatarLetter}
              </div>
              <span className="hidden font-semibold lg:inline">{displayName}</span>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold"
                style={{ backgroundColor: UI.bg, borderColor: UI.bdr, color: '#1e2a3a' }}
                aria-label={tx({ ar: 'تسجيل الخروج', en: 'Sign out' })}
                title={tx({ ar: 'تسجيل الخروج', en: 'Sign out' })}
              >
                <LogOut className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
                <span className="hidden sm:inline">{tx({ ar: 'خروج', en: 'Sign out' })}</span>
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-4 py-5 sm:px-8 sm:py-7" style={{ backgroundColor: UI.bg }}>
          {children}
        </main>
      </div>
    </div>
  )
}
