import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Plus, Trash2, X, Pencil, CalendarCheck, Receipt, GraduationCap, Unlock, CheckCircle2, Wallet, Lock } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'
import { PLAN_SELECT, formatMoney, installmentAmount, planTotal, sortedItems } from '../../utils/programFees'

const LEVEL_ORDER = ['bachelor', 'master', 'phd']
const HIDDEN = new Set(['archived', 'cancelled'])

export default function ProgramFeesPanel({ isArabic }) {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [plans, setPlans] = useState([])
  const [openings, setOpenings] = useState([])
  const [semesters, setSemesters] = useState([])
  const [years, setYears] = useState([])
  const [payments, setPayments] = useState([])
  const [busyKey, setBusyKey] = useState('')
  const [editingId, setEditingId] = useState(null)

  const nameOf = (row) => (row ? getLocalizedName(row, isArabic) || row.name_en || row.name_ar : '') || '—'

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [plansRes, openRes, semRes, yearRes, payRes] = await Promise.all([
        supabase.from('program_fee_plans').select(PLAN_SELECT).order('id'),
        supabase.from('program_fee_openings').select('id, plan_id, semester_id, academic_year_id').order('created_at'),
        supabase.from('semesters').select('id, name_en, name_ar, academic_year_id, start_date, end_date, status').order('start_date', { ascending: false }),
        supabase.from('academic_years').select('id, name_en, name_ar, start_date, status').order('start_date', { ascending: false }),
        supabase
          .from('program_fee_payments')
          .select('id, plan_id, semester_id, amount, currency, paid_at, myfatoorah_payment_id, students (student_id, name_en, name_ar), semesters (name_en, name_ar), program_fee_plans (majors (name_en, name_ar))')
          .eq('status', 'paid')
          .order('paid_at', { ascending: false })
          .limit(1000),
      ])
      for (const res of [plansRes, openRes, semRes, yearRes, payRes]) if (res.error) throw res.error
      setPlans(plansRes.data || [])
      setOpenings(openRes.data || [])
      setSemesters(semRes.data || [])
      setYears(yearRes.data || [])
      setPayments(payRes.data || [])
    } catch (err) {
      setError(err?.message || t('programFees.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const groups = useMemo(() => {
    const byLevel = new Map()
    for (const plan of plans) {
      const level = plan.majors?.degree_level || 'other'
      if (!byLevel.has(level)) byLevel.set(level, [])
      byLevel.get(level).push(plan)
    }
    return [...byLevel.entries()].sort(([a], [b]) => LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b))
  }, [plans])

  const periodLabel = (row) => {
    if (row.semester_id) return nameOf(semesters.find((s) => s.id === row.semester_id)).trim()
    const year = years.find((y) => y.id === row.academic_year_id)
    return t('programFees.wholeYear', { year: nameOf(year).trim() })
  }

  const activePlanRows = plans.filter((p) => p.is_active)

  /** Semesters still running or upcoming, plus any semester that already has an opening. */
  const boardYears = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const hasOpening = (s) => openings.some((o) => o.semester_id === s.id || (o.academic_year_id && o.academic_year_id === s.academic_year_id))
    const shown = semesters
      .filter((s) => hasOpening(s) || (!HIDDEN.has(String(s.status || '').toLowerCase()) && (!s.end_date || s.end_date >= today)))
      .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
    const byYear = new Map()
    for (const s of shown) {
      if (!byYear.has(s.academic_year_id)) byYear.set(s.academic_year_id, { year: years.find((y) => y.id === s.academic_year_id), sems: [] })
      byYear.get(s.academic_year_id).sems.push(s)
    }
    return [...byYear.values()]
  }, [semesters, years, openings])

  const cellOpening = (planId, sem) =>
    openings.find((o) => o.plan_id === planId && o.semester_id === sem.id) ||
    openings.find((o) => o.plan_id === planId && o.academic_year_id && o.academic_year_id === sem.academic_year_id)

  const paidInCell = (planId, semId) => payments.filter((p) => p.plan_id === planId && p.semester_id === semId).length

  const openCells = async (key, pairs) => {
    const rows = pairs.filter(({ plan, sem }) => !cellOpening(plan.id, sem)).map(({ plan, sem }) => ({ plan_id: plan.id, semester_id: sem.id }))
    if (rows.length === 0) return
    setBusyKey(key)
    setError('')
    const { data, error: insErr } = await supabase.from('program_fee_openings').insert(rows).select('id, plan_id, semester_id, academic_year_id')
    setBusyKey('')
    if (insErr) {
      setError(insErr.message)
      return
    }
    setOpenings((prev) => [...prev, ...(data || [])])
  }

  const closeCells = async (key, pairs, message) => {
    const ids = [...new Set(pairs.map(({ plan, sem }) => cellOpening(plan.id, sem)?.id).filter(Boolean))]
    if (ids.length === 0 || !confirm(message)) return
    setBusyKey(key)
    setError('')
    const { error: delErr } = await supabase.from('program_fee_openings').delete().in('id', ids)
    setBusyKey('')
    if (delErr) {
      setError(delErr.message)
      return
    }
    setOpenings((prev) => prev.filter((o) => !ids.includes(o.id)))
  }

  const toggleCell = (plan, sem) => {
    const key = `cell:${plan.id}:${sem.id}`
    const row = cellOpening(plan.id, sem)
    if (!row) return openCells(key, [{ plan, sem }])
    return closeCells(key, [{ plan, sem }], t('programFees.confirmCloseCell', { program: nameOf(plan.majors), period: periodLabel(row) }))
  }

  const toggleGroup = (key, sems, label) => {
    const pairs = activePlanRows.flatMap((plan) => sems.map((sem) => ({ plan, sem })))
    const allOpen = pairs.length > 0 && pairs.every(({ plan, sem }) => cellOpening(plan.id, sem))
    if (!allOpen) return openCells(key, pairs)
    const count = new Set(pairs.map(({ plan }) => plan.id)).size
    return closeCells(key, pairs, t('programFees.confirmClosePeriod', { period: label, count }))
  }

  const groupIsOpen = (sems) =>
    activePlanRows.length > 0 && activePlanRows.every((plan) => sems.every((sem) => cellOpening(plan.id, sem)))

  const monthFmt = new Intl.DateTimeFormat(isArabic ? 'ar-u-nu-latn' : 'en-GB', { month: 'short', year: 'numeric' })
  const semRange = (s) =>
    [s.start_date, s.end_date]
      .filter(Boolean)
      .map((d) => monthFmt.format(new Date(`${d}T00:00:00`)))
      .join(' – ')

  const closeOpening = async (row) => {
    if (!confirm(t('programFees.confirmClose', { period: periodLabel(row) }))) return
    const { error: delErr } = await supabase.from('program_fee_openings').delete().eq('id', row.id)
    if (delErr) {
      setError(delErr.message)
      return
    }
    setOpenings((prev) => prev.filter((o) => o.id !== row.id))
  }

  const openPeriodCount = new Set(openings.map((o) => (o.semester_id ? `sem:${o.semester_id}` : `year:${o.academic_year_id}`))).size
  const collectedTotal = payments.reduce((s, p) => s + Number(p.amount || 0), 0)
  const activePlans = activePlanRows.length
  const boardColumns = boardYears.reduce((n, y) => n + y.sems.length, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: GraduationCap, label: t('programFees.kpiPrograms'), value: activePlans, tone: 'bg-primary-50 text-primary-700' },
          { icon: Unlock, label: t('programFees.kpiOpen'), value: openPeriodCount, tone: 'bg-emerald-50 text-emerald-700' },
          { icon: CheckCircle2, label: t('programFees.kpiPaid'), value: payments.length, tone: 'bg-sky-50 text-sky-700' },
          { icon: Wallet, label: t('programFees.kpiCollected'), value: formatMoney(collectedTotal), tone: 'bg-amber-50 text-amber-700', ltr: true },
        ].map(({ icon: Icon, label, value, tone, ltr }) => (
          <div key={label} className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs text-gray-500">{label}</div>
              <div className="text-xl font-black text-gray-900" dir={ltr ? 'ltr' : undefined}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <CalendarCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
            <div>
              <h2 className="text-base font-bold text-gray-900">{t('programFees.boardTitle')}</h2>
              <p className="mt-1 text-sm text-gray-600">{t('programFees.boardHint')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-emerald-500" />
              {t('programFees.legendOpen')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border border-dashed border-gray-400" />
              {t('programFees.legendClosed')}
            </span>
          </div>
        </div>

        {activePlans === 0 || boardColumns === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
            {activePlans === 0 ? t('programFees.noPlans') : t('programFees.noSemesters')}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    className="sticky start-0 z-10 min-w-[15rem] border-b border-e border-gray-200 bg-gray-50 px-4 py-3 text-start align-bottom text-xs font-semibold text-gray-500"
                  >
                    {t('programFees.program')}
                  </th>
                  {boardYears.map(({ year, sems }) => {
                    const key = `year:${sems[0].academic_year_id}`
                    const yearName = nameOf(year).trim()
                    return (
                      <th key={key} colSpan={sems.length} className="border-b border-e border-gray-200 bg-gray-50 px-3 py-2 last:border-e-0">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <span className="text-xs font-bold text-gray-700">{yearName}</span>
                          <GroupButton
                            open={groupIsOpen(sems)}
                            busy={busyKey === key}
                            disabled={Boolean(busyKey)}
                            onClick={() => toggleGroup(key, sems, t('programFees.wholeYear', { year: yearName }))}
                            openLabel={t('programFees.openYear')}
                            closeLabel={t('programFees.closeYear')}
                          />
                        </div>
                      </th>
                    )
                  })}
                </tr>
                <tr>
                  {boardYears
                    .flatMap(({ sems }) => sems)
                    .map((sem) => {
                      const key = `sem:${sem.id}`
                      return (
                        <th key={key} className="min-w-[9.5rem] border-b border-gray-200 bg-white px-3 py-2.5 align-top font-normal">
                          <div className="text-sm font-bold text-gray-900">{nameOf(sem).trim()}</div>
                          <div className="mt-0.5 text-[11px] text-gray-500">{semRange(sem)}</div>
                          <div className="mt-2">
                            <GroupButton
                              open={groupIsOpen([sem])}
                              busy={busyKey === key}
                              disabled={Boolean(busyKey)}
                              onClick={() => toggleGroup(key, [sem], nameOf(sem).trim())}
                              openLabel={t('programFees.openColumn')}
                              closeLabel={t('programFees.closeColumn')}
                            />
                          </div>
                        </th>
                      )
                    })}
                </tr>
              </thead>
              <tbody>
                {groups.map(([level, levelPlans]) => {
                  const rows = levelPlans.filter((p) => p.is_active)
                  if (rows.length === 0) return null
                  return (
                    <Fragment key={level}>
                      <tr>
                        <td colSpan={boardColumns + 1} className="border-b border-gray-100 bg-gray-50/70 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                          {t(`applyForm.degreeLevels.${level}`, level)}
                        </td>
                      </tr>
                      {rows.map((plan) => (
                        <tr key={plan.id}>
                          <td className="sticky start-0 z-10 border-b border-e border-gray-100 bg-white px-4 py-2.5">
                            <div className="font-semibold leading-snug text-gray-900">{nameOf(plan.majors)}</div>
                            <div className="mt-0.5 text-xs text-gray-500">
                              {t('programFees.installmentsOf', { count: plan.installments })}{' '}
                              <span dir="ltr">{formatMoney(installmentAmount(plan), plan.currency || 'USD')}</span>
                            </div>
                          </td>
                          {boardYears
                            .flatMap(({ sems }) => sems)
                            .map((sem) => {
                              const row = cellOpening(plan.id, sem)
                              const key = `cell:${plan.id}:${sem.id}`
                              return (
                                <td key={sem.id} className="border-b border-gray-100 px-2 py-2">
                                  <BoardCell
                                    open={Boolean(row)}
                                    viaYear={Boolean(row?.academic_year_id)}
                                    paid={paidInCell(plan.id, sem.id)}
                                    busy={busyKey === key}
                                    disabled={Boolean(busyKey)}
                                    onClick={() => toggleCell(plan, sem)}
                                  />
                                </td>
                              )
                            })}
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {plans.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-600">{t('programFees.noPlans')}</div>
      )}

      {groups.map(([level, levelPlans]) => (
        <section key={level} className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-gray-500">{t(`applyForm.degreeLevels.${level}`, level)}</h2>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {levelPlans.map((plan) =>
              editingId === plan.id ? (
                <PlanEditor
                  key={plan.id}
                  plan={plan}
                  title={nameOf(plan.majors)}
                  onCancel={() => setEditingId(null)}
                  onSaved={() => {
                    setEditingId(null)
                    load()
                  }}
                />
              ) : (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  title={nameOf(plan.majors)}
                  isArabic={isArabic}
                  openings={openings.filter((o) => o.plan_id === plan.id)}
                  periodLabel={periodLabel}
                  onClose={closeOpening}
                  onEdit={() => setEditingId(plan.id)}
                />
              )
            )}
          </div>
        </section>
      ))}

      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <Receipt className="h-5 w-5 text-primary-600" />
          <h2 className="text-base font-bold text-gray-900">{t('programFees.paymentsTitle')}</h2>
        </div>
        {payments.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-500">{t('programFees.noPayments')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-start font-semibold">{t('programFees.student')}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t('programFees.program')}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t('programFees.semester')}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t('programFees.amount')}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t('programFees.date')}</th>
                  <th className="px-5 py-3 text-start font-semibold">{t('programFees.reference')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3">
                      <div className="font-medium text-gray-900">{nameOf(p.students)}</div>
                      <div className="text-xs text-gray-500" dir="ltr">{p.students?.student_id}</div>
                    </td>
                    <td className="px-5 py-3 text-gray-700">{nameOf(p.program_fee_plans?.majors)}</td>
                    <td className="px-5 py-3 text-gray-700">{nameOf(p.semesters)}</td>
                    <td className="px-5 py-3 font-semibold text-gray-900" dir="ltr">{formatMoney(p.amount, p.currency)}</td>
                    <td className="px-5 py-3 text-gray-700" dir="ltr">
                      {p.paid_at ? new Date(p.paid_at).toLocaleDateString(isArabic ? 'ar-u-nu-latn' : 'en-GB') : '—'}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-gray-500" dir="ltr">{p.myfatoorah_payment_id || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function GroupButton({ open, busy, disabled, onClick, openLabel, closeLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 transition disabled:opacity-50 ${
        open
          ? 'bg-white text-gray-600 ring-gray-200 hover:bg-red-50 hover:text-red-700 hover:ring-red-200'
          : 'bg-primary-50 text-primary-700 ring-primary-100 hover:bg-primary-100'
      }`}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : open ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
      {open ? closeLabel : openLabel}
    </button>
  )
}

function BoardCell({ open, viaYear, paid, busy, disabled, onClick }) {
  const { t } = useTranslation()
  const note = paid > 0 ? t('programFees.paidShort', { count: paid }) : viaYear ? t('programFees.viaYear') : null
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={open}
      className={`group flex h-14 w-full flex-col items-center justify-center gap-0.5 rounded-xl border text-xs font-bold transition disabled:cursor-wait ${
        open
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-red-200 hover:bg-red-50 hover:text-red-700'
          : 'border-dashed border-gray-300 bg-white text-gray-400 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700'
      }`}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <span className="flex items-center gap-1 group-hover:hidden">
            {open ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-3.5 w-3.5" />}
            {open ? t('programFees.cellOpen') : t('programFees.cellClosed')}
          </span>
          <span className="hidden items-center gap-1 group-hover:flex">
            {open ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
            {open ? t('programFees.actionClose') : t('programFees.actionOpen')}
          </span>
          {open && note && <span className="text-[11px] font-medium opacity-80">{note}</span>}
        </>
      )}
    </button>
  )
}

function PlanCard({ plan, title, isArabic, openings, periodLabel, onClose, onEdit }) {
  const { t } = useTranslation()
  const items = sortedItems(plan)
  const total = planTotal(plan)
  const per = installmentAmount(plan)
  const currency = plan.currency || 'USD'

  return (
    <article className={`rounded-2xl border bg-white p-5 shadow-sm ${plan.is_active ? 'border-gray-200' : 'border-dashed border-gray-300 opacity-70'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold leading-snug text-gray-900">{title}</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
            {plan.study_mode && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{t(`applyForm.workload.${plan.study_mode}`)}</span>
            )}
            {!plan.is_active && <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-600">{t('programFees.inactive')}</span>}
          </div>
        </div>
        <button type="button" onClick={onEdit} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
          <Pencil className="h-3.5 w-3.5" />
          {t('programFees.edit')}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-primary-50 px-3 py-2.5">
          <div className="text-xs text-gray-600">{t('programFees.total')}</div>
          <div className="text-lg font-black text-primary-700" dir="ltr">{formatMoney(total, currency)}</div>
        </div>
        <div className="rounded-xl bg-gray-50 px-3 py-2.5">
          <div className="text-xs text-gray-600">{t('programFees.installmentsOf', { count: plan.installments })}</div>
          <div className="text-lg font-black text-gray-900" dir="ltr">{formatMoney(per, currency)}</div>
        </div>
      </div>

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500">
            <th className="pb-1.5 text-start font-semibold">{t('programFees.item')}</th>
            <th className="pb-1.5 text-end font-semibold">{t('programFees.amount')}</th>
            <th className="pb-1.5 text-end font-semibold">{t('programFees.perInstallment')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => (
            <tr key={item.id} className={item.is_optional ? 'text-gray-400' : 'text-gray-800'}>
              <td className="py-1.5">
                {isArabic ? item.name_ar || item.name_en : item.name_en || item.name_ar}
                {item.is_optional && <span className="ms-1.5 text-xs">({t('programFees.notInTotal')})</span>}
              </td>
              <td className="py-1.5 text-end tabular-nums" dir="ltr">{formatMoney(item.amount, currency)}</td>
              <td className="py-1.5 text-end tabular-nums" dir="ltr">
                {item.is_optional ? '—' : formatMoney(Number(item.amount) / (plan.installments || 1), currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 border-t border-gray-100 pt-3">
        <div className="text-xs font-semibold text-gray-500">{t('programFees.openedFor')}</div>
        {openings.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">{t('programFees.notOpened')}</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {openings.map((o) => (
              <span key={o.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 py-1 pe-1.5 ps-3 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-100">
                {periodLabel(o)}
                <button type="button" onClick={() => onClose(o)} className="rounded-full p-0.5 hover:bg-emerald-100" title={t('programFees.closeOpening')}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

function PlanEditor({ plan, title, onCancel, onSaved }) {
  const { t } = useTranslation()
  const [installments, setInstallments] = useState(String(plan.installments || 1))
  const [isActive, setIsActive] = useState(Boolean(plan.is_active))
  const [studyMode, setStudyMode] = useState(plan.study_mode || '')
  const [items, setItems] = useState(() =>
    sortedItems(plan).map((i) => ({ id: i.id, name_ar: i.name_ar, name_en: i.name_en, amount: String(i.amount), is_optional: i.is_optional }))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const total = items.filter((i) => !i.is_optional).reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const n = Math.max(1, Number(installments) || 1)
  const update = (index, patch) => setItems((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const save = async () => {
    const count = Number(installments)
    if (!Number.isInteger(count) || count < 1 || count > 24) {
      setError(t('programFees.errors.installments'))
      return
    }
    if (items.some((i) => !i.name_ar.trim() || !i.name_en.trim() || !(Number(i.amount) >= 0) || i.amount === '')) {
      setError(t('programFees.errors.items'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const { error: planErr } = await supabase
        .from('program_fee_plans')
        .update({ installments: count, is_active: isActive, study_mode: studyMode || null, updated_at: new Date().toISOString() })
        .eq('id', plan.id)
      if (planErr) throw planErr

      const keptIds = new Set(items.filter((i) => i.id).map((i) => i.id))
      const removed = (plan.program_fee_items || []).filter((i) => !keptIds.has(i.id)).map((i) => i.id)
      if (removed.length) {
        const { error: delErr } = await supabase.from('program_fee_items').delete().in('id', removed)
        if (delErr) throw delErr
      }
      for (const [index, row] of items.entries()) {
        const values = {
          plan_id: plan.id,
          name_ar: row.name_ar.trim(),
          name_en: row.name_en.trim(),
          amount: Number(row.amount),
          is_optional: row.is_optional,
          sort_order: index + 1,
        }
        const { error: itemErr } = row.id
          ? await supabase.from('program_fee_items').update(values).eq('id', row.id)
          : await supabase.from('program_fee_items').insert(values)
        if (itemErr) throw itemErr
      }
      onSaved()
    } catch (err) {
      setError(err?.message || t('programFees.errors.save'))
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm'

  return (
    <article className="rounded-2xl border-2 border-primary-200 bg-white p-5 shadow-sm xl:col-span-2">
      <h3 className="text-base font-bold text-gray-900">{title}</h3>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-gray-600">
          {t('programFees.installmentsLabel')}
          <input type="number" min="1" max="24" value={installments} onChange={(e) => setInstallments(e.target.value)} className={`${input} mt-1`} dir="ltr" />
        </label>
        <label className="text-xs font-semibold text-gray-600">
          {t('applyForm.fields.workload')}
          <select value={studyMode} onChange={(e) => setStudyMode(e.target.value)} className={`${input} mt-1`}>
            <option value="">—</option>
            <option value="online">{t('applyForm.workload.online')}</option>
            <option value="on_campus">{t('applyForm.workload.on_campus')}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-gray-700">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
          {t('programFees.active')}
        </label>
      </div>

      <div className="mt-4 space-y-2">
        {items.map((row, index) => (
          <div key={row.id || `new-${index}`} className="grid grid-cols-1 items-center gap-2 rounded-xl bg-gray-50 p-2.5 md:grid-cols-[1fr_1fr_8rem_auto_auto]">
            <input value={row.name_ar} onChange={(e) => update(index, { name_ar: e.target.value })} placeholder={t('programFees.nameAr')} dir="rtl" className={input} />
            <input value={row.name_en} onChange={(e) => update(index, { name_en: e.target.value })} placeholder={t('programFees.nameEn')} dir="ltr" className={input} />
            <input type="number" min="0" step="0.01" value={row.amount} onChange={(e) => update(index, { amount: e.target.value })} placeholder="0" dir="ltr" className={input} />
            <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-gray-600">
              <input type="checkbox" checked={row.is_optional} onChange={(e) => update(index, { is_optional: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
              {t('programFees.notInTotal')}
            </label>
            <button type="button" onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))} className="justify-self-end rounded-lg p-1.5 text-red-600 hover:bg-red-50" title={t('programFees.removeItem')}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems((prev) => [...prev, { id: null, name_ar: '', name_en: '', amount: '', is_optional: false }])}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-primary-700 hover:bg-primary-50"
        >
          <Plus className="h-4 w-4" />
          {t('programFees.addItem')}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
        <div className="text-sm text-gray-700">
          {t('programFees.total')}: <strong dir="ltr">{formatMoney(total, plan.currency)}</strong>
          <span className="mx-2 text-gray-300">|</span>
          {t('programFees.installmentsOf', { count: n })}: <strong dir="ltr">{formatMoney(Math.round((total / n) * 100) / 100, plan.currency)}</strong>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
            {t('programFees.cancel')}
          </button>
          <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-primary-gradient px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('programFees.save')}
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </article>
  )
}
