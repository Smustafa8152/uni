import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'
import { fetchClassCloAlignment } from '../../utils/cloAlignment'

/** Course analytics dashboard — matches instructor portal reference (stats, CLOs, at-risk, assessments, activity). */
export default function InstructorCourseAnalytics({ embedded = false, embedClassId = null } = {}) {
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

  const [loading, setLoading] = useState(true)
  const [classRow, setClassRow] = useState(null)
  const [forbidden, setForbidden] = useState(false)
  const [cloRows, setCloRows] = useState([])

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
          setForbidden(true)
          setClassRow(null)
          return
        }

        const { data: cls, error } = await supabase
          .from('classes')
          .select(
            `
            id,
            section,
            subject_id,
            subjects ( id, code, name_en, name_ar ),
            semesters ( id, name_en, name_ar, code )
          `
          )
          .eq('id', classId)
          .eq('instructor_id', instructor.id)
          .maybeSingle()

        if (error || !cls) {
          setForbidden(true)
          setClassRow(null)
          return
        }
        if (!cancelled) {
          setClassRow(cls)
          setForbidden(false)
          if (cls?.id && cls?.subject_id) {
            try {
              const alignment = await fetchClassCloAlignment(supabase, {
                classId: cls.id,
                subjectId: cls.subject_id,
              })
              if (!cancelled) setCloRows(alignment.rows || [])
            } catch {
              if (!cancelled) setCloRows([])
            }
          } else if (!cancelled) {
            setCloRows([])
          }
        }
      } catch {
        if (!cancelled) {
          setForbidden(true)
          setClassRow(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user?.email, classId])

  const subjectCode = classRow?.subjects?.code || '—'
  const semesterLabel = classRow?.semesters
    ? getLocalizedName(classRow.semesters, isRTL) || classRow.semesters.code || ''
    : ''

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

  if (!classId || Number.isNaN(classId)) {
    return (
      <div className="alert alert-info">
        {t('instructorPortal.analyticsPickClass')}
        {!embedded && (
          <div style={{ marginTop: 12 }}>
            <Link to="/instructor/courses" className="btn btn-p btn-sm">
              {t('instructorPortal.myCourses')}
            </Link>
          </div>
        )}
      </div>
    )
  }

  if (forbidden || !classRow) {
    return (
      <div className="alert alert-err">
        {t('instructorPortal.analyticsClassNotFound')}
        {!embedded && (
          <div style={{ marginTop: 12 }}>
            <Link to="/instructor/courses" className="btn btn-gh btn-sm">
              {t('instructorPortal.myCourses')}
            </Link>
          </div>
        )}
      </div>
    )
  }

  const subtitle = t('instructorPortal.analyticsPageSubtitle', {
    code: subjectCode,
    semester: semesterLabel || t('instructorPortal.analyticsSemesterFallback'),
  })

  const activityDays = [
    { h: 45, key: 'sun', peak: false },
    { h: 72, key: 'mon', peak: false },
    { h: 55, key: 'tue', peak: false },
    { h: 90, key: 'wed', peak: true },
    { h: 60, key: 'thu', peak: false },
    { h: 20, key: 'fri', peak: false, dim: true },
    { h: 15, key: 'sat', peak: false, dim: true },
  ]

  return (
    <>
      {!embedded && (
        <>
          <nav className="bc" aria-label={t('instructorPortal.breadcrumbMain')}>
            <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
            <span className="bc-sep">›</span>
            <Link to={`/instructor/subjects/${classRow.subject_id}`}>{subjectCode}</Link>
            <span className="bc-sep">›</span>
            <span>{t('instructorPortal.analyticsBreadcrumb')}</span>
          </nav>

          <div className="ph">
            <div>
              <h1>{t('instructorPortal.analyticsPageTitle')}</h1>
              <p className="ph-sub">{subtitle}</p>
            </div>
            <div className="ph-acts">
              <button type="button" className="btn btn-gh" onClick={() => window.print()}>
                📥 {t('instructorPortal.analyticsExportReport')}
              </button>
              <Link to="/grading/analytics" className="btn btn-p">
                📊 {t('instructorPortal.analyticsDetailedReports')}
              </Link>
            </div>
          </div>
        </>
      )}

      <div className="sg">
        <div className="sc ok">
          <div className="sc-lbl">{t('instructorPortal.analyticsStatCompletion')}</div>
          <div className="sc-val" data-field="completion_rate">
            {t('instructorPortal.analyticsDemoCompletion')}
          </div>
          <div className="sc-sub">{t('instructorPortal.analyticsStatCompletionSub')}</div>
        </div>
        <div className="sc info">
          <div className="sc-lbl">{t('instructorPortal.analyticsStatAvgGrade')}</div>
          <div className="sc-val" data-field="avg_grade">
            {t('instructorPortal.analyticsDemoAvgGrade')}
          </div>
          <div className="sc-sub">{t('instructorPortal.analyticsStatAvgGradeSub')}</div>
        </div>
        <div className="sc warn">
          <div className="sc-lbl">{t('instructorPortal.analyticsStatAtRisk')}</div>
          <div className="sc-val" data-field="at_risk">
            {t('instructorPortal.analyticsDemoAtRisk')}
          </div>
          <div className="sc-sub">{t('instructorPortal.analyticsStatAtRiskSub')}</div>
        </div>
        <div className="sc acc">
          <div className="sc-lbl">{t('instructorPortal.analyticsStatForum')}</div>
          <div className="sc-val" data-field="forum_posts">
            {t('instructorPortal.analyticsDemoForum')}
          </div>
          <div className="sc-sub">{t('instructorPortal.analyticsStatForumSub')}</div>
        </div>
      </div>

      <div className="grid2">
        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">📈 {t('instructorPortal.analyticsGradeDistributionTitle')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(
                [
                  { band: 'A', pct: 21, count: 8, fill: 'ok', label: t('instructorPortal.analyticsGradeA') },
                  { band: 'B', pct: 36, count: 14, fill: 'info', label: t('instructorPortal.analyticsGradeB') },
                  { band: 'C', pct: 23, count: 9, fill: 'warn', label: t('instructorPortal.analyticsGradeC') },
                  { band: 'D', pct: 10, count: 4, fill: 'warn', label: t('instructorPortal.analyticsGradeD') },
                  { band: 'F', pct: 10, count: 4, fill: 'err', label: t('instructorPortal.analyticsGradeF') },
                ] 
              ).map((row) => {
                const fillColor =
                  row.fill === 'ok'
                    ? 'var(--ok)'
                    : row.fill === 'info'
                      ? 'var(--info)'
                      : row.fill === 'err'
                        ? 'var(--err)'
                        : 'var(--warn)'
                return (
                <div key={row.band}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                    <span>{row.label}</span>
                    <span style={{ fontWeight: 700, color: fillColor }}>
                      {t('instructorPortal.analyticsStudentsCountPct', { count: row.count, pct: row.pct })}
                    </span>
                  </div>
                  <div className="prog-bar">
                    <div className={`prog-fill ${row.fill}`} style={{ width: `${row.pct}%` }} />
                  </div>
                </div>
                )
              })}
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">🎯 {t('instructorPortal.analyticsClosTitle')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {cloRows.length === 0 ? (
                <p className="ts" style={{ color: 'var(--muted)', margin: 0 }}>
                  {t('instructorPortal.analyticsCloEmpty')}
                </p>
              ) : (
                cloRows.map((row) => {
                  const done = row.isAssessed
                  const w = done ? row.achievementPct : 5
                  const fill =
                    !row.hasAssessments
                      ? 'err'
                      : !done
                        ? 'warn'
                        : row.achievementPct >= 70
                          ? 'ok'
                          : row.achievementPct >= 50
                            ? 'warn'
                            : 'err'
                  return (
                    <div key={row.id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, gap: 8 }}>
                        <span>
                          {row.code}: {row.description}
                        </span>
                        <span style={{ fontWeight: 700, color: done ? `var(--${fill})` : 'var(--muted)', flexShrink: 0 }}>
                          {done
                            ? t('instructorPortal.analyticsCloAchieved', { pct: row.achievementPct })
                            : row.hasAssessments
                              ? t('instructorPortal.analyticsCloNotAssessed')
                              : t('instructorPortal.cloNoAssessmentsShort')}
                        </span>
                      </div>
                      <div className="prog-bar">
                        <div className={`prog-fill ${fill}`} style={{ width: `${w}%` }} />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            {cloRows.some((r) => r.gap === 'no_assessments' || r.gap === 'none') && (
              <div className="alert alert-warn" style={{ marginTop: 14 }}>
                ⚠️ {t('instructorPortal.analyticsCloWarn')}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">⚠️ {t('instructorPortal.analyticsAtRiskTitle')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                {
                  name: t('instructorPortal.analyticsAtRiskStudent1Name'),
                  line1: t('instructorPortal.analyticsAtRiskStudent1Line1'),
                  line2: t('instructorPortal.analyticsAtRiskStudent1Line2'),
                },
                {
                  name: t('instructorPortal.analyticsAtRiskStudent2Name'),
                  line1: t('instructorPortal.analyticsAtRiskStudent2Line1'),
                  line2: t('instructorPortal.analyticsAtRiskStudent2Line2'),
                },
              ].map((s, i) => (
                <div
                  key={i}
                  style={{
                    background: 'var(--err-bg)',
                    borderRadius: 'var(--rs)',
                    padding: 14,
                    ...(isRTL ? { borderRight: '3px solid var(--err)' } : { borderLeft: '3px solid var(--err)' }),
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 13 }} data-field="student_name">
                        {s.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.line1}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.line2}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                      <Link to={`/instructor/communication?classId=${classId}`} className="btn btn-warn btn-sm">
                        📧 {t('instructorPortal.analyticsContact')}
                      </Link>
                      <Link to={`/instructor/gradebook?classId=${classId}`} className="btn btn-gh btn-sm">
                        {t('instructorPortal.analyticsDetails')}
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">📊 {t('instructorPortal.analyticsAssessmentsTitle')}</div>
            </div>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>{t('instructorPortal.analyticsAssessColName')}</th>
                    <th>{t('instructorPortal.analyticsAssessColAvg')}</th>
                    <th>{t('instructorPortal.analyticsAssessColHigh')}</th>
                    <th>{t('instructorPortal.analyticsAssessColLow')}</th>
                    <th>{t('instructorPortal.analyticsAssessColCompletion')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      name: t('instructorPortal.analyticsAssessRow1'),
                      avg: t('instructorPortal.analyticsAssessRow1Avg'),
                      avgWarn: false,
                      hi: '10',
                      lo: '4',
                      bar: 100,
                    },
                    {
                      name: t('instructorPortal.analyticsAssessRow2'),
                      avg: t('instructorPortal.analyticsAssessRow2Avg'),
                      avgWarn: false,
                      hi: '30',
                      lo: '10',
                      bar: 95,
                    },
                    {
                      name: t('instructorPortal.analyticsAssessRow3'),
                      avg: t('instructorPortal.analyticsAssessRow3Avg'),
                      avgWarn: true,
                      hi: '49',
                      lo: '18',
                      bar: 100,
                    },
                    {
                      name: t('instructorPortal.analyticsAssessRow4'),
                      avg: '—',
                      avgWarn: false,
                      hi: '—',
                      lo: '—',
                      bar: 0,
                      muted: true,
                    },
                  ].map((row, idx) => (
                    <tr key={idx}>
                      <td>{row.name}</td>
                      <td
                        style={{
                          textAlign: 'center',
                          fontWeight: 700,
                          color: row.muted ? 'var(--muted)' : row.avgWarn ? 'var(--warn)' : 'var(--ok)',
                        }}
                      >
                        {row.avg}
                      </td>
                      <td style={{ textAlign: 'center', color: row.muted ? 'var(--muted)' : undefined }}>{row.hi}</td>
                      <td style={{ textAlign: 'center', color: row.muted ? 'var(--muted)' : undefined }}>{row.lo}</td>
                      <td>
                        <div className="prog-bar" style={{ width: 80 }}>
                          <div className="prog-fill ok" style={{ width: `${row.bar}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">📅 {t('instructorPortal.analyticsActivityTitle')}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100, paddingBottom: 8 }}>
              {activityDays.map((d) => (
                <div key={d.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div
                    style={{
                      background: d.peak ? 'var(--acc)' : 'var(--p)',
                      borderRadius: '3px 3px 0 0',
                      width: '100%',
                      height: d.h,
                      opacity: d.dim ? 0.4 : 1,
                    }}
                  />
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{t(`instructorPortal.analyticsDay_${d.key}`)}</div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center' }}>{t('instructorPortal.analyticsActivityPeak')}</div>
          </div>
        </div>
      </div>
    </>
  )
}
