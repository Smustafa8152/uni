import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { examRowToDatetimeLocalValues, datetimeLocalsToExamPayload } from '../../utils/subjectExamDateTime'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'

function defaultForm() {
  return {
    startDatetime: '',
    endDatetime: '',
    duration_minutes: 90,
    timezone: 'riyadh',
    shuffle_questions: true,
    shuffle_answers: true,
    randomize_pool: false,
    integrity_statement: true,
    safe_browser: false,
    webcam_monitoring: false,
    plagiarism_check: false,
    result_policy: 'after_window',
    summary_total: true,
    summary_correct: false,
    summary_feedback: false,
    resume_policy: 'resume_time_runs',
  }
}

function hydrateFormFromSettings(s) {
  const base = defaultForm()
  if (!s || typeof s !== 'object') return base
  return {
    ...base,
    timezone: s.timezone ?? base.timezone,
    shuffle_questions: s.shuffle_questions ?? base.shuffle_questions,
    shuffle_answers: s.shuffle_answers ?? base.shuffle_answers,
    randomize_pool: s.randomize_from_bank ?? s.randomize_pool ?? base.randomize_pool,
    integrity_statement: s.integrity_statement ?? base.integrity_statement,
    safe_browser: s.safe_browser ?? base.safe_browser,
    webcam_monitoring: s.webcam_monitoring ?? base.webcam_monitoring,
    plagiarism_check: s.plagiarism_check ?? base.plagiarism_check,
    result_policy: s.result_visibility ?? s.result_policy ?? base.result_policy,
    summary_total: s.summary_show_total ?? base.summary_total,
    summary_correct: s.summary_show_correct ?? base.summary_correct,
    summary_feedback: s.summary_show_feedback ?? base.summary_feedback,
    resume_policy: s.resume_policy ?? base.resume_policy,
  }
}

