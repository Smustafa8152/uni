import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { getLocalizedName } from '../../utils/localizedName'
import { formatInstructorDisplayName } from '../../utils/academicTitle'
import { ArrowLeft, Save, Check, Plus, X } from 'lucide-react'

export default function EditClass() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const { id } = useParams()
  const navigate = useNavigate()
  const { userRole, collegeId: authCollegeId } = useAuth()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
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
    schedules: [{ day: '', start_time: '', end_time: '', location: '' }],
  })

  useEffect(() => {
    fetchClass()
    fetchSubjects()
    fetchSemesters()
    fetchInstructors()
  }, [id])

  const fetchSubjects = async () => {
    try {
      let query = supabase
        .from('subjects')
        .select('id, name_en, name_ar, code')
        .eq('status', 'active')
        .order('name_en')

      if (userRole === 'user' && authCollegeId) {
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
    // Don't fetch if we don't have required data (for instructors and college admins)
    if (userRole === 'user' && !authCollegeId) return
    if (userRole === 'instructor' && !authCollegeId) return

    try {
      let query = supabase
        .from('semesters')
        .select('id, name_en, name_ar, code')
        .order('start_date', { ascending: false })

      // Filter by college for college admins
      if (userRole === 'user' && authCollegeId) {
        query = query.or(`college_id.eq.${authCollegeId},is_university_wide.eq.true`)
      }
      // Filter by college for instructors
      else if (userRole === 'instructor' && authCollegeId) {
        query = query.or(`college_id.eq.${authCollegeId},is_university_wide.eq.true`)
      }

      const { data, error } = await query
      if (error) throw error
      setSemesters(data || [])
    } catch (err) {
      console.error('Error fetching semesters:', err)
      setSemesters([]) // Set empty array on error to prevent showing stale data
    }
  }

  const fetchInstructors = async () => {
    try {
      let query = supabase
        .from('instructors')
        .select('id, name_en, name_ar, email, academic_title')
        .eq('status', 'active')
        .order('name_en')

      if (userRole === 'user' && authCollegeId) {
        query = query.eq('college_id', authCollegeId)
      }

      const { data, error } = await query
      if (error) throw error
      setInstructors(data || [])
    } catch (err) {
      console.error('Error fetching instructors:', err)
    }
  }

  const fetchClass = async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select('*, class_schedules(day_of_week, start_time, end_time, location)')
        .eq('id', id)
        .single()

      if (error) throw error

      // Convert schedules from database format to form format
      const schedules = data.class_schedules && data.class_schedules.length > 0
        ? data.class_schedules.map(s => ({
            day: s.day_of_week || '',
            start_time: s.start_time || '',
            end_time: s.end_time || '',
            location: s.location || '',
          }))
        : [{ day: '', start_time: '', end_time: '', location: '' }]

      setFormData({
        subject_id: data.subject_id || '',
        semester_id: data.semester_id || '',
        section: data.section || '',
        instructor_id: data.instructor_id || '',
        capacity: data.capacity || 30,
        room: data.room || '',
        building: data.building || '',
        type: data.type || 'on_campus',
        notes: data.notes || '',
        status: data.status || 'active',
        schedules: schedules,
      })
    } catch (err) {
      console.error('Error fetching class:', err)
      setError(err.message || 'Failed to load class')
    } finally {
      setFetching(false)
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
      // Get class data first to fetch college_id
      const { data: classData, error: classError } = await supabase
        .from('classes')
        .select('college_id, semester_id')
        .eq('id', id)
        .single()

      if (classError) throw classError

      const submitData = {
        subject_id: parseInt(formData.subject_id),
        semester_id: parseInt(formData.semester_id),
        section: formData.section,
        instructor_id: formData.instructor_id ? parseInt(formData.instructor_id) : null,
        capacity: parseInt(formData.capacity),
        room: formData.room || null,
        building: formData.building || null,
        location: formData.room && formData.building ? `${formData.building} ${formData.room}` : (formData.room || formData.building || null),
        type: formData.type,
        notes: formData.notes || null,
        status: formData.status,
      }

      const { error: updateError } = await supabase
        .from('classes')
        .update(submitData)
        .eq('id', id)

      if (updateError) throw updateError

      // Get semester dates for generating class sessions
      const { data: semesterData, error: semesterError } = await supabase
        .from('semesters')
        .select('start_date, end_date')
        .eq('id', parseInt(formData.semester_id))
        .single()

      if (semesterError) throw semesterError

      // Delete existing schedules
      await supabase
        .from('class_schedules')
        .delete()
        .eq('class_id', id)

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

      // Insert updated schedules and regenerate class_sessions
      if (formData.schedules.length > 0 && formData.schedules[0].day) {
        const validSchedules = formData.schedules.filter(s => s.day && s.start_time && s.end_time)
        
        if (validSchedules.length > 0) {
          // Insert class_schedules (recurring schedule template)
          const scheduleData = validSchedules.map(schedule => ({
            class_id: id,
            day_of_week: schedule.day,
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            location: schedule.location || formData.room || null,
          }))

          const { error: scheduleError } = await supabase
            .from('class_schedules')
            .insert(scheduleData)

          if (scheduleError) throw scheduleError

          // Delete existing future class_sessions (keep past ones with attendance records)
          const today = new Date().toISOString().split('T')[0]
          await supabase
            .from('class_sessions')
            .delete()
            .eq('class_id', id)
            .gte('session_date', today)

          // Generate and insert new class_sessions for each schedule
          // Note: class_sessions require college_id, so skip if class is university-wide
          if (semesterData && semesterData.start_date && semesterData.end_date && classData.college_id) {
            const sessionData = []
            
            for (const schedule of validSchedules) {
              const dates = generateDatesForDay(
                semesterData.start_date,
                semesterData.end_date,
                schedule.day
              )

              // Only create sessions from today onwards (don't recreate past sessions)
              const todayDate = new Date(today)
              const futureDates = dates.filter(date => date >= todayDate)

              for (const date of futureDates) {
                sessionData.push({
                  class_id: id,
                  college_id: classData.college_id,
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
        } else {
          // If no valid schedules, delete all future class_sessions
          const today = new Date().toISOString().split('T')[0]
          await supabase
            .from('class_sessions')
            .delete()
            .eq('class_id', id)
            .gte('session_date', today)
        }
      }

      setSuccess(true)
      setTimeout(() => {
        navigate('/academic/classes')
      }, 2000)
    } catch (err) {
      setError(err.message || 'Failed to update class')
      console.error('Error updating class:', err)
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
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
          <span>{t('classes.back')}</span>
        </button>
        <h1 className="text-3xl font-bold text-gray-900">{t('classes.editTitle')}</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 flex items-center space-x-2">
              <Check className="w-5 h-5" />
              <span>{t('classes.updatedSuccess')}</span>
            </div>
          )}

          <div className="space-y-6">
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('classes.sectionNumber')}</label>
              <input
                type="text"
                value={formData.section}
                onChange={(e) => handleChange('section', e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

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

            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">{t('classes.classSchedule')}</h3>
                <button
                  type="button"
                  onClick={addSchedule}
                  className="flex items-center space-x-2 px-4 py-2 bg-primary-50 text-primary-600 rounded-lg hover:bg-primary-100"
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

            <div className="flex items-center space-x-2">
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

        <div className="flex justify-end space-x-4 mt-6">
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
            className="flex items-center space-x-2 px-6 py-2 bg-primary-gradient text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-5 h-5" />
            <span>{loading ? t('classes.updating') : t('classes.updateButton')}</span>
          </button>
        </div>
      </form>
    </div>
  )
}

