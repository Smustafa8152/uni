import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getGradeTypesFromUniversitySettings, mergeGradeConfigWithTypes } from '../../utils/getCollegeSettings'
import { supabase } from '../../lib/supabase'
import {
  INSTRUCTOR_SEMESTER_SELECT,
  effectiveAttendanceEditingAllowed,
} from '../../utils/instructorSemesters'
import { getLocalizedName } from '../../utils/localizedName'
import { useAuth } from '../../contexts/AuthContext'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'
import { 
  ArrowLeft, BookOpen, FileText, Video, Upload, Plus, Edit, Trash2,
  CheckCircle, XCircle, Clock, AlertCircle, GraduationCap, Eye, 
  MessageSquare, HelpCircle, Calendar, BarChart3, Users, Settings,
  FileVideo, File, Link as LinkIcon, Play, Download, FolderOpen, Users2,
  X, Pin, Lock,
} from 'lucide-react'
import InstructorSubjectHome, { COURSE_PANEL } from './InstructorSubjectHome'
import InstructorSubjectSessionsPanel from './InstructorSubjectSessionsPanel'
import InstructorSubjectStudentsPanel from './InstructorSubjectStudentsPanel'
import InstructorCurriculumMap from './InstructorCurriculumMap'
import InstructorBuildLesson from './InstructorBuildLesson'
import InstructorQuestionBank from './InstructorQuestionBank'
import InstructorGradebook from './InstructorGradebook'
import InstructorAssessmentAuthoring from './InstructorAssessmentAuthoring'
import InstructorCourseAnalytics from './InstructorCourseAnalytics'
import InstructorCommunication from './InstructorCommunication'
import InstructorIntegrityCases from './InstructorIntegrityCases'
import InstructorAttendanceSessionTake from './InstructorAttendanceSessionTake'

