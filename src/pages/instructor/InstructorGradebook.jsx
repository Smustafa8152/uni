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
  numericGradeToGpaPoints,
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
import {
  ASSESSMENT_GROUPS,
  deriveRecordStatus,
  groupConfigByAssessment,
  isFieldLockedByApproval,
  RECORD_STATUS_OPTIONS,
  totalConfigWeight,
  getGradeRowClassFromPercent,
  getGradeBadgeClassFromPercent,
  getScoreClassFromPercent,
} from '../../utils/gradeAssessmentGroups'
import {
  approveAssessmentGroup,
  fetchClassAssessmentApprovals,
  fetchGradeAuditLog,
  notifyGradeApproval,
  writeGradeAuditLog,
} from '../../utils/gradeAudit'
import {
  computeGradeDistribution,
  exportGradeSheetExcel,
  exportGradeSheetPdf,
} from '../../utils/exportInstructorGradeSheet'
import { useGradeAutoSave } from '../../hooks/useGradeAutoSave'
import {
  fetchExamScoresByEnrollment,
  mergeExamScoresIntoDrafts,
  persistExamScoresToGradebook,
} from '../../utils/syncExamGradesToGradebook'

export default function InstructorGradebook({ embedded = false, embedClassId = null } = {}) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const classIdParam = embedded && embedClassId != null ? String(embedClassId) : searchParams.get('classId')
  const panelParam = searchParams.get('panel')

  const [loading, setLoading] = useState(true)
  const [instructor, setInstructor] = useState(null)
  const [appUserId, setAppUserId] = useState(null)
  const [classes, setClasses] = useState([])
  const [selectedClassId, setSelectedClassId] = useState(classIdParam ? Number(classIdParam) : null)
  const [classData, setClassData] = useState(null)
  const [enrollments, setEnrollments] = useState([])
  const [gradesMap, setGradesMap] = useState({})
  const [draftGrades, setDraftGrades] = useState({})
  const [dirtyIds, setDirtyIds] = useState(() => new Set())
  const [gradeConfig, setGradeConfig] = useState([])
  const [gradingScale, setGradingScale] = useState([])
  const [approvalsMap, setApprovalsMap] = useState({})
  const [filterStatus, setFilterStatus] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const [autoSaveStatus, setAutoSaveStatus] = useState(null)

  const [showUploadPanel, setShowUploadPanel] = useState(panelParam === 'upload')
  const [uploadErrors, setUploadErrors] = useState([])
  const [uploadMessage, setUploadMessage] = useState('')
  const uploadInputRef = useRef(null)

  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showApproveMenu, setShowApproveMenu] = useState(false)
  const [approving, setApproving] = useState(false)
  const [approveError, setApproveError] = useState('')

  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [historyEnrollmentId, setHistoryEnrollmentId] = useState(null)
  const [auditLog, setAuditLog] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)

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

  const groupedColumns = useMemo(() => {
    const g = groupConfigByAssessment(editableColumns)
    return [...g.activities, ...g.midterm, ...g.final]
  }, [editableColumns])

  const weightsTotal = useMemo(() => totalConfigWeight(editableColumns), [editableColumns])
  const weightsOk = Math.abs(weightsTotal - 100) < 0.01

  useEffect(() => {
    if (user?.email) {
      getActiveInstructorByEmail(user.email).then((data) => data && setInstructor(data))
      supabase
        .from('users')
        .select('id')
        .ilike('email', user.email)
        .maybeSingle()
        .then(({ data }) => data?.id && setAppUserId(data.id))
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
      setApprovalsMap({})
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
      fetchClassAssessmentApprovals(selectedClassId),
    ]).then(([{ data: enrollData }, gradeTypes, approvals]) => {
      const enrolls = enrollData || []
      setEnrollments(enrolls)
      setApprovalsMap(approvals || {})

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
        .then(async ({ data: gradesData }) => {
          const map = {}
          ;(gradesData || []).forEach((g) => {
            map[g.enrollment_id] = g
          })
          setGradesMap(map)
          const merged = mergeGradeConfigWithTypes(subjectConfig, gradeTypes)
          const base = {}
          enrolls.forEach((e) => {
            const existing = map[e.id] || {}
            base[e.id] = {
              enrollment_id: e.id,
              class_id: selectedClassId,
              student_id: e.student_id,
              ...existing,
              record_status:
                existing.record_status || deriveRecordStatus(existing, merged.length ? merged : LEGACY_GRADE_COLUMNS),
            }
          })

          // Pull online exam submission scores into empty gradebook cells
          try {
            const { byEnrollment } = await fetchExamScoresByEnrollment(selectedClassId)
            const { nextDrafts, dirtyEnrollmentIds } = mergeExamScoresIntoDrafts(
              base,
              byEnrollment,
              merged.length ? merged : LEGACY_GRADE_COLUMNS,
            )
            setDraftGrades(nextDrafts)
            setDirtyIds(new Set())

            if (dirtyEnrollmentIds.length) {
              await persistExamScoresToGradebook({
                classId: selectedClassId,
                classData: cls,
                enrollments: enrolls,
                draftGrades: nextDrafts,
                dirtyEnrollmentIds,
                gradeConfig: merged.length ? merged : LEGACY_GRADE_COLUMNS,
                instructorId: instructor?.id,
              })
              // Refresh persisted rows
              const { data: refreshed } = await supabase
                .from('grade_components')
                .select('*')
                .in(
                  'enrollment_id',
                  enrolls.map((e) => e.id),
                )
              if (refreshed) {
                const map2 = {}
                refreshed.forEach((g) => {
                  map2[g.enrollment_id] = g
                })
                setGradesMap(map2)
                const base2 = { ...nextDrafts }
                enrolls.forEach((e) => {
                  if (map2[e.id]) {
                    base2[e.id] = {
                      ...base2[e.id],
                      ...map2[e.id],
                      enrollment_id: e.id,
                      class_id: selectedClassId,
                      student_id: e.student_id,
                    }
                  }
                })
                setDraftGrades(base2)
              }
            }
          } catch (syncErr) {
            console.error('Exam→gradebook sync', syncErr)
            setDraftGrades(base)
            setDirtyIds(new Set())
          }
        })
        .finally(() => setLoading(false))
    })
  }, [selectedClassId, instructor?.id, classes])

  useEffect(() => {
    if (panelParam === 'upload') setShowUploadPanel(true)
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

  const getRecordStatus = useCallback(
    (enrollmentId) => {
      const g = draftGrades[enrollmentId]
      if (g?.record_status === 'debarred' || g?.record_status === 'withdrawn') return g.record_status
      return deriveRecordStatus(g, gradeConfig.length ? gradeConfig : editableColumns)
    },
    [draftGrades, gradeConfig, editableColumns]
  )

  const stats = useMemo(() => {
    const rows = enrollments.map((e) => ({
      enrollment: e,
      grade: draftGrades[e.id],
      percent: getTotalPercent(draftGrades[e.id], gradeConfig.length ? gradeConfig : editableColumns),
      recordStatus: getRecordStatus(e.id),
    }))
    const withPercent = rows.filter((r) => r.percent != null)
    const courseAvg =
      withPercent.length > 0 ? withPercent.reduce((a, r) => a + r.percent, 0) / withPercent.length : null
    const failing = rows.filter((r) => r.percent != null && r.percent < 60).length
    const passCount = rows.filter((r) => r.percent != null && r.percent >= 60).length
    const graded = withPercent.length
    const passRate = graded > 0 ? Math.round((passCount / graded) * 100) : null
    const highest = withPercent.length
      ? withPercent.reduce((best, r) => (r.percent > (best?.percent ?? 0) ? r : best), withPercent[0])
      : null
    const lowest = withPercent.length
      ? withPercent.reduce((worst, r) => (r.percent < (worst?.percent ?? 100) ? r : worst), withPercent[0])
      : null
    const completeCount = rows.filter((r) => r.recordStatus === 'complete').length
    const incompleteCount = rows.filter(
      (r) => r.recordStatus === 'incomplete' || r.recordStatus === 'not_recorded'
    ).length
    const debarredCount = rows.filter((r) => r.recordStatus === 'debarred').length
    const completionRate =
      enrollments.length > 0 ? Math.round((completeCount / enrollments.length) * 100) : 0

    return {
      courseAvg: courseAvg != null ? courseAvg.toFixed(2) : '—',
      highest: highest?.percent != null ? Math.round(highest.percent) : '—',
      highestName: highest?.enrollment?.students ? displayStudentName(highest.enrollment.students) : '—',
      lowest: lowest?.percent != null ? Math.round(lowest.percent) : '—',
      failingCount: failing,
      passRate: passRate != null ? `${passRate}%` : '—',
      passCount,
      failCount: failing,
      completeCount,
      incompleteCount,
      debarredCount,
      completionRate,
      totalStudents: enrollments.length,
    }
  }, [enrollments, draftGrades, gradeConfig, editableColumns, displayStudentName, getRecordStatus])

  const gradeAnalytics = useMemo(
    () => computeGradeDistribution(enrollments, draftGrades, gradeConfig.length ? gradeConfig : editableColumns, gradingScale),
    [enrollments, draftGrades, gradeConfig, editableColumns, gradingScale]
  )

  const filteredEnrollments = useMemo(() => {
    let list = enrollments
    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((e) => {
        const s = e.students
        if (!s) return false
        const sid = String(s.student_id || '').toLowerCase()
        const names = [s.name_en, s.name_ar, s.first_name, s.last_name, s.first_name_ar, s.last_name_ar]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return sid.includes(q) || names.includes(q)
      })
    }
    if (filterStatus === 'all') return list
    return list.filter((e) => {
      const g = draftGrades[e.id]
      const pct = getTotalPercent(g, gradeConfig.length ? gradeConfig : editableColumns)
      const rs = getRecordStatus(e.id)
      if (filterStatus === 'below60') return pct != null && pct < 60
      if (filterStatus === 'complete') return rs === 'complete'
      if (filterStatus === 'incomplete') return rs === 'incomplete'
      if (filterStatus === 'not_recorded') return rs === 'not_recorded'
      if (filterStatus === 'debarred') return rs === 'debarred'
      if (filterStatus === 'withdrawn') return rs === 'withdrawn'
      return true
    })
  }, [enrollments, draftGrades, filterStatus, gradeConfig, editableColumns, searchQuery, getRecordStatus])

  const saveRows = useCallback(
    async (enrollmentIds, changeSource = 'manual') => {
      if (!gradeEntryAllowed || !enrollmentIds?.length) return
      setSaving(true)
      setSaveError('')
      if (changeSource === 'manual') setSaveSuccess(false)
      try {
        const configForCalc = gradeConfig.length ? gradeConfig : editableColumns
        for (const enrollmentId of enrollmentIds) {
          const row = draftGrades[enrollmentId]
          if (!row) continue
          const enrollment = enrollments.find((e) => e.id === enrollmentId)
          const oldRow = gradesMap[enrollmentId]
          const withStatus = {
            ...row,
            status: row.status === 'final' || row.status === 'submitted' ? row.status : 'draft',
            record_status: row.record_status || deriveRecordStatus(row, configForCalc),
          }
          const payload = buildGradeUpsertPayload(withStatus, enrollment, selectedClass, instructor?.id)
          const { data, error } = await supabase
            .from('grade_components')
            .upsert(payload, { onConflict: 'enrollment_id' })
            .select()
            .single()
          if (error) throw error
          await writeGradeAuditLog({
            oldRow,
            newRow: data,
            enrollmentId,
            classId: selectedClassId,
            gradeComponentId: data?.id,
            userId: appUserId,
            changeSource,
          })
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
        setDirtyIds((prev) => {
          const next = new Set(prev)
          enrollmentIds.forEach((id) => next.delete(id))
          return next
        })
        if (changeSource === 'manual') {
          setSaveSuccess(true)
          setTimeout(() => setSaveSuccess(false), 3000)
        } else {
          setAutoSaveStatus({ type: 'ok', at: new Date() })
        }
      } catch (err) {
        const msg = err.message || t('grading.classGrades.failedToSave', 'Failed to save grades')
        if (changeSource === 'manual') setSaveError(msg)
        else setAutoSaveStatus({ type: 'err', message: msg })
      } finally {
        setSaving(false)
      }
    },
    [
      gradeEntryAllowed,
      draftGrades,
      enrollments,
      gradesMap,
      selectedClass,
      instructor?.id,
      selectedClassId,
      appUserId,
      gradeConfig,
      editableColumns,
      t,
    ]
  )

  const { scheduleRowSave } = useGradeAutoSave({
    dirtyIds,
    saveRows,
    enabled: gradeEntryAllowed && !saving,
  })

  const handleFieldChange = (enrollmentId, field, value, config) => {
    setFieldError('')
    if (config && value !== '') {
      const err = validateGradeValue(value, config, t)
      if (err) setFieldError(err)
    }
    const configForCalc = gradeConfig.length ? gradeConfig : editableColumns
    setDraftGrades((prev) => {
      const current = prev[enrollmentId] || {
        enrollment_id: enrollmentId,
        class_id: selectedClassId,
        student_id: enrollments.find((e) => e.id === enrollmentId)?.student_id,
      }
      const updated = applyGradeFieldChange(current, {
        field,
        value,
        gradeConfig: configForCalc,
        gradingScale,
      })
      updated.record_status = deriveRecordStatus(updated, configForCalc)
      return { ...prev, [enrollmentId]: updated }
    })
    setDirtyIds((prev) => new Set(prev).add(enrollmentId))
    setSaveSuccess(false)
  }

  const handleRecordStatusChange = (enrollmentId, status) => {
    setDraftGrades((prev) => ({
      ...prev,
      [enrollmentId]: { ...prev[enrollmentId], record_status: status },
    }))
    setDirtyIds((prev) => new Set(prev).add(enrollmentId))
    scheduleRowSave(enrollmentId)
  }

  const handleSave = () => saveRows([...dirtyIds], 'manual')

  const handleUploadFile = async (file) => {
    if (!file || !gradeEntryAllowed) return
    setUploadErrors([])
    setUploadMessage('')
    const configForCalc = gradeConfig.length ? gradeConfig : editableColumns
    try {
      const buf = await file.arrayBuffer()
      const { updates, errors, matched } = parseGradeUploadWorkbook(buf, {
        enrollments,
        gradeConfig: configForCalc,
      })
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
          const finalized = finalizeGradeRow({ ...current, ...patch }, configForCalc, gradingScale)
          finalized.record_status = deriveRecordStatus(finalized, configForCalc)
          next[id] = finalized
        })
        return next
      })
      const ids = Object.keys(updates).map(Number)
      setDirtyIds((prev) => new Set([...prev, ...ids]))
      setUploadMessage(
        t('instructorPortal.gradeSheetUploadSuccess', '{{count}} student row(s) imported. Save to apply.', {
          count: matched,
        })
      )
      await saveRows(ids, 'upload')
    } catch (err) {
      setUploadErrors([err.message || t('common.error', 'Error')])
    } finally {
      if (uploadInputRef.current) uploadInputRef.current.value = ''
    }
  }

  const handleApproveGroup = async (group) => {
    if (!selectedClassId || !instructor?.id || !gradeEntryAllowed) return
    if (!weightsOk) {
      setApproveError(t('instructorPortal.submitBlockedWeights', 'Grade weights must total 100% before approval.'))
      return
    }
    if (hasUnsaved) {
      setApproveError(t('instructorPortal.saveBeforeSubmit', 'Save your grade changes before approval.'))
      return
    }
    setApproving(true)
    setApproveError('')
    try {
      const semester = selectedClass?.semesters
      const groupsToApprove = group === 'all' ? ASSESSMENT_GROUPS : [group]
      for (const g of groupsToApprove) {
        if (approvalsMap[g]?.status === 'approved') continue
        await approveAssessmentGroup({
          classId: selectedClassId,
          assessmentGroup: g,
          instructorId: instructor.id,
          entryStartedAt: semester?.start_date ?? null,
          entryEndedAt: semester?.end_date ?? null,
        })
      }
      const updated = await fetchClassAssessmentApprovals(selectedClassId)
      setApprovalsMap(updated)
      try {
        for (const g of groupsToApprove) {
          await notifyGradeApproval({
            classId: selectedClassId,
            assessmentGroup: g,
            collegeId: selectedClass?.college_id,
          })
        }
      } catch (notifyErr) {
        console.warn('grade approval notification failed:', notifyErr)
      }
      setShowApproveMenu(false)
    } catch (err) {
      setApproveError(err?.message || t('common.error', 'Error'))
    } finally {
      setApproving(false)
    }
  }

  const openHistory = async (enrollmentId) => {
    setHistoryEnrollmentId(enrollmentId)
    setShowHistoryModal(true)
    setAuditLoading(true)
    try {
      const log = await fetchGradeAuditLog(enrollmentId)
      setAuditLog(log)
    } catch {
      setAuditLog([])
    } finally {
      setAuditLoading(false)
    }
  }

  const configLabel = (c) => {
    const fieldLabels = {
      assignments: isArabic ? 'الواجبات' : 'Assignments',
      quizzes: isArabic ? 'الاختبارات القصيرة' : 'Quizzes',
      class_participation: isArabic ? 'المشاركة' : 'Participation',
      midterm: isArabic ? 'النصفي' : 'Midterm',
      final: isArabic ? 'النهائي' : 'Final',
    }
    const field = c.field || c.dbColumn
    if (fieldLabels[field]) return fieldLabels[field]
    return (
      getLocalizedName(
        { name_en: c.grade_type_name_en, name_ar: c.grade_type_name_ar },
        isArabic
      ) || c.grade_type_name_en || c.field || c.grade_type_code
    )
  }

  const groupLabel = (group) => t(`instructorPortal.assessmentGroup.${group}`, group)

  const formatApprovalDate = (iso) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString(isArabic ? 'ar' : 'en')
    } catch {
      return iso
    }
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

  const submissionLink = `/instructor/grade-submission${selectedClassId ? `?classId=${selectedClassId}` : ''}`

  const allGroupsApproved = ASSESSMENT_GROUPS.every((g) => approvalsMap[g]?.status === 'approved')
  const universityName = instructor?.colleges ? getLocalizedName(instructor.colleges, isArabic) : ''
  const universityNameEn = instructor?.colleges?.name_en || ''
  const instructorName = instructor ? getLocalizedName(instructor, isArabic) : '—'
  const printDate = (() => {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`
  })()
  const printUser = user?.email?.split('@')[0] || '—'

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
      <div className="grade-sheet-approve-wrap" style={{ position: 'relative' }}>
        <button
          type="button"
          className="btn btn-gh"
          disabled={!gradeEntryAllowed || approving}
          onClick={() => setShowApproveMenu((v) => !v)}
        >
          ✓ {t('instructorPortal.approveGrades', 'Approve…')}
        </button>
        {showApproveMenu && (
          <div className="grade-sheet-approve-menu" style={{ position: 'absolute', top: '100%', left: 0, zIndex: 20, background: 'var(--card)', border: '1px solid var(--bdr)', borderRadius: 'var(--rs)', padding: 8, minWidth: 200 }}>
            {ASSESSMENT_GROUPS.map((g) => (
              <button
                key={g}
                type="button"
                className="btn btn-gh btn-bl"
                style={{ width: '100%', marginBottom: 4 }}
                disabled={approvalsMap[g]?.status === 'approved'}
                onClick={() => handleApproveGroup(g)}
              >
                {groupLabel(g)}
                {approvalsMap[g]?.status === 'approved' ? ' ✓' : ''}
              </button>
            ))}
            <button
              type="button"
              className="btn btn-p btn-bl"
              style={{ width: '100%' }}
              onClick={() => handleApproveGroup('all')}
            >
              {t('instructorPortal.approveAllAssessments', 'Approve all')}
            </button>
          </div>
        )}
      </div>
      <button type="button" className="btn btn-gh" onClick={() => setShowStatusModal(true)}>
        📋 {t('instructorPortal.assessmentStatus', 'Assessment status')}
      </button>
      <Link to={submissionLink} className="btn btn-gh">
        📤 {t('instructorPortal.submitFinalGrades', 'Submit final grades')}
      </Link>
      {hasUnsaved && (
        <span className="grade-sheet-unsaved">{t('instructorPortal.unsavedGradeChanges', 'Unsaved changes')}</span>
      )}
      {autoSaveStatus?.type === 'ok' && (
        <span className="grade-sheet-autosave-ok" style={{ fontSize: 12, color: 'var(--muted)' }}>
          {t('instructorPortal.autoSavedAt', 'Auto-saved {{time}}', {
            time: autoSaveStatus.at?.toLocaleTimeString?.() ?? '',
          })}
        </span>
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
              {!weightsOk && (
                <div className="alert alert-warn" role="status" style={{ marginTop: 12 }}>
                  {t('instructorPortal.weightsNot100', 'Grade weights total {{total}}% — must equal 100%.', {
                    total: weightsTotal.toFixed(0),
                  })}
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
            <div className="grade-sheet-toolbar grade-sheet-toolbar--embedded">{toolbar}</div>
          </div>
        </div>
      )}

      {(saveError || saveSuccess || fieldError || approveError) && (
        <div style={{ marginBottom: 12 }}>
          {saveError && <div className="alert alert-err">{saveError}</div>}
          {approveError && <div className="alert alert-err">{approveError}</div>}
          {fieldError && <div className="alert alert-warn">{fieldError}</div>}
          {saveSuccess && (
            <div className="alert alert-ok">{t('grading.classGrades.savedSuccess', 'Grades saved successfully.')}</div>
          )}
        </div>
      )}

      {showUploadPanel && (
        <div className="card grade-sheet-panel" style={{ marginBottom: 16 }}>
          <div className="card-hd">
            <div className="card-title">📥 {t('instructorPortal.uploadGrades', 'Upload grades')}</div>
          </div>
          <div className="grade-sheet-panel-body">
            <p className="grade-sheet-hint">{t('instructorPortal.gradeSheetUploadHint')}</p>
            <div className="grade-sheet-upload-actions">
              <button
                type="button"
                className="btn btn-gh"
                onClick={() =>
                  downloadGradeSheetTemplate(enrollments, gradeConfig.length ? gradeConfig : editableColumns, `${subjectCode || 'grades'}-template.xlsx`)
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

      <div className={`grade-sheet-report${embedded ? ' grade-sheet-report--embedded' : ''}`}>
        <div className="gs-report-header">
          <div className="gs-header-top">
            <div>
              <div className="gs-univ-name-ar">{universityName || t('instructorPortal.universityName', 'University')}</div>
              {universityNameEn && <div className="gs-univ-name-en">{universityNameEn}</div>}
              <div className="gs-header-badges">
                {semesterLabel && <span className="gs-semester-badge">{semesterLabel}</span>}
                {allGroupsApproved && (
                  <span className="gs-approved-badge">{t('instructorPortal.deanApproved', 'Approved by dean')}</span>
                )}
              </div>
            </div>
            <div className="gs-logo-circle" aria-hidden="true">🎓</div>
          </div>
        </div>

        <div className="gs-info-section">
          <div className="gs-info-grid">
            <div className="gs-info-card">
              <div className="gs-info-label">{t('instructorPortal.courseCode', 'Course code')}</div>
              <div className="gs-info-value">{subjectCode || '—'}</div>
            </div>
            <div className="gs-info-card">
              <div className="gs-info-label">{t('instructorPortal.courseName', 'Course name')}</div>
              <div className="gs-info-value">{courseName || '—'}</div>
            </div>
            <div className="gs-info-card">
              <div className="gs-info-label">{t('instructorPortal.instructor', 'Instructor')}</div>
              <div className="gs-info-value">{instructorName}</div>
            </div>
            <div className="gs-info-card">
              <div className="gs-info-label">{t('instructorPortal.studyType', 'Study type')}</div>
              <div className="gs-info-value">{t('instructorPortal.regularStudy', 'Regular study')}</div>
            </div>
            <div className="gs-info-card">
              <div className="gs-info-label">{t('instructorPortal.section', 'Section')}</div>
              <div className="gs-info-value">{selectedClass?.section ?? '—'}</div>
            </div>
            <div className="gs-info-card">
              <div className="gs-info-label">{t('instructorPortal.classCode', 'Class')}</div>
              <div className="gs-info-value">{selectedClass?.code ?? '—'}</div>
            </div>
            <div className="gs-info-card">
              <div className="gs-info-label">{t('instructorPortal.printDate', 'Print date')}</div>
              <div className="gs-info-value">{printDate}</div>
            </div>
            <div className="gs-info-card">
              <div className="gs-info-label">{t('instructorPortal.printUser', 'User')}</div>
              <div className="gs-info-value">{printUser}</div>
            </div>
          </div>
        </div>

        <div className="gs-stats-bar">
          <div className="gs-stat-item">
            <span className="gs-stat-num">{stats.totalStudents}</span>
            <span className="gs-stat-label">{t('instructorPortal.totalStudents', 'Total students')}</span>
          </div>
          <div className="gs-stat-divider" />
          <div className="gs-stat-item">
            <span className="gs-stat-num">{stats.passCount}</span>
            <span className="gs-stat-label">{t('instructorPortal.passedStudents', 'Passed')}</span>
          </div>
          <div className="gs-stat-divider" />
          <div className="gs-stat-item">
            <span className="gs-stat-num">{stats.failCount}</span>
            <span className="gs-stat-label">{t('instructorPortal.failedStudents', 'Failed')}</span>
          </div>
          <div className="gs-stat-divider" />
          <div className="gs-stat-item">
            <span className="gs-stat-num">{stats.courseAvg}</span>
            <span className="gs-stat-label">{t('instructorPortal.sectionAverage', 'Section average')}</span>
          </div>
          <div className="gs-stat-divider" />
          <div className="gs-stat-item">
            <span className="gs-stat-num">{stats.highest}</span>
            <span className="gs-stat-label">{t('instructorPortal.highestGrade')}</span>
          </div>
          <div className="gs-stat-divider" />
          <div className="gs-stat-item">
            <span className="gs-stat-num">{stats.lowest}</span>
            <span className="gs-stat-label">{t('instructorPortal.lowestGrade', 'Lowest grade')}</span>
          </div>
          <div className="gs-stat-divider" />
          <div className="gs-stat-item">
            <span className="gs-stat-num">{stats.debarredCount}</span>
            <span className="gs-stat-label">{t('instructorPortal.debarredStudents', 'Debarred')}</span>
          </div>
        </div>

        <div className="gs-report-panel">
          <div className="gs-controls no-print">
            <div className="gs-search-box">
              <input
                type="search"
                id="gradeSearchInput"
                placeholder={t('instructorPortal.searchStudent', 'Search name or ID…')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="gs-controls-actions">
              <select className="gs-filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="all">{t('instructorPortal.allStudents')}</option>
                <option value="complete">{t('instructorPortal.recordStatus.complete', 'Complete')}</option>
                <option value="incomplete">{t('instructorPortal.recordStatus.incomplete', 'Incomplete grades')}</option>
                <option value="not_recorded">{t('instructorPortal.recordStatus.not_recorded', 'Not recorded')}</option>
                <option value="debarred">{t('instructorPortal.recordStatus.debarred', 'Debarred')}</option>
                <option value="withdrawn">{t('instructorPortal.recordStatus.withdrawn', 'Withdrawn')}</option>
                <option value="below60">{t('instructorPortal.below60Percent')}</option>
              </select>
              <button
                type="button"
                className="gs-btn-export"
                title={t('instructorPortal.exportExcel', 'Export Excel')}
                onClick={() =>
                  exportGradeSheetExcel({
                    enrollments,
                    draftGrades,
                    gradeConfig: gradeConfig.length ? gradeConfig : editableColumns,
                    gradingScale,
                    displayStudentName,
                    subjectCode,
                    courseName,
                    semesterLabel,
                    isArabic,
                    universityNameAr: universityName,
                    universityNameEn: universityNameEn,
                    instructorName,
                    section: selectedClass?.section,
                    classCode: selectedClass?.code,
                    printUser,
                    allGroupsApproved,
                    studyType: t('instructorPortal.regularStudy', 'Regular study'),
                  })
                }
              >
                📊 Excel
              </button>
              <button
                type="button"
                className="gs-btn-export"
                title={t('instructorPortal.exportPdf', 'Export PDF')}
                onClick={() =>
                  exportGradeSheetPdf({
                    enrollments,
                    draftGrades,
                    gradeConfig: gradeConfig.length ? gradeConfig : editableColumns,
                    gradingScale,
                    displayStudentName,
                    subjectCode,
                    courseName,
                    semesterLabel,
                    isArabic,
                  })
                }
              >
                📄 PDF
              </button>
              <button type="button" className="gs-btn-export" onClick={() => setShowAnalyticsModal(true)}>
                📈 {t('instructorPortal.gradeCharts', 'Charts')}
              </button>
              <button type="button" className="gs-btn-print" onClick={() => window.print()}>
                🖨️ {t('instructorPortal.print', 'Print')}
              </button>
            </div>
          </div>

          <div className="gs-table-wrapper tw grade-sheet-table-wrap">
            <table className="gs-final-table">
              <colgroup>
                <col className="gs-col-num" />
                <col className="gs-col-id" />
                <col className="gs-col-name" />
                <col className="gs-col-status" />
                {groupedColumns.map((c) => (
                  <col key={c.grade_type_id || c.field || c.grade_type_code} className="gs-col-component" />
                ))}
                <col className="gs-col-summary" />
                <col className="gs-col-summary" />
                <col className="gs-col-summary" />
                <col className="gs-col-record" />
                <col className="gs-col-action" />
              </colgroup>
              <thead>
                <tr>
                  <th className="gs-col-num">#</th>
                  <th className="gs-col-id">{isArabic ? 'رقم الطالب' : 'Student ID'}</th>
                  <th className="gs-col-name">{isArabic ? 'اسم الطالب' : 'Student name'}</th>
                  <th className="gs-col-status">{isArabic ? 'الحالة' : 'Status'}</th>
                  {groupedColumns.map((c) => (
                    <th key={c.grade_type_id || c.field || c.grade_type_code} className="gs-col-component">
                      {configLabel(c)}
                      <br />
                      <small>/{c.maximum ?? 100}</small>
                    </th>
                  ))}
                  <th className="gs-col-summary">
                    {isArabic ? 'المجموع' : 'Total'}
                    <br />
                    <small>/100</small>
                  </th>
                  <th className="gs-col-summary">
                    {isArabic ? 'العلامة بالنقاط' : 'Points'}
                    <br />
                    <small>{isArabic ? 'بالنقاط' : 'GPA'}</small>
                  </th>
                  <th className="gs-col-summary">
                    {isArabic ? 'التقدير' : 'Letter'}
                    <br />
                    <small>{isArabic ? 'بالأحرف' : 'grade'}</small>
                  </th>
                  <th className="gs-col-record">{t('instructorPortal.recordStatusLabel', 'Record')}</th>
                  <th className="gs-col-action" aria-label={t('instructorPortal.gradeHistory')} />
                </tr>
              </thead>
              <tbody>
                {filteredEnrollments.length === 0 ? (
                  <tr>
                    <td colSpan={groupedColumns.length + 8} className="grade-sheet-empty">
                      {t('instructorPortal.noStudentsInClass', 'No enrolled students in this class.')}
                    </td>
                  </tr>
                ) : (
                  filteredEnrollments.map((enrollment, rowIdx) => {
                    const g = draftGrades[enrollment.id] || {}
                    const configForCalc = gradeConfig.length ? gradeConfig : editableColumns
                    const pct = getTotalPercent(g, configForCalc)
                    const letter = g.letter_grade || getLetterFromPercent(pct, gradingScale)
                    const gpaPts =
                      g.gpa_points != null ? Number(g.gpa_points) : pct != null ? numericGradeToGpaPoints(pct, gradingScale) : null
                    const student = enrollment.students
                    const isSubmitted = g.status === 'submitted' || g.status === 'final'
                    const isDirty = dirtyIds.has(enrollment.id)
                    const recordStatus = getRecordStatus(enrollment.id)
                    const rowClass = getGradeRowClassFromPercent(pct)

                    return (
                      <tr
                        key={enrollment.id}
                        className={[
                          rowClass,
                          isDirty ? 'gs-row--dirty' : '',
                          isSubmitted ? 'gs-row--final' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <td className="gs-row-num">{rowIdx + 1}</td>
                        <td className="gs-student-id">{student?.student_id ?? '—'}</td>
                        <td className="gs-name-col">{displayStudentName(student)}</td>
                        <td>
                          <span className="gs-status-badge">{t('instructorPortal.enrolled', 'Enrolled')}</span>
                        </td>
                        {groupedColumns.map((c) => {
                          const field = getConfigFieldName(c)
                          const max = c.maximum ?? 100
                          const min = c.minimum ?? 0
                          const value = g[field] ?? ''
                          const fieldLocked =
                            !gradeEntryAllowed ||
                            isSubmitted ||
                            isFieldLockedByApproval(field, approvalsMap)
                          return (
                            <td key={c.grade_type_id || c.field || c.grade_type_code} className="gs-input-cell">
                              <input
                                type="number"
                                className="gs-grade-input"
                                step="0.01"
                                min={min}
                                max={max}
                                value={value === null || value === undefined ? '' : value}
                                disabled={fieldLocked}
                                placeholder="—"
                                onChange={(e) => handleFieldChange(enrollment.id, field, e.target.value, c)}
                                onBlur={() => scheduleRowSave(enrollment.id)}
                              />
                            </td>
                          )
                        })}
                        <td className="gs-total-col">
                          <span className={`gs-score-cell ${getScoreClassFromPercent(pct)}`}>
                            {pct != null ? Math.round(pct) : '—'}
                          </span>
                        </td>
                        <td className="gs-points-col">
                          <strong className="gs-points-val">{gpaPts != null ? gpaPts.toFixed(2) : '—'}</strong>
                        </td>
                        <td className="gs-letter-col">
                          {letter ? (
                            <span className={`gs-grade-badge ${getGradeBadgeClassFromPercent(pct)}`}>{letter}</span>
                          ) : (
                            <span className="gs-grade-badge gs-grade-empty">—</span>
                          )}
                        </td>
                        <td className="gs-record-col">
                          <select
                            className="gs-record-select"
                            value={recordStatus}
                            disabled={!gradeEntryAllowed || isSubmitted}
                            onChange={(e) => handleRecordStatusChange(enrollment.id, e.target.value)}
                          >
                            {RECORD_STATUS_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {t(`instructorPortal.recordStatus.${s}`, s)}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="gs-action-col">
                          <button
                            type="button"
                            className="gs-history-btn"
                            title={t('instructorPortal.gradeHistory', 'Grade history')}
                            onClick={() => openHistory(enrollment.id)}
                          >
                            🕐
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="gs-report-footer">
          <div>
            {universityName || t('instructorPortal.universityName', 'University')} &nbsp;|&nbsp;{' '}
            <span>{universityNameEn || 'University'}</span>
          </div>
          <div>
            {t('instructorPortal.courseCode', 'Course code')}: <span>{subjectCode || '—'}</span> &nbsp;|&nbsp; {courseName || '—'}
          </div>
          <div>
            {t('instructorPortal.printDate', 'Print date')}: <span>{printDate}</span> &nbsp;|&nbsp;{' '}
            {t('instructorPortal.printUser', 'User')}: <span>{printUser}</span>
          </div>
        </div>
      </div>

      {showStatusModal && (
        <div className="modal-overlay" role="dialog" onClick={() => setShowStatusModal(false)}>
          <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="card-hd">
              <div className="card-title">{t('instructorPortal.assessmentStatusTitle', 'Class assessment status')}</div>
              <button type="button" className="btn btn-gh" onClick={() => setShowStatusModal(false)}>×</button>
            </div>
            <table className="grade-sheet-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('instructorPortal.assessmentDetails', 'Assessment')}</th>
                  <th>{t('instructorPortal.approvedQuestion', 'Approved?')}</th>
                  <th>{t('instructorPortal.entryPeriod', 'Entry period')}</th>
                </tr>
              </thead>
              <tbody>
                {ASSESSMENT_GROUPS.map((group, i) => {
                  const row = approvalsMap[group]
                  const approved = row?.status === 'approved'
                  return (
                    <tr key={group}>
                      <td>{i + 1}</td>
                      <td>{groupLabel(group)}</td>
                      <td>
                        <span className="badge" data-status={approved ? 'ok' : 'pending'}>
                          {approved
                            ? t('instructorPortal.approved', 'Approved')
                            : t('instructorPortal.notApproved', 'Open')}
                        </span>
                      </td>
                      <td>
                        {formatApprovalDate(row?.entry_started_at)} / {formatApprovalDate(row?.entry_ended_at)}
                        {approved && row?.approved_at && (
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                            {t('instructorPortal.approvedOn', 'Approved')}: {formatApprovalDate(row.approved_at)}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAnalyticsModal && (
        <div className="modal-overlay" role="dialog" onClick={() => setShowAnalyticsModal(false)}>
          <div className="modal-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="card-hd">
              <div className="card-title">📈 {t('instructorPortal.gradeCharts', 'Grade charts')}</div>
              <button type="button" className="btn btn-gh" onClick={() => setShowAnalyticsModal(false)}>×</button>
            </div>
            <p style={{ fontSize: 14, marginBottom: 12 }}>
              {t('instructorPortal.passRate', 'Pass rate')}: {gradeAnalytics.passRate}% ({gradeAnalytics.passCount}/
              {gradeAnalytics.graded})
            </p>
            {gradeAnalytics.distribution.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>{t('instructorPortal.noData')}</p>
            ) : (
              gradeAnalytics.distribution.map((item) => (
                <div key={item.letter} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{item.letter}</span>
                    <span>
                      {item.count} ({item.pct}%)
                    </span>
                  </div>
                  <div className="prog-bar">
                    <div className="prog-fill" style={{ width: `${item.pct}%`, background: 'var(--p)' }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {showHistoryModal && (
        <div className="modal-overlay" role="dialog" onClick={() => setShowHistoryModal(false)}>
          <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="card-hd">
              <div className="card-title">🕐 {t('instructorPortal.gradeHistory', 'Grade history')}</div>
              <button type="button" className="btn btn-gh" onClick={() => setShowHistoryModal(false)}>×</button>
            </div>
            {auditLoading ? (
              <p>{t('common.loading', 'Loading…')}</p>
            ) : auditLog.length === 0 ? (
              <p style={{ color: 'var(--muted)' }}>{t('instructorPortal.noAuditEntries', 'No changes recorded yet.')}</p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: 360, overflow: 'auto' }}>
                {auditLog.map((entry) => (
                  <li key={entry.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--bdr)', fontSize: 13 }}>
                    <div>
                      <strong>{entry.field_name}</strong>: {entry.old_value || '—'} → {entry.new_value || '—'}
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 11 }}>
                      {new Date(entry.changed_at).toLocaleString(isArabic ? 'ar' : 'en')} —{' '}
                      {getLocalizedName(entry.users, isArabic) || entry.users?.email || '—'} ({entry.change_source})
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
