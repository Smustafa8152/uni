import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { ChevronDown, Menu, X } from 'lucide-react'

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
      { href: '/student/coming-soon', label: { ar: 'مركز الوثائق', en: 'Document center' }, icon: '📁' },
      { href: '/student/coming-soon', label: { ar: 'التعليقات والحجب', en: 'Holds & blocks' }, icon: '🔒' },
    ],
  },
  {
    label: { ar: 'التسجيل الأكاديمي', en: 'Academic registration' },
    items: [
      { href: '/student/coming-soon', label: { ar: 'دليل المقررات', en: 'Course catalog' }, icon: '📚' },
      { href: '/student/enroll', label: { ar: 'تسجيل المقررات', en: 'Course registration' }, icon: '✏️' },
      { href: '/student/coming-soon', label: { ar: 'قائمة الانتظار', en: 'Waitlist' }, icon: '⏳' },
      { href: '/student/schedule', label: { ar: 'الجدول الدراسي', en: 'Timetable' }, icon: '📅' },
    ],
  },
  {
    label: { ar: 'السجل الأكاديمي', en: 'Academic record' },
    items: [
      { href: '/student/grades', label: { ar: 'الدرجات والنتائج', en: 'Grades & results' }, icon: '📊' },
      { href: '/student/grades', label: { ar: 'السجل الأكاديمي', en: 'Transcript' }, icon: '📜' },
      { href: '/student/graduation-path', label: { ar: 'مسار التخرج', en: 'Degree audit' }, icon: '🎯' },
    ],
  },
  {
    label: { ar: 'الشؤون المالية', en: 'Financial affairs' },
    items: [
      { href: '/student/payments', label: { ar: 'الفواتير والرسوم', en: 'Invoices & fees' }, icon: '🧾' },
      { href: '/student/payments', label: { ar: 'الدفع الإلكتروني', en: 'Online payment' }, icon: '💳' },
      { href: '/student/coming-soon', label: { ar: 'المنح والخصومات', en: 'Scholarships & discounts' }, icon: '🏆' },
    ],
  },
  {
    label: { ar: 'الخدمات الطلابية', en: 'Student services' },
    items: [
      { href: '/student/coming-soon', label: { ar: 'مركز الطلبات', en: 'Requests center' }, icon: '📋' },
      { href: '/student/coming-soon', label: { ar: 'الإرشاد الأكاديمي', en: 'Academic advising' }, icon: '🧑‍🏫' },
    ],
  },
  {
    label: { ar: 'التواصل والدعم', en: 'Support & communication' },
    items: [
      { href: '/student/coming-soon', label: { ar: 'الإشعارات', en: 'Notifications' }, icon: '🔔' },
      { href: '/student/coming-soon', label: { ar: 'الإعلانات', en: 'Announcements' }, icon: '📢' },
      { href: '/student/coming-soon', label: { ar: 'مركز المساعدة', en: 'Help center' }, icon: '❓' },
      { href: '/student/coming-soon', label: { ar: 'البحث', en: 'Search' }, icon: '🔍' },
      { href: '/student/coming-soon', label: { ar: 'سجل النشاط', en: 'Activity log' }, icon: '📜' },
    ],
  },
]

