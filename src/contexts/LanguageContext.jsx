import { createContext, useContext, useState, useEffect } from 'react'
import i18n from '../i18n'

const defaultLanguageValue = {
  language: typeof localStorage !== 'undefined' ? localStorage.getItem('language') || 'ar' : 'ar',
  isRTL: true,
  changeLanguage: () => {},
}

const LanguageContext = createContext(defaultLanguageValue)

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => localStorage.getItem('language') || 'ar')
  const [isRTL, setIsRTL] = useState(() => (localStorage.getItem('language') || 'ar') === 'ar')

  useEffect(() => {
    i18n.changeLanguage(language)
    setIsRTL(language === 'ar')
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.lang = language
    localStorage.setItem('language', language)
  }, [language])

  const changeLanguage = (lang) => {
    setLanguage(lang)
  }

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, isRTL }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  return useContext(LanguageContext)
}
