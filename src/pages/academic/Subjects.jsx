import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { exportSubjectStudentsList, exportAllSubjectsStudentsWorkbook } from '../../utils/exportStudents'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, BookOpen, Search, Eye, Edit, Download } from 'lucide-react'
import { Badge, Button, EmptyState, PageHeader, Skeleton } from '../../components/ui'
import { Facts, Mark, Register, RegisterRow, fieldClass } from '../../components/academic/catalogUi'

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

  const subjectKpis = useMemo(() => {
    const majors = new Set()
    const colleges = new Set()
    let universityWide = 0
    let creditHours = 0
    for (const subject of filteredSubjects) {
      const majorId = subject.majors?.id || subject.major_id
      if (majorId) majors.add(majorId)
      if (subject.is_university_wide) universityWide += 1
      const collegeId = subject.colleges?.id || subject.college_id
      if (collegeId) colleges.add(collegeId)
      creditHours += Number(subject.credit_hours) || 0
    }
    return { count: filteredSubjects.length, majors: majors.size, colleges: colleges.size, universityWide, creditHours }
  }, [filteredSubjects])

  const kpiNumber = (value) => (loading ? '—' : value.toLocaleString(isRTL ? 'ar-u-nu-latn' : 'en'))

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

      <Facts
        items={[
          { label: t('academic.subjects.kpiCount'), value: kpiNumber(subjectKpis.count) },
          { label: t('academic.subjects.kpiMajors'), value: kpiNumber(subjectKpis.majors) },
          { label: t('academic.subjects.kpiColleges'), value: kpiNumber(subjectKpis.colleges) },
          { label: t('academic.subjects.kpiUniversityWide'), value: kpiNumber(subjectKpis.universityWide) },
          { label: t('academic.subjects.kpiCreditHours'), value: kpiNumber(subjectKpis.creditHours) },
        ]}
      />

      {toast && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            toast.startsWith('ERR::') ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {toast.startsWith('ERR::') ? toast.slice(5) : toast}
        </div>
      )}

      <Register
        toolbar={
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
        }
      >
        {loading ? (
          <div className="space-y-px p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : filteredSubjects.length === 0 ? (
          <EmptyState icon={BookOpen} title={t('academic.subjects.title')} hint={t('academic.subjects.searchPlaceholder')} />
        ) : (
          filteredSubjects.map((subject) => (
            <RegisterRow
              key={subject.id}
              mark={<Mark icon={BookOpen} />}
              title={getLocalizedName(subject, isRTL)}
              code={subject.code}
              tags={subject.is_university_wide ? <Badge tone="info">{t('academic.subjects.universityWide')}</Badge> : null}
              detail={
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                  <span>{t('academic.subjects.major')}: {getLocalizedName(subject.majors, isRTL)}</span>
                  <span>{subject.credit_hours} {t('academic.subjects.creditHours')}</span>
                  <span>{subject.type}</span>
                  <span>{t('academic.subjects.semester')} {subject.semester_number}</span>
                </span>
              }
              actions={
                <>
                  <Button variant="quiet" size="sm" icon={Eye} onClick={() => navigate(`/academic/subjects/${subject.id}`)}>
                    {t('academic.subjects.view')}
                  </Button>
                  <Button size="sm" icon={Edit} onClick={() => navigate(`/academic/subjects/${subject.id}/edit`)}>
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
                </>
              }
            />
          ))
        )}
      </Register>
    </div>
  )
}
