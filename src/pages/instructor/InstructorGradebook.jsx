import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  LEGACY_GRADE_COLUMNS,
  applyGradeFieldChange,
  buildGradeUpsertPayload,
  downloadGradeSheetTemplate,
  finalizeGradeRow,
  getConfigFieldName,
  getLetterFromPercent,
  getTotalPercent,
  parseGradeUploadWorkbook,
  validateGradeValue,
} from '../../utils/instructorGradeSheet'

export default function InstructorGradebook({ embedded = false, embedClassId = null } = {}) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const classIdParam = embedded && embedClassId != null ? String(embedClassId) : searchParams.get('classId')
  const panelParam = searchParams.get('panel')

  const [loading, setLoading] = useState(true)
  const [instructor, setInstructor] = useState(null)
  const [classes, setClasses] = useState([])
  const [selectedClassId, setSelectedClassId] = useState(classIdParam ? Number(classIdParam) : null)
  const [classData, setClassData] = useState(null)
  const [enrollments, setEnrollments] = useState([])
  const [gradesMap, setGradesMap] = useState({})
  const [draftGrades, setDraftGrades] = useState({})
  const [dirtyIds, setDirtyIds] = useState(() => new Set())
  const [gradeConfig, setGradeConfig] = useState([])
  const [gradingScale, setGradingScale] = useState([])
  const [filterStatus, setFilterStatus] = useState('all')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [fieldError, setFieldError] = useState('')

  const [showUploadPanel, setShowUploadPanel] = useState(panelParam === 'upload')
  const [showSubmitPanel, setShowSubmitPanel] = useState(panelParam === 'submit')
  const [uploadErrors, setUploadErrors] = useState([])
  const [uploadMessage, setUploadMessage] = useState('')
  const uploadInputRef = useRef(null)

  const [submitNotes, setSubmitNotes] = useState('')
  const [declarationChecked, setDeclarationChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
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
  const hasUnsaved = dirtyIds.size > 0
  const isArabic = language === 'ar'

  const editableColumns = useMemo(() => {
    if (gradeConfig.length > 0) return gradeConfig
    return LEGACY_GRADE_COLUMNS.map((c) => ({
      ...c,
      grade_type_name_en: c.field,
      dbColumn: c.field,
    }))
  }, [gradeConfig])

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
      setDraftGrades({})
      setGradeConfig([])
      setDirtyIds(new Set())
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
          students(id, student_id, name_en, name_ar, first_name, last_name, first_name_ar, last_name_ar)
        `)
        .eq('class_id', selectedClassId)
        .eq('status', 'enrolled')
        .order('students(name_en)'),
      getGradeTypesFromUniversitySettings(),
    ]).then(([{ data: enrollData }, gradeTypes]) => {
      const enrolls = enrollData || []
      setEnrollments(enrolls)

      const subjectConfig =
        cls?.subjects?.grade_configuration && Array.isArray(cls.subjects.grade_configuration)
          ? cls.subjects.grade_configuration
          : []
      setGradeConfig(mergeGradeConfigWithTypes(subjectConfig, gradeTypes))

      if (enrolls.length === 0) {
        setGradesMap({})
        setDraftGrades({})
        setLoading(false)
        return
      }
      supabase
        .from('grade_components')
        .select('*')
        .in(
          'enrollment_id',
          enrolls.map((e) => e.id)
        )
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

  useEffect(() => {
    if (loading) return
    const base = {}
    enrollments.forEach((e) => {
      base[e.id] = {
        enrollment_id: e.id,
        class_id: selectedClassId,
        student_id: e.student_id,
        ...(gradesMap[e.id] || {}),
      }
    })
    setDraftGrades(base)
    setDirtyIds(new Set())
  }, [loading, selectedClassId, enrollments, gradesMap])

  useEffect(() => {
    if (panelParam === 'upload') setShowUploadPanel(true)
    if (panelParam === 'submit') setShowSubmitPanel(true)
  }, [panelParam])

  const displayStudentName = useCallback(
    (student) => {
      if (!student) return '—'
      if (isArabic) {
        const ar = [student.first_name_ar, student.last_name_ar].filter(Boolean).join(' ').trim()
        if (ar) return ar
        if (student.name_ar?.trim()) return student.name_ar.trim()
      }
      if (student.name_en?.trim()) return student.name_en.trim()
      return `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.student_id || '—'
    },
    [isArabic]
  )

  const stats = useMemo(() => {
    const rows = enrollments.map((e) => ({
      enrollment: e,
      grade: draftGrades[e.id],
      percent: getTotalPercent(draftGrades[e.id], gradeConfig),
    }))
    const withPercent = rows.filter((r) => r.percent != null)
    const courseAvg =
      withPercent.length > 0 ? withPercent.reduce((a, r) => a + r.percent, 0) / withPercent.length : null
    const failing = rows.filter((r) => r.percent != null && r.percent < 60).length
    const pending = rows.filter((r) => getTotalPercent(r.grade, gradeConfig) == null).length
    const highest = withPercent.length
      ? withPercent.reduce((best, r) => (r.percent > (best?.percent ?? 0) ? r : best), withPercent[0])
      : null
    return {
      courseAvg: courseAvg != null ? courseAvg.toFixed(1) : '—',
      highest: highest?.percent != null ? Math.round(highest.percent) : '—',
      highestName: highest?.enrollment?.students ? displayStudentName(highest.enrollment.students) : '—',
      failingCount: failing,
      pendingGrading: pending,
    }
  }, [enrollments, draftGrades, gradeConfig, displayStudentName])

  const filteredEnrollments = useMemo(() => {
    if (filterStatus === 'all') return enrollments
    return enrollments.filter((e) => {
      const g = draftGrades[e.id]
      const pct = getTotalPercent(g, gradeConfig)
      if (filterStatus === 'pending') return pct == null
      if (filterStatus === 'below60') return pct != null && pct < 60
      if (filterStatus === 'complete') return pct != null
      return true
    })
  }, [enrollments, draftGrades, filterStatus, gradeConfig])

  const checklist = useMemo(() => {
    const rows = enrollments.map((e) => ({
      enrollment: e,
      percent: getTotalPercent(draftGrades[e.id], gradeConfig),
    }))
    const withPercent = rows.filter((r) => r.percent != null)
    const failingCount = rows.filter((r) => r.percent != null && r.percent < 60).length
    const totalWeights = gradeConfig.reduce((s, c) => s + (c.weight ?? 0), 0)
    const weightsOk = Math.abs(totalWeights - 100) < 0.01 || gradeConfig.length === 0
    return {
      failingCount,
      weightsEqual100: weightsOk,
      weightsBreakdown: gradeConfig.length
        ? gradeConfig.map((c) => `${c.weight ?? 0}%`).join(' + ')
        : '—',
      allStudentsHaveGrades: withPercent.length === enrollments.length && enrollments.length > 0,
      studentsTotal: enrollments.length,
      gradesComplete: withPercent.length,
    }
  }, [enrollments, draftGrades, gradeConfig])

  const handleFieldChange = (enrollmentId, field, value, config) => {
    setFieldError('')
    if (config && value !== '') {
      const err = validateGradeValue(value, config, t)
      if (err) setFieldError(err)
    }
    setDraftGrades((prev) => {
      const current = prev[enrollmentId] || {
        enrollment_id: enrollmentId,
        class_id: selectedClassId,
        student_id: enrollments.find((e) => e.id === enrollmentId)?.student_id,
      }
      const updated = applyGradeFieldChange(current, { field, value, gradeConfig, gradingScale })
      return { ...prev, [enrollmentId]: updated }
    })
    setDirtyIds((prev) => new Set(prev).add(enrollmentId))
    setSaveSuccess(false)
  }

  const handleSave = async () => {
    if (!gradeEntryAllowed || dirtyIds.size === 0) return
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)
    try {
      for (const enrollmentId of dirtyIds) {
        const row = draftGrades[enrollmentId]
        if (!row) continue
        const enrollment = enrollments.find((e) => e.id === enrollmentId)
        const payload = buildGradeUpsertPayload(row, enrollment, selectedClass, instructor?.id)
        const { error } = await supabase
          .from('grade_components')
          .upsert(payload, { onConflict: 'enrollment_id' })
        if (error) throw error
      }
      const { data: gradesData, error: fetchErr } = await supabase
        .from('grade_components')
        .select('*')
        .in(
          'enrollment_id',
          enrollments.map((e) => e.id)
        )
      if (fetchErr) throw fetchErr
      const map = {}
      ;(gradesData || []).forEach((g) => {
        map[g.enrollment_id] = g
      })
      setGradesMap(map)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err) {
      setSaveError(err.message || t('grading.classGrades.failedToSave', 'Failed to save grades'))
    } finally {
      setSaving(false)
    }
  }

  const handleUploadFile = async (file) => {
    if (!file || !gradeEntryAllowed) return
    setUploadErrors([])
    setUploadMessage('')
    try {
      const buf = await file.arrayBuffer()
      const { updates, errors, matched } = parseGradeUploadWorkbook(buf, { enrollments, gradeConfig })
      if (errors.length) setUploadErrors(errors.slice(0, 8))
      if (matched === 0) {
        setUploadMessage(t('instructorPortal.gradeSheetUploadNoRows', 'No grade rows were imported.'))
        return
      }
      setDraftGrades((prev) => {
        const next = { ...prev }
        Object.entries(updates).forEach(([enrollmentId, patch]) => {
          const id = Number(enrollmentId)
          const current = next[id] || {
            enrollment_id: id,
            class_id: selectedClassId,
            student_id: enrollments.find((e) => e.id === id)?.student_id,
          }
          next[id] = finalizeGradeRow({ ...current, ...patch }, gradeConfig, gradingScale)
        })
        return next
      })
      setDirtyIds((prev) => new Set([...prev, ...Object.keys(updates).map(Number)]))
      setUploadMessage(
        t('instructorPortal.gradeSheetUploadSuccess', '{{count}} student row(s) imported. Save to apply.', {
          count: matched,
        })
      )
    } catch (err) {
      setUploadErrors([err.message || t('common.error', 'Error')])
    } finally {
      if (uploadInputRef.current) uploadInputRef.current.value = ''
    }
  }

  const handleSubmitFinal = async () => {
    if (!declarationChecked || !selectedClassId || !gradeEntryAllowed) return
    if (hasUnsaved) {
      setSubmitError(t('instructorPortal.saveBeforeSubmit', 'Save your grade changes before final submission.'))
      return
    }
    setSubmitting(true)
    setSubmitError('')
    setSubmitSuccess('')
    try {
      if (!selectedClass) throw new Error('Class not found')
      if (enrollments.length === 0) {
        throw new Error(t('instructorPortal.noStudentsToSubmit', 'No enrolled students to submit.'))
      }

      const missing = enrollments.filter((e) => {
        const pct = getTotalPercent(draftGrades[e.id], gradeConfig)
        return pct == null
      })
      if (missing.length > 0) {
        throw new Error(
          t(
            'instructorPortal.submitBlockedMissingGrades',
            'Some students are missing grades. Please complete grading before submitting final grades.'
          )
        )
      }
      if (!checklist.weightsEqual100) {
        throw new Error(
          t('instructorPortal.submitBlockedWeights', 'Grade weights must total 100% before final submission.')
        )
      }

      const nowIso = new Date().toISOString()
      const payloads = enrollments.map((e) => {
        const g = draftGrades[e.id] || {}
        return {
          enrollment_id: e.id,
          class_id: selectedClass.id,
          student_id: e.student_id,
          semester_id: selectedClass.semester_id ?? null,
          college_id: selectedClass.college_id ?? instructor?.college_id ?? null,
          numeric_grade: g.numeric_grade ?? null,
          letter_grade: g.letter_grade ?? null,
          gpa_points: g.gpa_points ?? null,
          midterm: g.midterm ?? null,
          final: g.final ?? null,
          assignments: g.assignments ?? null,
          quizzes: g.quizzes ?? null,
          class_participation: g.class_participation ?? null,
          project: g.project ?? null,
          lab: g.lab ?? null,
          other: g.other ?? null,
          status: 'final',
          graded_by: instructor?.id ?? null,
          graded_at: nowIso,
          notes: submitNotes?.trim() ? submitNotes.trim() : null,
          updated_at: nowIso,
        }
      })

      const chunkSize = 50
      for (let i = 0; i < payloads.length; i += chunkSize) {
        const chunk = payloads.slice(i, i + chunkSize)
        const { error } = await supabase.from('grade_components').upsert(chunk, { onConflict: 'enrollment_id' })
        if (error) throw error
      }

      const { data: gradesData, error: gErr } = await supabase
        .from('grade_components')
        .select('*')
        .in(
          'enrollment_id',
          enrollments.map((e) => e.id)
        )
      if (gErr) throw gErr
      const map = {}
      ;(gradesData || []).forEach((g) => {
        map[g.enrollment_id] = g
      })
      setGradesMap(map)
      setSubmitSuccess(t('instructorPortal.gradesSubmittedSuccess', 'Final grades submitted successfully.'))
      setDeclarationChecked(false)
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
    enrollments.length > 0 &&
    !hasUnsaved

  const configLabel = (c) =>
    getLocalizedName(
      { name_en: c.grade_type_name_en, name_ar: c.grade_type_name_ar },
      isArabic
    ) || c.grade_type_name_en || c.field || c.grade_type_code

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

  const toolbar = (
    <div className="grade-sheet-toolbar">
      <button
        type="button"
        className="btn btn-p"
        disabled={!gradeEntryAllowed || !hasUnsaved || saving}
        onClick={handleSave}
      >
        {saving ? t('common.saving', 'Saving…') : `💾 ${t('instructorPortal.saveGrades', 'Save grades')}`}
      </button>
      <button
        type="button"
        className={`btn btn-gh${showUploadPanel ? ' active' : ''}`}
        onClick={() => setShowUploadPanel((v) => !v)}
      >
        📥 {t('instructorPortal.uploadGrades', 'Upload grades')}
      </button>
      <button
        type="button"
        className={`btn btn-gh${showSubmitPanel ? ' active' : ''}`}
        disabled={!gradeEntryAllowed}
        onClick={() => setShowSubmitPanel((v) => !v)}
      >
        📤 {t('instructorPortal.submitFinalGrades', 'Submit final grades')}
      </button>
      {hasUnsaved && (
        <span className="grade-sheet-unsaved">{t('instructorPortal.unsavedGradeChanges', 'Unsaved changes')}</span>
      )}
    </div>
  )

  return (
    <div className={embedded ? 'grade-sheet-root grade-sheet-root--embedded' : 'grade-sheet-root'}>
      {!embedded && (
        <>
          <nav className="bc" aria-label={t('instructorPortal.dashboard')}>
            <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
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
                      {cls.subjects?.code} — {getLocalizedName(cls.subjects, isArabic)}
                    </option>
                  ))}
                </select>
              )}
              {toolbar}
            </div>
          </div>
        </>
      )}

      {embedded && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-hd">
            <div className="card-title">{t('instructorPortal.gradebook')}</div>
            <div className="grade-sheet-toolbar grade-sheet-toolbar--embedded">
              {classes.length > 1 ? (
                <select
                  className="fc"
                  style={{ width: 'auto' }}
                  value={selectedClassId || ''}
                  onChange={(e) => setSelectedClassId(e.target.value ? Number(e.target.value) : null)}
                >
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.subjects?.code} — {getLocalizedName(cls.subjects, isArabic)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="ts">{subjectCode}</span>
              )}
              {toolbar}
            </div>
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

      {(saveError || saveSuccess || fieldError) && (
        <div style={{ marginBottom: 12 }}>
          {saveError && (
            <div className="alert alert-err" role="alert">
              {saveError}
            </div>
          )}
          {fieldError && (
            <div className="alert alert-warn" role="status">
              {fieldError}
            </div>
          )}
          {saveSuccess && (
            <div className="alert alert-ok" role="status">
              {t('grading.classGrades.savedSuccess', 'Grades saved successfully.')}
            </div>
          )}
        </div>
      )}

      {showUploadPanel && (
        <div className="card grade-sheet-panel" style={{ marginBottom: 16 }}>
          <div className="card-hd">
            <div className="card-title">📥 {t('instructorPortal.uploadGrades', 'Upload grades')}</div>
          </div>
          <div className="grade-sheet-panel-body">
            <p className="grade-sheet-hint">
              {t(
                'instructorPortal.gradeSheetUploadHint',
                'Download the template, fill in component scores per student, then upload the file. Imported values appear in the table — click Save grades to store them.'
              )}
            </p>
            <div className="grade-sheet-upload-actions">
              <button
                type="button"
                className="btn btn-gh"
                onClick={() =>
                  downloadGradeSheetTemplate(
                    enrollments,
                    gradeConfig,
                    `${subjectCode || 'grades'}-template.xlsx`
                  )
                }
              >
                {t('instructorPortal.downloadTemplate', 'Download template')}
              </button>
              <label className="btn btn-p grade-sheet-file-label">
                {t('instructorPortal.chooseFile', 'Choose file')}
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  hidden
                  disabled={!gradeEntryAllowed}
                  onChange={(e) => handleUploadFile(e.target.files?.[0])}
                />
              </label>
            </div>
            {uploadMessage && <div className="alert alert-ok">{uploadMessage}</div>}
            {uploadErrors.length > 0 && (
              <div className="alert alert-warn">
                <ul className="grade-sheet-error-list">
                  {uploadErrors.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {showSubmitPanel && (
        <div className="card grade-sheet-panel" style={{ marginBottom: 16 }}>
          <div className="card-hd">
            <div className="card-title">📤 {t('instructorPortal.submitFinalGradesToRecord')}</div>
          </div>
          <div className="grade-sheet-panel-body">
            <div className="alert alert-warn" role="alert">
              {t('instructorPortal.gradeSubmissionWarning')}
            </div>
            {submitError && <div className="alert alert-err">{submitError}</div>}
            {submitSuccess && <div className="alert alert-ok">{submitSuccess}</div>}
            {!gradeEntryAllowed && selectedClass && (
              <div className="alert alert-err">{t('instructorPortal.semesterLifecycle.gradeSubmitBlocked')}</div>
            )}

            <div className="grid2" style={{ marginTop: 12 }}>
              <div>
                <div className="card" style={{ marginBottom: 12 }}>
                  <div className="card-hd">
                    <div className="card-title">{t('instructorPortal.preSubmissionChecklist')}</div>
                  </div>
                  <ul className="grade-sheet-checklist">
                    <li className={checklist.allStudentsHaveGrades ? 'ok' : 'warn'}>
                      {checklist.allStudentsHaveGrades ? '✓' : '○'}{' '}
                      {t('instructorPortal.checkAllStudentsHaveGrades')} ({checklist.gradesComplete}/
                      {checklist.studentsTotal})
                    </li>
                    <li className={checklist.weightsEqual100 ? 'ok' : 'warn'}>
                      {checklist.weightsEqual100 ? '✓' : '○'} {t('instructorPortal.checkWeights100')} (
                      {checklist.weightsBreakdown})
                    </li>
                    {checklist.failingCount > 0 && (
                      <li className="warn">
                        {t('instructorPortal.checkStudentsBelow60', { count: checklist.failingCount })}
                      </li>
                    )}
                  </ul>
                </div>
                <label className="fg">
                  <span className="fl">{t('instructorPortal.notesForAcademicRecord')}</span>
                  <textarea
                    className="fc"
                    rows={3}
                    value={submitNotes}
                    onChange={(e) => setSubmitNotes(e.target.value)}
                    placeholder={t('instructorPortal.notesPlaceholder')}
                  />
                </label>
              </div>
              <div>
                <div className="card">
                  <div className="card-hd">
                    <div className="card-title">{t('instructorPortal.submitAction')}</div>
                  </div>
                  <p className="grade-sheet-meta">
                    <strong>{t('instructorPortal.course')}:</strong> {courseName} ({subjectCode})
                    <br />
                    <strong>{t('instructorPortal.academicSemester')}:</strong> {semesterLabel}
                    <br />
                    <strong>{t('instructorPortal.numberOfStudents')}:</strong> {enrollments.length}
                  </p>
                  <label className="grade-sheet-declaration">
                    <input
                      type="checkbox"
                      checked={declarationChecked}
                      onChange={(e) => setDeclarationChecked(e.target.checked)}
                    />
                    <span>{t('instructorPortal.declarationText')}</span>
                  </label>
                  <p className="grade-sheet-hint">{t('instructorPortal.submitGradesIrreversible')}</p>
                  <button
                    type="button"
                    className="btn btn-p"
                    style={{ width: '100%', marginTop: 12 }}
                    disabled={!canSubmitFinally || submitting}
                    onClick={handleSubmitFinal}
                  >
                    {submitting
                      ? t('common.submitting', 'Submitting…')
                      : t('instructorPortal.submitGradesFinally')}
                  </button>
                </div>
              </div>
            </div>
          </div>
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
          <div className="sc-sub">{t('instructorPortal.studentsCount', { count: enrollments.length })}</div>
        </div>
      </div>

      {gradeConfig.length > 0 && (
        <div className="card grade-sheet-weights">
          <div className="card-hd">
            <div className="card-title">⚙️ {t('instructorPortal.weightSettings')}</div>
          </div>
          <div className="grade-sheet-weight-chips">
            {gradeConfig.map((c) => (
              <div key={c.grade_type_id || c.grade_type_code} className="grade-sheet-weight-chip">
                <span className="grade-sheet-weight-name">{configLabel(c)}</span>
                <span className="grade-sheet-weight-pct">{c.weight ?? 0}%</span>
                <span className="grade-sheet-weight-max">
                  {t('instructorPortal.maxScore', 'Max')} {c.maximum ?? 100}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card grade-sheet-table-card">
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
        <div className="tw grade-sheet-table-wrap">
          <table className="grade-sheet-table">
            <thead>
              <tr>
                <th className="grade-sheet-sticky-col">{t('instructorPortal.student')}</th>
                {editableColumns.map((c) => (
                  <th key={c.grade_type_id || c.field || c.grade_type_code} className="grade-sheet-component-col">
                    <span className="grade-sheet-col-title">{configLabel(c)}</span>
                    {c.weight != null && (
                      <span className="grade-sheet-col-weight">{c.weight}%</span>
                    )}
                    <span className="grade-sheet-col-max">/{c.maximum ?? 100}</span>
                  </th>
                ))}
                <th className="grade-sheet-total-col">{t('instructorPortal.total')}</th>
                <th>{t('instructorPortal.gradeLetter')}</th>
                <th>{t('instructorPortal.status', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredEnrollments.length === 0 ? (
                <tr>
                  <td colSpan={editableColumns.length + 4} className="grade-sheet-empty">
                    {t('instructorPortal.noStudentsInClass', 'No enrolled students in this class.')}
                  </td>
                </tr>
              ) : (
                filteredEnrollments.map((enrollment) => {
                  const g = draftGrades[enrollment.id] || {}
                  const pct = getTotalPercent(g, gradeConfig)
                  const letter = g.letter_grade || getLetterFromPercent(pct, gradingScale)
                  const student = enrollment.students
                  const isFailing = pct != null && pct < 60
                  const isFinal = g.status === 'final'
                  const isDirty = dirtyIds.has(enrollment.id)
                  const rowLocked = !gradeEntryAllowed || isFinal

                  return (
                    <tr
                      key={enrollment.id}
                      className={[
                        isFailing ? 'grade-sheet-row--risk' : '',
                        isDirty ? 'grade-sheet-row--dirty' : '',
                        isFinal ? 'grade-sheet-row--final' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <td className="grade-sheet-sticky-col">
                        <div className="grade-sheet-student-name">{displayStudentName(student)}</div>
                        <div className="grade-sheet-student-id">{student?.student_id ?? '—'}</div>
                      </td>
                      {editableColumns.map((c) => {
                        const field = getConfigFieldName(c)
                        const max = c.maximum ?? 100
                        const min = c.minimum ?? 0
                        const value = g[field] ?? ''
                        return (
                          <td key={c.grade_type_id || c.field || c.grade_type_code} className="grade-sheet-input-cell">
                            <input
                              type="number"
                              className="fc grade-sheet-input"
                              step="0.01"
                              min={min}
                              max={max}
                              value={value === null || value === undefined ? '' : value}
                              disabled={rowLocked}
                              placeholder="—"
                              aria-label={`${configLabel(c)} — ${displayStudentName(student)}`}
                              onChange={(e) => handleFieldChange(enrollment.id, field, e.target.value, c)}
                            />
                          </td>
                        )
                      })}
                      <td className="grade-sheet-total-col">
                        <span
                          className={`grade-sheet-total${isFailing ? ' grade-sheet-total--fail' : pct != null ? ' grade-sheet-total--pass' : ''}`}
                        >
                          {pct != null ? `${pct.toFixed(1)}%` : '—'}
                        </span>
                      </td>
                      <td className="grade-sheet-letter-col">
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
                        {isFinal ? (
                          <span className="badge" data-status="ok">
                            {t('instructorPortal.gradeStatusFinal', 'Final')}
                          </span>
                        ) : isDirty ? (
                          <span className="badge" data-status="pending">
                            {t('instructorPortal.unsaved', 'Unsaved')}
                          </span>
                        ) : pct != null ? (
                          <span className="badge" data-status="info">
                            {t('instructorPortal.gradeStatusDraft', 'Draft')}
                          </span>
                        ) : (
                          <span className="badge" data-status="pending">
                            {t('instructorPortal.incomplete')}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
