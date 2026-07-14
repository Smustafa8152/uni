import { useTranslation } from 'react-i18next'
import { optionsFromDb } from '../../utils/questionValidation'

function optionLabel(opt, i) {
  if (typeof opt === 'string') return opt
  return opt?.text ?? opt?.label ?? `Option ${i + 1}`
}

export default function QuestionRenderer({
  question,
  answer,
  onChange,
  readOnly = false,
  showCorrect = false,
  isArabic = false,
}) {
  const { t } = useTranslation()
  const type = question?.question_type || 'multiple_choice'
  const opts = optionsFromDb(question?.options)
  const correct = question?.correct_answers ?? []
  const qid = question?.id

  if (type === 'true_false' || type === 'multiple_choice') {
    const isMulti = type === 'multiple_choice' && Array.isArray(answer)
    return (
      <div className="exam-q-options">
        {opts.map((opt, i) => {
          const label = optionLabel(opt, i)
          const isCorrect = correct.map(Number).includes(i)
          const checked = isMulti ? answer?.includes(i) : Number(answer) === i
          return (
            <label
              key={i}
              className={`exam-q-option${checked ? ' is-selected' : ''}${showCorrect && isCorrect ? ' is-correct' : ''}${showCorrect && checked && !isCorrect ? ' is-wrong' : ''}`}
            >
              <input
                type={isMulti ? 'checkbox' : 'radio'}
                name={`q-${qid}`}
                checked={!!checked}
                disabled={readOnly}
                onChange={() => {
                  if (readOnly || !onChange) return
                  if (isMulti) {
                    const set = new Set(answer || [])
                    if (set.has(i)) set.delete(i)
                    else set.add(i)
                    onChange([...set].sort((a, b) => a - b))
                  } else {
                    onChange(i)
                  }
                }}
              />
              <span>{label}</span>
              {showCorrect && isCorrect && (
                <span className="exam-q-correct-mark" aria-hidden="true"> ✓</span>
              )}
            </label>
          )
        })}
      </div>
    )
  }

  if (type === 'short_answer' || type === 'essay') {
    return (
      <textarea
        className="fc"
        rows={type === 'essay' ? 6 : 3}
        value={answer ?? ''}
        disabled={readOnly}
        placeholder={t('studentPortal.typeYourAnswer', 'Type your answer…')}
        onChange={(e) => onChange?.(e.target.value)}
      />
    )
  }

  if (type === 'numeric') {
    return (
      <input
        type="number"
        className="fc"
        step="any"
        value={answer ?? ''}
        disabled={readOnly}
        onChange={(e) => onChange?.(e.target.value === '' ? null : Number(e.target.value))}
      />
    )
  }

  if (type === 'order') {
    return (
      <ol className="exam-q-order-list">
        {opts.map((opt, i) => (
          <li key={i}>{optionLabel(opt, i)}</li>
        ))}
      </ol>
    )
  }

  return (
    <p style={{ color: 'var(--muted)', fontSize: 13 }}>
      {t('instructorPortal.questionTypePreviewSoon', 'Preview for this question type is coming soon.')}
    </p>
  )
}

export function getCorrectAnswerLabel(question, isArabic) {
  const type = question?.question_type
  const opts = optionsFromDb(question?.options)
  const correct = question?.correct_answers ?? []
  if (type === 'true_false' || type === 'multiple_choice') {
    const idx = Number(correct[0])
    if (opts[idx]) return optionLabel(opts[idx], idx)
    return isArabic ? '—' : '—'
  }
  if (type === 'numeric') return String(correct[0] ?? '—')
  return '—'
}
