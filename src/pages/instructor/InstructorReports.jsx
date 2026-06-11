import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'
import { fetchClassCloAlignment } from '../../utils/cloAlignment'
import { exportCloAlignmentReport } from '../../utils/exportCloReport'

const reportRowBase = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: 14,
  background: 'var(--bg)',
  borderRadius: 'var(--rs)',
  textDecoration: 'none',
  color: 'var(--txt)',
  border: '1px solid var(--bdr)',
  transition: 'all 0.2s',
  cursor: 'pointer',
  width: '100%',
  textAlign: 'inherit',
  fontFamily: 'inherit',
  fontSize: 'inherit',
}

/**
 * Reports hub — matches IBU instructor portal reference (academic, participation, custom builder).
 */
export default function InstructorReports() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { language } = useLanguage()
  const isArabic = language === 'ar'
  const [course, setCourse] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [reportType, setReportType] = useState('student_perf')
  const [exportFmt, setExportFmt] = useState('pdf')
  const [classes, setClasses] = useState([])
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    document.title = `${t('instructorPortal.reportsBreadcrumbLast')} — ${t('instructorPortal.instructorPortalAr')} | IBU`
  }, [t])

  useEffect(() => {
    if (!user?.email) return
    ;(async () => {
      const instructor = await getActiveInstructorByEmail(user.email)
      if (!instructor) return
      const { data } = await supabase
        .from('classes')
        .select('id, section, subject_id, subjects(id, code, name_en, name_ar)')
        .eq('instructor_id', instructor.id)
        .eq('status', 'active')
        .order('id', { ascending: false })
      setClasses(data || [])
      if (data?.length === 1) setCourse(String(data[0].id))
    })()
  }, [user?.email])

  const exportOutcomesReport = async () => {
    setExporting(true)
    try {
      const targets =
        course === 'all' ? classes : classes.filter((c) => String(c.id) === course)

      if (!targets.length) {
        alert(t('instructorPortal.reportsOutcomesNoClass'))
        return
      }

      for (const cls of targets) {
        const alignment = await fetchClassCloAlignment(supabase, {
          classId: cls.id,
          subjectId: cls.subject_id,
        })
        exportCloAlignmentReport({
          subjectCode: cls.subjects?.code || 'course',
          classSection: cls.section,
          rows: alignment.rows,
          isArabic,
        })
      }
    } catch (err) {
      console.error(err)
      alert(t('common.error', 'Error'))
    } finally {
      setExporting(false)
    }
  }

  const handleOutcomesCustomExport = async () => {
    if (reportType === 'outcomes' && exportFmt === 'excel') {
      await exportOutcomesReport()
    }
  }

  return (
    <>
      <nav className="bc" aria-label={t('instructorPortal.breadcrumbMain')}>
        <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
        <span className="bc-sep">›</span>
        <span>{t('instructorPortal.reportsBreadcrumbLast')}</span>
      </nav>

      <div className="ph">
        <div>
          <h1>{t('instructorPortal.reportsPageTitle')}</h1>
          <p className="ph-sub">{t('instructorPortal.reportsPhSub')}</p>
        </div>
        <div className="ph-acts">
          <button type="button" className="btn btn-gh" onClick={() => {}}>
            📥 {t('instructorPortal.reportsExportAll')}
          </button>
        </div>
      </div>

      <div className="grid2">
        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">{t('instructorPortal.reportsSectionAcademic')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { emoji: '📈', title: 'reportsAcademic1Title', desc: 'reportsAcademic1Desc', action: 'reportsAcademic1Export', onClick: null },
                { emoji: '🎯', title: 'reportsAcademic2Title', desc: 'reportsAcademic2Desc', action: 'reportsAcademic2Export', onClick: exportOutcomesReport },
                { emoji: '⚠️', title: 'reportsAcademic3Title', desc: 'reportsAcademic3Desc', action: 'reportsAcademic3Export', onClick: null },
                { emoji: '📊', title: 'reportsAcademic4Title', desc: 'reportsAcademic4Desc', action: 'reportsAcademic4Export', onClick: null },
              ].map((row) => (
                <button
                  key={row.title}
                  type="button"
                  style={reportRowBase}
                  disabled={exporting && row.onClick}
                  onClick={(e) => {
                    e.preventDefault()
                    row.onClick?.()
                  }}
                >
                  <div style={{ fontSize: 28 }}>{row.emoji}</div>
                  <div style={{ flex: 1, textAlign: 'start' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t(`instructorPortal.${row.title}`)}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t(`instructorPortal.${row.desc}`)}</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--p)', fontWeight: 600 }}>
                    {exporting && row.onClick ? t('common.loading') : t(`instructorPortal.${row.action}`)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">{t('instructorPortal.reportsSectionParticipation')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { emoji: '📅', title: 'reportsPart1Title', desc: 'reportsPart1Desc', action: 'reportsPart1Export' },
                { emoji: '💬', title: 'reportsPart2Title', desc: 'reportsPart2Desc', action: 'reportsPart2Export' },
                { emoji: '📖', title: 'reportsPart3Title', desc: 'reportsPart3Desc', action: 'reportsPart3Export' },
                { emoji: '🔒', title: 'reportsPart4Title', desc: 'reportsPart4Desc', action: 'reportsPart4Export' },
              ].map((row) => (
                <button
                  key={row.title}
                  type="button"
                  style={reportRowBase}
                  onClick={(e) => e.preventDefault()}
                >
                  <div style={{ fontSize: 28 }}>{row.emoji}</div>
                  <div style={{ flex: 1, textAlign: 'start' }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{t(`instructorPortal.${row.title}`)}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t(`instructorPortal.${row.desc}`)}</div>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--p)', fontWeight: 600 }}>{t(`instructorPortal.${row.action}`)}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">{t('instructorPortal.reportsSectionCustom')}</div>
            </div>
            <div className="fg">
              <label className="fl" htmlFor="report_course">
                {t('instructorPortal.reportsLabelCourse')}
              </label>
              <select
                id="report_course"
                className="fc"
                data-field="report_course"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
              >
                <option value="all">{t('instructorPortal.reportsOptCourseAll')}</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={String(cls.id)}>
                    {cls.subjects?.code} — {getLocalizedName(cls.subjects, isArabic)} ({t('instructorPortal.section')} {cls.section})
                  </option>
                ))}
              </select>
            </div>
            <div className="fr">
              <div className="fg">
                <label className="fl" htmlFor="report_from">
                  {t('instructorPortal.reportsLabelFrom')}
                </label>
                <input
                  id="report_from"
                  type="date"
                  className="fc"
                  data-field="report_from"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
              <div className="fg">
                <label className="fl" htmlFor="report_to">
                  {t('instructorPortal.reportsLabelTo')}
                </label>
                <input
                  id="report_to"
                  type="date"
                  className="fc"
                  data-field="report_to"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </div>
            </div>
            <div className="fg">
              <label className="fl" htmlFor="report_type">
                {t('instructorPortal.reportsLabelReportType')}
              </label>
              <select
                id="report_type"
                className="fc"
                data-field="report_type"
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
              >
                <option value="student_perf">{t('instructorPortal.reportsOptTypeStudentPerf')}</option>
                <option value="assessments">{t('instructorPortal.reportsOptTypeAssessments')}</option>
                <option value="participation">{t('instructorPortal.reportsOptTypeParticipation')}</option>
                <option value="outcomes">{t('instructorPortal.reportsOptTypeOutcomes')}</option>
                <option value="full">{t('instructorPortal.reportsOptTypeFull')}</option>
              </select>
            </div>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label className="fl" htmlFor="export_format">
                {t('instructorPortal.reportsLabelExportFormat')}
              </label>
              <select
                id="export_format"
                className="fc"
                data-field="export_format"
                value={exportFmt}
                onChange={(e) => setExportFmt(e.target.value)}
              >
                <option value="pdf">{t('instructorPortal.reportsOptFmtPdf')}</option>
                <option value="excel">{t('instructorPortal.reportsOptFmtExcel')}</option>
                <option value="csv">{t('instructorPortal.reportsOptFmtCsv')}</option>
              </select>
            </div>
            <button
              type="button"
              className="btn btn-p btn-bl"
              style={{ marginTop: 14 }}
              disabled={exporting}
              onClick={handleOutcomesCustomExport}
            >
              📊 {exporting ? t('common.loading') : t('instructorPortal.reportsBtnGenerate')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
