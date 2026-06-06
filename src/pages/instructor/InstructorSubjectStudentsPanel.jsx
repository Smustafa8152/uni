import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { formatGenderLabel } from '../../utils/formatGenderLabel'
import {
  getNationalityFilterOptions,
  getNationalityLabel,
  nationalityMatchesFilter,
} from '../../utils/nationalities'
import { supabase } from '../../lib/supabase'

function getStudentDisplayName(student, isArabic) {
  if (!student) return '—'
  const localized = getLocalizedName(student, isArabic)
  if (localized) return localized
  const en = [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ')
  const ar = [student.first_name_ar, student.middle_name_ar, student.last_name_ar].filter(Boolean).join(' ')
  return isArabic ? (ar || en) : (en || ar) || '—'
}

function formatGenderFilterLabel(t, raw) {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'male') return t('admissions.viewApplication.detail.genderMale', 'Male')
  if (v === 'female') return t('admissions.viewApplication.detail.genderFemale', 'Female')
  return String(raw ?? '').trim() || raw
}

export default function InstructorSubjectStudentsPanel({ classes = [] }) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const isArabic = language === 'ar'
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [nationalityFilter, setNationalityFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [classFilter, setClassFilter] = useState('all')

  useEffect(() => {
    const ids = (classes || []).map((c) => c.id).filter(Boolean)
    if (!ids.length) {
      setStudents([])
      setLoading(false)
      return
    }

    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('enrollments')
          .select(`
            id,
            class_id,
            students(
              id,
              student_id,
              name_en,
              name_ar,
              first_name,
              middle_name,
              last_name,
              first_name_ar,
              middle_name_ar,
              last_name_ar,
              email,
              phone,
              mobile_phone,
              nationality,
              gender
            )
          `)
          .in('class_id', ids)
          .eq('status', 'enrolled')

        if (error) throw error
        if (cancelled) return

        const byStudentId = new Map()
        for (const row of data || []) {
          const s = row.students
          if (!s?.id) continue
          if (!byStudentId.has(s.id)) {
            byStudentId.set(s.id, { ...s, classIds: [row.class_id] })
          } else {
            const existing = byStudentId.get(s.id)
            if (!existing.classIds.includes(row.class_id)) {
              existing.classIds.push(row.class_id)
            }
          }
        }
        setStudents([...byStudentId.values()])
      } catch (e) {
        console.error(e)
        setStudents([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [classes])

  const nationalityOptions = useMemo(
    () => getNationalityFilterOptions(students, isArabic),
    [students, isArabic],
  )

  const genderOptions = useMemo(() => {
    const set = new Set()
    let hasEmpty = false
    for (const s of students) {
      const g = String(s.gender ?? '').trim()
      if (g) set.add(g)
      else hasEmpty = true
    }
    const rank = (x) => {
      const l = x.toLowerCase()
      if (l === 'male') return 0
      if (l === 'female') return 1
      return 2
    }
    return {
      values: [...set].sort((a, b) => {
        const ra = rank(a)
        const rb = rank(b)
        if (ra !== rb) return ra - rb
        return a.localeCompare(b, undefined, { sensitivity: 'base' })
      }),
      hasEmpty,
    }
  }, [students])

  const filteredStudents = useMemo(() => {
    let list = [...students]

    if (classFilter !== 'all') {
      list = list.filter((s) => s.classIds?.includes(Number(classFilter)))
    }

    if (nationalityFilter !== 'all') {
      list = list.filter((s) => nationalityMatchesFilter(s.nationality, nationalityFilter))
    }

    if (genderFilter !== 'all') {
      if (genderFilter === '__empty__') {
        list = list.filter((s) => !String(s.gender ?? '').trim())
      } else {
        list = list.filter((s) => String(s.gender ?? '').trim() === genderFilter)
      }
    }

    const q = searchQuery.trim().toLowerCase()
    if (q) {
      list = list.filter((s) => {
        const name = getStudentDisplayName(s, isArabic).toLowerCase()
        return (
          (s.student_id && s.student_id.toLowerCase().includes(q)) ||
          (s.email && s.email.toLowerCase().includes(q)) ||
          name.includes(q) ||
          (s.phone && String(s.phone).toLowerCase().includes(q)) ||
          (s.mobile_phone && String(s.mobile_phone).toLowerCase().includes(q))
        )
      })
    }

    return list.sort((a, b) =>
      getStudentDisplayName(a, isArabic).localeCompare(getStudentDisplayName(b, isArabic), undefined, {
        sensitivity: 'base',
      }),
    )
  }, [students, classFilter, nationalityFilter, genderFilter, searchQuery, isArabic])

  if (!classes?.length) {
    return (
      <div className="card">
        <p className="ts" style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>
          {t('instructorPortal.studentsPanelNoClasses', 'No class sections assigned.')}
        </p>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="card-hd">
        <div>
          <div className="card-title">{t('instructorPortal.subjectHome.tabStudents', 'Students')}</div>
          <div className="card-sub">
            {t('instructorPortal.studentsPanelCount', {
              count: filteredStudents.length,
              total: students.length,
              defaultValue: '{{count}} of {{total}} students',
            })}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
          marginBottom: 16,
          alignItems: 'stretch',
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 180 }}>
          <Search
            style={{
              position: 'absolute',
              top: '50%',
              transform: 'translateY(-50%)',
              width: 16,
              height: 16,
              color: 'var(--muted)',
              ...(isArabic ? { right: 12 } : { left: 12 }),
            }}
          />
          <input
            type="search"
            className="fc"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('instructorPortal.studentsPanelSearch', 'Search by ID, name, email, or phone…')}
            style={{
              width: '100%',
              paddingLeft: isArabic ? 12 : 36,
              paddingRight: isArabic ? 36 : 12,
            }}
          />
        </div>
        {classes.length > 1 && (
          <select
            className="fc"
            style={{ width: 'auto', minWidth: 140 }}
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
          >
            <option value="all">{t('instructorPortal.studentsPanelAllSections', 'All sections')}</option>
            {classes.map((cls) => (
              <option key={cls.id} value={String(cls.id)}>
                {cls.code} — {t('instructorPortal.section')} {cls.section}
              </option>
            ))}
          </select>
        )}
        <select
          className="fc"
          style={{ width: 'auto', minWidth: 140 }}
          value={nationalityFilter}
          onChange={(e) => setNationalityFilter(e.target.value)}
        >
          <option value="all">{t('students.filterNationalityAll', 'All nationalities')}</option>
          {nationalityOptions.hasEmpty && (
            <option value="__empty__">{t('students.filterNationalityNotSpecified', 'Nationality not specified')}</option>
          )}
          {nationalityOptions.values.map((opt) => (
            <option key={opt.code} value={opt.code}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          className="fc"
          style={{ width: 'auto', minWidth: 130 }}
          value={genderFilter}
          onChange={(e) => setGenderFilter(e.target.value)}
        >
          <option value="all">{t('instructorPortal.studentsPanelGenderAll', 'All genders')}</option>
          {genderOptions.hasEmpty && (
            <option value="__empty__">{t('instructorPortal.studentsPanelGenderNotSpecified', 'Gender not specified')}</option>
          )}
          {genderOptions.values.map((g) => (
            <option key={g} value={g}>
              {formatGenderFilterLabel(t, g)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="ts" style={{ color: 'var(--muted)' }}>{t('common.loading')}</p>
      ) : filteredStudents.length === 0 ? (
        <p className="ts" style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>
          {students.length === 0
            ? t('instructorPortal.studentsPanelNone', 'No enrolled students.')
            : t('instructorPortal.studentsPanelEmptyFiltered', 'No students match your search or filters.')}
        </p>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>{t('instructorPortal.studentsPanelColId', 'ID')}</th>
                <th>{t('instructorPortal.studentsPanelColName', 'Name')}</th>
                <th>{t('instructorPortal.studentsPanelColEmail', 'Email')}</th>
                <th>{t('instructorPortal.studentsPanelColPhone', 'Phone')}</th>
                <th>{t('instructorPortal.studentsPanelColNationality', 'Nationality')}</th>
                <th>{t('instructorPortal.studentsPanelColGender', 'Gender')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((s) => (
                <tr key={s.id}>
                  <td>{s.student_id || '—'}</td>
                  <td>{getStudentDisplayName(s, isArabic)}</td>
                  <td>{s.email || '—'}</td>
                  <td>{s.mobile_phone || s.phone || '—'}</td>
                  <td>{getNationalityLabel(s.nationality, isArabic)}</td>
                  <td>{formatGenderLabel(s.gender, isArabic) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
