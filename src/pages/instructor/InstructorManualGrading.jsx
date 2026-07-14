import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'

const MANUAL_TYPES = new Set(['essay', 'short_answer', 'file_upload', 'matching'])

export default function InstructorManualGrading() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const examId = Number(searchParams.get('examId')) || null

  const [loading, setLoading] = useState(true)
  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [activeSubId, setActiveSubId] = useState(null)
  const [marks, setMarks] = useState({})
  const [saving, setSaving] = useState(false)

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
          .select('id, title, total_points, class_id, classes(instructor_id, subjects(code))')
          .eq('id', examId)
          .maybeSingle()
        if (!ex || ex.classes?.instructor_id !== instructor.id) return
        setExam(ex)
        const [{ data: qs }, { data: subs }] = await Promise.all([
          supabase.from('subject_exam_questions').select('id, question_order, question_type, question_text, marks').eq('subject_exam_id', examId).order('question_order'),
          supabase
            .from('exam_submissions')
            .select('id, student_id, status, points_earned, submission_data, students(student_id, name_en)')
            .eq('exam_id', examId)
            .in('status', ['EX_SUB', 'EX_GRD'])
            .order('submitted_at', { ascending: false }),
        ])
        setQuestions(qs || [])
        setSubmissions(subs || [])
        if (subs?.[0]) setActiveSubId(subs[0].id)
      } finally {
        setLoading(false)
      }
    })()
  }, [user?.email, examId])

  const activeSub = submissions.find((s) => s.id === activeSubId)
  const manualQuestions = questions.filter((q) => MANUAL_TYPES.has(q.question_type))

  const saveGrade = async () => {
    if (!activeSub || !exam) return
    setSaving(true)
    try {
      const autoPoints = Number(activeSub.submission_data?.autoGrade?.points_earned || activeSub.points_earned || 0)
      const manualTotal = manualQuestions.reduce((sum, q) => sum + Number(marks[q.id] || 0), 0)
      const autoOnly = Number(activeSub.submission_data?.autoGrade?.points_earned ?? 0)
      const points = manualQuestions.length ? autoOnly + manualTotal : autoPoints
      const pct = exam.total_points ? Math.round((points / exam.total_points) * 1000) / 10 : 0
      await supabase
        .from('exam_submissions')
        .update({
          points_earned: points,
          grade: pct,
          status: 'EX_GRD',
          submission_data: {
            ...activeSub.submission_data,
            manualMarks: marks,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', activeSub.id)
      setSubmissions((rows) =>
        rows.map((r) => (r.id === activeSub.id ? { ...r, points_earned: points, grade: pct, status: 'EX_GRD' } : r)),
      )
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--bdr)', borderTopColor: 'var(--p)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  if (!exam) {
    return (
      <div className="ph">
        <p className="ph-sub">{t('instructorPortal.selectExamToGrade', 'Open with ?examId=')}</p>
        <Link to="/instructor/assessments" className="btn btn-p">{t('instructorPortal.createAssessments')}</Link>
      </div>
    )
  }

  return (
    <>
      <nav className="bc">
        <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
        <span className="bc-sep">›</span>
        <Link to={`/instructor/monitor-exam?examId=${examId}`}>{t('instructorPortal.monitorExam', 'Monitor')}</Link>
        <span className="bc-sep">›</span>
        <span>{t('instructorPortal.manualGrading', 'Manual grading')}</span>
      </nav>

      <div className="ph">
        <h1>{t('instructorPortal.manualGrading', 'Manual grading')}: {exam.title}</h1>
      </div>

      <div className="grid2">
        <div className="card">
          <div className="card-hd"><div className="card-title">{t('instructorPortal.submissions', 'Submissions')}</div></div>
          {submissions.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`qb-cat-item${activeSubId === s.id ? ' active' : ''}`}
              style={{ width: '100%', textAlign: 'start', marginBottom: 4 }}
              onClick={() => { setActiveSubId(s.id); setMarks({}) }}
            >
              {s.students?.student_id} — {s.students?.name_en} ({s.status})
            </button>
          ))}
        </div>

        <div className="card">
          {activeSub ? (
            <>
              <div className="card-hd"><div className="card-title">{activeSub.students?.name_en}</div></div>
              {manualQuestions.length === 0 ? (
                <p style={{ color: 'var(--muted)' }}>{t('instructorPortal.noManualQuestions', 'No manual-grade questions in this exam.')}</p>
              ) : (
                manualQuestions.map((q) => {
                  const answer = activeSub.submission_data?.answers?.[String(q.id)]
                  return (
                    <div key={q.id} className="fg">
                      <label className="fl">Q{q.question_order}: {q.question_text}</label>
                      <div style={{ background: 'var(--bg)', padding: 10, borderRadius: 8, marginBottom: 8, fontSize: 13 }}>
                        {answer != null ? String(answer) : t('instructorPortal.noAnswer', 'No answer')}
                      </div>
                      <input
                        type="number"
                        className="fc"
                        min={0}
                        max={q.marks}
                        value={marks[q.id] ?? ''}
                        onChange={(e) => setMarks((m) => ({ ...m, [q.id]: Number(e.target.value) || 0 }))}
                        placeholder={`0 / ${q.marks}`}
                      />
                    </div>
                  )
                })
              )}
              <button type="button" className="btn btn-p" disabled={saving} onClick={saveGrade}>
                {t('instructorPortal.saveGrade', 'Save grade')}
              </button>
            </>
          ) : (
            <div style={{ color: 'var(--muted)' }}>{t('instructorPortal.selectSubmission', 'Select a submission')}</div>
          )}
        </div>
      </div>
    </>
  )
}
