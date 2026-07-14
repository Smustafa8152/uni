import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'
import { mergeAssessmentSettings } from '../../utils/assessmentSettings'
import QuestionRenderer from '../../components/exam/QuestionRenderer'
import '../../styles/instructor-portal.css'

export default function InstructorExamPagePreview() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const classId = Number(searchParams.get('classId')) || null
  const examId = Number(searchParams.get('examId')) || null

  const [loading, setLoading] = useState(true)
  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState([])
  const [qIndex, setQIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [flagged, setFlagged] = useState({})

  const isArabic = isRTL || language === 'ar'

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
          .select('id, title, instructions, duration_minutes, total_points, assessment_settings, class_id, classes(instructor_id, subjects(code))')
          .eq('id', examId)
          .maybeSingle()
        if (!ex || ex.classes?.instructor_id !== instructor.id) return
        setExam(ex)
        const { data: qs } = await supabase
          .from('subject_exam_questions')
          .select('id, question_order, question_type, question_text, options, correct_answers, marks')
          .eq('subject_exam_id', examId)
          .order('question_order')
        setQuestions(qs || [])
      } finally {
        setLoading(false)
      }
    })()
  }, [user?.email, examId])

  const settings = useMemo(() => mergeAssessmentSettings(exam?.assessment_settings), [exam?.assessment_settings])
  const layout = settings.layout === 'all' ? questions.length : Number(settings.layout || 1)
  const pageStart = Math.floor(qIndex / layout) * layout
  const pageQuestions = questions.slice(pageStart, pageStart + layout)
  const currentQ = questions[qIndex]
  const backHref = `/instructor/exam-settings?classId=${classId || exam?.class_id || ''}&examId=${examId || ''}`

  if (loading) {
    return (
      <div className="instructor-portal" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--bdr)', borderTopColor: 'var(--p)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  if (!exam || !questions.length) {
    return (
      <div className="instructor-portal" style={{ padding: 40 }}>
        <p>{t('instructorPortal.previewNeedsExam', 'Save an exam with questions, then open preview from exam settings.')}</p>
        <Link to={backHref} className="btn btn-p">{t('instructorPortal.examPreviewBackSettings')}</Link>
      </div>
    )
  }

  return (
    <div className="instructor-portal" dir={isArabic ? 'rtl' : 'ltr'} style={{ minHeight: '100vh', background: '#f0f4fb' }}>
      <div style={{ background: 'var(--p)', color: '#fff', padding: '0 28px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{exam.title}</div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>{exam.classes?.subjects?.code} · {t('instructorPortal.examPreviewModeBadge')}</div>
        </div>
        <div style={{ fontWeight: 700 }}>{qIndex + 1} / {questions.length}</div>
      </div>

      <div style={{ display: 'flex', maxWidth: 1200, margin: '0 auto', padding: '24px 20px', gap: 24 }}>
        <div style={{ flex: 1 }}>
          {exam.instructions && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-hd"><div className="card-title">{t('instructorPortal.examPreviewInstructionsTitle')}</div></div>
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: 'var(--muted)' }}>{exam.instructions}</div>
            </div>
          )}
          {pageQuestions.map((q) => (
            <div key={q.id} className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Q{q.question_order}</span>
                <span style={{ fontWeight: 700, color: 'var(--p)' }}>{q.marks} {t('instructorPortal.pts')}</span>
              </div>
              <div className="exam-preview-qtext" style={{ marginBottom: 16 }}>{q.question_text}</div>
              <QuestionRenderer
                question={q}
                answer={answers[String(q.id)]}
                onChange={(v) => setAnswers((m) => ({ ...m, [String(q.id)]: v }))}
                isArabic={isArabic}
              />
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button type="button" className="btn btn-gh" disabled={qIndex === 0} onClick={() => setQIndex((i) => Math.max(0, i - 1))}>{t('instructorPortal.examPreviewPrevQ')}</button>
            <button type="button" className="btn btn-p" disabled={qIndex >= questions.length - 1} onClick={() => setQIndex((i) => Math.min(questions.length - 1, i + 1))}>{t('instructorPortal.examPreviewNextQ')}</button>
          </div>
        </div>

        <div style={{ width: 220, flexShrink: 0 }}>
          <div className="card" style={{ position: 'sticky', top: 80 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--p)', marginBottom: 14 }}>{t('instructorPortal.examPreviewNavTitle')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
              {questions.map((q, i) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setQIndex(i)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 'var(--rs)',
                    border: i === qIndex ? '2px solid var(--p)' : '1.5px solid var(--bdr)',
                    background: answers[String(q.id)] != null ? 'var(--ok)' : i === qIndex ? 'var(--p)' : 'var(--bg)',
                    color: answers[String(q.id)] != null || i === qIndex ? '#fff' : 'var(--txt)',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-err btn-bl" style={{ marginTop: 16, width: '100%' }} disabled>
              {t('instructorPortal.examPreviewSubmit')}
            </button>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: 16 }}>
        <Link to={backHref} className="btn btn-gh btn-sm">{t('instructorPortal.examPreviewBackSettings')}</Link>
      </div>
    </div>
  )
}
