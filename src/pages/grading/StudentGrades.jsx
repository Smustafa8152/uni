import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
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
import { Search, GraduationCap } from 'lucide-react'

export default function StudentGrades() {
  const { t, i18n } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabicLayout =
    isRTL ||
    language === 'ar' ||
    i18n?.language?.toLowerCase()?.startsWith('ar') ||
    (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl')
  const navigate = useNavigate()
  const { userRole, collegeId: authCollegeId, departmentId } = useAuth()
  const { selectedCollegeId, colleges, setSelectedCollegeId } = useCollege()
  const [students, setStudents] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedProgram, setSelectedProgram] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState('')
  const [loading, setLoading] = useState(false)
  const [subjectsLoading, setSubjectsLoading] = useState(false)
  const [gradesLoading, setGradesLoading] = useState(false)
  const [collegeId, setCollegeId] = useState(null)
  const [gradingScale, setGradingScale] = useState([])
  const [subjectOptions, setSubjectOptions] = useState([])
  /** studentId → best enrollment row for selected subject */
  const [subjectGradeByStudent, setSubjectGradeByStudent] = useState({})

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
    if (userRole === 'admin' || ((userRole === 'user' || userRole === 'instructor') && authCollegeId)) {
      fetchStudents()
    }
  }, [userRole, collegeId, authCollegeId, departmentId])

  useEffect(() => {
    getGradingScaleFromUniversitySettings().then(setGradingScale)
  }, [])

  // Light subject list; when a program is selected, only that major's subjects
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

          // 1) Subjects with major_id = selected program
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

          // 2) College-wide subjects (all majors of college)
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

          // 3) Junction subject_majors
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

  // Load grades for selected subject via class_ids (avoids slow nested filter timeout)
  useEffect(() => {
    if (!selectedSubjectId) {
      setSubjectGradeByStudent({})
      return
    }

    let cancelled = false
    const loadSubjectGrades = async () => {
      setGradesLoading(true)
      try {
        const subjectId = Number(selectedSubjectId)

        // 1) Classes for this subject (tiny query)
        const { data: classRows, error: classErr } = await supabase
          .from('classes')
          .select('id, subject_id, subjects(id, code, name_en, name_ar, credit_hours)')
          .eq('subject_id', subjectId)
        if (classErr) throw classErr

        const classIds = (classRows || []).map((c) => c.id).filter(Boolean)
        if (!classIds.length) {
          if (!cancelled) setSubjectGradeByStudent({})
          return
        }

        const classById = new Map((classRows || []).map((c) => [c.id, c]))

        // 2) Enrollments by class_id (indexed), paginated
        const enrollments = []
        const chunkSize = 50
        for (let i = 0; i < classIds.length; i += chunkSize) {
          if (cancelled) return
          const chunk = classIds.slice(i, i + chunkSize)
          let from = 0
          const page = 500
          for (;;) {
            const { data, error } = await supabase
              .from('enrollments')
              .select('id, student_id, semester_id, class_id, numeric_grade, grade_points, grade')
              .eq('status', 'enrolled')
              .in('class_id', chunk)
              .range(from, from + page - 1)
            if (error) throw error
            if (!data?.length) break
            enrollments.push(...data)
            if (data.length < page) break
            from += page
          }
        }

        // 3) Grade components for those enrollments (batched)
        const enrollmentIds = enrollments.map((e) => e.id)
        const gcByEnrollment = new Map()
        for (let i = 0; i < enrollmentIds.length; i += 200) {
          if (cancelled) return
          const chunk = enrollmentIds.slice(i, i + 200)
          const { data: gcs, error: gcErr } = await supabase
            .from('grade_components')
            .select('enrollment_id, numeric_grade, final, gpa_points, letter_grade')
            .in('enrollment_id', chunk)
          if (gcErr) throw gcErr
          for (const gc of gcs || []) gcByEnrollment.set(gc.enrollment_id, gc)
        }

        // 4) Best row per student (highest semester_id wins)
        const byStudent = {}
        for (const e of enrollments) {
          const cls = classById.get(e.class_id)
          const row = {
            ...e,
            classes: cls
              ? {
                  id: cls.id,
                  subject_id: cls.subject_id,
                  subjects: cls.subjects,
                }
              : null,
            grade_components: gcByEnrollment.get(e.id) || null,
          }
          const sid = e.student_id
          if (!byStudent[sid] || (e.semester_id || 0) > (byStudent[sid].semester_id || 0)) {
            byStudent[sid] = row
          }
        }

        if (!cancelled) setSubjectGradeByStudent(byStudent)
      } catch (err) {
        console.error('Error fetching subject grades:', err)
        if (!cancelled) setSubjectGradeByStudent({})
      } finally {
        if (!cancelled) setGradesLoading(false)
      }
    }

    loadSubjectGrades()
    return () => {
      cancelled = true
    }
  }, [selectedSubjectId])

  const fetchStudents = async () => {
    if (userRole === 'user' && !authCollegeId) return
    if (userRole === 'instructor' && !authCollegeId) return

    try {
      setLoading(true)
      let query = supabase
        .from('students')
        .select(
          `
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
          college_id,
          colleges(id, name_en, name_ar)
        `
        )
        .eq('status', 'active')

      if (userRole === 'user' && authCollegeId) {
        query = query.eq('college_id', authCollegeId)
      } else if (userRole === 'instructor' && authCollegeId) {
        query = query.eq('college_id', authCollegeId)
        if (departmentId) {
          const { data: departmentMajors, error: majorsError } = await supabase
            .from('majors')
            .select('id')
            .eq('department_id', departmentId)
          if (majorsError) throw majorsError
          if (departmentMajors?.length) {
            query = query.in(
              'major_id',
              departmentMajors.map((m) => m.id)
            )
          } else {
            query = query.eq('major_id', -1)
          }
        }
      } else if (userRole === 'admin' && collegeId) {
        query = query.eq('college_id', collegeId)
      }

      const { data, error } = await query.order('name_en')
      if (error) throw error
      setStudents(data || [])
      setSelectedSubjectId('')
      setSubjectGradeByStudent({})
    } catch (err) {
      console.error('Error fetching students:', err)
      setStudents([])
    } finally {
      setLoading(false)
    }
  }

  const programOptions = useMemo(() => {
    const map = new Map()
    students.forEach((s) => {
      if (s.majors?.id) map.set(s.majors.id, s.majors)
    })
    return [...map.values()].sort((a, b) =>
      (getLocalizedName(a, isArabicLayout) || '').localeCompare(
        getLocalizedName(b, isArabicLayout) || '',
        isArabicLayout ? 'ar' : 'en'
      )
    )
  }, [students, isArabicLayout])

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

  const getSubjectGradeRow = (studentId) => {
    const enrollment = subjectGradeByStudent[studentId]
    if (!enrollment) return null
    const comp = normalizeGradeComponent(enrollment.grade_components)
    const { points, letter } = getSubjectGpaFromEnrollment(enrollment, gradingScale)
    const scoreRaw = comp?.numeric_grade ?? comp?.final ?? enrollment.numeric_grade ?? null
    const score =
      scoreRaw != null && scoreRaw !== '' && !Number.isNaN(Number(scoreRaw)) ? Number(scoreRaw) : null
    return {
      score,
      letter: comp?.letter_grade || letter || enrollment.grade || null,
      gpa: points,
    }
  }

  const subjectMode = Boolean(selectedSubjectId)

  const filteredStudents = useMemo(() => {
    let filtered = [...students]

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (s) =>
          s.student_id?.toLowerCase().includes(term) ||
          s.name_en?.toLowerCase().includes(term) ||
          s.name_ar?.toLowerCase().includes(term) ||
          s.first_name?.toLowerCase().includes(term) ||
          s.last_name?.toLowerCase().includes(term) ||
          s.first_name_ar?.toLowerCase().includes(term) ||
          s.last_name_ar?.toLowerCase().includes(term)
      )
    }

    if (selectedProgram) {
      filtered = filtered.filter((s) => String(s.major_id || s.majors?.id || '') === String(selectedProgram))
    }

    if (subjectMode) {
      filtered = filtered.filter((s) => subjectGradeByStudent[s.id] != null)
    }

    return filtered
  }, [students, searchTerm, selectedProgram, subjectMode, subjectGradeByStudent])

  const formatStudentId = (id) => String(id || '').replace(/^STU/i, '')
  const formatScore = (score) => {
    if (score == null) return '—'
    return score % 1 === 0 ? String(score) : score.toFixed(2)
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

  const filterCols = userRole === 'admin' ? 'md:grid-cols-2 lg:grid-cols-4' : 'md:grid-cols-2 lg:grid-cols-3'
  const busy = loading || (subjectMode && gradesLoading)

  return (
    <div className="space-y-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
      <div className={isArabicLayout ? 'text-right' : 'text-left'} dir={isArabicLayout ? 'rtl' : 'ltr'}>
        <h1 className="text-3xl font-bold text-gray-900">{t('grading.studentGrades.title')}</h1>
        <p className="text-gray-600 mt-1">{t('grading.studentGrades.subtitle')}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className={`grid grid-cols-1 gap-4 ${filterCols}`} dir={isArabicLayout ? 'rtl' : 'ltr'}>
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
                placeholder={t('grading.studentGrades.searchPlaceholder')}
                className={`w-full ${isArabicLayout ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4 text-left'} py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
              />
            </div>
          </div>
          <div>
            <label
              className={`block text-sm font-medium text-gray-700 mb-2 ${isArabicLayout ? 'text-right' : 'text-left'}`}
            >
              {t('grading.studentGrades.program')}
            </label>
            <select
              value={selectedProgram}
              onChange={(e) => setSelectedProgram(e.target.value)}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isArabicLayout ? 'text-right' : 'text-left'}`}
            >
              <option value="">{t('grading.studentGrades.allPrograms')}</option>
              {programOptions.map((major) => (
                <option key={major.id} value={String(major.id)}>
                  {getLocalizedName(major, isArabicLayout)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              className={`block text-sm font-medium text-gray-700 mb-2 ${isArabicLayout ? 'text-right' : 'text-left'}`}
            >
              {t('grading.studentGrades.subject')}
            </label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              disabled={subjectsLoading}
              className={`w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isArabicLayout ? 'text-right' : 'text-left'}`}
            >
              <option value="">{t('grading.studentGrades.allSubjects')}</option>
              {sortedSubjects.map((subj) => (
                <option key={subj.id} value={String(subj.id)}>
                  {getLocalizedName(subj, isArabicLayout) || subj.code}
                  {subj.code ? ` (${subj.code})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!subjectMode && (
          <p className={`mt-3 text-sm text-gray-500 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
            {t('grading.studentGrades.selectSubjectHint', {
              defaultValue: 'Select a subject to view score, letter grade, and course GPA for that course only.',
            })}
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className={`text-xl font-bold text-gray-900 mb-4 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
          {t('grading.studentGrades.students')} ({filteredStudents.length})
          {subjectMode && (
            <span className="text-sm font-normal text-gray-500 ms-2">
              — {t('grading.studentGrades.subjectGradesOnly')}
            </span>
          )}
        </h2>
        {busy ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <GraduationCap className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>
              {subjectMode
                ? t('grading.studentGrades.noStudentsForSubject')
                : t('grading.studentGrades.noStudentsFound')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" dir={isArabicLayout ? 'rtl' : 'ltr'}>
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}
                  >
                    {t('grading.studentGrades.studentId')}
                  </th>
                  <th
                    className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}
                  >
                    {t('grading.studentGrades.name')}
                  </th>
                  <th
                    className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}
                  >
                    {t('grading.studentGrades.program')}
                  </th>
                  {subjectMode ? (
                    <>
                      <th
                        className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}
                      >
                        {t('grading.studentGrades.score')}
                      </th>
                      <th
                        className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}
                      >
                        {t('grading.studentGrades.letterGrade')}
                      </th>
                      <th
                        className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}
                      >
                        {t('grading.studentGrades.subjectGpa')}
                      </th>
                    </>
                  ) : (
                    <th
                      className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}
                    >
                      {t('grading.studentGrades.selectSubjectToView', {
                        defaultValue: 'Grades',
                      })}
                    </th>
                  )}
                  <th
                    className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}
                  >
                    {t('grading.studentGrades.status')}
                  </th>
                  <th
                    className={`px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${isArabicLayout ? 'text-right' : 'text-left'}`}
                  >
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredStudents.map((student) => {
                  const subjectGrade = subjectMode ? getSubjectGradeRow(student.id) : null
                  return (
                    <tr key={student.id} className="hover:bg-gray-50">
                      <td
                        className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 ${isArabicLayout ? 'text-right' : 'text-left'}`}
                        dir="ltr"
                      >
                        {formatStudentId(student.student_id)}
                      </td>
                      <td
                        className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 ${isArabicLayout ? 'text-right' : 'text-left'}`}
                      >
                        {displayStudentName(student)}
                      </td>
                      <td
                        className={`px-6 py-4 whitespace-nowrap text-sm text-gray-500 ${isArabicLayout ? 'text-right' : 'text-left'}`}
                      >
                        {getLocalizedName(student.majors, isArabicLayout) || '—'}
                      </td>
                      {subjectMode ? (
                        <>
                          <td
                            className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 ${isArabicLayout ? 'text-right' : 'text-left'}`}
                            dir="ltr"
                          >
                            {formatScore(subjectGrade?.score)}
                          </td>
                          <td
                            className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 ${isArabicLayout ? 'text-right' : 'text-left'}`}
                            dir="ltr"
                          >
                            {subjectGrade?.letter || '—'}
                          </td>
                          <td
                            className={`px-6 py-4 whitespace-nowrap text-sm text-gray-900 ${isArabicLayout ? 'text-right' : 'text-left'}`}
                            dir="ltr"
                          >
                            {subjectGrade?.gpa != null ? Number(subjectGrade.gpa).toFixed(2) : '—'}
                          </td>
                        </>
                      ) : (
                        <td
                          className={`px-6 py-4 whitespace-nowrap text-sm text-gray-400 ${isArabicLayout ? 'text-right' : 'text-left'}`}
                        >
                          {t('grading.studentGrades.selectSubjectHintShort', {
                            defaultValue: 'Select a subject',
                          })}
                        </td>
                      )}
                      <td className={`px-6 py-4 whitespace-nowrap ${isArabicLayout ? 'text-right' : 'text-left'}`}>
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                          {t('grading.studentGrades.active')}
                        </span>
                      </td>
                      <td
                        className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${isArabicLayout ? 'text-right' : 'text-left'}`}
                      >
                        <button
                          type="button"
                          onClick={() => navigate(`/grading/students/${student.id}/report`)}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          {t('grading.studentGrades.viewReport')}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
