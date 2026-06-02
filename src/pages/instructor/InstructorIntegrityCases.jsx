import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'

/** Academic integrity cases — matches instructor portal reference. */
export default function InstructorIntegrityCases({ embedded = false, embedClassId = null } = {}) {
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
          .select(`id, subject_id, subjects ( id, code, name_en, name_ar ), semesters ( id, name_en, name_ar, code )`)
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
  const semesterLabel = classRow?.semesters
    ? getLocalizedName(classRow.semesters, isRTL) || classRow.semesters.code || ''
    : ''
  const subtitle = semesterLabel
    ? t('instructorPortal.integrityCasesPageSubtitle', { code: subjectCode, semester: semesterLabel })
    : t('instructorPortal.integrityCasesPageSubtitleDemo', { code: subjectCode })

  const borderErr = isRTL ? { borderRight: '4px solid var(--err)' } : { borderLeft: '4px solid var(--err)' }
  const borderWarn = isRTL ? { borderRight: '4px solid var(--warn)' } : { borderLeft: '4px solid var(--warn)' }

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

  return (
    <>
      {!embedded && (
        <>
          <nav className="bc" aria-label={t('instructorPortal.breadcrumbMain')}>
            <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
            <span className="bc-sep">›</span>
            <Link to={crumbHref}>{subjectCode}</Link>
            <span className="bc-sep">›</span>
            <span>{t('instructorPortal.integrityCasesBreadcrumb')}</span>
          </nav>

          <div className="ph">
            <div>
              <h1>{t('instructorPortal.integrityCasesPageTitle')}</h1>
              <p className="ph-sub">{subtitle}</p>
            </div>
            <div className="ph-acts">
              <button type="button" className="btn btn-err">
                {t('instructorPortal.integrityCasesNewReport')}
              </button>
            </div>
          </div>
        </>
      )}

      <div className="sg">
        <div className="sc warn">
          <div className="sc-lbl">{t('instructorPortal.integrityStatInvestigating')}</div>
          <div className="sc-val" data-field="under_investigation">
            {t('instructorPortal.integrityDemoInvestigating')}
          </div>
          <div className="sc-sub">{t('instructorPortal.integrityStatCases')}</div>
        </div>
        <div className="sc err">
          <div className="sc-lbl">{t('instructorPortal.integrityStatConfirmed')}</div>
          <div className="sc-val" data-field="confirmed">
            {t('instructorPortal.integrityDemoConfirmed')}
          </div>
          <div className="sc-sub">{t('instructorPortal.integrityStatThisTerm')}</div>
        </div>
        <div className="sc ok">
          <div className="sc-lbl">{t('instructorPortal.integrityStatClosed')}</div>
          <div className="sc-val" data-field="closed">
            {t('instructorPortal.integrityDemoClosed')}
          </div>
          <div className="sc-sub">{t('instructorPortal.integrityStatThisTerm')}</div>
        </div>
        <div className="sc info">
          <div className="sc-lbl">{t('instructorPortal.integrityStatPlagiarism')}</div>
          <div className="sc-val">{t('instructorPortal.integrityDemoPlagiarism')}</div>
          <div className="sc-sub">{t('instructorPortal.integrityStatCourseAvg')}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="card-title">📋 {t('instructorPortal.integrityActiveCasesTitle')}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              background: 'var(--bg)',
              borderRadius: 'var(--r)',
              padding: 18,
              ...borderErr,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }} data-field="student_name">
                    {t('instructorPortal.integrityCase1Student')}
                  </span>
                  <span data-status="under-review" className="badge">
                    {t('instructorPortal.integrityBadgeUnderReview')}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('instructorPortal.integrityCase1Meta')}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('instructorPortal.integrityCase1Date')}</div>
              </div>
              <button type="button" className="btn btn-gh btn-sm">
                {t('instructorPortal.integrityViewReport')}
              </button>
            </div>
            <div
              style={{
                background: '#fff',
                borderRadius: 'var(--rs)',
                padding: 12,
                marginBottom: 12,
                border: '1px solid var(--bdr)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>
                {t('instructorPortal.integrityInstructorNotesLabel')}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.7 }} data-field="instructor_notes">
                {t('instructorPortal.integrityCase1Notes')}
              </div>
            </div>
            <div className="fg">
              <label className="fl" style={{ fontSize: 12 }}>
                {t('instructorPortal.integrityUpdateStatus')}
              </label>
              <select className="fc" data-field="case_status" defaultValue="investigating">
                <option value="investigating">{t('instructorPortal.integrityStatusOption1')}</option>
                <option value="referred">{t('instructorPortal.integrityStatusOption2')}</option>
                <option value="proven">{t('instructorPortal.integrityStatusOption3')}</option>
                <option value="closed_unproven">{t('instructorPortal.integrityStatusOption4')}</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="button" className="btn btn-err btn-sm">
                📋 {t('instructorPortal.integrityOfficialReferral')}
              </button>
              <button type="button" className="btn btn-gh btn-sm">
                💾 {t('instructorPortal.integritySaveUpdate')}
              </button>
            </div>
          </div>

          <div
            style={{
              background: 'var(--bg)',
              borderRadius: 'var(--r)',
              padding: 18,
              ...borderWarn,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }} data-field="student_name">
                    {t('instructorPortal.integrityCase2Student')}
                  </span>
                  <span data-status="pending" className="badge">
                    {t('instructorPortal.integrityBadgePending')}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--muted)' }}>{t('instructorPortal.integrityCase2Meta')}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('instructorPortal.integrityCase2Date')}</div>
              </div>
              <Link to="/instructor/monitor-exam" className="btn btn-gh btn-sm">
                {t('instructorPortal.integrityExamLog')}
              </Link>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-err btn-sm">
                📋 {t('instructorPortal.integrityOfficialReferral')}
              </button>
              <button type="button" className="btn btn-ok btn-sm">
                ✅ {t('instructorPortal.integrityCloseUnproven')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="card-title">📋 {t('instructorPortal.integrityClosedLogTitle')}</div>
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>{t('instructorPortal.integrityTableStudent')}</th>
                <th>{t('instructorPortal.integrityTableViolation')}</th>
                <th>{t('instructorPortal.integrityTableAssessment')}</th>
                <th>{t('instructorPortal.integrityTableOutcome')}</th>
                <th>{t('instructorPortal.integrityTablePenalty')}</th>
                <th>{t('instructorPortal.integrityTableDate')}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td data-field="student_name">{t('instructorPortal.integrityClosedRow1Student')}</td>
                <td>{t('instructorPortal.integrityClosedRow1Violation')}</td>
                <td>{t('instructorPortal.integrityClosedRow1Assessment')}</td>
                <td>
                  <span data-status="confirmed" className="badge">
                    {t('instructorPortal.integrityOutcomeConfirmed')}
                  </span>
                </td>
                <td data-field="penalty">{t('instructorPortal.integrityClosedRow1Penalty')}</td>
                <td>{t('instructorPortal.integrityClosedRow1Date')}</td>
              </tr>
              <tr>
                <td data-field="student_name">{t('instructorPortal.integrityClosedRow2Student')}</td>
                <td>{t('instructorPortal.integrityClosedRow2Violation')}</td>
                <td>{t('instructorPortal.integrityClosedRow2Assessment')}</td>
                <td>
                  <span data-status="approved" className="badge">
                    {t('instructorPortal.integrityOutcomeUnproven')}
                  </span>
                </td>
                <td>—</td>
                <td>{t('instructorPortal.integrityClosedRow2Date')}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
