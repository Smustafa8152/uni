import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Plus, ExternalLink } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import { formatTimeRange12h, normalizeTime } from '../../utils/timeFormat'
import TeamsMeetingManager from '../../components/teams/TeamsMeetingManager'

const DAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function dayKeyFromDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return DAY_KEYS[d.getDay()] || ''
}

function resolveSessionJoinUrl(session, schedules, teamsByClass) {
  const day = dayKeyFromDate(session.session_date)
  const start = normalizeTime(session.start_time)
  const end = normalizeTime(session.end_time)
  const classSchedules = (schedules || []).filter((s) => s.class_id === session.class_id)

  const matched = classSchedules.find(
    (s) =>
      String(s.day_of_week || '').toLowerCase() === day &&
      normalizeTime(s.start_time) === start &&
      normalizeTime(s.end_time) === end,
  )
  if (matched?.teams_meeting_url) return matched.teams_meeting_url

  const scheduleUrl = classSchedules.find((s) => s.teams_meeting_url)?.teams_meeting_url
  if (scheduleUrl) return scheduleUrl

  return teamsByClass[session.class_id] || null
}

/**
 * Merged "Sessions" area: class sections, scheduled class_sessions, Teams meetings.
 */
export default function InstructorSubjectSessionsPanel({
  subjectId,
  classes,
  instructor,
  onTakeAttendance,
}) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const navigate = useNavigate()
  const [sessionsByClass, setSessionsByClass] = useState({})
  const [schedules, setSchedules] = useState([])
  const [teamsByClass, setTeamsByClass] = useState({})
  const [loadingSessions, setLoadingSessions] = useState(true)
  const isArabic = language === 'ar'

  useEffect(() => {
    const ids = (classes || []).map((c) => c.id)
    if (!ids.length) {
      setSessionsByClass({})
      setLoadingSessions(false)
      return
    }
    let cancelled = false
    ;(async () => {
      setLoadingSessions(true)
      try {
        const [{ data, error }, { data: schedData }, { data: teamsData }] = await Promise.all([
          supabase
            .from('class_sessions')
            .select('id, class_id, session_date, start_time, end_time, location, room, status')
            .in('class_id', ids)
            .order('session_date', { ascending: true })
            .limit(500),
          supabase
            .from('class_schedules')
            .select('id, class_id, day_of_week, start_time, end_time, teams_meeting_url')
            .in('class_id', ids),
          supabase
            .from('class_teams_meetings')
            .select('class_id, teams_join_url')
            .in('class_id', ids)
            .eq('is_active', true),
        ])
        if (error) throw error
        if (cancelled) return
        const map = {}
        for (const id of ids) map[id] = []
        for (const row of data || []) {
          if (!map[row.class_id]) map[row.class_id] = []
          map[row.class_id].push(row)
        }
        const teamsMap = {}
        for (const meeting of teamsData || []) {
          if (meeting.class_id && meeting.teams_join_url && !teamsMap[meeting.class_id]) {
            teamsMap[meeting.class_id] = meeting.teams_join_url
          }
        }
        setSessionsByClass(map)
        setSchedules(schedData || [])
        setTeamsByClass(teamsMap)
      } catch (e) {
        console.error(e)
        setSessionsByClass({})
        setSchedules([])
        setTeamsByClass({})
      } finally {
        if (!cancelled) setLoadingSessions(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [classes])

  const formatSessionTime = (start, end) => formatTimeRange12h(start, end, isArabic)

  if (!classes?.length) {
    return (
      <div className="card">
        <p className="ts" style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>
          {t('instructorPortal.sessionsPanelNoClasses')}
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {classes.map((cls) => (
        <div key={cls.id} className="card" style={{ marginBottom: 0 }}>
          <div className="card-hd">
            <div>
              <div className="card-title">
                {cls.code} — {t('instructorPortal.section')} {cls.section}
              </div>
              <div className="card-sub">
                {cls.enrollmentCount ?? 0} {t('instructorPortal.studentsLabel')}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-gh btn-sm"
                onClick={() => navigate(`/academic/classes/${cls.id}`)}
              >
                {t('common.view')}
              </button>
              <button
                type="button"
                className="btn btn-p btn-sm"
                onClick={() => onTakeAttendance?.(cls.id)}
              >
                {t('instructorPortal.sessionsTakeAttendance')}
              </button>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            <div className="card-title" style={{ fontSize: 14, marginBottom: 10 }}>
              📅 {t('instructorPortal.sessionsScheduledTitle')}
            </div>
            {loadingSessions ? (
              <p className="ts" style={{ color: 'var(--muted)' }}>
                {t('common.loading')}
              </p>
            ) : (sessionsByClass[cls.id] || []).length === 0 ? (
              <p className="ts" style={{ color: 'var(--muted)' }}>
                {t('instructorPortal.sessionsNoneScheduled')}
              </p>
            ) : (
              <div className="tw">
                <table>
                  <thead>
                    <tr>
                      <th>{t('instructorPortal.sessionsColDate')}</th>
                      <th>{t('instructorPortal.sessionsColTime')}</th>
                      <th>{t('instructorPortal.sessionsColLocation')}</th>
                      <th>{t('instructorPortal.sessionsColTeams', 'Teams')}</th>
                      <th>{t('common.status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(sessionsByClass[cls.id] || []).map((s) => {
                      const joinUrl = resolveSessionJoinUrl(s, schedules, teamsByClass)
                      return (
                      <tr key={s.id}>
                        <td>{s.session_date}</td>
                        <td>{formatSessionTime(s.start_time, s.end_time)}</td>
                        <td>{[s.room, s.location].filter(Boolean).join(' · ') || '—'}</td>
                        <td>
                          {joinUrl ? (
                            <a
                              href={joinUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="btn btn-gh btn-sm"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                            >
                              <ExternalLink style={{ width: 14, height: 14 }} />
                              {t('instructorPortal.teamsJoinMeeting')}
                            </a>
                          ) : (
                            <span className="ts" style={{ color: 'var(--muted)' }}>
                              {t('instructorPortal.teamsLinkMissing', 'No Teams link yet')}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="badge" data-status="scheduled">
                            {s.status || 'scheduled'}
                          </span>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div
            style={{
              borderTop: '1px solid var(--bdr)',
              paddingTop: 18,
              marginTop: 4,
            }}
          >
            <TeamsMeetingManager
              classId={cls.id}
              subjectId={subjectId}
              instructorId={instructor?.id}
              instructorEmail={instructor?.email}
            />
          </div>
        </div>
      ))}

      <div className="card">
        <div className="card-hd">
          <div className="card-title">{t('instructorPortal.sessionsAddClassTitle')}</div>
          <button
            type="button"
            className="btn btn-p btn-sm"
            onClick={() => navigate(`/academic/classes/create?subjectId=${subjectId}`)}
          >
            <Plus style={{ width: 16, height: 16 }} />
            {t('instructorPortal.sessionsCreateClass')}
          </button>
        </div>
        <p className="ts" style={{ color: 'var(--muted)', margin: 0 }}>
          {t('instructorPortal.sessionsAddClassHint')}
        </p>
      </div>
    </div>
  )
}
