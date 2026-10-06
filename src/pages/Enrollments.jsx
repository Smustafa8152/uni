import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Download, GraduationCap, Plus, RefreshCw, Search, Users } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { exportEnrollmentRecords } from '../utils/exportStudentEnrollments'
import { buildStudentSearchOrFilter } from '../utils/studentSearchQuery'
import { Badge, Button, EmptyState, PageHeader, Panel, Skeleton, toast } from '../components/ui'

const NS = 'enrollments.listPage'
const PAGE_SIZE = 25
const EXPORT_PAGE_SIZE = 100

const ENROLLMENT_SELECT = `
  id, enrollment_date, status, grade, numeric_grade, grade_points, created_at, updated_at,
  students (
    id, student_id, first_name, middle_name, last_name, name_en, name_ar, email, phone, mobile_phone, gender, nationality,
    majors ( id, name_en, name_ar, code ),
    colleges ( id, name_en, name_ar, code )
  ),
  classes (
    id, code, section,
    class_schedules ( day_of_week, start_time, end_time, location ),
    subjects ( id, name_en, name_ar, code, credit_hours ),
    instructors ( id, name_en, name_ar )
  ),
  semesters ( id, name_en, name_ar, code )
`

const STATUS_TONES = { enrolled: 'ok', dropped: 'err', completed: 'info', failed: 'err', withdrawn: 'warn' }
const STATUSES = ['enrolled', 'dropped', 'completed', 'failed', 'withdrawn']
const fieldClass = 'h-10 w-full rounded-xl border border-[#dde3ef] bg-white px-3 text-sm text-slate-800 outline-none transition-colors focus:border-[#1a3a6b]'
const tidy = (value) => String(value || '').trim()

