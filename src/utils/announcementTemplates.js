/** Built-in announcement templates (i18n keys for title/body). */
export const BUILTIN_ANNOUNCEMENT_TEMPLATES = [
  {
    id: 'builtin:assignment_reminder',
    category: 'assignment',
    nameKey: 'instructorPortal.commTplAssignmentReminder',
    titleKey: 'instructorPortal.commTplAssignmentReminderTitle',
    bodyKey: 'instructorPortal.commTplAssignmentReminderBody',
  },
  {
    id: 'builtin:exam_reminder',
    category: 'exam',
    nameKey: 'instructorPortal.commTplExamReminder',
    titleKey: 'instructorPortal.commTplExamReminderTitle',
    bodyKey: 'instructorPortal.commTplExamReminderBody',
  },
  {
    id: 'builtin:lecture_postponement',
    category: 'live_lecture',
    nameKey: 'instructorPortal.commTplLecturePostponement',
    titleKey: 'instructorPortal.commTplLecturePostponementTitle',
    bodyKey: 'instructorPortal.commTplLecturePostponementBody',
  },
  {
    id: 'builtin:grade_publication',
    category: 'general',
    nameKey: 'instructorPortal.commTplGradePublication',
    titleKey: 'instructorPortal.commTplGradePublicationTitle',
    bodyKey: 'instructorPortal.commTplGradePublicationBody',
  },
  {
    id: 'builtin:results_announcement',
    category: 'general',
    nameKey: 'instructorPortal.commTplResultsAnnouncement',
    titleKey: 'instructorPortal.commTplResultsAnnouncementTitle',
    bodyKey: 'instructorPortal.commTplResultsAnnouncementBody',
  },
]

/** Replace {{placeholders}} in template text. */
export function applyTemplatePlaceholders(text, vars = {}) {
  return String(text ?? '').replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = vars[key]
    return v != null && String(v).trim() !== '' ? String(v) : `{{${key}}}`
  })
}

export function resolveBuiltinTemplate(template, t, vars) {
  return {
    category: template.category,
    title: applyTemplatePlaceholders(t(template.titleKey), vars),
    body: applyTemplatePlaceholders(t(template.bodyKey), vars),
  }
}

export function resolveCustomTemplate(row, vars) {
  return {
    category: row.category || 'general',
    title: applyTemplatePlaceholders(row.title, vars),
    body: applyTemplatePlaceholders(row.body, vars),
  }
}

export function buildTemplateVars({ courseCode, courseName, instructorName }) {
  return {
    courseCode: courseCode || '',
    courseName: courseName || '',
    instructorName: instructorName || '',
    assignmentName: '',
    dueDate: '',
    examDate: '',
    newDate: '',
    time: '',
    location: '',
  }
}
