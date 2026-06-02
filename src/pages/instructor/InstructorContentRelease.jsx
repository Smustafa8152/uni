import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'

const defaultSettings = {
  default_release_mode: 'scheduled',
  completion_tracking: true,
  show_progress_to_students: true,
}

function escapeCsvCell(val) {
  const s = String(val ?? '')
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function formatUnitCell(pct) {
  if (pct >= 100) return '✅ 100%'
  if (pct > 0) return `🔄 ${pct}%`
  return '🔒 —'
}

function progFillClass(total) {
  if (total >= 70) return 'ok'
  if (total >= 30) return 'warn'
  return 'err'
}

export default function InstructorContentRelease() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [savingSettings, setSavingSettings] = useState(false)
  const [classes, setClasses] = useState([])
  const [selectedClassId, setSelectedClassId] = useState(null)
  const [instructorId, setInstructorId] = useState(null)
  const [settingsId, setSettingsId] = useState(null)
  const [settings, setSettings] = useState(defaultSettings)
  const [schedule, setSchedule] = useState([])
  const [students, setStudents] = useState([])
  const [progressRows, setProgressRows] = useState([])
  const [notice, setNotice] = useState(null)

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || null,
    [classes, selectedClassId]
  )

  useEffect(() => {
    if (!user?.email) return
    loadInstructorClasses()
  }, [user?.email])

  useEffect(() => {
    if (!selectedClassId || !instructorId) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('classId', String(selectedClassId))
      return next
    })
    loadClassData(selectedClassId, instructorId)
  }, [selectedClassId, instructorId])

  const loadInstructorClasses = async () => {
    setLoading(true)
    try {
      const instructor = await getActiveInstructorByEmail(user.email)

      if (!instructor) {
        setLoading(false)
        return
      }

      setInstructorId(instructor.id)

      const { data: cls } = await supabase
        .from('classes')
        .select('id, section, subject_id, subjects(id, code, name_en, name_ar)')
        .eq('instructor_id', instructor.id)
        .eq('status', 'active')
        .order('id', { ascending: false })

      const list = cls || []
      setClasses(list)

      const fromQuery = Number(searchParams.get('classId'))
      const initialClassId = list.find((c) => c.id === fromQuery)?.id || list[0]?.id || null
      setSelectedClassId(initialClassId)

      if (!initialClassId) setLoading(false)
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  const loadClassData = async (classId, insId) => {
    try {
      const [{ data: settingsData }, { data: lessonData }, { data: enrollmentData }, { data: progressData }] = await Promise.all([
        supabase
          .from('instructor_course_settings')
          .select('id, default_release_mode, completion_tracking, show_progress_to_students')
          .eq('class_id', classId)
          .eq('instructor_id', insId)
          .maybeSingle(),
        supabase
          .from('class_lessons')
          .select('id, title, unit_number, lesson_number, release_mode, release_at, release_condition, status, published_at')
          .eq('class_id', classId)
          .order('unit_number', { ascending: true })
          .order('lesson_number', { ascending: true }),
        supabase
          .from('enrollments')
          .select('id, student_id, students(id, name_en, name_ar)')
          .eq('class_id', classId)
          .eq('status', 'enrolled'),
        supabase
          .from('class_lesson_progress')
          .select('lesson_id, student_id, progress_percent, status')
          .eq('class_id', classId),
      ])

      if (settingsData) {
        setSettingsId(settingsData.id)
        setSettings({
          default_release_mode: settingsData.default_release_mode,
          completion_tracking: settingsData.completion_tracking,
          show_progress_to_students: settingsData.show_progress_to_students,
        })
      } else {
        setSettingsId(null)
        setSettings(defaultSettings)
      }

      setSchedule(
        (lessonData || []).map((l) => ({
          ...l,
          release_at_input: l.release_at ? l.release_at.slice(0, 16) : '',
          published_at: l.published_at || null,
          saving: false,
        }))
      )
      setStudents(enrollmentData || [])
      setProgressRows(progressData || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const saveCourseSettings = async () => {
    if (!selectedClassId || !instructorId) return

    setSavingSettings(true)
    try {
      if (settingsId) {
        const { error } = await supabase
          .from('instructor_course_settings')
          .update({
            ...settings,
            updated_at: new Date().toISOString(),
          })
          .eq('id', settingsId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('instructor_course_settings')
          .insert({
            class_id: selectedClassId,
            instructor_id: instructorId,
            ...settings,
          })
          .select('id')
          .single()
        if (error) throw error
        if (data) setSettingsId(data.id)
      }
      setNotice({ type: 'ok', message: t('instructorPortal.settingsSaved', 'Settings saved.') })
    } catch (err) {
      console.error(err)
      setNotice({ type: 'err', message: err?.message || t('common.error', 'Error') })
    } finally {
      setSavingSettings(false)
    }
  }

  const updateScheduleField = (lessonId, patch) => {
    setSchedule((prev) => prev.map((row) => (row.id === lessonId ? { ...row, ...patch } : row)))
  }

  const buildReleasePayload = (lesson) => {
    const updatedAt = new Date().toISOString()
    const mode = lesson.release_mode || 'scheduled'

    let release_at = null
    let release_condition = (lesson.release_condition || '').trim() || null

    if (mode === 'immediate') {
      release_at = null
      release_condition = null
    } else if (mode === 'scheduled') {
      release_condition = null
      release_at = lesson.release_at_input ? new Date(lesson.release_at_input).toISOString() : null
    } else if (mode === 'conditional') {
      release_at = lesson.release_at_input ? new Date(lesson.release_at_input).toISOString() : null
    }

    let published_at = null
    if (lesson.status === 'published') {
      published_at = lesson.published_at ? new Date(lesson.published_at).toISOString() : new Date().toISOString()
    }

    return {
      release_mode: mode,
      release_at,
      release_condition,
      status: lesson.status,
      published_at,
      updated_at: updatedAt,
    }
  }

  const saveLessonSchedule = async (lessonId) => {
    const lesson = schedule.find((x) => x.id === lessonId)
    if (!lesson) return

    updateScheduleField(lessonId, { saving: true })
    try {
      const payload = buildReleasePayload(lesson)

      const { data, error } = await supabase
        .from('class_lessons')
        .update(payload)
        .eq('id', lessonId)
        .select('id, title, unit_number, lesson_number, release_mode, release_at, release_condition, status, published_at')
        .single()

      if (error) throw error

      const saved = data
      setSchedule((prev) =>
        prev.map((row) =>
          row.id === lessonId
            ? {
                ...row,
                ...saved,
                release_at_input: saved.release_at ? saved.release_at.slice(0, 16) : '',
                published_at: saved.published_at || null,
                release_condition: saved.release_condition || '',
                saving: false,
              }
            : row
        )
      )
      setNotice({ type: 'ok', message: t('instructorPortal.lessonScheduleSaved', 'Lesson release settings saved.') })
    } catch (err) {
      console.error(err)
      updateScheduleField(lessonId, { saving: false })
      setNotice({ type: 'err', message: err?.message || t('common.error', 'Error') })
    }
  }

  const unitNumbers = useMemo(() => {
    const units = [...new Set(schedule.map((l) => l.unit_number))]
    return units.sort((a, b) => a - b)
  }, [schedule])

  const completionTable = useMemo(() => {
    if (!students.length) return []

    const unitLessons = {}
    for (const lesson of schedule) {
      if (!unitLessons[lesson.unit_number]) unitLessons[lesson.unit_number] = []
      unitLessons[lesson.unit_number].push(lesson.id)
    }

    const progressMap = {}
    for (const row of progressRows) {
      progressMap[`${row.student_id}:${row.lesson_id}`] = Number(row.progress_percent || 0)
    }

    return students.map((enrollment) => {
      const studentId = enrollment.student_id
      let totalPct = 0
      let unitCount = 0
      const byUnit = {}

      for (const unit of unitNumbers) {
        const lessonIds = unitLessons[unit] || []
        const sum = lessonIds.reduce((acc, lessonId) => acc + (progressMap[`${studentId}:${lessonId}`] || 0), 0)
        const pct = lessonIds.length ? Math.round(sum / lessonIds.length) : 0
        byUnit[unit] = pct
        totalPct += pct
        unitCount += 1
      }

      return {
        studentId,
        name: getLocalizedName(enrollment.students, language === 'ar'),
        byUnit,
        total: unitCount ? Math.round(totalPct / unitCount) : 0,
      }
    })
  }, [students, progressRows, schedule, language, unitNumbers])

  const exportCompletionCsv = () => {
    if (!completionTable.length || !selectedClassId) return
    const headers = [
      escapeCsvCell(t('instructorPortal.student')),
      ...unitNumbers.map((u) => escapeCsvCell(`${t('instructorPortal.unit')} ${u}`)),
      escapeCsvCell(t('instructorPortal.total')),
    ]
    const lines = [
      headers.join(','),
      ...completionTable.map((r) =>
        [
          escapeCsvCell(r.name),
          ...unitNumbers.map((u) => escapeCsvCell(r.byUnit[u] ?? 0)),
          escapeCsvCell(r.total),
        ].join(',')
      ),
    ]
    const blob = new Blob([`\ufeff${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `content-completion-class-${selectedClassId}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
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

  if (!classes.length) {
    return (
      <div className="card" style={{ textAlign: 'center', color: 'var(--muted)' }}>
        {t('instructorPortal.noCoursesForContentRelease', 'No active courses assigned to you.')}
      </div>
    )
  }

  const courseHomeHref = selectedClass?.subject_id ? `/instructor/subjects/${selectedClass.subject_id}` : '/instructor/courses'

  return (
    <>
      {notice && (
        <div
          className={`alert ${notice.type === 'ok' ? 'alert-ok' : 'alert-err'}`}
          style={{ margin: '0 24px 12px', maxWidth: 960 }}
          role="status"
        >
          {notice.message}
        </div>
      )}
      <nav className="bc" aria-label={t('instructorPortal.breadcrumbMain')}>
        <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
        <span className="bc-sep">›</span>
        <Link to={courseHomeHref}>{selectedClass?.subjects?.code || t('instructorPortal.myCourses')}</Link>
        <span className="bc-sep">›</span>
        <span>{t('instructorPortal.contentRelease')}</span>
      </nav>

      <div className="ph">
        <div>
          <h1>{t('instructorPortal.contentReleaseScheduling')}</h1>
          <p className="ph-sub">{t('instructorPortal.contentReleaseSubtitle')}</p>
        </div>
        <div className="ph-acts">
          <select
            className="fc"
            style={{ minWidth: 220, maxWidth: 360 }}
            value={selectedClassId || ''}
            onChange={(e) => setSelectedClassId(Number(e.target.value))}
          >
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.subjects?.code} - {getLocalizedName(cls.subjects, language === 'ar')} ({t('instructorPortal.section')} {cls.section})
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-ok" onClick={saveCourseSettings} disabled={savingSettings}>
            💾 {t('instructorPortal.saveReleaseSettings')}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="card-title">⚙️ {t('instructorPortal.defaultReleaseSettingsTitle')}</div>
        </div>
        <div className="fr3">
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">{t('instructorPortal.defaultReleaseMode')}</label>
            <select
              className="fc"
              value={settings.default_release_mode}
              onChange={(e) => setSettings((p) => ({ ...p, default_release_mode: e.target.value }))}
            >
              <option value="immediate">{t('instructorPortal.releaseModeImmediate')}</option>
              <option value="scheduled">{t('instructorPortal.releaseModeScheduled')}</option>
              <option value="conditional">{t('instructorPortal.releaseModeConditional')}</option>
            </select>
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">{t('instructorPortal.completionTracking')}</label>
            <select
              className="fc"
              value={settings.completion_tracking ? 'enabled' : 'disabled'}
              onChange={(e) => setSettings((p) => ({ ...p, completion_tracking: e.target.value === 'enabled' }))}
            >
              <option value="enabled">{t('instructorPortal.trackingEnabled', 'Enabled')}</option>
              <option value="disabled">{t('instructorPortal.trackingDisabled', 'Disabled')}</option>
            </select>
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">{t('instructorPortal.showProgressToStudents')}</label>
            <select
              className="fc"
              value={settings.show_progress_to_students ? 'yes' : 'no'}
              onChange={(e) => setSettings((p) => ({ ...p, show_progress_to_students: e.target.value === 'yes' }))}
            >
              <option value="yes">{t('common.yes')}</option>
              <option value="no">{t('common.no')}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-hd" style={{ padding: '20px 24px 0', marginBottom: 12 }}>
          <div className="card-title">📅 {t('instructorPortal.lessonsReleaseScheduleTitle')}</div>
        </div>
        <div className="alert alert-info" style={{ margin: '0 24px 16px', borderRadius: 'var(--rs)' }}>
          {t('instructorPortal.contentReleaseScheduleHint')}
        </div>
        <div className="tw" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderBottom: 'none' }}>
          <table dir={isRTL ? 'rtl' : 'ltr'}>
            <thead>
              <tr>
                <th>{t('instructorPortal.lesson')}</th>
                <th>{t('instructorPortal.unit')}</th>
                <th>{t('instructorPortal.releaseMode')}</th>
                <th>{t('instructorPortal.releaseDate')}</th>
                <th>{t('instructorPortal.condition')}</th>
                <th>{t('common.status')}</th>
                <th>{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{row.title}</span>
                    </td>
                    <td>
                      {t('instructorPortal.unit')} {row.unit_number}
                    </td>
                    <td>
                      <select
                        className="fc"
                        style={{ fontSize: 13, padding: '6px 10px' }}
                        value={row.release_mode || 'scheduled'}
                        onChange={(e) => {
                          const mode = e.target.value
                          const patch = { release_mode: mode }
                          if (mode === 'immediate') {
                            patch.release_at_input = ''
                            patch.release_condition = ''
                          }
                          if (mode === 'scheduled') {
                            patch.release_condition = ''
                          }
                          updateScheduleField(row.id, patch)
                        }}
                      >
                        <option value="immediate">{t('instructorPortal.releaseModeImmediate')}</option>
                        <option value="scheduled">{t('instructorPortal.releaseModeScheduled')}</option>
                        <option value="conditional">{t('instructorPortal.releaseModeConditional')}</option>
                      </select>
                    </td>
                    <td>
                      {row.release_mode === 'immediate' ? (
                        <div className="cr-cell-muted">
                          <span aria-hidden>—</span>
                          <span style={{ display: 'block', fontSize: 11, marginTop: 4 }}>
                            {t('instructorPortal.releaseDateUnusedImmediate')}
                          </span>
                        </div>
                      ) : (
                        <input
                          type="datetime-local"
                          className="fc"
                          style={{ fontSize: 13, padding: '6px 10px', minWidth: 200 }}
                          value={row.release_at_input || ''}
                          onChange={(e) => updateScheduleField(row.id, { release_at_input: e.target.value })}
                        />
                      )}
                    </td>
                    <td>
                      {row.release_mode === 'conditional' ? (
                        <input
                          className="fc"
                          style={{ fontSize: 13, padding: '6px 10px', minWidth: 160 }}
                          value={row.release_condition || ''}
                          onChange={(e) => updateScheduleField(row.id, { release_condition: e.target.value })}
                          placeholder={t('instructorPortal.conditionPlaceholder')}
                        />
                      ) : (
                        <div className="cr-cell-muted">
                          <span aria-hidden>—</span>
                          <span style={{ display: 'block', fontSize: 11, marginTop: 4 }}>
                            {t('instructorPortal.conditionOnlyForConditional')}
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      <select
                        className="fc"
                        style={{ fontSize: 13, padding: '6px 10px', minWidth: 120 }}
                        value={row.status}
                        onChange={(e) => updateScheduleField(row.id, { status: e.target.value })}
                      >
                        <option value="draft">{t('instructorPortal.draft')}</option>
                        <option value="published">{t('instructorPortal.statusPublished')}</option>
                        <option value="archived">{t('instructorPortal.statusArchived')}</option>
                      </select>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-ok btn-sm"
                          onClick={() => saveLessonSchedule(row.id)}
                          disabled={row.saving}
                        >
                          {row.saving ? '…' : t('common.save')}
                        </button>
                        <Link
                          to={`/instructor/build-lessons?classId=${selectedClassId}&lessonId=${row.id}`}
                          className="btn btn-gh btn-sm"
                        >
                          {t('common.edit')}
                        </Link>
                      </div>
                    </td>
                  </tr>
              ))}
              {schedule.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    {t('instructorPortal.noData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="card-hd" style={{ padding: '20px 24px 0', marginBottom: 0 }}>
          <div className="card-title">📊 {t('instructorPortal.contentCompletionReportTitle')}</div>
          <button type="button" className="btn btn-gh btn-sm" onClick={exportCompletionCsv} disabled={!completionTable.length}>
            📥 {t('instructorPortal.export')}
          </button>
        </div>
        <div style={{ padding: '12px 24px 20px', color: 'var(--muted)', fontSize: 13 }}>
          {selectedClass ? `${selectedClass.subjects?.code} — ${getLocalizedName(selectedClass.subjects, language === 'ar')}` : ''}
        </div>
        <div className="tw" style={{ borderRadius: 0, borderLeft: 'none', borderRight: 'none', borderBottom: 'none' }}>
          <table dir={isRTL ? 'rtl' : 'ltr'}>
            <thead>
              <tr>
                <th>{t('instructorPortal.student')}</th>
                {unitNumbers.map((unit) => (
                  <th key={unit} style={{ textAlign: 'center' }}>
                    {t('instructorPortal.unit')} {unit}
                  </th>
                ))}
                <th>{t('instructorPortal.total')}</th>
              </tr>
            </thead>
            <tbody>
              {completionTable.map((row) => (
                <tr key={row.studentId}>
                  <td style={{ fontWeight: 600 }}>{row.name}</td>
                  {unitNumbers.map((unit) => (
                    <td key={unit} style={{ textAlign: 'center' }}>
                      {formatUnitCell(row.byUnit[unit] || 0)}
                    </td>
                  ))}
                  <td>
                    <div className="prog-bar" style={{ width: 80 }}>
                      <div className={`prog-fill ${progFillClass(row.total)}`} style={{ width: `${Math.min(100, row.total)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
              {completionTable.length === 0 && (
                <tr>
                  <td colSpan={Math.max(2, unitNumbers.length + 2)} style={{ textAlign: 'center', color: 'var(--muted)' }}>
                    {t('instructorPortal.noData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