export default function Enrollments() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const { userRole, collegeId } = useAuth()
  const collegeStaff = (userRole === 'user' || userRole === 'instructor') && Boolean(collegeId)
  const scopedToCollege = userRole === 'user' && Boolean(collegeId)
  const ready = userRole === 'admin' || collegeStaff

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState('')
  const [semesters, setSemesters] = useState([])
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [semesterFilter, setSemesterFilter] = useState(() => new URLSearchParams(location.search || '').get('semester') || 'all')
  const [exporting, setExporting] = useState('')
  const requestId = useRef(0)

  const localName = useCallback((row) => tidy(isRTL ? row?.name_ar || row?.name_en : row?.name_en || row?.name_ar), [isRTL])
  const studentName = useCallback(
    (s) => {
      if (!s) return '—'
      const en = tidy(s.name_en) || tidy(`${s.first_name || ''} ${s.last_name || ''}`)
      return (isRTL ? tidy(s.name_ar) || en : en || tidy(s.name_ar)) || '—'
    },
    [isRTL]
  )
  const formatDate = useCallback(
    (value) => (value ? new Date(value).toLocaleDateString(language === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'),
    [language]
  )

  // The search box filters on the server, a moment after typing stops.
  useEffect(() => {
    const id = setTimeout(() => setTerm(search.trim()), 350)
    return () => clearTimeout(id)
  }, [search])

  useEffect(() => {
    if (!ready) return
    let request = supabase.from('semesters').select('id, name_en, name_ar, code').order('start_date', { ascending: false })
    if (collegeStaff) request = request.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
    request.then(({ data, error: semError }) => {
      if (semError) console.error('Error fetching semesters:', semError)
      setSemesters(data || [])
    })
  }, [ready, collegeStaff, collegeId])

  /**
   * Student ids the list is limited to, or null for no limit.
   * A search term is looked up in the students table; a college user only ever sees their college.
   */
  const studentScope = useCallback(async () => {
    if (term.length < 2 && !scopedToCollege) return null
    let request = supabase.from('students').select('id').limit(term.length >= 2 ? 300 : 5000)
    if (scopedToCollege) request = request.eq('college_id', collegeId)
    if (term.length >= 2) request = request.or(buildStudentSearchOrFilter(term))
    const { data, error: studentError } = await request
    if (studentError) throw studentError
    return (data || []).map((s) => s.id)
  }, [term, scopedToCollege, collegeId])

  /** One page, newest first. Pages are cut by id so a long table never has to be counted. */
  const fetchPage = useCallback(
    async (beforeId, size) => {
      const ids = await studentScope()
      if (ids && ids.length === 0) return []
      let request = supabase.from('enrollments').select(ENROLLMENT_SELECT).order('id', { ascending: false }).limit(size)
      if (ids) request = request.in('student_id', ids)
      if (statusFilter !== 'all') request = request.eq('status', statusFilter)
      if (semesterFilter !== 'all') request = request.eq('semester_id', parseInt(semesterFilter, 10))
      if (beforeId) request = request.lt('id', beforeId)
      const { data, error: pageError } = await request
      if (pageError) throw pageError
      return data || []
    },
    [studentScope, statusFilter, semesterFilter]
  )

  const load = useCallback(async () => {
    if (!ready) return
    const mine = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const page = await fetchPage(null, PAGE_SIZE + 1)
      if (mine !== requestId.current) return
      setHasMore(page.length > PAGE_SIZE)
      setRows(page.slice(0, PAGE_SIZE))
    } catch (err) {
      if (mine !== requestId.current) return
      console.error('Error fetching enrollments:', err)
      setRows([])
      setHasMore(false)
      setError(err.code === '57014' ? t(`${NS}.errorSlow`) : t(`${NS}.errorLoad`, { message: err.message || '' }))
    } finally {
      if (mine === requestId.current) setLoading(false)
    }
  }, [ready, fetchPage, t])

  useEffect(() => {
    load()
  }, [load])

  const loadMore = async () => {
    if (rows.length === 0) return
    setLoadingMore(true)
    try {
      const page = await fetchPage(rows[rows.length - 1].id, PAGE_SIZE + 1)
      setHasMore(page.length > PAGE_SIZE)
      setRows((prev) => [...prev, ...page.slice(0, PAGE_SIZE)])
    } catch (err) {
      console.error('Error fetching more enrollments:', err)
      toast(t(`${NS}.errorLoad`, { message: err.message || '' }), 'err')
    } finally {
      setLoadingMore(false)
    }
  }

  /** Export everything the filters match, not only the rows on screen. */
  const handleExport = async (format) => {
    setExporting(t(`${NS}.exportPreparing`, { count: 0 }))
    try {
      const all = []
      let cursor = null
      for (;;) {
        const page = await fetchPage(cursor, EXPORT_PAGE_SIZE)
        all.push(...page)
        setExporting(t(`${NS}.exportPreparing`, { count: all.length }))
        if (page.length < EXPORT_PAGE_SIZE) break
        cursor = page[page.length - 1].id
      }
      if (all.length === 0) {
        toast(t('enrollments.exportNone'), 'err')
        return
      }
      const count = exportEnrollmentRecords(all, isRTL || language === 'ar', format)
      toast(t('enrollments.exportSuccess', { count }))
    } catch (err) {
      console.error('Export enrollments failed:', err)
      toast(err?.message || t('enrollments.exportFailed'), 'err')
    } finally {
      setExporting('')
    }
  }

  const filtered = term.length >= 2 || statusFilter !== 'all' || semesterFilter !== 'all'
  const clearFilters = () => {
    setSearch('')
    setStatusFilter('all')
    setSemesterFilter('all')
  }

  const subjectLine = (row) => {
    const subject = row.classes?.subjects
    return { code: tidy(subject?.code) || tidy(row.classes?.code), name: localName(subject) }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('enrollments.title')}
        subtitle={t('enrollments.subtitle')}
        actions={
          <>
            <Button variant="quiet" icon={Download} loading={Boolean(exporting)} disabled={rows.length === 0} onClick={() => handleExport('xlsx')}>
              {t('enrollments.exportExcel')}
            </Button>
            <Button variant="quiet" icon={Download} disabled={Boolean(exporting) || rows.length === 0} onClick={() => handleExport('csv')}>
              {t('enrollments.exportCsv')}
            </Button>
            <Button variant="quiet" icon={Users} onClick={() => navigate('/enrollments/bulk')}>
              {t('navigation.bulkEnrollment')}
            </Button>
            <Button icon={Plus} onClick={() => navigate('/enrollments/create')}>
              {t('enrollments.create')}
            </Button>
          </>
        }
      />

      {exporting ? <p className="rounded-xl border border-[#dde3ef] bg-[#eef2f9] px-4 py-2.5 text-sm font-semibold text-[#1a3a6b]">{exporting}</p> : null}

      <Panel>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input className={`${fieldClass} ps-9`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('enrollments.searchPlaceholder')} aria-label={t('enrollments.searchPlaceholder')} />
          </div>
          <select className={fieldClass} value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)} aria-label={t('enrollments.semester')}>
            <option value="all">{t('enrollments.allSemesters')}</option>
            {semesters.map((s) => (
              <option key={s.id} value={s.id}>
                {localName(s)} ({tidy(s.code)})
              </option>
            ))}
          </select>
          <select className={fieldClass} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label={t('enrollments.status')}>
            <option value="all">{t('enrollments.allStatus')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`enrollments.${s}`)}
              </option>
            ))}
          </select>
        </div>
      </Panel>

      <Panel flush>
        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon={AlertTriangle}
            title={t(`${NS}.errorTitle`)}
            hint={error}
            action={
              <Button icon={RefreshCw} onClick={load}>
                {t(`${NS}.retry`)}
              </Button>
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title={filtered ? t(`${NS}.noMatchTitle`) : t('enrollments.noEnrollmentsFound')}
            hint={filtered ? t(`${NS}.noMatchHint`) : t(`${NS}.emptyHint`)}
            action={
              filtered ? (
                <Button variant="quiet" onClick={clearFilters}>
                  {t(`${NS}.clearFilters`)}
                </Button>
              ) : (
                <Button icon={Plus} onClick={() => navigate('/enrollments/create')}>
                  {t('enrollments.create')}
                </Button>
              )
            }
          />
        ) : (
          <>
            {/* Phones: one card per registration */}
            <ul className="divide-y divide-[#dde3ef] md:hidden">
              {rows.map((row) => {
                const subject = subjectLine(row)
                return (
                  <li key={row.id}>
                    <button type="button" onClick={() => navigate(`/enrollments/${row.id}`)} className="block w-full px-4 py-3 text-start hover:bg-slate-50">
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-slate-800">{studentName(row.students)}</span>
                          <span className="block text-xs text-slate-500">
                            <span dir="ltr">{tidy(row.students?.student_id) || '—'}</span>
                          </span>
                        </span>
                        <Badge tone={STATUS_TONES[row.status] || 'neutral'}>{t(`enrollments.${row.status || 'enrolled'}`)}</Badge>
                      </span>
                      <span className="mt-1.5 block text-sm text-slate-700">
                        <span dir="ltr" className="font-bold text-[#1a3a6b]">
                          {subject.code}
                        </span>{' '}
                        {subject.name}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {localName(row.semesters) || '—'} · {formatDate(row.enrollment_date)}
                        {row.grade ? ` · ${row.grade}` : ''}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {/* Wider screens: a table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[#dde3ef] bg-slate-50 text-xs font-bold text-slate-500">
                    {['student', 'class', 'semester', 'enrollmentDate', 'status', 'grade'].map((key) => (
                      <th key={key} scope="col" className="px-4 py-3 text-start">
                        {t(`enrollments.${key}`)}
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-3 text-end">
                      {t('enrollments.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#dde3ef]">
                  {rows.map((row) => {
                    const subject = subjectLine(row)
                    return (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-800">{studentName(row.students)}</div>
                          <div className="text-xs text-slate-500">
                            <span dir="ltr">{tidy(row.students?.student_id) || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-slate-800">
                            <span dir="ltr" className="font-bold text-[#1a3a6b]">
                              {subject.code}
                            </span>{' '}
                            {subject.name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {t('enrollments.section')} {tidy(row.classes?.section) || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{localName(row.semesters) || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-700">{formatDate(row.enrollment_date)}</td>
                        <td className="px-4 py-3">
                          <Badge tone={STATUS_TONES[row.status] || 'neutral'}>{t(`enrollments.${row.status || 'enrolled'}`)}</Badge>
                        </td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{row.grade || '—'}</td>
                        <td className="px-4 py-3 text-end">
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/enrollments/${row.id}`)}>
                            {t('enrollments.viewDetails')}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dde3ef] px-4 py-3">
              <span className="text-sm text-slate-500">{hasMore ? t(`${NS}.showingSome`, { count: rows.length }) : t(`${NS}.showingAll`, { count: rows.length })}</span>
              {hasMore ? (
                <Button variant="quiet" loading={loadingMore} onClick={loadMore}>
                  {t(`${NS}.showMore`)}
                </Button>
              ) : null}
            </div>
          </>
        )}
      </Panel>
    </div>
  )
}