export default function InstructorSubjectView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [subject, setSubject] = useState(null)
  const [instructor, setInstructor] = useState(null)
  const [materials, setMaterials] = useState([])
  const [classMaterials, setClassMaterials] = useState([])
  const [homework, setHomework] = useState([])
  const [exams, setExams] = useState([])
  const [recordings, setRecordings] = useState([])
  const [classes, setClasses] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [attendance, setAttendance] = useState([])
  const [forumPosts, setForumPosts] = useState([])
  const [questions, setQuestions] = useState([])
  const [gradeTypes, setGradeTypes] = useState([])
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'home')
  const [error, setError] = useState('')
  const [classLessons, setClassLessons] = useState([])
  const [coursePanel, setCoursePanel] = useState(COURSE_PANEL.curriculum)
  const [platformUserId, setPlatformUserId] = useState(null)
  const [attendanceEditRecord, setAttendanceEditRecord] = useState(null)
  const [attendanceForm, setAttendanceForm] = useState({ status: 'present', notes: '' })
  const [attendanceClassId, setAttendanceClassId] = useState(null)
  const [forumActionId, setForumActionId] = useState(null)
  const [answerModalQuestion, setAnswerModalQuestion] = useState(null)
  const [answerDraft, setAnswerDraft] = useState('')
  const [answerSaving, setAnswerSaving] = useState(false)

  // Update active tab when query parameter changes (no tab → course home)
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam) setActiveTab(tabParam)
    else setActiveTab('home')
  }, [searchParams])

  useEffect(() => {
    if (user?.email && id) {
      fetchAllData()
    }
  }, [user, id])

  useEffect(() => {
    getGradeTypesFromUniversitySettings().then(setGradeTypes)
  }, [])

  const fetchAllData = async () => {
    setLoading(true)
    try {
      // Fetch instructor
      const instructorData = await getActiveInstructorByEmail(user.email)
      if (!instructorData) throw new Error('Instructor not found')
      setInstructor(instructorData)

      const { data: userRow } = await supabase.from('users').select('id').eq('email', user.email).maybeSingle()
      setPlatformUserId(userRow?.id ?? null)

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

      // First, fetch classes for this subject where instructor is assigned (class-wise, not subject-wise)
      const { data: instructorClasses, error: classesError } = await supabase
        .from('classes')
        .select('id, code, section')
        .eq('subject_id', id)
        .eq('instructor_id', instructorData.id)
        .eq('status', 'active')

      if (classesError) throw classesError

      // If instructor has no classes for this subject, show error
      if (!instructorClasses || instructorClasses.length === 0) {
        setError('You are not assigned to teach any classes for this subject')
        setLoading(false)
        return
      }

      const instructorClassIds = instructorClasses.map(cls => cls.id)

      // Fetch all related data filtered by instructor's classes
      await Promise.all([
        fetchMaterials(instructorClassIds),
        fetchHomework(instructorClassIds),
        fetchExams(instructorClassIds),
        fetchRecordings(),
        fetchClasses(instructorData.id),
        fetchClassLessons(instructorClassIds),
        fetchForumPosts(),
        fetchQuestions(),
      ])
    } catch (err) {
      console.error('Error fetching data:', err)
      setError(err.message || 'Failed to load subject data')
    } finally {
      setLoading(false)
    }
  }

  const fetchMaterials = async (instructorClassIds = []) => {
    try {
      const [subjectRes, classRes] = await Promise.all([
        supabase
          .from('subject_materials')
          .select('*, subject_content_types(code, name_en, name_ar, icon)')
          .eq('subject_id', id)
          .order('display_order'),
        instructorClassIds?.length > 0
          ? supabase
              .from('class_materials')
              .select('*, subject_content_types(code, name_en, name_ar, icon), classes(id, code, section)')
              .eq('subject_id', id)
              .in('class_id', instructorClassIds)
              .order('display_order')
          : Promise.resolve({ data: [] }),
      ])
      if (subjectRes.error) throw subjectRes.error
      setMaterials(subjectRes.data || [])
      setClassMaterials(classRes.data || [])
    } catch (err) {
      console.error('Error fetching materials:', err)
    }
  }

  const fetchHomework = async (instructorClassIds) => {
    try {
      // Only fetch homework for classes where the instructor is assigned
      // Instructors should only see homework for their classes, not all classes for the subject
      if (!instructorClassIds || instructorClassIds.length === 0) {
        setHomework([])
        return
      }

      const { data, error } = await supabase
        .from('subject_homework')
        .select('*')
        .eq('subject_id', id)
        .in('class_id', instructorClassIds) // Only show homework for instructor's classes
        .order('due_date', { ascending: false })

      if (error) throw error
      setHomework(data || [])

      // Fetch submission counts for each homework
      if (data && data.length > 0) {
        const homeworkIds = data.map(hw => hw.id)
        const { data: submissions } = await supabase
          .from('homework_submissions')
          .select('homework_id, status')
          .in('homework_id', homeworkIds)

        const homeworkWithStats = data.map(hw => ({
          ...hw,
          submissionCount: submissions?.filter(s => s.homework_id === hw.id).length || 0,
          gradedCount: submissions?.filter(s => s.homework_id === hw.id && s.status === 'HW_GRD').length || 0,
        }))
        setHomework(homeworkWithStats)
      }
    } catch (err) {
      console.error('Error fetching homework:', err)
    }
  }

  const fetchExams = async (instructorClassIds) => {
    try {
      // Only fetch exams for classes where the instructor is assigned
      // Instructors should only see exams for their classes, not all classes for the subject
      if (!instructorClassIds || instructorClassIds.length === 0) {
        setExams([])
        return
      }

      const { data, error } = await supabase
        .from('subject_exams')
        .select('*')
        .eq('subject_id', id)
        .in('class_id', instructorClassIds) // Only show exams for instructor's classes
        .order('scheduled_date', { ascending: false })

      if (error) throw error
      setExams(data || [])

      // Fetch submission counts
      if (data && data.length > 0) {
        const examIds = data.map(exam => exam.id)
        const { data: submissions } = await supabase
          .from('exam_submissions')
          .select('exam_id, status')
          .in('exam_id', examIds)

        const examsWithStats = data.map(exam => ({
          ...exam,
          submissionCount: submissions?.filter(s => s.exam_id === exam.id).length || 0,
          gradedCount: submissions?.filter(s => s.exam_id === exam.id && s.status === 'EX_GRD').length || 0,
        }))
        setExams(examsWithStats)
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
        .order('recorded_date', { ascending: false })

      if (error) throw error
      setRecordings(data || [])
    } catch (err) {
      console.error('Error fetching recordings:', err)
    }
  }

  const fetchClasses = async (instructorId) => {
    try {
      // Only fetch classes where the instructor is assigned (class-wise assignment)
      // This shows all classes for this subject where the instructor is the teacher
      if (!instructorId) {
        setClasses([])
        return
      }

      const { data, error } = await supabase
        .from('classes')
        .select(`
          *,
          enrollments(id, student_id, status),
          semesters(${INSTRUCTOR_SEMESTER_SELECT})
        `)
        .eq('subject_id', id)
        .eq('instructor_id', instructorId) // Only show classes where instructor is assigned
        .eq('status', 'active')

      if (error) throw error
      setClasses(data || [])
      
      // Calculate enrollment counts
      const classesWithCounts = data.map(cls => ({
        ...cls,
        enrollmentCount: cls.enrollments?.filter(e => e.status === 'enrolled').length || 0,
      }))
      setClasses(classesWithCounts)
    } catch (err) {
      console.error('Error fetching classes:', err)
    }
  }

  const fetchClassLessons = async (instructorClassIds) => {
    try {
      if (!instructorClassIds?.length) {
        setClassLessons([])
        return
      }
      const { data, error } = await supabase
        .from('class_lessons')
        .select('id, title, title_ar, unit_number, lesson_number, estimated_minutes, status, class_id')
        .in('class_id', instructorClassIds)
        .order('unit_number')
        .order('lesson_number')

      if (error) throw error
      setClassLessons(data || [])
    } catch (err) {
      console.error('Error fetching class lessons:', err)
      setClassLessons([])
    }
  }

  const fetchForumPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('subject_forum_posts')
        .select('*, posted_by_student_id, posted_by_instructor_id')
        .eq('subject_id', id)
        .is('parent_post_id', null)
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      setForumPosts(data || [])
    } catch (err) {
      console.error('Error fetching forum posts:', err)
    }
  }

  const fetchQuestions = async () => {
    try {
      const { data, error } = await supabase
        .from('subject_questions')
        .select('*, asked_by_student_id, answered_by_instructor_id')
        .eq('subject_id', id)
        .order('created_at', { ascending: false })
        .limit(50)

      if (error) throw error
      setQuestions(data || [])
    } catch (err) {
      console.error('Error fetching questions:', err)
    }
  }

  const fetchAttendance = async (classId) => {
    try {
      const { data, error } = await supabase
        .from('attendance')
        .select(`
          *,
          students(id, name_en, student_id),
          class_sessions(id, session_date, start_time, end_time)
        `)
        .eq('class_id', classId)
        .order('date', { ascending: false })
        .limit(100)

      if (error) throw error
      setAttendance(data || [])
    } catch (err) {
      console.error('Error fetching attendance:', err)
    }
  }

  const canEditAttendanceForClass = (classId) => {
    if (classId == null || classId === '') return false
    const cls = classes.find((c) => String(c.id) === String(classId))
    return effectiveAttendanceEditingAllowed(cls?.semesters)
  }

  const openAttendanceEdit = (record) => {
    if (!canEditAttendanceForClass(record.class_id)) return
    setAttendanceForm({
      status: record.status || 'present',
      notes: record.notes || '',
    })
    setAttendanceEditRecord(record)
  }

  const saveAttendanceEdit = async () => {
    if (!attendanceEditRecord || !platformUserId) return
    const classId = attendanceEditRecord.class_id
    if (!canEditAttendanceForClass(classId)) return
    const { error } = await supabase
      .from('attendance')
      .update({
        status: attendanceForm.status,
        notes: attendanceForm.notes.trim() || null,
        recorded_by: platformUserId,
      })
      .eq('id', attendanceEditRecord.id)
    if (error) {
      console.error(error)
      return
    }
    setAttendanceEditRecord(null)
    fetchAttendance(classId)
  }

  const toggleForumPost = async (post, field) => {
    setForumActionId(post.id)
    const next = !post[field]
    const { error } = await supabase
      .from('subject_forum_posts')
      .update({
        [field]: next,
        updated_at: new Date().toISOString(),
      })
      .eq('id', post.id)
    setForumActionId(null)
    if (!error) fetchForumPosts()
  }

  const openAnswerModal = (question) => {
    setAnswerModalQuestion(question)
    setAnswerDraft('')
  }

  const submitQuestionAnswer = async () => {
    if (!answerModalQuestion || !instructor?.id || !answerDraft.trim()) return
    setAnswerSaving(true)
    try {
      const { error } = await supabase
        .from('subject_questions')
        .update({
          answer_text: answerDraft.trim(),
          answered_by_instructor_id: instructor.id,
          answered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', answerModalQuestion.id)
      if (error) throw error
      setAnswerModalQuestion(null)
      setAnswerDraft('')
      fetchQuestions()
    } catch (e) {
      console.error(e)
    } finally {
      setAnswerSaving(false)
    }
  }

  const getContentTypeIcon = (typeCode) => {
    switch (typeCode) {
      case 'CT_PDF': return <FileText className="w-5 h-5" />
      case 'CT_VID': return <Video className="w-5 h-5" />
      case 'CT_PPT': return <File className="w-5 h-5" />
      case 'CT_AUD': return <FileVideo className="w-5 h-5" />
      case 'CT_LNK': return <LinkIcon className="w-5 h-5" />
      case 'CT_REC': return <Video className="w-5 h-5" />
      default: return <FileText className="w-5 h-5" />
    }
  }

  const getHomeworkStatus = (hw) => {
    const statusMap = {
      'HW_DRF': { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
      'HW_PUB': { label: 'Published', color: 'bg-green-100 text-green-800' },
      'HW_CLD': { label: 'Closed', color: 'bg-red-100 text-red-800' },
    }
    return statusMap[hw.status] || { label: hw.status, color: 'bg-gray-100 text-gray-800' }
  }

  const getExamStatus = (exam) => {
    const statusMap = {
      'EX_DRF': { label: 'Draft', color: 'bg-gray-100 text-gray-800' },
      'EX_SCH': { label: 'Scheduled', color: 'bg-yellow-100 text-yellow-800' },
      'EX_OPN': { label: 'Open', color: 'bg-blue-100 text-blue-800' },
      'EX_CLS': { label: 'Closed', color: 'bg-red-100 text-red-800' },
      'EX_GRD': { label: 'Graded', color: 'bg-green-100 text-green-800' },
      'EX_REL': { label: 'Results Released', color: 'bg-purple-100 text-purple-800' },
    }
    return statusMap[exam.status] || { label: exam.status, color: 'bg-gray-100 text-gray-800' }
  }

  const handlePublishHomework = async (homeworkId, publish = true) => {
    try {
      const { error } = await supabase
        .from('subject_homework')
        .update({
          status: publish ? 'HW_PUB' : 'HW_DRF',
          published_at: publish ? new Date().toISOString() : null,
        })
        .eq('id', homeworkId)

      if (error) throw error
      fetchHomework()
    } catch (err) {
      console.error('Error publishing homework:', err)
      alert('Failed to update homework status')
    }
  }

  const handleCloseHomework = async (homeworkId) => {
    try {
      const { error } = await supabase
        .from('subject_homework')
        .update({
          status: 'HW_CLD',
          closed_at: new Date().toISOString(),
        })
        .eq('id', homeworkId)

      if (error) throw error
      fetchHomework()
    } catch (err) {
      console.error('Error closing homework:', err)
      alert('Failed to close homework')
    }
  }

  const handlePublishExam = async (examId, status) => {
    try {
      const updateData = {
        status,
        published_at: status === 'EX_SCH' ? new Date().toISOString() : null,
        opened_at: status === 'EX_OPN' ? new Date().toISOString() : null,
        closed_at: status === 'EX_CLS' ? new Date().toISOString() : null,
      }

      const { error } = await supabase
        .from('subject_exams')
        .update(updateData)
        .eq('id', examId)

      if (error) throw error
      fetchExams()
    } catch (err) {
      console.error('Error updating exam status:', err)
      alert('Failed to update exam status')
    }
  }

  const handleReleaseExamResults = async (examId) => {
    try {
      const { error } = await supabase
        .from('subject_exams')
        .update({
          status: 'EX_REL',
          results_released_at: new Date().toISOString(),
        })
        .eq('id', examId)

      if (error) throw error
      fetchExams()
    } catch (err) {
      console.error('Error releasing exam results:', err)
      alert('Failed to release exam results')
    }
  }

  const refetchMaterials = () => fetchMaterials(classes.map(c => c.id))

  const handleDeleteMaterial = async (materialId) => {
    if (!confirm('Are you sure you want to delete this material?')) return

    try {
      const { error } = await supabase
        .from('subject_materials')
        .delete()
        .eq('id', materialId)

      if (error) throw error
      refetchMaterials()
    } catch (err) {
      console.error('Error deleting material:', err)
      alert('Failed to delete material')
    }
  }

  const handleDeleteClassMaterial = async (materialId) => {
    if (!confirm('Are you sure you want to delete this material?')) return

    try {
      const { error } = await supabase
        .from('class_materials')
        .delete()
        .eq('id', materialId)

      if (error) throw error
      refetchMaterials()
    } catch (err) {
      console.error('Error deleting class material:', err)
      alert('Failed to delete material')
    }
  }

  const handleDeleteHomework = async (homeworkId) => {
    if (!confirm('Are you sure you want to delete this homework? All submissions will be deleted.')) return

    try {
      const { error } = await supabase
        .from('subject_homework')
        .delete()
        .eq('id', homeworkId)

      if (error) throw error
      fetchHomework()
    } catch (err) {
      console.error('Error deleting homework:', err)
      alert('Failed to delete homework')
    }
  }

  const handleDeleteExam = async (examId) => {
    if (!confirm('Are you sure you want to delete this exam? All submissions will be deleted.')) return

    try {
      const { error } = await supabase
        .from('subject_exams')
        .delete()
        .eq('id', examId)

      if (error) throw error
      fetchExams()
    } catch (err) {
      console.error('Error deleting exam:', err)
      alert('Failed to delete exam')
    }
  }

  const primaryClassId = classes[0]?.id
  const classIdForLinks = primaryClassId || 0

  const subjectName = subject ? getLocalizedName(subject, language === 'ar') : ''
  const semesterName = classes[0]?.semesters ? getLocalizedName(classes[0].semesters, language === 'ar') : ''

  const totalEnrolled = useMemo(
    () => classes.reduce((s, c) => s + (c.enrollmentCount || 0), 0),
    [classes]
  )

  const deliveryKey = useMemo(() => {
    const ty = classes[0]?.type
    if (ty === 'online') return 'courseTypeOnline'
    if (ty === 'hybrid') return 'courseTypeBlended'
    return 'courseTypeInPerson'
  }, [classes])

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
            <p className="text-red-700">{error || 'Subject not found or you are not assigned to teach any classes for this subject'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      {activeTab === 'home' ? (
        <InstructorSubjectHome
          subjectId={id}
          subjectCode={subject.code}
          subjectName={subjectName}
          classId={classIdForLinks}
          section={classes[0]?.section}
          semesterName={semesterName}
          totalEnrolled={totalEnrolled}
          deliveryKey={deliveryKey}
          coursePanel={coursePanel}
          onCoursePanelChange={setCoursePanel}
          onNewLesson={() => setCoursePanel(COURSE_PANEL.lessons)}
          onAnnouncement={() => setCoursePanel(COURSE_PANEL.communication)}
          onOpenWorkspace={() => {
            setActiveTab('overview')
            navigate(`/instructor/subjects/${id}?tab=overview`)
          }}
          mainContent={
            <>
              {coursePanel === COURSE_PANEL.sessions && (
                <InstructorSubjectSessionsPanel
                  subjectId={id}
                  classes={classes}
                  instructor={instructor}
                  onTakeAttendance={(cid) => {
                    setAttendanceClassId(cid)
                    fetchAttendance(cid)
                    setActiveTab('attendance')
                    navigate(`/instructor/subjects/${id}?tab=attendance`)
                  }}
                />
              )}
              {coursePanel === COURSE_PANEL.students && (
                <InstructorSubjectStudentsPanel classes={classes} />
              )}
              {coursePanel === COURSE_PANEL.curriculum && (
                <div style={{ maxHeight: '72vh', overflow: 'auto' }}>
                  <InstructorCurriculumMap embedded embedClassId={classIdForLinks} />
                </div>
              )}
              {coursePanel === COURSE_PANEL.lessons && (
                <div style={{ maxHeight: '72vh', overflow: 'auto' }}>
                  <InstructorBuildLesson embedded embedClassId={classIdForLinks} />
                </div>
              )}
              {coursePanel === COURSE_PANEL.questionBank && (
                <div style={{ maxHeight: '72vh', overflow: 'auto' }}>
                  <InstructorQuestionBank embedded embedClassId={classIdForLinks} />
                </div>
              )}
              {coursePanel === COURSE_PANEL.assessments && (
                <div style={{ maxHeight: '72vh', overflow: 'auto' }}>
                  <InstructorAssessmentAuthoring embedded embedClassId={classIdForLinks} />
                </div>
              )}
              {coursePanel === COURSE_PANEL.grades && (
                <div className="instructor-grade-embed-host">
                  <InstructorGradebook embedded embedClassId={classIdForLinks} />
                </div>
              )}
              {coursePanel === COURSE_PANEL.analytics && (
                <div style={{ maxHeight: '72vh', overflow: 'auto' }}>
                  <InstructorCourseAnalytics embedded embedClassId={classIdForLinks} />
                </div>
              )}
              {coursePanel === COURSE_PANEL.communication && (
                <div style={{ maxHeight: '72vh', overflow: 'auto' }}>
                  <InstructorCommunication embedded embedClassId={classIdForLinks} />
                </div>
              )}
              {coursePanel === COURSE_PANEL.integrity && (
                <div style={{ maxHeight: '72vh', overflow: 'auto' }}>
                  <InstructorIntegrityCases embedded embedClassId={classIdForLinks} />
                </div>
              )}
              {coursePanel === COURSE_PANEL.settings && (
                <div className="card">
                  <div className="card-hd">
                    <div className="card-title">{t('instructorPortal.subjectHome.tabSettings')}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-p"
                      onClick={() => navigate(`/academic/subjects/${id}/edit`)}
                    >
                      {t('instructorPortal.subjectHome.editSettings')}
                    </button>
                  </div>
                </div>
              )}
            </>
          }
        />
      ) : (
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
            <button
              onClick={() => navigate(`/academic/subjects/${id}/edit`)}
              className="flex items-center space-x-2 px-4 py-2 bg-primary-gradient text-white rounded-lg hover:shadow-lg transition-all"
            >
              <Settings className="w-4 h-4" />
              <span>{t('instructorPortal.subjectDetail.editSubject')}</span>
            </button>
          </div>

          {activeTab === 'attendance' ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50"
                onClick={() => {
                  setActiveTab('home')
                  setCoursePanel(COURSE_PANEL.sessions)
                  navigate(`/instructor/subjects/${id}`)
                }}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {t('instructorPortal.subjectDetail.attendance.backToCourse')}
              </button>
            </div>
          ) : (
            <div
              className="mt-4 -mx-4 sm:mx-0 border-b border-gray-200"
              role="tablist"
              aria-label={t('instructorPortal.subjectDetail.tablistAria', 'Course area')}
            >
              <div className="flex flex-nowrap overflow-x-auto overflow-y-hidden scroll-smooth px-3 sm:px-1 pb-px [scrollbar-width:thin]">
                {[
                  { id: 'home', label: t('instructorPortal.subjectHome.breadcrumbCourse'), icon: BookOpen },
                  { id: 'overview', label: t('instructorPortal.subjectDetail.tabs.overview'), icon: BookOpen },
                  { id: 'sessions', label: t('instructorPortal.subjectHome.tabSessions'), icon: Users },
                  { id: 'materials', label: t('instructorPortal.subjectDetail.tabs.materials'), icon: FolderOpen },
                  { id: 'homework', label: t('instructorPortal.subjectDetail.tabs.homework'), icon: FileText },
                  { id: 'exams', label: t('instructorPortal.subjectDetail.tabs.exams'), icon: GraduationCap },
                  { id: 'recordings', label: t('instructorPortal.subjectDetail.tabs.recordings'), icon: Video },
                  { id: 'attendance', label: t('instructorPortal.subjectDetail.tabs.attendance'), icon: Calendar },
                  { id: 'grades', label: t('instructorPortal.subjectDetail.tabs.grades'), icon: BarChart3 },
                  { id: 'forum', label: t('instructorPortal.subjectDetail.tabs.forum'), icon: MessageSquare },
                  { id: 'qa', label: t('instructorPortal.subjectDetail.tabs.qa'), icon: HelpCircle },
                ].map((tab) => {
                  const TabIcon = tab.icon
                  const isActive = activeTab === tab.id
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => {
                        setActiveTab(tab.id)
                        if (tab.id === 'home') {
                          navigate(`/instructor/subjects/${id}`)
                          return
                        }
                        navigate(`/instructor/subjects/${id}?tab=${tab.id}`)
                        if (tab.id === 'attendance' && classes.length > 0) {
                          fetchAttendance(classes[0].id)
                        }
                      }}
                      className={`inline-flex flex-shrink-0 items-center gap-2 whitespace-nowrap px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 transition-colors rounded-t-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/35 focus-visible:ring-offset-0 ${
                        isActive
                          ? 'border-primary-600 text-primary-600 bg-primary-50/60'
                          : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50/90'
                      }`}
                    >
                      <TabIcon className="h-4 w-4 flex-shrink-0 opacity-90" aria-hidden />
                      <span className="leading-tight">{tab.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">{t('instructorPortal.subjectDetail.overview.totalStudents')}</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {classes.reduce((sum, cls) => sum + (cls.enrollmentCount || 0), 0)}
                    </p>
                  </div>
                  <Users className="w-10 h-10 text-blue-500" />
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">{t('instructorPortal.subjectDetail.overview.activeClasses')}</p>
                    <p className="text-3xl font-bold text-gray-900">{classes.length}</p>
                  </div>
                  <BookOpen className="w-10 h-10 text-green-500" />
                </div>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">{t('instructorPortal.subjectDetail.overview.pendingGrading')}</p>
                    <p className="text-3xl font-bold text-gray-900">
                      {homework.reduce(
                        (sum, hw) => sum + Math.max(0, (hw.submissionCount || 0) - (hw.gradedCount || 0)),
                        0
                      ) +
                        exams.reduce(
                          (sum, exam) => sum + Math.max(0, (exam.submissionCount || 0) - (exam.gradedCount || 0)),
                          0
                        )}
                    </p>
                  </div>
                  <FileText className="w-10 h-10 text-yellow-500" />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">{t('instructorPortal.subjectDetail.overview.subjectInformation')}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-sm text-gray-600 mb-1">{t('instructorPortal.subjectDetail.overview.creditHours')}</p>
                  <p className="font-semibold text-gray-900">{subject.credit_hours}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">{t('instructorPortal.subjectDetail.overview.type')}</p>
                  <p className="font-semibold text-gray-900 capitalize">{subject.type}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">Semester</p>
                  <p className="font-semibold text-gray-900">Semester {subject.semester_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-1">College</p>
                  <p className="font-semibold text-gray-900">{subject.colleges?.name_en}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Sessions: scheduled sessions + Teams (merged) */}
        {activeTab === 'sessions' && (
          <InstructorSubjectSessionsPanel
            subjectId={id}
            classes={classes}
            instructor={instructor}
            onTakeAttendance={(cid) => {
              fetchAttendance(cid)
              setActiveTab('attendance')
            }}
          />
        )}

        {/* Materials Tab */}
        {activeTab === 'materials' && (
          <div className="space-y-6">
            {/* Subject materials (default) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Subject materials (default)</h2>
              <p className="text-sm text-gray-500 mb-4">Default materials for this subject, visible to all students.</p>
              {materials.length > 0 ? (
                <div className="space-y-3">
                  {materials.map(material => (
                    <div key={`s-${material.id}`} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                      <div className="flex items-center space-x-4">
                        {getContentTypeIcon(material.content_type_code)}
                        <div>
                          <p className="font-medium text-gray-900">{material.title}</p>
                          <p className="text-sm text-gray-600">
                            {material.subject_content_types?.name_en || material.content_type_code}
                            {!material.is_published && ' (Draft)'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => navigate(`/instructor/subjects/${id}/materials/${material.id}/edit`)}
                          className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteMaterial(material.id)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-6">No subject materials yet</p>
              )}
            </div>

            {/* Class materials (instructor-added) */}
            {instructor?.can_add_materials && classes.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Class materials</h2>
                    <p className="text-sm text-gray-500">Materials you added for your classes.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {classes.map(cls => (
                      <button
                        key={cls.id}
                        onClick={() => navigate(`/instructor/subjects/${id}/materials/create?classId=${cls.id}`)}
                        className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        Add for {cls.code || `Section ${cls.section}`}
                      </button>
                    ))}
                  </div>
                </div>
                {classMaterials.length > 0 ? (
                  <div className="space-y-3">
                    {classMaterials.map(material => (
                      <div key={`c-${material.id}`} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-gray-50">
                        <div className="flex items-center space-x-4">
                          {getContentTypeIcon(material.content_type_code)}
                          <div>
                            <p className="font-medium text-gray-900">{material.title}</p>
                            <p className="text-sm text-gray-600">
                              {material.subject_content_types?.name_en || material.content_type_code}
                              {material.classes && (
                                <span className="text-primary-600"> — {material.classes.code || `Section ${material.classes.section}`}</span>
                              )}
                              {!material.is_published && ' (Draft)'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => navigate(`/instructor/subjects/${id}/materials/${material.id}/edit?classId=${material.class_id}`)}
                            className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteClassMaterial(material.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-6">No class materials yet. Click above to add.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Homework Tab */}
        {activeTab === 'homework' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Homework Assignments</h2>
                <button
                  onClick={() => {
                    navigate(`/instructor/subjects/${id}/homework/create`)
                  }}
                  className="px-4 py-2 bg-primary-gradient text-white rounded-lg hover:shadow-lg transition-all flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Homework</span>
                </button>
              </div>
              {homework.length > 0 ? (
                <div className="space-y-4">
                  {homework.map(hw => {
                    const status = getHomeworkStatus(hw)
                    return (
                      <div key={hw.id} className="border border-gray-200 rounded-lg p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">{hw.title}</h3>
                            <p className="text-gray-600 mb-3">{hw.description}</p>
                            <div className="flex items-center space-x-4 text-sm text-gray-600">
                              <span>Due: {new Date(hw.due_date).toLocaleDateString()}</span>
                              <span>{hw.total_points} points</span>
                              <span>{hw.submissionCount || 0} submissions</span>
                              <span>{hw.gradedCount || 0} graded</span>
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${status.color}`}>
                            {status.label}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => {
                              navigate(`/instructor/subjects/${id}/homework/${hw.id}/submissions`)
                            }}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            View Submissions ({hw.submissionCount || 0})
                          </button>
                          {hw.status === 'HW_DRF' && (
                            <button
                              onClick={() => handlePublishHomework(hw.id, true)}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                            >
                              Publish
                            </button>
                          )}
                          {hw.status === 'HW_PUB' && (
                            <button
                              onClick={() => handleCloseHomework(hw.id)}
                              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                            >
                              Close
                            </button>
                          )}
                          <button
                            onClick={() => {
                              navigate(`/instructor/subjects/${id}/homework/${hw.id}/edit`)
                            }}
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteHomework(hw.id)}
                            className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
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
        {activeTab === 'exams' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Exams</h2>
                <button
                  onClick={() => {
                    navigate(`/instructor/subjects/${id}/exams/create`)
                  }}
                  className="px-4 py-2 bg-primary-gradient text-white rounded-lg hover:shadow-lg transition-all flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Exam</span>
                </button>
              </div>
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
                              <span>{new Date(exam.scheduled_date).toLocaleDateString()}</span>
                              <span>{exam.start_time} - {exam.end_time}</span>
                              <span>{exam.total_points} points</span>
                              <span>{exam.submissionCount || 0} submissions</span>
                              <span>{exam.gradedCount || 0} graded</span>
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-sm font-medium ${status.color}`}>
                            {status.label}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => {
                              navigate(`/instructor/subjects/${id}/exams/${exam.id}/submissions`)
                            }}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            View Submissions ({exam.submissionCount || 0})
                          </button>
                          {exam.status === 'EX_DRF' && (
                            <button
                              onClick={() => handlePublishExam(exam.id, 'EX_SCH')}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                            >
                              Schedule
                            </button>
                          )}
                          {exam.status === 'EX_SCH' && (
                            <button
                              onClick={() => handlePublishExam(exam.id, 'EX_OPN')}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                              Open Exam
                            </button>
                          )}
                          {exam.status === 'EX_OPN' && (
                            <>
                              <button
                                onClick={() => handlePublishExam(exam.id, 'EX_CLS')}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                              >
                                Close Exam
                              </button>
                              <button
                                onClick={() => handleReleaseExamResults(exam.id)}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                              >
                                Release Results
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => {
                              navigate(`/instructor/subjects/${id}/exams/${exam.id}/edit`)
                            }}
                            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteExam(exam.id)}
                            className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No exams created yet</p>
              )}
            </div>
          </div>
        )}

        {/* Recordings Tab */}
        {activeTab === 'recordings' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Recorded Lectures</h2>
                <button
                  onClick={() => {
                    navigate(`/instructor/subjects/${id}/recordings/create`)
                  }}
                  className="px-4 py-2 bg-primary-gradient text-white rounded-lg hover:shadow-lg transition-all flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Upload Recording</span>
                </button>
              </div>
              {recordings.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recordings.map(recording => (
                    <div key={recording.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="aspect-video bg-gray-200 rounded-lg mb-3 flex items-center justify-center">
                        <Video className="w-12 h-12 text-gray-400" />
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-1">{recording.title}</h3>
                      <p className="text-sm text-gray-600 mb-3">{new Date(recording.recorded_date).toLocaleDateString()}</p>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => {
                            navigate(`/instructor/subjects/${id}/recordings/${recording.id}/edit`)
                          }}
                          className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Delete this recording?')) {
                              supabase.from('subject_recordings').delete().eq('id', recording.id).then(() => fetchRecordings())
                            }
                          }}
                          className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No recordings uploaded yet</p>
              )}
            </div>
          </div>
        )}

        {/* Attendance Tab */}
        {activeTab === 'attendance' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {t('instructorPortal.subjectDetail.attendance.pageTitle')}
              </h2>
              {classes.length > 0 ? (
                <div className="space-y-4">
                  {attendanceClassId != null && !canEditAttendanceForClass(attendanceClassId) && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                      {t('instructorPortal.subjectDetail.attendance.editingLocked')}
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Class</label>
                    <select
                      value={attendanceClassId != null ? String(attendanceClassId) : ''}
                      onChange={(e) => {
                        const raw = e.target.value
                        const v = raw === '' ? null : Number(raw)
                        setAttendanceClassId(Number.isFinite(v) ? v : null)
                        if (v != null && Number.isFinite(v)) fetchAttendance(v)
                      }}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">{t('instructorPortal.subjectDetail.attendance.selectClass')}</option>
                      {classes.map(cls => (
                        <option key={cls.id} value={cls.id}>
                          {cls.code} - Section {cls.section} ({cls.enrollmentCount || 0} students)
                        </option>
                      ))}
                    </select>
                  </div>

                  {attendanceClassId != null && (
                    <InstructorAttendanceSessionTake
                      key={String(attendanceClassId)}
                      classId={attendanceClassId}
                      classRow={classes.find((c) => String(c.id) === String(attendanceClassId))}
                      canSave={canEditAttendanceForClass(attendanceClassId)}
                      platformUserId={platformUserId}
                      onSaved={() => fetchAttendance(attendanceClassId)}
                    />
                  )}

                  {attendance.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Recent Attendance Records</h3>
                      <div className="space-y-2">
                        {attendance.slice(0, 20).map(record => {
                          const statusIcons = {
                            present: <CheckCircle className="w-5 h-5 text-green-600" />,
                            absent: <XCircle className="w-5 h-5 text-red-600" />,
                            late: <Clock className="w-5 h-5 text-yellow-600" />,
                            excused: <AlertCircle className="w-5 h-5 text-blue-600" />,
                          }
                          return (
                            <div key={record.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                              <div className="flex items-center space-x-4">
                                {statusIcons[record.status] || <XCircle className="w-5 h-5 text-gray-600" />}
                                <div>
                                  <p className="font-medium text-gray-900">{record.students?.name_en || 'Unknown'}</p>
                                  <p className="text-sm text-gray-600">
                                    {new Date(record.date).toLocaleDateString()} - {record.status}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                disabled={!canEditAttendanceForClass(record.class_id)}
                                onClick={() => openAttendanceEdit(record)}
                                className="px-3 py-1 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {t('instructorPortal.subjectDetail.attendance.edit')}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {attendanceClassId == null && (
                    <p className="text-gray-500 text-center py-8">{t('instructorPortal.subjectDetail.attendance.emptyHint')}</p>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No classes available. Create a class first.</p>
              )}
            </div>
          </div>
        )}

        {/* Grades Tab */}
        {activeTab === 'grades' && (
          <div className="instructor-portal instructor-grade-embed-host">
            <InstructorGradebook embedded embedClassId={classIdForLinks} />
          </div>
        )}

        {/* Forum Tab */}
        {activeTab === 'forum' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">{t('instructorPortal.subjectDetail.forum.title')}</h2>
              {forumPosts.length > 0 ? (
                <div className="space-y-3">
                  {forumPosts.map(post => (
                    <div key={post.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{post.title || 'Untitled'}</h3>
                          <p className="text-sm text-gray-600">{new Date(post.created_at).toLocaleString()}</p>
                        </div>
                        <div className="flex items-center flex-wrap gap-2">
                          {post.is_pinned && (
                            <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                              {t('instructorPortal.subjectDetail.forum.pinned')}
                            </span>
                          )}
                          {post.is_locked && (
                            <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded">
                              {t('instructorPortal.subjectDetail.forum.locked')}
                            </span>
                          )}
                          <button
                            type="button"
                            disabled={forumActionId === post.id}
                            onClick={() => toggleForumPost(post, 'is_pinned')}
                            className="px-2 py-1 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1"
                          >
                            <Pin className="w-3.5 h-3.5" />
                            {post.is_pinned ? t('instructorPortal.subjectDetail.forum.unpin') : t('instructorPortal.subjectDetail.forum.pin')}
                          </button>
                          <button
                            type="button"
                            disabled={forumActionId === post.id}
                            onClick={() => toggleForumPost(post, 'is_locked')}
                            className="px-2 py-1 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 inline-flex items-center gap-1"
                          >
                            <Lock className="w-3.5 h-3.5" />
                            {post.is_locked ? t('instructorPortal.subjectDetail.forum.unlock') : t('instructorPortal.subjectDetail.forum.lock')}
                          </button>
                        </div>
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
                <p className="text-gray-500 text-center py-8">{t('instructorPortal.subjectDetail.forum.empty')}</p>
              )}
            </div>
          </div>
        )}

        {/* Q&A Tab */}
        {activeTab === 'qa' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">{t('instructorPortal.subjectDetail.qa.title')}</h2>
              {questions.length > 0 ? (
                <div className="space-y-4">
                  {questions.map(question => (
                    <div key={question.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="mb-3">
                        <p className="font-semibold text-gray-900 mb-2">
                          {t('instructorPortal.subjectDetail.qa.questionPrefix')} {question.question_text}
                        </p>
                        <p className="text-xs text-gray-500">
                          {t('instructorPortal.subjectDetail.qa.askedOn')} {new Date(question.created_at).toLocaleString()}
                        </p>
                      </div>
                      {question.answer_text ? (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="font-semibold text-gray-900 mb-2">
                            {t('instructorPortal.subjectDetail.qa.answerPrefix')} {question.answer_text}
                          </p>
                          <p className="text-xs text-gray-500">
                            {t('instructorPortal.subjectDetail.qa.answeredOn')} {new Date(question.answered_at).toLocaleString()}
                          </p>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openAnswerModal(question)}
                          className="mt-3 px-4 py-2 bg-primary-gradient text-white rounded-lg hover:shadow-lg transition-all"
                        >
                          {t('instructorPortal.subjectDetail.qa.answerButton')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">{t('instructorPortal.subjectDetail.qa.empty')}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
      )}

      {attendanceEditRecord && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-gray-900">{t('instructorPortal.subjectDetail.attendance.editTitle')}</h3>
              <button
                type="button"
                className="p-1 rounded hover:bg-gray-100"
                onClick={() => setAttendanceEditRecord(null)}
                aria-label={t('instructorPortal.subjectDetail.modalClose')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">{t('instructorPortal.subjectDetail.attendance.status')}</label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  value={attendanceForm.status}
                  onChange={(e) => setAttendanceForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="present">{t('instructorPortal.subjectDetail.attendance.statusPresent')}</option>
                  <option value="absent">{t('instructorPortal.subjectDetail.attendance.statusAbsent')}</option>
                  <option value="late">{t('instructorPortal.subjectDetail.attendance.statusLate')}</option>
                  <option value="excused">{t('instructorPortal.subjectDetail.attendance.statusExcused')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">{t('instructorPortal.subjectDetail.attendance.notes')}</label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  rows={3}
                  value={attendanceForm.notes}
                  onChange={(e) => setAttendanceForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="px-4 py-2 border border-gray-300 rounded-lg"
                  onClick={() => setAttendanceEditRecord(null)}
                >
                  {t('instructorPortal.subjectDetail.attendance.cancel')}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 bg-primary-gradient text-white rounded-lg disabled:opacity-50"
                  onClick={saveAttendanceEdit}
                  disabled={!platformUserId}
                >
                  {t('instructorPortal.subjectDetail.attendance.save')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {answerModalQuestion && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-bold text-gray-900">{t('instructorPortal.subjectDetail.qa.answerModalTitle')}</h3>
              <button
                type="button"
                className="p-1 rounded hover:bg-gray-100"
                onClick={() => setAnswerModalQuestion(null)}
                aria-label={t('instructorPortal.subjectDetail.modalClose')}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-gray-700 mb-3">{answerModalQuestion.question_text}</p>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 rounded-lg mb-4"
              rows={5}
              placeholder={t('instructorPortal.subjectDetail.qa.answerPlaceholder')}
              value={answerDraft}
              onChange={(e) => setAnswerDraft(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 border border-gray-300 rounded-lg"
                onClick={() => setAnswerModalQuestion(null)}
              >
                {t('instructorPortal.subjectDetail.attendance.cancel')}
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-primary-gradient text-white rounded-lg disabled:opacity-50"
                onClick={submitQuestionAnswer}
                disabled={answerSaving || !answerDraft.trim()}
              >
                {answerSaving ? '…' : t('instructorPortal.subjectDetail.qa.submitAnswer')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

