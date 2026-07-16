import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'

export default function InstructorExamMonitor() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const classId = Number(searchParams.get('classId')) || null
  const examId = Number(searchParams.get('examId')) || null

  const [loading, setLoading] = useState(true)
  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState([])
  const [submissions, setSubmissions] = useState([])

  useEffect(() => {
    if (!user?.email || !examId) {
      setLoading(false)
      return
    }
    ;(async () => {
      setLoading(true)
      try {
        const instructor = await getActiveInstructorByEmail(user.email)
        if (!instructor) return

        const { data: ex } = await supabase
          .from('subject_exams')
          .select('id, title, class_id, total_points, classes(id, section, instructor_id, subjects(code))')
          .eq('id', examId)
          .maybeSingle()
        if (!ex || ex.classes?.instructor_id !== instructor.id) return
        setExam(ex)

        const [{ data: qs }, { data: subs }] = await Promise.all([
          supabase.from('subject_exam_questions').select('id, question_order').eq('subject_exam_id', examId).order('question_order'),
          supabase
            .from('exam_submissions')
            .select('id, student_id, status, started_at, submitted_at, points_earned, grade, submission_data, students(id, student_id, name_en, name_ar)')
            .eq('exam_id', examId)
            .order('submitted_at', { ascending: false }),
        ])
        setQuestions(qs || [])
        setSubmissions(subs || [])
      } finally {
        setLoading(false)
      }
    })()
  }, [user?.email, examId])

  const stats = useMemo(() => {
    const submitted = submissions.filter((s) => s.status === 'EX_SUB' || s.status === 'EX_GRD').length
    const graded = submissions.filter((s) => s.status === 'EX_GRD').length
    const avg =
      graded > 0
        ? submissions.filter((s) => s.points_earned != null).reduce((a, s) => a + Number(s.points_earned || 0), 0) / graded
        : 0
    return { submitted, graded, avg: Math.round(avg * 10) / 10 }
  }, [submissions])

  const exportCsv = () => {
    const headers = ['Student ID', 'Name', 'Status', 'Started', 'Submitted', 'Score']
    const qHeaders = questions.map((_, i) => `Q${i + 1}`)
    const lines = [headers.concat(qHeaders).join(',')]
    submissions.forEach((s) => {
      const st = s.students
      const answers = s.submission_data?.answers || {}
      const row = [
        st?.student_id || '',
        `"${(st?.name_en || '').replace(/"/g, '""')}"`,
        s.status,
        s.started_at || '',
        s.submitted_at || '',
        s.points_earned ?? '',
      ]
      questions.forEach((q) => {
        const a = answers[String(q.id)]
        row.push(a != null ? `"${String(a).replace(/"/g, '""')}"` : '')
      })
      lines.push(row.join(','))
    })
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `exam-${examId}-attempts.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--bdr)', borderTopColor: 'var(--p)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  if (!examId || !exam) {
    return (
      <div className="ph">
        <p className="ph-sub">{t('instructorPortal.selectExamToMonitor', 'Open this page with ?classId=&examId=')}</p>
        <Link to="/instructor/assessments" className="btn btn-p">{t('instructorPortal.createAssessments')}</Link>
      </div>
    )
  }

  return (
    <>
      <nav className="bc">
        <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
        <span className="bc-sep">›</span>
        <Link to={`/instructor/assessments?classId=${classId || exam.class_id}`}>{exam.classes?.subjects?.code}</Link>
        <span className="bc-sep">›</span>
        <span>{t('instructorPortal.monitorExam', 'Monitor exam')}</span>
      </nav>

      <div className="ph">
        <div>
          <h1>{t('instructorPortal.monitorExam', 'Monitor exam')}: {exam.title}</h1>
          <p className="ph-sub">{t('instructorPortal.monitorExamSubtitle', { submitted: stats.submitted, graded: stats.graded, avg: stats.avg, defaultValue: `${stats.submitted} submitted · ${stats.graded} graded · avg ${stats.avg}` })}</p>
        </div>
        <div className="ph-acts">
          <button type="button" className="btn btn-gh" onClick={exportCsv}>⬇ CSV</button>
          <Link
            to={`/instructor/exam-answers?examId=${examId}&classId=${classId || exam.class_id || ''}`}
            className="btn btn-ok"
          >
            {t('examAnswers.title', 'Student answers')}
          </Link>
          <Link to={`/instructor/grade-exam?examId=${examId}`} className="btn btn-p">{t('instructorPortal.manualGrading', 'Manual grading')}</Link>
        </div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>{t('instructorPortal.studentId', 'Student ID')}</th>
                <th>{t('instructorPortal.studentName', 'Name')}</th>
                <th>{t('instructorPortal.status', 'Status')}</th>
                <th>{t('instructorPortal.startedAt', 'Started')}</th>
                <th>{t('instructorPortal.submittedAt', 'Submitted')}</th>
                <th>{t('instructorPortal.score', 'Score')}</th>
                {questions.map((q, i) => (
                  <th key={q.id}>Q{i + 1}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => {
                const answers = s.submission_data?.answers || {}
                return (
                  <tr key={s.id}>
                    <td>{s.students?.student_id || '—'}</td>
                    <td>{s.students?.name_en || '—'}</td>
                    <td>{s.status}</td>
                    <td>{s.started_at ? new Date(s.started_at).toLocaleString() : '—'}</td>
                    <td>{s.submitted_at ? new Date(s.submitted_at).toLocaleString() : '—'}</td>
                    <td>{s.points_earned != null ? `${s.points_earned}/${exam.total_points}` : '—'}</td>
                    {questions.map((q) => (
                      <td key={q.id}>{answers[String(q.id)] != null ? '✓' : '—'}</td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {submissions.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)' }}>{t('instructorPortal.noAttemptsYet', 'No attempts yet.')}</div>
        )}
      </div>
    </>
  )
}
