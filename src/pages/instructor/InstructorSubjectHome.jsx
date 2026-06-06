import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/** Tab ids for in-page course panels (no route navigation). */
export const COURSE_PANEL = {
  sessions: 'sessions',
  students: 'students',
  curriculum: 'curriculum',
  lessons: 'lessons',
  questionBank: 'questionBank',
  assessments: 'assessments',
  grades: 'grades',
  analytics: 'analytics',
  communication: 'communication',
  integrity: 'integrity',
  settings: 'settings',
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`tab${active ? ' active' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/**
 * IBU course shell: breadcrumb, header, tab strip (in-page), main content area.
 */
export default function InstructorSubjectHome({
  subjectId,
  subjectCode,
  subjectName,
  classId,
  section,
  semesterName,
  totalEnrolled,
  deliveryKey,
  coursePanel,
  onCoursePanelChange,
  mainContent,
  onOpenWorkspace,
  onNewLesson,
  onAnnouncement,
}) {
  const { t } = useTranslation()
  const cid = classId || 0
  const is = (id) => coursePanel === id

  return (
    <>
      <nav className="bc" aria-label={t('instructorPortal.breadcrumbMain')}>
        <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
        <span className="bc-sep">›</span>
        <Link to="/instructor/courses">{t('instructorPortal.myCourses')}</Link>
        <span className="bc-sep">›</span>
        <span>{subjectCode}</span>
      </nav>

      <div className="ph">
        <div>
          <h1>
            {subjectCode} — {subjectName}
          </h1>
          <p className="ph-sub">
            {t('instructorPortal.subjectHome.subtitleLine', {
              section: section ?? '—',
              semester: semesterName || '—',
              students: totalEnrolled,
              delivery: t(`instructorPortal.${deliveryKey}`),
            })}
          </p>
        </div>
        <div className="ph-acts">
          <button type="button" className="btn btn-gh" onClick={() => onAnnouncement?.()}>
            📢 {t('instructorPortal.subjectHome.announcement')}
          </button>
          <button type="button" className="btn btn-p" onClick={() => onNewLesson?.()}>
            ✏️ {t('instructorPortal.subjectHome.newLesson')}
          </button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        <TabButton active={is(COURSE_PANEL.curriculum)} onClick={() => onCoursePanelChange(COURSE_PANEL.curriculum)}>
          🗺️ {t('instructorPortal.subjectHome.tabCurriculum')}
        </TabButton>
        <TabButton active={is(COURSE_PANEL.sessions)} onClick={() => onCoursePanelChange(COURSE_PANEL.sessions)}>
          👥 {t('instructorPortal.subjectHome.tabSessions')}
        </TabButton>
        <TabButton active={is(COURSE_PANEL.students)} onClick={() => onCoursePanelChange(COURSE_PANEL.students)}>
          🎓 {t('instructorPortal.subjectHome.tabStudents', 'Students')}
        </TabButton>
        <TabButton active={is(COURSE_PANEL.lessons)} onClick={() => onCoursePanelChange(COURSE_PANEL.lessons)}>
          📖 {t('instructorPortal.subjectHome.tabLessons')}
        </TabButton>
        <TabButton active={is(COURSE_PANEL.questionBank)} onClick={() => onCoursePanelChange(COURSE_PANEL.questionBank)}>
          🗃️ {t('instructorPortal.subjectHome.tabQuestionBank')}
        </TabButton>
        <TabButton active={is(COURSE_PANEL.assessments)} onClick={() => onCoursePanelChange(COURSE_PANEL.assessments)}>
          📝 {t('instructorPortal.subjectHome.tabAssessments')}
        </TabButton>
        <TabButton active={is(COURSE_PANEL.grades)} onClick={() => onCoursePanelChange(COURSE_PANEL.grades)}>
          📊 {t('instructorPortal.subjectHome.tabGrades')}
        </TabButton>
        <TabButton active={is(COURSE_PANEL.analytics)} onClick={() => onCoursePanelChange(COURSE_PANEL.analytics)}>
          📈 {t('instructorPortal.subjectHome.tabAnalytics')}
        </TabButton>
        <TabButton active={is(COURSE_PANEL.communication)} onClick={() => onCoursePanelChange(COURSE_PANEL.communication)}>
          💬 {t('instructorPortal.subjectHome.tabCommunication')}
        </TabButton>
        <TabButton active={is(COURSE_PANEL.integrity)} onClick={() => onCoursePanelChange(COURSE_PANEL.integrity)}>
          ⚖️ {t('instructorPortal.subjectHome.tabIntegrity')}
        </TabButton>
        <TabButton active={is(COURSE_PANEL.settings)} onClick={() => onCoursePanelChange(COURSE_PANEL.settings)}>
          ⚙️ {t('instructorPortal.subjectHome.tabSettings')}
        </TabButton>
      </div>

      <div className="mt24" style={{ marginTop: 24 }}>
        {mainContent}
      </div>

      <div style={{ marginTop: 24 }}>
        <button type="button" className="btn btn-gh" onClick={onOpenWorkspace}>
          {t('instructorPortal.subjectHome.workspaceTools')} →
        </button>
      </div>
    </>
  )
}
