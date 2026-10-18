import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Award, Check, CheckCircle2, FileText, Loader2, Search, UserPlus, X } from 'lucide-react'
import { SUPABASE_STORAGE_BUCKET, supabase } from '../../lib/supabase'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { isMissingFeeMigration } from '../../utils/programFees'
import { Badge, Button, EmptyState, PageHeader, toast } from '../../components/ui'

const STATUSES = ['requested', 'approved', 'declined']
const PAGE = 60
const SCHOLARSHIP_DOCS = ['scholarship_letter', 'scholarship_financial', 'scholarship_recommendation']

const chunk = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size))

async function fetchAll(build) {
  const rows = []
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return rows
}

/**
 * Who gets a scholarship. The applicant asks on the application form; staff decide here. An approved
 * percentage reduces only the tuition part of each semester's fees. A decision made on an application
 * reaches the student record automatically, now or when the student is created.
 */
export default function Scholarships() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabic = isRTL || language === 'ar'
  const [rows, setRows] = useState([])
  const [majors, setMajors] = useState({})
  const [docs, setDocs] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [missing, setMissing] = useState(false)
  const [tab, setTab] = useState('requested')
  const [query, setQuery] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)

  const nameOf = (row) => (row ? getLocalizedName(row, isArabic) || row.name_en || row.name_ar : '') || '—'

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [students, applications, majorRows] = await Promise.all([
        fetchAll(() =>
          supabase
            .from('students')
            .select('id, student_id, name_en, name_ar, email, major_id, scholarship_status, scholarship_percentage, scholarship_type, scholarship_details, scholarship_decided_at')
            .in('scholarship_status', STATUSES)
            .order('id')
        ),
        fetchAll(() =>
          supabase
            .from('applications')
            .select('id, application_number, first_name, last_name, first_name_ar, last_name_ar, email, major_id, status_code, scholarship_status, scholarship_percentage, scholarship_type, scholarship_details, scholarship_decided_at')
            .in('scholarship_status', STATUSES)
            .order('id')
        ),
        supabase.from('majors').select('id, name_en, name_ar'),
      ])
      if (majorRows.error) throw majorRows.error
      const studentEmails = new Set(students.map((s) => String(s.email || '').toLowerCase()).filter(Boolean))
      const list = [
        ...students.map((s) => ({ ...s, kind: 'student', key: `s${s.id}`, label: nameOf(s), number: s.student_id })),
        ...applications
          .filter((a) => !studentEmails.has(String(a.email || '').toLowerCase()))
          .map((a) => ({
            ...a,
            kind: 'applicant',
            key: `a${a.id}`,
            label:
              (isArabic ? [a.first_name_ar, a.last_name_ar].filter(Boolean).join(' ') : '') ||
              [a.first_name, a.last_name].filter(Boolean).join(' ') ||
              [a.first_name_ar, a.last_name_ar].filter(Boolean).join(' ') ||
              a.email,
            number: a.application_number,
          })),
      ]
      setRows(list)
      setMajors(Object.fromEntries((majorRows.data || []).map((m) => [m.id, m])))
      loadDocs(list, applications)
      setMissing(false)
    } catch (err) {
      if (isMissingFeeMigration(err)) setMissing(true)
      else setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  /** The files each person uploaded: their student documents plus the documents of their application. */
  const loadDocs = async (list, applications) => {
    const appIdsByEmail = new Map()
    for (const a of applications) {
      const email = String(a.email || '').toLowerCase()
      if (!email) continue
      if (!appIdsByEmail.has(email)) appIdsByEmail.set(email, [])
      appIdsByEmail.get(email).push(a.id)
    }
    const appIdsFor = (row) => (row.kind === 'applicant' ? [row.id] : appIdsByEmail.get(String(row.email || '').toLowerCase()) || [])
    const appIds = [...new Set(list.flatMap(appIdsFor))]
    const studentIds = list.filter((r) => r.kind === 'student').map((r) => r.id)
    try {
      const appDocs = []
      for (const ids of chunk(appIds, 150)) {
        const { data, error: docErr } = await supabase
          .from('application_documents')
          .select('id, application_id, document_type, document_label, file_path, file_name, verified_at, rejected_at')
          .in('application_id', ids)
        if (docErr) throw docErr
        appDocs.push(...(data || []))
      }
      const stuDocs = []
      for (const ids of chunk(studentIds, 150)) {
        const { data, error: docErr } = await supabase
          .from('student_documents')
          .select('id, student_id, document_type, file_path, file_name, verified_at')
          .in('student_id', ids)
        if (docErr) throw docErr
        stuDocs.push(...(data || []))
      }
      const byApp = new Map()
      for (const d of appDocs) {
        if (!byApp.has(d.application_id)) byApp.set(d.application_id, [])
        byApp.get(d.application_id).push(d)
      }
      const map = {}
      for (const row of list) {
        const own = row.kind === 'student' ? stuDocs.filter((d) => d.student_id === row.id) : []
        const fromApp = appIdsFor(row).flatMap((id) => byApp.get(id) || [])
        const seen = new Set()
        map[row.key] = [...own, ...fromApp].filter((d) => d.file_path && !seen.has(d.file_path) && seen.add(d.file_path))
      }
      setDocs(map)
    } catch {
      setDocs({})
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isArabic])

  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.scholarship_status === s).length])), [rows])
  const approvedStudents = rows.filter((r) => r.scholarship_status === 'approved' && r.kind === 'student').length

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows
      .filter((r) => r.scholarship_status === tab)
      .filter((r) => !q || [r.label, r.number, r.email, r.scholarship_type].some((v) => String(v || '').toLowerCase().includes(q)))
      .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'student' ? -1 : 1))
  }, [rows, tab, query])

  const decide = async (row, status, percent) => {
    const table = row.kind === 'student' ? 'students' : 'applications'
    const values = { scholarship_status: status, scholarship_percentage: status === 'approved' ? percent : row.scholarship_percentage }
    if (row.kind === 'student') values.has_scholarship = status === 'approved'
    const { error: upErr } = await supabase.from(table).update(values).eq('id', row.id)
    if (upErr) throw upErr
    toast(status === 'approved' ? t('scholarships.approvedToast', { name: row.label, percent }) : t('scholarships.declinedToast', { name: row.label }))
    setEditing(null)
    load()
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={t('scholarships.title')}
        subtitle={t('scholarships.subtitle')}
        actions={
          <Button variant="quiet" icon={UserPlus} onClick={() => setAdding(true)} disabled={missing}>
            {t('scholarships.addForStudent')}
          </Button>
        }
      />

      {missing && <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{t('fees.migrationNeeded')}</div>}
      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="rounded-2xl border border-[#dde3ef] bg-white p-4 text-sm leading-relaxed text-slate-600">
        <p>{t('scholarships.howItWorks')}</p>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#dde3ef] bg-[#dde3ef] sm:grid-cols-4">
        {[
          [t('scholarships.tabs.requested'), counts.requested || 0],
          [t('scholarships.tabs.approved'), counts.approved || 0],
          [t('scholarships.tabs.declined'), counts.declined || 0],
          [t('scholarships.approvedStudents'), approvedStudents],
        ].map(([label, value]) => (
          <div key={label} className="bg-white px-4 py-3">
            <div className="text-[11px] font-semibold text-slate-500">{label}</div>
            <div className="mt-0.5 text-xl font-extrabold tabular-nums text-[#1a3a6b]">{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-[#dde3ef] bg-white p-0.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setTab(s)
                setLimit(PAGE)
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-bold ${tab === s ? 'bg-[#1a3a6b] text-white' : 'text-slate-600 hover:bg-[#eef2f9]'}`}
            >
              {t(`scholarships.tabs.${s}`)} <span className="opacity-70">{counts[s] || 0}</span>
            </button>
          ))}
        </div>
        <label className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('scholarships.search')} className="h-10 w-full rounded-xl border border-[#dde3ef] bg-white pe-3 ps-9 text-sm" />
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-7 w-7 animate-spin text-[#1a3a6b]" />
        </div>
      ) : shown.length === 0 ? (
        <EmptyState icon={Award} title={t(`scholarships.empty.${tab}`)} />
      ) : (
        <ul className="space-y-2">
          {shown.slice(0, limit).map((row) => (
            <li key={row.key} className="rounded-2xl border border-[#dde3ef] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-slate-900">{row.label}</span>
                    <Badge tone={row.kind === 'student' ? 'info' : 'neutral'}>{t(`scholarships.kind.${row.kind}`)}</Badge>
                    {row.number && (
                      <span className="text-xs text-slate-500" dir="ltr">
                        {row.number}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">{nameOf(majors[row.major_id])}</div>
                  {(row.scholarship_type || row.scholarship_details) && (
                    <p className="mt-2 text-sm text-slate-700">
                      {row.scholarship_type && <span className="font-semibold">{row.scholarship_type}</span>}
                      {row.scholarship_type && row.scholarship_details ? ' — ' : ''}
                      {row.scholarship_details}
                    </p>
                  )}
                  <DocumentLinks docs={docs[row.key]} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {row.scholarship_status === 'approved' ? (
                    <Badge tone="ok">{t('scholarships.approvedPercent', { percent: Number(row.scholarship_percentage) || 0 })}</Badge>
                  ) : row.scholarship_percentage != null ? (
                    <span className="text-xs text-slate-500">{t('scholarships.asked', { percent: Number(row.scholarship_percentage) })}</span>
                  ) : null}
                  {editing?.key === row.key ? (
                    <DecisionForm row={row} onCancel={() => setEditing(null)} onDecide={decide} />
                  ) : (
                    <>
                      {row.scholarship_status !== 'approved' && (
                        <Button size="sm" icon={Check} onClick={() => setEditing(row)}>
                          {t('scholarships.approve')}
                        </Button>
                      )}
                      {row.scholarship_status === 'approved' && (
                        <Button size="sm" variant="quiet" onClick={() => setEditing(row)}>
                          {t('scholarships.change')}
                        </Button>
                      )}
                      {row.scholarship_status !== 'declined' && (
                        <Button size="sm" variant="danger" icon={X} onClick={() => decide(row, 'declined').catch((err) => toast(err?.message || String(err), 'err'))}>
                          {row.scholarship_status === 'approved' ? t('scholarships.revoke') : t('scholarships.decline')}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
          {shown.length > limit && (
            <li className="text-center">
              <Button variant="ghost" onClick={() => setLimit((n) => n + PAGE)}>
                {t('scholarships.showMore', { count: shown.length - limit })}
              </Button>
            </li>
          )}
        </ul>
      )}

      {adding && (
        <AddForStudent
          nameOf={nameOf}
          onClose={() => setAdding(false)}
          onPick={(student) => {
            setAdding(false)
            setTab('requested')
            setEditing({ ...student, kind: 'student', key: `s${student.id}`, label: nameOf(student), number: student.student_id })
            setRows((prev) => (prev.some((r) => r.key === `s${student.id}`) ? prev : [{ ...student, kind: 'student', key: `s${student.id}`, label: nameOf(student), number: student.student_id, scholarship_status: 'requested' }, ...prev]))
          }}
        />
      )}
    </div>
  )
}

function DocumentLinks({ docs }) {
  const { t } = useTranslation()
  const [showAll, setShowAll] = useState(false)
  if (docs === undefined) return null
  if (!docs.length) return <p className="mt-2 text-xs text-slate-400">{t('scholarships.noDocs')}</p>
  const main = docs.filter((d) => SCHOLARSHIP_DOCS.includes(d.document_type))
  const others = docs.filter((d) => !SCHOLARSHIP_DOCS.includes(d.document_type))
  const shown = showAll ? [...main, ...others] : main
  const label = (d) => d.document_label || t(`admissions.viewApplication.documentTypes.${d.document_type}`, d.file_name || d.document_type)
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {shown.map((d) => {
        const url = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(d.file_path).data?.publicUrl
        const scholarship = SCHOLARSHIP_DOCS.includes(d.document_type)
        return (
          <a
            key={`${d.id}-${d.file_path}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={d.file_name || ''}
            className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold hover:underline ${
              scholarship ? 'border-[#c8a84b]/50 bg-[#fbf7ea] text-[#5c4a14]' : 'border-[#dde3ef] bg-white text-[#1a3a6b]'
            }`}
          >
            <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{label(d)}</span>
            {d.verified_at && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-label={t('common.verified', 'Verified')} />}
          </a>
        )
      })}
      {main.length === 0 && !showAll && <span className="text-xs text-slate-500">{t('scholarships.noScholarshipDocs')}</span>}
      {others.length > 0 && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="text-xs font-bold text-[#1a3a6b] hover:underline">
          {showAll ? t('scholarships.fewerDocs') : t('scholarships.moreDocs', { count: others.length })}
        </button>
      )}
    </div>
  )
}

function DecisionForm({ row, onCancel, onDecide }) {
  const { t } = useTranslation()
  const [percent, setPercent] = useState(String(row.scholarship_percentage ?? 100))
  const [busy, setBusy] = useState(false)
  const value = Number(percent)
  const valid = Number.isFinite(value) && value > 0 && value <= 100
  return (
    <div className="flex items-center gap-2">
      <label className="flex items-center gap-1 text-sm font-semibold text-slate-700">
        <input type="number" min="1" max="100" value={percent} onChange={(e) => setPercent(e.target.value)} className="h-8 w-20 rounded-lg border border-[#dde3ef] px-2 text-sm" dir="ltr" autoFocus />%
      </label>
      <Button
        size="sm"
        loading={busy}
        disabled={!valid}
        onClick={async () => {
          setBusy(true)
          try {
            await onDecide(row, 'approved', value)
          } catch (err) {
            toast(err?.message || String(err), 'err')
            setBusy(false)
          }
        }}
      >
        {t('scholarships.save')}
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>
        {t('programFees.cancel')}
      </Button>
    </div>
  )
}

function AddForStudent({ nameOf, onClose, onPick }) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      return undefined
    }
    const id = setTimeout(async () => {
      setBusy(true)
      const safe = term.replace(/[%,()]/g, ' ')
      const { data } = await supabase
        .from('students')
        .select('id, student_id, name_en, name_ar, email, major_id, scholarship_status, scholarship_percentage, scholarship_type, scholarship_details')
        .or(`name_en.ilike.%${safe}%,name_ar.ilike.%${safe}%,student_id.ilike.%${safe}%,email.ilike.%${safe}%`)
        .limit(10)
      setResults(data || [])
      setBusy(false)
    }, 250)
    return () => clearTimeout(id)
  }, [q])

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#12284c]/40 p-4 backdrop-blur-[2px] sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-extrabold text-[#1a3a6b]">{t('scholarships.addForStudent')}</h3>
        <p className="mt-1 text-sm text-slate-600">{t('scholarships.addHint')}</p>
        <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus placeholder={t('scholarships.search')} className="mt-3 h-10 w-full rounded-xl border border-[#dde3ef] px-3 text-sm" />
        <ul className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto">
          {busy && (
            <li className="py-4 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#1a3a6b]" />
            </li>
          )}
          {!busy &&
            results.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => onPick(s)} className="flex w-full items-center justify-between gap-2 px-1 py-2.5 text-start hover:bg-[#f4f6fb]">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900">{nameOf(s)}</span>
                    <span className="block text-xs text-slate-500" dir="ltr" style={{ textAlign: 'start' }}>
                      {s.student_id}
                    </span>
                  </span>
                  {s.scholarship_status === 'approved' && <Badge tone="ok">{Number(s.scholarship_percentage) || 0}%</Badge>}
                </button>
              </li>
            ))}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button variant="quiet" onClick={onClose}>
            {t('programFees.cancel')}
          </Button>
        </div>
      </div>
    </div>
  )
}
