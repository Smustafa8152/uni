import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, BookOpen, Download, GraduationCap, Layers, Loader2, Mail, Pencil, Search, Target, Users } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName, getPersonName } from '../../utils/localizedName'
import { getGradeTypesFromUniversitySettings, mergeGradeConfigWithTypes } from '../../utils/getCollegeSettings'
import { exportSubjectStudentsList } from '../../utils/exportStudents'
import { supabase } from '../../lib/supabase'
import { formatInstructorDisplayName } from '../../utils/academicTitle'
import SubjectCurriculumMapPanel from '../../components/academic/SubjectCurriculumMapPanel'
import { Badge, Button, EmptyState, Panel, Skeleton, toast } from '../../components/ui'

const NS = 'subjectView'
const TABS = ['overview', 'students', 'outcomes']
const GRADE_GROUPS = ['A', 'B', 'C', 'D', 'F']

const cleanCode = (code) => String(code || '').trim()

function subjectTypeLabel(t, type) {
  if (type === 'elective') return t('subjectsForm.typeElective')
  if (type === 'general') return t('subjectsForm.typeGeneral')
  return t('subjectsForm.typeCore')
}

function gradeTypeLabel(config, isRTL) {
  const en = config?.grade_type_name_en
  const ar = config?.grade_type_name_ar
  return (isRTL ? ar || en : en || ar) || config?.grade_type_code || '—'
}

/** One labelled value in a definition list; nothing is shown for an empty value. */
function Row({ label, children }) {
  if (children == null || children === '' || children === false) return null
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 text-end text-sm font-semibold text-slate-900 break-words">{children}</dd>
    </div>
  )
}

function isBulletLine(line) {
  return /^([-–—•*]|\d+[.)])\s+/.test(line)
}

function headingParts(line) {
  if (!line || isBulletLine(line)) return null
  if (/^(module|unit|week|chapter|lesson)\b/i.test(line) || /^(الموضوع|الوحدة|الأسبوع|الدرس)\b/.test(line)) {
    const split = line.match(/^([^:]{2,80}):\s*(.*)$/)
    return split ? { title: split[1].trim(), body: split[2].trim() } : { title: line, body: '' }
  }
  const titled = line.match(/^(.{2,70}):\s*(.*)$/)
  if (titled) return { title: titled[1].trim(), body: titled[2].trim() }
  return null
}

function parseProse(raw) {
  const lines = String(raw || '')
    .replace(/\t/g, ' ')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const blocks = []
  let i = 0
  while (i < lines.length) {
    if (isBulletLine(lines[i])) {
      const items = []
      while (i < lines.length && isBulletLine(lines[i])) {
        items.push(lines[i].replace(/^([-–—•*]|\d+[.)])\s+/, '').trim())
        i += 1
      }
      blocks.push({ type: 'list', items })
      continue
    }
    const heading = headingParts(lines[i])
    if (heading) {
      const body = []
      if (heading.body) body.push(heading.body)
      i += 1
      while (i < lines.length && !isBulletLine(lines[i]) && !headingParts(lines[i])) {
        body.push(lines[i])
        i += 1
      }
      blocks.push({ type: 'section', title: heading.title, body: body.join(' ') })
      continue
    }
    const para = [lines[i]]
    i += 1
    while (i < lines.length && !isBulletLine(lines[i]) && !headingParts(lines[i])) {
      para.push(lines[i])
      i += 1
    }
    blocks.push({ type: 'p', text: para.join(' ') })
  }
  return blocks
}

function SubjectProse({ text }) {
  const blocks = parseProse(text)
  if (!blocks.length) return null
  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        if (block.type === 'list') {
          return (
            <ul key={index} className="list-disc space-y-1.5 ps-5 text-[15px] leading-8 text-slate-700">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{item}</li>
              ))}
            </ul>
          )
        }
        if (block.type === 'section') {
          return (
            <div key={index}>
              <h3 className="text-sm font-extrabold text-[#1a3a6b]">{block.title}</h3>
              {block.body ? <p className="mt-1 text-[15px] leading-8 text-slate-700">{block.body}</p> : null}
            </div>
          )
        }
        return (
          <p key={index} className="text-[15px] leading-8 text-slate-700">{block.text}</p>
        )
      })}
    </div>
  )
}


