import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { FlagImage, defaultCountries, parseCountry, usePhoneInput } from 'react-international-phone'
import 'react-international-phone/style.css'
import { useLanguage } from '../../contexts/LanguageContext'

function countryLabel(iso2, isArabic, fallback) {
  try {
    const name = new Intl.DisplayNames([isArabic ? 'ar' : 'en'], { type: 'region' }).of(iso2.toUpperCase())
    return name || fallback
  } catch {
    return fallback
  }
}

export default function ApplyPhoneInput({ value, onChange, placeholder = '985300360' }) {
  const { language } = useLanguage()
  const isArabic = language === 'ar'
  const rootRef = useRef(null)
  const searchRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const { inputValue, handlePhoneValueChange, inputRef, country, setCountry } = usePhoneInput({
    defaultCountry: 'gm',
    value: value || '',
    disableDialCodeAndPrefix: true,
    disableDialCodePrefill: true,
    disableFormatting: true,
    onChange: (data) => onChange?.(data.phone),
  })

  const countries = useMemo(() => {
    const list = defaultCountries.map((entry) => {
      const parsed = parseCountry(entry)
      const label = countryLabel(parsed.iso2, isArabic, parsed.name)
      return { ...parsed, label }
    })
    const q = query.trim().toLowerCase()
    const filtered = q
      ? list.filter((item) => {
          const dial = `+${item.dialCode}`
          return (
            item.label.toLowerCase().includes(q) ||
            item.name.toLowerCase().includes(q) ||
            item.iso2.toLowerCase().includes(q) ||
            dial.includes(q) ||
            item.dialCode.includes(q.replace(/^\+/, ''))
          )
        })
      : list
    filtered.sort((a, b) => {
      if (!q && a.iso2 === 'gm') return -1
      if (!q && b.iso2 === 'gm') return 1
      return a.label.localeCompare(b.label, isArabic ? 'ar' : 'en', { sensitivity: 'base' })
    })
    return filtered
  }, [isArabic, query])

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(focusTimer)
    }
  }, [open])

  const pickCountry = (iso2) => {
    setCountry(iso2, { focusOnInput: true })
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={rootRef} className="relative" dir="ltr">
      <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80 shadow-sm focus-within:border-[#1a3a6b] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#1a3a6b]/10">
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1.5 border-e border-slate-200 bg-white px-2.5 text-sm font-medium text-slate-800"
          aria-label={isArabic ? 'رمز الدولة' : 'Country code'}
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((current) => !current)}
        >
          <FlagImage iso2={country.iso2} size="20px" className="h-3.5 w-5 rounded-[2px] object-cover" />
          <span className="applicant-latin-digits">+{country.dialCode}</span>
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </button>
        <input
          ref={inputRef}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          name="phone"
          value={inputValue}
          placeholder={placeholder}
          onChange={handlePhoneValueChange}
          className="applicant-latin-digits min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400"
        />
      </div>
      {open && (
        <div
          className="absolute z-30 mt-1 w-full min-w-[17rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
          dir={isArabic ? 'rtl' : 'ltr'}
        >
          <div className="border-b border-slate-100 p-2">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={isArabic ? 'ابحث عن الدولة' : 'Search country'}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-[#1a3a6b]"
            />
          </div>
          <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
            {countries.map((item) => (
              <li key={item.iso2}>
                <button
                  type="button"
                  role="option"
                  aria-selected={item.iso2 === country.iso2}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-start text-sm hover:bg-slate-50 ${
                    item.iso2 === country.iso2 ? 'bg-slate-50 font-medium text-[#1a3a6b]' : 'text-slate-800'
                  }`}
                  onClick={() => pickCountry(item.iso2)}
                >
                  <FlagImage iso2={item.iso2} size="18px" className="h-3.5 w-5 shrink-0 rounded-[2px] object-cover" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className="applicant-latin-digits shrink-0 text-slate-500" dir="ltr">
                    +{item.dialCode}
                  </span>
                </button>
              </li>
            ))}
            {countries.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-400">{isArabic ? 'لا توجد نتائج' : 'No countries found'}</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
