import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import SubjectCurriculumMapPanel from '../../components/academic/SubjectCurriculumMapPanel'
import { PageHeader, Panel, Skeleton } from '../../components/ui'
import { fieldClass } from '../../components/academic/catalogUi'

export default function AdminCurriculumMap() {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [allSubjects, setAllSubjects] = useState([])
  const [collegeFilter, setCollegeFilter] = useState('')
  const [majorFilter, setMajorFilter] = useState('')
  const [semesterFilter, setSemesterFilter] = useState('')
  const [selectedSubjectId, setSelectedSubjectId] = useState(null)

  const subjectsMatchingCollege = useMemo(
    () =>
      allSubjects.filter((s) => {
        if (collegeFilter === 'university_wide') return !!s.is_university_wide
        if (!collegeFilter) return true
        return String(s.college_id || s.colleges?.id || '') === collegeFilter
      }),
    [allSubjects, collegeFilter]
  )

  const majorOptions = useMemo(
    () =>
      [
        ...new Map(
          subjectsMatchingCollege.filter((s) => s.majors?.id).map((s) => [s.majors.id, s.majors])
        ).values(),
      ],
    [subjectsMatchingCollege]
  )

  const subjectsMatchingCollegeMajor = useMemo(
    () =>
      subjectsMatchingCollege.filter((s) => {
        if (!majorFilter) return true
        return String(s.major_id || s.majors?.id || '') === majorFilter
      }),
    [subjectsMatchingCollege, majorFilter]
  )

  const semesterOptions = useMemo(() => {
    const set = new Set()
    subjectsMatchingCollegeMajor.forEach((s) => {
      if (s.semester_number != null && s.semester_number !== '') set.add(String(s.semester_number))
    })
    return [...set].sort((a, b) => Number(a) - Number(b))
  }, [subjectsMatchingCollegeMajor])

  const filteredSubjects = useMemo(
    () =>
      subjectsMatchingCollegeMajor.filter((s) => {
        if (!semesterFilter) return true
        return String(s.semester_number ?? '') === semesterFilter
      }),
    [subjectsMatchingCollegeMajor, semesterFilter]
  )

  const selectedSubject = useMemo(
    () => filteredSubjects.find((s) => s.id === selectedSubjectId) || null,
    [filteredSubjects, selectedSubjectId]
  )

  useEffect(() => {
    loadSubjects()
  }, [])

  useEffect(() => {
    if (!majorFilter) return
    const allowed = new Set(majorOptions.map((m) => String(m.id)))
    if (!allowed.has(majorFilter)) setMajorFilter('')
  }, [collegeFilter, majorOptions, majorFilter])

  useEffect(() => {
    if (!semesterFilter) return
    if (!semesterOptions.includes(semesterFilter)) setSemesterFilter('')
  }, [semesterOptions, semesterFilter])

  useEffect(() => {
    if (!filteredSubjects.length) {
      setSelectedSubjectId(null)
      return
    }
    setSelectedSubjectId((prev) => {
      if (prev && filteredSubjects.some((s) => s.id === prev)) return prev
      return filteredSubjects[0].id
    })
  }, [filteredSubjects])

  useEffect(() => {
    if (!selectedSubjectId) return
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('subjectId', String(selectedSubjectId))
      return next
    })
  }, [selectedSubjectId])

  const loadSubjects = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select(
          'id, code, name_en, name_ar, college_id, major_id, semester_number, is_university_wide, majors(id, name_en, name_ar, code), colleges(id, name_en, name_ar, code)'
        )
        .eq('status', 'active')
        .order('code', { ascending: true })

      if (error) throw error
      const list = data || []
      setAllSubjects(list)

      const fromQuery = Number(searchParams.get('subjectId'))
      const initial = list.find((s) => s.id === fromQuery)?.id || list[0]?.id || null
      setSelectedSubjectId(initial)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const collegeOptions = useMemo(
    () => [...new Map(allSubjects.filter((s) => s.colleges?.id).map((s) => [s.colleges.id, s.colleges])).values()],
    [allSubjects]
  )

  const hasUniversityWide = useMemo(() => allSubjects.some((s) => s.is_university_wide), [allSubjects])

  if (loading && !allSubjects.length) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
      </div>
    )
  }

  const subjectLabel = selectedSubject
    ? `${selectedSubject.code} — ${getLocalizedName(selectedSubject, language === 'ar')}`
    : ''

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('admin.curriculumMap.title')}
        subtitle={t('admin.curriculumMap.subtitle')}
        actions={
          <Link to="/admin/colleges" className="text-sm font-bold text-[#1a3a6b] underline-offset-2 hover:underline">
            {t('admin.curriculumMap.backToColleges')}
          </Link>
        }
      />

      <Panel>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('admin.curriculumMap.filterCollege')}</label>
            <select
              className={fieldClass}
              value={collegeFilter}
              onChange={(e) => {
                setCollegeFilter(e.target.value)
                setMajorFilter('')
                setSemesterFilter('')
              }}
            >
              <option value="">{t('admin.curriculumMap.allColleges')}</option>
              {hasUniversityWide && (
                <option value="university_wide">{t('admin.curriculumMap.universityWideSubjects')}</option>
              )}
              {collegeOptions.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {getLocalizedName(c, language === 'ar')} {c.code ? `(${c.code})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('admin.curriculumMap.filterMajor')}</label>
            <select
              className={fieldClass}
              value={majorFilter}
              onChange={(e) => {
                setMajorFilter(e.target.value)
                setSemesterFilter('')
              }}
            >
              <option value="">{t('admin.curriculumMap.allMajors')}</option>
              {majorOptions.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.code ? `${m.code} — ` : ''}
                  {getLocalizedName(m, language === 'ar')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('admin.curriculumMap.filterSemester')}</label>
            <select
              className={fieldClass}
              value={semesterFilter}
              onChange={(e) => setSemesterFilter(e.target.value)}
            >
              <option value="">{t('admin.curriculumMap.allSemesters')}</option>
              {semesterOptions.map((sem) => (
                <option key={sem} value={sem}>
                  {t('academic.subjects.semester')} {sem}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 xl:col-span-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('admin.curriculumMap.selectSubject')}</label>
            <select
              className={fieldClass}
              value={selectedSubjectId || ''}
              onChange={(e) => setSelectedSubjectId(e.target.value ? Number(e.target.value) : null)}
              disabled={!filteredSubjects.length}
            >
              {filteredSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {getLocalizedName(s, language === 'ar')}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!filteredSubjects.length && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {t('admin.curriculumMap.noSubjectsForFilters')}
          </p>
        )}
      </Panel>

      {selectedSubjectId && filteredSubjects.some((s) => s.id === selectedSubjectId) && (
        <SubjectCurriculumMapPanel subjectId={selectedSubjectId} subjectLabel={subjectLabel} embedAboutColumn />
      )}
    </div>
  )
}
