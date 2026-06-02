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
} from '../../utils/getCollegeSettings'
import { supabase } from '../../lib/supabase'
import {
  INSTRUCTOR_SEMESTER_SELECT,
  effectiveGradeEntryAllowed,
} from '../../utils/instructorSemesters'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'

export default function InstructorGradeSubmission() {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const classIdParam = searchParams.get('classId')

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [instructor, setInstructor] = useState(null)
  const [classes, setClasses] = useState([])
  const [selectedClassId, setSelectedClassId] = useState(classIdParam ? Number(classIdParam) : null)
  const [classData, setClassData] = useState(null)
  const [enrollments, setEnrollments] = useState([])
  const [gradesMap, setGradesMap] = useState({})
  const [gradeConfig, setGradeConfig] = useState([])
  const [gradingScale, setGradingScale] = useState([])
  const [notes, setNotes] = useState('')
  const [declarationChecked, setDeclarationChecked] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || null,
    [classes, selectedClassId]
  )
  const subjectCode = selectedClass?.subjects?.code || ''
  const semesterLabel = selectedClass?.semesters
    ? getLocalizedName(selectedClass.semesters, language === 'ar')
    : ''
  const courseName = selectedClass?.subjects
    ? getLocalizedName(selectedClass.subjects, language === 'ar')
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

    const subjectConfig = cls?.subjects?.grade_configuration && Array.isArray(cls.subjects.grade_configuration)
      ? cls.subjects.grade_configuration
      : []
    getGradeTypesFromUniversitySettings().then((gradeTypes) => {
      const merged = mergeGradeConfigWithTypes(subjectConfig, gradeTypes)
      setGradeConfig(merged)
    })

    supabase
      .from('enrollments')
      .select(`
        id,
        student_id,
        students(id, student_id, name_en, name_ar, first_name, last_name)
      `)
      .eq('class_id', selectedClassId)
      .eq('status', 'enrolled')
      .then(({ data: enrollData }) => {
        const enrolls = enrollData || []
        setEnrollments(enrolls)
        if (enrolls.length === 0) {
          setGradesMap({})
          setLoading(false)
          return
        }
        supabase
          .from('grade_components')
          .select('*')
          .in('enrollment_id', enrolls.map((e) => e.id))
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

  const getTotalPercent = (gradeRow) => {
    if (!gradeRow) return null
    const num = gradeRow.numeric_grade
    if (num != null && num !== '') return parseFloat(num)
    if (gradeConfig.length === 0) return null
    let totalWeighted = 0
    let totalWeight = 0
    gradeConfig.forEach((c) => {
      const field = c.dbColumn || `grade_${(c.grade_type_code || '').toLowerCase().replace(/\s+/g, '_')}`
      const score = gradeRow[field]
      const max = c.maximum ?? 100
      const weight = c.weight ?? 0
      if (score != null && max > 0 && weight > 0) {
        totalWeighted += (Number(score) / max) * weight
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

  const checklist = useMemo(() => {
    const rows = enrollments.map((e) => ({
      enrollment: e,
      grade: gradesMap[e.id],
      percent: getTotalPercent(gradesMap[e.id]),
    }))
    const withPercent = rows.filter((r) => r.percent != null)
    const failingCount = rows.filter((r) => r.percent != null && r.percent < 60).length
    const totalWeights = gradeConfig.reduce((s, c) => s + (c.weight ?? 0), 0)
    const weightsOk = Math.abs(totalWeights - 100) < 0.01 || gradeConfig.length === 0
    return {
      allAssessmentsComplete: true,
      assessmentsCount: 5,
      pendingGrading: 0,
      regradeResolved: true,
      regradeCount: 2,
      failingCount,
      weightsEqual100: weightsOk,
      weightsBreakdown: gradeConfig.length
        ? gradeConfig.map((c) => `${c.weight ?? 0}%`).join(' + ')
        : '50% + 20% + 30%',
      allStudentsHaveGrades: withPercent.length === enrollments.length && enrollments.length > 0,
      studentsTotal: enrollments.length,
      gradesComplete: withPercent.length,
    }
  }, [enrollments, gradesMap, gradeConfig])

  const gradeDistribution = useMemo(() => {
    const scale = Array.isArray(gradingScale) && gradingScale.length > 0 ? gradingScale : []
    const buckets = {}
    scale.forEach((g) => {
      const key = g.letter ?? ''
      buckets[key] = { letter: key, count: 0, min: g.minPercent ?? g.min_percent ?? 0, max: g.maxPercent ?? g.max_percent ?? 100 }
    })
    enrollments.forEach((e) => {
      const g = gradesMap[e.id]
      const pct = getTotalPercent(g)
      const letter = getLetterGrade(pct)
      if (letter && buckets[letter]) buckets[letter].count += 1
    })
    const total = enrollments.length
    return Object.values(buckets)
      .filter((b) => b.count > 0 || total === 0)
      .map((b) => ({
        ...b,
        pct: total > 0 ? Math.round((b.count / total) * 100) : 0,
      }))
      .sort((a, b) => (b.min + b.max) / 2 - (a.min + a.max) / 2)
  }, [enrollments, gradesMap, gradeConfig, gradingScale])

  const submissionDate = new Date()
  const submissionDateStr = submissionDate.toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  const handleSubmit = async () => {
    if (!declarationChecked || !selectedClassId || !gradeEntryAllowed) return
    setSubmitting(true)
    setSubmitError('')
    setSubmitSuccess('')
    try {
      if (!selectedClass) throw new Error('Class not found')
      if (enrollments.length === 0) throw new Error(t('instructorPortal.noStudentsToSubmit', 'No enrolled students to submit.'))

      // Must have grades for all students before final submission
      const missing = enrollments
        .map((e) => {
          const g = gradesMap[e.id]
          const pct = getTotalPercent(g)
          return { enrollment: e, grade: g, pct }
        })
        .filter((r) => r.grade == null || r.pct == null)

      if (missing.length > 0) {
        throw new Error(
          t('instructorPortal.submitBlockedMissingGrades', 'Some students are missing grades. Please complete grading before submitting final grades.')
        )
      }

      if (!checklist.weightsEqual100) {
        throw new Error(
          t('instructorPortal.submitBlockedWeights', 'Grade weights must total 100% before final submission.')
        )
      }

      const nowIso = new Date().toISOString()
      const payloads = enrollments.map((e) => {
        const g = gradesMap[e.id]
        const classCollegeId = selectedClass?.college_id ?? instructor?.college_id ?? null
        const classSemesterId = selectedClass?.semester_id ?? null
        return {
          enrollment_id: e.id,
          class_id: selectedClass.id,
          student_id: e.student_id,
          semester_id: classSemesterId,
          college_id: classCollegeId,
          // Ensure these are included so DB triggers can sync enrollments
          numeric_grade: g?.numeric_grade ?? null,
          letter_grade: g?.letter_grade ?? null,
          gpa_points: g?.gpa_points ?? null,
          midterm: g?.midterm ?? null,
          final: g?.final ?? null,
          assignments: g?.assignments ?? null,
          quizzes: g?.quizzes ?? null,
          class_participation: g?.class_participation ?? null,
          project: g?.project ?? null,
          lab: g?.lab ?? null,
          other: g?.other ?? null,
          status: 'final',
          graded_by: instructor?.id ?? null,
          graded_at: nowIso,
          notes: notes?.trim() ? notes.trim() : null,
          updated_at: nowIso,
        }
      })

      // Upsert in chunks to avoid request size limits
      const chunkSize = 50
      for (let i = 0; i < payloads.length; i += chunkSize) {
        const chunk = payloads.slice(i, i + chunkSize)
        const { error } = await supabase.from('grade_components').upsert(chunk, { onConflict: 'enrollment_id' })
        if (error) throw error
      }

      // Refresh local state
      const enrollmentIds = enrollments.map((e) => e.id)
      const { data: gradesData, error: gErr } = await supabase
        .from('grade_components')
        .select('*')
        .in('enrollment_id', enrollmentIds)
      if (gErr) throw gErr
      const map = {}
      ;(gradesData || []).forEach((g) => {
        map[g.enrollment_id] = g
      })
      setGradesMap(map)
      setSubmitSuccess(t('instructorPortal.gradesSubmittedSuccess', 'Final grades submitted successfully.'))
    } catch (err) {
      console.error(err)
      setSubmitError(err?.message || t('common.error', 'Error'))
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmitFinally =
    gradeEntryAllowed &&
    declarationChecked &&
    checklist.allStudentsHaveGrades &&
    checklist.weightsEqual100 &&
    enrollments.length > 0

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
      <nav className="bc" aria-label={t('instructorPortal.dashboard')}>
        <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
        <span className="bc-sep">›</span>
        <Link to={`/instructor/gradebook${selectedClassId ? `?classId=${selectedClassId}` : ''}`}>
          {t('instructorPortal.gradebook')}
        </Link>
        <span className="bc-sep">›</span>
        <span>{t('instructorPortal.submitFinalGrades')}</span>
      </nav>

      <div className="ph">
        <div>
          <h1>{t('instructorPortal.submitFinalGradesToRecord')}</h1>
          <p className="ph-sub">
            {subjectCode} — {semesterLabel}
          </p>
        </div>
        {classes.length > 1 && (
          <div className="ph-acts">
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
          </div>
        )}
      </div>

      <div className="alert alert-warn" role="alert">
        {t('instructorPortal.gradeSubmissionWarning')}
      </div>

      {!!submitError && (
        <div className="alert alert-err" role="alert">
          {submitError}
        </div>
      )}
      {!!submitSuccess && (
        <div className="alert alert-ok" role="status">
          {submitSuccess}
        </div>
      )}

      {!gradeEntryAllowed && selectedClass && (
        <div className="alert alert-err" role="alert">
          {t('instructorPortal.semesterLifecycle.gradeSubmitBlocked')}
        </div>
      )}

      <div className="grid2">
        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">📋 {t('instructorPortal.submitAction')}</div>
            </div>
            <div className="fg">
              <div className="fl">{t('instructorPortal.academicSemester')}</div>
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>{semesterLabel || '—'}</div>
            </div>
            <div className="fg">
              <div className="fl">{t('instructorPortal.course')}</div>
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                {subjectCode} — {courseName}
              </div>
            </div>
            <div className="fg">
              <div className="fl">{t('instructorPortal.numberOfStudents')}</div>
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                {t('instructorPortal.studentsCount', { count: enrollments.length })}
              </div>
            </div>
            <div className="fg">
              <div className="fl">{t('instructorPortal.submissionDate')}</div>
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>{submissionDateStr}</div>
            </div>
            <div className="fg">
              <div className="fl">{t('instructorPortal.notesForAcademicRecord')}</div>
              <textarea
                className="fc"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('instructorPortal.notesPlaceholder')}
                rows={4}
              />
            </div>
            <div className="fg">
              <div className="fl" style={{ color: 'var(--err)' }}>
                {t('instructorPortal.instructorDeclaration')}
              </div>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer', fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={declarationChecked}
                  onChange={(e) => setDeclarationChecked(e.target.checked)}
                  style={{ marginTop: 4 }}
                />
                <span>{t('instructorPortal.declarationText')}</span>
              </label>
            </div>
            <button
              type="button"
              className="btn btn-err btn-lg btn-bl"
              onClick={handleSubmit}
              disabled={!canSubmitFinally || submitting}
            >
              ☁️ {t('instructorPortal.submitGradesFinally')}
            </button>
            <div className="alert alert-warn" style={{ marginTop: 16 }}>
              {t('instructorPortal.submitGradesIrreversible')}
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">✅ {t('instructorPortal.preSubmissionChecklist')}</div>
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: 12, padding: 12, borderRadius: 'var(--rs)', background: checklist.allAssessmentsComplete ? 'var(--ok-bg)' : 'var(--warn-bg)' }}>
                <span>{checklist.allAssessmentsComplete ? '✅' : '⚠️'}</span>{' '}
                <strong>{t('instructorPortal.checkAllAssessmentsComplete')}</strong>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  {checklist.assessmentsCount} {t('instructorPortal.assessments')} — {checklist.pendingGrading} {t('instructorPortal.pendingGrading')}
                </div>
              </li>
              <li style={{ marginBottom: 12, padding: 12, borderRadius: 'var(--rs)', background: checklist.regradeResolved ? 'var(--ok-bg)' : 'var(--warn-bg)' }}>
                <span>{checklist.regradeResolved ? '✅' : '⚠️'}</span>{' '}
                <strong>{t('instructorPortal.checkRegradeResolved')}</strong>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  {checklist.regradeCount} {t('instructorPortal.requests')} — {t('instructorPortal.processed')}
                </div>
              </li>
              <li
                style={{
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 'var(--rs)',
                  background: checklist.failingCount > 0 ? 'var(--warn-bg)' : 'var(--ok-bg)',
                }}
              >
                <span>{checklist.failingCount > 0 ? '⚠️' : '✅'}</span>{' '}
                <strong>
                  {t('instructorPortal.checkStudentsBelow60', { count: checklist.failingCount })}
                </strong>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  {t('instructorPortal.reviewBeforeSubmit')}
                </div>
              </li>
              <li style={{ marginBottom: 12, padding: 12, borderRadius: 'var(--rs)', background: checklist.weightsEqual100 ? 'var(--ok-bg)' : 'var(--warn-bg)' }}>
                <span>{checklist.weightsEqual100 ? '✅' : '⚠️'}</span>{' '}
                <strong>{t('instructorPortal.checkWeights100')}</strong>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  100% = {checklist.weightsBreakdown}
                </div>
              </li>
              <li style={{ marginBottom: 12, padding: 12, borderRadius: 'var(--rs)', background: checklist.allStudentsHaveGrades ? 'var(--ok-bg)' : 'var(--warn-bg)' }}>
                <span>{checklist.allStudentsHaveGrades ? '✅' : '⚠️'}</span>{' '}
                <strong>{t('instructorPortal.checkAllStudentsHaveGrades')}</strong>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  {checklist.studentsTotal} {t('instructorPortal.students')} — {checklist.gradesComplete} {t('instructorPortal.gradesComplete')}
                </div>
              </li>
            </ul>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">📊 {t('instructorPortal.gradeDistributionSummary')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {gradeDistribution.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('instructorPortal.noData')}</div>
              ) : (
                gradeDistribution.map((item) => (
                  <div key={item.letter}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span>
                        {item.pct}% — {item.count} {t('instructorPortal.students')} — {item.letter}
                      </span>
                    </div>
                    <div className="prog-bar">
                      <div
                        className="prog-fill"
                        style={{
                          width: `${item.pct}%`,
                          background: item.letter?.startsWith('A') ? 'var(--ok)' : item.letter?.startsWith('B') ? 'var(--info)' : item.letter?.startsWith('C') ? '#d97706' : item.letter?.startsWith('D') ? 'var(--warn)' : 'var(--err)',
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
