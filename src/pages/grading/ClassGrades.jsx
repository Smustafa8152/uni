import { useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { getGradingScaleFromUniversitySettings, getGradeTypesFromUniversitySettings, mergeGradeConfigWithTypes, GRADE_COMPONENT_DB_COLUMNS } from '../../utils/getCollegeSettings'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { writeGradeAuditLog } from '../../utils/gradeAudit'
import { RECORD_STATUS_OPTIONS } from '../../utils/gradeAssessmentGroups'
import { ArrowLeft, ArrowRight, Save, Check, FileText, Users } from 'lucide-react'

export default function ClassGrades() {
  const { t, i18n } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabicLayout =
    isRTL ||
    language === 'ar' ||
    i18n?.language?.toLowerCase()?.startsWith('ar') ||
    (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl')
  const { classId } = useParams()
  const [searchParams] = useSearchParams()
  const enrollmentIdParam = searchParams.get('enrollmentId')
  const singleEnrollmentId = enrollmentIdParam ? Number(enrollmentIdParam) : null
  const navigate = useNavigate()
  const { userRole, collegeId: authCollegeId, user } = useAuth()
  const [appUserId, setAppUserId] = useState(null)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [classData, setClassData] = useState(null)
  const [enrollments, setEnrollments] = useState([])
  const [grades, setGrades] = useState({}) // enrollment_id -> grade data
  const [gradingScale, setGradingScale] = useState([])
  const [gradeConfiguration, setGradeConfiguration] = useState([])

  useEffect(() => {
    fetchClassData()
    fetchEnrollments()
  }, [classId])

  useEffect(() => {
    if (!user?.email) return
    supabase
      .from('users')
      .select('id')
      .ilike('email', user.email)
      .maybeSingle()
      .then(({ data }) => data?.id && setAppUserId(data.id))
  }, [user?.email])

  const fetchClassData = async () => {
    try {
      const { data, error } = await supabase
        .from('classes')
        .select(`
          *,
          subjects(id, name_en, name_ar, code, grade_configuration),
          semesters(id, name_en, name_ar, code),
          instructors(id, name_en, name_ar),
          colleges(id, name_en, name_ar)
        `)
        .eq('id', classId)
        .single()

      if (error) throw error
      setClassData(data)

      // Extract grade configuration from subject and merge with grade types (max/min/pass/fail from university)
      const subjectConfig = data?.subjects?.grade_configuration && Array.isArray(data.subjects.grade_configuration)
        ? data.subjects.grade_configuration
        : []
      const gradeTypes = await getGradeTypesFromUniversitySettings()
      const mergedConfig = mergeGradeConfigWithTypes(subjectConfig, gradeTypes)
      setGradeConfiguration(mergedConfig)

      // Grading scale comes from university settings
      const scale = await getGradingScaleFromUniversitySettings()
      setGradingScale(scale)
    } catch (err) {
      console.error('Error fetching class data:', err)
      setError(err.message || t('grading.classGrades.failedToLoad'))
    } finally {
      setFetching(false)
    }
  }

  const fetchEnrollments = async () => {
    try {
      const { data, error } = await supabase
        .from('enrollments')
        .select(`
          *,
          students(id, student_id, name_en, name_ar, first_name, last_name, first_name_ar, last_name_ar)
        `)
        .eq('class_id', classId)
        .eq('status', 'enrolled')
        .order('students(name_en)')

      if (error) throw error
      setEnrollments(data || [])

      // Fetch existing grades
      if (data && data.length > 0) {
        const enrollmentIds = data.map(e => e.id)
        const { data: gradesData, error: gradesError } = await supabase
          .from('grade_components')
          .select('*')
          .in('enrollment_id', enrollmentIds)

        if (!gradesError && gradesData) {
          const gradesMap = {}
          gradesData.forEach(grade => {
            gradesMap[grade.enrollment_id] = grade
          })
          setGrades(gradesMap)
        }
      }
    } catch (err) {
      console.error('Error fetching enrollments:', err)
      setError(err.message || t('grading.classGrades.failedToLoadEnrollments'))
    }
  }

  const calculateNumericGrade = (gradeData) => {
    if (gradeConfiguration.length === 0) {
      // Fallback to old calculation if no grade configuration
      const components = [
        gradeData.midterm || 0,
        gradeData.final || 0,
        gradeData.assignments || 0,
        gradeData.quizzes || 0,
        gradeData.class_participation || 0,
        gradeData.project || 0,
        gradeData.lab || 0,
        gradeData.other || 0,
      ]
      const nonZero = components.filter(c => c > 0)
      if (nonZero.length === 0) return null
      const sum = components.reduce((a, b) => a + b, 0)
      return Math.min(100, Math.max(0, sum))
    }

    // Calculate based on grade configuration with weights
    let totalWeightedScore = 0
    let totalWeight = 0

    gradeConfiguration.forEach(config => {
      const fieldName = config.dbColumn || `grade_${(config.grade_type_code || '').toLowerCase().replace(/\s+/g, '_')}`
      const score = gradeData[fieldName] ?? gradeData[config.dbColumn] ?? 0
      const weight = config.weight || 0

      if (score > 0 && weight > 0) {
        // Normalize score to percentage if needed (assuming max is the maximum score)
        const maxScore = config.maximum || 100
        const normalizedScore = (score / maxScore) * 100
        totalWeightedScore += normalizedScore * (weight / 100)
        totalWeight += weight / 100
      }
    })

    if (totalWeight === 0) return null
    return Math.min(100, Math.max(0, (totalWeightedScore / totalWeight) * 100))
  }

  const validateGradeValue = (value, config) => {
    if (value === null || value === undefined || value === '') return null
    
    const parsedValue = parseFloat(value)
    if (isNaN(parsedValue)) return null
    
    // Validate minimum
    if (config.minimum !== null && config.minimum !== undefined && parsedValue < config.minimum) {
      return `${t('grading.classGrades.valueTooLow')}: ${config.grade_type_name_en} ${t('grading.classGrades.minimum')} ${config.minimum}`
    }
    
    // Validate maximum
    if (config.maximum !== null && config.maximum !== undefined && parsedValue > config.maximum) {
      return `${t('grading.classGrades.valueTooHigh')}: ${config.grade_type_name_en} ${t('grading.classGrades.maximum')} ${config.maximum}`
    }
    
    return null // No error
  }

  const handleGradeChange = (enrollmentId, field, value) => {
    setGrades(prev => {
      const current = prev[enrollmentId] || {
        enrollment_id: enrollmentId,
        class_id: parseInt(classId),
        student_id: enrollments.find(e => e.id === enrollmentId)?.student_id,
        semester_id: classData?.semester_id,
        college_id: classData?.college_id,
        status: 'draft',
      }
      
      let parsedValue = value ? parseFloat(value) : null
      
      // Validate against grade configuration if it exists
      if (gradeConfiguration.length > 0 && parsedValue !== null && !isNaN(parsedValue)) {
        const gradeConfigFields = gradeConfiguration.map(gc => gc.dbColumn || `grade_${(gc.grade_type_code || '').toLowerCase().replace(/\s+/g, '_')}`)
        
        if (gradeConfigFields.includes(field)) {
          const config = gradeConfiguration.find(gc => (gc.dbColumn || `grade_${(gc.grade_type_code || '').toLowerCase().replace(/\s+/g, '_')}`) === field)
          
          if (config) {
            const validationError = validateGradeValue(value, config)
            if (validationError) {
              setError(validationError)
              // Still allow the value to be entered, but show error
              // User can correct it
            } else {
              // Clear error if validation passes
              if (error) setError('')
            }
          }
        }
      } else if (error && gradeConfiguration.length === 0) {
        // Clear error if no grade configuration
        setError('')
      }
      
      const updated = {
        ...current,
        [field]: parsedValue,
      }
      
      // Recalculate numeric grade if components changed
      const gradeConfigFields = gradeConfiguration.map(gc => gc.dbColumn || `grade_${(gc.grade_type_code || '').toLowerCase().replace(/\s+/g, '_')}`)
      const allGradeFields = ['midterm', 'final', 'assignments', 'quizzes', 'class_participation', 'project', 'lab', 'other', ...gradeConfigFields]
      
      if (allGradeFields.includes(field)) {
        const numericGrade = calculateNumericGrade(updated)
        if (numericGrade !== null) {
          updated.numeric_grade = numericGrade
          // Letter grade and GPA will be calculated by trigger
        }
      }
      
      return {
        ...prev,
        [enrollmentId]: updated,
      }
    })
  }

  const handleGradeBlur = (enrollmentId, field, value) => {
    if (gradeConfiguration.length > 0 && value) {
      const gradeConfigFields = gradeConfiguration.map(gc => gc.dbColumn || `grade_${(gc.grade_type_code || '').toLowerCase().replace(/\s+/g, '_')}`)
      
      if (gradeConfigFields.includes(field)) {
        const config = gradeConfiguration.find(gc => (gc.dbColumn || `grade_${(gc.grade_type_code || '').toLowerCase().replace(/\s+/g, '_')}`) === field)
        
        if (config) {
          const validationError = validateGradeValue(value, config)
          if (validationError) {
            setError(validationError)
          } else {
            setError('')
          }
        }
      }
    }
  }

  const handleRecordStatusChange = (enrollmentId, recordStatus) => {
    setGrades((prev) => ({
      ...prev,
      [enrollmentId]: {
        ...(prev[enrollmentId] || {}),
        record_status: recordStatus,
      },
    }))
  }

  const handleStatusChange = (enrollmentId, status) => {
    setGrades(prev => ({
      ...prev,
      [enrollmentId]: {
        ...(prev[enrollmentId] || {}),
        status,
      },
    }))
  }

  const handleSave = async () => {
    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      const gradesToSave = Object.values(grades).filter(g => g.enrollment_id)
      
      const allowedKeys = new Set([
        'enrollment_id', 'class_id', 'student_id', 'semester_id', 'college_id',
        ...GRADE_COMPONENT_DB_COLUMNS,
        'numeric_grade', 'letter_grade', 'gpa_points', 'status', 'notes', 'record_status',
        'graded_by', 'graded_at', 'approved_by', 'approved_at', 'updated_at',
      ])
      for (const grade of gradesToSave) {
        const { enrollment_id, ...rest } = grade
        const gradeData = {}
        Object.keys(rest).forEach((key) => {
          const dbKey = key.startsWith('grade_') && GRADE_COMPONENT_DB_COLUMNS.includes(key.slice(7))
            ? key.slice(7)
            : key
          if (allowedKeys.has(dbKey) && rest[key] !== undefined) gradeData[dbKey] = rest[key]
        })
        gradeData.enrollment_id = enrollment_id
        gradeData.updated_at = new Date().toISOString()
        // RLS requires class_id, student_id, semester_id, college_id — ensure they are set
        const enrollment = enrollments.find((e) => e.id === enrollment_id)
        const classCollegeId = classData?.college_id ?? classData?.colleges?.id ?? null
        const classSemesterId = classData?.semester_id ?? classData?.semesters?.id ?? null
        if (classData) {
          if (gradeData.class_id == null) gradeData.class_id = classData.id
          if (gradeData.semester_id == null) gradeData.semester_id = classSemesterId
          if (gradeData.college_id == null) gradeData.college_id = classCollegeId
        }
        if (enrollment && gradeData.student_id == null) gradeData.student_id = enrollment.student_id
        if (gradeData.college_id == null) gradeData.college_id = classCollegeId ?? enrollment?.college_id ?? authCollegeId ?? null
        if (gradeData.semester_id == null) gradeData.semester_id = classSemesterId ?? enrollment?.semester_id ?? null

        const { data: oldRow } = await supabase
          .from('grade_components')
          .select('*')
          .eq('enrollment_id', enrollment_id)
          .maybeSingle()

        const { data: savedRow, error: upsertError } = await supabase
          .from('grade_components')
          .upsert(gradeData, {
            onConflict: 'enrollment_id',
          })
          .select()
          .single()

        if (upsertError) throw upsertError

        await writeGradeAuditLog({
          oldRow,
          newRow: savedRow,
          enrollmentId: enrollment_id,
          classId: parseInt(classId, 10),
          gradeComponentId: savedRow?.id,
          userId: appUserId,
          changeSource: 'admin_override',
        })
      }

      setSuccess(true)
      setTimeout(() => {
        setSuccess(false)
      }, 3000)
    } catch (err) {
      setError(err.message || t('grading.classGrades.failedToSave'))
      console.error('Error saving grades:', err)
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

  const backTo = userRole === 'instructor' && classId
    ? `/instructor/gradebook?classId=${classId}`
    : '/grading'

  // When instructor opens grade entry for one student, show only that enrollment
  const displayEnrollments =
    userRole === 'instructor' && singleEnrollmentId
      ? enrollments.filter((e) => e.id === singleEnrollmentId)
      : enrollments
  const singleStudentMode = userRole === 'instructor' && singleEnrollmentId && displayEnrollments.length === 1
  const displayStudentName = (student) => {
    if (!student) return ''
    if (isArabicLayout) {
      const ar = [student.first_name_ar, student.last_name_ar].filter(Boolean).join(' ').trim()
      if (ar) return ar
      if (student.name_ar?.trim()) return student.name_ar.trim()
    }
    if (student.name_en?.trim()) return student.name_en.trim()
    return `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.student_id
  }

  const singleStudentName =
    singleStudentMode && displayEnrollments[0]?.students
      ? displayStudentName(displayEnrollments[0].students)
      : ''

  return (
    <div className="space-y-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
      <div className="flex items-center justify-between gap-4">
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className={`flex items-center gap-2 text-gray-600 hover:text-gray-900 ${isArabicLayout ? 'flex-row-reverse' : ''}`}
        >
          {isArabicLayout ? <ArrowRight className="w-5 h-5 shrink-0" /> : <ArrowLeft className="w-5 h-5 shrink-0" />}
          <span>{t('grading.classGrades.back')}</span>
        </button>
        <h1 className={`text-3xl font-bold text-gray-900 flex-1 ${isArabicLayout ? 'text-right' : 'text-center'}`}>
          {t('grading.classGrades.title')}
        </h1>
        <div className="w-10 shrink-0" aria-hidden />
      </div>

      {/* Class Info */}
      {classData && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
          <div className={`w-full ${isArabicLayout ? 'flex justify-end' : ''}`}>
            <div
              className={`grid grid-cols-1 md:grid-cols-3 gap-4 w-full ${isArabicLayout ? 'max-w-3xl justify-items-end' : ''}`}
              dir={isArabicLayout ? 'rtl' : 'ltr'}
            >
              <div>
                <h3 className={`text-sm font-medium text-gray-500 mb-1 ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.classGrades.classCode')}</h3>
                <p className={`text-lg font-semibold text-gray-900 ${isArabicLayout ? 'text-right' : 'text-left'}`}>{classData.code}</p>
              </div>
              <div>
                <h3 className={`text-sm font-medium text-gray-500 mb-1 ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.classGrades.subject')}</h3>
                <p className={`text-lg font-semibold text-gray-900 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
                  {getLocalizedName(classData.subjects, isArabicLayout) || 'N/A'}
                </p>
              </div>
              <div>
                <h3 className={`text-sm font-medium text-gray-500 mb-1 ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.classGrades.instructorLabel')}</h3>
                <p className={`text-lg font-semibold text-gray-900 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
                  {getLocalizedName(classData.instructors, isArabicLayout) || t('grading.classGrades.tba')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grading Scale Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4" dir={isArabicLayout ? 'rtl' : 'ltr'}>
        <h3 className={`text-sm font-medium text-blue-900 mb-2 ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.classGrades.gradingScale')}</h3>
        <div className="flex flex-wrap gap-2 justify-start">
          {gradingScale.map((scale, idx) => (
            <span
              key={idx}
              className="px-3 py-1 bg-white rounded-lg text-sm font-medium text-blue-700 border border-blue-200"
              dir={isArabicLayout ? 'rtl' : 'ltr'}
            >
              {t('grading.classGrades.scaleBadge', {
                letter: scale.letter,
                min: scale.minPercent,
                max: scale.maxPercent,
                points: scale.points,
              })}
            </span>
          ))}
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className={`bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 flex items-center ${isArabicLayout ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
          <Check className="w-5 h-5" />
          <span>{t('grading.classGrades.savedSuccess')}</span>
        </div>
      )}

      {/* Single-student mode: show who we're grading and link back to gradebook */}
      {singleStudentMode && (
        <div className={`flex flex-wrap items-center gap-3 mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
          <span className="text-sm font-medium text-blue-900">
            {t('grading.classGrades.enteringGradesFor')}: <strong>{singleStudentName}</strong>
          </span>
          <button
            type="button"
            onClick={() => navigate(backTo)}
            className="text-sm font-medium text-blue-700 hover:text-blue-900 underline"
          >
            {t('grading.classGrades.backToGradebook')}
          </button>
        </div>
      )}

      {/* Grade Entry Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className={`text-xl font-bold text-gray-900 ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.classGrades.gradeEntry')}</h2>
          <p className={`text-sm text-gray-600 mt-1 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
            {singleStudentMode ? t('grading.classGrades.gradeEntrySingleStudent') : t('grading.classGrades.gradeEntryDesc')}
          </p>
        </div>

        {displayEnrollments.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>{t('grading.classGrades.noEnrolledStudents')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" dir={isArabicLayout ? 'rtl' : 'ltr'}>
              <thead className="bg-gray-50">
                <tr>
                  <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.classGrades.student')}</th>
                  <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.classGrades.numericGrade')}</th>
                  <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.classGrades.letterGrade')}</th>
                  <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.classGrades.gpaPoints')}</th>
                  {gradeConfiguration.length > 0 ? (
                    gradeConfiguration.map((config) => (
                      <th key={config.grade_type_id} className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>
                        {getLocalizedName(
                          { name_en: config.grade_type_name_en, name_ar: config.grade_type_name_ar },
                          isArabicLayout
                        ) || config.grade_type_name_en}{' '}
                        {config.weight ? `(${config.weight}%)` : ''}
                      </th>
                    ))
                  ) : (
                    <>
                      <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.classGrades.midterm')}</th>
                      <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.classGrades.final')}</th>
                      <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.classGrades.assignments')}</th>
                      <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.classGrades.quizzes')}</th>
                      <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.classGrades.classParticipation')}</th>
                    </>
                  )}
                  <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.classGrades.notes')}</th>
                  <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('grading.classGrades.status')}</th>
                  <th className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}>{t('instructorPortal.recordStatusLabel', 'Record status')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayEnrollments.map((enrollment) => {
                  const grade = grades[enrollment.id] || {}
                  const student = enrollment.students
                  return (
                    <tr key={enrollment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {displayStudentName(student)}
                          </div>
                          <div className="text-sm text-gray-500">{student?.student_id}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={grade.numeric_grade || ''}
                          onChange={(e) => handleGradeChange(enrollment.id, 'numeric_grade', e.target.value)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                          placeholder="-"
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900">
                          {grade.letter_grade || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900">
                          {grade.gpa_points || '-'}
                        </span>
                      </td>
                      {gradeConfiguration.length > 0 ? (
                        gradeConfiguration.map((config) => {
                          const fieldName = config.dbColumn || `grade_${(config.grade_type_code || '').toLowerCase().replace(/\s+/g, '_')}`
                          const maxValue = config.maximum || 100
                          const minValue = config.minimum || 0
                          const value = grade[fieldName] ?? grade[config.dbColumn] ?? ''
                          return (
                            <td key={config.grade_type_id} className="px-6 py-4 whitespace-nowrap">
                              <input
                                type="number"
                                step="0.01"
                                min={minValue}
                                max={maxValue}
                                value={value || ''}
                                onChange={(e) => handleGradeChange(enrollment.id, fieldName, e.target.value)}
                                onBlur={(e) => handleGradeBlur(enrollment.id, fieldName, e.target.value)}
                                className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                                placeholder="-"
                                title={`${t('grading.classGrades.maximum')}: ${maxValue}, ${t('grading.classGrades.pass')}: ${config.pass_score || 'N/A'}, ${t('grading.classGrades.fail')}: ${config.fail_score || 'N/A'}, ${t('grading.classGrades.minimum')}: ${minValue}`}
                              />
                            </td>
                          )
                        })
                      ) : (
                        <>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={grade.midterm || ''}
                              onChange={(e) => handleGradeChange(enrollment.id, 'midterm', e.target.value)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                              placeholder="-"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={grade.final || ''}
                              onChange={(e) => handleGradeChange(enrollment.id, 'final', e.target.value)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                              placeholder="-"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={grade.assignments || ''}
                              onChange={(e) => handleGradeChange(enrollment.id, 'assignments', e.target.value)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                              placeholder="-"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={grade.quizzes || ''}
                              onChange={(e) => handleGradeChange(enrollment.id, 'quizzes', e.target.value)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                              placeholder="-"
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="100"
                              value={grade.class_participation || ''}
                              onChange={(e) => handleGradeChange(enrollment.id, 'class_participation', e.target.value)}
                              className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                              placeholder="-"
                            />
                          </td>
                        </>
                      )}
                      <td className="px-6 py-4">
                        <input
                          type="text"
                          value={grade.notes || ''}
                          onChange={(e) => handleGradeChange(enrollment.id, 'notes', e.target.value)}
                          className="w-32 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 text-sm"
                          placeholder={t('grading.classGrades.notesPlaceholder')}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          value={grade.status || 'draft'}
                          onChange={(e) => handleStatusChange(enrollment.id, e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 text-sm"
                        >
                          <option value="draft">{t('grading.classGrades.draft')}</option>
                          <option value="submitted">{t('grading.classGrades.submitted')}</option>
                          <option value="approved">{t('grading.classGrades.approved')}</option>
                          <option value="final">{t('grading.classGrades.finalStatus')}</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          value={grade.record_status || 'not_recorded'}
                          onChange={(e) => handleRecordStatusChange(enrollment.id, e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 text-sm"
                        >
                          {RECORD_STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>
                              {t(`instructorPortal.recordStatus.${s}`, s)}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className={`p-6 border-t border-gray-200 flex ${isArabicLayout ? 'justify-start' : 'justify-end'}`}>
          <button
            onClick={handleSave}
            disabled={loading}
            className={`flex items-center ${isArabicLayout ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-6 py-2 bg-primary-gradient text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <Save className="w-5 h-5" />
            <span>{loading ? t('grading.classGrades.saving') : t('grading.classGrades.saveGrades')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}



