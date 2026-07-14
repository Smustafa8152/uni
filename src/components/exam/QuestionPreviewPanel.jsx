import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import QuestionRenderer, { getCorrectAnswerLabel } from './QuestionRenderer'

export default function QuestionPreviewPanel({ question, isArabic, onClose }) {
  const { t } = useTranslation()
  const [answer, setAnswer] = useState(null)
  const [submitted, setSubmitted] = useState(false)

  const isCorrect = useMemo(() => {
    if (!submitted || answer == null) return null
    const correct = question?.correct_answers ?? []
    if (question?.question_type === 'multiple_choice' || question?.question_type === 'true_false') {
      return correct.map(Number).includes(Number(answer))
    }
    return null
  }, [submitted, answer, question])

  if (!question) return null

  const generalFeedback = isArabic
    ? question.general_feedback_ar || question.general_feedback
    : question.general_feedback
  const correctFeedback = isArabic
    ? question.correct_feedback_ar || question.correct_feedback
    : question.correct_feedback
  const incorrectFeedback = isArabic
    ? question.incorrect_feedback_ar || question.incorrect_feedback
    : question.incorrect_feedback

  return (
    <div className="modal-overlay" role="dialog" onClick={onClose}>
      <div className="modal-card exam-preview-modal" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
        <div className="card-hd">
          <div className="card-title">{t('instructorPortal.previewQuestion', 'Preview question')}</div>
          <button type="button" className="btn btn-gh" onClick={onClose}>×</button>
        </div>
        <div className="exam-preview-layout">
          <aside className="exam-preview-sidebar">
            <div><strong>{t('instructorPortal.question', 'Question')} 1</strong></div>
            <div>{submitted ? (isCorrect ? t('instructorPortal.correct', 'Correct') : t('instructorPortal.incorrect', 'Incorrect')) : t('instructorPortal.notYetAnswered', 'Not yet answered')}</div>
            <div>{t('instructorPortal.markedOutOf', 'Marked out of {{n}}', { n: question.estimated_marks ?? question.marks ?? 1 })}</div>
          </aside>
          <div className="exam-preview-main">
            <div className="exam-preview-question-box">
              <div className="exam-preview-qtext">{question.question_text}</div>
              <QuestionRenderer
                question={question}
                answer={answer}
                onChange={setAnswer}
                readOnly={submitted}
                showCorrect={submitted}
                isArabic={isArabic}
              />
            </div>
            {submitted && (
              <div className="exam-preview-feedback-box">
                <div><strong>{t('instructorPortal.feedback', 'Feedback')}</strong></div>
                {isCorrect === false && (
                  <p>
                    {t('instructorPortal.correctAnswerIs', "The correct answer is '{{ans}}'.", {
                      ans: getCorrectAnswerLabel(question, isArabic),
                    })}
                  </p>
                )}
                {isCorrect && correctFeedback && <p>{correctFeedback}</p>}
                {isCorrect === false && incorrectFeedback && <p>{incorrectFeedback}</p>}
                {generalFeedback && <p>{generalFeedback}</p>}
              </div>
            )}
          </div>
        </div>
        <div className="exam-preview-actions">
          <button type="button" className="btn btn-gh" onClick={() => { setAnswer(null); setSubmitted(false) }}>
            {t('instructorPortal.startAgain', 'Start again')}
          </button>
          <button
            type="button"
            className="btn btn-gh"
            onClick={() => {
              const correct = question.correct_answers ?? []
              setAnswer(Number(correct[0] ?? 0))
              setSubmitted(true)
            }}
          >
            {t('instructorPortal.fillCorrectResponses', 'Fill in correct responses')}
          </button>
          <button type="button" className="btn btn-p" disabled={answer == null} onClick={() => setSubmitted(true)}>
            {t('instructorPortal.check', 'Check')}
          </button>
        </div>
      </div>
    </div>
  )
}
