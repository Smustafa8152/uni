import { useState, useEffect, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import {
  getGradingScaleFromUniversitySettings,
  normalizeGradeComponent,
  numericGradeToGpaPoints,
} from '../../utils/getCollegeSettings'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { GraduationCap, FileText, Info } from 'lucide-react'
import {
  overlayExamScoresOnGradeComponent,
  examTypeToGradeColumn,
  examSubmissionScoreOutOf100,
} from '../../utils/syncExamGradesToGradebook'
import { getLetterFromPercent } from '../../utils/instructorGradeSheet'
import { isExamSubmissionComplete } from '../../utils/subjectExamDateTime'

const PORTAL_BG = '#1a3a6b'
const TOTAL_HOURS_DEFAULT = 120

function getLetterGradeColor(letter) {
  if (!letter) return 'text-gray-600'
  const g = String(letter).toUpperCase()
  if (g.startsWith('A')) return 'text-green-600 font-semibold'
  if (g.startsWith('B')) return 'text-blue-600 font-medium'
  if (g.startsWith('C')) return 'text-amber-600'
  if (g.startsWith('D')) return 'text-orange-600'
  return 'text-red-600'
}

function getGeneralAssessment(gpa) {
  const n = parseFloat(gpa)
  if (n >= 3.7) return 'excellent'
  if (n >= 3.3) return 'very good'
  if (n >= 2.7) return 'good'
  if (n >= 2.0) return 'pass'
  return 'conditional'
}

function isOwnExamScoreReady(exam) {
  const sub = exam?.submission
  if (!sub) return false
  if (sub.status === 'EX_DRF' && sub.submission_data?.instructor_retake) return false
  if (!isExamSubmissionComplete(sub) && sub.points_earned == null && (sub.grade == null || sub.grade === '')) {
    return false
  }
  return examSubmissionScoreOutOf100(sub, exam) != null
}

function latestExamForEnrollment(exams) {
  let best = null
  for (const ex of exams || []) {
    if (!isOwnExamScoreReady(ex)) continue
    const score = examSubmissionScoreOutOf100(ex.submission, ex)
    if (score == null) continue
    const at = ex.submission?.submitted_at ? new Date(ex.submission.submitted_at).getTime() : 0
    if (!best || at >= best.at) best = { score, at, exam: ex }
  }
  return best
}

function displayGrade(enrollment, gradingScale) {
  const latest = latestExamForEnrollment(enrollment.exams)
  const comp = normalizeGradeComponent(enrollment.grade_components)
  const raw = latest?.score ?? comp?.numeric_grade ?? enrollment.numeric_grade ?? null
  const percent =
    raw != null && raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : null
  const credits = Number(enrollment.classes?.subjects?.credit_hours) || 0
  const letter =
    percent != null
      ? getLetterFromPercent(percent, gradingScale) || comp?.letter_grade || enrollment.grade
      : comp?.letter_grade || enrollment.grade || null
  const gpa = percent != null ? numericGradeToGpaPoints(percent, gradingScale) : null
  const points = gpa != null && credits > 0 ? gpa * credits : null
  return { percent, letter, gpa, points, credits, latest }
}

function tallyGrades(list, gradingScale) {
  let pointSum = 0
  let gpaWeight = 0
  let gpaCredits = 0
  let earnedCredits = 0
  ;(list || []).forEach((e) => {
    const row = displayGrade(e, gradingScale)
    if (row.points != null) pointSum += row.points
    if (row.gpa != null && row.credits > 0) {
      gpaWeight += row.gpa * row.credits
      gpaCredits += row.credits
    }
    if (row.percent != null && row.gpa != null && row.gpa > 0 && row.credits > 0) {
      earnedCredits += row.credits
    }
  })
  const gpa = gpaCredits > 0 ? (gpaWeight / gpaCredits).toFixed(2) : '0.00'
  return { pointSum, gpa, earnedCredits, gpaCredits }
}

export default function StudentMyGrades() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(null)
  const [enrollments, setEnrollments] = useState([])
  const [gradingScale, setGradingScale] = useState([])
  const [activeSemesterId, setActiveSemesterId] = useState(null)

  useEffect(() => {
    if (user?.email) fetchStudentData()
  }, [user?.email])

  useEffect(() => {
    getGradingScaleFromUniversitySettings().then(setGradingScale)
  }, [])

  const fetchStudentData = async () => {
    if (!user?.email) return
    try {
      setLoading(true)
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select(`
          id,
          student_id,
          name_en,
          name_ar,
          first_name,
          last_name,
          email,
          gpa,
          majors(id, name_en, name_ar),
          colleges(id, name_en, name_ar)
        `)
        .eq('email', user.email)
        .eq('status', 'active')
        .single()

      if (studentError) throw studentError
      setStudent(studentData)

      const { data: activeSem } = await supabase
        .from('semesters')
        .select('id')
        .in('status', ['active', 'registration_open'])
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      setActiveSemesterId(activeSem?.id ?? null)

      const { data: enrollmentsData, error: enrollmentsError } = await supabase
        .from('enrollments')
        .select(`
          id,
          status,
          grade,
          numeric_grade,
          grade_points,
          semester_id,
          classes(
            id,
            code,
            section,
            subjects(id, name_en, name_ar, code, credit_hours)
          ),
          semesters(id, name_en, name_ar, code, start_date, end_date, status)
        `)
        .eq('student_id', studentData.id)
        .order('semester_id', { ascending: false })

      if (enrollmentsError) throw enrollmentsError

      const list = enrollmentsData || []
      const enrollmentIds = list.map((e) => e.id)
      const classIds = [...new Set(list.map((e) => e.classes?.id).filter(Boolean))]

      const gcByEnrollment = {}
      for (let i = 0; i < enrollmentIds.length; i += 200) {
        const chunk = enrollmentIds.slice(i, i + 200)
        const { data: gcs } = await supabase.from('grade_components').select('*').in('enrollment_id', chunk)
        ;(gcs || []).forEach((g) => {
          gcByEnrollment[g.enrollment_id] = g
        })
      }

      const examsByClass = {}
      const examsBySubject = {}
      if (classIds.length) {
        const subjectIds = [
          ...new Set(list.map((e) => e.classes?.subjects?.id).filter(Boolean)),
        ]
        let exams = []
        const { data: byClass } = await supabase
          .from('subject_exams')
          .select(
            'id, class_id, subject_id, title, title_ar, exam_type, status, total_points, assessment_settings, scheduled_date, start_time, end_time',
          )
          .in('class_id', classIds)
        exams = byClass || []
        if (subjectIds.length) {
          const { data: bySubject } = await supabase
            .from('subject_exams')
            .select(
              'id, class_id, subject_id, title, title_ar, exam_type, status, total_points, assessment_settings, scheduled_date, start_time, end_time',
            )
            .in('subject_id', subjectIds)
          const seen = new Set(exams.map((x) => x.id))
          ;(bySubject || []).forEach((ex) => {
            if (!seen.has(ex.id)) exams.push(ex)
          })
        }
        const examIds = exams.map((ex) => ex.id)
        let subs = []
        if (examIds.length) {
          const { data: subRows } = await supabase
            .from('exam_submissions')
            .select('id, exam_id, enrollment_id, status, points_earned, grade, submitted_at, submission_data')
            .eq('student_id', studentData.id)
            .in('exam_id', examIds)
          subs = subRows || []
        }
        const subByExam = Object.fromEntries(subs.map((s) => [s.exam_id, s]))
        exams.forEach((ex) => {
          const row = { ...ex, submission: subByExam[ex.id] || null }
          if (ex.class_id) {
            if (!examsByClass[ex.class_id]) examsByClass[ex.class_id] = []
            examsByClass[ex.class_id].push(row)
          }
          if (ex.subject_id) {
            if (!examsBySubject[ex.subject_id]) examsBySubject[ex.subject_id] = []
            examsBySubject[ex.subject_id].push(row)
          }
        })
      }

      const scale = await getGradingScaleFromUniversitySettings()
      setGradingScale(scale)
      setEnrollments(
        list.map((e) => {
          const byClass = examsByClass[e.classes?.id] || []
          const bySubject = examsBySubject[e.classes?.subjects?.id] || []
          const seen = new Set(byClass.map((x) => x.id))
          const classExams = [...byClass, ...bySubject.filter((x) => !seen.has(x.id))]
          const scores = {}
          classExams.forEach((ex) => {
            if (!isOwnExamScoreReady(ex)) return
            const col = examTypeToGradeColumn(ex.exam_type)
            const score = examSubmissionScoreOutOf100(ex.submission, ex)
            if (score != null) scores[col] = score
          })
          return {
            ...e,
            grade_components: overlayExamScoresOnGradeComponent(
              gcByEnrollment[e.id] || gcByEnrollment[Number(e.id)] || null,
              scores,
              scale,
            ),
            exams: classExams,
          }
        }),
      )
    } catch (err) {
      console.error('Error fetching student grades:', err)
    } finally {
      setLoading(false)
    }
  }

  const groupBySemester = (list) => {
    const grouped = {}
    ;(list || []).forEach((enrollment) => {
      const semesterId = enrollment.semester_id
      if (!grouped[semesterId]) {
        grouped[semesterId] = {
          semester: enrollment.semesters,
          enrollments: [],
        }
      }
      grouped[semesterId].enrollments.push(enrollment)
    })
    return Object.values(grouped).sort((a, b) => {
      const d1 = a.semester?.start_date || ''
      const d2 = b.semester?.start_date || ''
      return d2.localeCompare(d1)
    })
  }

  if (loading && !student) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-slate-600 border-t-transparent" />
      </div>
    )
  }

  if (!student) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-6 text-center">
        <GraduationCap className="w-12 h-12 mx-auto mb-3 text-amber-600" />
        <p className="text-amber-800">{t('student.myGrades.studentNotFound', 'Student record not found')}</p>
      </div>
    )
  }

  const semesterGroups = groupBySemester(enrollments)
  const totals = tallyGrades(enrollments, gradingScale)
  const displayGpa = totals.gpa
  const totalPointsSum = totals.pointSum
  const totalCreditsEarned = totals.earnedCredits

  const currentSemesterEnrollments = enrollments.filter(
    (e) => activeSemesterId != null && Number(e.semester_id) === Number(activeSemesterId),
  )
  const currentTally = tallyGrades(currentSemesterEnrollments, gradingScale)

  const studentName = getLocalizedName(student, isRTL) || `${student.first_name || ''} ${student.last_name || ''}`.trim() || student.student_id
  const specialization = getLocalizedName(student.majors, isRTL) || '—'
  const college = getLocalizedName(student.colleges, isRTL) || '—'

  return (
    <div className={`space-y-6 ${isRTL ? 'text-right' : 'text-left'}`}>
      {/* Page title — Academic record only */}
      <h1 className="text-2xl font-bold text-slate-900">
        {t('studentPortal.academicRecord', 'Academic record')}
      </h1>

      {/* Student details card — light gray, Major, College, Completed hours, Cumulative GPA (GPA in green) */}
      <div className="bg-slate-100 rounded-xl border border-slate-200 p-5">
        <div className={`flex flex-wrap gap-x-8 gap-y-3 text-sm ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
          <div>
            <span className="text-slate-500 block text-xs uppercase tracking-wide">{t('studentPortal.specialization', 'Specialization')}</span>
            <span className="font-medium text-slate-900">{specialization}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-xs uppercase tracking-wide">{t('studentPortal.college', 'College')}</span>
            <span className="font-medium text-slate-900">{college}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-xs uppercase tracking-wide">{t('studentPortal.completedHours', 'Completed hours')}</span>
            <span className="font-medium text-slate-900">{totalCreditsEarned}/{TOTAL_HOURS_DEFAULT} {t('studentPortal.hours', 'hours')}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-xs uppercase tracking-wide">{t('studentPortal.cumulativeGpa', 'Cumulative GPA')}</span>
            <span className="font-semibold text-green-600">{typeof displayGpa === 'number' ? displayGpa.toFixed(2) : displayGpa}</span>
            <span className="text-slate-600"> / 4.30</span>
          </div>
        </div>
      </div>

      {/* Current semester — grades not published yet; column order: points | Appreciation | Degree | Hours | Course Name | Course code */}
      {activeSemesterId && currentSemesterEnrollments.length > 0 && (
        <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
          <div
            className={`px-4 py-3 flex items-center justify-between text-white text-sm font-medium ${isRTL ? 'flex-row-reverse' : ''}`}
            style={{ backgroundColor: PORTAL_BG }}
          >
            <span>{t('studentPortal.gpa', 'GPA')}: {currentTally.gpa}</span>
            <span>
              {semesterGroups.find((g) => g.semester?.id === activeSemesterId)?.semester
                ? getLocalizedName(semesterGroups.find((g) => g.semester?.id === activeSemesterId).semester, isRTL)
                : t('studentPortal.currentSemester', 'Current semester')}{' '}
              — {t('studentPortal.current', 'Current')}
            </span>
          </div>
          <div className="px-4 py-3 bg-sky-50 border-b border-sky-100 flex items-start gap-2">
            <Info className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-sky-800">
              {t(
                'studentPortal.examScoresVisible',
                'Exam scores appear here after you submit. Official semester GPA is confirmed at the end of the term.',
              )}
            </p>
          </div>
          <div className="overflow-x-auto" dir={isRTL ? 'rtl' : 'ltr'}>
            <table className="w-full">
              <thead>
                <tr className="text-white text-sm font-medium" style={{ backgroundColor: '#152a4a' }}>
                  <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'}`}>{t('studentPortal.points', 'points')}</th>
                  <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'}`}>{t('studentPortal.appreciation', 'Appreciation')}</th>
                  <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'}`}>{t('studentPortal.degree', 'Degree')}</th>
                  <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'}`}>{t('studentPortal.hours', 'Hours')}</th>
                  <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'}`}>{t('studentPortal.courseName', 'Course Name')}</th>
                  <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'}`}>{t('studentPortal.courseCode', 'Course code')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {currentSemesterEnrollments.map((e) => {
                  const row = displayGrade(e, gradingScale)
                  const visibleExams = (e.exams || []).filter((ex) => isOwnExamScoreReady(ex))
                  return (
                    <Fragment key={e.id}>
                      <tr className="hover:bg-slate-50">
                        <td className={`px-4 py-3 text-sm text-slate-900 ${isRTL ? 'text-right' : 'text-left'}`}>
                          {row.points != null ? row.points.toFixed(2) : '—'}
                        </td>
                        <td className={`px-4 py-3 text-sm ${getLetterGradeColor(row.letter)} ${isRTL ? 'text-right' : 'text-left'}`}>
                          {row.letter || '—'}
                        </td>
                        <td className={`px-4 py-3 text-sm text-slate-900 ${isRTL ? 'text-right' : 'text-left'}`}>
                          {row.percent != null ? (row.percent % 1 === 0 ? row.percent : row.percent.toFixed(1)) : '—'}
                        </td>
                        <td className={`px-4 py-3 text-sm text-slate-900 ${isRTL ? 'text-right' : 'text-left'}`}>{e.classes?.subjects?.credit_hours ?? '—'}</td>
                        <td className={`px-4 py-3 text-sm text-slate-900 ${isRTL ? 'text-right' : 'text-left'}`}>{getLocalizedName(e.classes?.subjects, isRTL) || '—'}</td>
                        <td className={`px-4 py-3 text-sm text-slate-900 ${isRTL ? 'text-right' : 'text-left'}`}>{e.classes?.subjects?.code || '—'}</td>
                      </tr>
                      {visibleExams.map((ex) => {
                        const pct = examSubmissionScoreOutOf100(ex.submission, ex)
                        return (
                          <tr key={`exam-${e.id}-${ex.id}`} className="bg-slate-50/80">
                            <td className={`px-4 py-2 text-xs text-slate-500 ${isRTL ? 'text-right' : 'text-left'}`} colSpan={2}>
                              {t('studentPortal.elearning.exam', 'Exam')}:{' '}
                              {isRTL ? ex.title_ar || ex.title : ex.title}
                            </td>
                            <td className={`px-4 py-2 text-xs font-semibold text-slate-800 ${isRTL ? 'text-right' : 'text-left'}`}>
                              {ex.submission?.points_earned != null
                                ? `${ex.submission.points_earned}/${ex.total_points || 0}`
                                : '—'}
                              {pct != null ? ` (${pct}%)` : ''}
                            </td>
                            <td className={`px-4 py-2 text-xs text-slate-500 ${isRTL ? 'text-right' : 'text-left'}`} colSpan={3}>
                              {ex.exam_type || ''}
                            </td>
                          </tr>
                        )
                      })}
                    </Fragment>
                  )
                })}
                {currentSemesterEnrollments.length > 0 && (
                  <tr className="bg-slate-100 font-medium">
                    <td className={`px-4 py-3 text-sm ${isRTL ? 'text-right' : 'text-left'}`}>
                      {currentTally.pointSum ? currentTally.pointSum.toFixed(2) : '—'}
                    </td>
                    <td className={`px-4 py-3 text-sm ${isRTL ? 'text-right' : 'text-left'}`}>
                      {t('studentPortal.gpa', 'GPA')}: {currentTally.gpa}
                    </td>
                    <td className={`px-4 py-3 text-sm ${isRTL ? 'text-right' : 'text-left'}`}>—</td>
                    <td className={`px-4 py-3 text-sm ${isRTL ? 'text-right' : 'text-left'}`}>{currentTally.gpaCredits || '—'}</td>
                    <td className={`px-4 py-3 text-sm ${isRTL ? 'text-right' : 'text-left'}`} colSpan={2}>
                      {t('studentPortal.totalChapter', 'Total Chapter')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Past semesters — column order: points | Appreciation | Degree | Hours | Course Name | Course code; dark blue header, summary row */}
      {semesterGroups
        .filter((g) => Number(g.semester?.id) !== Number(activeSemesterId))
        .map((group) => {
          const semester = group.semester
          const list = group.enrollments
          const result = tallyGrades(list, gradingScale)
          const semesterCredits = list.reduce((s, e) => s + (e.classes?.subjects?.credit_hours || 0), 0)
          return (
            <div key={semester?.id} className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
              <div
                className={`px-4 py-3 flex items-center justify-between text-white text-sm font-medium ${isRTL ? 'flex-row-reverse' : ''}`}
                style={{ backgroundColor: PORTAL_BG }}
              >
                <span>{t('studentPortal.gpa', 'GPA')}: {result.gpa}</span>
                <span>{getLocalizedName(semester, isRTL) || semester?.name_en || '—'}</span>
              </div>
              <div className="overflow-x-auto" dir={isRTL ? 'rtl' : 'ltr'}>
                <table className="w-full">
                  <thead>
                    <tr className="text-white text-sm font-medium" style={{ backgroundColor: '#152a4a' }}>
                      <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'}`}>{t('studentPortal.points', 'points')}</th>
                      <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'}`}>{t('studentPortal.appreciation', 'Appreciation')}</th>
                      <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'}`}>{t('studentPortal.degree', 'Degree')}</th>
                      <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'}`}>{t('studentPortal.hours', 'Hours')}</th>
                      <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'}`}>{t('studentPortal.courseName', 'Course Name')}</th>
                      <th className={`px-4 py-3 ${isRTL ? 'text-right' : 'text-left'}`}>{t('studentPortal.courseCode', 'Course code')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {list.map((e) => {
                      const row = displayGrade(e, gradingScale)
                      return (
                        <tr key={e.id} className="hover:bg-slate-50">
                          <td className={`px-4 py-3 text-sm text-slate-900 ${isRTL ? 'text-right' : 'text-left'}`}>
                            {row.points != null ? row.points.toFixed(2) : '—'}
                          </td>
                          <td className={`px-4 py-3 text-sm ${getLetterGradeColor(row.letter)} ${isRTL ? 'text-right' : 'text-left'}`}>
                            {row.letter || '—'}
                          </td>
                          <td className={`px-4 py-3 text-sm text-slate-900 ${isRTL ? 'text-right' : 'text-left'}`}>
                            {row.percent != null ? Math.round(row.percent) : '—'}
                          </td>
                          <td className={`px-4 py-3 text-sm text-slate-900 ${isRTL ? 'text-right' : 'text-left'}`}>{e.classes?.subjects?.credit_hours ?? '—'}</td>
                          <td className={`px-4 py-3 text-sm text-slate-900 ${isRTL ? 'text-right' : 'text-left'}`}>{getLocalizedName(e.classes?.subjects, isRTL) || '—'}</td>
                          <td className={`px-4 py-3 text-sm text-slate-900 ${isRTL ? 'text-right' : 'text-left'}`}>{e.classes?.subjects?.code || '—'}</td>
                        </tr>
                      )
                    })}
                    <tr className="bg-slate-100 font-medium">
                      <td className={`px-4 py-3 text-sm ${isRTL ? 'text-right' : 'text-left'}`}>{result.pointSum ? result.pointSum.toFixed(2) : '—'}</td>
                      <td className={`px-4 py-3 text-sm ${isRTL ? 'text-right' : 'text-left'}`}>{t('studentPortal.gpa', 'GPA')}: {result.gpa}</td>
                      <td className={`px-4 py-3 text-sm ${isRTL ? 'text-right' : 'text-left'}`}>—</td>
                      <td className={`px-4 py-3 text-sm ${isRTL ? 'text-right' : 'text-left'}`}>{semesterCredits}</td>
                      <td className={`px-4 py-3 text-sm ${isRTL ? 'text-right' : 'text-left'}`} colSpan={2}>{t('studentPortal.totalChapter', 'Total Chapter')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}

      {enrollments.length === 0 && (
        <div className="bg-white rounded-xl shadow border border-slate-200 p-12 text-center text-slate-500">
          <FileText className="w-14 h-14 mx-auto mb-3 opacity-50" />
          <p>{t('student.myGrades.noGrades', 'No grades available')}</p>
        </div>
      )}

      {/* General assessment card */}
      {enrollments.length > 0 && (
        <div
          className="rounded-xl p-6 text-white"
          style={{ backgroundColor: PORTAL_BG }}
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-white/80 text-sm">{t('studentPortal.generalAssessment', 'General assessment')}</p>
              <p className="text-xl font-bold text-amber-300 mt-1">{getGeneralAssessment(displayGpa)}</p>
            </div>
            <div>
              <p className="text-white/80 text-sm">{t('studentPortal.cumulativeGpa', 'Cumulative GPA')}</p>
              <p className="text-xl font-bold text-amber-300 mt-1">{displayGpa}</p>
            </div>
            <div>
              <p className="text-white/80 text-sm">{t('studentPortal.totalPoints', 'Total points')}</p>
              <p className="text-xl font-bold mt-1">{totalPointsSum.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-white/80 text-sm">{t('studentPortal.completedHours', 'Completed hours')}</p>
              <p className="text-xl font-bold mt-1">{totalCreditsEarned}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
