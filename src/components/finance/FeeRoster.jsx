import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Banknote, CheckCircle2, Loader2, Search, Undo2, Users } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'
import { cancelFeePayment, fetchRoster, formatMoney, isMissingFeeMigration, openedSemesterIds, recordFeePayment } from '../../utils/programFees'
import { Badge, Button, ConfirmDialog, EmptyState, toast } from '../ui'

/**
 * Who has paid: every active student of one programme with what they owe for one semester (worked out by the
 * database), and the place to record a cash or bank payment or cancel one recorded by mistake.
 */
export default function FeeRoster({ plans, semesters, openings, isArabic, migrated, onPaymentsChanged }) {
  const { t } = useTranslation()
  const [planId, setPlanId] = useState(plans[0]?.id || '')
  const plan = plans.find((p) => String(p.id) === String(planId)) || null
  const nameOf = (row) => (row ? getLocalizedName(row, isArabic) || row.name_en || row.name_ar : '') || '—'

  // Semesters opened for this programme first, newest first; then the rest of the current and upcoming ones.
  const semesterChoices = useMemo(() => {
    if (!plan) return []
    const opened = openedSemesterIds(
      openings.filter((o) => o.plan_id === plan.id),
      semesters
    )
    const today = new Date().toISOString().slice(0, 10)
    const sorted = [...semesters].sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)))
    return [
      ...sorted.filter((s) => opened.has(s.id)).map((s) => ({ ...s, opened: true })),
      ...sorted.filter((s) => !opened.has(s.id) && (!s.end_date || s.end_date >= today)).map((s) => ({ ...s, opened: false })),
    ]
  }, [plan, openings, semesters])

  const [semesterId, setSemesterId] = useState('')
  useEffect(() => {
    if (!semesterChoices.some((s) => String(s.id) === String(semesterId))) setSemesterId(semesterChoices[0]?.id || '')
  }, [semesterChoices, semesterId])

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [recording, setRecording] = useState(null)
  const [undoing, setUndoing] = useState(null)

  const load = async () => {
    if (!plan || !semesterId || !migrated) return
    setLoading(true)
    setError('')
    try {
      setRows(await fetchRoster(supabase, plan.id, Number(semesterId)))
    } catch (err) {
      setError(isMissingFeeMigration(err) ? t('fees.migrationNeeded') : err?.message || String(err))
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, semesterId, migrated])

  const currency = plan?.currency || 'GMD'
  const money = (v) => formatMoney(v, currency)
  const creditHours = plan?.billing_mode === 'credit_hours'

  const summary = useMemo(() => {
    const paid = rows.filter((r) => r.due?.paid)
    const payable = rows.filter((r) => !r.due?.paid && r.due?.ok && !r.due?.reason)
    return {
      students: rows.length,
      paid: paid.length,
      unpaid: payable.length,
      collected: paid.reduce((s, r) => s + Number(r.due?.payment?.amount || 0), 0),
      outstanding: payable.reduce((s, r) => s + Number(r.due?.amount || 0), 0),
      scholarships: rows.filter((r) => Number(r.due?.scholarship_percent) > 0).length,
    }
  }, [rows])

  const shown = rows.filter((r) => {
    const q = query.trim().toLowerCase()
    if (q && ![r.name_en, r.name_ar, r.student_number, r.email].some((v) => String(v || '').toLowerCase().includes(q))) return false
    if (filter === 'paid') return r.due?.paid
    if (filter === 'unpaid') return !r.due?.paid && r.due?.ok && !r.due?.reason
    return true
  })

  const undo = async () => {
    const payment = undoing?.due?.payment
    if (!payment?.id) return
    setUndoing((prev) => ({ ...prev, busy: true }))
    try {
      await cancelFeePayment(supabase, payment.id, '')
      toast(t('fees.roster.cancelled'))
      load()
      onPaymentsChanged?.()
    } catch (err) {
      toast(err?.message || String(err), 'err')
    } finally {
      setUndoing(null)
    }
  }

  if (plans.length === 0) return <EmptyState icon={Users} title={t('programFees.noPlans')} />

  const select = 'h-10 w-full rounded-xl border border-[#dde3ef] bg-white px-3 text-sm font-semibold text-slate-800'

  return (
    <section className="space-y-4">
      <div className="grid gap-3 rounded-2xl border border-[#dde3ef] bg-white p-4 md:grid-cols-[2fr_1.4fr]">
        <label className="text-xs font-semibold text-slate-500">
          {t('programFees.program')}
          <select value={planId} onChange={(e) => setPlanId(e.target.value)} className={`${select} mt-1`}>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {nameOf(p.majors)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-500">
          {t('programFees.semester')}
          <select value={semesterId} onChange={(e) => setSemesterId(e.target.value)} className={`${select} mt-1`}>
            {semesterChoices.map((s) => (
              <option key={s.id} value={s.id}>
                {nameOf(s).trim()} {s.opened ? `· ${t('programFees.cellOpen')}` : `· ${t('programFees.cellClosed')}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!migrated ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{t('fees.migrationNeeded')}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[#dde3ef] bg-[#dde3ef] sm:grid-cols-5">
            {[
              [t('fees.roster.students'), summary.students],
              [t('fees.roster.paid'), summary.paid],
              [t('fees.roster.unpaid'), summary.unpaid],
              [t('fees.roster.collected'), money(summary.collected)],
              [t('fees.roster.outstanding'), money(summary.outstanding)],
            ].map(([label, value]) => (
              <div key={label} className="bg-white px-4 py-3">
                <div className="text-[11px] font-semibold text-slate-500">{label}</div>
                <div className="mt-0.5 text-lg font-extrabold tabular-nums text-[#1a3a6b]" dir="ltr" style={{ textAlign: 'start' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('fees.roster.search')}
                className="h-10 w-full rounded-xl border border-[#dde3ef] bg-white pe-3 ps-9 text-sm"
              />
            </label>
            <div className="flex rounded-xl border border-[#dde3ef] bg-white p-0.5">
              {['all', 'unpaid', 'paid'].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold ${filter === f ? 'bg-[#1a3a6b] text-white' : 'text-slate-600 hover:bg-[#eef2f9]'}`}
                >
                  {t(`fees.roster.filter.${f}`)}
                </button>
              ))}
            </div>
          </div>

          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

          <div className="overflow-hidden rounded-2xl border border-[#dde3ef] bg-white">
            <div className="hidden grid-cols-[2fr_repeat(4,1fr)_1.3fr] gap-3 border-b border-slate-100 bg-[#f4f6fb] px-4 py-2.5 text-xs font-semibold text-slate-500 md:grid">
              <span>{t('programFees.student')}</span>
              <span className="text-end">{creditHours ? t('fees.roster.tuitionHours') : t('fees.roster.tuition')}</span>
              <span className="text-end">{t('fees.roster.scholarship')}</span>
              <span className="text-end">{t('fees.roster.fees')}</span>
              <span className="text-end">{t('fees.roster.due')}</span>
              <span className="text-end">{t('fees.roster.status')}</span>
            </div>
            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-[#1a3a6b]" />
              </div>
            ) : shown.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-slate-500">{rows.length ? t('fees.roster.noMatch') : t('fees.roster.noStudents')}</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {shown.map((row) => {
                  const d = row.due || {}
                  const pct = Number(d.scholarship_percent) || 0
                  return (
                    <li key={row.student_id} className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-4 py-3 text-sm md:grid-cols-[2fr_repeat(4,1fr)_1.3fr] md:items-center">
                      <div className="col-span-2 min-w-0 md:col-span-1">
                        <div className="truncate font-semibold text-slate-900">{nameOf(row)}</div>
                        <div className="text-xs text-slate-500" dir="ltr" style={{ textAlign: 'start' }}>
                          {row.student_number}
                        </div>
                      </div>
                      <Cell label={creditHours ? t('fees.roster.tuitionHours') : t('fees.roster.tuition')}>
                        {money(d.tuition)}
                        {creditHours && <span className="block text-[11px] font-normal text-slate-500">{t('fees.roster.hours', { count: Number(d.credit_hours) || 0 })}</span>}
                      </Cell>
                      <Cell label={t('fees.roster.scholarship')}>
                        {pct ? (
                          <span className="text-emerald-700">
                            −{money(d.discount)}
                            <span className="block text-[11px] font-normal">{pct}%</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </Cell>
                      <Cell label={t('fees.roster.fees')}>{money(d.fees)}</Cell>
                      <Cell label={t('fees.roster.due')} strong>
                        {money(d.paid ? d.payment?.amount : d.amount)}
                      </Cell>
                      <div className="col-span-2 flex flex-wrap items-center justify-end gap-2 md:col-span-1">
                        {d.paid ? (
                          <>
                            <Badge tone="ok" icon={CheckCircle2}>
                              {t('fees.roster.paidBy', { method: t(`fees.method.${d.payment?.method || 'card'}`) })}
                            </Badge>
                            {['cash', 'bank_transfer'].includes(d.payment?.method) && (
                              <button type="button" onClick={() => setUndoing(row)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-700" title={t('fees.roster.cancel')}>
                                <Undo2 className="h-4 w-4" />
                              </button>
                            )}
                          </>
                        ) : d.reason ? (
                          <Badge tone={d.reason === 'not_open' ? 'neutral' : 'warn'}>{t(`fees.reason.${d.reason}`, d.reason)}</Badge>
                        ) : (
                          <Button size="sm" variant="quiet" icon={Banknote} onClick={() => setRecording(row)}>
                            {t('fees.roster.record')}
                          </Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(undoing)}
        title={t('fees.roster.cancel')}
        body={undoing ? t('fees.roster.cancelConfirm', { name: nameOf(undoing), amount: money(undoing.due?.payment?.amount) }) : ''}
        confirmLabel={t('fees.roster.cancel')}
        cancelLabel={t('programFees.cancel')}
        busy={Boolean(undoing?.busy)}
        onConfirm={undo}
        onCancel={() => setUndoing(null)}
      />

      {recording && (
        <RecordPaymentDialog
          row={recording}
          name={nameOf(recording)}
          money={money}
          semesterId={Number(semesterId)}
          onClose={() => setRecording(null)}
          onDone={() => {
            setRecording(null)
            load()
            onPaymentsChanged?.()
          }}
        />
      )}
    </section>
  )
}

function Cell({ label, strong, children }) {
  return (
    <div className={`text-end tabular-nums ${strong ? 'font-extrabold text-[#1a3a6b]' : 'font-semibold text-slate-800'}`} dir="ltr">
      <span className="me-1 text-[11px] font-normal text-slate-400 md:hidden" dir="auto">
        {label}
      </span>
      {children}
    </div>
  )
}

function RecordPaymentDialog({ row, name, money, semesterId, onClose, onDone }) {
  const { t } = useTranslation()
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      await recordFeePayment(supabase, { studentId: row.student_id, semesterId, method, reference, note })
      toast(t('fees.roster.recorded', { name, amount: money(row.due?.amount) }))
      onDone()
    } catch (err) {
      setError(err?.message || String(err))
      setBusy(false)
    }
  }

  const input = 'mt-1 h-10 w-full rounded-xl border border-[#dde3ef] bg-white px-3 text-sm'

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#12284c]/40 p-4 backdrop-blur-[2px] sm:items-center" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={t('fees.roster.recordTitle')} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-extrabold text-[#1a3a6b]">{t('fees.roster.recordTitle')}</h3>
        <p className="mt-1 text-sm text-slate-600">{name}</p>
        <div className="mt-3 rounded-xl bg-[#eef2f9] px-4 py-3">
          <div className="text-xs text-slate-600">{t('fees.roster.amountToRecord')}</div>
          <div className="text-2xl font-extrabold text-[#1a3a6b]" dir="ltr" style={{ textAlign: 'start' }}>
            {money(row.due?.amount)}
          </div>
        </div>
        <fieldset className="mt-4">
          <legend className="text-xs font-semibold text-slate-500">{t('fees.methodLabel')}</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {['cash', 'bank_transfer'].map((m) => (
              <label key={m} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold ${method === m ? 'border-[#1a3a6b] bg-[#eef2f9]' : 'border-[#dde3ef]'}`}>
                <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} />
                {t(`fees.method.${m}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-3 block text-xs font-semibold text-slate-500">
          {t('fees.roster.reference')}
          <input value={reference} onChange={(e) => setReference(e.target.value)} className={input} placeholder={t('fees.roster.referenceHint')} />
        </label>
        <label className="mt-3 block text-xs font-semibold text-slate-500">
          {t('fees.roster.note')}
          <input value={note} onChange={(e) => setNote(e.target.value)} className={input} />
        </label>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="quiet" onClick={onClose} disabled={busy}>
            {t('programFees.cancel')}
          </Button>
          <Button onClick={save} loading={busy}>
            {t('fees.roster.recordButton')}
          </Button>
        </div>
      </div>
    </div>
  )
}
