import { useId } from 'react'

const frame = 'inline-block h-4 w-6 shrink-0 overflow-hidden rounded-[3px] align-middle ring-1 ring-black/15'

export function FlagEn({ className = '' }) {
  const id = `en-flag-${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 60 30" className={`${frame} ${className}`} aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <rect width="60" height="30" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect width="60" height="30" fill="#012169" />
        <path d="M0 0 L60 30 M60 0 L0 30" stroke="#fff" strokeWidth="6" />
        <path d="M0 0 L60 30 M60 0 L0 30" stroke="#C8102E" strokeWidth="4" />
        <path d="M30 0 V30 M0 15 H60" stroke="#fff" strokeWidth="10" />
        <path d="M30 0 V30 M0 15 H60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  )
}

export function FlagAr({ className = '' }) {
  return (
    <svg viewBox="0 0 60 40" className={`${frame} ${className}`} aria-hidden="true">
      <rect width="60" height="40" fill="#006C35" />
      <text
        x="30"
        y="18"
        textAnchor="middle"
        fill="#fff"
        fontSize="7"
        fontFamily="Cairo, 'Segoe UI', Tahoma, sans-serif"
      >
        لا إله إلا الله
      </text>
      <path d="M10 28 H46 L50 26.6 L46 29.6 Z" fill="#fff" />
    </svg>
  )
}

export function LanguageFlag({ lang, className = '' }) {
  return lang === 'ar' ? <FlagAr className={className} /> : <FlagEn className={className} />
}
