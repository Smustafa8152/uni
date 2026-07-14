/** Auto-grade objective exam questions from submission answers */

function normalizeAnswer(value) {
  if (value == null) return null
  if (typeof value === 'number') return value
  if (typeof value === 'string') {
    const lower = value.trim().toLowerCase()
    if (lower === 'true' || lower === 'صح') return 0
    if (lower === 'false' || lower === 'خطأ') return 1
    const n = Number(value)
    if (!Number.isNaN(n)) return n
    return value.trim()
  }
  if (Array.isArray(value)) return value
  return value
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  return a.every((v, i) => v === b[i])
}

export function gradeQuestion(question, rawAnswer) {
  const type = question.question_type
  const marks = Number(question.marks ?? question.estimated_marks ?? 1)
  const correct = question.correct_answers ?? []
  const answer = normalizeAnswer(rawAnswer)

  if (answer == null || answer === '') {
    return { earned: 0, max: marks, correct: false, needsManual: false }
  }

  if (type === 'multiple_choice' || type === 'true_false') {
    let studentIndex = answer
    if (typeof studentIndex === 'string') {
      const opts = question.options || []
      const idx = opts.findIndex((o) => {
        const t = typeof o === 'string' ? o : o.text
        return String(t).toLowerCase() === studentIndex.toLowerCase()
      })
      studentIndex = idx >= 0 ? idx : Number(studentIndex)
    }
    const expected = Array.isArray(correct) ? correct.map(Number) : [Number(correct)]
    const ok = expected.includes(Number(studentIndex))
    return { earned: ok ? marks : 0, max: marks, correct: ok, needsManual: false }
  }

  if (type === 'order') {
    const expected = (correct || []).map(Number)
    const given = Array.isArray(answer) ? answer.map(Number) : []
    const ok = arraysEqual(expected, given)
    return { earned: ok ? marks : 0, max: marks, correct: ok, needsManual: false }
  }

  if (type === 'numeric') {
    const expected = Number(Array.isArray(correct) ? correct[0] : correct)
    const given = Number(answer)
    const ok = !Number.isNaN(expected) && !Number.isNaN(given) && Math.abs(expected - given) < 0.001
    return { earned: ok ? marks : 0, max: marks, correct: ok, needsManual: false }
  }

  if (type === 'matching') {
    const expected = correct
    const ok = Array.isArray(answer) && Array.isArray(expected) && arraysEqual(expected, answer)
    return { earned: ok ? marks : 0, max: marks, correct: ok, needsManual: false }
  }

  if (type === 'short_answer' || type === 'essay' || type === 'file_upload' || type === 'fill_blank') {
    return { earned: 0, max: marks, correct: false, needsManual: true }
  }

  return { earned: 0, max: marks, correct: false, needsManual: false }
}

export function autoGradeExam(questions, answersMap = {}) {
  let totalEarned = 0
  let totalMax = 0
  let needsManual = false
  const perQuestion = {}

  ;(questions || []).forEach((q) => {
    const key = String(q.id)
    const result = gradeQuestion(q, answersMap[key] ?? answersMap[q.id])
    perQuestion[key] = result
    totalEarned += result.earned
    totalMax += result.max
    if (result.needsManual) needsManual = true
  })

  const percent = totalMax > 0 ? (totalEarned / totalMax) * 100 : 0
  return {
    points_earned: totalEarned,
    total_points: totalMax,
    percent,
    needsManual,
    perQuestion,
    fullyAutoGraded: !needsManual,
  }
}

export function studentAnswerIsAnswered(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return true
}
