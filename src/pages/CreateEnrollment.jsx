import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../contexts/LanguageContext'
import { getSemesterCreditsFromUniversitySettings } from '../utils/getCollegeSettings'
import { getLocalizedName } from '../utils/localizedName'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useCollege } from '../contexts/CollegeContext'
import { buildStudentSearchOrFilter } from '../utils/studentSearchQuery'
import { ArrowLeft, ArrowRight, Check, Calendar, User, BookOpen, FileCheck, Building2 } from 'lucide-react'
import { resolveEffectiveCollegeId, hasUniversityWideScope } from '../utils/menuPermissions'

export default function CreateEnrollment() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { userRole, collegeId: authCollegeId, departmentId } = useAuth()
  const { selectedCollegeId, requiresCollegeSelection, colleges, setSelectedCollegeId } = useCollege()
  const collegeId = resolveEffectiveCollegeId(userRole, authCollegeId, selectedCollegeId)
  const universityWide = hasUniversityWideScope(userRole, authCollegeId)

  // Get student and semester from URL params
  const studentIdFromUrl = searchParams.get('student')
  const semesterIdFromUrl = searchParams.get('semester')

  const steps = [
    { id: 1, name: t('enrollments.selectSemester'), icon: Calendar },
    { id: 2, name: t('enrollments.step2'), icon: User },
    { id: 3, name: t('enrollments.step3'), icon: BookOpen },
    { id: 4, name: t('enrollments.step4'), icon: FileCheck },
  ]
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const [academicYears, setAcademicYears] = useState([])
  const [semesters, setSemesters] = useState([])
  const [students, setStudents] = useState([])
  const [classes, setClasses] = useState([])
  const [selectedClass, setSelectedClass] = useState(null)
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentSearch, setStudentSearch] = useState('')
  const [validationWarnings, setValidationWarnings] = useState([])
  const [validationErrors, setValidationErrors] = useState([])
  const [currentSemesterCredits, setCurrentSemesterCredits] = useState(0)
  const [studentMajorSheet, setStudentMajorSheet] = useState(null)
  const [currentSemester, setCurrentSemester] = useState(null)
  const [semesterCreditsFromUni, setSemesterCreditsFromUni] = useState({
    min_credit_hours: 12,
    max_credit_hours: 18,
    max_credit_hours_with_permission: 21,
    min_gpa_for_max_credits: 3.0,
  })
  const [selectedStudentCollegeId, setSelectedStudentCollegeId] = useState(null)

  const [formData, setFormData] = useState({
    academic_year_id: '',
    semester_id: semesterIdFromUrl || '',
    student_id: studentIdFromUrl || '',
    class_ids: [], // Changed to array for multiple selection
    status: 'enrolled',
  })
  const [courseGroups, setCourseGroups] = useState([]) // Store course groups for validation

  // When admin has semester in URL but no college selected, fetch that semester and set college so semesters load
  useEffect(() => {
    if (semesterIdFromUrl && !collegeId && universityWide && setSelectedCollegeId) {
      const run = async () => {
        const { data } = await supabase
          .from('semesters')
          .select('college_id')
          .eq('id', parseInt(semesterIdFromUrl, 10))
          .single()
        if (data?.college_id) setSelectedCollegeId(data.college_id)
      }
      run()
    }
  }, [semesterIdFromUrl, collegeId, universityWide, setSelectedCollegeId])

  useEffect(() => {
    if (collegeId) {
      fetchAcademicYears()
      fetchSemesters()
    } else {
      setAcademicYears([])
      setSemesters([])
    }
  }, [collegeId, userRole])

  // Pre-fill student and semester if provided via URL params
  useEffect(() => {
    if (semesterIdFromUrl && semesters.length > 0) {
      const semesterExists = semesters.find(s => s.id.toString() === semesterIdFromUrl)
      if (semesterExists) {
        setFormData(prev => ({ ...prev, semester_id: semesterIdFromUrl }))
        setCurrentStep(2) // Skip to step 2 if semester is pre-filled
      }
    }
  }, [semesterIdFromUrl, semesters])

  useEffect(() => {
    if (studentIdFromUrl && students.length > 0) {
      const studentExists = students.find(s => s.id.toString() === studentIdFromUrl)
      if (studentExists) {
        setFormData(prev => ({ ...prev, student_id: studentIdFromUrl }))
        setStudentSearch(`${studentExists.first_name} ${studentExists.last_name} (${studentExists.student_id})`)
        setCurrentStep(3) // Skip to step 3 if student is pre-filled
      }
    }
  }, [studentIdFromUrl, students])

  useEffect(() => {
    if (formData.semester_id) {
      fetchStudents()
      fetchClasses()
      fetchSemesterDetails()
    }
  }, [formData.semester_id, collegeId, userRole])

  useEffect(() => {
    if (formData.student_id && formData.semester_id) {
      fetchStudentMajorSheet()
      fetchCurrentSemesterEnrollments()
      if (selectedStudent) {
        setSelectedStudentCollegeId(selectedStudent.college_id)
      } else {
        fetchStudentForCollegeSettings()
      }
    } else {
      setValidationWarnings([])
      setValidationErrors([])
      setCurrentSemesterCredits(0)
    }
  }, [formData.student_id, formData.semester_id, selectedStudent])

  useEffect(() => {
    if (formData.student_id && formData.semester_id && formData.class_ids.length > 0) {
      validateEnrollment()
    } else {
      setValidationWarnings([])
      setValidationErrors([])
    }
  }, [formData.student_id, formData.class_ids, formData.semester_id, studentMajorSheet, currentSemesterCredits, semesterCreditsFromUni])

  // Refetch and filter classes when student major sheet is loaded
  useEffect(() => {
    if (formData.semester_id && formData.student_id && studentMajorSheet) {
      fetchClasses()
    }
  }, [studentMajorSheet, formData.student_id, formData.semester_id])

  const fetchSemesterDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('semesters')
        .select('*')
        .eq('id', formData.semester_id)
        .single()

      if (error) throw error
      setCurrentSemester(data)
    } catch (err) {
      console.error('Error fetching semester details:', err)
    }
  }

  const fetchStudentForCollegeSettings = async () => {
    try {
      if (!formData.student_id) return
      
      const { data, error } = await supabase
        .from('students')
        .select('college_id')
        .eq('id', parseInt(formData.student_id))
        .single()

      if (error) {
        console.error('Error fetching student college:', error)
        return
      }

      if (data?.college_id) {
        setSelectedStudentCollegeId(data.college_id)
      }
    } catch (err) {
      console.error('Error fetching student college:', err)
    }
  }

  useEffect(() => {
    const fetchCredits = async () => {
      const credits = await getSemesterCreditsFromUniversitySettings()
      setSemesterCreditsFromUni(credits)
    }
    fetchCredits()
  }, [])

  const fetchStudentMajorSheet = async () => {
    try {
      if (!formData.student_id) return

      // Fetch student's major
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select('id, major_id, enrollment_date')
        .eq('id', parseInt(formData.student_id))
        .single()

      if (studentError) throw studentError
      if (!studentData) return

      // Get admission year from enrollment_date
      const admissionYear = studentData.enrollment_date 
        ? new Date(studentData.enrollment_date).getFullYear().toString()
        : new Date().getFullYear().toString()

      // Fetch student's assigned major sheet
      const { data: studentMajorSheetData, error: sheetError } = await supabase
        .from('student_major_sheets')
        .select(`
          *,
          major_sheets (
            *,
            major_id
          )
        `)
        .eq('student_id', parseInt(formData.student_id))
        .eq('is_active', true)
        .maybeSingle()

      if (sheetError && sheetError.code !== 'PGRST116') {
        console.error('Error fetching student major sheet:', sheetError)
        return
      }

      // If no major sheet assigned, try to find the active major sheet for the student's major and admission year
      if (!studentMajorSheetData && studentData.major_id) {
        const { data: majorSheetData, error: majorSheetError } = await supabase
          .from('major_sheets')
          .select('*')
          .eq('major_id', studentData.major_id)
          .eq('is_active', true)
          .ilike('academic_year', `%${admissionYear}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!majorSheetError && majorSheetData) {
          setStudentMajorSheet({
            major_sheet: majorSheetData
          })
          // Fetch course groups for this major sheet
          await fetchCourseGroups(majorSheetData.id)
        }
      } else if (studentMajorSheetData) {
        setStudentMajorSheet(studentMajorSheetData)
        // Fetch course groups for this major sheet
        await fetchCourseGroups(studentMajorSheetData.major_sheet.id)
      }
    } catch (err) {
      console.error('Error fetching student major sheet:', err)
    }
  }

  const fetchCurrentSemesterEnrollments = async () => {
    try {
      if (!formData.student_id || !formData.semester_id) return

      const { data: enrollments, error } = await supabase
        .from('enrollments')
        .select(`
          id,
          status,
          classes (
            subjects (
              id,
              credit_hours
            )
          )
        `)
        .eq('student_id', parseInt(formData.student_id))
        .eq('semester_id', parseInt(formData.semester_id))
        .in('status', ['enrolled', 'completed'])

      if (error) throw error

      // Calculate current semester credits
      const credits = enrollments?.reduce((sum, enrollment) => {
        if (enrollment.status === 'enrolled' || enrollment.status === 'completed') {
          return sum + (parseInt(enrollment.classes?.subjects?.credit_hours) || 0)
        }
        return sum
      }, 0) || 0

      setCurrentSemesterCredits(credits)
    } catch (err) {
      console.error('Error fetching current semester enrollments:', err)
    }
  }

  const fetchCourseGroups = async (majorSheetId) => {
    try {
      const { data: groups, error } = await supabase
        .from('course_groups')
        .select(`
          *,
          major_sheet_courses (
            subject_id
          )
        `)
        .eq('major_sheet_id', majorSheetId)
        .eq('is_active', true)
        .order('group_number')

      if (error) throw error
      setCourseGroups(groups || [])
    } catch (err) {
      console.error('Error fetching course groups:', err)
      setCourseGroups([])
    }
  }

  const validateEnrollment = async () => {
    if (!formData.student_id || !formData.class_ids || formData.class_ids.length === 0 || !formData.semester_id) {
      setValidationWarnings([])
      setValidationErrors([])
      return
    }

    const warnings = []
    const errors = []

    try {
      // Get selected classes and calculate total credits
      const selectedClasses = classes.filter(c => formData.class_ids.includes(c.id.toString()))
      if (selectedClasses.length === 0) {
        setValidationErrors(['Please select at least one class'])
        return
      }

      // Calculate total credits from all selected classes
      const selectedCredits = selectedClasses.reduce((sum, cls) => {
        return sum + (parseInt(cls.subjects?.credit_hours) || 0)
      }, 0)
      const newTotalCredits = currentSemesterCredits + selectedCredits

      // Get all subject IDs from selected classes
      const selectedSubjectIds = selectedClasses.map(c => c.subjects?.id).filter(Boolean)

      // Use semester credit limits from university settings only
      const effectiveMinCredits = semesterCreditsFromUni.min_credit_hours
      const effectiveMaxCredits = semesterCreditsFromUni.max_credit_hours
      const effectiveMaxCreditsWithPermission = semesterCreditsFromUni.max_credit_hours_with_permission

      const selectedCreditsOnly = selectedClasses.reduce((sum, c) => sum + (parseInt(c.subjects?.credit_hours) || 0), 0)
      
      if (newTotalCredits < effectiveMinCredits) {
        warnings.push(`Total credits (${currentSemesterCredits} current + ${selectedCreditsOnly} new = ${newTotalCredits} total) will be below minimum required (${effectiveMinCredits}) for this semester.`)
      }

      if (newTotalCredits > effectiveMaxCreditsWithPermission) {
        errors.push(`Total credits (${currentSemesterCredits} current + ${selectedCreditsOnly} new = ${newTotalCredits} total) exceeds maximum allowed (${effectiveMaxCreditsWithPermission} with permission). Please reduce credits or get approval.`)
      } else if (newTotalCredits > effectiveMaxCredits) {
        warnings.push(`Total credits (${currentSemesterCredits} current + ${selectedCreditsOnly} new = ${newTotalCredits} total) exceeds standard maximum (${effectiveMaxCredits}). Permission may be required.`)
      }

      // Fetch student's completed enrollments with grade components for GPA points (for both prerequisites and co-requisites)
      const { data: completedEnrollments, error: enrollError } = await supabase
        .from('enrollments')
        .select(`
          id,
          status,
          grade,
          numeric_grade,
          grade_points,
          classes (
            subjects (
              id,
              code,
              name_en
            )
          ),
          grade_components (
            gpa_points,
            numeric_grade,
            letter_grade,
            status
          )
        `)
        .eq('student_id', parseInt(formData.student_id))
        .in('status', ['completed'])

      if (enrollError) throw enrollError

      // Build list of passed subjects with their GPA points
      const passedSubjects = (completedEnrollments || [])
        .map(e => {
          // Use grade_components GPA points if available, otherwise use enrollment grade_points
          const raw = e.grade_components
          const comp = Array.isArray(raw) ? raw[0] : raw
          const gpaPoints = comp?.gpa_points ?? e.grade_points ?? 0
          const subjId = e.classes?.subjects?.id
          if (subjId && gpaPoints >= 2.0) { // Minimum passing grade (C or 2.0 GPA)
            return {
              subject_id: subjId,
              gpa_points: gpaPoints,
              code: e.classes?.subjects?.code,
              name_en: e.classes?.subjects?.name_en
            }
          }
          return null
        })
        .filter(item => item !== null)

      const passedSubjectIds = passedSubjects.map(s => s.subject_id)

      // 3. Check Prerequisites for all selected classes
      const allPrereqMap = {} // Map: prerequisite_subject_id -> { subject_id, min_gpa, requires_grade, prerequisite_subject }

      for (const classItem of selectedClasses) {
        const subjectId = classItem.subjects?.id
        if (!subjectId) continue

        // Check both old subject_prerequisites and new course_prerequisites tables
        const { data: oldPrereqData, error: oldPrereqError } = await supabase
          .from('subject_prerequisites')
          .select('prerequisite_subject_id')
          .eq('subject_id', subjectId)

        const { data: newPrereqData, error: newPrereqError } = await supabase
          .from('course_prerequisites')
          .select('prerequisite_subject_id, min_gpa, requires_grade')
          .eq('subject_id', subjectId)
          .eq('prerequisite_type', 'prerequisite')

        // Collect prerequisites for this subject
        if (!oldPrereqError && oldPrereqData) {
          oldPrereqData.forEach(p => {
            if (!allPrereqMap[p.prerequisite_subject_id]) {
              allPrereqMap[p.prerequisite_subject_id] = {
                prerequisite_subject_id: p.prerequisite_subject_id,
                min_gpa: 2.0,
                required_for: [classItem.subjects?.code || `Subject ID ${subjectId}`]
              }
            } else {
              allPrereqMap[p.prerequisite_subject_id].required_for.push(classItem.subjects?.code || `Subject ID ${subjectId}`)
            }
          })
        }
        if (!newPrereqError && newPrereqData) {
          newPrereqData.forEach(p => {
            if (!allPrereqMap[p.prerequisite_subject_id]) {
              allPrereqMap[p.prerequisite_subject_id] = {
                prerequisite_subject_id: p.prerequisite_subject_id,
                min_gpa: parseFloat(p.min_gpa) || 2.0,
                requires_grade: p.requires_grade,
                required_for: [classItem.subjects?.code || `Subject ID ${subjectId}`]
              }
            } else {
              const existingMinGpa = allPrereqMap[p.prerequisite_subject_id].min_gpa
              const newMinGpa = parseFloat(p.min_gpa) || 2.0
              allPrereqMap[p.prerequisite_subject_id].min_gpa = Math.max(existingMinGpa, newMinGpa) // Take stricter requirement
              allPrereqMap[p.prerequisite_subject_id].required_for.push(classItem.subjects?.code || `Subject ID ${subjectId}`)
            }
          })
        }
      }

      // Fetch subject details for all prerequisites
      const uniquePrereqIds = Object.keys(allPrereqMap).map(id => parseInt(id))
      let prerequisiteSubjects = []
      if (uniquePrereqIds.length > 0) {
        const { data: subjectsData, error: subjectsError } = await supabase
          .from('subjects')
          .select('id, code, name_en')
          .in('id', uniquePrereqIds)
        
        if (!subjectsError && subjectsData) {
          prerequisiteSubjects = subjectsData
        }
      }

      // Validate prerequisites
      for (const prereqId in allPrereqMap) {
        const prereq = allPrereqMap[prereqId]
        const prereqSubjectId = parseInt(prereqId)
        const minGpa = parseFloat(prereq.min_gpa) || 2.0

        const subject = prerequisiteSubjects.find(s => s.id === prereqSubjectId)
        const prereqName = subject?.code || subject?.name_en || `Subject ID ${prereqSubjectId}`

        // Check if prerequisite is satisfied
        const passedSubject = passedSubjects.find(s => s.subject_id === prereqSubjectId)

        if (!passedSubject) {
          errors.push(`Prerequisite not met: ${prereqName} must be completed (min GPA ${minGpa.toFixed(1)}) before enrolling in: ${prereq.required_for.join(', ')}.`)
        } else if (passedSubject.gpa_points < minGpa) {
          errors.push(`Prerequisite grade insufficient: ${prereqName} was passed with GPA ${passedSubject.gpa_points.toFixed(2)}, but minimum required is ${minGpa.toFixed(1)} for: ${prereq.required_for.join(', ')}.`)
        }
      }

      // 4. Check Co-requisites for all selected classes
      const allCoreqMap = {} // Map: corequisite_subject_id -> { subject_id, required_for }

      for (const classItem of selectedClasses) {
        const subjectId = classItem.subjects?.id
        if (!subjectId) continue

        // Check both old subject_corequisites and new course_prerequisites tables
        const { data: oldCoreqData, error: oldCoreqError } = await supabase
          .from('subject_corequisites')
          .select('corequisite_subject_id')
          .eq('subject_id', subjectId)

        const { data: newCoreqData, error: newCoreqError } = await supabase
          .from('course_prerequisites')
          .select('prerequisite_subject_id')
          .eq('subject_id', subjectId)
          .eq('prerequisite_type', 'co_requisite')

        // Collect co-requisites for this subject
        if (!oldCoreqError && oldCoreqData) {
          oldCoreqData.forEach(c => {
            if (!allCoreqMap[c.corequisite_subject_id]) {
              allCoreqMap[c.corequisite_subject_id] = {
                corequisite_subject_id: c.corequisite_subject_id,
                required_for: [classItem.subjects?.code || `Subject ID ${subjectId}`]
              }
            } else {
              allCoreqMap[c.corequisite_subject_id].required_for.push(classItem.subjects?.code || `Subject ID ${subjectId}`)
            }
          })
        }
        if (!newCoreqError && newCoreqData) {
          newCoreqData.forEach(c => {
            const coreqId = c.prerequisite_subject_id
            if (!allCoreqMap[coreqId]) {
              allCoreqMap[coreqId] = {
                corequisite_subject_id: coreqId,
                required_for: [classItem.subjects?.code || `Subject ID ${subjectId}`]
              }
            } else {
              allCoreqMap[coreqId].required_for.push(classItem.subjects?.code || `Subject ID ${subjectId}`)
            }
          })
        }
      }

      // Fetch subject details for all co-requisites
      const uniqueCoreqIds = Object.keys(allCoreqMap).map(id => parseInt(id))
      let corequisiteSubjects = []
      if (uniqueCoreqIds.length > 0) {
        const { data: subjectsData, error: subjectsError } = await supabase
          .from('subjects')
          .select('id, code, name_en')
          .in('id', uniqueCoreqIds)
        
        if (!subjectsError && subjectsData) {
          corequisiteSubjects = subjectsData
        }
      }

      // Check if student is enrolled in co-requisites for the same semester (including currently selected)
      const { data: currentSemesterEnrollments, error: currentEnrollError } = await supabase
        .from('enrollments')
        .select(`
          id,
          status,
          classes (
            subjects (
              id,
              code,
              name_en
            )
          )
        `)
        .eq('student_id', parseInt(formData.student_id))
        .eq('semester_id', parseInt(formData.semester_id))
        .in('status', ['enrolled'])

      if (currentEnrollError) throw currentEnrollError

      const enrolledSubjectIds = [
        ...(currentSemesterEnrollments || []).map(e => e.classes?.subjects?.id).filter(Boolean),
        ...selectedSubjectIds // Include currently selected subjects
      ]

      // Validate co-requisites
      for (const coreqId in allCoreqMap) {
        const coreq = allCoreqMap[coreqId]
        const coreqSubjectId = parseInt(coreqId)

        const subject = corequisiteSubjects.find(s => s.id === coreqSubjectId)
        const coreqName = subject?.code || subject?.name_en || `Subject ID ${coreqSubjectId}`

        // Check if co-requisite is already enrolled this semester (including selected), already completed, or being selected now
        const isEnrolledThisSemester = enrolledSubjectIds.includes(coreqSubjectId)
        const isCompleted = passedSubjectIds.includes(coreqSubjectId)

        if (!isEnrolledThisSemester && !isCompleted) {
          warnings.push(`Co-requisite recommended: ${coreqName} should be taken together with: ${coreq.required_for.join(', ')}`)
        }
      }

      // 5. Check Major Sheet Course Groups for all selected classes
      if (studentMajorSheet?.major_sheet?.id && courseGroups.length > 0) {
        const majorSheetId = studentMajorSheet.major_sheet.id

        // Map each selected subject to its course group
        const subjectToGroupMap = {}
        const subjectsNotInSheet = []

        for (const subjectId of selectedSubjectIds) {
          const { data: majorSheetCourses, error: mscError } = await supabase
            .from('major_sheet_courses')
            .select(`
              id,
              course_group_id,
              course_groups (
                id,
                group_type,
                group_name_en,
                group_number,
                rule_type,
                choose_count,
                total_options,
                min_credits_required,
                max_credits_allowed
              )
            `)
            .eq('major_sheet_id', majorSheetId)
            .eq('subject_id', subjectId)
            .limit(1)

          if (!mscError && majorSheetCourses && majorSheetCourses.length > 0) {
            const courseGroup = majorSheetCourses[0].course_groups
            if (courseGroup) {
              if (!subjectToGroupMap[courseGroup.id]) {
                subjectToGroupMap[courseGroup.id] = {
                  group: courseGroup,
                  subjects: []
                }
              }
              const classInfo = selectedClasses.find(c => c.subjects?.id === subjectId)
              subjectToGroupMap[courseGroup.id].subjects.push({
                subject_id: subjectId,
                credit_hours: parseInt(classInfo?.subjects?.credit_hours) || 0
              })
            }
          } else {
            const classInfo = selectedClasses.find(c => c.subjects?.id === subjectId)
            subjectsNotInSheet.push({
              subject_id: subjectId,
              code: classInfo?.subjects?.code || `Subject ID ${subjectId}`
            })
          }
        }

        // Warn about courses not in major sheet
        if (subjectsNotInSheet.length > 0) {
          warnings.push(`${subjectsNotInSheet.length} course(s) not in your major sheet degree plan. Enrollment may require approval.`)
        }

        // Validate course group rules
        for (const groupId in subjectToGroupMap) {
          const groupData = subjectToGroupMap[groupId]
          const group = groupData.group
          const selectedSubjectsInGroup = groupData.subjects
          const selectedCreditsInGroup = selectedSubjectsInGroup.reduce((sum, s) => sum + s.credit_hours, 0)

          // Check rule type and validate
          if (group.rule_type === 'all_required') {
            // All courses in this group are mandatory - fetch all courses in this group
            const { data: allGroupCourses, error: allGroupError } = await supabase
              .from('major_sheet_courses')
              .select('subject_id')
              .eq('course_group_id', parseInt(groupId))
            
            if (!allGroupError && allGroupCourses) {
              const allGroupSubjectIds = allGroupCourses.map(c => c.subject_id)
              const missingRequired = allGroupSubjectIds.filter(sid => !selectedSubjectIds.includes(sid))
              
              if (missingRequired.length > 0 && selectedSubjectsInGroup.length > 0) {
                warnings.push(`Group ${group.group_number} (${group.group_name_en}): You have selected some but not all required courses.`)
              }
            }
          } else if (group.rule_type === 'choose_n_from_m') {
            // Must choose exactly N from M options
            const n = parseInt(group.choose_count) || 0
            const selectedCount = selectedSubjectsInGroup.length
            
            if (selectedCount > n) {
              errors.push(`Group ${group.group_number} (${group.group_name_en}): You selected ${selectedCount} courses, but only ${n} are allowed.`)
            } else if (selectedCount < n && selectedCount > 0) {
              warnings.push(`Group ${group.group_number} (${group.group_name_en}): You selected ${selectedCount} of ${n} required courses.`)
            }
          } else if (group.rule_type === 'flexible') {
            // Flexible - just check credit limits
            if (group.min_credits_required && selectedCreditsInGroup < parseInt(group.min_credits_required)) {
              warnings.push(`Group ${group.group_number} (${group.group_name_en}): Selected credits (${selectedCreditsInGroup}) is below minimum (${group.min_credits_required}).`)
            }
            if (group.max_credits_allowed && selectedCreditsInGroup > parseInt(group.max_credits_allowed)) {
              errors.push(`Group ${group.group_number} (${group.group_name_en}): Selected credits (${selectedCreditsInGroup}) exceeds maximum (${group.max_credits_allowed}).`)
            }
          }

          // Check group credit limits
          if (group.min_credits_required && selectedCreditsInGroup < parseInt(group.min_credits_required) && group.rule_type !== 'flexible') {
            warnings.push(`Group ${group.group_number} (${group.group_name_en}): Minimum ${group.min_credits_required} credits required, selected ${selectedCreditsInGroup}.`)
          }
          if (group.max_credits_allowed && selectedCreditsInGroup > parseInt(group.max_credits_allowed)) {
            errors.push(`Group ${group.group_number} (${group.group_name_en}): Maximum ${group.max_credits_allowed} credits allowed, selected ${selectedCreditsInGroup}.`)
          }
        }
      }

      setValidationWarnings(warnings)
      setValidationErrors(errors)
    } catch (err) {
      console.error('Error validating enrollment:', err)
      setValidationErrors([`Validation error: ${err.message}`])
    }
  }

  const fetchAcademicYears = async () => {
    if (!collegeId) return
    try {
      let query = supabase
        .from('academic_years')
        .select('id, name_en, name_ar, code, start_date, end_date')
        .order('start_date', { ascending: false })

      // Include college's academic years OR university-wide academic years
      query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)

      const { data, error } = await query
      if (error) throw error
      setAcademicYears(data || [])
    } catch (err) {
      console.error('Error fetching academic years:', err)
    }
  }

  const fetchSemesters = async () => {
    if (!collegeId) return
    
    try {
      let query = supabase
        .from('semesters')
        .select('id, name_en, name_ar, code, start_date, end_date, is_current, academic_year_id')
        .order('start_date', { ascending: false })

      // Filter by college: college's semesters OR university-wide semesters
      query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)

      const { data, error } = await query
      if (error) throw error
      setSemesters(data || [])
    } catch (err) {
      console.error('Error fetching semesters:', err)
      setError('Failed to load semesters')
    }
  }

  const fetchStudents = async () => {
    try {
      let query = supabase
        .from('students')
        .select('id, first_name, last_name, student_id, email, college_id, majors(name_en, name_ar, code), status')
        .eq('status', 'active')
        .order('first_name')

      if (userRole === 'instructor' && collegeId) {
        query = query.eq('college_id', collegeId)
        // Also filter by department if instructor has a department
        if (departmentId) {
          // Get majors that belong to this department
          const { data: departmentMajors } = await supabase
            .from('majors')
            .select('id')
            .eq('department_id', departmentId)
          
          if (departmentMajors && departmentMajors.length > 0) {
            const majorIds = departmentMajors.map(m => m.id)
            query = query.in('major_id', majorIds)
          } else {
            // No majors in this department, return empty
            query = query.eq('major_id', -1)
          }
        }
      } else if (collegeId) {
        query = query.eq('college_id', collegeId)
      }

      if (studentSearch) {
        const orFilter = buildStudentSearchOrFilter(studentSearch)
        if (orFilter) {
          query = query.or(orFilter)
        } else {
          query = query.ilike('student_id', `%${studentSearch}%`)
        }
      }

      const { data, error } = await query
      if (error) throw error
      setStudents(data || [])
    } catch (err) {
      console.error('Error fetching students:', err)
    }
  }

  const fetchClasses = async () => {
    try {
      if (!formData.semester_id) {
        setClasses([])
        return
      }

      let query = supabase
        .from('classes')
        .select(`
          id,
          code,
          section,
          capacity,
          enrolled,
          instructor_id,
          subjects (
            id,
            name_en,
            name_ar,
            code,
            credit_hours
          ),
          instructors (
            id,
            name_en,
            name_ar,
            email
          ),
          class_schedules (
            day_of_week,
            start_time,
            end_time,
            location
          )
        `)
        .eq('semester_id', formData.semester_id)
        .eq('status', 'active')
        .order('code')

      if (collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      }

      const { data: allClasses, error } = await query
      if (error) throw error

      // Filter classes based on student's major sheet course groups if student is selected
      if (formData.student_id && studentMajorSheet?.major_sheet?.id) {
        const majorSheetId = studentMajorSheet.major_sheet.id

        // Fetch all subjects that are part of this major sheet's course groups
        const { data: majorSheetCourses, error: mscError } = await supabase
          .from('major_sheet_courses')
          .select('subject_id')
          .eq('major_sheet_id', majorSheetId)

        if (!mscError && majorSheetCourses && majorSheetCourses.length > 0) {
          const majorSheetSubjectIds = majorSheetCourses.map(c => c.subject_id)
          
          // Filter classes to only show those whose subjects are in the major sheet
          const filteredClasses = (allClasses || []).filter(classItem => {
            return classItem.subjects && majorSheetSubjectIds.includes(classItem.subjects.id)
          })

          setClasses(filteredClasses)
          
          // Show info if some classes were filtered out
          if (filteredClasses.length < (allClasses || []).length) {
            console.log(`Filtered classes: Showing ${filteredClasses.length} of ${allClasses?.length || 0} classes that match the student's major sheet`)
          }
        } else {
          // No major sheet courses found, show all classes (validation will warn)
          setClasses(allClasses || [])
        }
      } else {
        // No student selected or no major sheet, show all classes
        setClasses(allClasses || [])
      }
    } catch (err) {
      console.error('Error fetching classes:', err)
      setError('Failed to load classes')
    }
  }

  useEffect(() => {
    if (studentSearch) {
      const timeoutId = setTimeout(() => {
        fetchStudents()
      }, 300)
      return () => clearTimeout(timeoutId)
    } else {
      fetchStudents()
    }
  }, [studentSearch, formData.semester_id])

  const handleNext = () => {
    if (currentStep === 1 && !formData.semester_id) {
      setError('Please select a semester')
      return
    }
    if (currentStep === 2 && !formData.student_id) {
      setError('Please select a student')
      return
    }
    if (currentStep === 3 && (!formData.class_ids || formData.class_ids.length === 0)) {
      setError('Please select at least one class')
      return
    }
    setError('')
    setCurrentStep(prev => Math.min(prev + 1, steps.length))
  }

  const handleBack = () => {
    setError('')
    setCurrentStep(prev => Math.max(prev - 1, 1))
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      // Re-validate before submission
      await validateEnrollment()

      // Block enrollment if there are critical errors
      if (validationErrors.length > 0) {
        setError(`Cannot enroll: ${validationErrors.join(' ')}`)
        setLoading(false)
        return
      }

      // Check for existing enrollments and create/update enrollments for all selected classes
      const enrollmentPromises = []
      const classUpdatePromises = []

      for (const classIdStr of formData.class_ids) {
        const classId = parseInt(classIdStr)

        // Check if student is already enrolled in this class
        const { data: existingEnrollments, error: checkError } = await supabase
          .from('enrollments')
          .select('id, status')
          .eq('student_id', parseInt(formData.student_id))
          .eq('class_id', classId)
          .eq('semester_id', parseInt(formData.semester_id))
          .limit(1)

        if (checkError && checkError.code !== 'PGRST116') {
          throw checkError
        }

        const existingEnrollment = existingEnrollments && existingEnrollments.length > 0 ? existingEnrollments[0] : null

        if (existingEnrollment) {
          if (existingEnrollment.status === 'enrolled') {
            setError(`Student is already enrolled in one or more selected classes`)
            setLoading(false)
            return
          } else {
            // Update existing enrollment if it's dropped/withdrawn
            enrollmentPromises.push(
              supabase
                .from('enrollments')
                .update({
                  status: 'enrolled',
                  enrollment_date: new Date().toISOString(),
                })
                .eq('id', existingEnrollment.id)
            )
            classUpdatePromises.push(updateClassEnrollment(classId, 1))
          }
        } else {
          // Create new enrollment
          enrollmentPromises.push(
            supabase
              .from('enrollments')
              .insert({
                student_id: parseInt(formData.student_id),
                class_id: classId,
                semester_id: parseInt(formData.semester_id),
                status: formData.status,
                enrollment_date: new Date().toISOString(),
              })
              .select()
              .single()
          )
          classUpdatePromises.push(updateClassEnrollment(classId, 1))
        }
      }

      // Execute all enrollment operations
      const enrollmentResults = await Promise.all(enrollmentPromises)
      const enrollmentErrors = enrollmentResults.filter(r => r.error).map(r => r.error)
      if (enrollmentErrors.length > 0) {
        throw enrollmentErrors[0]
      }

      // Update all class enrollment counts
      await Promise.all(classUpdatePromises)

      setSuccess(true)
      setTimeout(() => {
        navigate('/enrollments')
      }, 2000)
    } catch (err) {
      console.error('Error creating enrollment:', err)
      setError(err.message || t('enrollments.createdSuccess'))
    } finally {
      setLoading(false)
    }
  }

  const updateClassEnrollment = async (classId, increment) => {
    try {
      const { data: classDataArray, error: classError } = await supabase
        .from('classes')
        .select('enrolled')
        .eq('id', classId)
        .limit(1)

      if (classError && classError.code !== 'PGRST116') {
        console.error('Error fetching class:', classError)
        return
      }

      const classData = classDataArray && classDataArray.length > 0 ? classDataArray[0] : null

      if (classData) {
        await supabase
          .from('classes')
          .update({ enrolled: (classData.enrolled || 0) + increment })
          .eq('id', classId)
      }
    } catch (err) {
      console.error('Error updating class enrollment count:', err)
    }
  }

  const selectedSemester = semesters.find(s => s.id === parseInt(formData.semester_id))
  const selectedStudentObj = students.find(s => s.id === parseInt(formData.student_id))
  const selectedClassObjs = classes.filter(c => formData.class_ids.includes(c.id.toString()))

  useEffect(() => {
    if (formData.class_ids && formData.class_ids.length > 0) {
      setSelectedClass(selectedClassObjs[0] || null) // Keep for backward compatibility, but we'll use selectedClassObjs
    } else {
      setSelectedClass(null)
    }
  }, [formData.class_ids, selectedClassObjs])

  useEffect(() => {
    if (formData.student_id) {
      setSelectedStudent(selectedStudentObj)
    }
  }, [formData.student_id, selectedStudentObj])

  return (
    <div className="w-full max-w-none space-y-6">
      <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
        <button
          onClick={() => navigate(-1)}
          className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-gray-600 hover:text-gray-900`}
        >
          {isRTL ? <ArrowRight className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          <span>{t('enrollments.back')}</span>
        </button>
        <div className={`flex-1 ${isRTL ? 'text-right pr-4' : 'text-left pl-4'}`}>
          <h1 className="text-3xl font-extrabold text-[#1a3a6b]">{t('enrollments.createTitle')}</h1>
          <p className="text-gray-600 mt-1">{t('enrollments.createSubtitle')}</p>
        </div>
      </div>

      {/* College Selector for university-wide staff / admin */}
      {universityWide && (
        <div className={`rounded-lg p-6 ${requiresCollegeSelection ? 'bg-yellow-50 border-2 border-yellow-300' : 'bg-blue-50 border border-blue-200'}`}>
          <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-4'}`}>
            <Building2 className={`w-6 h-6 ${requiresCollegeSelection ? 'text-yellow-600' : 'text-blue-600'}`} />
            <div className="flex-1">
              <p className={`text-base font-semibold ${requiresCollegeSelection ? 'text-yellow-900' : 'text-blue-900'}`}>
                {requiresCollegeSelection ? t('enrollments.collegeSelectionRequired') : t('enrollments.selectedCollege')}
              </p>
              <p className={`text-sm ${requiresCollegeSelection ? 'text-yellow-700' : 'text-blue-700'}`}>
                {requiresCollegeSelection 
                  ? t('enrollments.collegeSelectionMessage')
                  : `${t('enrollments.workingWith')}: ${getLocalizedName(colleges.find(c => c.id === selectedCollegeId), isRTL) || t('common.unknown')}`}
              </p>
            </div>
            <select
              value={selectedCollegeId || ''}
              onChange={(e) => setSelectedCollegeId(parseInt(e.target.value))}
              className={`px-4 py-3 border rounded-lg text-sm bg-white focus:ring-2 focus:border-transparent min-w-[300px] ${
                requiresCollegeSelection 
                  ? 'border-yellow-300 focus:ring-yellow-500' 
                  : 'border-blue-300 focus:ring-blue-500'
              }`}
              required
            >
              <option value="">{t('enrollments.selectCollege')}</option>
              {colleges.map(college => (
                <option key={college.id} value={college.id}>
                  {getLocalizedName(college, isRTL)} ({college.code})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Progress Steps */}
      <div className={`bg-white rounded-2xl shadow-lg border border-gray-200 p-6 ${requiresCollegeSelection ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className={`flex items-center justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all ${
                    currentStep >= step.id
                      ? 'bg-[#2a5298]/15 border-[#2a5298] text-[#1a3a6b]'
                      : 'bg-gray-100 border-gray-300 text-gray-400'
                  }`}
                >
                  <step.icon className="w-6 h-6" />
                </div>
                <div className="mt-2 text-xs font-medium text-gray-600 text-center">
                  {step.name}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {t('common.step')} {step.id} {t('common.of')} {steps.length}
                </div>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-1 mx-2 ${
                    currentStep > step.id ? 'bg-[#2a5298]' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className={`bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
          <Check className="w-5 h-5" />
          <span>{t('enrollments.createdSuccess')}</span>
        </div>
      )}

      {/* Step Content */}
      <div className={`bg-white rounded-2xl shadow-lg border border-gray-200 p-8 ${requiresCollegeSelection ? 'opacity-50 pointer-events-none' : ''}`}>
        {/* Step 1: Select Academic Year and Semester */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('academic.semesters.selectAcademicYear')}</label>
              <select
                value={formData.academic_year_id}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, academic_year_id: e.target.value, semester_id: '', student_id: '', class_ids: [] }))
                  setError('')
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2a5298] focus:border-[#2a5298]"
              >
                <option value="">{t('enrollments.allAcademicYears') || 'All Academic Years'}</option>
                {academicYears.map(year => (
                  <option key={year.id} value={year.id}>
                    {getLocalizedName(year, isRTL)} ({year.code})
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">{t('enrollments.academicYearHint') || 'Includes college and university-wide academic years'}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('enrollments.semesterLabel')}</label>
              <select
                value={formData.semester_id}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, semester_id: e.target.value, student_id: '', class_ids: [] }))
                  setError('')
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#2a5298] focus:border-[#2a5298]"
              >
                <option value="">{t('enrollments.semesterHint')}</option>
                {(formData.academic_year_id
                  ? semesters.filter(s => s.academic_year_id === parseInt(formData.academic_year_id))
                  : semesters
                ).map(semester => (
                  <option key={semester.id} value={semester.id}>
                    {getLocalizedName(semester, isRTL)} ({semester.code}) {semester.is_current ? `[${t('enrollments.currentTag', { defaultValue: 'Current' })}]` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Step 2: Select Student */}
        {currentStep === 2 && (
          <div className={`space-y-6 ${isRTL ? 'text-right' : 'text-left'}`}>
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('enrollments.studentLabel', { defaultValue: 'Student *' })}</label>
              <input
                type="text"
                placeholder={t('enrollments.searchSelectStudent', { defaultValue: '-- Search and Select Student --' })}
                value={studentSearch}
                onChange={(e) => {
                  setStudentSearch(e.target.value)
                  setError('')
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">{t('enrollments.searchStudentHint', { defaultValue: 'Start typing to search for a student by name or ID' })}</p>
            </div>

            {studentSearch && (
              <div className="w-full border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
                {students.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">{t('enrollments.noStudentsFound', { defaultValue: 'No students found' })}</div>
                ) : (
                  students.map(student => (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, student_id: student.id.toString() }))
                        setStudentSearch(`${student.first_name} ${student.last_name} (${student.student_id})`)
                        setError('')
                      }}
                      className={`w-full px-4 py-3 hover:bg-gray-50 border-b border-gray-100 ${isRTL ? 'text-right' : 'text-left'} ${
                        formData.student_id === student.id.toString() ? 'bg-primary-50 border-primary-200' : ''
                      }`}
                    >
                      <div className="font-medium text-gray-900">
                        {student.first_name} {student.last_name} ({student.student_id})
                      </div>
                      <div className="text-sm text-gray-500">{student.email}</div>
                    </button>
                  ))
                )}
              </div>
            )}

            {selectedStudent && (
              <div className="w-full bg-gray-50 rounded-lg p-4">
                <h3 className="font-medium text-gray-900 mb-3">{t('enrollments.studentInfo', { defaultValue: 'Student Information' })}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">{t('enrollments.studentName', { defaultValue: 'Name:' })}</span>
                    <span className={`${isRTL ? 'mr-2' : 'ml-2'} font-medium`}>{selectedStudent.first_name} {selectedStudent.last_name}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('enrollments.studentId', { defaultValue: 'ID:' })}</span>
                    <span className={`${isRTL ? 'mr-2' : 'ml-2'} font-medium`}>{selectedStudent.student_id}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('enrollments.studentMajor', { defaultValue: 'Major:' })}</span>
                    <span className={`${isRTL ? 'mr-2' : 'ml-2'} font-medium`}>{getLocalizedName(selectedStudent.majors, isRTL) || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('enrollments.studentStatus', { defaultValue: 'Status:' })}</span>
                    <span className={`${isRTL ? 'mr-2' : 'ml-2'} font-medium`}>{selectedStudent.status || 'Active'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Select Class */}
        {currentStep === 3 && (
          <div className="space-y-6">
            {/* Current Semester Credit Hours Display - From University Settings */}
            {selectedStudent && currentSemester && (() => {
              const effectiveMin = semesterCreditsFromUni.min_credit_hours
              const effectiveMax = semesterCreditsFromUni.max_credit_hours
              const effectiveMaxWithPermission = semesterCreditsFromUni.max_credit_hours_with_permission
              
              return (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-blue-900">Semester Credit Hours (University Settings)</h4>
                    <span className="text-lg font-bold text-blue-700">
                      {(() => {
                        const selectedCredits = selectedClassObjs.reduce((sum, c) => sum + (parseInt(c.subjects?.credit_hours) || 0), 0)
                        const total = currentSemesterCredits + selectedCredits
                        return selectedCredits > 0 
                          ? `${currentSemesterCredits} (current) + ${selectedCredits} (new) = ${total} / ${effectiveMaxWithPermission}`
                          : `${currentSemesterCredits} / ${effectiveMaxWithPermission}`
                      })()}
                    </span>
                  </div>
                  <div className="text-xs text-blue-700 space-y-1">
                    {(() => {
                      const selectedCredits = selectedClassObjs.reduce((sum, c) => sum + (parseInt(c.subjects?.credit_hours) || 0), 0)
                      return selectedCredits > 0 && (
                        <>
                          <p className="font-semibold text-blue-900 mb-1">Breakdown:</p>
                          <p>• Currently Enrolled: <span className="font-medium">{currentSemesterCredits}</span> credits</p>
                          <p>• New Selection: <span className="font-medium">{selectedCredits}</span> credits ({selectedClassObjs.length} class{selectedClassObjs.length !== 1 ? 'es' : ''})</p>
                          <p>• Total After Enrollment: <span className="font-medium">{currentSemesterCredits + selectedCredits}</span> credits</p>
                        </>
                      )
                    })()}
                    <p className="font-semibold text-blue-900 mb-1 mt-2">University Policy:</p>
                    <p>• Minimum Required: <span className="font-medium">{effectiveMin}</span> credits</p>
                    <p>• Maximum Allowed: <span className="font-medium">{effectiveMax}</span> credits</p>
                    {effectiveMaxWithPermission > effectiveMax && (
                      <p>• Maximum with Permission: <span className="font-medium">{effectiveMaxWithPermission}</span> credits</p>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded">
                <h4 className="text-sm font-semibold text-red-900 mb-2">⚠️ Enrollment Blocked</h4>
                <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                  {validationErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Validation Warnings */}
            {validationWarnings.length > 0 && (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                <h4 className="text-sm font-semibold text-yellow-900 mb-2">⚠️ Warnings</h4>
                <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                  {validationWarnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('academic.semesters.selectClasses')} *
              </label>
              {classes.length === 0 ? (
                <div className="p-4 text-center text-gray-500 border border-gray-200 rounded-lg">
                  {t('enrollments.noSessionsAvailable')}
                </div>
              ) : (
                <div className={`border rounded-lg max-h-96 overflow-y-auto ${
                  validationErrors.length > 0 ? 'border-red-300' : 'border-gray-300'
                }`}>
                  {classes.map(cls => {
                    const available = (cls.capacity || 0) - (cls.enrolled || 0)
                    const isSelected = formData.class_ids.includes(cls.id.toString())
                    const isDisabled = available <= 0
                    
                    return (
                      <label
                        key={cls.id}
                        className={`flex items-start p-4 border-b border-gray-200 hover:bg-gray-50 cursor-pointer ${
                          isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                        } ${isSelected ? 'bg-primary-50 border-primary-200' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (isDisabled) return
                            const classIdStr = cls.id.toString()
                            setFormData(prev => {
                              if (e.target.checked) {
                                return { ...prev, class_ids: [...prev.class_ids, classIdStr] }
                              } else {
                                return { ...prev, class_ids: prev.class_ids.filter(id => id !== classIdStr) }
                              }
                            })
                            setError('')
                          }}
                          disabled={isDisabled || validationErrors.length > 0}
                          className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        <div className="ml-3 flex-1">
                          <div className="font-medium text-gray-900">
                            {cls.subjects?.code}-{cls.section} - {getLocalizedName(cls.subjects, isRTL)}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            <span className="font-medium">{cls.subjects?.credit_hours || 0} credits</span>
                            {' • '}
                            <span>Instructor: {getLocalizedName(cls.instructors, isRTL) || 'TBA'}</span>
                            {' • '}
                            <span className={available > 0 ? 'text-green-600' : 'text-red-600'}>
                              {available} seats available
                            </span>
                          </div>
                          {isDisabled && (
                            <div className="text-xs text-red-600 mt-1">Class is full</div>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
              {validationErrors.length > 0 && (
                <p className="text-xs text-red-600 mt-1">Please resolve the errors above before selecting classes.</p>
              )}
              {formData.class_ids.length > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  {formData.class_ids.length} class(es) selected
                </p>
              )}
            </div>

            {selectedClassObjs && selectedClassObjs.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-4">
                <h3 className="font-medium text-gray-900 mb-3">Selected Classes ({selectedClassObjs.length})</h3>
                <div className="space-y-3">
                  {selectedClassObjs.map((cls, idx) => {
                    const selectedCredits = selectedClassObjs.reduce((sum, c) => sum + (parseInt(c.subjects?.credit_hours) || 0), 0)
                    const newTotalCredits = currentSemesterCredits + selectedCredits
                    
                    return (
                      <div key={cls.id} className="border border-gray-200 rounded p-3 bg-white">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500">Subject:</span>
                            <span className="ml-2 font-medium">{getLocalizedName(cls.subjects, isRTL)}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Code:</span>
                            <span className="ml-2 font-medium">{cls.code}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Instructor:</span>
                            <span className="ml-2 font-medium">{getLocalizedName(cls.instructors, isRTL) || 'TBA'}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Credit Hours:</span>
                            <span className="ml-2 font-medium">{cls.subjects?.credit_hours || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Total Credit Hours After Enrollment */}
                {selectedClassObjs.length > 0 && currentSemesterCredits !== undefined && (
                  <div className="border-t pt-3 mt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Total Credits After Enrollment:</span>
                      <span className={`text-lg font-bold ${
                        (() => {
                          const effectiveMax = semesterCreditsFromUni.max_credit_hours_with_permission
                          const selectedCredits = selectedClassObjs.reduce((sum, c) => sum + (parseInt(c.subjects?.credit_hours) || 0), 0)
                          return (currentSemesterCredits + selectedCredits) > effectiveMax
                        })()
                          ? 'text-red-600'
                          : 'text-green-600'
                      }`}>
                        {(() => {
                          const effectiveMax = semesterCreditsFromUni.max_credit_hours_with_permission
                          const selectedCredits = selectedClassObjs.reduce((sum, c) => sum + (parseInt(c.subjects?.credit_hours) || 0), 0)
                          return `${currentSemesterCredits + selectedCredits} / ${effectiveMax}`
                        })()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 4: Review */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900">Review Enrollment Details</h3>
            
            {/* Validation Summary */}
            {validationErrors.length > 0 && (
              <div className="bg-red-50 border-l-4 border-red-400 p-4 rounded">
                <h4 className="text-sm font-semibold text-red-900 mb-2">❌ Enrollment Cannot Proceed</h4>
                <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                  {validationErrors.map((err, idx) => (
                    <li key={idx}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {validationWarnings.length > 0 && validationErrors.length === 0 && (
              <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
                <h4 className="text-sm font-semibold text-yellow-900 mb-2">⚠️ Warnings (Enrollment can proceed)</h4>
                <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
                  {validationWarnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            {validationErrors.length === 0 && validationWarnings.length === 0 && (
              <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded">
                <h4 className="text-sm font-semibold text-green-900 mb-2">✓ All Validations Passed</h4>
                <p className="text-sm text-green-700">This enrollment meets all academic requirements and credit hour limits.</p>
              </div>
            )}

            <div className="bg-gray-50 rounded-lg p-6 space-y-4">
              <div>
                <span className="text-sm font-medium text-gray-500">Semester:</span>
                <p className="text-gray-900">{getLocalizedName(selectedSemester, isRTL)} ({selectedSemester?.code})</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Student:</span>
                <p className="text-gray-900">{selectedStudent?.first_name} {selectedStudent?.last_name} ({selectedStudent?.student_id})</p>
                <p className="text-xs text-gray-500 mt-1">Major: {getLocalizedName(selectedStudent?.majors, isRTL) || 'N/A'}</p>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Selected Classes ({selectedClassObjs?.length || 0}):</span>
                <div className="mt-2 space-y-2">
                  {selectedClassObjs?.map((cls, idx) => (
                    <div key={cls.id} className="p-2 bg-gray-50 rounded border border-gray-200">
                      <p className="text-gray-900 font-medium">{cls.subjects?.code}-{cls.section} - {getLocalizedName(cls.subjects, isRTL)}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Credit Hours: {cls.subjects?.credit_hours || 'N/A'} • Instructor: {getLocalizedName(cls.instructors, isRTL) || 'TBA'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Credit Hours Summary:</span>
                <div className="mt-2 space-y-1 text-sm">
                  <p>Current Semester Credits: <span className="font-medium">{currentSemesterCredits}</span></p>
                  <p>New Course Credits: <span className="font-medium">
                    {selectedClassObjs?.reduce((sum, c) => sum + (parseInt(c.subjects?.credit_hours) || 0), 0) || 0}
                  </span></p>
                  <p className="border-t pt-2">Total After Enrollment: <span className="font-bold text-primary-600">
                    {currentSemesterCredits + (selectedClassObjs?.reduce((sum, c) => sum + (parseInt(c.subjects?.credit_hours) || 0), 0) || 0)}
                  </span></p>
                  <p className="text-xs font-medium text-gray-700">University Policy: Min {semesterCreditsFromUni.min_credit_hours} / Max {semesterCreditsFromUni.max_credit_hours} ({semesterCreditsFromUni.max_credit_hours_with_permission} with permission)</p>
                </div>
              </div>
              <div>
                <span className="text-sm font-medium text-gray-500">Status:</span>
                <p className="text-gray-900">{formData.status}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className={`flex justify-between ${isRTL ? 'flex-row-reverse' : ''}`}>
        <button
          onClick={handleBack}
          disabled={currentStep === 1}
          className={`flex items-center px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed ${isRTL ? 'flex-row-reverse space-x-reverse space-x-2' : 'space-x-2'}`}
        >
          {isRTL ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          <span>{t('enrollments.back')}</span>
        </button>
        {currentStep < steps.length ? (
          <button
            onClick={handleNext}
            className={`flex items-center px-6 py-2 bg-[#2a5298] text-white rounded-lg font-semibold hover:bg-[#1a3a6b] hover:shadow-lg transition-colors ${isRTL ? 'flex-row-reverse space-x-reverse space-x-2' : 'space-x-2'}`}
          >
            <span>{t('enrollments.next')}</span>
            {isRTL ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading || validationErrors.length > 0}
            className={`flex items-center px-6 py-2 bg-[#c8a84b] text-[#1a3a6b] rounded-lg font-semibold hover:bg-[#b8942e] hover:shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isRTL ? 'flex-row-reverse space-x-reverse space-x-2' : 'space-x-2'}`}
          >
            <Check className="w-4 h-4" />
            <span>{loading ? t('enrollments.enrolling') : validationErrors.length > 0 ? t('enrollments.cannotEnroll') : t('enrollments.completeEnrollment')}</span>
          </button>
        )}
      </div>
    </div>
  )
}
