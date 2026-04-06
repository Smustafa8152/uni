import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, BookOpen, Search, Eye, Edit } from 'lucide-react'

export default function Subjects() {
  const { t, i18n } = useTranslation()
  const { isRTL } = useLanguage()
  const isArabicLayout = isRTL ||
    i18n?.language?.toLowerCase()?.startsWith('ar') ||
    (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl')
  const navigate = useNavigate()
  const { userRole, collegeId } = useAuth()
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [majorFilter, setMajorFilter] = useState('')
  const [collegeFilter, setCollegeFilter] = useState('')

  useEffect(() => {
    fetchSubjects()
  }, [collegeId, userRole])

  const fetchSubjects = async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('subjects')
        .select('*, majors(id, name_en, name_ar, code), colleges(id, name_en, name_ar, code)')
        .eq('status', 'active')
        .order('code')

      if (userRole === 'user' && collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      }

      const { data, error } = await query
      if (error) throw error
      setSubjects(data || [])
    } catch (err) {
      console.error('Error fetching subjects:', err)
    } finally {
      setLoading(false)
    }
  }

  const subjectsMatchingCollegeFilter = useMemo(
    () =>
      subjects.filter((subject) => {
        if (!collegeFilter) return true
        if (collegeFilter === 'university_wide') return subject.is_university_wide
        return String(subject.college_id || subject.colleges?.id || '') === collegeFilter
      }),
    [subjects, collegeFilter]
  )

  const majorFilterOptions = useMemo(
    () =>
      [...new Map(
        subjectsMatchingCollegeFilter
          .filter((s) => s.majors?.id)
          .map((s) => [s.majors.id, s.majors])
      ).values()],
    [subjectsMatchingCollegeFilter]
  )

  useEffect(() => {
    if (!majorFilter) return
    const allowed = new Set(majorFilterOptions.map((m) => String(m.id)))
    if (!allowed.has(majorFilter)) setMajorFilter('')
  }, [collegeFilter, majorFilterOptions, majorFilter])

  const filteredSubjects = subjects.filter(subject => {
    const name = getLocalizedName(subject, isRTL)
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subject.code.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesMajor = !majorFilter || String(subject.major_id || subject.majors?.id || '') === majorFilter
    const matchesCollege = (() => {
      if (!collegeFilter) return true
      if (collegeFilter === 'university_wide') return subject.is_university_wide
      return String(subject.college_id || subject.colleges?.id || '') === collegeFilter
    })()

    return matchesSearch && matchesMajor && matchesCollege
  })

  const collegeFilterOptions = [...new Map(
    subjects
      .filter(s => s.colleges?.id)
      .map(s => [s.colleges.id, s.colleges])
  ).values()]

  return (
    <div className="space-y-6">
      <div
        dir={isArabicLayout ? 'rtl' : 'ltr'}
        className="flex items-center justify-between"
      >
        <div className={isArabicLayout ? 'text-right' : 'text-left'}>
          <h1 className="text-3xl font-bold text-gray-900">{t('academic.subjects.title')}</h1>
          <p className="text-gray-600 mt-1">{t('academic.subjects.subtitle')}</p>
        </div>
        <button
          onClick={() => navigate('/academic/subjects/create')}
          className={`flex items-center ${isArabicLayout ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} bg-primary-gradient text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all`}
        >
          <Plus className="w-5 h-5" />
          <span>{t('academic.subjects.create')}</span>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div
          className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
          dir={isArabicLayout ? 'rtl' : 'ltr'}
        >
          {isArabicLayout ? (
            <>
              <select
                value={collegeFilter}
                onChange={(e) => setCollegeFilter(e.target.value)}
                className="px-4 py-3 border border-gray-300 rounded-xl text-sm bg-white min-w-[10rem] text-right"
              >
                <option value="">{t('academic.subjects.allColleges')}</option>
                <option value="university_wide">{t('academic.subjects.universityWide')}</option>
                {collegeFilterOptions.map((college) => (
                  <option key={college.id} value={String(college.id)}>
                    {getLocalizedName(college, isRTL)}
                  </option>
                ))}
              </select>
              <select
                value={majorFilter}
                onChange={(e) => setMajorFilter(e.target.value)}
                className="px-4 py-3 border border-gray-300 rounded-xl text-sm bg-white min-w-[10rem] text-right"
              >
                <option value="">{t('academic.subjects.allMajors')}</option>
                {majorFilterOptions.map((major) => (
                  <option key={major.id} value={String(major.id)}>
                    {getLocalizedName(major, isRTL)}
                  </option>
                ))}
              </select>
              <div className="relative flex-1 min-w-0">
                <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('academic.subjects.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pr-10 pl-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-right"
                />
              </div>
            </>
          ) : (
            <>
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('academic.subjects.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-left"
                />
              </div>
              <select
                value={collegeFilter}
                onChange={(e) => setCollegeFilter(e.target.value)}
                className="px-4 py-3 border border-gray-300 rounded-xl text-sm bg-white min-w-[10rem] text-left"
              >
                <option value="">{t('academic.subjects.allColleges')}</option>
                <option value="university_wide">{t('academic.subjects.universityWide')}</option>
                {collegeFilterOptions.map((college) => (
                  <option key={college.id} value={String(college.id)}>
                    {getLocalizedName(college, isRTL)}
                  </option>
                ))}
              </select>
              <select
                value={majorFilter}
                onChange={(e) => setMajorFilter(e.target.value)}
                className="px-4 py-3 border border-gray-300 rounded-xl text-sm bg-white min-w-[10rem] text-left"
              >
                <option value="">{t('academic.subjects.allMajors')}</option>
                {majorFilterOptions.map((major) => (
                  <option key={major.id} value={String(major.id)}>
                    {getLocalizedName(major, isRTL)}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSubjects.map((subject) => (
            <div
              key={subject.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className={`flex items-center ${isRTL ? 'space-x-reverse space-x-3' : 'space-x-3'} mb-4`}>
                <div className="w-12 h-12 bg-primary-gradient rounded-lg flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{getLocalizedName(subject, isRTL)}</h3>
                  <p className="text-sm text-gray-500">{subject.code}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm text-gray-600">
                <p><strong>{t('academic.subjects.major')}:</strong> {getLocalizedName(subject.majors, isRTL)}</p>
                <p><strong>{t('academic.subjects.creditHours')}:</strong> {subject.credit_hours}</p>
                <p><strong>{t('academic.subjects.type')}:</strong> {subject.type}</p>
                <p><strong>{t('academic.subjects.semester')}:</strong> {subject.semester_number}</p>
                {subject.is_university_wide && (
                  <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                    {t('academic.subjects.universityWide')}
                  </span>
                )}
              </div>
              <div className={`mt-4 flex items-center ${isRTL ? 'space-x-reverse space-x-2' : 'space-x-2'}`}>
                <button
                  onClick={() => navigate(`/academic/subjects/${subject.id}`)}
                  className={`flex-1 flex items-center justify-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors`}
                >
                  <Eye className="w-4 h-4" />
                  <span>{t('academic.subjects.view')}</span>
                </button>
                <button
                  onClick={() => navigate(`/academic/subjects/${subject.id}/edit`)}
                  className={`flex-1 flex items-center justify-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-3 py-2 bg-primary-gradient text-white rounded-lg hover:shadow-lg transition-all`}
                >
                  <Edit className="w-4 h-4" />
                  <span>{t('academic.subjects.edit')}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
