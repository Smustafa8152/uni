import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'

/** Instructor ↔ students communication — matches portal reference (announcements, DM, inbox). */
export default function InstructorCommunication({ embedded = false, embedClassId = null } = {}) {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const classId = useMemo(() => {
    if (embedded && embedClassId != null && embedClassId !== '' && embedClassId !== 0) {
      const n = Number(embedClassId)
      return Number.isNaN(n) ? null : n
    }
    const p = searchParams.get('classId')
    return p ? Number(p) : null
  }, [embedded, embedClassId, searchParams])

  const [loading, setLoading] = useState(() => {
    if (embedded) return !!embedClassId
    return !!searchParams.get('classId')
  })
  const [classRow, setClassRow] = useState(null)

  useEffect(() => {
    if (!user?.email || !classId || Number.isNaN(classId)) {
      setLoading(false)
      setClassRow(null)
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const instructor = await getActiveInstructorByEmail(user.email)

        if (!instructor || cancelled) {
          setClassRow(null)
          return
        }

        const { data: cls, error } = await supabase
          .from('classes')
          .select(`id, subject_id, subjects ( id, code, name_en, name_ar )`)
          .eq('id', classId)
          .eq('instructor_id', instructor.id)
          .maybeSingle()

        if (error || !cls || cancelled) {
          setClassRow(null)
          return
        }
        setClassRow(cls)
      } catch {
        if (!cancelled) setClassRow(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user?.email, classId])

  const subjectCode = classRow?.subjects?.code || 'ENG101'
  const subjectId = classRow?.subject_id
  const crumbHref = subjectId ? `/instructor/subjects/${subjectId}` : '/instructor/courses'

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <div
          style={{
            width: 40,
            height: 40,
            border: '3px solid var(--bdr)',
            borderTopColor: 'var(--p)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      </div>
    )
  }

  if (embedded && (!classId || Number.isNaN(classId))) {
    return (
      <div className="alert alert-info">{t('instructorPortal.analyticsPickClass')}</div>
    )
  }

  const inboxBorder = isRTL ? { borderRight: '3px solid var(--info)' } : { borderLeft: '3px solid var(--info)' }

  return (
    <>
      {!embedded && (
        <>
          <nav className="bc" aria-label={t('instructorPortal.breadcrumbMain')}>
            <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
            <span className="bc-sep">›</span>
            <Link to={crumbHref}>{subjectCode}</Link>
            <span className="bc-sep">›</span>
            <span>{t('instructorPortal.communicationBreadcrumb')}</span>
          </nav>

          <div className="ph">
            <div>
              <h1>{t('instructorPortal.communicationPageTitle')}</h1>
              <p className="ph-sub">{t('instructorPortal.communicationPageSubtitle', { code: subjectCode })}</p>
            </div>
            <div className="ph-acts">
              <button type="button" className="btn btn-p">
                {t('instructorPortal.communicationNewMessage')}
              </button>
            </div>
          </div>
        </>
      )}

      <div className="grid2">
        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">📢 {t('instructorPortal.commCardAnnounceTitle')}</div>
            </div>
            <div className="fg">
              <label className="fl">
                <span className="req">*</span>
                {t('instructorPortal.commAnnTitleLabel')}
              </label>
              <input type="text" className="fc" placeholder={t('instructorPortal.commAnnTitlePlaceholder')} data-field="announcement_title" />
            </div>
            <div className="fg">
              <label className="fl">{t('instructorPortal.commAnnBodyLabel')}</label>
              <textarea className="fc" rows={4} data-field="announcement_body" placeholder={t('instructorPortal.commAnnBodyPlaceholder')} />
            </div>
            <div className="fr">
              <div className="fg">
                <label className="fl">{t('instructorPortal.commTargetLabel')}</label>
                <select className="fc" data-field="target_audience">
                  <option>{t('instructorPortal.commTargetAll')}</option>
                  <option>{t('instructorPortal.commTargetAtRisk')}</option>
                  <option>{t('instructorPortal.commTargetNoHw')}</option>
                  <option>{t('instructorPortal.commTargetSpecific')}</option>
                </select>
              </div>
              <div className="fg">
                <label className="fl">{t('instructorPortal.commDeliveryLabel')}</label>
                <select className="fc" data-field="delivery_channel" defaultValue="both">
                  <option value="portal">{t('instructorPortal.commDeliveryPortal')}</option>
                  <option value="both">{t('instructorPortal.commDeliveryBoth')}</option>
                  <option value="email">{t('instructorPortal.commDeliveryEmail')}</option>
                </select>
              </div>
            </div>
            <button type="button" className="btn btn-p btn-bl">
              📢 {t('instructorPortal.commPublishBtn')}
            </button>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">📧 {t('instructorPortal.commPrivateTitle')}</div>
            </div>
            <div className="fg">
              <label className="fl">{t('instructorPortal.commPrivateTo')}</label>
              <input type="text" className="fc" placeholder={t('instructorPortal.commPrivateToPlaceholder')} data-field="recipient_name" />
            </div>
            <div className="fg">
              <label className="fl">{t('instructorPortal.commPrivateSubject')}</label>
              <input type="text" className="fc" placeholder={t('instructorPortal.commPrivateSubjectPlaceholder')} data-field="message_subject" />
            </div>
            <div className="fg">
              <label className="fl">{t('instructorPortal.commPrivateBody')}</label>
              <textarea className="fc" rows={4} data-field="message_body" placeholder={t('instructorPortal.commPrivateBodyPlaceholder')} />
            </div>
            <button type="button" className="btn btn-p btn-bl">
              📧 {t('instructorPortal.commSendBtn')}
            </button>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">📋 {t('instructorPortal.commPrevTitle')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--rs)', padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }} data-field="announcement_title">
                    {t('instructorPortal.commPrev1Title')}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }} data-field="sent_date">
                    {t('instructorPortal.commPrev1Date')}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }} data-field="announcement_preview">
                  {t('instructorPortal.commPrev1Preview')}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ok)', marginTop: 6 }}>{t('instructorPortal.commPrev1Stats')}</div>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--rs)', padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }} data-field="announcement_title">
                    {t('instructorPortal.commPrev2Title')}
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }} data-field="sent_date">
                    {t('instructorPortal.commPrev2Date')}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('instructorPortal.commPrev2Preview')}</div>
                <div style={{ fontSize: 11, color: 'var(--ok)', marginTop: 6 }}>{t('instructorPortal.commPrev2Stats')}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">💬 {t('instructorPortal.commInboxTitle')}</div>
              <span
                style={{
                  fontSize: 12,
                  background: 'var(--err)',
                  color: '#fff',
                  padding: '2px 8px',
                  borderRadius: 20,
                  fontWeight: 700,
                }}
              >
                {t('instructorPortal.commInboxNewBadge')}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  background: 'var(--info-bg)',
                  borderRadius: 'var(--rs)',
                  padding: 12,
                  ...inboxBorder,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }} data-field="sender_name">
                      {t('instructorPortal.commInbox1Name')}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }} data-field="message_preview">
                      {t('instructorPortal.commInbox1Preview')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t('instructorPortal.commInbox1Time')}</span>
                    <span style={{ fontSize: 10, background: 'var(--info)', color: '#fff', padding: '1px 6px', borderRadius: 10 }}>
                      {t('instructorPortal.commInboxNewTag')}
                    </span>
                  </div>
                </div>
                <button type="button" className="btn btn-gh btn-sm" style={{ marginTop: 8 }}>
                  {t('instructorPortal.commReply')}
                </button>
              </div>
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--rs)', padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }} data-field="sender_name">
                      {t('instructorPortal.commInbox2Name')}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{t('instructorPortal.commInbox2Preview')}</div>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t('instructorPortal.commInbox2Time')}</span>
                </div>
                <button type="button" className="btn btn-gh btn-sm" style={{ marginTop: 8 }}>
                  {t('instructorPortal.commReply')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
