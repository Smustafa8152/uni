import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Award } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import ProgramFeesPanel from '../../components/finance/ProgramFeesPanel'
import { PageHeader } from '../../components/ui'

/** Finance home: programme fees, who has paid, and recording payments. */
export default function Fees() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title={t('fees.title')}
        subtitle={t('fees.subtitle')}
        actions={
          <Link
            to="/finance/scholarships"
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#dde3ef] bg-white px-4 text-sm font-bold text-[#1a3a6b] hover:bg-[#eef2f9]"
          >
            <Award className="h-4 w-4" aria-hidden="true" />
            {t('scholarships.title')}
          </Link>
        }
      />
      <ProgramFeesPanel isArabic={isRTL || language === 'ar'} />
    </div>
  )
}
