import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { checkFinancePermission, getStudentSemesterMilestone } from '../../utils/financePermissions'
import { getPaymentsEnabled } from '../../utils/getPaymentsEnabled'
import { isExamEnterableForStudent } from '../../utils/subjectExamDateTime'

import { 
  ArrowLeft, BookOpen, FileText, Video, Download, Upload, CheckCircle, 
  XCircle, Clock, AlertCircle, GraduationCap, Eye, MessageSquare, 
  HelpCircle, Calendar, BarChart3, Lock, Unlock, Play, Users, FolderOpen,
  FileVideo, File, Link as LinkIcon, ExternalLink
} from 'lucide-react'

export default function StudentSubjectView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState(null)
  const [student, setStudent] = useState(null)
  const [enrollment, setEnrollment] = useState(null)
  const [materials, setMaterials] = useState([])
  const [homework, setHomework] = useState([])
  const [exams, setExams] = useState([])
  const [recordings, setRecordings] = useState([])
  const [attendance, setAttendance] = useState([])
  const [grades, setGrades] = useState(null)
  const [forumPosts, setForumPosts] = useState([])
  const [questions, setQuestions] = useState([])
  const [teamsMeetings, setTeamsMeetings] = useState([])
  const [activeTab, setActiveTab] = useState('overview')
  const [availableActions, setAvailableActions] = useState([])
  const [paymentsEnabled, setPaymentsEnabled] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (user?.email && id) {
      fetchAllData()
    }
  }, [user, id])

  const fetchAllData = async () => {
    setLoading(true)
    try {
      // Fetch student (without financial_milestone_code - now per-semester)
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('id, student_id, name_en, first_name, last_name, email, current_status_code, financial_hold_reason_code, college_id')
        .eq('email', user.email)
        .eq('status', 'active')
        .single()

      if (studentError) throw studentError
      setStudent(studentData)
      const pe = await getPaymentsEnabled(studentData.college_id).catch(() => true)
      setPaymentsEnabled(pe)

      // Fetch subject
      const { data: subjectData, error: subjectError } = await supabase
        .from('subjects')
        .select(`
          *,
          majors(id, name_en, code),
          instructors(id, name_en, email),
          colleges(id, name_en, code)
        `)
        .eq('id', id)
        .single()

      if (subjectError) throw subjectError

      // Parse JSONB fields
      if (subjectData.attendance_rules && typeof subjectData.attendance_rules === 'string') {
        try {
          subjectData.attendance_rules = JSON.parse(subjectData.attendance_rules)
        } catch (e) {}
      }
      if (subjectData.grade_configuration && typeof subjectData.grade_configuration === 'string') {
        try {
          subjectData.grade_configuration = JSON.parse(subjectData.grade_configuration)
        } catch (e) {}
      }

      setSubject(subjectData)

      // Fetch enrollment for this student and subject
      const { data: enrollmentData, error: enrollmentError } = await supabase
        .from('enrollments')
        .select(`
          *,
          classes(id, code, section, subjects(id, name_en, code)),
          semesters(id, name_en, code)
        `)
        .eq('student_id', studentData.id)
        .eq('status', 'enrolled')
        .limit(1)
        .single()

      // Check if enrolled in any class with this subject
      const { data: allEnrollments } = await supabase
        .from('enrollments')
        .select(`
          *,
          classes!inner(id, code, section, subject_id, instructor_id, subjects(id, name_en, code), instructors(id, name_en, email)),
          semesters(id, name_en, code, start_date)
        `)
        .eq('student_id', studentData.id)
        .eq('status', 'enrolled')
        .eq('classes.subject_id', id)

      if (allEnrollments && allEnrollments.length > 0) {
        const enrollment = allEnrollments[0]
        setEnrollment(enrollment)
        const classId = enrollment.class_id
        const semesterId = enrollment.semester_id

        // Fetch all related data in parallel
        await Promise.all([
          fetchMaterials(classId),
          fetchHomework(classId),
          fetchExams(classId),
          fetchRecordings(),
          fetchAttendance(enrollment.id),
          fetchGrades(enrollment.id),
          fetchForumPosts(),
          fetchQuestions(studentData?.id),
          fetchTeamsMeetings(classId),
        ])

        // Calculate available actions based on permissions (per-semester milestone)
        await calculateAvailableActions(subjectData, studentData, semesterId, pe)
      } else {
        setError('You are not enrolled in this subject')
      }
    } catch (err) {
      console.error('Error fetching data:', err)
      setError(err.message || 'Failed to load subject data')
    } finally {
      setLoading(false)
    }
  }

  const fetchMaterials = async (classId) => {
    try {
      const [subjectRes, classRes] = await Promise.all([
        supabase
          .from('subject_materials')
          .select('*, subject_content_types(code, name_en, name_ar, icon)')
          .eq('subject_id', id)
          .eq('is_published', true)
          .order('display_order'),
        classId
          ? supabase
              .from('class_materials')
              .select('*, subject_content_types(code, name_en, name_ar, icon)')
              .eq('subject_id', id)
              .eq('class_id', classId)
              .eq('is_published', true)
              .order('display_order')
          : Promise.resolve({ data: [] }),
      ])
      if (subjectRes.error) throw subjectRes.error
      const subjectMats = (subjectRes.data || []).map(m => ({ ...m, _source: 'subject' }))
      const classMats = (classRes.data || []).map(m => ({ ...m, _source: 'class' }))
      setMaterials([...subjectMats, ...classMats].sort((a, b) => (a.display_order || 0) - (b.display_order || 0)))
    } catch (err) {
      console.error('Error fetching materials:', err)
    }
  }

  const fetchHomework = async (classId) => {
    try {
      // Only fetch homework for the specific class the student is enrolled in
      // Students should only see homework assigned to their class, not subject-wide homework
      if (!classId) {
        setHomework([])
        return
      }

      let query = supabase
        .from('subject_homework')
        .select('*')
        .eq('subject_id', id)
        .eq('class_id', classId) // Only show homework for this specific class

      const { data, error } = await query
        .in('status', ['HW_PUB', 'HW_CLD'])
        .order('due_date', { ascending: false })

      if (error) throw error

      // Fetch submissions for current student
      if (student?.id && data?.length > 0) {
        const homeworkIds = data.map(hw => hw.id)
        const { data: submissions } = await supabase
          .from('homework_submissions')
          .select('*')
          .eq('student_id', student.id)
          .in('homework_id', homeworkIds)

        // Merge submission data with homework
        const homeworkWithSubmissions = data.map(hw => ({
          ...hw,
          submission: submissions?.find(s => s.homework_id === hw.id) || null
        }))
        setHomework(homeworkWithSubmissions)
      } else {
        setHomework(data || [])
      }
    } catch (err) {
      console.error('Error fetching homework:', err)
    }
  }

  const fetchExams = async (classId) => {
    try {
      // Only fetch exams for the specific class the student is enrolled in
      // Students should only see exams assigned to their class, not subject-wide exams
      if (!classId) {
        setExams([])
        return
      }

      let query = supabase
        .from('subject_exams')
        .select('*')
        .eq('subject_id', id)
        .eq('class_id', classId) // Only show exams for this specific class

      const { data, error } = await query
        .in('status', ['EX_SCH', 'EX_OPN', 'EX_CLS', 'EX_REL'])
        .order('scheduled_date', { ascending: false })

      if (error) throw error

      // Fetch submissions for current student
      if (student?.id && data?.length > 0) {
        const examIds = data.map(exam => exam.id)
        const { data: submissions } = await supabase
          .from('exam_submissions')
          .select('*')
          .eq('student_id', student.id)
          .in('exam_id', examIds)

        const examsWithSubmissions = data.map(exam => ({
          ...exam,
          submission: submissions?.find(s => s.exam_id === exam.id) || null
        }))
        setExams(examsWithSubmissions)
      } else {
        setExams(data || [])
      }
    } catch (err) {
      console.error('Error fetching exams:', err)
    }
  }

  const fetchRecordings = async () => {
    try {
      const { data, error } = await supabase
        .from('subject_recordings')
        .select('*')
        .eq('subject_id', id)
        .eq('is_published', true)
        .order('recorded_date', { ascending: false })

      if (error) throw error
      setRecordings(data || [])
    } catch (err) {
      console.error('Error fetching recordings:', err)
    }
  }

  const fetchAttendance = async (enrollmentId) => {
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          *,
          class_sessions(id, session_date, start_time, end_time, classes(id, code))
        `)
        .eq('enrollment_id', enrollmentId)
        .order('date', { ascending: false })
        .limit(50)

      if (error) throw error
      setAttendance(data || [])

      // Calculate attendance stats
      const total = data?.length || 0
      const present = data?.filter(a => a.status === 'present' || a.status === 'excused').length || 0
      const attendanceRate = total > 0 ? ((present / total) * 100).toFixed(1) : 0
      return { total, present, attendanceRate: parseFloat(attendanceRate) }
    } catch (err) {
      console.error('Error fetching attendance:', err)
      return { total: 0, present: 0, attendanceRate: 0 }
    }
  }

  const fetchGrades = async (enrollmentId) => {
    try {
      // Check if grades are visible based on subject rules and student finance
      if (!subject) return

      const gradesVisible = checkGradesVisibility()
      if (!gradesVisible) {
        setGrades({ visible: false, reason: 'Grades are hidden. Complete payment to view grades.' })
        return
      }

      const { data, error } = await supabase
        .from('grade_components')
        .select('*')
        .eq('enrollment_id', enrollmentId)

      if (error) throw error

      // Also fetch homework and exam grades
      const homeworkGrades = homework
        .filter(hw => hw.submission?.points_earned !== undefined)
        .map(hw => ({
          type: 'homework',
          title: hw.title,
          points: hw.submission.points_earned,
          total: hw.total_points,
          grade: hw.submission.grade
        }))

      const examGrades = exams
        .filter(exam => exam.submission?.points_earned !== undefined)
        .map(exam => ({
          type: 'exam',
          title: exam.title,
          points: exam.submission.points_earned,
          total: exam.total_points,
          grade: exam.submission.grade
        }))

      setGrades({
        visible: true,
        components: data || [],
        homework: homeworkGrades,
        exams: examGrades
      })
    } catch (err) {
      console.error('Error fetching grades:', err)
    }
  }

  const fetchForumPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('subject_forum_posts')
        .select('*, posted_by_student_id, posted_by_instructor_id')
        .eq('subject_id', id)
        .is('parent_post_id', null) // Only top-level posts
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error
      setForumPosts(data || [])
    } catch (err) {
      console.error('Error fetching forum posts:', err)
    }
  }

  const fetchQuestions = async (studentId) => {
    try {
      let query = supabase
        .from('subject_questions')
        .select('*, asked_by_student_id, answered_by_instructor_id')
        .eq('subject_id', id)

      // Build the OR condition based on whether student ID exists
      if (studentId) {
        query = query.or(`is_public.eq.true,asked_by_student_id.eq.${studentId}`)
      } else {
        query = query.eq('is_public', true)
      }

      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error
      setQuestions(data || [])
    } catch (err) {
      console.error('Error fetching questions:', err)
    }
  }

  const fetchTeamsMeetings = async (classId) => {
    if (!classId) return
    
    try {
      const { data, error } = await supabase
        .from('class_teams_meetings')
        .select('*')
        .eq('class_id', classId)
        .eq('is_active', true)
        .gte('meeting_date', new Date().toISOString()) // Only show upcoming meetings
        .order('meeting_date', { ascending: true })

      if (error) throw error
      setTeamsMeetings(data || [])
    } catch (err) {
      console.error('Error fetching Teams meetings:', err)
    }
  }

  const checkGradesVisibility = () => {
    if (!subject || !student) return false

    const visibilityStatus = subject.grades_visibility_status || 'GV_HID'

    // Check if requires full payment
    if (subject.requires_payment_completion && student.financial_milestone_code !== 'PM100') {
      return false
    }

    // Check visibility status
    switch (visibilityStatus) {
      case 'GV_HID':
        return false
      case 'GV_TMP':
        // Temporary visibility - check if within time window
        // This would need dates from subject_grades_visibility table
        return true
      case 'GV_REL':
        return true
      case 'GV_FIN':
        return true
      default:
        return false
    }
  }

  const calculateAvailableActions = async (subjectData, studentData, semesterId, pe = paymentsEnabled) => {
    const actions = []
    const studentStatus = studentData.current_status_code || 'ENAC'
    let financialHold = studentData.financial_hold_reason_code || null
    const gradesVisibility = subjectData.grades_visibility_status || 'GV_HID'

    // Get semester-specific financial milestone
    let financeMilestone = 'PM00'
    if (semesterId && studentData.id) {
      const semesterStatus = await getStudentSemesterMilestone(studentData.id, semesterId)
      financeMilestone = semesterStatus.milestone || 'PM00'
      // Use semester-specific hold if available, otherwise use student-level hold
      financialHold = semesterStatus.hold || financialHold
    }

    // Check each subject action using finance permission utility
    const subjectActions = [
      'SS_VIEW', 'SS_MATL', 'SS_DOWN', 'SS_REC', 'SS_JOIN', 'SS_ATT',
      'SS_HWV', 'SS_HWS', 'SS_HWU', 'SS_EXAM', 'SS_EXVR', 'SS_GRAD',
      'SS_FEED', 'SS_FOR', 'SS_QNA', 'SS_SYL'
    ]

    subjectActions.forEach(actionCode => {
      const permission = checkFinancePermission(
        actionCode,
        financeMilestone,
        financialHold,
        actionCode === 'SS_GRAD' || actionCode === 'SS_EXVR' ? gradesVisibility : null,
        pe
      )
      actions.push({
        code: actionCode,
        enabled: permission.allowed,
        reason: permission.reason
      })
    })

    setAvailableActions(actions)
  }

  const canPerformAction = (actionCode) => {
    const action = availableActions.find(a => a.code === actionCode)
    return action?.enabled || false
  }

  const getContentTypeIcon = (typeCode) => {
    switch (typeCode) {
      case 'CT_PDF':
        return <FileText className="w-5 h-5" />
      case 'CT_VID':
        return <Video className="w-5 h-5" />
      case 'CT_PPT':
        return <File className="w-5 h-5" />
      case 'CT_AUD':
        return <FileVideo className="w-5 h-5" />
      case 'CT_LNK':
        return <LinkIcon className="w-5 h-5" />
      case 'CT_REC':
        return <Video className="w-5 h-5" />
      default:
        return <FileText className="w-5 h-5" />
    }
  }

  const getHomeworkStatus = (hw) => {
    if (hw.status === 'HW_CLD') return { label: 'Closed', color: 'bg-gray-100 text-gray-800' }
    if (hw.submission?.status === 'HW_GRD') return { label: 'Graded', color: 'bg-green-100 text-green-800' }
    if (hw.submission?.status === 'HW_LATE') return { label: 'Submitted Late', color: 'bg-yellow-100 text-yellow-800' }
    if (hw.submission?.status === 'HW_SUB') return { label: 'Submitted', color: 'bg-blue-100 text-blue-800' }
    if (new Date(hw.due_date) < new Date()) return { label: 'Overdue', color: 'bg-red-100 text-red-800' }
    return { label: 'Open', color: 'bg-green-100 text-green-800' }
  }

  const getExamStatus = (exam) => {
    if (exam.status === 'EX_REL' && exam.submission?.status === 'EX_GRD') {
      return { label: 'Results Released', color: 'bg-green-100 text-green-800', canView: true }
    }
    if (exam.status === 'EX_CLS') return { label: 'Closed', color: 'bg-gray-100 text-gray-800', canView: false }
    if (isExamEnterableForStudent(exam)) {
      return { label: 'Open', color: 'bg-blue-100 text-blue-800', canView: canPerformAction('SS_EXAM') }
    }
    if (exam.status === 'EX_OPN' || exam.status === 'EX_SCH') {
      return { label: 'Scheduled', color: 'bg-yellow-100 text-yellow-800', canView: false }
    }
    return { label: 'Unknown', color: 'bg-gray-100 text-gray-800', canView: false }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error || !subject) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-6"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back</span>
          </button>
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-red-900 mb-2">Error</h2>
            <p className="text-red-700">{error || 'Subject not found or you are not enrolled'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{subject.name_en}</h1>
                <p className="text-gray-600">{subject.code} - {subject.majors?.name_en}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {enrollment?.classes?.instructors && (
                <div className="text-right">
                  <p className="text-sm text-gray-600">Class Instructor</p>
                  <p className="text-sm font-medium text-gray-900">{enrollment.classes.instructors.name_en}</p>
                </div>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-4 flex space-x-1 border-b border-gray-200 overflow-x-auto">
            {[
              { id: 'overview', label: 'Overview', icon: BookOpen },
              { id: 'materials', label: 'Materials', icon: FolderOpen, action: 'SS_MATL' },
              { id: 'homework', label: 'Homework', icon: FileText, action: 'SS_HWV' },
              { id: 'exams', label: 'Exams', icon: GraduationCap, action: 'SS_EXAM' },
              { id: 'teams', label: 'Teams Meetings', icon: Video, action: 'SS_JOIN' },
              { id: 'recordings', label: 'Recordings', icon: Video, action: 'SS_REC' },
              { id: 'attendance', label: 'Attendance', icon: Calendar, action: 'SS_ATT' },
              { id: 'grades', label: 'Grades', icon: BarChart3, action: 'SS_GRAD' },
              { id: 'forum', label: 'Forum', icon: MessageSquare, action: 'SS_FOR' },
              { id: 'qa', label: 'Q&A', icon: HelpCircle, action: 'SS_QNA' },
            ].map(tab => {
              const canAccess = !tab.action || canPerformAction(tab.action)
              const TabIcon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => canAccess && setActiveTab(tab.id)}
                  disabled={!canAccess}
                  className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-primary-600 text-primary-600'
                      : canAccess
                      ? 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                      : 'border-transparent text-gray-400 cursor-not-allowed'
                  }`}
                >
                  <TabIcon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {!canAccess && <Lock className="w-3 h-3" />}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Subject Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {enrollment?.classes && (
                  <>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Class Code</p>
                      <p className="font-semibold text-gray-900">{enrollment.classes.code}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600 mb-1">Section</p>
                      <p className="font-semibold text-gray-900">{enrollment.classes.section}</p>
                    </div>
                    {enrollment.semesters && (
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Semester</p>
                        <p className="font-semibold text-gray-900">{enrollment.semesters.name_en} ({enrollment.semesters.code})</p>
                      </div>
                    )}
                  </>
                )}
                <div>
                  <p className="text-sm text-gray-600 mb-1">Credit Hours</p>
                  <p className="font-semibold text-gray-900">{subject.credit_hours}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Type</p>
                  <p className="font-semibold text-gray-900 capitalize">{subject.type}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Subject Semester</p>
                  <p className="font-semibold text-gray-900">Semester {subject.semester_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">College</p>
                  <p className="font-semibold text-gray-900">{subject.colleges?.name_en}</p>
                </div>
              </div>

              {subject.description && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <p className="text-sm text-gray-600 mb-2">Description</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{subject.description}</p>
                </div>
              )}

              {canPerformAction('SS_SYL') && subject.syllabus_content && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Syllabus</h3>
                  <p className="text-gray-700 whitespace-pre-wrap">{subject.syllabus_content}</p>
                </div>
              )}
            </div>

            {/* Action Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableActions
                .filter(a => a.code !== 'SS_VIEW')
                .map(action => {
                  const actionConfig = {
                    'SS_MATL': { label: 'View Materials', icon: FolderOpen, color: 'bg-blue-50 border-blue-200' },
                    'SS_HWV': { label: 'View Homework', icon: FileText, color: 'bg-purple-50 border-purple-200' },
                    'SS_EXAM': { label: 'Take Exams', icon: GraduationCap, color: 'bg-green-50 border-green-200' },
                    'SS_GRAD': { label: 'View Grades', icon: BarChart3, color: 'bg-yellow-50 border-yellow-200' },
                    'SS_ATT': { label: 'View Attendance', icon: Calendar, color: 'bg-indigo-50 border-indigo-200' },
                  }[action.code] || { label: action.code, icon: Eye, color: 'bg-gray-50 border-gray-200' }

                  const ActionIcon = actionConfig.icon
                  return (
                    <div
                      key={action.code}
                      className={`border-2 rounded-lg p-4 ${actionConfig.color} ${!action.enabled ? 'opacity-50' : 'cursor-pointer hover:shadow-md transition-shadow'}`}
                      onClick={() => {
                        if (action.enabled) {
                          if (action.code === 'SS_MATL') setActiveTab('materials')
                          if (action.code === 'SS_HWV') setActiveTab('homework')
                          if (action.code === 'SS_EXAM') setActiveTab('exams')
                          if (action.code === 'SS_GRAD') setActiveTab('grades')
                          if (action.code === 'SS_ATT') setActiveTab('attendance')
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <ActionIcon className={`w-6 h-6 mb-2 ${action.enabled ? 'text-blue-600' : 'text-gray-400'}`} />
                          <p className="font-semibold text-gray-900">{actionConfig.label}</p>
                        </div>
                        {!action.enabled && <Lock className="w-5 h-5 text-gray-400" />}
                      </div>
                      {!action.enabled && (
                        <p className="text-xs text-gray-600 mt-2">Complete payment requirements to access</p>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* Materials Tab */}
        {activeTab === 'materials' && canPerformAction('SS_MATL') && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Learning Materials</h2>
              {materials.length > 0 ? (
                <div className="space-y-3">
                  {materials.map(material => (
                    <div key={material.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="flex items-center space-x-4">
                        {getContentTypeIcon(material.content_type_code)}
                        <div>
                          <p className="font-medium text-gray-900">{material.title}</p>
                          <p className="text-sm text-gray-600">{material.subject_content_types?.name_en || material.content_type_code}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {material.external_link ? (
                          <a
                            href={material.external_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
                          >
                            <LinkIcon className="w-4 h-4" />
                            <span>Open Link</span>
                          </a>
                        ) : (
                          canPerformAction('SS_DOWN') && material.file_url && (
                            <a
                              href={material.file_url}
                              download
                              className="px-4 py-2 bg-primary-gradient text-white rounded-lg hover:shadow-lg transition-all flex items-center space-x-2"
                            >
                              <Download className="w-4 h-4" />
                              <span>Download</span>
                            </a>
                          )
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No materials available yet</p>
              )}
            </div>
          </div>
        )}

        {/* Teams Meetings Tab */}
        {activeTab === 'teams' && canPerformAction('SS_JOIN') && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center space-x-2">
                <Video className="w-6 h-6 text-blue-600" />
                <span>Microsoft Teams Meetings</span>
              </h2>
              {teamsMeetings.length > 0 ? (
                <div className="space-y-3">
                  {teamsMeetings.map(meeting => (
                    <div key={meeting.id} className="border border-gray-200 rounded-lg p-5 hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 mb-2">{meeting.meeting_title}</h3>
                          {meeting.meeting_description && (
                            <p className="text-gray-600 mb-3">{meeting.meeting_description}</p>
                          )}
                          <div className="flex items-center space-x-4 text-sm text-gray-600 mb-3">
                            <span className="flex items-center space-x-1">
                              <Calendar className="w-4 h-4" />
                              <span>{new Date(meeting.meeting_date).toLocaleString()}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <Clock className="w-4 h-4" />
                              <span>{meeting.meeting_duration_minutes} minutes</span>
                            </span>
                          </div>
                          {meeting.teams_join_url && (
                            <a
                              href={meeting.teams_join_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              <Video className="w-4 h-4" />
                              <span>Join Teams Meeting</span>
                              <LinkIcon className="w-4 h-4" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Video className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p>No Teams meetings scheduled yet.</p>
                  <p className="text-sm mt-1">Check back later or contact your instructor.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Homework Tab */}
        {activeTab === 'homework' && canPerformAction('SS_HWV') && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Homework Assignments</h2>
              {homework.length > 0 ? (
                <div className="space-y-4">
                  {homework.map(hw => {
                    const status = getHomeworkStatus(hw)
                    const isSubmitted = !!hw.submission
                    const canSubmit = canPerformAction('SS_HWS') && hw.status === 'HW_PUB' && !hw.submission && new Date(hw.due_date) >= new Date()
                    return (
                      <div key={hw.id} className="border border-gray-200 rounded-lg p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">{hw.title}</h3>
                            <p className="text-gray-600 mb-3">{hw.description}</p>
                            <div className="flex items-center space-x-4 text-sm text-gray-600">
                              <span className="flex items-center space-x-1">
                                <Calendar className="w-4 h-4" />
                                <span>Due: {new Date(hw.due_date).toLocaleDateString()}</span>
                              </span>
                              <span className="flex items-center space-x-1">
                                <BarChart3 className="w-4 h-4" />
                                <span>{hw.total_points} points</span>
                              </span>
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${status.color}`}>
                            {status.label}
                          </span>
                        </div>
                        
                        {hw.submission && (
                          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                            <p className="text-sm font-medium text-gray-900 mb-1">Your Submission</p>
                            <p className="text-sm text-gray-600 mb-2">
                              Submitted: {new Date(hw.submission.submitted_at).toLocaleString()}
                            </p>
                            {hw.submission.points_earned !== null && (
                              <p className="text-sm font-semibold text-gray-900">
                                Score: {hw.submission.points_earned} / {hw.total_points}
                                {hw.submission.grade && ` (${hw.submission.grade})`}
                              </p>
                            )}
                            {hw.submission.feedback && (
                              <p className="text-sm text-gray-700 mt-2">{hw.submission.feedback}</p>
                            )}
                          </div>
                        )}

                        {canSubmit && (
                          <button
                            onClick={() => {
                              // TODO: Open submission modal
                              alert('Homework submission functionality will be implemented')
                            }}
                            className="mt-4 px-4 py-2 bg-primary-gradient text-white rounded-lg hover:shadow-lg transition-all flex items-center space-x-2"
                          >
                            <Upload className="w-4 h-4" />
                            <span>Submit Homework</span>
                          </button>
                        )}

                        {canPerformAction('SS_HWU') && isSubmitted && hw.status === 'HW_PUB' && new Date(hw.due_date) >= new Date() && (
                          <button
                            onClick={() => {
                              // TODO: Open update submission modal
                              alert('Update submission functionality will be implemented')
                            }}
                            className="mt-2 px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            Update Submission
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No homework assignments yet</p>
              )}
            </div>
          </div>
        )}

        {/* Exams Tab */}
        {activeTab === 'exams' && canPerformAction('SS_EXAM') && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Exams</h2>
              {exams.length > 0 ? (
                <div className="space-y-4">
                  {exams.map(exam => {
                    const status = getExamStatus(exam)
                    return (
                      <div key={exam.id} className="border border-gray-200 rounded-lg p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">{exam.title}</h3>
                            <p className="text-gray-600 mb-3">{exam.description}</p>
                            <div className="flex items-center space-x-4 text-sm text-gray-600">
                              <span className="flex items-center space-x-1">
                                <Calendar className="w-4 h-4" />
                                <span>{new Date(exam.scheduled_date).toLocaleDateString()}</span>
                              </span>
                              <span className="flex items-center space-x-1">
                                <Clock className="w-4 h-4" />
                                <span>{exam.start_time} - {exam.end_time}</span>
                              </span>
                              <span className="flex items-center space-x-1">
                                <BarChart3 className="w-4 h-4" />
                                <span>{exam.total_points} points</span>
                              </span>
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${status.color}`}>
                            {status.label}
                          </span>
                        </div>

                        {exam.submission && (
                          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                            <p className="text-sm font-medium text-gray-900 mb-1">Your Submission</p>
                            <p className="text-sm text-gray-600 mb-2">
                              Submitted: {new Date(exam.submission.submitted_at).toLocaleString()}
                            </p>
                            {status.canView && exam.submission.points_earned !== null && (
                              <p className="text-sm font-semibold text-gray-900">
                                Score: {exam.submission.points_earned} / {exam.total_points}
                                {exam.submission.grade && ` (${exam.submission.grade})`}
                              </p>
                            )}
                          </div>
                        )}

                        {status.canView && !exam.submission && (
                          <button
                            onClick={() => {
                              // TODO: Open exam taking interface
                              navigate(`/student/subjects/${id}/exams/${exam.id}/take`)
                            }}
                            className="mt-4 px-4 py-2 bg-primary-gradient text-white rounded-lg hover:shadow-lg transition-all flex items-center space-x-2"
                          >
                            <Play className="w-4 h-4" />
                            <span>Take Exam</span>
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No exams scheduled yet</p>
              )}
            </div>
          </div>
        )}

        {/* Recordings Tab */}
        {activeTab === 'recordings' && canPerformAction('SS_REC') && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Recorded Lectures</h2>
              {recordings.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recordings.map(recording => (
                    <div key={recording.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="aspect-video bg-gray-200 rounded-lg mb-3 flex items-center justify-center">
                        <Video className="w-12 h-12 text-gray-400" />
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-1">{recording.title}</h3>
                      <p className="text-sm text-gray-600 mb-3">{new Date(recording.recorded_date).toLocaleDateString()}</p>
                      <button
                        onClick={() => {
                          window.open(recording.recording_url, '_blank')
                        }}
                        className="w-full px-4 py-2 bg-primary-gradient text-white rounded-lg hover:shadow-lg transition-all flex items-center justify-center space-x-2"
                      >
                        <Play className="w-4 h-4" />
                        <span>Watch</span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No recordings available yet</p>
              )}
            </div>
          </div>
        )}

        {/* Attendance Tab */}
        {activeTab === 'attendance' && canPerformAction('SS_ATT') && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Attendance Record</h2>
              {attendance.length > 0 ? (
                <div className="space-y-3">
                  {attendance.map(record => {
                    const statusIcons = {
                      present: <CheckCircle className="w-5 h-5 text-green-600" />,
                      absent: <XCircle className="w-5 h-5 text-red-600" />,
                      late: <Clock className="w-5 h-5 text-yellow-600" />,
                      excused: <AlertCircle className="w-5 h-5 text-blue-600" />,
                    }
                    return (
                      <div key={record.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                        <div className="flex items-center space-x-4">
                          {statusIcons[record.status] || <XCircle className="w-5 h-5 text-gray-600" />}
                          <div>
                            <p className="font-medium text-gray-900">{new Date(record.date).toLocaleDateString()}</p>
                            <p className="text-sm text-gray-600 capitalize">{record.status}</p>
                          </div>
                        </div>
                        {record.notes && (
                          <p className="text-sm text-gray-600">{record.notes}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No attendance records yet</p>
              )}
            </div>
          </div>
        )}

        {/* Grades Tab */}
        {activeTab === 'grades' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Grades</h2>
              {grades?.visible ? (
                <div className="space-y-6">
                  {/* Overall Grade Component */}
                  {grades.components && grades.components.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Overall Grade</h3>
                      <div className="space-y-2">
                        {grades.components.map((component, idx) => (
                          <div key={idx} className="p-4 bg-gray-50 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-gray-900">Final Grade</p>
                                {component.letter_grade && (
                                  <p className="text-sm text-gray-600">Letter: {component.letter_grade}</p>
                                )}
                              </div>
                              <div className="text-right">
                                {component.numeric_grade && (
                                  <p className="text-2xl font-bold text-gray-900">{component.numeric_grade}</p>
                                )}
                                {component.gpa_points && (
                                  <p className="text-sm text-gray-600">GPA: {component.gpa_points}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Homework Grades */}
                  {grades.homework && grades.homework.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Homework</h3>
                      <div className="space-y-2">
                        {grades.homework.map((hw, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                            <span className="font-medium text-gray-900">{hw.title}</span>
                            <span className="text-gray-900">
                              {hw.points} / {hw.total} {hw.grade && `(${hw.grade})`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Exam Grades */}
                  {grades.exams && grades.exams.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Exams</h3>
                      <div className="space-y-2">
                        {grades.exams.map((exam, idx) => (
                          <div key={idx} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                            <span className="font-medium text-gray-900">{exam.title}</span>
                            <span className="text-gray-900">
                              {exam.points} / {exam.total} {exam.grade && `(${exam.grade})`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Lock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 mb-2">Grades are not available</p>
                  <p className="text-sm text-gray-500">{grades?.reason || 'Complete payment requirements to view grades'}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Forum Tab */}
        {activeTab === 'forum' && canPerformAction('SS_FOR') && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Discussion Forum</h2>
                <button
                  onClick={() => {
                    // TODO: Open new post modal
                    alert('Create post functionality will be implemented')
                  }}
                  className="px-4 py-2 bg-primary-gradient text-white rounded-lg hover:shadow-lg transition-all flex items-center space-x-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>New Post</span>
                </button>
              </div>
              {forumPosts.length > 0 ? (
                <div className="space-y-3">
                  {forumPosts.map(post => (
                    <div key={post.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold text-gray-900">{post.title || 'Untitled'}</h3>
                          <p className="text-sm text-gray-600">{new Date(post.created_at).toLocaleString()}</p>
                        </div>
                        {post.is_pinned && (
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">Pinned</span>
                        )}
                      </div>
                      <p className="text-gray-700 mb-3">{post.content}</p>
                      {post.reply_count > 0 && (
                        <button className="text-sm text-blue-600 hover:text-blue-700">
                          View {post.reply_count} {post.reply_count === 1 ? 'reply' : 'replies'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No forum posts yet. Be the first to post!</p>
              )}
            </div>
          </div>
        )}

        {/* Q&A Tab */}
        {activeTab === 'qa' && canPerformAction('SS_QNA') && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Questions & Answers</h2>
                <button
                  onClick={() => {
                    // TODO: Open ask question modal
                    alert('Ask question functionality will be implemented')
                  }}
                  className="px-4 py-2 bg-primary-gradient text-white rounded-lg hover:shadow-lg transition-all flex items-center space-x-2"
                >
                  <HelpCircle className="w-4 h-4" />
                  <span>Ask Question</span>
                </button>
              </div>
              {questions.length > 0 ? (
                <div className="space-y-4">
                  {questions.map(question => (
                    <div key={question.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="mb-3">
                        <p className="font-semibold text-gray-900 mb-2">Q: {question.question_text}</p>
                        <p className="text-xs text-gray-500">Asked on {new Date(question.created_at).toLocaleString()}</p>
                      </div>
                      {question.answer_text && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="font-semibold text-gray-900 mb-2">A: {question.answer_text}</p>
                          {question.answered_at && (
                            <p className="text-xs text-gray-500">Answered on {new Date(question.answered_at).toLocaleString()}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No questions yet. Ask your first question!</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

