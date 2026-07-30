import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import {
  getGradingScaleFromUniversitySettings,
  getSubjectGpaFromEnrollment,
  calculateGpaWithScale,
  normalizeGradeComponent,
} from '../../utils/getCollegeSettings'
import { supabase } from '../../lib/supabase'
import { FileText, Download, Printer, Calendar } from 'lucide-react'

function displayStudentName(student, isArabicLayout) {
  if (!student) return '—'
  if (isArabicLayout) {
    const ar = [student.first_name_ar, student.last_name_ar].filter(Boolean).join(' ').trim()
    if (ar) return ar
    if (student.name_ar?.trim()) return student.name_ar.trim()
  }
  if (student.name_en?.trim()) return student.name_en.trim()
  return [student.first_name, student.last_name].filter(Boolean).join(' ').trim() || '—'
}

function formatGpaDisplay(gpa) {
  if (gpa == null || gpa === '') return '0.00'
  const n = typeof gpa === 'number' ? gpa : parseFloat(String(gpa))
  if (Number.isNaN(n)) return String(gpa)
  return n.toFixed(2)
}

/**
 * Keeps digits/LTR symbols correct while placing them on the “start” of the line.
 * Under dir=rtl, flex-start is the physical right — more reliable than text-end on dir=ltr blocks.
 */
function TranscriptValueRow({ className = '', numeric = false, children }) {
  return (
    <div className="flex w-full min-w-0 justify-start">
      <span dir={numeric ? 'ltr' : undefined} className={className}>
        {children}
      </span>
    </div>
  )
}

