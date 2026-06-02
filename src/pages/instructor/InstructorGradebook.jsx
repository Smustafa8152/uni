import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import {
  getGradeTypesFromUniversitySettings,
  getGradingScaleFromUniversitySettings,
  mergeGradeConfigWithTypes,
  numericGradeToGpaPoints,
} from '../../utils/getCollegeSettings'
import { supabase } from '../../lib/supabase'
import {
  INSTRUCTOR_SEMESTER_SELECT,
  effectiveGradeEntryAllowed,
} from '../../utils/instructorSemesters'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'

export default function InstructorGradebook({ embedded = false, embedClassId = null } = {}) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const classIdParam = embedded && embedClassId != null ? String(embedClassId) : searchParams.get('classId')

  const [loading, setLoading] = useState(true)
  const [instructor, setInstructor] = useState(null)
  const [classes, setClasses] = useState([])
  const [selectedClassId, setSelectedClassId] = useState(classIdParam ? Number(classIdParam) : null)
  const [classData, setClassData] = useState(null)
  const [enrollments, setEnrollments] = useState([])
  const [gradesMap, setGradesMap] = useState({})
  const [gradeConfig, setGradeConfig] = useState([])
  const [gradingScale, setGradingScale] = useState([])
  const [filterStatus, setFilterStatus] = useState('all')

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || null,
    [classes, selectedClassId]
  )
  const subjectCode = selectedClass?.subjects?.code || ''
  const semesterLabel = selectedClass?.semesters
    ? getLocalizedName(selectedClass.semesters, language === 'ar')
    : ''
  const gradeEntryAllowed = effectiveGradeEntryAllowed(selectedClass?.semesters)

  useEffect(() => {
    if (user?.email) {
      getActiveInstructorByEmail(user.email).then((data) => data && setInstructor(data))
    }
  }, [user?.email])

  useEffect(() => {
    if (!instructor?.id) return
    getGradingScaleFromUniversitySettings().then(setGradingScale)
    supabase
      .from('classes')
      .select(`
        id,
        code,
        section,
        subject_id,
        semester_id,
        subjects(id, code, name_en, name_ar, grade_configuration),
        semesters(${INSTRUCTOR_SEMESTER_SELECT})
      `)
      .eq('instructor_id', instructor.id)
      .eq('status', 'active')
      .order('code')
      .then(({ data }) => {
        setClasses(data || [])
        if (data?.length && !selectedClassId) setSelectedClassId(data[0].id)
      })
  }, [instructor?.id])

  useEffect(() => {
    if (!selectedClassId || !instructor?.id) {
      setClassData(null)
      setEnrollments([])
      setGradesMap({})
      setGradeConfig([])
      setLoading(false)
      return
    }
    setLoading(true)
    const cls = classes.find((c) => c.id === selectedClassId)
    if (cls) setClassData(cls)

    Promise.all([
      supabase
        .from('enrollments')
        .select(`
          id,
          student_id,
          students(id, student_id, name_en, name_ar, first_name, last_name)
        `)
        .eq('class_id', selectedClassId)
        .eq('status', 'enrolled')
        .order('students(name_en)'),
      getGradeTypesFromUniversitySettings(),
    ]).then(([{ data: enrollData }, gradeTypes]) => {
      const enrolls = enrollData || []
      setEnrollments(enrolls)

      const subjectConfig = cls?.subjects?.grade_configuration && Array.isArray(cls.subjects.grade_configuration)
        ? cls.subjects.grade_configuration
        : []
      const merged = mergeGradeConfigWithTypes(subjectConfig, gradeTypes)
      setGradeConfig(merged)

      if (enrolls.length === 0) {
        setGradesMap({})
        setLoading(false)
        return
      }
      const enrollmentIds = enrolls.map((e) => e.id)
      supabase
        .from('grade_components')
        .select('*')
        .in('enrollment_id', enrollmentIds)
        .then(({ data: gradesData }) => {
          const map = {}
          ;(gradesData || []).forEach((g) => {
            map[g.enrollment_id] = g
          })
          setGradesMap(map)
        })
        .finally(() => setLoading(false))
    })
  }, [selectedClassId, instructor?.id, classes])

  const getScoreForConfig = (gradeRow, config) => {
    const field = config.dbColumn || `grade_${(config.grade_type_code || '').toLowerCase().replace(/\s+/g, '_')}`
    const val = gradeRow?.[field]
    if (val == null || val === '') return null
    return Number(val)
  }

  const getTotalPercent = (gradeRow) => {
    if (!gradeRow) return null
    const num = gradeRow.numeric_grade
    if (num != null && num !== '') return parseFloat(num)
    if (gradeConfig.length === 0) return null
    let totalWeighted = 0
    let totalWeight = 0
    gradeConfig.forEach((c) => {
      const score = getScoreForConfig(gradeRow, c)
      const max = c.maximum ?? 100
      const weight = c.weight ?? 0
      if (score != null && max > 0 && weight > 0) {
        totalWeighted += (score / max) * weight
        totalWeight += weight
      }
    })
    if (totalWeight === 0) return null
    return Math.min(100, (totalWeighted / totalWeight) * 100)
  }

  const getLetterGrade = (percent) => {
    if (percent == null) return null
    const scale = Array.isArray(gradingScale) && gradingScale.length > 0 ? gradingScale : []
    const entry = scale.find((g) => {
      const min = g.minPercent ?? g.min_percent ?? 0
      const max = g.maxPercent ?? g.max_percent ?? 100
      return percent >= min && percent <= max
    })
    return entry ? (entry.letter ?? null) : null
  }

  const stats = useMemo(() => {
    const rows = enrollments.map((e) => ({
      enrollment: e,
      grade: gradesMap[e.id],
      percent: getTotalPercent(gradesMap[e.id]),
    }))
    const withPercent = rows.filter((r) => r.percent != null)
    const courseAvg =
      withPercent.length > 0
        ? withPercent.reduce((a, r) => a + r.percent, 0) / withPercent.length
        : null
    const failing = rows.filter((r) => r.percent != null && r.percent < 60).length
    const pending = rows.filter((r) => getTotalPercent(r.grade) == null && r.grade != null).length
    const pendingEssay = 0
    const highest = withPercent.length
      ? withPercent.reduce((best, r) => (r.percent > (best?.percent ?? 0) ? r : best), withPercent[0])
      : null
    const highestName = highest?.enrollment?.students
      ? getLocalizedName(highest.enrollment.students, language === 'ar')
      : '—'
    return {
      courseAvg: courseAvg != null ? courseAvg.toFixed(1) : '—',
      highest: highest?.percent != null ? Math.round(highest.percent) : '—',
      highestName,
      failingCount: failing,
      pendingGrading: pending + pendingEssay,
    }
  }, [enrollments, gradesMap, gradeConfig, language])

  const filteredEnrollments = useMemo(() => {
    if (filterStatus === 'all') return enrollments
    return enrollments.filter((e) => {
      const g = gradesMap[e.id]
      const pct = getTotalPercent(g)
      if (filterStatus === 'pending') return pct == null
      if (filterStatus === 'below60') return pct != null && pct < 60
      if (filterStatus === 'complete') return pct != null
      return true
    })
  }, [enrollments, gradesMap, filterStatus])

  const formatScore = (gradeRow, config) => {
    const score = getScoreForConfig(gradeRow, config)
    const max = config.maximum ?? 100
    if (score == null) return '—'
    return `${score}/${max}`
  }

  const isPendingGrading = (gradeRow) => {
    if (!gradeRow) return true
    return getTotalPercent(gradeRow) == null
  }

  if (loading && !selectedClass) {
    return (
      <div className="body" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
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

  return (
    <>
      {!embedded && (
        <>
          <nav className="bc" aria-label={t('instructorPortal.dashboard')}>
            <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
            <span className="bc-sep">›</span>
            <Link to={`/instructor/gradebook${selectedClassId ? `?classId=${selectedClassId}` : ''}`}>
              {subjectCode || t('instructorPortal.gradebook')}
            </Link>
            <span className="bc-sep">›</span>
            <span>{t('instructorPortal.gradebook')}</span>
          </nav>

          <div className="ph">
            <div>
              <h1>{t('instructorPortal.gradebook')}</h1>
              <p className="ph-sub">
                {subjectCode} — {semesterLabel} | {t('instructorPortal.studentsCount', { count: enrollments.length })}
              </p>
              {!gradeEntryAllowed && selectedClass && (
                <div className="alert alert-warn" role="status" style={{ marginTop: 12 }}>
                  {t('instructorPortal.semesterLifecycle.flagGradeEntryOff')}
                </div>
              )}
            </div>
            <div className="ph-acts">
              {classes.length > 1 && (
                <select
                  className="fc"
                  style={{ width: 'auto' }}
                  value={selectedClassId || ''}
                  onChange={(e) => setSelectedClassId(e.target.value ? Number(e.target.value) : null)}
                >
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.subjects?.code} — {getLocalizedName(cls.subjects, language === 'ar')}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" className="btn btn-gh" disabled>
                📥 {t('instructorPortal.exportExcel')}
              </button>
              <Link
                to={`/instructor/grade-submission${selectedClassId ? `?classId=${selectedClassId}` : ''}`}
                className="btn btn-p"
                style={!gradeEntryAllowed ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
                aria-disabled={!gradeEntryAllowed}
                onClick={(e) => {
                  if (!gradeEntryAllowed) e.preventDefault()
                }}
              >
                📤 {t('instructorPortal.submitGradesToRecord')}
              </Link>
            </div>
          </div>
        </>
      )}

      {embedded && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-hd">
            <div className="card-title">{t('instructorPortal.gradebook')}</div>
            {classes.length > 1 ? (
              <select
                className="fc"
                style={{ width: 'auto' }}
                value={selectedClassId || ''}
                onChange={(e) => setSelectedClassId(e.target.value ? Number(e.target.value) : null)}
              >
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.subjects?.code} — {getLocalizedName(cls.subjects, language === 'ar')}
                  </option>
                ))}
              </select>
            ) : (
              <span className="ts">{subjectCode}</span>
            )}
          </div>
          {!gradeEntryAllowed && selectedClass && (
            <div style={{ padding: '0 16px 12px' }}>
              <div className="alert alert-warn" role="status" style={{ margin: 0 }}>
                {t('instructorPortal.semesterLifecycle.flagGradeEntryOff')}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="sg">
        <div className="sc ok">
          <div className="sc-lbl">{t('instructorPortal.courseAverage')}</div>
          <div className="sc-val">{stats.courseAvg}</div>
          <div className="sc-sub">{t('instructorPortal.outOf100')}</div>
        </div>
        <div className="sc info">
          <div className="sc-lbl">{t('instructorPortal.highestGrade')}</div>
          <div className="sc-val">{stats.highest}</div>
          <div className="sc-sub">{stats.highestName}</div>
        </div>
        <div className="sc warn">
          <div className="sc-lbl">{t('instructorPortal.below60Percent')}</div>
          <div className="sc-val">{stats.failingCount}</div>
          <div className="sc-sub">{t('instructorPortal.studentsAtRisk')}</div>
        </div>
        <div className="sc acc">
          <div className="sc-lbl">{t('instructorPortal.pendingGrading')}</div>
          <div className="sc-val">{stats.pendingGrading}</div>
          <div className="sc-sub">{t('instructorPortal.essayAnswers')}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="card-title">⚙️ {t('instructorPortal.weightSettings')}</div>
          <button type="button" className="btn btn-gh btn-sm" disabled>
            {t('instructorPortal.edit')}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {gradeConfig.length > 0 ? (
            gradeConfig.map((c) => (
              <div
                key={c.grade_type_id || c.grade_type_code}
                style={{
                  background: 'var(--bg)',
                  borderRadius: 'var(--rs)',
                  padding: '10px 16px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 18 }}>📝</span>
                <div>
                  <div style={{ fontWeight: 700 }}>
                    {c.grade_type_name_en || c.grade_type_code || ''}
                  </div>
                  <div style={{ color: 'var(--muted)' }}>{c.weight ?? 0}%</div>
                </div>
              </div>
            ))
          ) : (
            <>
              <div
                style={{
                  background: 'var(--bg)',
                  borderRadius: 'var(--rs)',
                  padding: '10px 16px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 18 }}>📝</span>
                <div>
                  <div style={{ fontWeight: 700 }}>{t('instructorPortal.assignments')}</div>
                  <div style={{ color: 'var(--muted)' }}>30%</div>
                </div>
              </div>
              <div
                style={{
                  background: 'var(--bg)',
                  borderRadius: 'var(--rs)',
                  padding: '10px 16px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 18 }}>📋</span>
                <div>
                  <div style={{ fontWeight: 700 }}>{t('instructorPortal.shortQuizzes')}</div>
                  <div style={{ color: 'var(--muted)' }}>20%</div>
                </div>
              </div>
              <div
                style={{
                  background: 'var(--bg)',
                  borderRadius: 'var(--rs)',
                  padding: '10px 16px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 18 }}>📊</span>
                <div>
                  <div style={{ fontWeight: 700 }}>{t('instructorPortal.midterm')}</div>
                  <div style={{ color: 'var(--muted)' }}>30%</div>
                </div>
              </div>
              <div
                style={{
                  background: 'var(--bg)',
                  borderRadius: 'var(--rs)',
                  padding: '10px 16px',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 18 }}>🎓</span>
                <div>
                  <div style={{ fontWeight: 700 }}>{t('instructorPortal.finalExam')}</div>
                  <div style={{ color: 'var(--muted)' }}>50%</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="card-title">📋 {t('instructorPortal.gradesTable')}</div>
          <select
            className="fc"
            style={{ width: 160 }}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            aria-label={t('instructorPortal.filter')}
          >
            <option value="all">{t('instructorPortal.allStudents')}</option>
            <option value="pending">{t('instructorPortal.pendingGrading')}</option>
            <option value="below60">{t('instructorPortal.below60Percent')}</option>
            <option value="complete">{t('instructorPortal.complete')}</option>
          </select>
        </div>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>{t('instructorPortal.student')}</th>
                {gradeConfig.length > 0 ? (
                  gradeConfig.map((c) => (
                    <th key={c.grade_type_id || c.grade_type_code}>
                      {c.grade_type_name_en || c.grade_type_code}
                      <br />
                      <small style={{ fontWeight: 400, color: 'var(--muted)' }}>{c.weight ?? 0}%</small>
                    </th>
                  ))
                ) : (
                  <>
                    <th>
                      {t('instructorPortal.assignments')}
                      <br />
                      <small style={{ fontWeight: 400, color: 'var(--muted)' }}>30%</small>
                    </th>
                    <th>
                      {t('instructorPortal.shortQuizzes')}
                      <br />
                      <small style={{ fontWeight: 400, color: 'var(--muted)' }}>20%</small>
                    </th>
                    <th>
                      {t('instructorPortal.midterm')}
                      <br />
                      <small style={{ fontWeight: 400, color: 'var(--muted)' }}>30%</small>
                    </th>
                    <th>
                      {t('instructorPortal.final')}
                      <br />
                      <small style={{ fontWeight: 400, color: 'var(--muted)' }}>50%</small>
                    </th>
                  </>
                )}
                <th>{t('instructorPortal.total')}</th>
                <th>{t('instructorPortal.gradeLetter')}</th>
                <th>{t('instructorPortal.action')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredEnrollments.map((enrollment) => {
                const g = gradesMap[enrollment.id]
                const pct = getTotalPercent(g)
                const letter = getLetterGrade(pct)
                const student = enrollment.students
                const name = student ? getLocalizedName(student, language === 'ar') : '—'
                const sid = student?.student_id ?? '—'
                const isFailing = pct != null && pct < 60
                const pending = isPendingGrading(g)
                return (
                  <tr key={enrollment.id} style={isFailing ? { background: 'var(--err-bg)' } : undefined}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{sid}</div>
                    </td>
                    {gradeConfig.length > 0 ? (
                      gradeConfig.map((c) => (
                        <td key={c.grade_type_id || c.grade_type_code} style={{ textAlign: 'center' }}>
                          {pending && !getScoreForConfig(g, c) ? (
                            <span style={{ color: 'var(--warn)', fontWeight: 700 }}>
                              ⏳ {t('instructorPortal.gradingInProgress')}
                            </span>
                          ) : (
                            formatScore(g, c)
                          )}
                        </td>
                      ))
                    ) : (
                      <>
                        <td style={{ textAlign: 'center' }}>
                          {g ? `${g.grade_assignments ?? '—'}/${30}` : '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {g ? `${g.grade_quizzes ?? '—'}/${20}` : '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {g ? `${g.grade_midterm ?? '—'}/${50}` : '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>—</td>
                      </>
                    )}
                    <td
                      style={{
                        textAlign: 'center',
                        fontWeight: 700,
                        color: isFailing ? 'var(--err)' : pct != null && pct >= 60 ? 'var(--ok)' : 'var(--muted)',
                      }}
                    >
                      {pct != null ? `${pct.toFixed(1)}%` : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {letter ? (
                        <span
                          className="badge"
                          data-status={isFailing ? 'at-risk' : `grade-${(letter || '').toLowerCase().replace('+', '')}`}
                        >
                          {letter}
                        </span>
                      ) : (
                        <span className="badge" data-status="pending">
                          {t('instructorPortal.incomplete')}
                        </span>
                      )}
                    </td>
                    <td>
                      {isFailing ? (
                        <button type="button" className="btn btn-err btn-sm">
                          {t('instructorPortal.alert')}
                        </button>
                      ) : pending ? (
                        <Link
                          to={`/grading/classes/${selectedClassId}/grades?enrollmentId=${enrollment.id}`}
                          className="btn btn-warn btn-sm"
                        >
                          {t('instructorPortal.grade')}
                        </Link>
                      ) : (
                        <Link
                          to={`/grading/classes/${selectedClassId}/grades?enrollmentId=${enrollment.id}`}
                          className="btn btn-gh btn-sm"
                        >
                          {t('instructorPortal.details')}
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
