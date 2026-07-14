/** Shared assessment_settings schema for subject_exams */

export const RESULT_VISIBILITY = {
  IMMEDIATE: 'immediate',
  AFTER_WINDOW: 'after_window',
  MANUAL_RELEASE: 'manual_release',
}

export const NAVIGATION_MODE = {
  FREE: 'free',
  SEQUENTIAL: 'sequential',
}

export const GRADING_METHOD = {
  HIGHEST: 'highest',
  AVERAGE: 'average',
  FIRST: 'first',
  LAST: 'last',
}

export const LAYOUT_OPTIONS = [1, 2, 3, 5, 10, 'all']

export const REVIEW_TIMING_KEYS = [
  'during_attempt',
  'immediately_after',
  'while_open',
  'after_closed',
]

export const REVIEW_VISIBILITY_KEYS = [
  'attempt',
  'correctness',
  'marks',
  'specific_feedback',
  'general_feedback',
  'right_answer',
  'overall_feedback',
]

function defaultReviewBucket() {
  return REVIEW_VISIBILITY_KEYS.reduce((acc, k) => {
    acc[k] = false
    return acc
  }, {})
}

export function defaultReviewOptions() {
  return {
    during_attempt: { ...defaultReviewBucket(), attempt: true },
    immediately_after: {
      ...defaultReviewBucket(),
      attempt: true,
      correctness: true,
      marks: true,
    },
    while_open: { ...defaultReviewBucket(), attempt: true, marks: true },
    after_closed: {
      ...defaultReviewBucket(),
      attempt: true,
      correctness: true,
      marks: true,
      specific_feedback: true,
      general_feedback: true,
      right_answer: true,
      overall_feedback: true,
    },
  }
}

export function defaultAssessmentSettings() {
  return {
    max_attempts: 1,
    grading_method: GRADING_METHOD.HIGHEST,
    shuffle_questions: true,
    shuffle_answers: true,
    randomize_from_bank: false,
    random_rules: [],
    result_visibility: RESULT_VISIBILITY.AFTER_WINDOW,
    late_policy: 'none',
    timezone: 'riyadh',
    integrity_statement: true,
    safe_browser: false,
    webcam_monitoring: false,
    plagiarism_check: false,
    summary_show_total: true,
    summary_show_correct: false,
    summary_show_feedback: false,
    resume_policy: 'resume_time_runs',
    accommodations: [],
    quiz_password: '',
    layout: 1,
    navigation_mode: NAVIGATION_MODE.FREE,
    question_behaviour: 'deferred_feedback',
    review_options: defaultReviewOptions(),
    overall_feedback_bands: [
      { min: 90, max: 100, feedback: 'Excellent' },
      { min: 75, max: 89, feedback: 'Very Good' },
      { min: 60, max: 74, feedback: 'Good' },
      { min: 0, max: 59, feedback: 'Please review the material' },
    ],
    autosave_interval_sec: 30,
    grace_period_minutes: 0,
    notify_students_on_change: false,
    week_number: null,
    /** How long the exam stays enterable after open (hours). Attempt timer is duration_minutes separately. */
    availability_hours: 24,
    window_start_at: null,
    window_end_at: null,
  }
}

/** Normalize legacy keys from authoring vs exam settings pages */
export function normalizeResultVisibility(value) {
  if (value === 'manual') return RESULT_VISIBILITY.MANUAL_RELEASE
  if (value === 'after_window' || value === 'immediate' || value === 'manual_release') return value
  return RESULT_VISIBILITY.AFTER_WINDOW
}

export function mergeAssessmentSettings(existing, patch = {}) {
  const base = { ...defaultAssessmentSettings(), ...(existing && typeof existing === 'object' ? existing : {}) }
  const merged = { ...base, ...patch }
  merged.result_visibility = normalizeResultVisibility(
    patch.result_visibility ?? patch.result_policy ?? merged.result_visibility,
  )
  merged.randomize_from_bank =
    patch.randomize_from_bank ?? patch.randomize_pool ?? merged.randomize_from_bank
  if (patch.review_options) {
    merged.review_options = {
      ...defaultReviewOptions(),
      ...merged.review_options,
      ...patch.review_options,
    }
  } else if (!merged.review_options) {
    merged.review_options = defaultReviewOptions()
  }
  if (!Array.isArray(merged.random_rules)) merged.random_rules = []
  if (!Array.isArray(merged.overall_feedback_bands)) merged.overall_feedback_bands = defaultAssessmentSettings().overall_feedback_bands
  if (!Array.isArray(merged.accommodations)) merged.accommodations = []
  return merged
}

