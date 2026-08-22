import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCollege } from '../../contexts/CollegeContext'
import { getNationalityFilterOptions, nationalityMatchesFilter } from '../../utils/nationalities'
import { Search, Plus, Eye, CheckCircle, XCircle, Clock, Calendar, Phone, GraduationCap, FileText, Building2, Filter, LayoutDashboard, X } from 'lucide-react'
import { hasUniversityWideScope, resolveEffectiveCollegeId } from '../../utils/menuPermissions'

const ASSIGN_FIELDS = [
  { key: 'college_id', labelKey: 'admissions.applicationsPage.assignCollege', fallback: 'College' },
  { key: 'major_id', labelKey: 'admissions.applicationsPage.assignMajor', fallback: 'Major' },
  { key: 'academic_year_id', labelKey: 'admissions.applicationsPage.assignAcademicYear', fallback: 'Academic year' },
  { key: 'semester_id', labelKey: 'admissions.applicationsPage.assignSemester', fallback: 'Semester' },
]

function getAppAcademicYear(app) {
  const direct = app?.academic_years
  if (direct?.id != null || app?.academic_year_id != null) {
    return {
      id: app.academic_year_id ?? direct?.id ?? null,
      row: direct || null,
      startDate: direct?.start_date || null,
    }
  }
  const viaSem = app?.semesters?.academic_years
  const viaSemId = app?.semesters?.academic_year_id ?? viaSem?.id ?? null
  if (viaSemId != null) {
    return {
      id: viaSemId,
      row: viaSem || null,
      startDate: viaSem?.start_date || null,
    }
  }
  return { id: null, row: null, startDate: null }
}

function academicYearLabel(ay, isArabic, fallbackId) {
  if (!ay && fallbackId == null) return null
  return getLocalizedName(ay, isArabic) || ay?.name_en || ay?.code || (fallbackId != null ? `#${fallbackId}` : null)
}

const PENDING_CODES = ['APSB', 'APPN', 'RVQU', 'RVIN', 'DCPN', 'ENPN']
const ACCEPTED_CODES = ['DCFA', 'DCCA', 'ENCF', 'ENAC']

function summarizeApps(list) {
  const total = list?.length || 0
  const pending = list?.filter((a) => PENDING_CODES.includes(a.status_code)).length || 0
  const accepted = list?.filter((a) => ACCEPTED_CODES.includes(a.status_code)).length || 0
  const rejected = list?.filter((a) => a.status_code === 'DCRJ').length || 0
  return { total, pending, accepted, rejected }
}

function getApplicationStatusLabel(t, code) {
  const groups = ['application', 'review', 'decision', 'enrollment', 'academic', 'graduation']
  for (const g of groups) {
    const key = `admissions.statusCodes.${g}.${code}`
    const v = t(key)
    if (v && v !== key) return v
  }
  return code
}

function formatGenderFilterLabel(t, raw) {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'male') return t('admissions.viewApplication.detail.genderMale')
  if (v === 'female') return t('admissions.viewApplication.detail.genderFemale')
  return String(raw ?? '').trim() || raw
}