/** Description or syllabus in the page language, with a switch to the other language when both exist. */
function BilingualText({ en, ar, isRTL }) {
  const { t } = useTranslation()
  const both = Boolean(en && ar)
  const [lang, setLang] = useState(isRTL ? (ar ? 'ar' : 'en') : en ? 'en' : 'ar')
  useEffect(() => {
    setLang(isRTL ? (ar ? 'ar' : 'en') : en ? 'en' : 'ar')
  }, [isRTL, en, ar])
  const text = lang === 'ar' ? ar || en : en || ar
  return (
    <div>
      {both && (
        <div className="mb-4 inline-flex rounded-xl border border-[#dde3ef] bg-[#f4f6fb] p-0.5" role="tablist">
          {[
            ['en', 'English'],
            ['ar', 'العربية'],
          ].map(([code, label]) => (
            <button
              key={code}
              type="button"
              role="tab"
              aria-selected={lang === code}
              onClick={() => setLang(code)}
              className={`rounded-lg px-3 py-1 text-xs font-bold ${lang === code ? 'bg-white text-[#1a3a6b] shadow-sm' : 'text-slate-500 hover:text-[#1a3a6b]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}>
        {text ? <SubjectProse text={text} /> : <p className="text-sm text-slate-500">{t(`${NS}.notWritten`)}</p>}
      </div>
    </div>
  )
}

export default function ViewSubject() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabic = isRTL || language === 'ar'
  const { id } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = TABS.includes(params.get('tab')) ? params.get('tab') : 'overview'
  const setTab = (next) => {
    const p = new URLSearchParams(params)
    if (next === 'overview') p.delete('tab')
    else p.set('tab', next)
    setParams(p, { replace: true })
  }

  const [subject, setSubject] = useState(null)
  const [prerequisites, setPrerequisites] = useState([])
  const [corequisites, setCorequisites] = useState([])
  const [gradeTypes, setGradeTypes] = useState([])
  const [classes, setClasses] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [loading, setLoading] = useState(true)
  const [enrollmentsLoading, setEnrollmentsLoading] = useState(true)
  const [error, setError] = useState('')
  const [semesterFilter, setSemesterFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [exporting, setExporting] = useState(false)

  const nameOf = (row) => getLocalizedName(row, isArabic)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const { data, error: subErr } = await supabase
          .from('subjects')
          .select('*, majors(id, name_en, name_ar, code), instructors(id, name_en, name_ar, email, academic_title), colleges(id, name_en, name_ar, code)')
          .eq('id', id)
          .single()
        if (subErr) throw subErr
        for (const key of ['attendance_rules', 'grade_configuration']) {
          if (data[key] && typeof data[key] === 'string') {
            try {
              data[key] = JSON.parse(data[key])
            } catch {
              // keep the raw value
            }
          }
        }
        const linked = async (table, column) => {
          const { data: rows } = await supabase.from(table).select(column).eq('subject_id', id)
          const ids = (rows || []).map((r) => r[column]).filter(Boolean)
          if (!ids.length) return []
          const { data: subs } = await supabase.from('subjects').select('id, code, name_en, name_ar, credit_hours').in('id', ids)
          return subs || []
        }
        const [pre, co] = await Promise.all([linked('subject_prerequisites', 'prerequisite_subject_id'), linked('subject_corequisites', 'corequisite_subject_id')])
        if (cancelled) return
        setSubject(data)
        setPrerequisites(pre)
        setCorequisites(co)
      } catch (err) {
        if (!cancelled) setError(err.message || t(`${NS}.loadFailed`))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    getGradeTypesFromUniversitySettings().then(setGradeTypes)
  }, [])

  // Sections of this subject and everyone registered in them (any semester).
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setEnrollmentsLoading(true)
      try {
        const { data: classRows, error: classErr } = await supabase
          .from('classes')
          .select('id, code, section, semester_id, enrolled, capacity, status, instructor_id, instructors(id, name_en, name_ar, academic_title), semesters(id, name_en, name_ar, code, start_date, end_date)')
          .eq('subject_id', id)
        if (classErr) throw classErr
        const ids = (classRows || []).map((c) => c.id)
        let rows = []
        if (ids.length) {
          const { data, error: enrErr } = await supabase
            .from('enrollments')
            .select(
              'id, semester_id, class_id, status, grade, grade_points, students(id, student_id, name_en, name_ar, first_name, middle_name, last_name, first_name_ar, middle_name_ar, last_name_ar, email)'
            )
            .in('class_id', ids)
            .order('enrollment_date', { ascending: false })
          if (enrErr) throw enrErr
          rows = data || []
        }
        if (cancelled) return
        setClasses(classRows || [])
        setEnrollments(rows)
      } catch (err) {
        console.error('Subject sections failed:', err)
        if (!cancelled) {
          setClasses([])
          setEnrollments([])
        }
      } finally {
        if (!cancelled) setEnrollmentsLoading(false)
      }
    }
    if (id) load()
    return () => {
      cancelled = true
    }
  }, [id])

  const classById = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes])
  const registered = useMemo(() => enrollments.filter((e) => e.status === 'enrolled'), [enrollments])

  const semesterOptions = useMemo(() => {
    const map = new Map()
    for (const c of classes) if (c.semesters?.id) map.set(c.semesters.id, c.semesters)
    return [...map.values()].sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')))
  }, [classes])

  // Results from the final grades recorded on each registration.
  const results = useMemo(() => {
    const graded = registered.filter((e) => GRADE_GROUPS.includes(String(e.grade || '').trim().toUpperCase().charAt(0)))
    const groups = GRADE_GROUPS.map((g) => ({ key: g, count: graded.filter((e) => String(e.grade).trim().toUpperCase().charAt(0) === g).length }))
    const failed = groups.find((g) => g.key === 'F').count
    return { graded: graded.length, groups, passRate: graded.length ? Math.round(((graded.length - failed) / graded.length) * 100) : null }
  }, [registered])

  const shownStudents = useMemo(() => {
    const q = query.trim().toLowerCase()
    return registered
      .filter((e) => semesterFilter === 'all' || String(e.semester_id) === String(semesterFilter))
      .filter((e) => {
        if (!q) return true
        const s = e.students || {}
        return [getPersonName(s, false), getPersonName(s, true), s.student_id, s.email].some((v) => String(v || '').toLowerCase().includes(q))
      })
  }, [registered, semesterFilter, query])

  const exportStudents = async (format) => {
    if (!shownStudents.length) {
      toast(t('students.exportNone', 'No students to export.'), 'err')
      return
    }
    try {
      setExporting(true)
      const count = await exportSubjectStudentsList({
        subjectId: id,
        subjectCode: cleanCode(subject?.code),
        isArabic,
        format,
        status: 'enrolled',
        semesterId: semesterFilter,
      })
      toast(t('students.exportSuccess', { count, defaultValue: 'Exported {{count}} students.' }))
    } catch (e) {
      toast(e?.message || t('students.exportFailed', 'Export failed.'), 'err')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-48 rounded-2xl" />
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (error && !subject) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate(-1)} className="rtl:[&>svg]:rotate-180">
          {t('common.back')}
        </Button>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
      </div>
    )
  }

  const title = nameOf(subject)
  const otherName = isArabic ? subject?.name_en : subject?.name_ar
  const showOtherName = otherName && otherName.trim() && otherName.trim() !== title
  const collegeName = nameOf(subject?.colleges) || (subject?.is_university_wide ? t('academic.subjects.universityWide') : '')
  const majorName = nameOf(subject?.majors) || (subject?.is_university_wide || subject?.applies_to_all_majors_of_college ? t(`${NS}.allMajors`) : '')
  const instructorName = formatInstructorDisplayName(subject?.instructors, isArabic) || String(subject?.instructor_name || '').replace(/\s+/g, ' ').trim()
  const instructorEmail = subject?.instructors?.email || subject?.instructor_email
  const attendance = subject?.attendance_rules || (subject?.attendance_method ? { method: subject.attendance_method } : null)
  const mergedGrades =
    Array.isArray(subject?.grade_configuration) && subject.grade_configuration.length ? mergeGradeConfigWithTypes(subject.grade_configuration, gradeTypes) : []
  const visibilityLabel = {
    GV_HID: t('subjectsForm.gradesHidden'),
    GV_TMP: t('subjectsForm.gradesVisibleTemp'),
    GV_REL: t('subjectsForm.gradesReleased'),
    GV_FIN: t('subjectsForm.gradesFinalLocked'),
  }[subject?.grades_visibility_status]
  const fees = [
    subject?.lab_fee ? [t('subjectsForm.labFee'), subject.lab_fee] : null,
    subject?.material_fee ? [t('subjectsForm.materialFee'), subject.material_fee] : null,
    subject?.textbook ? [t('subjectsForm.textbook'), subject.textbook] : null,
  ].filter(Boolean)

  const activeClasses = classes.filter((c) => c.status !== 'inactive')
  const seatsTaken = activeClasses.reduce((s, c) => s + Number(c.enrolled || 0), 0)
  const seatsTotal = activeClasses.reduce((s, c) => s + Number(c.capacity || 0), 0)
  const hours = [
    [t('subjectsForm.theoryHours'), subject?.theory_hours],
    [t('subjectsForm.labHours'), subject?.lab_hours],
    [t('subjectsForm.tutorialHours'), subject?.tutorial_hours],
  ].filter(([, v]) => Number(v) > 0)

  const stats = [
    { icon: BookOpen, label: t('subjectsForm.creditHours'), value: subject?.credit_hours ?? 0, hint: hours.map(([l, v]) => `${l}: ${v}`).join(' · ') },
    { icon: Users, label: t(`${NS}.registeredNow`), value: seatsTaken, hint: seatsTotal ? t(`${NS}.ofSeats`, { count: seatsTotal }) : t(`${NS}.noOpenSection`) },
    { icon: Layers, label: t(`${NS}.sections`), value: classes.length, hint: t(`${NS}.activeSections`, { count: activeClasses.length }) },
    {
      icon: GraduationCap,
      label: t(`${NS}.passRate`),
      value: results.passRate == null ? '—' : `${results.passRate}%`,
      hint: results.graded ? t(`${NS}.ofGraded`, { count: results.graded }) : t(`${NS}.noGradesYet`),
    },
  ]

  const tabs = [
    { id: 'overview', label: t(`${NS}.tabs.overview`), icon: BookOpen },
    { id: 'students', label: t(`${NS}.tabs.students`), icon: Users, count: registered.length },
    { id: 'outcomes', label: t(`${NS}.tabs.outcomes`), icon: Target },
  ]
  const maxGroup = Math.max(1, ...results.groups.map((g) => g.count))

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-[#1a3a6b]">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
          {t('common.back')}
        </button>
        <Button icon={Pencil} onClick={() => navigate(`/academic/subjects/${id}/edit`)}>
          {t('academic.subjects.edit')}
        </Button>
      </div>

      {/* Who and what */}
      <section className="overflow-hidden rounded-2xl border border-[#dde3ef] bg-white">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:p-6">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#1a3a6b] text-white">
            <BookOpen className="h-7 w-7" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {cleanCode(subject?.code) && (
                <span className="rounded-md bg-[#eef2f9] px-2 py-0.5 font-mono text-xs font-bold text-[#1a3a6b]" dir="ltr">
                  {cleanCode(subject.code)}
                </span>
              )}
              <Badge>{subjectTypeLabel(t, subject?.type)}</Badge>
              <Badge tone={subject?.status === 'inactive' ? 'neutral' : 'ok'}>{subject?.status === 'inactive' ? t('common.inactive') : t('common.active')}</Badge>
              {subject?.is_university_wide && <Badge tone="gold">{t('academic.subjects.universityWide')}</Badge>}
            </div>
            <h1 className="mt-2 text-2xl font-extrabold leading-tight text-[#1a3a6b] sm:text-[28px]">{title}</h1>
            {showOtherName && (
              <p className="mt-0.5 text-base text-slate-500">
                <span dir={isArabic ? 'ltr' : 'rtl'}>{otherName}</span>
              </p>
            )}
            <p className="mt-2 text-sm text-slate-600">{[collegeName, majorName].filter(Boolean).join(' · ') || t('common.notSelected')}</p>
          </div>
          {instructorName && (
            <div className="rounded-2xl bg-[#f4f6fb] px-4 py-3 sm:max-w-[16rem]">
              <div className="text-xs font-semibold text-slate-500">{t('subjectsForm.instructor')}</div>
              <div className="mt-0.5 font-bold text-slate-900">{instructorName}</div>
              {instructorEmail && (
                <a href={`mailto:${instructorEmail}`} className="mt-1 inline-flex max-w-full items-center gap-1.5 text-xs font-semibold text-[#1a3a6b] hover:underline" dir="ltr">
                  <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{instructorEmail}</span>
                </a>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-px border-t border-[#dde3ef] bg-[#dde3ef] lg:grid-cols-4">
          {stats.map(({ icon: Icon, label, value, hint }) => (
            <div key={label} className="bg-white px-5 py-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <Icon className="h-3.5 w-3.5 text-[#1a3a6b]" aria-hidden="true" />
                {label}
              </div>
              <div className="mt-1 text-2xl font-extrabold tabular-nums text-[#1a3a6b]" dir="ltr" style={{ textAlign: 'start' }}>
                {value}
              </div>
              {hint ? <div className="mt-0.5 text-xs text-slate-500">{hint}</div> : null}
            </div>
          ))}
        </div>
      </section>

      <nav className="flex gap-1 overflow-x-auto [scrollbar-width:none] rounded-2xl border border-[#dde3ef] bg-white p-1" aria-label={t(`${NS}.tabsLabel`)}>
        {tabs.map(({ id: tabId, label, icon: Icon, count }) => (
          <button
            key={tabId}
            type="button"
            onClick={() => setTab(tabId)}
            aria-current={tab === tabId ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${
              tab === tabId ? 'bg-[#1a3a6b] text-white' : 'text-slate-600 hover:bg-[#eef2f9] hover:text-[#1a3a6b]'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
            {count != null && <span className={`rounded-full px-1.5 text-xs ${tab === tabId ? 'bg-white/20' : 'bg-[#eef2f9]'}`}>{count}</span>}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="grid items-start gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Panel title={t('subjectsForm.description')}>
              <BilingualText en={subject?.description} ar={subject?.description_ar} isRTL={isArabic} />
            </Panel>
            <Panel title={t('subjectsForm.syllabus')}>
              <BilingualText en={subject?.syllabus_content} ar={subject?.syllabus_content_ar} isRTL={isArabic} />
            </Panel>
            {mergedGrades.length > 0 && (
              <Panel flush title={t('subjectsForm.gradeConfiguration')}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead className="bg-[#f4f6fb] text-xs text-slate-500">
                      <tr>
                        {['type', 'weight', 'maximum', 'minimum', 'passScore', 'failScore'].map((k) => (
                          <th key={k} className="px-4 py-2.5 text-start font-semibold">
                            {t(`subjectsForm.${k}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {mergedGrades.map((config, idx) => (
                        <tr key={config.grade_type_code || idx}>
                          <td className="px-4 py-3 font-semibold text-slate-900">{gradeTypeLabel(config, isArabic)}</td>
                          <td className="px-4 py-3 tabular-nums text-slate-700">{config.weight != null && config.weight !== '' ? `${config.weight}%` : '—'}</td>
                          <td className="px-4 py-3 tabular-nums text-slate-700">{config.maximum ?? '—'}</td>
                          <td className="px-4 py-3 tabular-nums text-slate-700">{config.minimum ?? '—'}</td>
                          <td className="px-4 py-3 tabular-nums text-slate-700">{config.pass_score ?? '—'}</td>
                          <td className="px-4 py-3 tabular-nums text-slate-700">{config.fail_score ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            )}
          </div>

          <div className="space-y-5">
            <Panel title={t(`${NS}.results`)} aside={results.graded ? <span className="text-xs text-slate-500">{t(`${NS}.ofGraded`, { count: results.graded })}</span> : null}>
              {results.graded === 0 ? (
                <p className="text-sm text-slate-500">{t(`${NS}.noGradesYet`)}</p>
              ) : (
                <ul className="space-y-2">
                  {results.groups.map((g) => (
                    <li key={g.key} className="flex items-center gap-3" title={`${g.key}: ${g.count}`}>
                      <span className="w-5 text-sm font-extrabold text-slate-700">{g.key}</span>
                      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#eef2f9]">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${g.count ? Math.max(3, Math.round((g.count / maxGroup) * 100)) : 0}%`, background: g.key === 'F' ? '#b91c1c' : '#1a3a6b' }}
                        />
                      </span>
                      <span className="w-8 text-end text-sm font-bold tabular-nums text-slate-800">{g.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title={t(`${NS}.rules`)}>
              <dl className="divide-y divide-slate-100">
                <Row label={t('subjectsForm.creditHours')}>{subject?.credit_hours ?? 0}</Row>
                {hours.map(([label, value]) => (
                  <Row key={label} label={label}>
                    {value}
                  </Row>
                ))}
                {subject?.semester_number != null && subject.semester_number !== '' && <Row label={t('academic.subjects.semester')}>{subject.semester_number}</Row>}
                {attendance && (
                  <Row label={t('subjectsForm.attendanceMethod')}>{attendance.method === 'AT_AUTO' ? t('subjectsForm.attendanceAuto') : t('subjectsForm.attendanceManual')}</Row>
                )}
                {attendance && <Row label={t('subjectsForm.allowExcusedAbsence')}>{attendance.allow_excused !== false ? t('common.yes') : t('common.no')}</Row>}
                {attendance?.max_absences ? <Row label={t('subjectsForm.maxAbsences')}>{attendance.max_absences}</Row> : null}
                {visibilityLabel && <Row label={t('subjectsForm.gradesVisibilityStatus')}>{visibilityLabel}</Row>}
                {fees.map(([label, value]) => (
                  <Row key={label} label={label}>
                    {value}
                  </Row>
                ))}
              </dl>
            </Panel>

            <Panel title={t('subjectsForm.prerequisitesCorequisites')}>
              {prerequisites.length === 0 && corequisites.length === 0 ? (
                <p className="text-sm text-slate-500">{t(`${NS}.noPrerequisites`)}</p>
              ) : (
                <div className="space-y-4">
                  {[
                    [t('subjectsForm.prerequisites'), prerequisites],
                    [t('subjectsForm.corequisites'), corequisites],
                  ]
                    .filter(([, list]) => list.length)
                    .map(([label, list]) => (
                      <div key={label}>
                        <div className="mb-1.5 text-xs font-semibold text-slate-500">{label}</div>
                        <ul className="space-y-1.5">
                          {list.map((item) => (
                            <li key={item.id}>
                              <Link to={`/academic/subjects/${item.id}`} className="flex items-center gap-2 rounded-xl bg-[#f4f6fb] px-3 py-2 text-sm hover:bg-[#eef2f9]">
                                <span className="font-mono text-xs font-bold text-[#1a3a6b]" dir="ltr">
                                  {cleanCode(item.code)}
                                </span>
                                <span className="truncate font-semibold text-slate-800">{nameOf(item)}</span>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </div>
              )}
            </Panel>
          </div>
        </div>
      )}

      {tab === 'students' && (
        <div className="space-y-5">
          <Panel flush title={t(`${NS}.sections`)}>
            {enrollmentsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[#1a3a6b]" />
              </div>
            ) : classes.length === 0 ? (
              <EmptyState icon={Layers} title={t(`${NS}.noSections`)} hint={t(`${NS}.noSectionsHint`)} />
            ) : (
              <ul className="divide-y divide-slate-100">
                {[...classes]
                  .sort((a, b) => String(b.semesters?.start_date || '').localeCompare(String(a.semesters?.start_date || '')))
                  .map((c) => {
                    const pct = c.capacity ? Math.min(100, Math.round((Number(c.enrolled || 0) / c.capacity) * 100)) : 0
                    const teacher = formatInstructorDisplayName(c.instructors, isArabic)
                    return (
                      <li key={c.id}>
                        <Link to={`/academic/classes/${c.id}`} className="grid gap-2 px-4 py-3.5 hover:bg-[#f4f6fb] sm:grid-cols-[1.4fr_1fr_1.2fr] sm:items-center sm:px-5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-900">{t(`${NS}.section`, { name: c.section || '—' })}</span>
                              <Badge tone={c.status === 'inactive' ? 'neutral' : 'ok'}>{c.status === 'inactive' ? t('common.inactive') : t('common.active')}</Badge>
                            </div>
                            <div className="mt-0.5 truncate text-xs text-slate-500">{nameOf(c.semesters) || '—'}</div>
                          </div>
                          <div className="text-sm text-slate-600">{teacher || <span className="text-amber-700">{t(`${NS}.noInstructor`)}</span>}</div>
                          <div>
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500">{t(`${NS}.seats`)}</span>
                              <span className="font-bold tabular-nums text-slate-800" dir="ltr">
                                {Number(c.enrolled || 0)}/{c.capacity || '—'}
                              </span>
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#eef2f9]">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? '#b91c1c' : '#1a3a6b' }} />
                            </div>
                          </div>
                        </Link>
                      </li>
                    )
                  })}
              </ul>
            )}
          </Panel>

          <Panel
            flush
            title={t(`${NS}.registeredStudents`, { count: shownStudents.length })}
            aside={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="quiet" icon={Download} loading={exporting} disabled={!shownStudents.length} onClick={() => exportStudents('xlsx')}>
                  Excel
                </Button>
                <Button size="sm" variant="quiet" icon={Download} loading={exporting} disabled={!shownStudents.length} onClick={() => exportStudents('csv')}>
                  CSV
                </Button>
              </div>
            }
          >
            <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
              <label className="relative min-w-[12rem] flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t(`${NS}.searchStudents`)}
                  className="h-10 w-full rounded-xl border border-[#dde3ef] bg-white pe-3 ps-9 text-sm"
                />
              </label>
              {semesterOptions.length > 1 && (
                <select value={semesterFilter} onChange={(e) => setSemesterFilter(e.target.value)} className="h-10 rounded-xl border border-[#dde3ef] bg-white px-3 text-sm">
                  <option value="all">{t('enrollments.allSemesters', 'All semesters')}</option>
                  {semesterOptions.map((sem) => (
                    <option key={sem.id} value={String(sem.id)}>
                      {nameOf(sem)}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {enrollmentsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[#1a3a6b]" />
              </div>
            ) : shownStudents.length === 0 ? (
              <EmptyState icon={Users} title={registered.length ? t(`${NS}.noMatch`) : t(`${NS}.noStudents`)} />
            ) : (
              <ul className="divide-y divide-slate-100">
                {shownStudents.map((row) => {
                  const s = row.students || {}
                  const c = classById.get(row.class_id)
                  return (
                    <li key={row.id}>
                      <Link to={`/students/${s.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-[#f4f6fb] sm:px-5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef2f9] text-xs font-extrabold text-[#1a3a6b]">
                          {(getPersonName(s, isArabic) || '?').trim().charAt(0)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-slate-900">{getPersonName(s, isArabic) || '—'}</span>
                          <span className="block truncate text-xs text-slate-500" dir="ltr" style={{ textAlign: 'start' }}>
                            {[s.student_id, s.email].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="text-xs text-slate-500">
                          {c?.section ? t(`${NS}.section`, { name: c.section }) : ''} {c?.semesters ? `· ${nameOf(c.semesters)}` : ''}
                        </span>
                        <span className="w-12 text-end">
                          {row.grade ? (
                            <Badge tone={String(row.grade).trim().toUpperCase() === 'F' ? 'err' : 'info'}>{String(row.grade).trim()}</Badge>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {tab === 'outcomes' && (
        <Panel
          title={t('academic.subjects.curriculumMapTitle')}
          aside={
            <Link to={`/admin/curriculum-map?subjectId=${id}`} className="text-xs font-bold text-[#1a3a6b] hover:underline">
              {t('academic.subjects.openAdminCurriculumMap')}
            </Link>
          }
        >
          <p className="mb-4 text-sm text-slate-600">{t('academic.subjects.curriculumMapDescription')}</p>
          <SubjectCurriculumMapPanel subjectId={Number(id)} subjectLabel={`${cleanCode(subject.code)} — ${title}`} embedAboutColumn={false} plainSurface />
        </Panel>
      )}
    </div>
  )
}
