import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Award, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { PLAN_SELECT, PLAN_SELECT_LEGACY, formatMoney, installmentAmount, isCreditHourPlan, isMissingFeeMigration, planParts } from '../../utils/programFees'

/**
 * What the chosen programme will cost, shown to the applicant before they join: the total, what one semester
 * costs, and where their scholarship request stands.
 */
export default function ProgrammeFeesCard({ applicationId, majorId, className = '' }) {
  const { t } = useTranslation()
  const [plan, setPlan] = useState(null)
  const [scholarship, setScholarship] = useState(null)

  useEffect(() => {
    if (!majorId) return undefined
    let cancelled = false
    ;(async () => {
      let res = await supabase.from('program_fee_plans').select(PLAN_SELECT).eq('major_id', majorId).eq('is_active', true).maybeSingle()
      if (res.error && isMissingFeeMigration(res.error)) {
        res = await supabase.from('program_fee_plans').select(PLAN_SELECT_LEGACY).eq('major_id', majorId).eq('is_active', true).maybeSingle()
      }
      if (!cancelled) setPlan(res.data || null)
      if (applicationId) {
        const s = await supabase.from('applications').select('scholarship_status, scholarship_percentage').eq('id', applicationId).maybeSingle()
        if (!cancelled && !s.error) setScholarship(s.data || null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [majorId, applicationId])

  if (!plan) return null
  const currency = plan.currency || 'GMD'
  const { total, feesPerSemester, n } = planParts(plan)
  const creditHours = isCreditHourPlan(plan)
  const status = scholarship?.scholarship_status

  return (
    <section className={`rounded-2xl border border-[#dde3ef] bg-white p-5 ${className}`}>
      <div className="flex items-center gap-2 text-sm font-extrabold text-[#1a3a6b]">
        <Wallet className="h-4 w-4" aria-hidden="true" />
        {t('applicantFees.title')}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-[#eef2f9] px-3 py-2.5">
          <div className="text-xs text-slate-600">{t('applicantFees.total')}</div>
          <div className="text-lg font-extrabold text-[#1a3a6b]" dir="ltr" style={{ textAlign: 'start' }}>
            {formatMoney(total, currency)}
          </div>
        </div>
        <div className="rounded-xl bg-[#f4f6fb] px-3 py-2.5">
          <div className="text-xs text-slate-600">{creditHours ? t('applicantFees.perHour') : t('applicantFees.perSemester', { count: n })}</div>
          <div className="text-lg font-extrabold text-slate-900" dir="ltr" style={{ textAlign: 'start' }}>
            {formatMoney(creditHours ? plan.credit_hour_rate : installmentAmount(plan), currency)}
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-600">
        {creditHours ? t('applicantFees.creditHoursHint', { fees: formatMoney(feesPerSemester, currency) }) : t('applicantFees.installmentHint', { count: n })}
      </p>
      {status && status !== 'none' && (
        <p
          className={`mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ${
            status === 'approved' ? 'bg-emerald-50 text-emerald-800' : status === 'declined' ? 'bg-slate-50 text-slate-600' : 'bg-amber-50 text-amber-900'
          }`}
        >
          <Award className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t(`applicantFees.scholarship.${status}`, { percent: Number(scholarship?.scholarship_percentage) || 0 })}
        </p>
      )}
    </section>
  )
}
