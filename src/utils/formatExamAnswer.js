/** Format student exam answers for instructor/admin review UI */

function optionLabel(options, index, t) {
  if (!Array.isArray(options) || index == null || Number.isNaN(Number(index))) return null
  const i = Number(index)
  const o = options[i]
  const fallback = t
    ? t('examAnswers.optionN', { defaultValue: 'Option {{n}}', n: i + 1 })
    : `Option ${i + 1}`
  if (o == null) return fallback
  if (typeof o === 'string') return o
  return o.text || o.label || o.value || fallback
}

function trueFalseLabel(value, t) {
  if (t) {
    return value ? t('examAnswers.trueLabel', 'True') : t('examAnswers.falseLabel', 'False')
  }
  return value ? 'True / صح' : 'False / خطأ'
}

/**
 * Human-readable student answer for a question.
 * @param {object} question
 * @param {*} rawAnswer
 * @param {(key: string, opts?: any) => string} [t] optional i18n function
 */
export function formatStudentAnswer(question, rawAnswer, t) {
  if (rawAnswer == null || rawAnswer === '') return null
  const type = question?.question_type
  const options = Array.isArray(question?.options) ? question.options : []

  if (type === 'multiple_choice') {
    const idx = Number(rawAnswer)
    const label = optionLabel(options, idx, t)
    return label != null ? `${String.fromCharCode(65 + idx)}. ${label}` : String(rawAnswer)
  }

  if (type === 'true_false') {
    const v = String(rawAnswer).toLowerCase()
    if (v === 'true' || v === '0' || v === 'صح') return trueFalseLabel(true, t)
    if (v === 'false' || v === '1' || v === 'خطأ') return trueFalseLabel(false, t)
    const label = optionLabel(options, Number(rawAnswer), t)
    return label || String(rawAnswer)
  }

  if (type === 'order' || type === 'matching') {
    const arr = Array.isArray(rawAnswer) ? rawAnswer : [rawAnswer]
    return arr
      .map((idx, pos) => {
        const label = optionLabel(options, idx, t)
        return `${pos + 1}. ${label != null ? label : idx}`
      })
      .join('\n')
  }

  if (Array.isArray(rawAnswer)) return rawAnswer.join(', ')
  return String(rawAnswer)
}

/**
 * Human-readable correct answer(s) for a question.
 * @param {object} question
 * @param {(key: string, opts?: any) => string} [t] optional i18n function
 */
export function formatCorrectAnswer(question, t) {
  const type = question?.question_type
  const options = Array.isArray(question?.options) ? question.options : []
  const correct = question?.correct_answers

  if (correct == null || (Array.isArray(correct) && correct.length === 0)) return null

  if (type === 'multiple_choice' || type === 'true_false') {
    const indices = Array.isArray(correct) ? correct.map(Number) : [Number(correct)]
    return indices
      .map((idx) => {
        if (type === 'true_false') {
          if (idx === 0) return trueFalseLabel(true, t)
          if (idx === 1) return trueFalseLabel(false, t)
        }
        const label = optionLabel(options, idx, t)
        return label != null ? `${String.fromCharCode(65 + idx)}. ${label}` : String(idx)
      })
      .join(', ')
  }

  if (type === 'order' || type === 'matching') {
    const arr = Array.isArray(correct) ? correct : [correct]
    return arr
      .map((idx, pos) => {
        const label = optionLabel(options, idx, t)
        return `${pos + 1}. ${label != null ? label : idx}`
      })
      .join('\n')
  }

  if (Array.isArray(correct)) return correct.join(', ')
  return String(correct)
}

/**
 * @param {string} status
 * @param {(key: string, defaultValue?: string) => string} [t]
 */
export function submissionStatusLabel(status, t) {
  const translate = (key, fallback) => (t ? t(key, fallback) : fallback)
  if (status === 'EX_GRD') return translate('examAnswers.statusGraded', 'Graded')
  if (status === 'EX_SUB') return translate('examAnswers.statusSubmitted', 'Submitted')
  if (status === 'EX_DRF') return translate('examAnswers.statusInProgress', 'In progress')
  return status || '—'
}

/**
 * @param {string} status exam lifecycle status
 * @param {(key: string, defaultValue?: string) => string} [t]
 */
export function examLifecycleStatusLabel(status, t) {
  const translate = (key, fallback) => (t ? t(key, fallback) : fallback)
  if (status === 'EX_OPN') return translate('examAnswers.statusOpen', 'Open')
  if (status === 'EX_SCH') return translate('examAnswers.statusScheduled', 'Scheduled')
  if (status === 'EX_DRF') return translate('examAnswers.statusDraft', 'Draft')
  if (status === 'EX_CLS') return translate('examAnswers.statusClosed', 'Closed')
  if (status === 'EX_REL') return translate('examAnswers.statusReleased', 'Released')
  return status || '—'
}

/**
 * @param {string} type question_type
 * @param {(key: string, defaultValue?: string) => string} [t]
 */
export function questionTypeLabel(type, t) {
  const translate = (key, fallback) => (t ? t(key, fallback) : fallback)
  const map = {
    multiple_choice: ['examAnswers.typeMultipleChoice', 'multiple choice'],
    true_false: ['examAnswers.typeTrueFalse', 'true / false'],
    short_answer: ['examAnswers.typeShortAnswer', 'short answer'],
    essay: ['examAnswers.typeEssay', 'essay'],
    order: ['examAnswers.typeOrder', 'ordering'],
    matching: ['examAnswers.typeMatching', 'matching'],
    fill_blank: ['examAnswers.typeFillBlank', 'fill in the blank'],
    fill_in_blank: ['examAnswers.typeFillBlank', 'fill in the blank'],
  }
  const entry = map[type]
  if (entry) return translate(entry[0], entry[1])
  return type ? String(type).replace(/_/g, ' ') : '—'
}
