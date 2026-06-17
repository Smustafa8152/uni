import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { formatInstructorDisplayName } from '../../utils/academicTitle'
import { createTeamsMeeting, formatMeetingDateTime } from '../../utils/microsoftGraph'
import { ArrowLeft, Edit, Library, Video, ExternalLink, RefreshCw } from 'lucide-react'

function getFirstOccurrenceDate(startDate, dayOfWeek) {
  const start = new Date(startDate)
  const days = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }
  const targetDay = days[String(dayOfWeek || '').toLowerCase()] ?? 0
  const currentDay = start.getDay()
  const daysToAdd = (targetDay - currentDay + 7) % 7
  const firstDate = new Date(start)
  firstDate.setDate(start.getDate() + daysToAdd)
  return firstDate
}

export default function ViewClass() {
  const { id } = useParams()
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const navigate = useNavigate()
  const [classData, setClassData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [regeneratingScheduleId, setRegeneratingScheduleId] = useState(null)
  const [scheduleMessage, setScheduleMessage] = useState('')

  useEffect(() => {
    fetchClass()
  }, [id])

  const fetchClass = async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('*, subjects(id, name_en, name_ar, code), semesters(id, name_en, name_ar, code, start_date, end_date), instructors(id, name_en, name_ar, email, academic_title), class_schedules(id, day_of_week, start_time, end_time, location, teams_meeting_url, teams_meeting_id, teams_event_id), colleges(id, name_en, name_ar, code)')
        .eq('id', id)
        .single()

      if (error) throw error
      setClassData(data)
    } catch (err) {
      console.error('Error fetching class:', err)
      setError(err.message || 'Failed to load class')
    } finally {
      setLoading(false)
    }
  }

  const regenerateTeamsLink = async (schedule) => {
    if (!schedule?.id) return

    const semester = classData?.semesters
    if (!semester?.start_date || !semester?.end_date) {
      setError(t('classes.regenerateTeamsNoSemesterDates'))
      return
    }

    if (!window.confirm(t('classes.regenerateTeamsConfirm'))) return

    setRegeneratingScheduleId(schedule.id)
    setScheduleMessage('')
    setError('')

    try {
      const instructorEmail = classData?.instructors?.email || null
      const subjectCode = classData?.subjects?.code || ''
      const subjectName = getLocalizedName(classData?.subjects, isRTL) || 'Class'
      const section = classData?.section || ''
      const dayLabel = String(schedule.day_of_week || '').charAt(0).toUpperCase() +
        String(schedule.day_of_week || '').slice(1)

      const firstDate = getFirstOccurrenceDate(semester.start_date, schedule.day_of_week)
      const [startHour, startMinute] = String(schedule.start_time || '09:00').split(':')
      const [endHour, endMinute] = String(schedule.end_time || '10:00').split(':')
      firstDate.setHours(parseInt(startHour, 10), parseInt(startMinute, 10), 0, 0)

      const endDate = new Date(firstDate)
      endDate.setHours(parseInt(endHour, 10), parseInt(endMinute, 10), 0, 0)

      const { startDateTime, endDateTime } = formatMeetingDateTime(
        firstDate,
        Math.max(30, Math.round((endDate - firstDate) / (1000 * 60))),
      )

      const meetingTitle = `${subjectCode} - ${subjectName} - Section ${section} (${dayLabel})`
      const meetingDescription = `Recurring class meeting for ${subjectCode} - ${subjectName}, Section ${section}. Schedule: ${schedule.day_of_week} ${schedule.start_time}-${schedule.end_time}`

      const teamsMeeting = await createTeamsMeeting({
        organizerEmail: instructorEmail,
        subject: meetingTitle,
        description: meetingDescription,
        startDateTime,
        endDateTime,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        attendees: [],
      })

      if (!teamsMeeting?.joinUrl) {
        throw new Error(t('classes.regenerateTeamsNoUrl'))
      }

      const { error: updateError } = await supabase
        .from('class_schedules')
        .update({
          teams_meeting_url: teamsMeeting.joinUrl,
          teams_meeting_id: teamsMeeting.meetingId,
          teams_event_id: teamsMeeting.eventId,
        })
        .eq('id', schedule.id)

      if (updateError) throw updateError

      setClassData((prev) => ({
        ...prev,
        class_schedules: (prev.class_schedules || []).map((s) =>
          s.id === schedule.id
            ? {
                ...s,
                teams_meeting_url: teamsMeeting.joinUrl,
                teams_meeting_id: teamsMeeting.meetingId,
                teams_event_id: teamsMeeting.eventId,
              }
            : s,
        ),
      }))
      setScheduleMessage(t('classes.regenerateTeamsSuccess'))
    } catch (err) {
      console.error('Error regenerating Teams link:', err)
      setError(err.message || t('classes.regenerateTeamsFailed'))
    } finally {
      setRegeneratingScheduleId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error && !classData) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <button
          onClick={() => navigate(`/academic/classes/${id}/edit`)}
          className="flex items-center space-x-2 bg-primary-gradient text-white px-4 py-2 rounded-lg hover:shadow-lg transition-all"
        >
          <Edit className="w-4 h-4" />
          <span>Edit</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="flex items-center space-x-4 mb-6">
          <div className="w-16 h-16 bg-primary-gradient rounded-lg flex items-center justify-center">
            <Library className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{classData?.code}</h1>
            <p className="text-gray-600">{getLocalizedName(classData?.subjects, isRTL)}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Subject</h3>
              <p className="text-gray-900">{classData?.subjects?.code} - {getLocalizedName(classData?.subjects, isRTL)}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Semester</h3>
              <p className="text-gray-900">{getLocalizedName(classData?.semesters, isRTL) || 'N/A'}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Section</h3>
              <p className="text-gray-900">{classData?.section || 'N/A'}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Instructor</h3>
              <p className="text-gray-900">{formatInstructorDisplayName(classData?.instructors, isRTL) || 'Not assigned'}</p>
              {classData?.instructors?.email && (
                <p className="text-sm text-gray-600">{classData.instructors.email}</p>
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Capacity</h3>
              <p className="text-gray-900">{classData?.enrolled || 0}/{classData?.capacity || 0}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Class Type</h3>
              <p className="text-gray-900 capitalize">{classData?.type?.replace('_', ' ') || 'On Campus'}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Room</h3>
              <p className="text-gray-900">{classData?.room || 'N/A'}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Building</h3>
              <p className="text-gray-900">{classData?.building || 'N/A'}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">College</h3>
              <p className="text-gray-900">
                {getLocalizedName(classData?.colleges, isRTL) || (classData?.is_university_wide ? 'University-wide' : 'N/A')}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-500 mb-2">Status</h3>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                classData?.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
              }`}>
                {classData?.status || 'active'}
              </span>
            </div>
          </div>

          {classData?.class_schedules && classData.class_schedules.length > 0 && (
            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('classes.classSchedule')}</h3>
              {scheduleMessage && (
                <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                  {scheduleMessage}
                </div>
              )}
              <div className="space-y-3">
                {classData.class_schedules.map((schedule) => (
                  <div key={schedule.id ?? `${schedule.day_of_week}-${schedule.start_time}`} className="p-4 bg-gray-50 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-3">
                      <div>
                        <span className="text-sm font-medium text-gray-500">{t('classes.day')}:</span>
                        <p className="text-gray-900 capitalize">{schedule.day_of_week || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-500">{t('classes.startTime')}:</span>
                        <p className="text-gray-900">{schedule.start_time || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-500">{t('classes.endTime')}:</span>
                        <p className="text-gray-900">{schedule.end_time || 'N/A'}</p>
                      </div>
                      <div>
                        <span className="text-sm font-medium text-gray-500">{t('classes.location')}:</span>
                        <p className="text-gray-900">{schedule.location || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap items-center gap-3">
                      {schedule.teams_meeting_url ? (
                        <a
                          href={schedule.teams_meeting_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm"
                        >
                          <Video className="w-4 h-4" />
                          <span>{t('classes.joinTeamsMeeting')}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-sm text-gray-500">{t('classes.noTeamsLink')}</span>
                      )}
                      <button
                        type="button"
                        onClick={() => regenerateTeamsLink(schedule)}
                        disabled={regeneratingScheduleId === schedule.id}
                        className="inline-flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-white transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RefreshCw className={`w-4 h-4 ${regeneratingScheduleId === schedule.id ? 'animate-spin' : ''}`} />
                        <span>
                          {regeneratingScheduleId === schedule.id
                            ? t('classes.regeneratingTeamsLink')
                            : t('classes.regenerateTeamsLink')}
                        </span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {classData?.notes && (
            <div className="border-t pt-6">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Notes</h3>
              <p className="text-gray-900 whitespace-pre-wrap">{classData.notes}</p>
            </div>
          )}

          {classData?.is_university_wide && (
            <div className="border-t pt-6">
              <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                University-wide (available to all colleges)
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

