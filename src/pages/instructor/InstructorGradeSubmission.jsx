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
import { ASSESSMENT_GROUPS } from '../../utils/gradeAssessmentGroups'
import { fetchClassAssessmentApprovals } from '../../utils/gradeAudit'
import {
  LEGACY_GRADE_COLUMNS,
  getTotalPercent,
} from '../../utils/instructorGradeSheet'
import { computeGradeDistribution } from '../../utils/exportInstructorGradeSheet'

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
  const [approvalsMap, setApprovalsMap] = useState({})
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

  const editableColumns = useMemo(() => {
    if (gradeConfig.length > 0) return gradeConfig
    return LEGACY_GRADE_COLUMNS.map((c) => ({
      ...c,
      grade_type_name_en: c.field,
      dbColumn: c.field,
    }))
  }, [gradeConfig])

  const configForCalc = gradeConfig.length ? gradeConfig : editableColumns

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
        college_id,
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
      setApprovalsMap({})
      setLoading(false)
      return
    }
    setLoading(true)
    const cls = classes.find((c) => c.id === selectedClassId)
    if (cls) setClassData(cls)

    const subjectConfig =
      cls?.subjects?.grade_configuration && Array.isArray(cls.subjects.grade_configuration)
        ? cls.subjects.grade_configuration
        : []

    Promise.all([
      getGradeTypesFromUniversitySettings(),
      fetchClassAssessmentApprovals(selectedClassId),
      supabase
        .from('enrollments')
        .select(`
          id,
          student_id,
          students(id, student_id, name_en, name_ar, first_name, last_name)
        `)
        .eq('class_id', selectedClassId)
        .eq('status', 'enrolled'),
    ]).then(([gradeTypes, approvals, { data: enrollData }]) => {
      setGradeConfig(mergeGradeConfigWithTypes(subjectConfig, gradeTypes))
      setApprovalsMap(approvals || {})
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

  const allGroupsApproved = useMemo(
    () => ASSESSMENT_GROUPS.every((g) => approvalsMap[g]?.status === 'approved'),
    [approvalsMap]
  )

  const checklist = useMemo(() => {
    const rows = enrollments.map((e) => ({
      enrollment: e,
      grade: gradesMap[e.id],
      percent: getTotalPercent(gradesMap[e.id], configForCalc),
    }))
    const withPercent = rows.filter((r) => r.percent != null)
    const failingCount = rows.filter((r) => r.percent != null && r.percent < 60).length
    const totalWeights = editableColumns.reduce((s, c) => s + (c.weight ?? 0), 0)
    const weightsOk = Math.abs(totalWeights - 100) < 0.01
    const approvedCount = ASSESSMENT_GROUPS.filter((g) => approvalsMap[g]?.status === 'approved').length

    return {
      allGroupsApproved,
      approvedCount,
      assessmentsTotal: ASSESSMENT_GROUPS.length,
      failingCount,
      weightsEqual100: weightsOk,
      weightsBreakdown: editableColumns.map((c) => `${c.weight ?? 0}%`).join(' + '),
      allStudentsHaveGrades: withPercent.length === enrollments.length && enrollments.length > 0,
      studentsTotal: enrollments.length,
      gradesComplete: withPercent.length,
    }
  }, [enrollments, gradesMap, configForCalc, editableColumns, approvalsMap, allGroupsApproved])

  const gradeDistribution = useMemo(() => {
    const { distribution } = computeGradeDistribution(enrollments, gradesMap, configForCalc, gradingScale)
    return distribution
  }, [enrollments, gradesMap, configForCalc, gradingScale])

  const submissionDateStr = new Date().toLocaleDateString(language === 'ar' ? 'ar-SA' : 'en-GB', {
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
      if (!allGroupsApproved) {
        throw new Error(
          t('instructorPortal.submitBlockedApprovals', 'All assessment groups must be approved before submission.')
        )
      }
      if (enrollments.length === 0) {
        throw new Error(t('instructorPortal.noStudentsToSubmit', 'No enrolled students to submit.'))
      }

      const missing = enrollments.filter((e) => getTotalPercent(gradesMap[e.id], configForCalc) == null)
      if (missing.length > 0) {
        throw new Error(t('instructorPortal.submitBlockedMissingGrades'))
      }
      if (!checklist.weightsEqual100) {
        throw new Error(t('instructorPortal.submitBlockedWeights'))
      }

      const nowIso = new Date().toISOString()
      const payloads = enrollments.map((e) => {
        const g = gradesMap[e.id]
        return {
          enrollment_id: e.id,
          class_id: selectedClass.id,
          student_id: e.student_id,
          semester_id: selectedClass.semester_id ?? null,
          college_id: selectedClass.college_id ?? instructor?.college_id ?? null,
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
          record_status: g?.record_status ?? 'complete',
          status: 'submitted',
          graded_by: instructor?.id ?? null,
          graded_at: nowIso,
          notes: notes?.trim() ? notes.trim() : null,
          updated_at: nowIso,
        }
      })

      const chunkSize = 50
      for (let i = 0; i < payloads.length; i += chunkSize) {
        const { error } = await supabase
          .from('grade_components')
          .upsert(payloads.slice(i, i + chunkSize), { onConflict: 'enrollment_id' })
        if (error) throw error
      }

      const { data: gradesData, error: gErr } = await supabase
        .from('grade_components')
        .select('*')
        .in('enrollment_id', enrollments.map((e) => e.id))
      if (gErr) throw gErr
      const map = {}
      ;(gradesData || []).forEach((g) => {
        map[g.enrollment_id] = g
      })
      setGradesMap(map)
      setSubmitSuccess(t('instructorPortal.gradesSubmittedSuccess', 'Grades submitted for academic review.'))
    } catch (err) {
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
    checklist.allGroupsApproved &&
    enrollments.length > 0

  const groupLabel = (group) => t(`instructorPortal.assessmentGroup.${group}`, group)

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

      {!!submitError && <div className="alert alert-err">{submitError}</div>}
      {!!submitSuccess && <div className="alert alert-ok">{submitSuccess}</div>}

      {!gradeEntryAllowed && selectedClass && (
        <div className="alert alert-err">{t('instructorPortal.semesterLifecycle.gradeSubmitBlocked')}</div>
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
              <li
                style={{
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 'var(--rs)',
                  background: checklist.allGroupsApproved ? 'var(--ok-bg)' : 'var(--warn-bg)',
                }}
              >
                <span>{checklist.allGroupsApproved ? '✅' : '⚠️'}</span>{' '}
                <strong>{t('instructorPortal.checkAllAssessmentsApproved', 'All assessments approved')}</strong>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  {checklist.approvedCount}/{checklist.assessmentsTotal}{' '}
                  {ASSESSMENT_GROUPS.map((g) => groupLabel(g)).join(' · ')}
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
                <strong>{t('instructorPortal.checkStudentsBelow60', { count: checklist.failingCount })}</strong>
              </li>
              <li
                style={{
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 'var(--rs)',
                  background: checklist.weightsEqual100 ? 'var(--ok-bg)' : 'var(--warn-bg)',
                }}
              >
                <span>{checklist.weightsEqual100 ? '✅' : '⚠️'}</span>{' '}
                <strong>{t('instructorPortal.checkWeights100')}</strong>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  100% = {checklist.weightsBreakdown}
                </div>
              </li>
              <li
                style={{
                  marginBottom: 12,
                  padding: 12,
                  borderRadius: 'var(--rs)',
                  background: checklist.allStudentsHaveGrades ? 'var(--ok-bg)' : 'var(--warn-bg)',
                }}
              >
                <span>{checklist.allStudentsHaveGrades ? '✅' : '⚠️'}</span>{' '}
                <strong>{t('instructorPortal.checkAllStudentsHaveGrades')}</strong>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                  {checklist.studentsTotal} {t('instructorPortal.students')} — {checklist.gradesComplete}{' '}
                  {t('instructorPortal.gradesComplete')}
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
                          background: item.letter?.startsWith('A')
                            ? 'var(--ok)'
                            : item.letter?.startsWith('B')
                              ? 'var(--info)'
                              : item.letter?.startsWith('C')
                                ? '#d97706'
                                : 'var(--err)',
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
