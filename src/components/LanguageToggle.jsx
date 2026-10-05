import { useLanguage } from '../contexts/LanguageContext'
import { FlagAr, FlagEn } from './LanguageFlags'

export default function LanguageToggle({ className = '' }) {
  const { language, changeLanguage } = useLanguage()
  const isAr = language === 'ar'

  return (
    <button
      type="button"
      onClick={() => changeLanguage(isAr ? 'en' : 'ar')}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-white/80 px-3 py-2 text-sm font-extrabold text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur hover:bg-white transition ${className}`}
      aria-label={isAr ? 'Switch language to English' : 'تغيير اللغة إلى العربية'}
    >
      {isAr ? <FlagEn /> : <FlagAr />}
      {isAr ? 'English' : 'العربية'}
    </button>
  )
}