function normalizeSubjectCode(code) {
  return String(code || '')
    .replace(/\t/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

function enrollmentHasDisplayScore(enrollment) {
  const comp = normalizeGradeComponent(enrollment?.grade_components)
  const score = comp?.numeric_grade ?? comp?.final ?? enrollment?.numeric_grade
  return score != null && score !== '' && !Number.isNaN(Number(score))
}

function enrollmentSubjectKey(enrollment) {
  const subjectId = enrollment?.classes?.subjects?.id ?? enrollment?.classes?.subject_id
  if (subjectId != null) return `id:${subjectId}`
  const code = normalizeSubjectCode(enrollment?.classes?.subjects?.code)
  return code ? `code:${code}` : `enr:${enrollment?.id}`
}

/**
 * One row per subject per semester: keep graded enrollment over empty duplicates.
 * Drops withdrawn/dropped shells that inflate credits with empty dashes.
 */
function dedupeTranscriptEnrollments(list) {
  const active = (list || []).filter((e) => {
    const st = String(e.status || '').toLowerCase()
    return st === 'enrolled' || st === 'completed' || st === 'passed' || !st
  })

  const bySemSubject = new Map()
  for (const e of active) {
    const key = `${e.semester_id ?? 'x'}::${enrollmentSubjectKey(e)}`
    const prev = bySemSubject.get(key)
    if (!prev) {
      bySemSubject.set(key, e)
      continue
    }
    const prevScored = enrollmentHasDisplayScore(prev)
    const nextScored = enrollmentHasDisplayScore(e)
    if (nextScored && !prevScored) {
      bySemSubject.set(key, e)
    } else if (nextScored === prevScored && (e.id || 0) > (prev.id || 0)) {
      bySemSubject.set(key, e)
    }
  }
  return [...bySemSubject.values()]
}

export default function Transcripts() {
  const { studentId } = useParams()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabicLayout =
    isRTL ||
    language === 'ar' ||
    i18n?.language?.toLowerCase()?.startsWith('ar') ||
    (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl')

  const [student, setStudent] = useState(null)
  const [enrollments, setEnrollments] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [gradingScale, setGradingScale] = useState([])

  const dateLocale = isArabicLayout ? 'ar' : undefined

  const gradeStatusLabel = (status) => {
    if (!status) return '—'
    const key = `grading.transcripts.gradeComponentStatus.${status}`
    const translated = t(key)
    return translated === key ? status : translated
  }

  useEffect(() => {
    if (!studentId) {
      setStudent(null)
      setEnrollments([])
      setLoadError(false)
      setLoading(false)
      return
    }
    setLoadError(false)
    fetchStudentData()
    fetchEnrollments()
  }, [studentId])

  useEffect(() => {
    const fetchScale = async () => {
      const scale = await getGradingScaleFromUniversitySettings()
      setGradingScale(scale)
    }
    fetchScale()
  }, [])

  const fetchStudentData = async () => {
    if (!studentId) return
    try {
      setLoading(true)
      setLoadError(false)
      const { data, error } = await supabase
        .from('students')
        .select(`
          *,
          majors(id, name_en, name_ar),
          colleges(id, name_en, name_ar)
        `)
        .eq('id', studentId)
        .single()

      if (error) throw error
      if (!data) throw new Error('Student not found')
      setStudent(data)
    } catch (err) {
      console.error('Error fetching student:', err)
      setStudent(null)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  const fetchEnrollments = async () => {
    if (!studentId) return
    try {
      const { data, error } = await supabase
        .from('enrollments')
        .select(`
          *,
          classes(
            id,
            code,
            subject_id,
            subjects(id, name_en, name_ar, code, credit_hours)
          ),
          semesters(id, name_en, name_ar, code, start_date, end_date),
          grade_components(
            numeric_grade,
            final,
            letter_grade,
            gpa_points,
            status
          )
        `)
        .eq('student_id', studentId)
        .order('semesters(start_date)', { ascending: false })

      if (error) throw error
      setEnrollments(data || [])
    } catch (err) {
      console.error('Error fetching enrollments:', err)
    }
  }

  const groupBySemester = (list) => {
    const grouped = {}
    list.forEach((enrollment) => {
      const semesterId = enrollment.semester_id
      if (!grouped[semesterId]) {
        grouped[semesterId] = {
          semester: enrollment.semesters,
          enrollments: [],
        }
      }
      grouped[semesterId].enrollments.push(enrollment)
    })
    return grouped
  }

  const handlePrint = () => {
    window.print()
  }

  const handleExportPDF = () => {
    alert(t('grading.transcripts.exportSoon'))
  }

  const semesterGroups = useMemo(
    () => groupBySemester(dedupeTranscriptEnrollments(enrollments)),
    [enrollments]
  )
  const transcriptEnrollments = useMemo(
    () => dedupeTranscriptEnrollments(enrollments),
    [enrollments]
  )
  const cumulativeGpaResult = useMemo(
    () => calculateGpaWithScale(transcriptEnrollments, gradingScale),
    [transcriptEnrollments, gradingScale]
  )
  const cumulativeGPA = cumulativeGpaResult.gpa
  const totalCreditsAttempted = transcriptEnrollments.reduce(
    (sum, e) => sum + (e.classes?.subjects?.credit_hours || 0),
    0
  )
  const totalCreditsEarned = transcriptEnrollments
    .filter((e) => {
      const { points } = getSubjectGpaFromEnrollment(e, gradingScale)
      return points != null && points > 0
    })
    .reduce((sum, e) => sum + (e.classes?.subjects?.credit_hours || 0), 0)

  const thClass = `px-4 py-3 text-xs font-medium text-gray-500 uppercase ${isArabicLayout ? 'text-right' : 'text-left'}`
  const cellClass = `px-4 py-3 text-sm text-gray-900 ${isArabicLayout ? 'text-right' : 'text-left'}`

  if (!studentId) {
    return (
      <div className="space-y-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
        <div className={isArabicLayout ? 'text-right' : 'text-left'}>
          <h1 className="text-3xl font-bold text-gray-900">{t('grading.transcripts.title')}</h1>
          <p className="text-gray-600 mt-1">{t('grading.transcripts.subtitle')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-lg">
          <h2 className={`text-lg font-semibold text-gray-900 mb-2 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
            {t('grading.transcripts.pickStudentTitle')}
          </h2>
          <p className={`text-gray-600 mb-6 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
            {t('grading.transcripts.pickStudentBody')}
          </p>
          <button
            type="button"
            onClick={() => navigate('/grading/students')}
            className="px-4 py-2 bg-primary-gradient text-white rounded-lg font-medium hover:shadow-lg transition-all"
          >
            {t('grading.transcripts.goToStudentGrades')}
          </button>
        </div>
      </div>
    )
  }

  if (loading && !student) {
    return (
      <div className="flex items-center justify-center min-h-screen" dir={isArabicLayout ? 'rtl' : 'ltr'}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!student && loadError) {
    return (
      <div className="space-y-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
        <div className={isArabicLayout ? 'text-right' : 'text-left'}>
          <h1 className="text-3xl font-bold text-gray-900">{t('grading.transcripts.title')}</h1>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-red-200 p-8 max-w-lg">
          <p className={`text-red-700 mb-4 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
            {t('grading.transcripts.loadFailed')}
          </p>
          <button
            type="button"
            onClick={() => navigate('/grading/students')}
            className="px-4 py-2 bg-primary-gradient text-white rounded-lg font-medium hover:shadow-lg transition-all"
          >
            {t('grading.transcripts.goToStudentGrades')}
          </button>
        </div>
      </div>
    )
  }

  if (!student) {
    return (
      <div className="flex items-center justify-center min-h-screen" dir={isArabicLayout ? 'rtl' : 'ltr'}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className={isArabicLayout ? 'text-right' : 'text-left'}>
          <h1 className="text-3xl font-bold text-gray-900">{t('grading.transcripts.title')}</h1>
          <p className="text-gray-600 mt-1">{t('grading.transcripts.subtitle')}</p>
        </div>
        <div className={`flex flex-wrap gap-3 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-primary-gradient text-white rounded-lg hover:shadow-lg transition-all"
          >
            <Printer className="w-5 h-5 shrink-0" />
            <span>{t('grading.transcripts.print')}</span>
          </button>
          <button
            type="button"
            onClick={handleExportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-primary-gradient text-white rounded-lg hover:shadow-lg transition-all"
          >
            <Download className="w-5 h-5 shrink-0" />
            <span>{t('grading.transcripts.exportPdf')}</span>
          </button>
        </div>
      </div>

      <div
        className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 print:shadow-none"
        dir={isArabicLayout ? 'rtl' : 'ltr'}
      >
        <div className="bg-primary-gradient text-white p-6 rounded-lg mb-6">
          <h2 className={`text-2xl font-bold ${isArabicLayout ? 'text-right' : 'text-left'}`}>
            {t('grading.transcripts.cardTitle')}
          </h2>
          <p className={`text-sm opacity-90 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
            {t('grading.transcripts.cardSubtitle')}
          </p>
        </div>

        <div
          className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6"
          dir={isArabicLayout ? 'rtl' : 'ltr'}
        >
          <div className={`min-w-0 w-full ${isArabicLayout ? 'text-right' : 'text-left'}`}>
            <h3 className="text-sm font-medium text-gray-500 mb-2">{t('grading.transcripts.studentName')}</h3>
            <p className="text-lg font-semibold text-gray-900">{displayStudentName(student, isArabicLayout)}</p>
            <h3 className="text-sm font-medium text-gray-500 mb-2 mt-4">{t('grading.transcripts.studentId')}</h3>
            <TranscriptValueRow className="text-lg font-semibold text-gray-900" numeric>
              {student.student_id}
            </TranscriptValueRow>
            <h3 className="text-sm font-medium text-gray-500 mb-2 mt-4">{t('grading.transcripts.program')}</h3>
            <p className="text-lg font-semibold text-gray-900">
              {getLocalizedName(student.colleges, isArabicLayout) || '—'}
            </p>
            <h3 className="text-sm font-medium text-gray-500 mb-2 mt-4">{t('grading.transcripts.major')}</h3>
            <p className="text-lg font-semibold text-gray-900">
              {getLocalizedName(student.majors, isArabicLayout) || '—'}
            </p>
          </div>
          <div className={`min-w-0 w-full ${isArabicLayout ? 'text-right' : 'text-left'}`}>
            <h3 className="text-sm font-medium text-gray-500 mb-2">{t('grading.transcripts.totalGpa')}</h3>
            <TranscriptValueRow className="text-2xl font-bold text-gray-900" numeric>
              {formatGpaDisplay(cumulativeGPA)}
            </TranscriptValueRow>
            <h3 className="text-sm font-medium text-gray-500 mb-2 mt-4">{t('grading.transcripts.creditsAttempted')}</h3>
            <TranscriptValueRow className="text-lg font-semibold text-gray-900" numeric>
              {totalCreditsAttempted}
            </TranscriptValueRow>
            <h3 className="text-sm font-medium text-gray-500 mb-2 mt-4">{t('grading.transcripts.creditsEarned')}</h3>
            <TranscriptValueRow className="text-lg font-semibold text-gray-900" numeric>
              {totalCreditsEarned}
            </TranscriptValueRow>
            <h3 className="text-sm font-medium text-gray-500 mb-2 mt-4">{t('grading.transcripts.academicStanding')}</h3>
            <TranscriptValueRow className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
              {t('grading.transcripts.goodStanding')}
            </TranscriptValueRow>
          </div>
        </div>

        {Object.values(semesterGroups).map((group) => {
          const semester = group.semester
          const semesterEnrollments = group.enrollments
          const semesterGpaResult = calculateGpaWithScale(semesterEnrollments, gradingScale, semester?.id)
          const semesterGPA = semesterGpaResult.gpa
          const semesterCredits = semesterEnrollments.reduce(
            (sum, e) => sum + (e.classes?.subjects?.credit_hours || 0),
            0
          )
          const semesterEarned = semesterEnrollments
            .filter((e) => {
              const { points } = getSubjectGpaFromEnrollment(e, gradingScale)
              return points != null && points > 0
            })
            .reduce((sum, e) => sum + (e.classes?.subjects?.credit_hours || 0), 0)

          const semName = getLocalizedName(semester, isArabicLayout) || semester?.code || '—'
          const semYear = (() => {
            const code = semester?.code || ''
            const m = code.match(/(\d{4}-\d{4})/)
            if (m) return m[1]
            if (semester?.start_date) return String(new Date(semester.start_date).getFullYear())
            return ''
          })()

          return (
            <div key={semester?.id || semName} className="mb-8">
              <div
                className={`flex items-center gap-2 mb-4 ${isArabicLayout ? 'flex-row-reverse justify-end' : ''}`}
              >
                <Calendar className="w-5 h-5 text-primary-600 shrink-0" />
                <h3 className="text-xl font-bold text-gray-900">
                  {t('grading.transcripts.semesterHeader', { name: semName, year: semYear })}
                </h3>
              </div>
              <p className={`text-sm text-gray-600 mb-4 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
                {t('grading.transcripts.semesterSummary', {
                  gpa: formatGpaDisplay(semesterGPA),
                  earned: semesterEarned,
                  attempted: semesterCredits,
                })}
              </p>

              <div className="overflow-x-auto">
                <table className="w-full" dir={isArabicLayout ? 'rtl' : 'ltr'}>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className={thClass}>{t('grading.transcripts.courseCode')}</th>
                      <th className={thClass}>{t('grading.transcripts.courseTitle')}</th>
                      <th className={thClass}>{t('grading.transcripts.creditsCol')}</th>
                      <th className={thClass}>{t('grading.transcripts.score', { defaultValue: 'Score' })}</th>
                      <th className={thClass}>{t('grading.transcripts.grade')}</th>
                      <th className={thClass}>{t('grading.transcripts.subjectGpa')}</th>
                      <th className={thClass}>{t('grading.transcripts.status')}</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {semesterEnrollments.map((enrollment) => {
                      const grade = normalizeGradeComponent(enrollment.grade_components)
                      const { points: subjectGpa, letter } = getSubjectGpaFromEnrollment(enrollment, gradingScale)
                      const letterGrade = grade?.letter_grade || letter || enrollment.grade || '—'
                      const scoreRaw =
                        grade?.numeric_grade ?? grade?.final ?? enrollment.numeric_grade ?? null
                      const score =
                        scoreRaw != null && scoreRaw !== '' && !Number.isNaN(Number(scoreRaw))
                          ? Number(scoreRaw)
                          : null
                      const statusValue = grade?.status || (letterGrade !== '—' ? 'final' : null)
                      const subj = enrollment.classes?.subjects
                      return (
                        <tr key={enrollment.id}>
                          <td className={`${cellClass} whitespace-nowrap`}>
                            <TranscriptValueRow className="text-sm text-gray-900" numeric>
                              {normalizeSubjectCode(subj?.code) || '—'}
                            </TranscriptValueRow>
                          </td>
                          <td className={cellClass}>{getLocalizedName(subj, isArabicLayout) || '—'}</td>
                          <td className={`${cellClass} whitespace-nowrap`}>
                            <TranscriptValueRow className="text-sm text-gray-900" numeric>
                              {subj?.credit_hours ?? 0}
                            </TranscriptValueRow>
                          </td>
                          <td className={`${cellClass} whitespace-nowrap`}>
                            <TranscriptValueRow className="text-sm text-gray-900" numeric>
                              {score != null ? score.toFixed(score % 1 === 0 ? 0 : 2) : '—'}
                            </TranscriptValueRow>
                          </td>
                          <td className={`${cellClass} whitespace-nowrap`}>
                            <TranscriptValueRow className="text-sm text-gray-900" numeric>
                              {letterGrade}
                            </TranscriptValueRow>
                          </td>
                          <td className={`${cellClass} whitespace-nowrap`}>
                            <TranscriptValueRow className="text-sm text-gray-900" numeric>
                              {subjectGpa != null ? subjectGpa.toFixed(2) : '—'}
                            </TranscriptValueRow>
                          </td>
                          <td className={cellClass}>{gradeStatusLabel(statusValue)}</td>
                        </tr>
                      )
                    })}
                    <tr className="bg-gray-50 font-semibold">
                      <td colSpan={2} className={cellClass}>
                        {t('grading.transcripts.semesterTotals')}
                      </td>
                      <td className={`${cellClass} whitespace-nowrap`}>
                        <TranscriptValueRow className="text-sm text-gray-900" numeric>
                          {semesterCredits}
                        </TranscriptValueRow>
                      </td>
                      <td className={cellClass} />
                      <td className={cellClass}>
                        {t('grading.transcripts.semesterTotalsGpa', { gpa: formatGpaDisplay(semesterGPA) })}
                      </td>
                      <td className={cellClass}>
                        {t('grading.transcripts.semesterTotalsEarned', { earned: semesterEarned })}
                      </td>
                      <td className={cellClass} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}

        <div className="border-t pt-6 mt-6">
          <div
            className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6"
            dir={isArabicLayout ? 'rtl' : 'ltr'}
          >
            <div className={`min-w-0 w-full ${isArabicLayout ? 'text-right' : 'text-left'}`}>
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                {t('grading.transcripts.totalCreditsAttempted')}
              </h3>
              <TranscriptValueRow className="text-lg font-semibold text-gray-900" numeric>
                {totalCreditsAttempted}
              </TranscriptValueRow>
            </div>
            <div className={`min-w-0 w-full ${isArabicLayout ? 'text-right' : 'text-left'}`}>
              <h3 className="text-sm font-medium text-gray-500 mb-2">
                {t('grading.transcripts.totalCreditsEarned')}
              </h3>
              <TranscriptValueRow className="text-lg font-semibold text-gray-900" numeric>
                {totalCreditsEarned}
              </TranscriptValueRow>
            </div>
            <div className={`min-w-0 w-full ${isArabicLayout ? 'text-right' : 'text-left'}`}>
              <h3 className="text-sm font-medium text-gray-500 mb-2">{t('grading.transcripts.totalGpa')}</h3>
              <TranscriptValueRow className="text-lg font-semibold text-gray-900" numeric>
                {formatGpaDisplay(cumulativeGPA)}
              </TranscriptValueRow>
            </div>
            <div className={`min-w-0 w-full ${isArabicLayout ? 'text-right' : 'text-left'}`}>
              <h3 className="text-sm font-medium text-gray-500 mb-2">{t('grading.transcripts.academicStanding')}</h3>
              <TranscriptValueRow className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                {t('grading.transcripts.goodStanding')}
              </TranscriptValueRow>
            </div>
          </div>
        </div>

        {gradingScale.length > 0 && (
          <div
            className={`border-t pt-6 mt-6 ${isArabicLayout ? 'text-right' : 'text-left'}`}
            dir={isArabicLayout ? 'rtl' : 'ltr'}
          >
            <h3 className="text-sm font-medium text-gray-500 mb-2">{t('grading.transcripts.gradingScaleUni')}</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              {gradingScale.map((g, idx) => (
                <span key={idx}>
                  {t('grading.transcripts.scaleItem', {
                    letter: g.letter,
                    min: g.minPercent,
                    max: g.maxPercent,
                    points: g.points,
                  })}
                  {idx < gradingScale.length - 1 ? (isArabicLayout ? ' ،' : ', ') : ''}
                </span>
              ))}
            </p>
          </div>
        )}

        <div
          className={`border-t pt-6 mt-6 text-sm text-gray-500 ${isArabicLayout ? 'text-right' : 'text-center'}`}
          dir={isArabicLayout ? 'rtl' : 'ltr'}
        >
          <p>
            {t('grading.transcripts.generatedOn', {
              date: new Date().toLocaleDateString(dateLocale || 'en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              }),
            })}
          </p>
          <p className={`mt-2 ${isArabicLayout ? 'text-right' : ''}`} dir={isArabicLayout ? 'rtl' : 'ltr'}>
            <span className="inline-flex items-center gap-1.5 align-middle">
              {isArabicLayout ? (
                <>
                  <span>{t('grading.transcripts.officialStatement')}</span>
                  <FileText className="w-4 h-4 shrink-0" />
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 shrink-0" />
                  <span>{t('grading.transcripts.officialStatement')}</span>
                </>
              )}
            </span>
          </p>
          <p className="mt-4">
            {t('grading.transcripts.registrarSignature')}
          </p>
        </div>
      </div>
    </div>
  )
}
