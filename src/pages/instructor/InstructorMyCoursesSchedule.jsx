import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { TIMETABLE_DAY_KEYS, buildInstructorWeekMatrix, buildLegendItems } from '../../utils/instructorTimetable'

function EmptyCell() {
  return (
    <td>
      <div className="sched-cell empty" />
    </td>
  )
}

function CourseCellStack({ entries, typeLabel, joinLabel, noLinkLabel }) {
  return (
    <td>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {entries.map((e, i) => (
          <div key={`${e.classId}-${i}`} className={`sched-cell ${e.gradClass}`}>
            <div className="sched-code">{e.code}</div>
            {e.title ? <div className="sched-name">{e.title}</div> : null}
            {e.loc ? <div className="sched-loc">{e.loc}</div> : null}
            {e.joinUrl ? (
              <a
                href={e.joinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="sched-teams-link"
                onClick={(ev) => ev.stopPropagation()}
              >
                {joinLabel}
              </a>
            ) : e.classType === 'online' || e.classType === 'hybrid' ? (
              <span className="sched-teams-missing">{noLinkLabel}</span>
            ) : null}
            <span className={`sched-type ${e.typeClass || 'onsite'}`}>{typeLabel(e.classType)}</span>
          </div>
        ))}
      </div>
    </td>
  )
}

function classTypeToCss(classType) {
  if (classType === 'online') return 'online'
  if (classType === 'hybrid') return 'blended'
  return 'onsite'
}

/** Weekly timetable: real `schedules` rows from class_schedules, or empty state. */
export default function InstructorMyCoursesSchedule({
  semesterLabel,
  schedules = [],
  summaryTeachingHours,
  summaryOfficeHours = 0,
  summaryAssessWeek = 0,
  summaryStudents = 0,
  summaryRooms = 0,
}) {
  const { t } = useTranslation()

  const typeLabel = (classType) => {
    if (classType === 'online') return t('instructorPortal.courseTypeOnline')
    if (classType === 'hybrid') return t('instructorPortal.courseTypeBlended')
    return t('instructorPortal.courseTypeInPerson')
  }

  const { slots, cellMap } = useMemo(() => buildInstructorWeekMatrix(schedules), [schedules])
  const legendItems = useMemo(() => buildLegendItems(schedules), [schedules])

  const teachingDisplay =
    summaryTeachingHours != null && summaryTeachingHours !== ''
      ? Number(summaryTeachingHours).toFixed(1).replace(/\.0$/, '')
      : '0'

  const hasData = schedules.length > 0 && slots.length > 0

  return (
    <div className="card">
      <div className="card-hd-sched">
        <div>
          <div className="card-title">📅 {t('instructorPortal.weeklyScheduleTitle')}</div>
          <div className="card-sub" style={{ marginTop: 3 }}>
            {t('instructorPortal.weeklyScheduleSubtitle', { semester: semesterLabel || '—' })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="fc" style={{ width: 'auto', fontSize: 13 }} aria-label={t('instructorPortal.scheduleWeekSelect')} defaultValue="">
            <option value="">{t('instructorPortal.scheduleWeekSelect')}</option>
          </select>
          <Link to="/instructor/dashboard" className="btn btn-gh btn-sm">
            {t('instructorPortal.scheduleViewFull')}
          </Link>
          <button type="button" className="btn btn-p btn-sm">
            {t('instructorPortal.scheduleExport')}
          </button>
        </div>
      </div>

      <div className="sched-summary">
        <div className="sched-sum-item">
          <div className="sched-sum-icon">🎓</div>
          <div>
            <div className="sched-sum-val">{teachingDisplay}</div>
            <div className="sched-sum-lbl">{t('instructorPortal.schedSumTeaching')}</div>
          </div>
        </div>
        <div className="sched-sum-item">
          <div className="sched-sum-icon">🏢</div>
          <div>
            <div className="sched-sum-val">
              {summaryOfficeHours != null && summaryOfficeHours !== '' ? summaryOfficeHours : '—'}
            </div>
            <div className="sched-sum-lbl">{t('instructorPortal.schedSumOffice')}</div>
          </div>
        </div>
        <div className="sched-sum-item">
          <div className="sched-sum-icon">📝</div>
          <div>
            <div className="sched-sum-val">{summaryAssessWeek}</div>
            <div className="sched-sum-lbl">{t('instructorPortal.schedSumAssessWeek')}</div>
          </div>
        </div>
        <div className="sched-sum-item">
          <div className="sched-sum-icon">👥</div>
          <div>
            <div className="sched-sum-val">{summaryStudents}</div>
            <div className="sched-sum-lbl">{t('instructorPortal.schedSumStudents')}</div>
          </div>
        </div>
        <div className="sched-sum-item">
          <div className="sched-sum-icon">📍</div>
          <div>
            <div className="sched-sum-val">{summaryRooms}</div>
            <div className="sched-sum-lbl">{t('instructorPortal.schedSumRooms')}</div>
          </div>
        </div>
      </div>

      <div className="sched-wrap">
        <table className="sched-table" role="grid" aria-label={t('instructorPortal.weeklyScheduleTitle')}>
          <thead>
            <tr>
              <th scope="col">{t('instructorPortal.schedTableCorner')}</th>
              <th scope="col">{t('instructorPortal.schedDaySun')}</th>
              <th scope="col">{t('instructorPortal.schedDayMon')}</th>
              <th scope="col">{t('instructorPortal.schedDayTue')}</th>
              <th scope="col">{t('instructorPortal.schedDayWed')}</th>
              <th scope="col">{t('instructorPortal.schedDayThu')}</th>
              <th scope="col">{t('instructorPortal.schedDayFri')}</th>
              <th scope="col">{t('instructorPortal.schedDaySat')}</th>
            </tr>
          </thead>
          <tbody>
            {hasData ? (
              slots.map((slot) => (
                <tr key={slot.key}>
                  <td data-field="time_slot">{slot.label}</td>
                  {TIMETABLE_DAY_KEYS.map((_, dayIdx) => {
                    const cellKey = `${slot.key}::${dayIdx}`
                    const entries = (cellMap[cellKey] || []).map((e) => ({
                      ...e,
                      typeClass: classTypeToCss(e.classType),
                    }))
                    if (!entries.length) return <EmptyCell key={dayIdx} />
                    return (
                      <CourseCellStack
                        key={dayIdx}
                        entries={entries}
                        typeLabel={typeLabel}
                        joinLabel={t('instructorPortal.teamsJoinMeeting')}
                        noLinkLabel={t('instructorPortal.teamsLinkMissing', 'No Teams link yet')}
                      />
                    )
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
                  {t('instructorPortal.scheduleEmptyHint')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {legendItems.length > 0 ? (
        <div className="sched-legend">
          {legendItems.map((item) => (
            <div key={item.code} className="sched-legend-item">
              <div
                className={`sched-legend-dot sched-legend-${item.gradClass.replace('course-', '')}`}
                style={{
                  background:
                    item.gradClass === 'course-eng'
                      ? 'linear-gradient(135deg, #c7d9fc, #e8f0fe)'
                      : item.gradClass === 'course-cs'
                        ? 'linear-gradient(135deg, #c6eed9, #e8f7f0)'
                        : item.gradClass === 'course-math'
                          ? 'linear-gradient(135deg, #fde68a, #fef9e7)'
                          : 'linear-gradient(135deg, #e0c4fc, #f5e8ff)',
                  borderRight: '3px solid #1d4ed8',
                }}
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
