import { CheckCircle2, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function SectionVerifyButton({ verified, busy, onClick }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`ms-auto inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-60 ${
        verified
          ? 'bg-emerald-100 text-emerald-800'
          : 'border border-[#1a3a6b] bg-white text-[#1a3a6b] hover:bg-[#eef2f9]'
      }`}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : verified ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
      {verified
        ? t('admissions.viewApplication.detail.verified', 'Verified')
        : t('admissions.viewApplication.detail.verify', 'Verify')}
    </button>
  )
}
