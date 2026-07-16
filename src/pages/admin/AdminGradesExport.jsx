import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import {
  exportAdminOverallGradesExcel,
  exportAdminOverallGradesCsv,
  exportAdminExamAttemptsCsv,
} from '../../utils/exportAdminOverallGrades'

export default function AdminGradesExport() {
  const { t } = useTranslation()
  const [semesters, setSemesters] = useState([])
  const [semesterId, setSemesterId] = useState('')
  const [loadingSemesters, setLoadingSemesters] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingSemesters(true)
      try {
        const { data, error: err } = await supabase
          .from('semesters')
          .select('id, name_en, name_ar, academic_year, status')
          .order('start_date', { ascending: false })
        if (err) throw err
        if (!cancelled) setSemesters(data || [])
      } catch (e) {
        console.error(e)
        if (!cancelled) setError(e.message || String(e))
      } finally {
        if (!cancelled) setLoadingSemesters(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const runExport = async (fn) => {
    setExporting(true)
    setError('')
    setMessage(null)
    try {
      const sid = semesterId ? Number(semesterId) : null
      const result = await fn({ semesterId: sid })
      setMessage(result)
    } catch (e) {
      console.error(e)
      setError(e?.message || String(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <nav className="bc" style={{ marginBottom: 12 }}>
        <Link to="/dashboard">{t('common.dashboard', 'Dashboard')}</Link>
        <span className="bc-sep">›</span>
        <span>{t('adminGradesExport.breadcrumb', 'Grades export')}</span>
      </nav>

      <div className="ph" style={{ marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0 }}>{t('adminGradesExport.title', 'Export overall grades')}</h1>
          <p className="ph-sub" style={{ marginTop: 4 }}>
            {t(
              'adminGradesExport.subtitle',
              'Download gradebook totals for all subjects and all online exam attempts in one workbook.',
            )}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16, maxWidth: 640 }}>
        <div className="fg">
          <label className="fl">{t('adminGradesExport.semester', 'Semester (optional)')}</label>
          <select
            className="fc"
            value={semesterId}
            disabled={loadingSemesters || exporting}
            onChange={(e) => setSemesterId(e.target.value)}
          >
            <option value="">{t('adminGradesExport.allSemesters', 'All semesters')}</option>
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_en || s.name_ar}
                {s.academic_year ? ` (${s.academic_year})` : ''}
                {s.status ? ` — ${s.status}` : ''}
              </option>
            ))}
          </select>
          <div className="fh">
            {t(
              'adminGradesExport.semesterHint',
              'Leave as “All semesters” to export every active class and online exam.',
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-hd">
          <div className="card-title">{t('adminGradesExport.excelTitle', 'Excel workbook (recommended)')}</div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
          {t(
            'adminGradesExport.excelHelp',
            'Includes three sheets: Overall grades (all subjects), All exams catalog, and Exam attempts (every student submission).',
          )}
        </p>
        <button
          type="button"
          className="btn btn-p"
          disabled={exporting}
          onClick={() => runExport(exportAdminOverallGradesExcel)}
        >
          {exporting
            ? t('common.loading', 'Loading…')
            : t('adminGradesExport.downloadExcel', 'Download Excel — grades + all exams')}
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>
            {t('adminGradesExport.csvGradesTitle', 'Overall grades (CSV)')}
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            {t('adminGradesExport.csvGradesHelp', 'One row per enrolled student per subject/class.')}
          </p>
          <button
            type="button"
            className="btn btn-gh"
            disabled={exporting}
            onClick={() => runExport(exportAdminOverallGradesCsv)}
          >
            {t('adminGradesExport.downloadCsvGrades', 'Download CSV')}
          </button>
        </div>

        <div className="card">
          <div className="card-title" style={{ marginBottom: 8 }}>
            {t('adminGradesExport.csvExamsTitle', 'Exam attempts (CSV)')}
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            {t('adminGradesExport.csvExamsHelp', 'All online exam submissions across subjects.')}
          </p>
          <button
            type="button"
            className="btn btn-gh"
            disabled={exporting}
            onClick={() => runExport(exportAdminExamAttemptsCsv)}
          >
            {t('adminGradesExport.downloadCsvExams', 'Download CSV')}
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-err" style={{ marginTop: 16 }} role="alert">
          {error}
        </div>
      )}

      {message && !error && (
        <div className="alert alert-ok" style={{ marginTop: 16 }} role="status">
          {t('adminGradesExport.done', 'Export ready')}
          {message.filename ? `: ${message.filename}` : ''}
          {message.overallCount != null && (
            <div style={{ fontSize: 12, marginTop: 4 }}>
              {t('adminGradesExport.statsOverall', {
                defaultValue: '{{n}} gradebook rows',
                n: message.overallCount,
              })}
            </div>
          )}
          {message.examCount != null && (
            <div style={{ fontSize: 12 }}>
              {t('adminGradesExport.statsExams', {
                defaultValue: '{{n}} exams',
                n: message.examCount,
              })}
            </div>
          )}
          {message.attemptCount != null && (
            <div style={{ fontSize: 12 }}>
              {t('adminGradesExport.statsAttempts', {
                defaultValue: '{{n}} exam attempts',
                n: message.attemptCount,
              })}
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title" style={{ marginBottom: 8 }}>
          {t('adminGradesExport.related', 'Related')}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link to="/admin/exam-answers" className="btn btn-out btn-sm">
            {t('examAnswers.title', 'Student exam answers')}
          </Link>
          <Link to="/examinations" className="btn btn-out btn-sm">
            {t('navigation.examinations', 'Examinations')}
          </Link>
        </div>
      </div>
    </div>
  )
}
