import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName, getPersonName } from '../../utils/localizedName'
import { exportSubjectStudentsList, exportAllSubjectsStudentsWorkbook } from '../../utils/exportStudents'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, BookOpen, Search, Eye, Edit, Download, Trash2 } from 'lucide-react'
import { Badge, Button, EmptyState, PageHeader, Skeleton } from '../../components/ui'
import { Facts, Mark, Register, RegisterRow, fieldClass } from '../../components/academic/catalogUi'

function subjectMajors(subject) {
  const rows = []
  if (subject.majors?.id) rows.push(subject.majors)
  for (const link of subject.subject_majors || []) {
    if (link.majors?.id) rows.push(link.majors)
  }
  return [...new Map(rows.map((major) => [major.id, major])).values()]
}

function subjectDepartments(subject) {
  return [...new Map(
    subjectMajors(subject)
      .map((major) => major.departments)
      .filter((department) => department?.id)
      .map((department) => [department.id, department])
  ).values()]
}

function onActiveCollege(row) {
  if (row?.is_university_wide) return true
  return row?.colleges?.status === 'active'
}

function formatNameList(rows, isRTL, t) {
  const names = rows.map((row) => getLocalizedName(row, isRTL)).filter(Boolean)
  if (names.length <= 2) return names.join(' · ')
  return `${names.slice(0, 2).join(' · ')} ${t('academic.subjects.deleteMore', { count: names.length - 2 })}`
}

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
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [collegeFilter, setCollegeFilter] = useState('')
  const [departments, setDepartments] = useState([])
  const [majorsCatalog, setMajorsCatalog] = useState([])
  const [exportingSubjectId, setExportingSubjectId] = useState(null)
  const [exportingAll, setExportingAll] = useState(false)
  const [toast, setToast] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deletePreview, setDeletePreview] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    fetchSubjects()
  }, [collegeId, userRole])

  const fetchSubjects = async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('subjects')
        .select('*, majors(id, name_en, name_ar, code, college_id, department_id, departments(id, name_en, name_ar, college_id, status)), colleges(id, name_en, name_ar, code, status), subject_majors(majors(id, name_en, name_ar, code, college_id, department_id, departments(id, name_en, name_ar, college_id, status)))')
        .eq('status', 'active')
        .order('code')
      let departmentQuery = supabase
        .from('departments')
        .select('id, name_en, name_ar, code, college_id, is_university_wide, status, colleges(id, status)')
        .eq('status', 'active')
        .order('name_en')
      let majorQuery = supabase
        .from('majors')
        .select('id, name_en, name_ar, code, college_id, department_id, is_university_wide, status, colleges(id, status)')
        .eq('status', 'active')
        .order('name_en')

      if (userRole === 'user' && collegeId) {
        const scope = `college_id.eq.${collegeId},is_university_wide.eq.true`
        query = query.or(scope)
        departmentQuery = departmentQuery.or(scope)
        majorQuery = majorQuery.or(scope)
      }

      const [subjectsResult, departmentsResult, majorsResult] = await Promise.all([query, departmentQuery, majorQuery])
      if (subjectsResult.error) throw subjectsResult.error
      if (departmentsResult.error) throw departmentsResult.error
      if (majorsResult.error) throw majorsResult.error
      setSubjects(subjectsResult.data || [])
      setDepartments(departmentsResult.data || [])
      setMajorsCatalog(majorsResult.data || [])
    } catch (err) {
      console.error('Error fetching subjects:', err)
    } finally {
      setLoading(false)
    }
  }

  const sortByName = (rows) => [...rows].sort((a, b) =>
    getLocalizedName(a, isRTL).localeCompare(getLocalizedName(b, isRTL), isRTL ? 'ar' : 'en')
  )

  const departmentFilterOptions = useMemo(() => {
    const rows = departments.filter((department) => {
      if (!onActiveCollege(department)) return false
      if (!collegeFilter) return true
      if (collegeFilter === 'university_wide') return department.is_university_wide
      return String(department.college_id || '') === collegeFilter
    })
    return sortByName(rows)
  }, [departments, collegeFilter, isRTL])

  const majorFilterOptions = useMemo(() => {
    const rows = majorsCatalog.filter((major) => {
      if (!onActiveCollege(major)) return false
      if (collegeFilter === 'university_wide' && !major.is_university_wide) return false
      if (collegeFilter && collegeFilter !== 'university_wide' && String(major.college_id || '') !== collegeFilter) return false
      if (departmentFilter && String(major.department_id || '') !== departmentFilter) return false
      return true
    })
    return sortByName(rows)
  }, [majorsCatalog, collegeFilter, departmentFilter, isRTL])

  useEffect(() => {
    if (!departmentFilter) return
    const allowed = new Set(departmentFilterOptions.map((department) => String(department.id)))
    if (!allowed.has(departmentFilter)) setDepartmentFilter('')
  }, [departmentFilter, departmentFilterOptions])

  useEffect(() => {
    if (!majorFilter) return
    const allowed = new Set(majorFilterOptions.map((major) => String(major.id)))
    if (!allowed.has(majorFilter)) setMajorFilter('')
  }, [majorFilter, majorFilterOptions])

  const subjectMatchesDepartment = (subject) => {
    if (!departmentFilter) return true
    if (subjectDepartments(subject).some((department) => String(department.id) === departmentFilter)) return true
    if (!subject.applies_to_all_majors_of_college) return false
    const department = departments.find((row) => String(row.id) === departmentFilter)
    return Boolean(department && String(department.college_id || '') === String(subject.college_id || ''))
  }

  const subjectMatchesMajor = (subject) => {
    if (!majorFilter) return true
    if (subjectMajors(subject).some((major) => String(major.id) === majorFilter)) return true
    if (!subject.applies_to_all_majors_of_college) return false
    const major = majorsCatalog.find((row) => String(row.id) === majorFilter)
    return Boolean(major && String(major.college_id || '') === String(subject.college_id || ''))
  }

  const filteredSubjects = subjects.filter(subject => {
    const name = getLocalizedName(subject, isRTL)
    const matchesSearch = name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      subject.code.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCollege = (() => {
      if (!collegeFilter) return true
      if (collegeFilter === 'university_wide') return subject.is_university_wide
      return String(subject.college_id || subject.colleges?.id || '') === collegeFilter
    })()

    return matchesSearch && matchesCollege && subjectMatchesDepartment(subject) && subjectMatchesMajor(subject)
  })

  const subjectKpis = useMemo(() => {
    const majors = new Set()
    const colleges = new Set()
    let universityWide = 0
    let creditHours = 0
    for (const subject of filteredSubjects) {
      for (const major of subjectMajors(subject)) majors.add(major.id)
      if (subject.is_university_wide) universityWide += 1
      const collegeId = subject.colleges?.id || subject.college_id
      if (collegeId) colleges.add(collegeId)
      creditHours += Number(subject.credit_hours) || 0
    }
    return { count: filteredSubjects.length, majors: majors.size, colleges: colleges.size, universityWide, creditHours }
  }, [filteredSubjects])

  const kpiNumber = (value) => (loading ? '—' : value.toLocaleString(isRTL ? 'ar-u-nu-latn' : 'en'))

  const collegeFilterOptions = useMemo(
    () => [...new Map(
      subjects
        .filter((s) => s.colleges?.id && s.colleges.status === 'active')
        .map((s) => [s.colleges.id, s.colleges])
    ).values()],
    [subjects]
  )

  useEffect(() => {
    if (!collegeFilter || collegeFilter === 'university_wide') return
    const allowed = new Set(collegeFilterOptions.map((college) => String(college.id)))
    if (!allowed.has(collegeFilter)) setCollegeFilter('')
  }, [collegeFilter, collegeFilterOptions])

  const openDelete = async (subject) => {
    setDeleteTarget(subject)
    setDeletePreview(null)
    setDeleteError('')
    setDeleteLoading(true)
    try {
      const { data, error } = await supabase.rpc('preview_subject_delete', { p_subject_id: subject.id })
      if (error) throw error
      setDeletePreview({
        sessions: data?.sessions || [],
        students: data?.students || [],
      })
    } catch (err) {
      console.error('Error loading subject links:', err)
      setDeleteError(err.message || t('academic.subjects.deleteFailed'))
    } finally {
      setDeleteLoading(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleteLoading(true)
    setDeleteError('')
    try {
      const { error } = await supabase.rpc('delete_subject_and_sessions', { p_subject_id: deleteTarget.id })
      if (error) throw error
      setSubjects((current) => current.filter((row) => row.id !== deleteTarget.id))
      setToast(t('academic.subjects.deleteSuccess'))
      setTimeout(() => setToast(''), 4000)
      setDeleteTarget(null)
      setDeletePreview(null)
    } catch (err) {
      console.error('Error deleting subject:', err)
      setDeleteError(err.message || t('academic.subjects.deleteFailed'))
    } finally {
      setDeleteLoading(false)
    }
  }

  const closeDelete = () => {
    if (deleteLoading) return
    setDeleteTarget(null)
    setDeletePreview(null)
    setDeleteError('')
  }

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
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className={fieldClass} aria-label={t('academic.subjects.allDepartments')}>
              <option value="">{t('academic.subjects.allDepartments')}</option>
              {departmentFilterOptions.map((department) => (
                <option key={department.id} value={String(department.id)}>
                  {getLocalizedName(department, isRTL)}
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
                <span className="flex flex-col gap-0.5">
                  {(subject.is_university_wide || subject.colleges) && (
                    <span><span className="font-medium text-slate-500">{t('academic.subjects.college')}: </span>{subject.is_university_wide ? t('academic.subjects.universityWide') : getLocalizedName(subject.colleges, isRTL)}</span>
                  )}
                  {subjectDepartments(subject).length > 0 && (
                    <span><span className="font-medium text-slate-500">{t('academic.subjects.department')}: </span>{formatNameList(subjectDepartments(subject), isRTL, t)}</span>
                  )}
                  {(subject.applies_to_all_majors_of_college || subjectMajors(subject).length > 0) && (
                    <span><span className="font-medium text-slate-500">{t('academic.subjects.major')}: </span>{subject.applies_to_all_majors_of_college ? t('academic.subjects.allMajorsOfCollege') : formatNameList(subjectMajors(subject), isRTL, t)}</span>
                  )}
                  {subject.credit_hours != null && (
                    <span>{subject.credit_hours} {t('academic.subjects.creditHours')}</span>
                  )}
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
                  <Button variant="danger" size="sm" icon={Trash2} onClick={() => openDelete(subject)}>
                    {t('academic.subjects.delete')}
                  </Button>
                </>
              }
            />
          ))
        )}
      </Register>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center" onClick={closeDelete}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-subject-title"
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 text-start shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="delete-subject-title" className="text-lg font-bold text-gray-900">
              {t('academic.subjects.deleteTitle')}
            </h2>
            <p className="mt-1 text-sm font-semibold text-gray-800">
              {getLocalizedName(deleteTarget, isRTL)} <span className="font-mono text-xs text-gray-500">{deleteTarget.code}</span>
            </p>
            <p className="mt-2 text-sm leading-6 text-gray-600">{t('academic.subjects.deleteIntro')}</p>

            {deleteLoading && !deletePreview ? (
              <p className="mt-4 text-sm text-gray-500">{t('common.loading')}</p>
            ) : null}

            {deletePreview && deletePreview.sessions.length === 0 && deletePreview.students.length === 0 ? (
              <p className="mt-4 rounded-xl bg-gray-50 px-3 py-3 text-sm text-gray-600">{t('academic.subjects.deleteNone')}</p>
            ) : null}

            {deletePreview?.sessions.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  {t('academic.subjects.deleteSessions')} ({deletePreview.sessions.length})
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                  {deletePreview.sessions.slice(0, 8).map((session) => (
                    <li key={session.id} className="rounded-lg bg-gray-50 px-3 py-2">
                      <span className="font-medium">{session.code}{session.section ? ` · ${session.section}` : ''}</span>
                      {session.semesters ? <span className="text-gray-500"> · {getLocalizedName(session.semesters, isRTL)}</span> : null}
                    </li>
                  ))}
                </ul>
                {deletePreview.sessions.length > 8 && (
                  <p className="mt-1 text-xs text-gray-500">{t('academic.subjects.deleteMore', { count: deletePreview.sessions.length - 8 })}</p>
                )}
              </div>
            )}

            {deletePreview?.students.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-semibold text-gray-900">
                  {t('academic.subjects.deleteStudents')} ({deletePreview.students.length})
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-gray-700">
                  {deletePreview.students.slice(0, 8).map((student) => (
                    <li key={student.id} className="rounded-lg bg-gray-50 px-3 py-2">
                      <span className="font-medium">{getPersonName(student, isArabicLayout) || '—'}</span>
                      {student.student_id ? <span className="text-gray-500"> · {student.student_id}</span> : null}
                    </li>
                  ))}
                </ul>
                {deletePreview.students.length > 8 && (
                  <p className="mt-1 text-xs text-gray-500">{t('academic.subjects.deleteMore', { count: deletePreview.students.length - 8 })}</p>
                )}
              </div>
            )}

            {deleteError && (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{deleteError}</p>
            )}

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="quiet" onClick={closeDelete} disabled={deleteLoading}>{t('common.cancel')}</Button>
              <Button variant="danger" onClick={confirmDelete} loading={deleteLoading} disabled={deleteLoading}>
                {t('academic.subjects.deleteConfirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
