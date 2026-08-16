import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import {
  getGradingScaleFromUniversitySettings,
  getSubjectGpaFromEnrollment,
  normalizeGradeComponent,
} from '../../utils/getCollegeSettings'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCollege } from '../../contexts/CollegeContext'
import { exportSubjectScoresExcel } from '../../utils/exportSubjectScores'
import { fetchExamScoresByClassIds, overlayExamScoresOnGradeComponent, examScoresForEnrollment } from '../../utils/syncExamGradesToGradebook'
import { Search, BookOpen, Users, Award, TrendingUp, Percent, Download } from 'lucide-react'

export default function SubjectScores() {
  const { t, i18n } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabicLayout =
    isRTL ||
    language === 'ar' ||
    i18n?.language?.toLowerCase()?.startsWith('ar') ||
    (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl')

  const { userRole, collegeId: authCollegeId, departmentId } = useAuth()
  const { selectedCollegeId, colleges, setSelectedCollegeId } = useCollege()

  const [collegeId, setCollegeId] = useState(null)
  const [majors, setMajors] = useState([])
  const [academicYears, setAcademicYears] = useState([])
  const [selectedYearId, setSelectedYearId] = useState('')
  const [selectedProgram, setSelectedProgram] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [subjectOptions, setSubjectOptions] = useState([])
  const [subjectsLoading, setSubjectsLoading] = useState(false)
  const [rowsLoading, setRowsLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [gradingScale, setGradingScale] = useState([])
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (userRole === 'admin' && selectedCollegeId) {
      setCollegeId(selectedCollegeId)
    } else if ((userRole === 'user' || userRole === 'instructor') && authCollegeId) {
      setCollegeId(authCollegeId)
    } else if (userRole === 'admin' && !selectedCollegeId) {
      setCollegeId(null)
    }
  }, [userRole, selectedCollegeId, authCollegeId])

  useEffect(() => {
    getGradingScaleFromUniversitySettings().then(setGradingScale)
  }, [])

  useEffect(() => {
    let cancelled = false
    const loadYears = async () => {
      try {
        let query = supabase
          .from('academic_years')
          .select('id, name_en, name_ar, code, start_date')
          .order('start_date', { ascending: false })
        if (collegeId) {
          query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
        }
        const { data, error } = await query
        if (error) throw error
        if (!cancelled) {
          setAcademicYears(data || [])
          setSelectedYearId((prev) => {
            if (!prev) return prev
            return (data || []).some((y) => String(y.id) === String(prev)) ? prev : ''
          })
        }
      } catch (err) {
        console.error('Error fetching academic years:', err)
        if (!cancelled) setAcademicYears([])
      }
    }
    loadYears()
    return () => {
      cancelled = true
    }
  }, [collegeId])

  useEffect(() => {
    let cancelled = false
    const loadMajors = async () => {
      try {
        let query = supabase.from('majors').select('id, name_en, name_ar, code, department_id').order('name_en')
        if (collegeId) query = query.eq('college_id', collegeId)
        if (userRole === 'instructor' && departmentId) query = query.eq('department_id', departmentId)
        const { data, error } = await query
        if (error) throw error
        if (!cancelled) {
          setMajors(data || [])
          setSelectedProgram((prev) => {
            if (!prev) return prev
            return (data || []).some((m) => String(m.id) === String(prev)) ? prev : ''
          })
        }
      } catch (err) {
        console.error('Error fetching majors:', err)
        if (!cancelled) setMajors([])
      }
    }
    if (userRole === 'admin' || ((userRole === 'user' || userRole === 'instructor') && authCollegeId)) {
      loadMajors()
    }
    return () => {
      cancelled = true
    }
  }, [collegeId, userRole, authCollegeId, departmentId])

  useEffect(() => {
    let cancelled = false
    const loadSubjects = async () => {
      setSubjectsLoading(true)
      try {
        let list = []

        if (selectedProgram) {
          const majorId = Number(selectedProgram)
          const { data: majorRow } = await supabase
            .from('majors')
            .select('id, college_id')
            .eq('id', majorId)
            .maybeSingle()
          const majorCollegeId = majorRow?.college_id ?? null

          let q1 = supabase
            .from('subjects')
            .select('id, code, name_en, name_ar, college_id, major_id, applies_to_all_majors_of_college')
            .eq('status', 'active')
            .eq('major_id', majorId)
            .order('name_en')
            .limit(500)
          if (collegeId) q1 = q1.eq('college_id', collegeId)
          const { data: byMajor, error: e1 } = await q1
          if (e1) throw e1

          let byCollegeWide = []
          if (majorCollegeId) {
            const { data, error: e2 } = await supabase
              .from('subjects')
              .select('id, code, name_en, name_ar, college_id, major_id, applies_to_all_majors_of_college')
              .eq('status', 'active')
              .eq('applies_to_all_majors_of_college', true)
              .eq('college_id', majorCollegeId)
              .order('name_en')
              .limit(500)
            if (e2) throw e2
            byCollegeWide = data || []
          }

          const { data: junction } = await supabase
            .from('subject_majors')
            .select(
              'subject_id, subjects(id, code, name_en, name_ar, college_id, major_id, applies_to_all_majors_of_college, status)'
            )
            .eq('major_id', majorId)
          const fromJunction = (junction || [])
            .map((row) => row.subjects)
            .filter((s) => s && s.status === 'active')

          const byId = new Map()
          for (const s of [...(byMajor || []), ...byCollegeWide, ...fromJunction]) {
            if (s?.id) byId.set(s.id, s)
          }
          list = [...byId.values()]
        } else {
          let query = supabase
            .from('subjects')
            .select('id, code, name_en, name_ar, college_id, major_id, applies_to_all_majors_of_college')
            .eq('status', 'active')
            .order('name_en')
            .limit(500)
          if (collegeId) {
            query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
          }
          const { data, error } = await query
          if (error) throw error
          list = data || []
        }

        if (!cancelled) {
          setSubjectOptions(list)
          setSelectedSubjectId((prev) => {
            if (!prev) return prev
            return list.some((s) => String(s.id) === String(prev)) ? prev : ''
          })
        }
      } catch (err) {
        console.error('Error fetching subjects:', err)
        if (!cancelled) setSubjectOptions([])
      } finally {
        if (!cancelled) setSubjectsLoading(false)
      }
    }
    loadSubjects()
    return () => {
      cancelled = true
    }
  }, [collegeId, selectedProgram])

  useEffect(() => {
    if (!selectedSubjectId) {
      setRows([])
      return
    }

    let cancelled = false
    const loadRows = async () => {
      setRowsLoading(true)
      try {
        const subjectId = Number(selectedSubjectId)

        let semesterIdsForYear = null
        if (selectedYearId) {
          const { data: semRows, error: semErr } = await supabase
            .from('semesters')
            .select('id')
            .eq('academic_year_id', Number(selectedYearId))
          if (semErr) throw semErr
          semesterIdsForYear = (semRows || []).map((s) => s.id)
          if (!semesterIdsForYear.length) {
            if (!cancelled) setRows([])
            return
          }
        }

        const { data: classRows, error: classErr } = await supabase
          .from('classes')
          .select('id, subject_id, subjects(id, code, name_en, name_ar, credit_hours)')
          .eq('subject_id', subjectId)
        if (classErr) throw classErr

        const classIds = (classRows || []).map((c) => c.id).filter(Boolean)
        if (!classIds.length) {
          if (!cancelled) setRows([])
          return
        }

        const classById = new Map((classRows || []).map((c) => [c.id, c]))

        const enrollments = []
        const chunkSize = 50
        for (let i = 0; i < classIds.length; i += chunkSize) {
          if (cancelled) return
          const chunk = classIds.slice(i, i + chunkSize)
          let from = 0
          const page = 500
          for (;;) {
            let query = supabase
              .from('enrollments')
              .select(
                `
                id,
                student_id,
                semester_id,
                class_id,
                numeric_grade,
                grade_points,
                grade,
                semesters(id, name_en, name_ar, code, academic_year_id, academic_years(id, name_en, name_ar, code)),
                students(
                  id,
                  student_id,
                  name_en,
                  name_ar,
                  first_name,
                  last_name,
                  first_name_ar,
                  last_name_ar,
                  major_id,
                  majors(id, name_en, name_ar),
                  college_id
                )
              `
              )
              .eq('status', 'enrolled')
              .in('class_id', chunk)
            if (semesterIdsForYear) {
              query = query.in('semester_id', semesterIdsForYear)
            }
            const { data, error } = await query.range(from, from + page - 1)
            if (error) throw error
            if (!data?.length) break
            enrollments.push(...data)
            if (data.length < page) break
            from += page
          }
        }

        const enrollmentIds = enrollments.map((e) => e.id)
        const gcByEnrollment = new Map()
        for (let i = 0; i < enrollmentIds.length; i += 200) {
          if (cancelled) return
          const chunk = enrollmentIds.slice(i, i + 200)
          const { data: gcs, error: gcErr } = await supabase
            .from('grade_components')
            .select('*')
            .in('enrollment_id', chunk)
          if (gcErr) throw gcErr
          for (const gc of gcs || []) gcByEnrollment.set(gc.enrollment_id, gc)
        }

        let examData = {}
        try {
          examData = await fetchExamScoresByClassIds(classIds)
        } catch (examErr) {
          console.warn('SubjectScores exam overlay', examErr)
        }

        // Prefer latest semester per student; if tied, the enrollment with the latest exam attempt
        const bestByStudent = new Map()
        for (const e of enrollments) {
          if (!e.students) continue
          if (collegeId && e.students.college_id && Number(e.students.college_id) !== Number(collegeId)) {
            continue
          }
          const { examAt } = examScoresForEnrollment(examData, e)
          const prev = bestByStudent.get(e.student_id)
          if (
            !prev ||
            (e.semester_id || 0) > (prev.semester_id || 0) ||
            ((e.semester_id || 0) === (prev.semester_id || 0) && examAt > (prev._examAt || 0))
          ) {
            bestByStudent.set(e.student_id, { ...e, _examAt: examAt })
          }
        }

        const built = [...bestByStudent.values()].map((e) => {
          const cls = classById.get(e.class_id)
          const { scores } = examScoresForEnrollment(examData, e)
          const enrollment = {
            ...e,
            classes: cls
              ? {
                  id: cls.id,
                  subject_id: cls.subject_id,
                  subjects: cls.subjects,
                }
              : null,
            grade_components: overlayExamScoresOnGradeComponent(
              gcByEnrollment.get(e.id) || null,
              scores,
              gradingScale,
            ),
          }
          const comp = normalizeGradeComponent(enrollment.grade_components)
          const { points, letter } = getSubjectGpaFromEnrollment(enrollment, gradingScale)
          const scoreRaw = comp?.numeric_grade ?? comp?.final ?? enrollment.numeric_grade ?? null
          const score =
            scoreRaw != null && scoreRaw !== '' && !Number.isNaN(Number(scoreRaw))
              ? Number(scoreRaw)
              : null
          const letterGrade = comp?.letter_grade || letter || enrollment.grade || null
          const sem = e.semesters
          const semesterLabel =
            getLocalizedName(sem, isArabicLayout) || sem?.code || '—'

          return {
            enrollmentId: e.id,
            studentDbId: e.students.id,
            studentId: e.students.student_id,
            student: e.students,
            program: e.students.majors,
            semesterLabel: semesterLabel || '—',
            score,
            letter: letterGrade,
            gpa: points,
          }
        })

        built.sort((a, b) =>
          String(a.studentId || '').localeCompare(String(b.studentId || ''), undefined, {
            numeric: true,
          })
        )

        if (!cancelled) setRows(built)
      } catch (err) {
        console.error('Error loading subject scores:', err)
        if (!cancelled) setRows([])
      } finally {
        if (!cancelled) setRowsLoading(false)
      }
    }

    loadRows()
    return () => {
      cancelled = true
    }
  }, [selectedSubjectId, selectedYearId, collegeId, gradingScale, isArabicLayout])

  const sortedSubjects = useMemo(
    () =>
      [...subjectOptions].sort((a, b) =>
        (getLocalizedName(a, isArabicLayout) || a.code || '').localeCompare(
          getLocalizedName(b, isArabicLayout) || b.code || '',
          isArabicLayout ? 'ar' : 'en'
        )
      ),
    [subjectOptions, isArabicLayout]
  )

  const sortedMajors = useMemo(
    () =>
      [...majors].sort((a, b) =>
        (getLocalizedName(a, isArabicLayout) || '').localeCompare(
          getLocalizedName(b, isArabicLayout) || '',
          isArabicLayout ? 'ar' : 'en'
        )
      ),
    [majors, isArabicLayout]
  )

  const selectedSubject = useMemo(
    () => subjectOptions.find((s) => String(s.id) === String(selectedSubjectId)) || null,
    [subjectOptions, selectedSubjectId]
  )

  const selectedYear = useMemo(
    () => academicYears.find((y) => String(y.id) === String(selectedYearId)) || null,
    [academicYears, selectedYearId]
  )

  const selectedMajor = useMemo(
    () => majors.find((m) => String(m.id) === String(selectedProgram)) || null,
    [majors, selectedProgram]
  )

  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return rows
    const term = searchTerm.toLowerCase()
    return rows.filter((r) => {
      const s = r.student
      return (
        r.studentId?.toLowerCase().includes(term) ||
        s?.name_en?.toLowerCase().includes(term) ||
        s?.name_ar?.toLowerCase().includes(term) ||
        s?.first_name?.toLowerCase().includes(term) ||
        s?.last_name?.toLowerCase().includes(term) ||
        s?.first_name_ar?.toLowerCase().includes(term) ||
        s?.last_name_ar?.toLowerCase().includes(term)
      )
    })
  }, [rows, searchTerm])

  const stats = useMemo(() => {
    const graded = filteredRows.filter((r) => r.score != null || r.letter)
    const withScore = graded.filter((r) => r.score != null)
    const avg =
      withScore.length > 0
        ? withScore.reduce((sum, r) => sum + r.score, 0) / withScore.length
        : null
    const failLetters = new Set(['F', 'FA', 'W', 'WF', 'I'])
    const passed = graded.filter((r) => {
      if (r.score != null) return r.score >= 50
      if (!r.letter) return false
      return !failLetters.has(String(r.letter).toUpperCase())
    })
    const passRate = graded.length > 0 ? (passed.length / graded.length) * 100 : null
    return {
      students: filteredRows.length,
      graded: graded.length,
      avgScore: avg,
      passRate,
    }
  }, [filteredRows])

  const formatStudentId = (id) => String(id || '').replace(/^STU/i, '')
  const formatScore = (score) => {
    if (score == null) return '—'
    return score % 1 === 0 ? String(score) : score.toFixed(2)
  }
  const formatGpa = (gpa) => {
    if (gpa == null || Number.isNaN(Number(gpa))) return '—'
    return Number(gpa).toFixed(2)
  }

  const displayStudentName = (student) => {
    if (!student) return '—'
    if (isArabicLayout) {
      const ar = [student.first_name_ar, student.last_name_ar].filter(Boolean).join(' ').trim()
      if (ar) return ar
      if (student.name_ar?.trim()) return student.name_ar.trim()
    }
    if (student.name_en?.trim()) return student.name_en.trim()
    return [student.first_name, student.last_name].filter(Boolean).join(' ').trim() || '—'
  }

  const handleExport = async () => {
    if (!filteredRows.length || exporting) return
    setExporting(true)
    try {
      const college =
        colleges.find((c) => Number(c.id) === Number(collegeId || selectedCollegeId)) || null
      await exportSubjectScoresExcel({
        rows: filteredRows.map((r) => ({
          studentId: formatStudentId(r.studentId),
          name: displayStudentName(r.student),
          program: getLocalizedName(r.program, isArabicLayout) || '—',
          semester: r.semesterLabel,
          score: r.score,
          letter: r.letter,
          gpa: r.gpa,
        })),
        meta: {
          subjectName: getLocalizedName(selectedSubject, isArabicLayout) || '',
          subjectCode: selectedSubject?.code || '',
          yearName: selectedYear
            ? getLocalizedName(selectedYear, isArabicLayout) || selectedYear.code
            : '',
          programName: selectedMajor
            ? getLocalizedName(selectedMajor, isArabicLayout) || selectedMajor.code
            : '',
          collegeName: college ? getLocalizedName(college, isArabicLayout) : '',
          stats: {
            students: stats.students,
            graded: stats.graded,
            avgScore: stats.avgScore,
            passRate: stats.passRate,
          },
        },
        isArabic: isArabicLayout,
      })
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  const filterCols = 'md:grid-cols-2 xl:grid-cols-3'
  const subjectSelected = Boolean(selectedSubjectId)

  return (
    <div className="space-y-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
      <div className={isArabicLayout ? 'text-right' : 'text-left'}>
        <h1 className="text-3xl font-bold text-gray-900">
          {t('grading.subjectScores.title', { defaultValue: 'Subject scores' })}
        </h1>
        <p className="text-gray-600 mt-1">
          {t('grading.subjectScores.subtitle', {
            defaultValue: 'Pick one subject and view every student’s score, letter grade, and course GPA.',
          })}
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className={`grid grid-cols-1 gap-4 ${filterCols}`}>
          {userRole === 'admin' && (
            <div>
              <label
                className={`block text-sm font-medium text-gray-700 mb-2 ${isArabicLayout ? 'text-right' : 'text-left'}`}
              >
                {t('grading.gradeManagement.selectCollege')}
              </label>
              <select
                value={selectedCollegeId ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setSelectedCollegeId(v ? parseInt(v, 10) : null)
                  setSelectedSubjectId('')
                }}
                className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isArabicLayout ? 'text-right' : 'text-left'}`}
              >
                <option value="">{t('grading.gradeManagement.allColleges')}</option>
                {colleges.map((college) => (
                  <option key={college.id} value={college.id}>
                    {getLocalizedName(college, isArabicLayout)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label
              className={`block text-sm font-medium text-gray-700 mb-2 ${isArabicLayout ? 'text-right' : 'text-left'}`}
            >
              {t('grading.subjectScores.academicYear', { defaultValue: 'Academic year' })}
            </label>
            <select
              value={selectedYearId}
              onChange={(e) => setSelectedYearId(e.target.value)}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isArabicLayout ? 'text-right' : 'text-left'}`}
            >
              <option value="">
                {t('grading.subjectScores.allYears', { defaultValue: 'All years' })}
              </option>
              {academicYears.map((year) => (
                <option key={year.id} value={String(year.id)}>
                  {getLocalizedName(year, isArabicLayout) || year.code}
                  {year.code ? ` (${year.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className={`block text-sm font-medium text-gray-700 mb-2 ${isArabicLayout ? 'text-right' : 'text-left'}`}
            >
              {t('grading.subjectScores.program', { defaultValue: 'Program' })}
            </label>
            <select
              value={selectedProgram}
              onChange={(e) => {
                setSelectedProgram(e.target.value)
                setSelectedSubjectId('')
              }}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isArabicLayout ? 'text-right' : 'text-left'}`}
            >
              <option value="">{t('grading.subjectScores.allPrograms', { defaultValue: 'All programs' })}</option>
              {sortedMajors.map((major) => (
                <option key={major.id} value={String(major.id)}>
                  {getLocalizedName(major, isArabicLayout)}
                  {major.code ? ` (${major.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className={`block text-sm font-medium text-gray-700 mb-2 ${isArabicLayout ? 'text-right' : 'text-left'}`}
            >
              {t('grading.subjectScores.subject', { defaultValue: 'Subject' })}
            </label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              disabled={subjectsLoading}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isArabicLayout ? 'text-right' : 'text-left'}`}
            >
              <option value="">
                {t('grading.subjectScores.chooseSubject', { defaultValue: 'Choose a subject' })}
              </option>
              {sortedSubjects.map((subj) => (
                <option key={subj.id} value={String(subj.id)}>
                  {getLocalizedName(subj, isArabicLayout) || subj.code}
                  {subj.code ? ` (${subj.code})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className={`block text-sm font-medium text-gray-700 mb-2 ${isArabicLayout ? 'text-right' : 'text-left'}`}
            >
              {t('common.search')}
            </label>
            <div className="relative">
              <Search
                className={`absolute ${isArabicLayout ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none`}
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                disabled={!subjectSelected}
                placeholder={t('grading.subjectScores.searchPlaceholder', {
                  defaultValue: 'Search student…',
                })}
                className={`w-full ${isArabicLayout ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4 text-left'} py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-50`}
              />
            </div>
          </div>
        </div>
      </div>

      {!subjectSelected ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-500">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-400" />
          <p className="font-medium text-gray-700">
            {t('grading.subjectScores.pickSubjectTitle', { defaultValue: 'Select a subject' })}
          </p>
          <p className="mt-2 text-sm max-w-md mx-auto">
            {t('grading.subjectScores.pickSubjectHint', {
              defaultValue:
                'Choose a program (optional) then a subject to see all student scores for that course only.',
            })}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              isArabicLayout={isArabicLayout}
              icon={Users}
              label={t('grading.subjectScores.students', { defaultValue: 'Students' })}
              value={stats.students}
            />
            <StatCard
              isArabicLayout={isArabicLayout}
              icon={Award}
              label={t('grading.subjectScores.graded', { defaultValue: 'Graded' })}
              value={stats.graded}
            />
            <StatCard
              isArabicLayout={isArabicLayout}
              icon={TrendingUp}
              label={t('grading.subjectScores.avgScore', { defaultValue: 'Avg score' })}
              value={stats.avgScore != null ? formatScore(stats.avgScore) : '—'}
            />
            <StatCard
              isArabicLayout={isArabicLayout}
              icon={Percent}
              label={t('grading.subjectScores.passRate', { defaultValue: 'Pass rate' })}
              value={stats.passRate != null ? `${stats.passRate.toFixed(0)}%` : '—'}
            />
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div
              className={`flex flex-wrap items-center justify-between gap-3 mb-4 ${isArabicLayout ? 'flex-row-reverse' : ''}`}
            >
              <h2 className={`text-xl font-bold text-gray-900 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
                {t('grading.subjectScores.students', { defaultValue: 'Students' })} ({filteredRows.length})
              </h2>
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting || rowsLoading || filteredRows.length === 0}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed ${isArabicLayout ? 'flex-row-reverse' : ''}`}
              >
                <Download className="w-4 h-4" />
                {exporting
                  ? t('grading.subjectScores.exporting', { defaultValue: 'Exporting…' })
                  : t('grading.subjectScores.exportExcel', { defaultValue: 'Export Excel' })}
              </button>
            </div>

            {rowsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <p>{t('grading.subjectScores.noRows', { defaultValue: 'No enrolled students with grades for this subject.' })}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" dir={isArabicLayout ? 'rtl' : 'ltr'}>
                  <thead className="bg-gray-50">
                    <tr>
                      <Th isArabicLayout={isArabicLayout}>
                        {t('grading.subjectScores.studentId', { defaultValue: 'Student ID' })}
                      </Th>
                      <Th isArabicLayout={isArabicLayout}>
                        {t('grading.subjectScores.name', { defaultValue: 'Name' })}
                      </Th>
                      <Th isArabicLayout={isArabicLayout}>
                        {t('grading.subjectScores.programCol', { defaultValue: 'Program' })}
                      </Th>
                      <Th isArabicLayout={isArabicLayout}>
                        {t('grading.subjectScores.semester', { defaultValue: 'Semester' })}
                      </Th>
                      <Th isArabicLayout={isArabicLayout}>
                        {t('grading.subjectScores.score', { defaultValue: 'Score' })}
                      </Th>
                      <Th isArabicLayout={isArabicLayout}>
                        {t('grading.subjectScores.grade', { defaultValue: 'Grade' })}
                      </Th>
                      <Th isArabicLayout={isArabicLayout}>
                        {t('grading.subjectScores.gpa', { defaultValue: 'Course GPA' })}
                      </Th>
                      <Th isArabicLayout={isArabicLayout}>{t('common.actions')}</Th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredRows.map((row) => (
                      <tr key={row.enrollmentId} className="hover:bg-gray-50">
                        <td
                          className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 tabular-nums ${isArabicLayout ? 'text-right' : 'text-left'}`}
                          dir="ltr"
                        >
                          {formatStudentId(row.studentId)}
                        </td>
                        <td
                          className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 ${isArabicLayout ? 'text-right' : 'text-left'}`}
                        >
                          {displayStudentName(row.student)}
                        </td>
                        <td
                          className={`px-6 py-4 whitespace-nowrap text-sm text-gray-600 ${isArabicLayout ? 'text-right' : 'text-left'}`}
                        >
                          {getLocalizedName(row.program, isArabicLayout) || '—'}
                        </td>
                        <td
                          className={`px-6 py-4 whitespace-nowrap text-sm text-gray-600 ${isArabicLayout ? 'text-right' : 'text-left'}`}
                        >
                          {row.semesterLabel}
                        </td>
                        <td
                          className={`px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900 tabular-nums ${isArabicLayout ? 'text-right' : 'text-left'}`}
                          dir="ltr"
                        >
                          {formatScore(row.score)}
                        </td>
                        <td
                          className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 ${isArabicLayout ? 'text-right' : 'text-left'}`}
                          dir="ltr"
                        >
                          {row.letter || '—'}
                        </td>
                        <td
                          className={`px-6 py-4 whitespace-nowrap text-sm tabular-nums text-gray-900 ${isArabicLayout ? 'text-right' : 'text-left'}`}
                          dir="ltr"
                        >
                          {formatGpa(row.gpa)}
                        </td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm ${isArabicLayout ? 'text-right' : 'text-left'}`}>
                          <Link
                            to={`/grading/students/${row.studentDbId}/report`}
                            className="text-primary-600 hover:text-primary-800 font-medium"
                          >
                            {t('grading.subjectScores.viewTranscript', { defaultValue: 'Transcript' })}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ isArabicLayout, label, value, icon: Icon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <div className={`flex items-start gap-3 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
        <div className={`min-w-0 flex-1 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
          <p className="text-sm text-gray-600">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums" dir="ltr">
            {value}
          </p>
        </div>
        <Icon className="w-7 h-7 text-primary-600 shrink-0 mt-0.5" aria-hidden />
      </div>
    </div>
  )
}

function Th({ children, isArabicLayout }) {
  return (
    <th
      className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}
    >
      {children}
    </th>
  )
}