/** Electronic exam settings — loads/saves `subject_exams` + `assessment_settings` (aligned with Create assessment). */
export default function InstructorExamSettings() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const classIdParam = searchParams.get('classId')
  const examIdParam = searchParams.get('examId')
  const classId = classIdParam ? Number(classIdParam) : null
  const examId = examIdParam ? Number(examIdParam) : null

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState(null)
  const [classRow, setClassRow] = useState(null)
  const [examRow, setExamRow] = useState(null)
  const [form, setForm] = useState(() => defaultForm())
  const [accommodations, setAccommodations] = useState([])

  useEffect(() => {
    if (!user?.email || !classId || Number.isNaN(classId)) {
      setLoading(false)
      setClassRow(null)
      setExamRow(null)
      setForm(defaultForm())
      setAccommodations([])
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      setSaveStatus(null)
      try {
        const instructor = await getActiveInstructorByEmail(user.email)

        if (!instructor || cancelled) {
          setClassRow(null)
          setExamRow(null)
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
          setExamRow(null)
          return
        }
        setClassRow(cls)

        if (examId && !Number.isNaN(examId)) {
          const { data: exam, error: exErr } = await supabase
            .from('subject_exams')
            .select(
              'id, title, scheduled_date, start_time, end_time, duration_minutes, assessment_settings, class_id, subject_id'
            )
            .eq('id', examId)
            .maybeSingle()

          if (exErr || !exam || exam.class_id !== cls.id || cancelled) {
            setExamRow(null)
            setForm(defaultForm())
            setAccommodations([])
          } else {
            setExamRow(exam)
            const { start, end } = examRowToDatetimeLocalValues(exam.scheduled_date, exam.start_time, exam.end_time)
            const s = exam.assessment_settings || {}
            setForm({
              ...hydrateFormFromSettings(s),
              startDatetime: start,
              endDatetime: end,
              duration_minutes: Number(exam.duration_minutes) || 90,
            })
            const acc = Array.isArray(s.accommodations) ? s.accommodations : []
            setAccommodations(
              acc.map((row, i) => ({
                key: `acc-${exam.id}-${i}`,
                student_name: row.student_name || '',
                extra_time_percent: Number(row.extra_time_percent) || 0,
              }))
            )
          }
        } else {
          setExamRow(null)
          setForm(defaultForm())
          setAccommodations([])
        }
      } catch {
        if (!cancelled) {
          setClassRow(null)
          setExamRow(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [user?.email, classId, examId])

  const subjectCode = classRow?.subjects?.code || '—'
  const subjectId = classRow?.subject_id
  const crumbCourseHref = subjectId ? `/instructor/subjects/${subjectId}` : '/instructor/courses'
  const assessmentsHref = `/instructor/assessments${classId ? `?classId=${classId}` : ''}`
  const previewHref =
    classId && examId ? `/instructor/preview-exam?classId=${classId}&examId=${examId}` : '/instructor/preview-exam'

  const examTitle = examRow?.title?.trim() || t('instructorPortal.examSettingsMidtermName')
  const phSub = t('instructorPortal.examSettingsPageSubtitle', { exam: examTitle, code: subjectCode })

  const accent = { accentColor: 'var(--p)', width: 16, height: 16 }
  const chkSmall = { accentColor: 'var(--p)' }

  const mergeAssessmentSettings = () => {
    const prev = examRow?.assessment_settings && typeof examRow.assessment_settings === 'object'
      ? examRow.assessment_settings
      : {}
    const accPayload = accommodations
      .map((a) => ({
        student_name: (a.student_name || '').trim(),
        extra_time_percent: Math.max(0, Math.min(200, Number(a.extra_time_percent) || 0)),
      }))
      .filter((a) => a.student_name.length > 0)

    return {
      ...prev,
      timezone: form.timezone,
      shuffle_questions: !!form.shuffle_questions,
      shuffle_answers: !!form.shuffle_answers,
      randomize_from_bank: !!form.randomize_pool,
      integrity_statement: !!form.integrity_statement,
      safe_browser: !!form.safe_browser,
      webcam_monitoring: !!form.webcam_monitoring,
      plagiarism_check: !!form.plagiarism_check,
      result_visibility: form.result_policy,
      summary_show_total: !!form.summary_total,
      summary_show_correct: !!form.summary_correct,
      summary_show_feedback: !!form.summary_feedback,
      resume_policy: form.resume_policy,
      accommodations: accPayload,
    }
  }

  const save = async () => {
    if (!classRow || !examRow || saving) return
    setSaving(true)
    setSaveStatus(null)
    try {
      const times = datetimeLocalsToExamPayload(
        form.startDatetime,
        form.endDatetime,
        form.duration_minutes
      )
      const assessment_settings = mergeAssessmentSettings()

      // Save & activate should also move the exam into a student-visible lifecycle status.
      // If we are inside the window -> open; otherwise -> scheduled.
      const startIso = times?.scheduled_date && times?.start_time ? new Date(`${times.scheduled_date}T${times.start_time}`).toISOString() : null
      const endIso = times?.scheduled_date && times?.end_time ? new Date(`${times.scheduled_date}T${times.end_time}`).toISOString() : null
      const now = Date.now()
      const startMs = startIso ? new Date(startIso).getTime() : null
      const endMs = endIso ? new Date(endIso).getTime() : null

      let status = 'EX_SCH'
      if (startMs != null && endMs != null && now >= startMs && now <= endMs) status = 'EX_OPN'
      else status = 'EX_SCH'

      const payload = {
        ...times,
        duration_minutes: Number(form.duration_minutes) || times.duration_minutes,
        assessment_settings,
        // Ensure exam is linked to the current class; student visibility depends on class enrollment.
        class_id: examRow.class_id || classRow.id,
        status,
        published_at: status === 'EX_SCH' ? new Date().toISOString() : examRow.published_at || new Date().toISOString(),
        opened_at: status === 'EX_OPN' ? new Date().toISOString() : examRow.opened_at || null,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase.from('subject_exams').update(payload).eq('id', examRow.id)
      if (error) throw error

      // Force-persist lifecycle fields and read back what the DB accepted.
      // (We’ve seen cases where the update succeeds but status isn’t applied due to older builds or partial payloads.)
      const { data: after, error: afterErr } = await supabase
        .from('subject_exams')
        .update({
          class_id: payload.class_id,
          status,
          published_at: payload.published_at,
          opened_at: payload.opened_at,
          updated_at: payload.updated_at,
        })
        .eq('id', examRow.id)
        .select('id, status, published_at, opened_at, updated_at')
        .single()
      if (afterErr) throw afterErr

      setExamRow((er) => (er ? { ...er, ...payload, ...(after || {}) , assessment_settings } : er))
      setSaveStatus('ok')
    } catch (e) {
      console.error(e)
      setSaveStatus('err')
    } finally {
      setSaving(false)
    }
  }

  const updateAcc = (index, patch) => {
    setAccommodations((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const removeAcc = (index) => {
    setAccommodations((rows) => rows.filter((_, i) => i !== index))
  }

  const addAcc = () => {
    setAccommodations((rows) => [
      ...rows,
      { key: `new-${Date.now()}`, student_name: '', extra_time_percent: 25 },
    ])
  }

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
      <div className="ph">
        <p className="ph-sub">{t('instructorPortal.examSettingsClassRequiredHint')}</p>
        <Link to="/instructor/courses" className="btn btn-p">
          {t('instructorPortal.myCourses')}
        </Link>
      </div>
    )
  }

  if (!classRow) {
    return (
      <div className="ph">
        <p className="ph-sub">{t('instructorPortal.examSettingsClassDenied')}</p>
        <Link to="/instructor/courses" className="btn btn-gh">
          {t('instructorPortal.myCourses')}
        </Link>
      </div>
    )
  }

  if (!examId || Number.isNaN(examId) || !examRow) {
    return (
      <>
        <nav className="bc" aria-label={t('instructorPortal.breadcrumbMain')}>
          <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
          <span className="bc-sep">›</span>
          <Link to={crumbCourseHref}>{subjectCode}</Link>
          <span className="bc-sep">›</span>
          <span>{t('instructorPortal.examSettingsBreadcrumb')}</span>
        </nav>
        <div className="ph">
          <h1>{t('instructorPortal.examSettingsPageTitle')}</h1>
          <p className="ph-sub">{t('instructorPortal.examSettingsPickAssessmentHint')}</p>
          <Link to={assessmentsHref} className="btn btn-p">
            {t('instructorPortal.examSettingsBcAuthoring')}
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <nav className="bc" aria-label={t('instructorPortal.breadcrumbMain')}>
        <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
        <span className="bc-sep">›</span>
        <Link to={crumbCourseHref}>{subjectCode}</Link>
        <span className="bc-sep">›</span>
        <Link to={assessmentsHref}>{t('instructorPortal.examSettingsBcAuthoring')}</Link>
        <span className="bc-sep">›</span>
        <span>{t('instructorPortal.examSettingsBreadcrumb')}</span>
      </nav>

      <div className="ph">
        <div>
          <h1>{t('instructorPortal.examSettingsPageTitle')}</h1>
          <p className="ph-sub">{phSub}</p>
          {saveStatus === 'ok' && (
            <p className="alert alert-ok" style={{ marginTop: 8 }}>
              {t('instructorPortal.examSettingsSaveDone')}
            </p>
          )}
          {saveStatus === 'err' && (
            <p className="alert alert-err" style={{ marginTop: 8 }}>
              {t('instructorPortal.examSettingsSaveFailed')}
            </p>
          )}
        </div>
        <div className="ph-acts">
          <Link to={assessmentsHref} className="btn btn-gh">
            ← {t('instructorPortal.examSettingsBack')}
          </Link>
          <Link to={previewHref} className="btn btn-out">
            👁️ {t('instructorPortal.previewExamPage')}
          </Link>
          <button type="button" className="btn btn-ok" disabled={saving} onClick={save}>
            {saving ? '…' : `✅ ${t('instructorPortal.examSettingsSaveActivate')}`}
          </button>
        </div>
      </div>

      <div className="grid2">
        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">⏱️ {t('instructorPortal.examSettingsWindowTitle')}</div>
            </div>
            <div className="fr">
              <div className="fg">
                <label className="fl">{t('instructorPortal.examSettingsStart')}</label>
                <input
                  type="datetime-local"
                  className="fc"
                  value={form.startDatetime}
                  onChange={(e) => setForm((f) => ({ ...f, startDatetime: e.target.value }))}
                  data-field="exam_start"
                />
              </div>
              <div className="fg">
                <label className="fl">{t('instructorPortal.examSettingsEnd')}</label>
                <input
                  type="datetime-local"
                  className="fc"
                  value={form.endDatetime}
                  onChange={(e) => setForm((f) => ({ ...f, endDatetime: e.target.value }))}
                  data-field="exam_end"
                />
              </div>
            </div>
            <div className="fr">
              <div className="fg">
                <label className="fl">{t('instructorPortal.examSettingsDuration')}</label>
                <input
                  type="number"
                  className="fc"
                  min={1}
                  value={form.duration_minutes}
                  onChange={(e) => setForm((f) => ({ ...f, duration_minutes: Number(e.target.value) || 0 }))}
                  data-field="duration_minutes"
                />
                <div className="fh">{t('instructorPortal.examSettingsDurationHint')}</div>
              </div>
              <div className="fg">
                <label className="fl">{t('instructorPortal.examSettingsTimezone')}</label>
                <select
                  className="fc"
                  data-field="timezone"
                  value={form.timezone}
                  onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                >
                  <option value="riyadh">{t('instructorPortal.examSettingsTzRiyadh')}</option>
                  <option value="utc">{t('instructorPortal.examSettingsTzUtc')}</option>
                  <option value="dubai">{t('instructorPortal.examSettingsTzDubai')}</option>
                </select>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">🔀 {t('instructorPortal.examSettingsShuffleTitle')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.shuffle_questions}
                  style={accent}
                  data-field="shuffle_questions"
                  onChange={(e) => setForm((f) => ({ ...f, shuffle_questions: e.target.checked }))}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>{t('instructorPortal.examSettingsShuffleQuestions')}</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.shuffle_answers}
                  style={accent}
                  data-field="shuffle_answers"
                  onChange={(e) => setForm((f) => ({ ...f, shuffle_answers: e.target.checked }))}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>{t('instructorPortal.examSettingsShuffleAnswers')}</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.randomize_pool}
                  style={accent}
                  data-field="randomize_pool"
                  onChange={(e) => setForm((f) => ({ ...f, randomize_pool: e.target.checked }))}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>{t('instructorPortal.examSettingsRandomPool')}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('instructorPortal.examSettingsRandomPoolHint')}</div>
                </div>
              </label>
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">♿ {t('instructorPortal.examSettingsA11yTitle')}</div>
            </div>
            <div className="fg">
              <label className="fl">{t('instructorPortal.examSettingsExtraTime')}</label>
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>{t('instructorPortal.examSettingsA11yColStudent')}</th>
                      <th>{t('instructorPortal.examSettingsA11yColPercent')}</th>
                      <th>{t('instructorPortal.examSettingsA11yColAction')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accommodations.length === 0 ? (
                      <tr>
                        <td colSpan={3} style={{ color: 'var(--muted)', fontSize: 14 }}>
                          {t('instructorPortal.examSettingsA11yEmpty')}
                        </td>
                      </tr>
                    ) : (
                      accommodations.map((row, idx) => (
                        <tr key={row.key || idx}>
                          <td>
                            <input
                              type="text"
                              className="fc"
                              value={row.student_name}
                              placeholder={t('instructorPortal.examSettingsA11yNamePlaceholder')}
                              onChange={(e) => updateAcc(idx, { student_name: e.target.value })}
                              data-field="student_name"
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className="fc"
                              min={0}
                              max={200}
                              style={{ width: 80 }}
                              value={row.extra_time_percent}
                              onChange={(e) =>
                                updateAcc(idx, { extra_time_percent: Number(e.target.value) || 0 })
                              }
                              data-field="extra_time_percent"
                            />{' '}
                            %
                          </td>
                          <td>
                            <button type="button" className="btn btn-err btn-sm" onClick={() => removeAcc(idx)}>
                              {t('instructorPortal.examSettingsDelete')}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <button type="button" className="btn btn-gh btn-sm" style={{ marginTop: 8 }} onClick={addAcc}>
                + {t('instructorPortal.examSettingsAddStudent')}
              </button>
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">🔒 {t('instructorPortal.examSettingsIntegrityCardTitle')}</div>
              <Link to="/instructor/integrity-settings" className="btn btn-gh btn-sm">
                {t('instructorPortal.examSettingsAdvancedIntegrity')}
              </Link>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.integrity_statement}
                  style={accent}
                  data-field="integrity_statement"
                  onChange={(e) => setForm((f) => ({ ...f, integrity_statement: e.target.checked }))}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>{t('instructorPortal.examSettingsIntegrityStatement')}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('instructorPortal.examSettingsIntegrityStatementHint')}</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.safe_browser}
                  style={accent}
                  data-field="safe_browser"
                  onChange={(e) => setForm((f) => ({ ...f, safe_browser: e.target.checked }))}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>{t('instructorPortal.examSettingsSafeBrowser')}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('instructorPortal.examSettingsSafeBrowserHint')}</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.webcam_monitoring}
                  style={accent}
                  data-field="webcam_monitoring"
                  onChange={(e) => setForm((f) => ({ ...f, webcam_monitoring: e.target.checked }))}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>{t('instructorPortal.examSettingsWebcam')}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('instructorPortal.examSettingsWebcamHint')}</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.plagiarism_check}
                  style={accent}
                  data-field="plagiarism_check"
                  onChange={(e) => setForm((f) => ({ ...f, plagiarism_check: e.target.checked }))}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>{t('instructorPortal.examSettingsPlagiarism')}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('instructorPortal.examSettingsPlagiarismHint')}</div>
                </div>
              </label>
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">📋 {t('instructorPortal.examSettingsPostTitle')}</div>
            </div>
            <div className="fg">
              <label className="fl">{t('instructorPortal.examSettingsResultPolicy')}</label>
              <select
                className="fc"
                data-field="result_policy"
                value={form.result_policy}
                onChange={(e) => setForm((f) => ({ ...f, result_policy: e.target.value }))}
              >
                <option value="immediate">{t('instructorPortal.examSettingsResultImmediate')}</option>
                <option value="after_window">{t('instructorPortal.examSettingsResultAfterWindow')}</option>
                <option value="manual">{t('instructorPortal.examSettingsResultManual')}</option>
              </select>
            </div>
            <div className="fg">
              <label className="fl">{t('instructorPortal.examSettingsSummaryLabel')}</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={form.summary_total}
                    style={chkSmall}
                    onChange={(e) => setForm((f) => ({ ...f, summary_total: e.target.checked }))}
                  />{' '}
                  {t('instructorPortal.examSettingsSummaryTotal')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={form.summary_correct}
                    style={chkSmall}
                    onChange={(e) => setForm((f) => ({ ...f, summary_correct: e.target.checked }))}
                  />{' '}
                  {t('instructorPortal.examSettingsSummaryCorrect')}
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={form.summary_feedback}
                    style={chkSmall}
                    onChange={(e) => setForm((f) => ({ ...f, summary_feedback: e.target.checked }))}
                  />{' '}
                  {t('instructorPortal.examSettingsSummaryFeedback')}
                </label>
              </div>
            </div>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label className="fl">{t('instructorPortal.examSettingsResumePolicy')}</label>
              <select
                className="fc"
                data-field="resume_policy"
                value={form.resume_policy}
                onChange={(e) => setForm((f) => ({ ...f, resume_policy: e.target.value }))}
              >
                <option value="resume_time_runs">{t('instructorPortal.examSettingsResumeOpt1')}</option>
                <option value="resume_pause">{t('instructorPortal.examSettingsResumeOpt2')}</option>
                <option value="no_resume">{t('instructorPortal.examSettingsResumeOpt3')}</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
