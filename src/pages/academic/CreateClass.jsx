import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { getLocalizedName } from '../../utils/localizedName'
import { formatInstructorDisplayName } from '../../utils/academicTitle'
import { createTeamsMeeting, formatMeetingDateTime } from '../../utils/microsoftGraph'
import { ArrowLeft, Save, Check, Plus, X } from 'lucide-react'

export default function CreateClass() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { userRole, collegeId: authCollegeId } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [collegeId, setCollegeId] = useState(authCollegeId)
  const [selectedCollegeId, setSelectedCollegeId] = useState(authCollegeId)
  const [colleges, setColleges] = useState([])
  const [subjects, setSubjects] = useState([])
  const [semesters, setSemesters] = useState([])
  const [instructors, setInstructors] = useState([])

  const [formData, setFormData] = useState({
    subject_id: '',
    semester_id: '',
    section: '',
    instructor_id: '',
    capacity: 30,
    room: '',
    building: '',
    type: 'on_campus',
    notes: '',
    status: 'active',
    college_id: null,
    is_university_wide: false,
    schedules: [{ day: '', start_time: '', end_time: '', location: '' }],
  })

  useEffect(() => {
    // Check if college ID is passed via URL parameter
    const urlCollegeId = searchParams.get('collegeId')
    if (urlCollegeId && userRole === 'admin') {
      const collegeIdInt = parseInt(urlCollegeId)
      setCollegeId(collegeIdInt)
      setSelectedCollegeId(collegeIdInt)
      setFormData(prev => ({ ...prev, college_id: collegeIdInt, is_university_wide: false }))
    } else if (authCollegeId) {
      setCollegeId(authCollegeId)
      setSelectedCollegeId(authCollegeId)
      setFormData(prev => ({ ...prev, college_id: authCollegeId }))
    } else if (userRole === 'user') {
      fetchUserCollege()
    }
    
    if (userRole === 'admin') {
      fetchColleges()
    }
    fetchSubjects()
    // Only fetch semesters if we have required data
    if (userRole === 'admin' || (userRole === 'user' && (collegeId || authCollegeId)) || (userRole === 'instructor' && (collegeId || authCollegeId))) {
      fetchSemesters()
    }
    fetchInstructors()
  }, [userRole, searchParams, authCollegeId, collegeId])

  useEffect(() => {
    // Refetch semesters and subjects when collegeId changes (only if we have required data)
    if (userRole === 'admin' || (userRole === 'user' && collegeId) || (userRole === 'instructor' && collegeId)) {
      fetchSemesters()
    }
    // Refetch subjects when college changes
    fetchSubjects()
  }, [collegeId])

  const fetchUserCollege = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) return

      const { data: userData } = await supabase
        .from('users')
        .select('college_id')
        .eq('email', user.email)
        .single()

      if (userData?.college_id) {
        setCollegeId(userData.college_id)
        setSelectedCollegeId(userData.college_id)
        setFormData(prev => ({ ...prev, college_id: userData.college_id }))
      }
    } catch (err) {
      console.error('Error fetching college ID:', err)
    }
  }

  const fetchColleges = async () => {
    try {
      const { data, error } = await supabase
        .from('colleges')
        .select('id, name_en, name_ar, code')
        .eq('status', 'active')
        .order('name_en')

      if (error) throw error
      setColleges(data || [])
    } catch (err) {
      console.error('Error fetching colleges:', err)
    }
  }

  const fetchSubjects = async () => {
    try {
      let query = supabase
        .from('subjects')
        .select('id, name_en, name_ar, code')
        .eq('status', 'active')
        .order('name_en')

      if (collegeId) {
        // Show college's subjects OR university-wide subjects
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      } else if (userRole === 'user' && authCollegeId) {
        // For college admins, show their college's subjects OR university-wide
        query = query.or(`college_id.eq.${authCollegeId},is_university_wide.eq.true`)
      }

      const { data, error } = await query
      if (error) throw error
      setSubjects(data || [])
    } catch (err) {
      console.error('Error fetching subjects:', err)
    }
  }

  const fetchSemesters = async () => {
    // Don't fetch if we don't have required data
    if (userRole === 'user' && !collegeId && !authCollegeId) return
    if (userRole === 'instructor' && !collegeId && !authCollegeId) return

    try {
      let query = supabase
        .from('semesters')
        .select('id, name_en, name_ar, code')
        .order('start_date', { ascending: false })

      // Use collegeId or authCollegeId
      const effectiveCollegeId = collegeId || authCollegeId

      if (effectiveCollegeId) {
        // Show college's semesters OR university-wide semesters
        query = query.or(`college_id.eq.${effectiveCollegeId},is_university_wide.eq.true`)
      }

      const { data, error } = await query
      if (error) throw error
      setSemesters(data || [])
    } catch (err) {
      console.error('Error fetching semesters:', err)
    }
  }

  const fetchInstructors = async () => {
    try {
      let query = supabase
        .from('instructors')
        .select('id, name_en, name_ar, email, academic_title')
        .eq('status', 'active')
        .order('name_en')

      if (collegeId) {
        query = query.eq('college_id', collegeId)
      }

      const { data, error } = await query
      if (error) throw error
      setInstructors(data || [])
    } catch (err) {
      console.error('Error fetching instructors:', err)
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleScheduleChange = (index, field, value) => {
    const newSchedules = [...formData.schedules]
    newSchedules[index] = { ...newSchedules[index], [field]: value }
    setFormData(prev => ({ ...prev, schedules: newSchedules }))
  }

  const addSchedule = () => {
    setFormData(prev => ({
      ...prev,
      schedules: [...prev.schedules, { day: '', start_time: '', end_time: '', location: '' }]
    }))
  }

  const removeSchedule = (index) => {
    setFormData(prev => ({
      ...prev,
      schedules: prev.schedules.filter((_, i) => i !== index)
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      // Generate class code from subject code and section
      const subject = subjects.find(s => s.id === parseInt(formData.subject_id))
      const classCode = subject ? `${subject.code}-${formData.section}` : formData.section

      const submitData = {
        subject_id: parseInt(formData.subject_id),
        semester_id: parseInt(formData.semester_id),
        code: classCode,
        section: formData.section,
        instructor_id: formData.instructor_id ? parseInt(formData.instructor_id) : null,
        capacity: parseInt(formData.capacity),
        enrolled: 0,
        room: formData.room || null,
        building: formData.building || null,
        location: formData.room && formData.building ? `${formData.building} ${formData.room}` : (formData.room || formData.building || null),
        type: formData.type,
        notes: formData.notes || null,
        status: formData.status,
        is_university_wide: false,
        college_id: formData.college_id || collegeId,
      }

      const { data: classData, error: insertError } = await supabase
        .from('classes')
        .insert(submitData)
        .select()
        .single()

      if (insertError) throw insertError

      // Get semester dates for generating class sessions
      const { data: semesterData, error: semesterError } = await supabase
        .from('semesters')
        .select('start_date, end_date')
        .eq('id', parseInt(formData.semester_id))
        .single()

      if (semesterError) throw semesterError

      // Get college_id for class_sessions
      const finalCollegeId = formData.college_id || collegeId
      if (!finalCollegeId) {
        throw new Error('College ID is required for class sessions')
      }

      // Helper function to get day of week number (0 = Sunday, 1 = Monday, etc.)
      const getDayOfWeekNumber = (dayName) => {
        const days = { 'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6 }
        return days[dayName.toLowerCase()] ?? 0
      }

      // Helper function to generate all dates for a specific day of week within a date range
      const generateDatesForDay = (startDate, endDate, dayOfWeek) => {
        const dates = []
        const start = new Date(startDate)
        const end = new Date(endDate)
        const targetDay = getDayOfWeekNumber(dayOfWeek)

        // Find the first occurrence of the target day
        let currentDate = new Date(start)
        const currentDay = currentDate.getDay()
        const daysToAdd = (targetDay - currentDay + 7) % 7
        currentDate.setDate(currentDate.getDate() + daysToAdd)

        // Generate all dates for this day of week
        while (currentDate <= end) {
          dates.push(new Date(currentDate))
          currentDate.setDate(currentDate.getDate() + 7) // Move to next week
        }

        return dates
      }

      // Insert class schedules and create Teams meetings
      if (formData.schedules.length > 0 && formData.schedules[0].day) {
        const validSchedules = formData.schedules.filter(s => s.day && s.start_time && s.end_time)
        
        if (validSchedules.length > 0) {
          // Get instructor email for Teams meetings (use default organizer if no instructor)
          let instructorEmail = null
          if (formData.instructor_id) {
            const { data: instructorData } = await supabase
              .from('instructors')
              .select('email')
              .eq('id', parseInt(formData.instructor_id))
              .single()
            instructorEmail = instructorData?.email || null
          }

          // Get subject details for meeting title
          const { data: subjectData } = await supabase
            .from('subjects')
            .select('name_en, name_ar, code')
            .eq('id', parseInt(formData.subject_id))
            .single()

          const subjectName = getLocalizedName(subjectData, isRTL) || 'Class'
          const subjectCode = subjectData?.code || ''

          // Helper function to get first occurrence date for a day of week
          const getFirstOccurrenceDate = (startDate, dayOfWeek) => {
            const start = new Date(startDate)
            const days = { 'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6 }
            const targetDay = days[dayOfWeek.toLowerCase()] ?? 0
            const currentDay = start.getDay()
            const daysToAdd = (targetDay - currentDay + 7) % 7
            const firstDate = new Date(start)
            firstDate.setDate(start.getDate() + daysToAdd)
            return firstDate
          }

          // Create Teams meetings and insert schedules
          const scheduleData = []
          for (const schedule of validSchedules) {
            let teamsMeetingUrl = null
            let teamsMeetingId = null
            let teamsEventId = null

            // Create Teams meeting for this schedule (only if semester dates are available)
            if (semesterData?.start_date && semesterData?.end_date) {
              try {
                // Get first occurrence of this schedule day
                const firstDate = getFirstOccurrenceDate(semesterData.start_date, schedule.day)
                
                // Calculate meeting datetime
                const [startHour, startMinute] = schedule.start_time.split(':')
                const [endHour, endMinute] = schedule.end_time.split(':')
                firstDate.setHours(parseInt(startHour), parseInt(startMinute), 0, 0)
                
                const endDate = new Date(firstDate)
                endDate.setHours(parseInt(endHour), parseInt(endMinute), 0, 0)
                
                const { startDateTime, endDateTime } = formatMeetingDateTime(
                  firstDate,
                  Math.round((endDate - firstDate) / (1000 * 60)) // Duration in minutes
                )

                // Create Teams meeting
                const meetingTitle = `${subjectCode} - ${subjectName} - Section ${formData.section} (${schedule.day.charAt(0).toUpperCase() + schedule.day.slice(1)})`
                const meetingDescription = `Recurring class meeting for ${subjectCode} - ${subjectName}, Section ${formData.section}. Schedule: ${schedule.day} ${schedule.start_time}-${schedule.end_time}`

                const teamsMeeting = await createTeamsMeeting({
                  organizerEmail: instructorEmail, // Will use default if null
                  subject: meetingTitle,
                  description: meetingDescription,
                  startDateTime,
                  endDateTime,
                  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                  attendees: [] // No attendees initially, students will join via link
                })

                if (teamsMeeting?.joinUrl) {
                  teamsMeetingUrl = teamsMeeting.joinUrl
                  teamsMeetingId = teamsMeeting.meetingId
                  teamsEventId = teamsMeeting.eventId
                }
              } catch (meetingError) {
                console.error('Error creating Teams meeting for schedule:', meetingError)
                // Continue without meeting URL if creation fails
              }
            }

            scheduleData.push({
              class_id: classData.id,
              day_of_week: schedule.day,
              start_time: schedule.start_time,
              end_time: schedule.end_time,
              location: schedule.location || formData.room || null,
              teams_meeting_url: teamsMeetingUrl,
              teams_meeting_id: teamsMeetingId,
              teams_event_id: teamsEventId,
            })
          }

          const { error: scheduleError } = await supabase
            .from('class_schedules')
            .insert(scheduleData)

          if (scheduleError) throw scheduleError

          // Generate and insert class_sessions for each schedule
          if (semesterData && semesterData.start_date && semesterData.end_date && finalCollegeId) {
            const sessionData = []
            
            for (const schedule of validSchedules) {
              const dates = generateDatesForDay(
                semesterData.start_date,
                semesterData.end_date,
                schedule.day
              )

              for (const date of dates) {
                sessionData.push({
                  class_id: classData.id,
                  college_id: finalCollegeId,
                  semester_id: parseInt(formData.semester_id),
                  session_date: date.toISOString().split('T')[0], // Format as YYYY-MM-DD
                  start_time: schedule.start_time,
                  end_time: schedule.end_time,
                  location: schedule.location || formData.room || null,
                  room: formData.room || null,
                  building: formData.building || null,
                  instructor_id: formData.instructor_id ? parseInt(formData.instructor_id) : null,
                  status: 'scheduled',
                  notes: formData.notes || null,
                })
              }
            }

            if (sessionData.length > 0) {
              const { error: sessionError } = await supabase
                .from('class_sessions')
                .insert(sessionData)

              if (sessionError) throw sessionError
            }
          }
        }
      }

      setSuccess(true)
      setTimeout(() => {
        navigate('/academic/classes')
      }, 2000)
    } catch (err) {
      setError(err.message || 'Failed to create class')
      console.error('Error creating class:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-gray-600 hover:text-gray-900 mb-4`}
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{t('classes.back')}</span>
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{t('classes.createTitle')}</h1>
          <p className="text-gray-600 mt-1">{t('classes.createSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                {error}
              </div>
            )}
            {success && (
              <div className={`mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                <Check className="w-5 h-5" />
                <span>{t('classes.createdSuccess')}</span>
              </div>
            )}

            <div className="space-y-6">
              {userRole === 'admin' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('classes.college')} *</label>
                  <select
                    value={selectedCollegeId || ''}
                    onChange={(e) => {
                      const collegeIdValue = e.target.value ? parseInt(e.target.value) : null
                      setCollegeId(collegeIdValue)
                      setSelectedCollegeId(collegeIdValue)
                      setFormData(prev => ({ ...prev, college_id: collegeIdValue }))
                      // Refetch subjects and semesters when college changes
                      fetchSubjects()
                      fetchSemesters()
                    }}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">{t('classes.selectCollege')}</option>
                    {colleges.map((college) => (
                      <option key={college.id} value={college.id}>
                        {getLocalizedName(college, isRTL)} ({college.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('classes.subjectLabel')}</label>
                  <select
                    value={formData.subject_id}
                    onChange={(e) => handleChange('subject_id', e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">{t('classes.selectSubject')}</option>
                    {subjects.map(subject => (
                      <option key={subject.id} value={subject.id}>
                        {subject.code} - {getLocalizedName(subject, isRTL)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('classes.semesterLabel')}</label>
                  <select
                    value={formData.semester_id}
                    onChange={(e) => handleChange('semester_id', e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">{t('classes.selectSemester')}</option>
                    {semesters.map(semester => (
                      <option key={semester.id} value={semester.id}>
                        {getLocalizedName(semester, isRTL)} ({semester.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('classes.sectionNumber')}</label>
                  <input
                    type="text"
                    value={formData.section}
                    onChange={(e) => handleChange('section', e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder={t('classes.sectionPlaceholder')}
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('classes.sectionHint')}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('classes.capacityLabel')}</label>
                  <input
                    type="number"
                    value={formData.capacity}
                    onChange={(e) => handleChange('capacity', e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                  <p className="text-xs text-gray-500 mt-1">{t('classes.capacityHint')}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('classes.room')}</label>
                  <input
                    type="text"
                    value={formData.room}
                    onChange={(e) => handleChange('room', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder={t('classes.roomPlaceholder')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('classes.building')}</label>
                  <input
                    type="text"
                    value={formData.building}
                    onChange={(e) => handleChange('building', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder={t('classes.buildingPlaceholder')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('classes.instructor')}</label>
                  <select
                    value={formData.instructor_id}
                    onChange={(e) => handleChange('instructor_id', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">{t('classes.selectInstructor')}</option>
                    {instructors.map(instructor => (
                      <option key={instructor.id} value={instructor.id}>
                        {formatInstructorDisplayName(instructor, isRTL)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('classes.classType')}</label>
                  <select
                    value={formData.type}
                    onChange={(e) => handleChange('type', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="on_campus">{t('classes.onCampus')}</option>
                    <option value="online">{t('classes.online')}</option>
                    <option value="hybrid">{t('classes.hybrid')}</option>
                  </select>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className={`flex items-center ${isRTL ? 'flex-row-reverse' : 'justify-between'} mb-4`}>
                  <h3 className="text-lg font-semibold text-gray-900">{t('classes.classSchedule')}</h3>
                  <button
                    type="button"
                    onClick={addSchedule}
                    className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-4 py-2 bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100`}
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t('classes.addTimeSlot')}</span>
                  </button>
                </div>
                {formData.schedules.map((schedule, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t('classes.day')}</label>
                      <select
                        value={schedule.day}
                        onChange={(e) => handleScheduleChange(index, 'day', e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      >
                        <option value="">{t('classes.selectDay')}</option>
                        <option value="sunday">{t('classes.sunday')}</option>
                        <option value="monday">{t('classes.monday')}</option>
                        <option value="tuesday">{t('classes.tuesday')}</option>
                        <option value="wednesday">{t('classes.wednesday')}</option>
                        <option value="thursday">{t('classes.thursday')}</option>
                        <option value="friday">{t('classes.friday')}</option>
                        <option value="saturday">{t('classes.saturday')}</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t('classes.startTime')}</label>
                      <input
                        type="time"
                        value={schedule.start_time}
                        onChange={(e) => handleScheduleChange(index, 'start_time', e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t('classes.endTime')}</label>
                      <input
                        type="time"
                        value={schedule.end_time}
                        onChange={(e) => handleScheduleChange(index, 'end_time', e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">{t('classes.location')}</label>
                      <input
                        type="text"
                        value={schedule.location}
                        onChange={(e) => handleScheduleChange(index, 'location', e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        placeholder={t('classes.locationPlaceholder')}
                      />
                    </div>
                    <div className="flex items-end">
                      {formData.schedules.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeSchedule(index)}
                          className="w-full px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                        >
                          <X className="w-4 h-4 mx-auto" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-500 mt-2">{t('classes.scheduleHint')}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('classes.notes')}</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleChange('notes', e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder={t('classes.notesPlaceholder')}
                />
              </div>

              <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                <input
                  type="checkbox"
                  checked={formData.status === 'active'}
                  onChange={(e) => handleChange('status', e.target.checked ? 'active' : 'inactive')}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label className="text-sm font-medium text-gray-700">{t('classes.active')}</label>
              </div>
            </div>
          </div>

          <div className={`flex ${isRTL ? 'justify-start space-x-reverse' : 'justify-end space-x-4'}`}>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              {t('classes.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-6 py-2 bg-primary-gradient text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Save className="w-5 h-5" />
              <span>{loading ? t('classes.creating') : t('classes.createButton')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


