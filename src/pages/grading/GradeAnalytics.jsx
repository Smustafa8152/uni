import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCollege } from '../../contexts/CollegeContext'
import { TrendingUp, BarChart3, Users, Award } from 'lucide-react'

function StatCard({ isArabicLayout, label, value, subline, icon: Icon, valueClassName = 'text-2xl' }) {
  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
      dir={isArabicLayout ? 'rtl' : 'ltr'}
    >
      <div className={`flex items-start gap-3 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
        <div className={`min-w-0 flex-1 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
          <p className="text-sm text-gray-600">{label}</p>
          <p
            className={`${valueClassName} font-bold text-gray-900 mt-1 tabular-nums ${isArabicLayout ? 'text-right' : 'text-left'}`}
            dir="ltr"
          >
            {value}
          </p>
          {subline ? (
            <p className={`text-xs text-gray-500 mt-4 ${isArabicLayout ? 'text-right' : 'text-left'}`}>{subline}</p>
          ) : null}
        </div>
        <Icon className="w-8 h-8 text-primary-600 shrink-0 mt-0.5" aria-hidden />
      </div>
    </div>
  )
}

export default function GradeAnalytics() {
  const { t, i18n } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabicLayout =
    isRTL ||
    language === 'ar' ||
    i18n?.language?.toLowerCase()?.startsWith('ar') ||
    (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl')
  const { userRole, collegeId: authCollegeId } = useAuth()
  const { selectedCollegeId } = useCollege()
  const [classes, setClasses] = useState([])
  const [selectedClass, setSelectedClass] = useState('')
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(false)
  const [collegeId, setCollegeId] = useState(null)

  useEffect(() => {
    if (userRole === 'admin' && selectedCollegeId) {
      setCollegeId(selectedCollegeId)
    } else if (userRole === 'user' && authCollegeId) {
      setCollegeId(authCollegeId)
    }
    fetchClasses()
  }, [userRole, selectedCollegeId, authCollegeId])

  useEffect(() => {
    if (selectedClass) {
      fetchAnalytics()
    } else {
      setAnalytics(null)
    }
  }, [selectedClass])

  const fetchClasses = async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('classes')
        .select(`
          id,
          code,
          subjects(id, name_en, name_ar, code)
        `)
        .eq('status', 'active')
        .order('code')

      if (collegeId) {
        query = query.eq('college_id', collegeId)
      } else if (userRole === 'user' && authCollegeId) {
        query = query.eq('college_id', authCollegeId)
      }

      const { data, error } = await query
      if (error) throw error
      setClasses(data || [])
    } catch (err) {
      console.error('Error fetching classes:', err)
    } finally {
      setLoading(false)
    }
  }

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      
      // Fetch enrollments with grades
      const { data: enrollments, error: enrollmentsError } = await supabase
        .from('enrollments')
        .select(`
          id,
          grade_components(numeric_grade, letter_grade, gpa_points, status)
        `)
        .eq('class_id', selectedClass)
        .eq('status', 'enrolled')

      if (enrollmentsError) throw enrollmentsError

      // Calculate analytics
      const grades = enrollments
        .map((e) => {
          const raw = e.grade_components
          return Array.isArray(raw) ? raw[0] : raw
        })
        .filter((g) => g && g.numeric_grade !== null)

      if (grades.length === 0) {
        setAnalytics({
          totalStudents: enrollments.length,
          gradedStudents: 0,
          pendingStudents: enrollments.length,
          averageGrade: null,
          medianGrade: null,
          highestGrade: null,
          lowestGrade: null,
          passRate: 0,
          failRate: 0,
          gradeDistribution: {},
        })
        return
      }

      const numericGrades = grades.map(g => g.numeric_grade).sort((a, b) => a - b)
      const averageGrade = numericGrades.reduce((a, b) => a + b, 0) / numericGrades.length
      const medianGrade = numericGrades.length % 2 === 0
        ? (numericGrades[numericGrades.length / 2 - 1] + numericGrades[numericGrades.length / 2]) / 2
        : numericGrades[Math.floor(numericGrades.length / 2)]
      const highestGrade = Math.max(...numericGrades)
      const lowestGrade = Math.min(...numericGrades)

      const passingGrades = grades.filter(g => g.gpa_points && g.gpa_points >= 2.0)
      const failingGrades = grades.filter(g => !g.gpa_points || g.gpa_points < 2.0)
      const passRate = (passingGrades.length / grades.length) * 100
      const failRate = (failingGrades.length / grades.length) * 100

      // Grade distribution
      const gradeDistribution = {}
      grades.forEach(grade => {
        const letter = grade.letter_grade || 'N/A'
        gradeDistribution[letter] = (gradeDistribution[letter] || 0) + 1
      })

      setAnalytics({
        totalStudents: enrollments.length,
        gradedStudents: grades.length,
        pendingStudents: enrollments.length - grades.length,
        averageGrade: averageGrade.toFixed(2),
        medianGrade: medianGrade.toFixed(2),
        highestGrade: highestGrade.toFixed(2),
        lowestGrade: lowestGrade.toFixed(2),
        passRate: passRate.toFixed(1),
        failRate: failRate.toFixed(1),
        gradeDistribution,
      })
    } catch (err) {
      console.error('Error fetching analytics:', err)
    } finally {
      setLoading(false)
    }
  }

  const selectedClassData = classes.find(c => c.id === parseInt(selectedClass))
  const subjectLabel = (classItem) =>
    classItem?.subjects ? getLocalizedName(classItem.subjects, isArabicLayout) || classItem.subjects?.name_en || 'N/A' : 'N/A'

  return (
    <div className="space-y-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
      <div className={isArabicLayout ? 'text-right' : 'text-left'}>
        <h1 className="text-3xl font-bold text-gray-900">{t('grading.gradeAnalytics.title')}</h1>
        <p className="text-gray-600 mt-1">{t('grading.gradeAnalytics.subtitle')}</p>
      </div>

      {/* Class Selection */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
        <label className={`block text-sm font-medium text-gray-700 mb-2 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
          {t('grading.gradeAnalytics.selectClass')}
        </label>
        <select
          value={selectedClass}
          onChange={(e) => setSelectedClass(e.target.value)}
          className={`w-full md:w-96 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${isArabicLayout ? 'text-right' : 'text-left'}`}
        >
          <option value="">{t('grading.gradeAnalytics.selectClassPlaceholder')}</option>
          {classes.map((classItem) => (
            <option key={classItem.id} value={classItem.id}>
              {classItem.code} — {subjectLabel(classItem)}
            </option>
          ))}
        </select>
      </div>

      {/* Analytics Display */}
      {selectedClass && analytics && (
        <div className="space-y-6">
          {/* Class Info */}
          {selectedClassData && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
              <h2 className={`text-xl font-bold text-gray-900 mb-2 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
                {subjectLabel(selectedClassData)}
              </h2>
              <p className={`text-sm text-gray-600 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
                {t('grading.gradeAnalytics.classCode')}: <span dir="ltr" className="inline-block">{selectedClassData.code}</span>
              </p>
            </div>
          )}

          {/* Statistics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              isArabicLayout={isArabicLayout}
              label={t('grading.gradeAnalytics.totalStudents')}
              value={analytics.totalStudents}
              subline={`${analytics.gradedStudents} ${t('grading.gradeAnalytics.graded')}, ${analytics.pendingStudents} ${t('grading.gradeAnalytics.pending')}`}
              icon={Users}
            />
            <StatCard
              isArabicLayout={isArabicLayout}
              label={t('grading.gradeAnalytics.averageGrade')}
              value={analytics.averageGrade ?? 'N/A'}
              icon={TrendingUp}
            />
            <StatCard
              isArabicLayout={isArabicLayout}
              label={t('grading.gradeAnalytics.median')}
              value={analytics.medianGrade ?? 'N/A'}
              icon={BarChart3}
            />
            <StatCard
              isArabicLayout={isArabicLayout}
              label={t('grading.gradeAnalytics.highestLowest')}
              value={`${analytics.highestGrade ?? 'N/A'} / ${analytics.lowestGrade ?? 'N/A'}`}
              valueClassName="text-lg"
              icon={Award}
            />
          </div>

          {/* Pass/Fail Rate */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
            <h3 className={`text-lg font-bold text-gray-900 mb-4 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
              {t('grading.gradeAnalytics.passFailRate')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <div
                  className="flex items-center gap-2 mb-2 w-full justify-between"
                  dir={isArabicLayout ? 'rtl' : 'ltr'}
                >
                  <span className="text-sm text-gray-600">{t('grading.gradeAnalytics.passRate')}</span>
                  <span className="text-lg font-bold text-green-600 tabular-nums shrink-0" dir="ltr">
                    {analytics.passRate}%
                  </span>
                </div>
                <div
                  className="w-full bg-gray-200 rounded-full h-4 overflow-hidden"
                  dir={isArabicLayout ? 'rtl' : 'ltr'}
                >
                  <div className="bg-green-500 h-4 rounded-full transition-all" style={{ width: `${analytics.passRate}%` }} />
                </div>
              </div>
              <div>
                <div
                  className="flex items-center gap-2 mb-2 w-full justify-between"
                  dir={isArabicLayout ? 'rtl' : 'ltr'}
                >
                  <span className="text-sm text-gray-600">{t('grading.gradeAnalytics.failRate')}</span>
                  <span className="text-lg font-bold text-red-600 tabular-nums shrink-0" dir="ltr">
                    {analytics.failRate}%
                  </span>
                </div>
                <div
                  className="w-full bg-gray-200 rounded-full h-4 overflow-hidden"
                  dir={isArabicLayout ? 'rtl' : 'ltr'}
                >
                  <div className="bg-red-500 h-4 rounded-full transition-all" style={{ width: `${analytics.failRate}%` }} />
                </div>
              </div>
            </div>
            <p className={`text-xs text-gray-500 mt-3 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
              {t('grading.gradeAnalytics.passRate')}: <span dir="ltr">{analytics.passRate}%</span>
            </p>
          </div>

          {/* Grade Distribution */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
            <h3 className={`text-lg font-bold text-gray-900 mb-4 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
              {t('grading.gradeAnalytics.gradeDistributionChart')}
            </h3>
            <div className="space-y-4">
              <div>
                <h4 className={`text-sm font-medium text-gray-700 mb-2 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
                  {t('grading.gradeAnalytics.gradeBreakdown')}
                </h4>
                <div className="space-y-2">
                  {Object.entries(analytics.gradeDistribution)
                    .sort((a, b) => {
                      const order = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F']
                      return order.indexOf(a[0]) - order.indexOf(b[0])
                    })
                    .map(([grade, count]) => {
                      const pct = analytics.gradedStudents > 0 ? (count / analytics.gradedStudents) * 100 : 0
                      return (
                        <div
                          key={grade}
                          className="flex items-center gap-3"
                          dir={isArabicLayout ? 'rtl' : 'ltr'}
                        >
                          <div
                            className={`w-14 shrink-0 text-sm font-medium text-gray-700 tabular-nums ${isArabicLayout ? 'text-right' : 'text-left'}`}
                            dir="ltr"
                          >
                            {grade}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div
                              className="flex items-center gap-2 mb-1 w-full justify-between"
                              dir={isArabicLayout ? 'rtl' : 'ltr'}
                            >
                              <span className="text-sm text-gray-600">
                                {count} {t('grading.gradeAnalytics.students')}
                              </span>
                              <span className="text-sm text-gray-600 tabular-nums" dir="ltr">
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                            <div
                              className="w-full bg-gray-200 rounded-full h-3 overflow-hidden"
                              dir={isArabicLayout ? 'rtl' : 'ltr'}
                            >
                              <div
                                className="bg-primary-600 h-3 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedClass && !analytics && !loading && (
        <div
          className={`bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-gray-500 ${isArabicLayout ? 'text-right' : 'text-center'}`}
          dir={isArabicLayout ? 'rtl' : 'ltr'}
        >
          <BarChart3 className={`w-12 h-12 mb-4 text-gray-400 ${isArabicLayout ? 'ms-auto' : 'mx-auto'}`} />
          <p>{t('grading.gradeAnalytics.noGradeData')}</p>
        </div>
      )}
    </div>
  )
}



