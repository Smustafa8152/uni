import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'
import {
  buildAssessmentCloMap,
  buildLessonCloMatrix,
  fetchClassCloAlignment,
} from '../../utils/cloAlignment'
import CurriculumReferencesPanel from '../../components/academic/CurriculumReferencesPanel'

export default function InstructorCurriculumMap({ embedded = false, embedClassId = null } = {}) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState([])
  const [selectedClassId, setSelectedClassId] = useState(null)
  const [alignment, setAlignment] = useState({ clos: [], lessons: [], exams: [], rows: [] })

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || null,
    [classes, selectedClassId],
  )

  const { clos, lessons, exams, rows: coverageRows } = alignment

  useEffect(() => {
    if (!user?.email) return
    loadInstructorClasses()
  }, [user?.email, embedded, embedClassId])

  useEffect(() => {
    if (!selectedClassId) return
    if (!embedded) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('classId', String(selectedClassId))
        return next
      })
    }
    loadCurriculumData(selectedClassId)
  }, [selectedClassId, embedded, classes])

  const loadInstructorClasses = async () => {
    setLoading(true)
    try {
      const instructor = await getActiveInstructorByEmail(user.email)

      if (!instructor) {
        setLoading(false)
        return
      }

      const { data: cls } = await supabase
        .from('classes')
        .select(`
          id,
          code,
          section,
          subject_id,
          subjects(id, code, name_en, name_ar),
          semesters(id, name_en, name_ar, code)
        `)
        .eq('instructor_id', instructor.id)
        .eq('status', 'active')
        .order('id', { ascending: false })

      const list = cls || []
      setClasses(list)

      const fromQuery = Number(searchParams.get('classId'))
      const initialClassId = embedded && embedClassId
        ? list.find((c) => c.id === embedClassId)?.id || list[0]?.id || null
        : list.find((c) => c.id === fromQuery)?.id || list[0]?.id || null
      setSelectedClassId(initialClassId)

      if (!initialClassId) setLoading(false)
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  const loadCurriculumData = async (classId) => {
    try {
      const currentClass = classes.find((c) => c.id === classId)
      const subjectId = currentClass?.subject_id

      if (!subjectId) {
        setAlignment({ clos: [], lessons: [], exams: [], rows: [] })
        setLoading(false)
        return
      }

      const data = await fetchClassCloAlignment(supabase, { classId, subjectId })
      setAlignment(data)
    } catch (err) {
      console.error(err)
      setAlignment({ clos: [], lessons: [], exams: [], rows: [] })
    } finally {
      setLoading(false)
    }
  }

  const matrixRows = useMemo(() => buildLessonCloMatrix(lessons, clos), [lessons, clos])
  const assessmentCloMap = useMemo(() => buildAssessmentCloMap(exams, clos), [exams, clos])

  const gapRows = coverageRows.filter((r) => r.gap && r.gap !== 'not_graded')
  const subjectCode = selectedClass?.subjects?.code || '-'
  const subjectId = selectedClass?.subject_id || null

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--bdr)', borderTopColor: 'var(--p)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  const classSelector = (
    <select
      className="fc"
      style={{ width: 'auto', minWidth: 220 }}
      value={selectedClassId || ''}
      onChange={(e) => setSelectedClassId(e.target.value ? Number(e.target.value) : null)}
    >
      {classes.map((cls) => (
        <option key={cls.id} value={cls.id}>
          {cls.subjects?.code} - {getLocalizedName(cls.subjects, language === 'ar')} ({t('instructorPortal.section')} {cls.section})
        </option>
      ))}
    </select>
  )

  return (
    <>
      {!embedded ? (
        <>
          <nav className="bc" aria-label={t('instructorPortal.curriculumMap')}>
            <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
            <span className="bc-sep">›</span>
            <Link to="/instructor/courses">{t('instructorPortal.myCourses')}</Link>
            <span className="bc-sep">›</span>
            <span>{t('instructorPortal.curriculumMap')}</span>
          </nav>

          <div className="ph">
            <div>
              <h1>{t('instructorPortal.curriculumMap')}</h1>
              <p className="ph-sub">
                {subjectCode} — {t('instructorPortal.curriculumMapSubtitle')}
              </p>
            </div>
            <div className="ph-acts">
              {classSelector}
              <Link to={`/instructor/build-lessons?classId=${selectedClassId || ''}`} className="btn btn-p">
                + {t('instructorPortal.addLessonContent')}
              </Link>
            </div>
          </div>

          <div className="alert alert-info" style={{ marginBottom: 16 }}>
            {t('instructorPortal.curriculumMapViewOnlyHint')}
          </div>
        </>
      ) : (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-hd">
            <div className="card-title">{t('instructorPortal.curriculumMap')}</div>
            <div className="ph-acts" style={{ margin: 0 }}>
              {classSelector}
            </div>
          </div>
          <div className="alert alert-info" style={{ margin: 0, border: 'none' }}>
            {t('instructorPortal.curriculumMapViewOnlyHint')}
          </div>
        </div>
      )}

      <div className="grid2">
        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">{t('instructorPortal.learningOutcomesClos')}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {clos.map((clo) => (
                <div key={clo.id} style={{ background: 'var(--bg)', borderRadius: 'var(--rs)', padding: 14, borderRight: '3px solid var(--ok)' }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ok)', background: 'var(--ok-bg)', padding: '2px 8px', borderRadius: 20 }}>
                      {clo.code}
                    </span>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 6 }}>{clo.description}</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                    {t('instructorPortal.bloomLevel')}: {clo.bloom_level} | {t('instructorPortal.difficulty')}: {clo.difficulty_level}
                  </div>
                </div>
              ))}
              {clos.length === 0 && <div style={{ color: 'var(--muted)' }}>{t('instructorPortal.noData', 'No data available')}</div>}
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">{t('instructorPortal.outcomeCoverageReport')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {coverageRows.map((row) => {
                const fillClass =
                  row.isAligned && row.isAssessed
                    ? row.achievementPct >= 70
                      ? 'ok'
                      : row.achievementPct >= 50
                        ? 'warn'
                        : 'err'
                    : row.hasLectures || row.hasAssessments
                      ? 'warn'
                      : 'err'
                const barWidth = row.isAssessed
                  ? row.achievementPct
                  : row.hasLectures && row.hasAssessments
                    ? 50
                    : row.lessonCoveragePct
                return (
                  <div key={row.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
                      <span>{row.code}</span>
                      <span style={{ fontWeight: 700, fontSize: 12 }}>
                        {t('instructorPortal.cloLinkedLectures', { count: row.lessonsLinked })}
                        {' · '}
                        {t('instructorPortal.cloLinkedAssessments', { count: row.assessmentsLinked })}
                        {row.isAssessed && (
                          <>
                            {' · '}
                            {t('instructorPortal.analyticsCloAchieved', { pct: row.achievementPct })}
                          </>
                        )}
                      </span>
                    </div>
                    <div className="prog-bar">
                      <div className={`prog-fill ${fillClass}`} style={{ width: `${Math.max(5, barWidth || 0)}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
            {gapRows.length > 0 && (
              <div className="alert alert-warn" style={{ marginTop: 16 }}>
                {t('instructorPortal.cloAlignmentGap', {
                  codes: gapRows.map((r) => r.code).join(', '),
                })}
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">{t('instructorPortal.mappingMatrix')}</div>
            </div>
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>{t('instructorPortal.unit')}</th>
                    {clos.map((clo) => (
                      <th key={clo.id}>{clo.code}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixRows.map((row) => (
                    <tr key={row.unit}>
                      <td>{t('instructorPortal.unit')} {row.unit}</td>
                      {clos.map((clo) => (
                        <td key={clo.id} style={{ textAlign: 'center' }}>
                          {row.cloMap[clo.id] ? '✓' : '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {exams.length > 0 && (
                    <tr>
                      <td>{t('instructorPortal.mappingMatrixAssessments')}</td>
                      {clos.map((clo) => (
                        <td key={clo.id} style={{ textAlign: 'center' }}>
                          {assessmentCloMap[clo.id] ? '✓' : '—'}
                        </td>
                      ))}
                    </tr>
                  )}
                  {matrixRows.length === 0 && exams.length === 0 && (
                    <tr>
                      <td colSpan={Math.max(2, clos.length + 1)} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                        {t('instructorPortal.noData', 'No data available')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {subjectId && selectedClassId && (
        <CurriculumReferencesPanel
          subjectId={subjectId}
          classId={selectedClassId}
          clos={clos}
          variant="instructor"
        />
      )}
    </>
  )
}
