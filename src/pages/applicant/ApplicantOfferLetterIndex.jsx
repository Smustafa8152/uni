import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { Loader2 } from 'lucide-react'

export default function ApplicantOfferLetterIndex() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!user?.id || !user?.email) {
        setLoading(false)
        return
      }
      setLoading(true)
      setError('')
      try {
        const em = user.email.trim()
        const { data, error: qErr } = await supabase
          .from('applications')
          .select('id, status_code, created_at, applicant_user_id, email')
          .or(`applicant_user_id.eq.${user.id},email.eq.${em}`)
          .in('status_code', ['DCCA', 'DCFA'])
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (qErr) throw qErr
        if (!data?.id) {
          throw new Error(t('offerLetter.noneFound', 'No offer letter available yet.'))
        }
        navigate(`/portal/applications/${data.id}/offer-letter`, { replace: true })
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Failed to load offer letter')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [user?.id, user?.email, navigate, t])

  if (loading) {
    return (
      <div className="py-16 flex justify-center" dir={isRTL ? 'rtl' : 'ltr'}>
        <Loader2 className="w-10 h-10 text-[#1a3a6b] animate-spin" />
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto w-full min-w-0" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-950 px-4 py-3 text-sm">
        {error || t('offerLetter.noneFound', 'No offer letter available yet.')}
      </div>
    </div>
  )
}

