import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { exportSubjectStudentsList, exportAllSubjectsStudentsWorkbook } from '../../utils/exportStudents'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, BookOpen, Search, Eye, Edit, Download } from 'lucide-react'
import { Button, EmptyState, PageHeader, Panel, Skeleton } from '../../components/ui'
import { fieldClass } from '../../components/academic/catalogUi'

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
  const [exportingSubjectId, setExportingSubjectId] = useState(null)
  const [exportingAll, setExportingAll] = useState(false)
  const [toast, setToast] = useState('')

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

  const handleExportAllSubjects = async () => {
    if (!filteredSubjects.length) {
      setToast(t('academic.subjects.exportAllNone', 'No subjects to export.'))
      setTimeout(() => setToast(''), 4000)
      return
    }
    try {
      setExportingAll(true)
      setToast('')
      const result = await exportAllSubjectsStudentsWorkbook({
        subjects: filteredSubjects,
        isArabic: isArabicLayout,
        status: 'enrolled',
        semesterId: 'all',
      })
      if (result.studentCount === 0) {
        setToast(
          t('academic.subjects.exportAllEmpty', {
            sheets: result.sheetCount,
            defaultValue: 'Downloaded workbook with {{sheets}} sheets (no enrolled students found).',
          }),
        )
      } else {
        setToast(
          t('academic.subjects.exportAllSuccess', {
            sheets: result.sheetCount,
            students: result.studentCount,
            defaultValue: 'Downloaded workbook with {{sheets}} sheets and {{students}} students.',
          }),
        )
      }
      setTimeout(() => setToast(''), 5000)
    } catch (e) {
      console.error('Export all subject students failed:', e)
      setToast(`ERR::${e?.message || t('students.exportFailed', 'Export failed.')}`)
      setTimeout(() => setToast(''), 6000)
    } finally {
      setExportingAll(false)
    }
  }

  const handleExportSubjectStudents = async (subject, format) => {
    try {
      setExportingSubjectId(subject.id)
      setToast('')
      const count = await exportSubjectStudentsList({
        subjectId: subject.id,
        subjectCode: subject.code,
        isArabic: isArabicLayout,
        format,
        status: 'enrolled',
        semesterId: 'all',
      })
      if (count === 0) {
        setToast(t('students.exportNone', 'No students to export.'))
      } else {
        setToast(t('students.exportSuccess', { count, defaultValue: 'Exported {{count}} students.' }))
      }
      setTimeout(() => setToast(''), 4000)
    } catch (e) {
      console.error('Export subject students failed:', e)
      setToast(`ERR::${e?.message || t('students.exportFailed', 'Export failed.')}`)
      setTimeout(() => setToast(''), 6000)
    } finally {
      setExportingSubjectId(null)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('academic.subjects.title')}
        subtitle={t('academic.subjects.subtitle')}
        actions={
          <>
            <Button variant="quiet" icon={Download} loading={exportingAll} disabled={loading || filteredSubjects.length === 0} onClick={handleExportAllSubjects}>
              {t('academic.subjects.exportAllExcel', 'Export all subjects (Excel)')}
            </Button>
            <Button icon={Plus} onClick={() => navigate('/academic/subjects/create')}>
              {t('academic.subjects.create')}
            </Button>
          </>
        }
      />

      <Panel>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="text"
              placeholder={t('academic.subjects.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`${fieldClass} ps-9`}
              aria-label={t('academic.subjects.searchPlaceholder')}
            />
          </div>
          <select value={collegeFilter} onChange={(e) => setCollegeFilter(e.target.value)} className={fieldClass} aria-label={t('academic.subjects.allColleges')}>
            <option value="">{t('academic.subjects.allColleges')}</option>
            <option value="university_wide">{t('academic.subjects.universityWide')}</option>
            {collegeFilterOptions.map((college) => (
              <option key={college.id} value={String(college.id)}>
                {getLocalizedName(college, isRTL)}
              </option>
            ))}
          </select>
          <select value={majorFilter} onChange={(e) => setMajorFilter(e.target.value)} className={fieldClass} aria-label={t('academic.subjects.allMajors')}>
            <option value="">{t('academic.subjects.allMajors')}</option>
            {majorFilterOptions.map((major) => (
              <option key={major.id} value={String(major.id)}>
                {getLocalizedName(major, isRTL)}
              </option>
            ))}
          </select>
        </div>
      </Panel>

      {toast && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            toast.startsWith('ERR::') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-800 border border-green-200'
          }`}
        >
          {toast.startsWith('ERR::') ? toast.slice(5) : toast}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : filteredSubjects.length === 0 ? (
        <Panel>
          <EmptyState icon={BookOpen} title={t('academic.subjects.title')} hint={t('academic.subjects.searchPlaceholder')} />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredSubjects.map((subject) => (
            <div
              key={subject.id}
              className="rounded-2xl border border-[#dde3ef] bg-white p-5"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#eef2f9] text-[#1a3a6b]">
                  <BookOpen className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-extrabold text-[#1a3a6b]">{getLocalizedName(subject, isRTL)}</h3>
                  <p className="text-sm text-slate-500">{subject.code}</p>
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
              <div className={`mt-4 flex flex-wrap items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                <Button variant="quiet" size="sm" className="flex-1" icon={Eye} onClick={() => navigate(`/academic/subjects/${subject.id}`)}>
                  {t('academic.subjects.view')}
                </Button>
                <Button size="sm" className="flex-1" icon={Edit} onClick={() => navigate(`/academic/subjects/${subject.id}/edit`)}>
                  {t('academic.subjects.edit')}
                </Button>
                <Button
                  variant="quiet"
                  size="sm"
                  icon={Download}
                  loading={exportingSubjectId === subject.id}
                  title={t('academic.subjects.exportStudents', 'Export enrolled students')}
                  onClick={() => handleExportSubjectStudents(subject, 'xlsx')}
                >
                  {t('academic.subjects.exportStudents', 'Export students')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
