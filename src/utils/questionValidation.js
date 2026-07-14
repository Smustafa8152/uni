/** Validation rules for question bank / exam questions */

export const QUESTION_STATUS_OPTIONS = ['draft', 'ready', 'archived']

export const TRUE_FALSE_OPTIONS_EN = ['True', 'False']
export const TRUE_FALSE_OPTIONS_AR = ['صح', 'خطأ']

export function defaultTrueFalseOptions(isArabic) {
  return isArabic ? [...TRUE_FALSE_OPTIONS_AR] : [...TRUE_FALSE_OPTIONS_EN]
}

export function normalizeOptions(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((o) => {
    if (typeof o === 'string') return { text: o, feedback: '' }
    return {
      text: String(o.text ?? o.label ?? o.value ?? ''),
      feedback: String(o.feedback ?? ''),
    }
  })
}

export function optionsToDb(options) {
  return normalizeOptions(options).map((o) => ({
    text: o.text,
    feedback: o.feedback || '',
  }))
}

export function optionsFromDb(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((o) => {
    if (typeof o === 'string') return { text: o, feedback: '' }
    return { text: String(o.text ?? o.label ?? ''), feedback: String(o.feedback ?? '') }
  })
}

export function optionTexts(options) {
  return normalizeOptions(options).map((o) => o.text).filter(Boolean)
}

export function validateQuestion(form, isArabic = false) {
  const errors = []
  const type = form.question_type || 'multiple_choice'
  const text = String(form.question_text || '').trim()
  if (!text) errors.push('question_text_required')

  if (type === 'multiple_choice') {
    const opts = optionTexts(form.options)
    if (opts.length < 2) errors.push('mcq_min_options')
    const correct = form.correctIndices ?? form.correct_answers ?? []
    const indices = Array.isArray(correct) ? correct : [correct]
    if (indices.length === 0) errors.push('correct_answer_required')
  }

  if (type === 'true_false') {
    const opts = optionTexts(form.options)
    if (opts.length !== 2) errors.push('true_false_exact_two')
    const correct = form.correctIndices ?? form.correct_answers ?? form.correct_answer
    if (correct == null || (Array.isArray(correct) && correct.length === 0)) {
      errors.push('correct_answer_required')
    }
  }

  if (type === 'order') {
    const opts = optionTexts(form.options)
    if (opts.length < 2) errors.push('order_min_items')
  }

  if (type === 'numeric') {
    if (form.correct_numeric == null && form.correct_answers?.length === 0) {
      errors.push('numeric_answer_required')
    }
  }

  return errors
}

export function canAddOption(questionType) {
  return questionType === 'multiple_choice' || questionType === 'order'
}

export function buildCorrectAnswers(form) {
  const type = form.question_type
  if (type === 'multiple_choice') {
    const indices = form.correctIndices ?? (form.correct_answer != null ? [form.correct_answer] : [])
    return Array.isArray(indices) ? indices : [indices]
  }
  if (type === 'true_false') {
    const idx = form.correctIndices?.[0] ?? form.correct_answer ?? 0
    return [Number(idx)]
  }
  if (type === 'order') {
    const n = optionTexts(form.options).length
    return Array.from({ length: n }, (_, i) => i)
  }
  if (type === 'numeric') {
    const v = form.correct_numeric ?? form.correct_answers?.[0]
    return v != null ? [Number(v)] : []
  }
  return form.correct_answers ?? []
}
