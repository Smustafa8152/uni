import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { getGraduationCreditTotal, getGraduationMinGpa } from '../../utils/academicRequirementsHierarchy'
import { CheckCircle, Circle, AlertTriangle, FileText } from 'lucide-react'

const TOTAL_HOURS_DEFAULT = 120
/** Maps course_group.group_type to our bar key */
const GROUP_TYPE_TO_BAR = {
  university_requirements: 'general',
  college_requirements: 'college',
  major_core: 'mandatory',
  major_electives: 'optional',
  free_electives: 'optional',
}
const DEFAULT_REQUIREMENT_BARS = {
  general: [0, 0],
  college: [0, 0],
  mandatory: [0, 0],
  optional: [0, 0],
}

export default function StudentGraduationPath() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(null)
  const [completedHours, setCompletedHours] = useState(0)
  const [totalHoursRequired, setTotalHoursRequired] = useState(TOTAL_HOURS_DEFAULT)
  const [remainingRequirements, setRemainingRequirements] = useState([])
  const [requirementsMet, setRequirementsMet] = useState([])
  const [alerts, setAlerts] = useState([])
  const [requirementBars, setRequirementBars] = useState(DEFAULT_REQUIREMENT_BARS)
  const [displayGpa, setDisplayGpa] = useState(null)
  const [expectedGraduationText, setExpectedGraduationText] = useState(null)
  const [majorPlanName, setMajorPlanName] = useState(null)

  useEffect(() => {
    if (user?.email) fetchData()
  }, [user?.email])

  const fetchData = async () => {
    if (!user?.email) return
    try {
      setLoading(true)
      const { data: studentData, error: studentErr } = await supabase
        .from('students')
        .select('id, student_id, gpa, major_id, enrollment_date')
        .eq('email', user.email)
        .eq('status', 'active')
        .single()
      if (studentErr || !studentData) {
        setLoading(false)
        return
      }
      setStudent(studentData)

      const { data: enrollments } = await supabase
        .from('enrollments')
        .select(`
          id,
          status,
          grade,
          grade_points,
          classes(subjects(id, code, name_en, name_ar, credit_hours), semesters(name_en, name_ar))
        `)
        .eq('student_id', studentData.id)
      let completed = 0
      const met = []
      const remainingWithStatus = []
      const completedCodes = new Set()
      const completedSubjectIds = new Set()
      let totalWeightedGpa = 0
      let totalCreditsGraded = 0
      enrollments?.forEach((e) => {
        const sub = e.classes?.subjects
        if (!sub) return
        const cred = typeof sub.credit_hours === 'number' ? sub.credit_hours : parseInt(sub.credit_hours, 10) || 3
        const grade = e.grade || '—'
        const semester = getLocalizedName(e.classes?.semesters, isRTL) || '—'
        const points = e.grade_points != null ? Number(e.grade_points) : null
        if (points != null && cred > 0) {
          totalWeightedGpa += points * cred
          totalCreditsGraded += cred
        }
        // Earned only with a passing final grade: a recorded F (0 points) or a failed/withdrawn status earns nothing.
        const letter = String(e.grade || '').trim().toUpperCase()
        const failedLetter = letter.startsWith('F') || letter === 'W' || letter === 'WF'
        const hasPassingGrade = points != null ? points > 0 : letter !== '' && letter !== '—' && !failedLetter
        const notEarnedStatus = e.status === 'failed' || e.status === 'withdrawn' || e.status === 'dropped'
        const isCompleted = !notEarnedStatus && (hasPassingGrade || ((e.status === 'completed' || e.status === 'passed') && !(points === 0 || failedLetter)))
        if (isCompleted) {
          completed += cred
          completedCodes.add(sub.code)
          completedSubjectIds.add(sub.id)
          met.push({
            code: sub.code,
            name: getLocalizedName(sub, isRTL),
            hours: cred,
            grade,
            semester,
          })
        } else {
          remainingWithStatus.push({
            code: sub.code,
            name: getLocalizedName(sub, isRTL),
            hours: cred,
            recordedNow: e.status === 'enrolled',
            subjectId: sub.id,
          })
        }
      })
      setCompletedHours(completed)
      setRequirementsMet(met)
      const computedGpa = totalCreditsGraded > 0 ? totalWeightedGpa / totalCreditsGraded : null
      setDisplayGpa(computedGpa)

      // Major plan source: (1) Explicit row in student_major_sheets if set; (2) else derived from student's major —
      // we load the active major_sheet for this student's major_id (and admission year from enrollment_date).
      // To explicitly assign a plan: insert into student_major_sheets (student_id, major_sheet_id, admission_year, is_active).
      const res = await supabase
        .from('student_major_sheets')
        .select('major_sheet_id, major_sheets(id, total_credits_required, min_gpa_for_graduation, version, academic_year)')
        .eq('student_id', studentData.id)
        .eq('is_active', true)
        .maybeSingle()
      let sms = res.data

      let majorSheetId = sms?.major_sheet_id
      let ms = sms && (Array.isArray(sms.major_sheets) ? sms.major_sheets[0] : sms.major_sheets)

      if (!majorSheetId && studentData.major_id) {
        const admissionYear = studentData.enrollment_date
          ? new Date(studentData.enrollment_date).getFullYear().toString()
          : new Date().getFullYear().toString()
        let { data: majorSheetByMajor } = await supabase
          .from('major_sheets')
          .select('id, total_credits_required, min_gpa_for_graduation, version, academic_year')
          .eq('major_id', studentData.major_id)
          .eq('is_active', true)
          .ilike('academic_year', `%${admissionYear}%`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!majorSheetByMajor) {
          const fallback = await supabase
            .from('major_sheets')
            .select('id, total_credits_required, min_gpa_for_graduation, version, academic_year')
            .eq('major_id', studentData.major_id)
            .eq('is_active', true)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          majorSheetByMajor = fallback.data
        }
        if (majorSheetByMajor) {
          majorSheetId = majorSheetByMajor.id
          ms = majorSheetByMajor
        }
      }

      const bars = { ...DEFAULT_REQUIREMENT_BARS }
      let requiredSubjects = []

      if (majorSheetId && ms) {
        setTotalHoursRequired(getGraduationCreditTotal(ms, null))
        if (ms?.version || ms?.academic_year) setMajorPlanName(ms.academic_year || ms.version || null)

        const { data: groups } = await supabase
          .from('course_groups')
          .select('id, group_type, group_name_en, group_name_ar, min_credits_required')
          .eq('major_sheet_id', majorSheetId)
          .eq('is_active', true)
          .order('group_number')

        const seenRemainingCodes = new Set()
        if (groups?.length) {
          for (const grp of groups) {
            const { data: msc } = await supabase
              .from('major_sheet_courses')
              .select('subject_id, subjects(id, code, name_en, name_ar, credit_hours)')
              .eq('major_sheet_id', majorSheetId)
              .eq('course_group_id', grp.id)
            const barKey = GROUP_TYPE_TO_BAR[grp.group_type]
            if (!barKey) continue
            let groupTotal = 0
            let groupDone = 0
            msc?.forEach((row) => {
              const sub = row.subjects
              if (!sub) return
              const ch = typeof sub.credit_hours === 'number' ? sub.credit_hours : parseInt(sub.credit_hours, 10) || 3
              groupTotal += ch
              if (completedSubjectIds.has(sub.id)) groupDone += ch
              if (!completedCodes.has(sub?.code) && !seenRemainingCodes.has(sub.code)) {
                seenRemainingCodes.add(sub.code)
                const enrolled = remainingWithStatus.find(r => r.subjectId === sub.id || r.code === sub.code)
                requiredSubjects.push({
                  code: sub.code,
                  name: getLocalizedName(sub, isRTL),
                  hours: ch,
                  recordedNow: !!enrolled?.recordedNow,
                })
              }
            })
            const totalForBar = grp.min_credits_required != null && grp.min_credits_required > 0 ? grp.min_credits_required : groupTotal
            if (totalForBar > 0) bars[barKey] = [groupDone, totalForBar]
          }
        }

        const { data: mscAll } = await supabase
          .from('major_sheet_courses')
          .select('subject_id, subjects(id, code, name_en, name_ar, credit_hours)')
          .eq('major_sheet_id', majorSheetId)
        mscAll?.forEach((row) => {
          const sub = row.subjects
          if (!sub || seenRemainingCodes.has(sub.code)) return
          if (!completedCodes.has(sub?.code)) {
            seenRemainingCodes.add(sub.code)
            const enrolled = remainingWithStatus.find(r => r.code === sub.code)
            requiredSubjects.push({
              code: sub.code,
              name: getLocalizedName(sub, isRTL),
              hours: typeof sub.credit_hours === 'number' ? sub.credit_hours : parseInt(sub.credit_hours, 10) || 3,
              recordedNow: !!enrolled?.recordedNow,
            })
          }
        })
      }

      if (requiredSubjects.length === 0 && remainingWithStatus.length) {
        requiredSubjects = remainingWithStatus.map((r) => ({ ...r, subjectId: undefined }))
      } else {
        remainingWithStatus.forEach((r) => {
          if (!requiredSubjects.some(s => s.code === r.code)) requiredSubjects.push(r)
        })
      }
      setRemainingRequirements(requiredSubjects)
      setRequirementBars(bars)

      const msForAlerts = ms || null
      const minGpa = getGraduationMinGpa(msForAlerts, null)
      const gpaForAlerts = computedGpa != null ? computedGpa : (studentData.gpa != null ? Number(studentData.gpa) : null)
      const realAlerts = []
      if (gpaForAlerts != null && gpaForAlerts < minGpa) {
        realAlerts.push(t('studentPortal.lowGpaAlert', 'Your current GPA is below the minimum required for graduation ({min}). Focus on improving your grades.', { min: minGpa.toFixed(2) }))
      }
      const totalRequired = getGraduationCreditTotal(msForAlerts, null)
      const remainingH = Math.max(0, totalRequired - completed)
      if (remainingH > 0 && completed > 0) {
        const avgPerSemester = 15
        const semestersLeft = Math.ceil(remainingH / avgPerSemester)
        const now = new Date()
        const year = now.getFullYear()
        const yearsToAdd = Math.max(1, Math.ceil(semestersLeft / 2))
        const gradYear = year + yearsToAdd
        const gradYear2 = gradYear + 1
        const chapterLabel = semestersLeft <= 2 ? 'One' : 'Two'
        setExpectedGraduationText(t('studentPortal.expectedGraduationChapterValue', 'Chapter {chapter} {year1}-{year2}', {
          chapter: chapterLabel,
          year1: gradYear,
          year2: gradYear2,
        }))
      } else if (remainingH <= 0 && totalRequired > 0) {
        setExpectedGraduationText(t('studentPortal.eligibleForGraduation', 'You may be eligible for graduation. Contact your advisor.'))
      } else {
        setExpectedGraduationText(null)
      }
      setAlerts(realAlerts)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const remainingHours = Math.max(0, totalHoursRequired - completedHours)
  const completionRate = totalHoursRequired > 0 ? ((completedHours / totalHoursRequired) * 100).toFixed(1) : 0
  const gpaDisplay = displayGpa != null ? displayGpa : (student?.gpa != null ? Number(student.gpa) : 0)

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
        <p className="text-amber-800">{t('studentPortal.noStudentData')}</p>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${isRTL ? 'text-right' : 'text-left'}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('studentPortal.graduationPath')}</h1>
          <p className="text-slate-600 text-sm mt-1">{t('studentPortal.graduationPathDesc', 'Track your progress towards fulfilling graduation requirements.')}</p>
          {majorPlanName && (
            <p className="text-slate-500 text-xs mt-1">
              {t('studentPortal.majorPlan', 'Major plan')}: {majorPlanName}
            </p>
          )}
        </div>
        <Link
          to="/student/grades"
          className="inline-flex items-center gap-2 px-4 py-2 text-white rounded-lg font-medium text-sm"
          style={{ backgroundColor: '#1a3a6b' }}
        >
          <FileText className="w-4 h-4" />
          {t('studentPortal.academicRecord', 'Academic Record')}
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4 border-t-4 border-blue-500">
          <p className="text-xs font-semibold text-slate-500 uppercase">{t('studentPortal.remainingChapters', 'Remaining chapters')}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{Math.max(0, Math.ceil(remainingHours / 15)) || 5}</p>
          <p className="text-xs text-slate-500">{t('studentPortal.almost', 'almost')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4 border-t-4 border-amber-500">
          <p className="text-xs font-semibold text-slate-500 uppercase">{t('studentPortal.completionRate', 'Completion rate')}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{completionRate}%</p>
          <p className="text-xs text-slate-500">{t('studentPortal.graduationRequirements', 'Graduation requirements')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4 border-t-4 border-orange-500">
          <p className="text-xs font-semibold text-slate-500 uppercase">{t('studentPortal.remainingHours', 'Remaining hours')}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{remainingHours}</p>
          <p className="text-xs text-slate-500">{t('studentPortal.toCompleteGraduation', 'To complete graduation')}</p>
        </div>
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-4 border-t-4 border-green-500">
          <p className="text-xs font-semibold text-slate-500 uppercase">{t('studentPortal.completedHours')}</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{completedHours}</p>
          <p className="text-xs text-slate-500">{t('studentPortal.fromHours', { total: totalHoursRequired })}</p>
        </div>
      </div>

      {/* Overall progress + requirement-type bars — match reference: total bar then 4 horizontal bars */}
      <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
        <h2 className={`text-lg font-bold text-slate-900 mb-4 ${isRTL ? 'text-right' : 'text-left'}`}>
          {t('studentPortal.overallProgress', 'Overall progress towards graduation')}
        </h2>
        <div className={`flex flex-wrap items-center gap-2 mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <span className="text-slate-700 text-sm">
            {completedHours}/{totalHoursRequired} {t('studentPortal.hours', 'hours')} ({completionRate}%)
          </span>
          <span className="text-slate-500 text-sm">{t('studentPortal.totalHours', 'Total hours')}</span>
        </div>
        <div className="h-4 bg-slate-100 rounded-full overflow-hidden mb-6">
          <div className="h-full rounded-full transition-all" style={{ width: `${completionRate}%`, backgroundColor: '#1a3a6b' }} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {requirementBars.optional[1] > 0 && (
            <div>
              <p className={`text-sm text-slate-600 mb-1 ${isRTL ? 'text-right' : 'text-left'}`}>
                {requirementBars.optional[0]}/{requirementBars.optional[1]} — {t('studentPortal.optionalMajorRequirements')}
              </p>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 rounded-full" style={{ width: `${Math.min(100, (requirementBars.optional[0] / requirementBars.optional[1]) * 100)}%` }} />
              </div>
            </div>
          )}
          {requirementBars.mandatory[1] > 0 && (
            <div>
              <p className={`text-sm text-slate-600 mb-1 ${isRTL ? 'text-right' : 'text-left'}`}>
                {requirementBars.mandatory[0]}/{requirementBars.mandatory[1]} — {t('studentPortal.mandatorySpecializationRequirements')}
              </p>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-amber-600" style={{ width: `${Math.min(100, (requirementBars.mandatory[0] / requirementBars.mandatory[1]) * 100)}%` }} />
              </div>
            </div>
          )}
          {requirementBars.college[1] > 0 && (
            <div>
              <p className={`text-sm text-slate-600 mb-1 ${isRTL ? 'text-right' : 'text-left'}`}>
                {requirementBars.college[0]}/{requirementBars.college[1]} — {t('studentPortal.collegeRequirements')}
              </p>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, (requirementBars.college[0] / requirementBars.college[1]) * 100)}%`, backgroundColor: '#1a3a6b' }} />
              </div>
            </div>
          )}
          {requirementBars.general[1] > 0 && (
            <div>
              <p className={`text-sm text-slate-600 mb-1 ${isRTL ? 'text-right' : 'text-left'}`}>
                {requirementBars.general[0]}/{requirementBars.general[1]} — {t('studentPortal.generalUniversityRequirements')}
              </p>
              <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(100, (requirementBars.general[0] / requirementBars.general[1]) * 100)}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Remaining requirements — light blue badge, list with hours | status, blue/purple circle icons */}
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
          <div className={`flex flex-wrap items-center gap-2 mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <h2 className="text-lg font-bold text-slate-900">{t('studentPortal.remainingRequirements', 'Remaining requirements')}</h2>
            <span className="inline-flex px-3 py-1 bg-sky-100 text-sky-800 rounded-full text-sm font-medium">
              {remainingRequirements.length} {t('studentPortal.decisions', 'decisions')}
            </span>
          </div>
          <ul className="space-y-3 max-h-80 overflow-y-auto">
            {remainingRequirements.length === 0 ? (
              <li className="text-slate-500 text-sm">{t('studentPortal.noRemaining', 'No remaining requirements.')}</li>
            ) : (
              remainingRequirements.slice(0, 15).map((r, i) => (
                <li key={i} className={`flex items-start gap-3 text-sm ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <span className={`flex-shrink-0 mt-0.5 w-4 h-4 rounded-full border-2 ${r.recordedNow ? 'bg-blue-500 border-blue-500' : 'border-violet-300 bg-white'}`} />
                  <span className="flex-1">
                    <span className="font-medium text-slate-900">{r.code}</span>
                    <span className="text-slate-600"> — {r.name}</span>
                    <p className="text-slate-500 text-xs mt-0.5">
                      {r.hours} {t('studentPortal.hours', 'hours')}
                      {r.recordedNow ? ` | ${t('studentPortal.recordedNow', 'Recorded now')}` : ''}
                    </p>
                  </span>
                </li>
              ))
            )}
            {remainingRequirements.length > 15 && (
              <li className="text-slate-500 text-sm pt-1">{t('studentPortal.andMore', '...and {n} other courses', { n: remainingRequirements.length - 15 })}</li>
            )}
          </ul>
        </div>

        {/* Requirements met — light green badge, green square checkmark */}
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
          <div className={`flex flex-wrap items-center gap-2 mb-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <h2 className="text-lg font-bold text-slate-900">{t('studentPortal.requirementsMet', 'Requirements met')}</h2>
            <span className="inline-flex px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
              {requirementsMet.length} {t('studentPortal.decisions')}
            </span>
          </div>
          <ul className="space-y-3 max-h-80 overflow-y-auto">
            {requirementsMet.length === 0 ? (
              <li className="text-slate-500 text-sm">{t('studentPortal.noneYet', 'None yet.')}</li>
            ) : (
              requirementsMet.slice(0, 15).map((r, i) => (
                <li key={i} className={`flex items-start gap-3 text-sm ${isRTL ? 'flex-row-reverse' : ''}`}>
                  <span className="flex-shrink-0 w-5 h-5 rounded bg-green-600 flex items-center justify-center mt-0.5">
                    <CheckCircle className="w-3 h-3 text-white" strokeWidth={3} />
                  </span>
                  <span className="flex-1">
                    <span className="font-medium text-slate-900">{r.code}</span>
                    <span className="text-slate-600"> — {r.name}</span>
                    <p className="text-slate-500 text-xs mt-0.5">
                      {r.hours} {t('studentPortal.hours', 'hours')} | {t('studentPortal.grade', 'Grade')}: {r.grade} | {r.semester}
                    </p>
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>

      {/* Graduation Path Alerts — yellow box, alert: label + warning icon */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-2xl shadow-md border border-slate-200 p-6">
          <h3 className={`text-lg font-bold text-slate-900 mb-4 ${isRTL ? 'text-right' : 'text-left'}`}>
            {t('studentPortal.graduationPathAlerts', 'Graduation Path Alerts')}
          </h3>
          <div className={`bg-amber-50 border border-amber-400 rounded-lg p-4 flex items-start gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <div className="flex-1">
              {alerts.map((a, i) => (
                <p key={i} className="text-sm text-amber-900">{a}</p>
              ))}
            </div>
            <div className={`flex items-center gap-1 flex-shrink-0 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <span className="text-orange-600 text-xs font-semibold uppercase">{t('studentPortal.alertLabel', 'alert')}:</span>
              <AlertTriangle className="w-5 h-5 text-orange-500" />
            </div>
          </div>
        </div>
      )}

      {/* Expected graduation footer — dark blue strip */}
      {(expectedGraduationText || remainingHours > 0) && (
        <div
          className="rounded-xl px-6 py-4 text-white text-sm"
          style={{ backgroundColor: '#1a3a6b' }}
        >
          {expectedGraduationText ? (
            <p className={isRTL ? 'text-right' : 'text-left'}>
              {expectedGraduationText} — {t('studentPortal.expectedGraduationFooter', 'Based on your current pace of work you are expected to graduate in the academic year above.')}
            </p>
          ) : (
            <p className={isRTL ? 'text-right' : 'text-left'}>
              {t('studentPortal.remainingHoursToGraduate', 'Complete your remaining hours and meet the GPA requirement to be eligible for graduation.')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