export default function StudentLayout({ children }) {
  const { isRTL, language, changeLanguage } = useLanguage()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [langMenuOpen, setLangMenuOpen] = useState(false)
  const { user, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login/student')
  }

  const pageTitle = useMemo(() => {
    const path = location.pathname
    if (path === '/dashboard') return 'لوحة التحكم'
    if (path.startsWith('/student/profile')) return 'ملفي الشخصي'
    if (path.startsWith('/student/payments')) return 'الفواتير والرسوم'
    if (path.startsWith('/student/enroll')) return 'تسجيل المقررات'
    if (path.startsWith('/student/schedule')) return 'الجدول الدراسي'
    if (path.startsWith('/student/grades')) return 'الدرجات والنتائج'
    if (path.startsWith('/student/graduation-path')) return 'مسار التخرج'
    return 'بوابة الطالب'
  }, [location.pathname])

  const displayName = useMemo(() => user?.email?.split('@')[0] || '—', [user?.email])
  const avatarLetter = useMemo(() => (displayName || 'م').charAt(0).toUpperCase(), [displayName])
  const isArabic = language === 'ar' || isRTL
  const tx = (val) => (typeof val === 'string' ? val : (isArabic ? val?.ar : val?.en) || val?.ar || val?.en || '')

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
        aria-label="القائمة الجانبية"
      >
        <div className="flex flex-col min-h-full">
          <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
            <img src="/assets/IBU Logo.png" alt="شعار جامعة IBU" className="w-11 h-11 object-contain rounded-lg bg-white p-1" />
            <div className="leading-tight">
              <div className="text-white font-extrabold text-sm">جامعة IBU</div>
              <div className="text-xs font-medium" style={{ color: UI.acc }}>بوابة الطالب</div>
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
                    const isActive = location.pathname === item.href || (item.href !== '/dashboard' && location.pathname.startsWith(item.href))
                    return (
                      <li key={`${section.label}-${item.href}-${item.label}`}>
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
              <Link to="/" className="text-white/60 hover:text-white text-xs">
                ⬅ الصفحة الرئيسية
              </Link>
            </div>
            <div className="mt-1">الإصدار 1.0.0</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className={`${isRTL ? 'lg:mr-[270px]' : 'lg:ml-[270px]'} min-h-screen flex flex-col`}>
        {/* Topbar */}
        <header
          className="sticky top-0 z-30 h-16 flex items-center justify-between px-6 shadow-sm border-b"
          style={{ backgroundColor: UI.sur, borderColor: UI.bdr }}
        >
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 rounded-md border" style={{ borderColor: UI.bdr, backgroundColor: UI.bg }}>
              <Menu className="w-5 h-5" style={{ color: UI.p }} />
            </button>
            <div className="text-[17px] font-extrabold" style={{ color: UI.p }}>{pageTitle}</div>
          </div>

          <div className="flex items-center gap-3">
            {/* Language switcher */}
            <div className="relative z-30">
              <button
                type="button"
                onClick={() => setLangMenuOpen((v) => !v)}
                className="h-9 px-3 rounded-full border flex items-center gap-2 text-sm font-semibold"
                style={{ backgroundColor: UI.bg, borderColor: UI.bdr, color: '#1e2a3a' }}
                aria-label="تغيير اللغة"
                title="تغيير اللغة"
              >
                <span>{language === 'ar' ? 'العربية' : 'English'}</span>
                <ChevronDown className="w-4 h-4" style={{ color: UI.muted }} />
              </button>
              {langMenuOpen && (
                <div
                  className={`absolute top-full mt-2 min-w-[140px] rounded-xl border shadow-md overflow-hidden ${
                    isRTL ? 'right-0' : 'left-0'
                  }`}
                  style={{ backgroundColor: UI.sur, borderColor: UI.bdr }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      changeLanguage('ar')
                      setLangMenuOpen(false)
                    }}
                    className={`w-full px-4 py-2.5 text-sm text-right hover:bg-[#f4f6fb] ${
                      language === 'ar' ? 'font-extrabold text-[#1a3a6b]' : 'font-semibold text-[#1e2a3a]'
                    }`}
                  >
                    العربية
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      changeLanguage('en')
                      setLangMenuOpen(false)
                    }}
                    className={`w-full px-4 py-2.5 text-sm text-right hover:bg-[#f4f6fb] ${
                      language === 'en' ? 'font-extrabold text-[#1a3a6b]' : 'font-semibold text-[#1e2a3a]'
                    }`}
                  >
                    English
                  </button>
                </div>
              )}
            </div>

            <Link
              to="/student/coming-soon"
              className="h-9 w-9 rounded-full border flex items-center justify-center text-[16px]"
              style={{ backgroundColor: UI.bg, borderColor: UI.bdr }}
              aria-label="بحث"
              title="بحث"
            >
              🔍
            </Link>
            <Link
              to="/student/coming-soon"
              className="h-9 w-9 rounded-full border flex items-center justify-center text-[16px] relative"
              style={{ backgroundColor: UI.bg, borderColor: UI.bdr }}
              aria-label="الإشعارات"
              title="الإشعارات"
            >
              🔔<span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-600 border-2 border-white" />
            </Link>
            <div className="flex items-center gap-2 text-sm" style={{ color: UI.muted }}>
              <div className="h-9 w-9 rounded-full flex items-center justify-center font-extrabold text-white" style={{ backgroundColor: UI.p }}>
                {avatarLetter}
              </div>
              <span className="font-semibold">{displayName}</span>
              <button
                type="button"
                onClick={handleSignOut}
                className="px-3 py-1.5 rounded-md border text-sm font-semibold"
                style={{ backgroundColor: UI.bg, borderColor: UI.bdr, color: '#1e2a3a' }}
              >
                خروج
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-8 py-7" style={{ backgroundColor: UI.bg }}>
          {children}
        </main>
      </div>
    </div>
  )
}