export default function Applications() {
  const { i18n } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabicLayout =
    isRTL ||
    language === 'ar' ||
    i18n?.language?.toLowerCase()?.startsWith('ar') ||
    (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl')
  const t = useCallback(
    (key, opts) => i18n.t(key, { ...opts, lng: isArabicLayout ? 'ar' : i18n.language }),
    [i18n, isArabicLayout]
  )
  const alignStart = isArabicLayout ? 'text-right' : 'text-left'
  const iconRow = isArabicLayout ? 'flex-row-reverse' : ''

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { userRole, collegeId: authCollegeId, loading: authLoading } = useAuth()
  const { selectedCollegeId } = useCollege()
  const universityWide = hasUniversityWideScope(userRole, authCollegeId)
  const [loading, setLoading] = useState(true)
  const [applications, setApplications] = useState([])
  const [filteredApplications, setFilteredApplications] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || 'all')
  const [nationalityFilter, setNationalityFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [collegeFilter, setCollegeFilter] = useState(searchParams.get('college') || 'all')
  const [majorFilter, setMajorFilter] = useState(searchParams.get('major') || 'all')
  const [academicYearFilter, setAcademicYearFilter] = useState(searchParams.get('academicYear') || 'all')
  const [semesterFilter, setSemesterFilter] = useState(searchParams.get('semester') || 'all')
  const [pendingApplicantRequestMap, setPendingApplicantRequestMap] = useState({})
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignField, setAssignField] = useState('semester_id')
  const [assignValue, setAssignValue] = useState('')
  const [assignTargetIds, setAssignTargetIds] = useState([])
  const [assignSaving, setAssignSaving] = useState(false)
  const [assignError, setAssignError] = useState('')
  const [assignOk, setAssignOk] = useState('')
  const [assignCatalog, setAssignCatalog] = useState({
    colleges: [],
    majors: [],
    semesters: [],
    academicYears: [],
  })
  const [assignCatalogLoading, setAssignCatalogLoading] = useState(false)

  // Admin setting: default program for new applications (global)
  const [programDefaultsLoading, setProgramDefaultsLoading] = useState(false)
  const [programDefaultsError, setProgramDefaultsError] = useState('')
  const [programDefaultsSaved, setProgramDefaultsSaved] = useState(false)
  const [programDefaults, setProgramDefaults] = useState({
    enabled: false,
    lock_fields: true,
    college_id: '',
    major_id: '',
    semester_id: '',
    academic_year_id: '',
  })
  const [settingsMeta, setSettingsMeta] = useState({ id: null, onboarding_settings: null })
  const [settingsColleges, setSettingsColleges] = useState([])
  const [settingsMajors, setSettingsMajors] = useState([])
  const [settingsSemesters, setSettingsSemesters] = useState([])
  const [settingsAcademicYears, setSettingsAcademicYears] = useState([])

  const fetchApplications = useCallback(async () => {
    if (authLoading || userRole === null || userRole === undefined) {
      return
    }

    const effectiveCollegeId = resolveEffectiveCollegeId(userRole, authCollegeId, selectedCollegeId)

    // College-scoped staff must have a college; university-wide staff/admin can see all
    if (!universityWide && !authCollegeId) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      let query = supabase
        .from('applications')
        .select(`
          id,
          first_name,
          last_name,
          email,
          phone,
          date_of_birth,
          nationality,
          gender,
          status_code,
          application_number,
          created_at,
          college_id,
          major_id,
          semester_id,
          academic_year_id,
          majors (
            id,
            name_en,
            name_ar,
            code
          ),
          semesters (
            id,
            name_en,
            name_ar,
            code,
            start_date,
            academic_year_id,
            academic_years (
              id,
              name_en,
              name_ar,
              code,
              start_date
            )
          ),
          academic_years (
            id,
            name_en,
            name_ar,
            code,
            start_date
          ),
          colleges (
            id,
            name_en,
            name_ar
          )
        `)
        .order('created_at', { ascending: false })

      if (effectiveCollegeId) {
        query = query.eq('college_id', effectiveCollegeId)
      }

      const { data, error } = await query
      if (error) throw error

      setApplications(data || [])

      // Fetch open applicant requests and attach counts (used for filters/badges)
      try {
        const { data: reqs, error: rErr } = await supabase
          .from('application_applicant_requests')
          .select('application_id')
          .eq('status', 'open')
        if (!rErr) {
          const m = (reqs || []).reduce((acc, r) => {
            const k = String(r.application_id)
            acc[k] = (acc[k] || 0) + 1
            return acc
          }, {})
          setPendingApplicantRequestMap(m)
        }
      } catch {
        // ignore
      }
    } catch (err) {
      console.error('Error fetching applications:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedCollegeId, userRole, authCollegeId, authLoading, universityWide])

  const fetchProgramDefaults = useCallback(async () => {
    if (userRole !== 'admin') return
    setProgramDefaultsLoading(true)
    setProgramDefaultsError('')
    try {
      const { data, error } = await supabase
        .from('university_settings')
        .select('id, onboarding_settings')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error

      const raw = data?.onboarding_settings?.application_form_defaults || {}
      setSettingsMeta({ id: data?.id ?? null, onboarding_settings: data?.onboarding_settings ?? null })
      setProgramDefaults({
        enabled: Boolean(raw.enabled),
        lock_fields: raw.lock_fields !== false,
        college_id: raw.college_id != null ? String(raw.college_id) : '',
        major_id: raw.major_id != null ? String(raw.major_id) : '',
        semester_id: raw.semester_id != null ? String(raw.semester_id) : '',
        academic_year_id: raw.academic_year_id != null ? String(raw.academic_year_id) : '',
      })
    } catch (e) {
      setProgramDefaultsError(e?.message || 'Failed to load application defaults')
    } finally {
      setProgramDefaultsLoading(false)
    }
  }, [userRole])

  const fetchSettingsLists = useCallback(async () => {
    if (userRole !== 'admin') return
    try {
      const { data: colleges, error } = await supabase
        .from('colleges')
        .select('id, name_en, name_ar, code, abbreviation, status')
        .eq('status', 'active')
        .order('name_en')
      if (!error) setSettingsColleges(colleges || [])
    } catch {
      // ignore
    }
  }, [userRole])

  const fetchSettingsMajorsAndSemesters = useCallback(async (collegeIdValue) => {
    const cid = parseInt(String(collegeIdValue || ''), 10)
    if (!Number.isFinite(cid)) {
      setSettingsMajors([])
      setSettingsSemesters([])
      setSettingsAcademicYears([])
      return
    }
    try {
      const [{ data: majors }, { data: semesters }, { data: academicYears }] = await Promise.all([
        supabase
          .from('majors')
          .select('id, name_en, name_ar, code, major_status, college_id, is_university_wide')
          .or(`college_id.eq.${cid},is_university_wide.eq.true`)
          .order('name_en'),
        supabase
          .from('semesters')
          .select('id, name_en, name_ar, code, start_date, college_id, is_university_wide')
          .or(`college_id.eq.${cid},is_university_wide.eq.true`)
          .order('start_date', { ascending: false }),
        supabase
          .from('academic_years')
          .select('id, name_en, name_ar, code, start_date, end_date, status, is_current, college_id, is_university_wide')
          .or(`college_id.eq.${cid},is_university_wide.eq.true`)
          .order('start_date', { ascending: false }),
      ])
      setSettingsMajors(majors || [])
      setSettingsSemesters(semesters || [])
      setSettingsAcademicYears(academicYears || [])
    } catch {
      // ignore
    }
  }, [])

  const saveProgramDefaults = useCallback(async () => {
    if (userRole !== 'admin') return
    setProgramDefaultsLoading(true)
    setProgramDefaultsError('')
    setProgramDefaultsSaved(false)
    try {
      const currentOnboarding = settingsMeta.onboarding_settings && typeof settingsMeta.onboarding_settings === 'object'
        ? settingsMeta.onboarding_settings
        : {}
      const payload = {
        ...currentOnboarding,
        application_form_defaults: {
          enabled: Boolean(programDefaults.enabled),
          lock_fields: programDefaults.lock_fields !== false,
          college_id: programDefaults.college_id ? parseInt(programDefaults.college_id, 10) : null,
          major_id: programDefaults.major_id ? parseInt(programDefaults.major_id, 10) : null,
          semester_id: programDefaults.semester_id ? parseInt(programDefaults.semester_id, 10) : null,
          academic_year_id: programDefaults.academic_year_id ? parseInt(programDefaults.academic_year_id, 10) : null,
        },
      }

      // Ensure minimum required fields when enabled
      if (payload.application_form_defaults.enabled) {
        if (!payload.application_form_defaults.college_id || !payload.application_form_defaults.major_id) {
          throw new Error('Select at least College and Major when enabling defaults.')
        }
      }

      let res
      if (settingsMeta.id) {
        res = await supabase
          .from('university_settings')
          .update({ onboarding_settings: payload, updated_at: new Date().toISOString() })
          .eq('id', settingsMeta.id)
          .select('id, onboarding_settings')
          .limit(1)
          .maybeSingle()
      } else {
        res = await supabase
          .from('university_settings')
          .insert({ onboarding_settings: payload })
          .select('id, onboarding_settings')
          .limit(1)
          .maybeSingle()
      }
      if (res.error) throw res.error
      setSettingsMeta({ id: res.data?.id ?? settingsMeta.id ?? null, onboarding_settings: res.data?.onboarding_settings ?? payload })
      setProgramDefaultsSaved(true)
      setTimeout(() => setProgramDefaultsSaved(false), 2000)
    } catch (e) {
      setProgramDefaultsError(e?.message || 'Failed to save defaults')
    } finally {
      setProgramDefaultsLoading(false)
    }
  }, [userRole, programDefaults, settingsMeta])

  useEffect(() => {
    fetchApplications()
  }, [fetchApplications])

  useEffect(() => {
    fetchProgramDefaults()
    fetchSettingsLists()
  }, [fetchProgramDefaults, fetchSettingsLists])

  useEffect(() => {
    if (userRole !== 'admin') return
    fetchSettingsMajorsAndSemesters(programDefaults.college_id)
  }, [userRole, programDefaults.college_id, fetchSettingsMajorsAndSemesters])

  const nationalityOptions = useMemo(
    () => getNationalityFilterOptions(applications, isArabicLayout),
    [applications, isArabicLayout],
  )

  const genderOptions = useMemo(() => {
    const set = new Set()
    let hasEmpty = false
    for (const a of applications) {
      const g = String(a.gender ?? '').trim()
      if (g) set.add(g)
      else hasEmpty = true
    }
    const rank = (x) => {
      const l = x.toLowerCase()
      if (l === 'male') return 0
      if (l === 'female') return 1
      return 2
    }
    const sorted = [...set].sort((a, b) => {
      const ra = rank(a)
      const rb = rank(b)
      if (ra !== rb) return ra - rb
      return a.localeCompare(b, undefined, { sensitivity: 'base' })
    })
    return { values: sorted, hasEmpty }
  }, [applications])

  const collegeOptions = useMemo(() => {
    const map = new Map()
    for (const a of applications) {
      const id = a.college_id ?? a.colleges?.id
      if (id == null) continue
      if (!map.has(String(id))) {
        map.set(String(id), {
          id: String(id),
          label: getLocalizedName(a.colleges, isArabicLayout) || a.colleges?.name_en || `#${id}`,
        })
      }
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  }, [applications, isArabicLayout])

  const majorOptions = useMemo(() => {
    const map = new Map()
    for (const a of applications) {
      if (collegeFilter !== 'all') {
        const cid = String(a.college_id ?? a.colleges?.id ?? '')
        if (cid !== collegeFilter) continue
      }
      const id = a.major_id ?? a.majors?.id
      if (id == null) continue
      if (!map.has(String(id))) {
        map.set(String(id), {
          id: String(id),
          label: getLocalizedName(a.majors, isArabicLayout) || a.majors?.name_en || a.majors?.code || `#${id}`,
        })
      }
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
  }, [applications, collegeFilter, isArabicLayout])

  const academicYearOptions = useMemo(() => {
    const map = new Map()
    for (const a of applications) {
      if (collegeFilter !== 'all') {
        const cid = String(a.college_id ?? a.colleges?.id ?? '')
        if (cid !== collegeFilter) continue
      }
      if (majorFilter !== 'all') {
        const mid = String(a.major_id ?? a.majors?.id ?? '')
        if (mid !== majorFilter) continue
      }
      const { id, row, startDate } = getAppAcademicYear(a)
      if (id == null) continue
      const key = String(id)
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          label: academicYearLabel(row, isArabicLayout, id),
          startDate,
        })
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.startDate && b.startDate) return String(b.startDate).localeCompare(String(a.startDate))
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    })
  }, [applications, collegeFilter, majorFilter, isArabicLayout])

  const semesterOptions = useMemo(() => {
    const map = new Map()
    for (const a of applications) {
      if (collegeFilter !== 'all') {
        const cid = String(a.college_id ?? a.colleges?.id ?? '')
        if (cid !== collegeFilter) continue
      }
      if (majorFilter !== 'all') {
        const mid = String(a.major_id ?? a.majors?.id ?? '')
        if (mid !== majorFilter) continue
      }
      if (academicYearFilter !== 'all') {
        const { id: ayId } = getAppAcademicYear(a)
        if (academicYearFilter === '__none__') {
          if (ayId != null) continue
        } else if (String(ayId ?? '') !== academicYearFilter) {
          continue
        }
      }
      const id = a.semester_id ?? a.semesters?.id
      if (id == null) continue
      if (!map.has(String(id))) {
        map.set(String(id), {
          id: String(id),
          label: getLocalizedName(a.semesters, isArabicLayout) || a.semesters?.name_en || a.semesters?.code || `#${id}`,
          startDate: a.semesters?.start_date || null,
        })
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.startDate && b.startDate) return String(b.startDate).localeCompare(String(a.startDate))
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    })
  }, [applications, collegeFilter, majorFilter, academicYearFilter, isArabicLayout])

  const filterApplications = useCallback(() => {
    let filtered = [...applications]

    if (collegeFilter !== 'all') {
      filtered = filtered.filter((app) => String(app.college_id ?? app.colleges?.id ?? '') === collegeFilter)
    }

    if (majorFilter !== 'all') {
      filtered = filtered.filter((app) => String(app.major_id ?? app.majors?.id ?? '') === majorFilter)
    }

    if (academicYearFilter !== 'all') {
      if (academicYearFilter === '__none__') {
        filtered = filtered.filter((app) => getAppAcademicYear(app).id == null)
      } else {
        filtered = filtered.filter((app) => String(getAppAcademicYear(app).id ?? '') === academicYearFilter)
      }
    }

    if (semesterFilter !== 'all') {
      if (semesterFilter === '__none__') {
        filtered = filtered.filter((app) => (app.semester_id ?? app.semesters?.id) == null)
      } else {
        filtered = filtered.filter((app) => String(app.semester_id ?? app.semesters?.id ?? '') === semesterFilter)
      }
    }

    if (nationalityFilter !== 'all') {
      filtered = filtered.filter((app) => nationalityMatchesFilter(app.nationality, nationalityFilter))
    }

    if (genderFilter !== 'all') {
      if (genderFilter === '__empty__') {
        filtered = filtered.filter((app) => !String(app.gender ?? '').trim())
      } else {
        filtered = filtered.filter((app) => String(app.gender ?? '').trim() === genderFilter)
      }
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'pending') {
        filtered = filtered.filter((app) => PENDING_CODES.includes(app.status_code))
      } else if (statusFilter === 'accepted') {
        filtered = filtered.filter((app) => ACCEPTED_CODES.includes(app.status_code))
      } else if (statusFilter === 'rejected') {
        filtered = filtered.filter((app) => app.status_code === 'DCRJ')
      } else if (statusFilter === 'waitlisted') {
        filtered = filtered.filter((app) => app.status_code === 'DCWL')
      } else if (statusFilter === 'pending_requests') {
        filtered = filtered.filter((app) => (pendingApplicantRequestMap[String(app.id)] || 0) > 0)
      }
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (app) =>
          app.first_name?.toLowerCase().includes(q) ||
          app.last_name?.toLowerCase().includes(q) ||
          app.email?.toLowerCase().includes(q) ||
          app.phone?.includes(q) ||
          app.application_number?.toLowerCase().includes(q)
      )
    }

    setFilteredApplications(filtered)
  }, [
    applications,
    collegeFilter,
    majorFilter,
    academicYearFilter,
    semesterFilter,
    nationalityFilter,
    genderFilter,
    statusFilter,
    searchQuery,
    pendingApplicantRequestMap,
  ])

  useEffect(() => {
    filterApplications()
  }, [filterApplications])

  // Keep major/semester/year filters valid when parent filters change
  useEffect(() => {
    if (majorFilter !== 'all' && !majorOptions.some((m) => m.id === majorFilter)) {
      setMajorFilter('all')
    }
  }, [majorOptions, majorFilter])

  useEffect(() => {
    if (
      academicYearFilter !== 'all' &&
      academicYearFilter !== '__none__' &&
      !academicYearOptions.some((y) => y.id === academicYearFilter)
    ) {
      setAcademicYearFilter('all')
    }
  }, [academicYearOptions, academicYearFilter])

  useEffect(() => {
    if (semesterFilter !== 'all' && semesterFilter !== '__none__' && !semesterOptions.some((s) => s.id === semesterFilter)) {
      setSemesterFilter('all')
    }
  }, [semesterOptions, semesterFilter])

  const stats = useMemo(() => summarizeApps(filteredApplications), [filteredApplications])

  const scopeAppsForDashboards = useCallback(() => {
    let scoped = [...applications]
    if (collegeFilter !== 'all') {
      scoped = scoped.filter((app) => String(app.college_id ?? app.colleges?.id ?? '') === collegeFilter)
    }
    if (majorFilter !== 'all') {
      scoped = scoped.filter((app) => String(app.major_id ?? app.majors?.id ?? '') === majorFilter)
    }
    return scoped
  }, [applications, collegeFilter, majorFilter])

  const academicYearDashboards = useMemo(() => {
    const scoped = scopeAppsForDashboards()
    const byYear = new Map()
    let withoutYear = []
    for (const app of scoped) {
      const { id, row, startDate } = getAppAcademicYear(app)
      if (id == null) {
        withoutYear.push(app)
        continue
      }
      const key = String(id)
      if (!byYear.has(key)) {
        byYear.set(key, {
          id: key,
          label: academicYearLabel(row, isArabicLayout, id),
          startDate,
          apps: [],
        })
      }
      byYear.get(key).apps.push(app)
    }

    const rows = [...byYear.values()]
      .map((row) => ({
        ...row,
        ...summarizeApps(row.apps),
      }))
      .sort((a, b) => {
        if (a.startDate && b.startDate) return String(b.startDate).localeCompare(String(a.startDate))
        return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
      })

    if (withoutYear.length) {
      rows.push({
        id: '__none__',
        label: t('admissions.applicationsPage.academicYearUnassigned', 'No academic year'),
        startDate: null,
        apps: withoutYear,
        ...summarizeApps(withoutYear),
      })
    }
    return rows
  }, [scopeAppsForDashboards, isArabicLayout, t])

  const semesterDashboards = useMemo(() => {
    let scoped = scopeAppsForDashboards()
    if (academicYearFilter !== 'all') {
      if (academicYearFilter === '__none__') {
        scoped = scoped.filter((app) => getAppAcademicYear(app).id == null)
      } else {
        scoped = scoped.filter((app) => String(getAppAcademicYear(app).id ?? '') === academicYearFilter)
      }
    }

    const bySemester = new Map()
    let withoutSemester = []
    for (const app of scoped) {
      const sid = app.semester_id ?? app.semesters?.id
      if (sid == null) {
        withoutSemester.push(app)
        continue
      }
      const key = String(sid)
      if (!bySemester.has(key)) {
        bySemester.set(key, {
          id: key,
          label: getLocalizedName(app.semesters, isArabicLayout) || app.semesters?.name_en || app.semesters?.code || `#${key}`,
          startDate: app.semesters?.start_date || null,
          apps: [],
        })
      }
      bySemester.get(key).apps.push(app)
    }

    const rows = [...bySemester.values()]
      .map((row) => ({
        ...row,
        ...summarizeApps(row.apps),
      }))
      .sort((a, b) => {
        if (a.startDate && b.startDate) return String(b.startDate).localeCompare(String(a.startDate))
        return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
      })

    if (withoutSemester.length) {
      rows.push({
        id: '__none__',
        label: t('admissions.applicationsPage.semesterUnassigned', 'No semester'),
        startDate: null,
        apps: withoutSemester,
        ...summarizeApps(withoutSemester),
      })
    }
    return rows
  }, [scopeAppsForDashboards, academicYearFilter, isArabicLayout, t])

  const hasActiveFilters =
    searchQuery ||
    statusFilter !== 'all' ||
    nationalityFilter !== 'all' ||
    genderFilter !== 'all' ||
    collegeFilter !== 'all' ||
    majorFilter !== 'all' ||
    academicYearFilter !== 'all' ||
    semesterFilter !== 'all'

  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter('all')
    setNationalityFilter('all')
    setGenderFilter('all')
    setCollegeFilter('all')
    setMajorFilter('all')
    setAcademicYearFilter('all')
    setSemesterFilter('all')
  }

  const noSemesterAppIds = useMemo(
    () =>
      applications
        .filter((a) => (a.semester_id ?? a.semesters?.id) == null)
        .map((a) => a.id)
        .filter(Boolean),
    [applications],
  )

  const selectedCount = selectedIds.size
  const allFilteredSelected =
    filteredApplications.length > 0 && filteredApplications.every((a) => selectedIds.has(a.id))

  const toggleSelected = (id, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleSelectAllFiltered = (checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const a of filteredApplications) {
        if (checked) next.add(a.id)
        else next.delete(a.id)
      }
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const fetchAssignCatalog = useCallback(async () => {
    setAssignCatalogLoading(true)
    try {
      const scopeCollegeId = resolveEffectiveCollegeId(userRole, authCollegeId, selectedCollegeId) || authCollegeId
      let collegesQ = supabase
        .from('colleges')
        .select('id, name_en, name_ar, code, abbreviation')
        .eq('status', 'active')
        .order('name_en')
      if (!universityWide && scopeCollegeId) {
        collegesQ = collegesQ.eq('id', scopeCollegeId)
      }

      let majorsQ = supabase
        .from('majors')
        .select('id, name_en, name_ar, code, college_id, is_university_wide')
        .order('name_en')
      let semestersQ = supabase
        .from('semesters')
        .select('id, name_en, name_ar, code, start_date, college_id, is_university_wide, academic_year_id')
        .order('start_date', { ascending: false })
      let yearsQ = supabase
        .from('academic_years')
        .select('id, name_en, name_ar, code, start_date, college_id, is_university_wide')
        .order('start_date', { ascending: false })

      if (!universityWide && scopeCollegeId) {
        majorsQ = majorsQ.or(`college_id.eq.${scopeCollegeId},is_university_wide.eq.true`)
        semestersQ = semestersQ.or(`college_id.eq.${scopeCollegeId},is_university_wide.eq.true`)
        yearsQ = yearsQ.or(`college_id.eq.${scopeCollegeId},is_university_wide.eq.true`)
      }

      const [{ data: colleges }, { data: majors }, { data: semesters }, { data: academicYears }] = await Promise.all([
        collegesQ,
        majorsQ,
        semestersQ,
        yearsQ,
      ])

      setAssignCatalog({
        colleges: colleges || [],
        majors: majors || [],
        semesters: semesters || [],
        academicYears: academicYears || [],
      })
    } catch (e) {
      console.error('fetchAssignCatalog', e)
    } finally {
      setAssignCatalogLoading(false)
    }
  }, [userRole, authCollegeId, selectedCollegeId, universityWide])

  const openAssignModal = useCallback(
    async ({ ids, field = 'semester_id' }) => {
      const target = (ids || []).filter(Boolean)
      if (!target.length) return
      setAssignTargetIds(target)
      setAssignField(field)
      setAssignValue('')
      setAssignError('')
      setAssignOk('')
      setAssignOpen(true)
      await fetchAssignCatalog()
    },
    [fetchAssignCatalog],
  )

  const openAssignNoSemester = useCallback(async () => {
    if (!noSemesterAppIds.length) return
    setSemesterFilter('__none__')
    setSelectedIds(new Set(noSemesterAppIds))
    await openAssignModal({ ids: noSemesterAppIds, field: 'semester_id' })
  }, [noSemesterAppIds, openAssignModal])

  const openAssignSelected = useCallback(
    async (field = 'semester_id') => {
      await openAssignModal({ ids: [...selectedIds], field })
    },
    [openAssignModal, selectedIds],
  )

  const assignOptions = useMemo(() => {
    if (assignField === 'college_id') return assignCatalog.colleges
    if (assignField === 'major_id') {
      // Prefer majors for colleges present in the target apps when possible
      const collegeIds = new Set(
        applications
          .filter((a) => assignTargetIds.includes(a.id))
          .map((a) => a.college_id)
          .filter(Boolean)
          .map(String),
      )
      if (collegeIds.size === 1) {
        const only = [...collegeIds][0]
        return assignCatalog.majors.filter(
          (m) => m.is_university_wide || String(m.college_id) === only,
        )
      }
      return assignCatalog.majors
    }
    if (assignField === 'academic_year_id') return assignCatalog.academicYears
    return assignCatalog.semesters
  }, [assignField, assignCatalog, applications, assignTargetIds])

  const applyBulkAssign = useCallback(async () => {
    const valueNum = parseInt(String(assignValue || ''), 10)
    if (!Number.isFinite(valueNum) || !assignTargetIds.length) {
      setAssignError(t('admissions.applicationsPage.assignPickValue', 'Select a value to assign.'))
      return
    }
    setAssignSaving(true)
    setAssignError('')
    setAssignOk('')
    try {
      const patch = {
        [assignField]: valueNum,
        updated_at: new Date().toISOString(),
      }
      if (assignField === 'semester_id') {
        const sem = assignCatalog.semesters.find((s) => Number(s.id) === valueNum)
        if (sem?.academic_year_id != null) {
          patch.academic_year_id = sem.academic_year_id
        }
      }

      for (let i = 0; i < assignTargetIds.length; i += 80) {
        const chunk = assignTargetIds.slice(i, i + 80)
        const { error } = await supabase.from('applications').update(patch).in('id', chunk)
        if (error) throw error
      }

      setAssignOk(
        t('admissions.applicationsPage.assignSuccess', {
          defaultValue: 'Updated {{count}} application(s).',
          count: assignTargetIds.length,
        }),
      )
      setAssignOpen(false)
      clearSelection()
      await fetchApplications()
      setTimeout(() => setAssignOk(''), 4000)
    } catch (e) {
      setAssignError(e?.message || t('admissions.applicationsPage.assignFailed', 'Failed to assign.'))
    } finally {
      setAssignSaving(false)
    }
  }, [assignValue, assignTargetIds, assignField, assignCatalog.semesters, t, fetchApplications])

  const getStatusColor = (statusCode) => {
    const statusMap = {
      APDR: 'bg-gray-100 text-gray-800 border-gray-200',
      APSB: 'bg-blue-100 text-blue-800 border-blue-200',
      APPN: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      APPC: 'bg-green-100 text-green-800 border-green-200',
      RVQU: 'bg-blue-100 text-blue-800 border-blue-200',
      RVIN: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      RVHL: 'bg-orange-100 text-orange-800 border-orange-200',
      DCPN: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      DCFA: 'bg-green-100 text-green-800 border-green-200',
      DCCA: 'bg-green-100 text-green-800 border-green-200',
      DCWL: 'bg-blue-100 text-blue-800 border-blue-200',
      DCRJ: 'bg-red-100 text-red-800 border-red-200',
      ENPN: 'bg-blue-100 text-blue-800 border-blue-200',
      ENCF: 'bg-green-100 text-green-800 border-green-200',
      ENAC: 'bg-green-100 text-green-800 border-green-200',
    }
    return statusMap[statusCode] || 'bg-gray-100 text-gray-800 border-gray-200'
  }

  const getStatusIcon = (statusCode) => {
    if (['DCFA', 'DCCA', 'ENCF', 'ENAC', 'APPC'].includes(statusCode)) {
      return <CheckCircle className="w-4 h-4 shrink-0" />
    }
    if (statusCode === 'DCRJ') {
      return <XCircle className="w-4 h-4 shrink-0" />
    }
    return <Clock className="w-4 h-4 shrink-0" />
  }

  const majorDisplay = (majors) => {
    if (!majors) return '—'
    return getLocalizedName(majors, isArabicLayout) || majors.name_en || '—'
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" dir={isArabicLayout ? 'rtl' : 'ltr'}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!universityWide && !authCollegeId) {
    return (
      <div className="flex items-center justify-center min-h-screen" dir={isArabicLayout ? 'rtl' : 'ltr'}>
        <div className={`${alignStart} max-w-md`}>
          <h2 className="text-xl font-bold text-gray-900 mb-2">{t('admissions.applicationsPage.collegeNotAssigned')}</h2>
          <p className="text-gray-600">{t('admissions.applicationsPage.collegeNotAssignedHint')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className={`min-w-0 ${alignStart}`}>
          <h1 className="text-3xl font-bold text-gray-900">{t('admissions.applicationsPage.title')}</h1>
          <p className="text-gray-600 mt-1">{t('admissions.applicationsPage.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/admissions/applications/create')}
          className={`flex items-center gap-2 bg-primary-gradient text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all ${iconRow}`}
        >
          <Plus className="w-5 h-5 shrink-0" />
          <span>{t('admissions.applicationsPage.newApplication')}</span>
        </button>
      </div>

      {userRole === 'admin' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className={`flex flex-col gap-4 ${alignStart}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-gray-900">Default program for new applications</h2>
                <p className="text-sm text-gray-600">
                  When enabled, the applicant application form auto-fills College/Major/Semester for all new applications.
                </p>
              </div>
              <button
                type="button"
                onClick={saveProgramDefaults}
                disabled={programDefaultsLoading}
                className="shrink-0 bg-primary-gradient text-white px-5 py-2.5 rounded-xl font-semibold shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {programDefaultsLoading ? 'Saving…' : 'Save'}
              </button>
            </div>

            {(programDefaultsError || programDefaultsSaved) && (
              <div
                className={`rounded-lg border p-3 text-sm ${
                  programDefaultsError
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-green-50 border-green-200 text-green-700'
                }`}
              >
                {programDefaultsError || 'Saved.'}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <label className="flex items-center gap-2 md:col-span-1">
                <input
                  type="checkbox"
                  checked={Boolean(programDefaults.enabled)}
                  onChange={(e) =>
                    setProgramDefaults((p) => ({
                      ...p,
                      enabled: e.target.checked,
                    }))
                  }
                />
                <span className="text-sm font-medium text-gray-800">Enable</span>
              </label>

              <label className="flex items-center gap-2 md:col-span-1">
                <input
                  type="checkbox"
                  checked={programDefaults.lock_fields !== false}
                  onChange={(e) =>
                    setProgramDefaults((p) => ({
                      ...p,
                      lock_fields: e.target.checked,
                    }))
                  }
                />
                <span className="text-sm font-medium text-gray-800">Lock fields</span>
              </label>

              <div className="md:col-span-2 text-sm text-gray-600">
                {programDefaults.enabled
                  ? 'Applicants will see those fields pre-filled (and locked if enabled).'
                  : 'Disabled: applicants choose their college/major/semester normally.'}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">College</label>
                <select
                  value={programDefaults.college_id}
                  onChange={(e) =>
                    setProgramDefaults((p) => ({
                      ...p,
                      college_id: e.target.value,
                      major_id: '',
                      semester_id: '',
                    }))
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  dir={isArabicLayout ? 'rtl' : 'ltr'}
                >
                  <option value="">Select college…</option>
                  {settingsColleges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {getLocalizedName(c, isArabicLayout) || c.name_en} ({c.abbreviation || c.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Major</label>
                <select
                  value={programDefaults.major_id}
                  onChange={(e) => setProgramDefaults((p) => ({ ...p, major_id: e.target.value }))}
                  disabled={!programDefaults.college_id}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
                  dir={isArabicLayout ? 'rtl' : 'ltr'}
                >
                  <option value="">Select major…</option>
                  {settingsMajors.map((m) => (
                    <option key={m.id} value={m.id}>
                      {getLocalizedName(m, isArabicLayout) || m.name_en} ({m.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Semester (optional)</label>
                <select
                  value={programDefaults.semester_id}
                  onChange={(e) => setProgramDefaults((p) => ({ ...p, semester_id: e.target.value }))}
                  disabled={!programDefaults.college_id}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
                  dir={isArabicLayout ? 'rtl' : 'ltr'}
                >
                  <option value="">(none)</option>
                  {settingsSemesters.map((s) => (
                    <option key={s.id} value={s.id}>
                      {getLocalizedName(s, isArabicLayout) || s.name_en} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year (optional)</label>
                <select
                  value={programDefaults.academic_year_id}
                  onChange={(e) => setProgramDefaults((p) => ({ ...p, academic_year_id: e.target.value }))}
                  disabled={!programDefaults.college_id}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-600"
                  dir={isArabicLayout ? 'rtl' : 'ltr'}
                >
                  <option value="">(none)</option>
                  {settingsAcademicYears.map((ay) => (
                    <option key={ay.id} value={ay.id}>
                      {getLocalizedName(ay, isArabicLayout) || ay.name_en} ({ay.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          {
            label: t('admissions.applicationsPage.statsTotal'),
            value: stats.total,
            color: 'text-gray-900',
            bg: 'bg-blue-100',
            icon: Calendar,
            iconColor: 'text-blue-600',
          },
          {
            label: t('admissions.applicationsPage.statsPending'),
            value: stats.pending,
            color: 'text-yellow-600',
            bg: 'bg-yellow-100',
            icon: Clock,
            iconColor: 'text-yellow-600',
          },
          {
            label: t('admissions.applicationsPage.statsAccepted'),
            value: stats.accepted,
            color: 'text-green-600',
            bg: 'bg-green-100',
            icon: CheckCircle,
            iconColor: 'text-green-600',
          },
          {
            label: t('admissions.applicationsPage.statsRejected'),
            value: stats.rejected,
            color: 'text-red-600',
            bg: 'bg-red-100',
            icon: XCircle,
            iconColor: 'text-red-600',
          },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className={`flex items-center gap-3 w-full ${isArabicLayout ? 'justify-start' : 'justify-between'}`}>
              <div className={`min-w-0 flex-1 ${alignStart}`}>
                <p className="text-sm text-gray-600 mb-1">{card.label}</p>
                <p className={`text-3xl font-bold tabular-nums ${card.color}`}>{card.value}</p>
              </div>
              <div className={`w-12 h-12 ${card.bg} rounded-lg flex items-center justify-center shrink-0`}>
                <card.icon className={`w-6 h-6 ${card.iconColor}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {academicYearDashboards.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className={`flex flex-wrap items-center justify-between gap-3 mb-4 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
            <div className={`min-w-0 ${alignStart}`}>
              <div className={`flex items-center gap-2 ${iconRow}`}>
                <LayoutDashboard className="w-5 h-5 text-primary-600 shrink-0" />
                <h2 className="text-lg font-bold text-gray-900">
                  {t('admissions.applicationsPage.academicYearDashboardTitle', 'Applications by academic year')}
                </h2>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {t(
                  'admissions.applicationsPage.academicYearDashboardHint',
                  'Click an academic year card to filter the list below.',
                )}
              </p>
            </div>
            {academicYearFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setAcademicYearFilter('all')}
                className="text-sm font-semibold text-primary-600 hover:text-primary-700"
              >
                {t('admissions.applicationsPage.showAllAcademicYears', 'Show all academic years')}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {academicYearDashboards.map((row) => {
              const active = academicYearFilter === row.id
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => {
                    setAcademicYearFilter(active ? 'all' : row.id)
                    setSemesterFilter('all')
                  }}
                  className={`text-start rounded-xl border p-4 transition-all ${
                    active
                      ? 'border-primary-500 bg-primary-50 shadow-sm ring-2 ring-primary-200'
                      : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                  } ${alignStart}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 truncate">{row.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {t('admissions.applicationsPage.statsTotal')}: {row.total}
                      </p>
                    </div>
                    <span className="shrink-0 inline-flex items-center justify-center min-w-[2.25rem] h-9 px-2 rounded-lg bg-indigo-100 text-indigo-700 text-sm font-extrabold tabular-nums">
                      {row.total}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-lg bg-yellow-50 border border-yellow-100 px-2 py-1.5">
                      <p className="text-yellow-700 font-medium">{t('admissions.applicationsPage.statsPending')}</p>
                      <p className="text-yellow-800 font-bold tabular-nums">{row.pending}</p>
                    </div>
                    <div className="rounded-lg bg-green-50 border border-green-100 px-2 py-1.5">
                      <p className="text-green-700 font-medium">{t('admissions.applicationsPage.statsAccepted')}</p>
                      <p className="text-green-800 font-bold tabular-nums">{row.accepted}</p>
                    </div>
                    <div className="rounded-lg bg-red-50 border border-red-100 px-2 py-1.5">
                      <p className="text-red-700 font-medium">{t('admissions.applicationsPage.statsRejected')}</p>
                      <p className="text-red-800 font-bold tabular-nums">{row.rejected}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {semesterDashboards.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className={`flex flex-wrap items-center justify-between gap-3 mb-4 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
            <div className={`min-w-0 ${alignStart}`}>
              <div className={`flex items-center gap-2 ${iconRow}`}>
                <LayoutDashboard className="w-5 h-5 text-primary-600 shrink-0" />
                <h2 className="text-lg font-bold text-gray-900">
                  {t('admissions.applicationsPage.semesterDashboardTitle', 'Applications by semester')}
                </h2>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {t(
                  'admissions.applicationsPage.semesterDashboardHint',
                  'Click a semester card to filter the list below.',
                )}
              </p>
            </div>
            {semesterFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setSemesterFilter('all')}
                className="text-sm font-semibold text-primary-600 hover:text-primary-700"
              >
                {t('admissions.applicationsPage.showAllSemesters', 'Show all semesters')}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {semesterDashboards.map((row) => {
              const active = semesterFilter === row.id
              const isNoSemester = row.id === '__none__'
              return (
                <div
                  key={row.id}
                  className={`text-start rounded-xl border p-4 transition-all ${
                    active
                      ? 'border-primary-500 bg-primary-50 shadow-sm ring-2 ring-primary-200'
                      : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
                  } ${alignStart}`}
                >
                  <button
                    type="button"
                    onClick={() => setSemesterFilter(active ? 'all' : row.id)}
                    className={`w-full ${alignStart}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <p className="font-bold text-gray-900 truncate">{row.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {t('admissions.applicationsPage.statsTotal')}: {row.total}
                        </p>
                      </div>
                      <span className="shrink-0 inline-flex items-center justify-center min-w-[2.25rem] h-9 px-2 rounded-lg bg-blue-100 text-blue-700 text-sm font-extrabold tabular-nums">
                        {row.total}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-lg bg-yellow-50 border border-yellow-100 px-2 py-1.5">
                        <p className="text-yellow-700 font-medium">{t('admissions.applicationsPage.statsPending')}</p>
                        <p className="text-yellow-800 font-bold tabular-nums">{row.pending}</p>
                      </div>
                      <div className="rounded-lg bg-green-50 border border-green-100 px-2 py-1.5">
                        <p className="text-green-700 font-medium">{t('admissions.applicationsPage.statsAccepted')}</p>
                        <p className="text-green-800 font-bold tabular-nums">{row.accepted}</p>
                      </div>
                      <div className="rounded-lg bg-red-50 border border-red-100 px-2 py-1.5">
                        <p className="text-red-700 font-medium">{t('admissions.applicationsPage.statsRejected')}</p>
                        <p className="text-red-800 font-bold tabular-nums">{row.rejected}</p>
                      </div>
                    </div>
                  </button>
                  {isNoSemester && row.total > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        openAssignNoSemester()
                      }}
                      className="mt-3 w-full px-3 py-2 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                    >
                      {t('admissions.applicationsPage.assignSemesterToAll', 'Assign semester to all')}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className={`flex flex-wrap items-center justify-between gap-3 mb-4 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
          <div className={`flex items-center gap-2 ${iconRow}`}>
            <Filter className="w-5 h-5 text-gray-500 shrink-0" />
            <h2 className="text-base font-bold text-gray-900">
              {t('admissions.applicationsPage.filtersTitle', 'Filters')}
            </h2>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-sm font-semibold text-primary-600 hover:text-primary-700"
            >
              {t('admissions.applicationsPage.clearFilters', 'Clear filters')}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-3 mb-4">
          {collegeOptions.length > 1 && (
            <select
              value={collegeFilter}
              onChange={(e) => {
                setCollegeFilter(e.target.value)
                setMajorFilter('all')
                setAcademicYearFilter('all')
                setSemesterFilter('all')
              }}
              className={`px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
              dir={isArabicLayout ? 'rtl' : 'ltr'}
            >
              <option value="all">{t('admissions.applicationsPage.filterCollegeAll', 'All colleges')}</option>
              {collegeOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          )}

          <select
            value={majorFilter}
            onChange={(e) => {
              setMajorFilter(e.target.value)
              setAcademicYearFilter('all')
              setSemesterFilter('all')
            }}
            className={`px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
            dir={isArabicLayout ? 'rtl' : 'ltr'}
          >
            <option value="all">{t('admissions.applicationsPage.filterMajorAll', 'All majors')}</option>
            {majorOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          <select
            value={academicYearFilter}
            onChange={(e) => {
              setAcademicYearFilter(e.target.value)
              setSemesterFilter('all')
            }}
            className={`px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
            dir={isArabicLayout ? 'rtl' : 'ltr'}
          >
            <option value="all">{t('admissions.applicationsPage.filterAcademicYearAll', 'All academic years')}</option>
            {academicYearOptions.map((y) => (
              <option key={y.id} value={y.id}>
                {y.label}
              </option>
            ))}
            <option value="__none__">{t('admissions.applicationsPage.academicYearUnassigned', 'No academic year')}</option>
          </select>

          <select
            value={semesterFilter}
            onChange={(e) => setSemesterFilter(e.target.value)}
            className={`px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
            dir={isArabicLayout ? 'rtl' : 'ltr'}
          >
            <option value="all">{t('admissions.applicationsPage.filterSemesterAll', 'All semesters')}</option>
            {semesterOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
            <option value="__none__">{t('admissions.applicationsPage.semesterUnassigned', 'No semester')}</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
            dir={isArabicLayout ? 'rtl' : 'ltr'}
          >
            <option value="all">{t('admissions.applicationsPage.filterAll')}</option>
            <option value="pending">{t('admissions.applicationsPage.filterPending')}</option>
            <option value="accepted">{t('admissions.applicationsPage.filterAccepted')}</option>
            <option value="rejected">{t('admissions.applicationsPage.filterRejected')}</option>
            <option value="waitlisted">{t('admissions.applicationsPage.filterWaitlisted')}</option>
            <option value="pending_requests">{t('admissions.applicationsPage.filterPendingRequests', 'Pending applicant requests')}</option>
          </select>
        </div>

        <div className={`flex flex-col lg:flex-row gap-4 ${isArabicLayout ? 'lg:flex-row-reverse' : ''}`}>
          <div className="flex-1 relative min-w-0">
            <Search
              className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none ${
                isArabicLayout ? 'right-3' : 'left-3'
              }`}
            />
            <input
              type="text"
              placeholder={t('admissions.applicationsPage.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart} ${
                isArabicLayout ? 'pr-10 pl-4' : 'pl-10 pr-4'
              }`}
            />
          </div>
          <div className={`flex flex-col sm:flex-row gap-3 shrink-0 ${isArabicLayout ? 'sm:flex-row-reverse' : ''}`}>
            <select
              value={nationalityFilter}
              onChange={(e) => setNationalityFilter(e.target.value)}
              className={`px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent sm:min-w-[200px] ${alignStart}`}
              dir={isArabicLayout ? 'rtl' : 'ltr'}
            >
              <option value="all">{t('admissions.applicationsPage.filterNationalityAll')}</option>
              {nationalityOptions.hasEmpty && (
                <option value="__empty__">{t('admissions.applicationsPage.filterNationalityNotSpecified')}</option>
              )}
              {nationalityOptions.values.map((nat) => (
                <option key={nat.code} value={nat.code}>
                  {nat.label}
                </option>
              ))}
            </select>
            <select
              value={genderFilter}
              onChange={(e) => setGenderFilter(e.target.value)}
              className={`px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent sm:min-w-[180px] ${alignStart}`}
              dir={isArabicLayout ? 'rtl' : 'ltr'}
            >
              <option value="all">{t('admissions.applicationsPage.filterGenderAll')}</option>
              {genderOptions.hasEmpty && (
                <option value="__empty__">{t('admissions.applicationsPage.filterGenderNotSpecified')}</option>
              )}
              {genderOptions.values.map((g) => (
                <option key={g} value={g}>
                  {formatGenderFilterLabel(t, g)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {filteredApplications.length > 0 ? (
        <>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 sticky top-2 z-20">
            <div className={`flex flex-wrap items-center gap-3 justify-between ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
              <label className={`flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer ${iconRow}`}>
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={(e) => toggleSelectAllFiltered(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span>
                  {t('admissions.applicationsPage.selectAllVisible', 'Select all visible')}
                  {selectedCount > 0
                    ? ` (${t('admissions.applicationsPage.selectedCount', {
                        defaultValue: '{{count}} selected',
                        count: selectedCount,
                      })})`
                    : ''}
                </span>
              </label>
              <div className={`flex flex-wrap items-center gap-2 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
                {selectedCount > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => openAssignSelected('college_id')}
                      className="px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 hover:bg-gray-50"
                    >
                      {t('admissions.applicationsPage.assignCollege', 'College')}
                    </button>
                    <button
                      type="button"
                      onClick={() => openAssignSelected('major_id')}
                      className="px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 hover:bg-gray-50"
                    >
                      {t('admissions.applicationsPage.assignMajor', 'Major')}
                    </button>
                    <button
                      type="button"
                      onClick={() => openAssignSelected('academic_year_id')}
                      className="px-3 py-2 rounded-lg text-sm font-semibold border border-gray-300 hover:bg-gray-50"
                    >
                      {t('admissions.applicationsPage.assignAcademicYear', 'Academic year')}
                    </button>
                    <button
                      type="button"
                      onClick={() => openAssignSelected('semester_id')}
                      className="px-3 py-2 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700"
                    >
                      {t('admissions.applicationsPage.assignSemester', 'Semester')}
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="px-3 py-2 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-100"
                    >
                      {t('admissions.applicationsPage.clearSelection', 'Clear selection')}
                    </button>
                  </>
                )}
              </div>
            </div>
            {assignOk && (
              <div className="mt-3 rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm px-3 py-2">
                {assignOk}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredApplications.map((application) => {
              const checked = selectedIds.has(application.id)
              return (
            <div
              key={application.id}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(`/admissions/applications/${application.id}`)
              }}
              className={`bg-white rounded-2xl shadow-sm border p-6 hover:shadow-md transition-shadow cursor-pointer ${
                checked ? 'border-primary-400 ring-2 ring-primary-100' : 'border-gray-200'
              }`}
              onClick={() => navigate(`/admissions/applications/${application.id}`)}
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className={`min-w-0 flex-1 ${alignStart}`}>
                  <label
                    className={`inline-flex items-center gap-2 mb-2 text-xs font-semibold text-gray-600 ${iconRow}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleSelected(application.id, e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span>{t('admissions.applicationsPage.selectApplication', 'Select')}</span>
                  </label>
                  <h3 className="text-lg font-bold text-gray-900 mb-1">
                    {application.first_name} {application.last_name}
                  </h3>
                  <p className="text-sm text-gray-600 break-all">{application.email}</p>
                </div>
                <div className={`flex items-center gap-2 shrink-0 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
                  {(pendingApplicantRequestMap[String(application.id)] || 0) > 0 && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border border-amber-200 bg-amber-50 text-amber-900">
                      {t('admissions.applicationsPage.pendingRequestsShort', 'Requests')}{' '}
                      {pendingApplicantRequestMap[String(application.id)]}
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                      application.status_code
                    )}`}
                    dir={isArabicLayout ? 'rtl' : 'ltr'}
                  >
                    {getStatusIcon(application.status_code)}
                    <span>{getApplicationStatusLabel(t, application.status_code)}</span>
                  </span>
                </div>
              </div>

              <div className={`space-y-2 mb-4 w-full ${alignStart}`}>
                {application.application_number && (
                  <div
                    className="flex w-full items-center gap-2 text-sm text-gray-600"
                    dir={isArabicLayout ? 'rtl' : 'ltr'}
                  >
                    <FileText className="w-4 h-4 shrink-0" />
                    <span className="font-mono" dir="ltr">
                      {application.application_number}
                    </span>
                  </div>
                )}
                <div
                  className="flex w-full items-center gap-2 text-sm text-gray-600"
                  dir={isArabicLayout ? 'rtl' : 'ltr'}
                >
                  <GraduationCap className="w-4 h-4 shrink-0" />
                  <span>{majorDisplay(application.majors)}</span>
                </div>
                {application.colleges && (
                  <div
                    className="flex w-full items-center gap-2 text-sm text-gray-600"
                    dir={isArabicLayout ? 'rtl' : 'ltr'}
                  >
                    <Building2 className="w-4 h-4 shrink-0" />
                    <span>{getLocalizedName(application.colleges, isArabicLayout) || application.colleges.name_en}</span>
                  </div>
                )}
                {(() => {
                  const ay = getAppAcademicYear(application)
                  const label = academicYearLabel(ay.row, isArabicLayout, ay.id)
                  if (!label) return null
                  return (
                    <div
                      className="flex w-full items-center gap-2 text-sm text-gray-600"
                      dir={isArabicLayout ? 'rtl' : 'ltr'}
                    >
                      <Calendar className="w-4 h-4 shrink-0" />
                      <span>{label}</span>
                    </div>
                  )
                })()}
                {application.semesters && (
                  <div
                    className="flex w-full items-center gap-2 text-sm text-gray-600"
                    dir={isArabicLayout ? 'rtl' : 'ltr'}
                  >
                    <Calendar className="w-4 h-4 shrink-0" />
                    <span>
                      {getLocalizedName(application.semesters, isArabicLayout) ||
                        application.semesters.name_en ||
                        application.semesters.code}
                    </span>
                  </div>
                )}
                {application.phone && (
                  <div
                    className="flex w-full items-center gap-2 text-sm text-gray-600"
                    dir={isArabicLayout ? 'rtl' : 'ltr'}
                  >
                    <Phone className="w-4 h-4 shrink-0" />
                    <span dir="ltr">{application.phone}</span>
                  </div>
                )}
                <div
                  className="flex w-full items-center gap-2 text-sm text-gray-600"
                  dir={isArabicLayout ? 'rtl' : 'ltr'}
                >
                  <Calendar className="w-4 h-4 shrink-0" />
                  <span>
                    {t('admissions.applicationsPage.applied')}{' '}
                    {new Date(application.created_at).toLocaleDateString(isArabicLayout ? 'ar' : undefined)}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/admissions/applications/${application.id}`)
                  }}
                  className={`w-full bg-primary-50 text-primary-600 py-2 rounded-xl font-medium hover:bg-primary-100 transition-colors flex items-center gap-2 ${
                    isArabicLayout ? 'justify-start' : 'justify-center'
                  }`}
                  dir={isArabicLayout ? 'rtl' : 'ltr'}
                >
                  <Eye className="w-4 h-4 shrink-0" />
                  <span>{t('admissions.applicationsPage.viewDetails')}</span>
                </button>
              </div>
            </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-12 ${alignStart}`}>
          <Calendar className={`w-16 h-16 mb-4 text-gray-400 ${isArabicLayout ? 'ms-auto' : 'mx-auto'}`} />
          <h3 className="text-xl font-bold text-gray-900 mb-2">{t('admissions.applicationsPage.emptyTitle')}</h3>
          <p className="text-gray-600">
            {hasActiveFilters
              ? t('admissions.applicationsPage.emptyFiltered')
              : t('admissions.applicationsPage.emptyNone')}
          </p>
        </div>
      )}

      {assignOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div
            className={`bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-lg p-6 ${alignStart}`}
            role="dialog"
            aria-modal="true"
          >
            <div className={`flex items-start justify-between gap-3 mb-4 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {t('admissions.applicationsPage.bulkAssignTitle', 'Assign to applications')}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {t('admissions.applicationsPage.bulkAssignHint', {
                    defaultValue: 'Updating {{count}} application(s).',
                    count: assignTargetIds.length,
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !assignSaving && setAssignOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('admissions.applicationsPage.assignField', 'Field')}
                </label>
                <select
                  value={assignField}
                  onChange={(e) => {
                    setAssignField(e.target.value)
                    setAssignValue('')
                  }}
                  className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
                  dir={isArabicLayout ? 'rtl' : 'ltr'}
                  disabled={assignSaving}
                >
                  {ASSIGN_FIELDS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {t(f.labelKey, f.fallback)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('admissions.applicationsPage.assignValue', 'Value')}
                </label>
                <select
                  value={assignValue}
                  onChange={(e) => setAssignValue(e.target.value)}
                  className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
                  dir={isArabicLayout ? 'rtl' : 'ltr'}
                  disabled={assignSaving || assignCatalogLoading}
                >
                  <option value="">
                    {assignCatalogLoading
                      ? t('common.loading', 'Loading…')
                      : t('admissions.applicationsPage.assignPickValue', 'Select a value to assign.')}
                  </option>
                  {assignOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {getLocalizedName(opt, isArabicLayout) || opt.name_en || opt.code || `#${opt.id}`}
                      {opt.code ? ` (${opt.code})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {assignError && (
                <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">
                  {assignError}
                </div>
              )}

              <div className={`flex flex-wrap gap-2 justify-end ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
                <button
                  type="button"
                  onClick={() => setAssignOpen(false)}
                  disabled={assignSaving}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="button"
                  onClick={applyBulkAssign}
                  disabled={assignSaving || !assignValue}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {assignSaving
                    ? t('admissions.applicationsPage.assigning', 'Assigning…')
                    : t('admissions.applicationsPage.confirmAssign', 'Assign')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