export function settingsFromExamSettingsForm(form) {
  return mergeAssessmentSettings(null, {
    timezone: form.timezone,
    shuffle_questions: !!form.shuffle_questions,
    shuffle_answers: !!form.shuffle_answers,
    randomize_from_bank: !!form.randomize_pool,
    integrity_statement: !!form.integrity_statement,
    safe_browser: !!form.safe_browser,
    webcam_monitoring: !!form.webcam_monitoring,
    plagiarism_check: !!form.plagiarism_check,
    result_visibility: form.result_policy,
    summary_show_total: !!form.summary_total,
    summary_show_correct: !!form.summary_correct,
    summary_show_feedback: !!form.summary_feedback,
    resume_policy: form.resume_policy,
    accommodations: form.accommodations || [],
    max_attempts: form.max_attempts ?? 1,
    grading_method: form.grading_method ?? GRADING_METHOD.HIGHEST,
    layout: form.layout ?? 1,
    navigation_mode: form.navigation_mode ?? NAVIGATION_MODE.FREE,
    question_behaviour: form.question_behaviour ?? 'deferred_feedback',
    review_options: form.review_options,
    overall_feedback_bands: form.overall_feedback_bands,
    autosave_interval_sec: form.autosave_interval_sec ?? 30,
    grace_period_minutes: form.grace_period_minutes ?? 0,
    quiz_password: form.quiz_password ?? '',
    notify_students_on_change: !!form.notify_students_on_change,
    week_number: form.week_number ?? null,
  })
}

export function hydrateExamSettingsForm(settings) {
  const s = mergeAssessmentSettings(settings)
  return {
    timezone: s.timezone,
    shuffle_questions: s.shuffle_questions,
    shuffle_answers: s.shuffle_answers,
    randomize_pool: s.randomize_from_bank,
    integrity_statement: s.integrity_statement,
    safe_browser: s.safe_browser,
    webcam_monitoring: s.webcam_monitoring,
    plagiarism_check: s.plagiarism_check,
    result_policy: s.result_visibility,
    summary_total: s.summary_show_total,
    summary_correct: s.summary_show_correct,
    summary_feedback: s.summary_show_feedback,
    resume_policy: s.resume_policy,
    max_attempts: s.max_attempts,
    grading_method: s.grading_method,
    layout: s.layout,
    navigation_mode: s.navigation_mode,
    question_behaviour: s.question_behaviour,
    review_options: s.review_options,
    overall_feedback_bands: s.overall_feedback_bands,
    autosave_interval_sec: s.autosave_interval_sec,
    grace_period_minutes: s.grace_period_minutes,
    quiz_password: s.quiz_password || '',
    notify_students_on_change: s.notify_students_on_change,
    week_number: s.week_number,
    random_rules: s.random_rules,
  }
}

export function validatePublishSettings(exam, settings) {
  const errors = []
  const s = mergeAssessmentSettings(settings)
  if (!exam?.title?.trim()) errors.push('title_required')
  const needsPassword = ['midterm', 'final'].includes(exam?.exam_type)
  if (needsPassword && !String(s.quiz_password || '').trim()) errors.push('password_required')
  return errors
}

export function validatePublishExam(exam, settings, questions = []) {
  const errors = validatePublishSettings(exam, settings)
  if (!questions?.length) errors.push('questions_required')
  const totalMarks = (questions || []).reduce((s, q) => s + Number(q.marks || q.estimated_marks || 0), 0)
  if (totalMarks <= 0) errors.push('marks_required')
  return errors
}

export function settingsFromAuthoringForm(examForm, existingSettings = null) {
  return mergeAssessmentSettings(existingSettings, {
    max_attempts: Number(examForm.max_attempts || 1),
    shuffle_questions: !!examForm.shuffle_questions,
    shuffle_answers: !!examForm.shuffle_answers,
    randomize_from_bank: !!examForm.randomize_from_bank,
    result_visibility: examForm.result_visibility,
    late_policy: examForm.late_policy || 'none',
    assessment_file_url: examForm.assessment_file_url || null,
    assessment_file_name: examForm.assessment_file_name || null,
    rubric_id: examForm.rubric_id || null,
    quiz_password: examForm.quiz_password ?? '',
    week_number: examForm.week_number ?? null,
    random_rules: examForm.random_rules ?? existingSettings?.random_rules ?? [],
  })
}

export function hydrateAuthoringForm(exam, settings) {
  const s = mergeAssessmentSettings(settings)
  return {
    max_attempts: s.max_attempts,
    shuffle_questions: s.shuffle_questions,
    shuffle_answers: s.shuffle_answers,
    randomize_from_bank: s.randomize_from_bank,
    result_visibility: s.result_visibility,
    late_policy: s.late_policy,
    assessment_file_url: s.assessment_file_url || '',
    assessment_file_name: s.assessment_file_name || '',
    rubric_id: s.rubric_id || '',
    quiz_password: s.quiz_password || '',
    week_number: s.week_number,
    random_rules: s.random_rules || [],
  }
}

export function canShowReviewField(settings, timingKey, fieldKey) {
  const s = mergeAssessmentSettings(settings)
  return !!s.review_options?.[timingKey]?.[fieldKey]
}

export function overallFeedbackForScore(settings, percent) {
  const bands = mergeAssessmentSettings(settings).overall_feedback_bands || []
  const pct = Number(percent)
  if (Number.isNaN(pct)) return ''
  const band = bands.find((b) => pct >= Number(b.min) && pct <= Number(b.max))
  return band?.feedback || ''
}
