import { Fragment, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowLeftRight,
  CalendarCheck,
  CheckCircle2,
  GraduationCap,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Unlock,
  Users,
  Wallet,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'
import { formatMoney, installmentAmount, isCreditHourPlan, loadPlans, planParts, planTotal, sortedItems } from '../../utils/programFees'
import { Badge, Button, ConfirmDialog, toast } from '../ui'
import FeeRoster from './FeeRoster'

const LEVEL_ORDER = ['bachelor', 'master', 'phd']
const HIDDEN = new Set(['archived', 'cancelled'])
const VIEWS = ['schedule', 'roster', 'programmes', 'payments']

/**
 * Programme fees, one screen: open or close a semester per programme, see who has paid and record cash or
 * bank payments, set each programme's prices and billing mode, and read every payment.
 */
export default function ProgramFeesPanel({ isArabic }) {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  const view = VIEWS.includes(params.get('view')) ? params.get('view') : 'schedule'
  const setView = (next) => {
    const p = new URLSearchParams(params)
    p.set('view', next)
    setParams(p, { replace: true })
  }

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [migrated, setMigrated] = useState(true)
  const [plans, setPlans] = useState([])
  const [openings, setOpenings] = useState([])
  const [semesters, setSemesters] = useState([])
  const [years, setYears] = useState([])
  const [payments, setPayments] = useState([])
  const [busyKey, setBusyKey] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [confirmState, setConfirmState] = useState(null)

  const nameOf = (row) => (row ? getLocalizedName(row, isArabic) || row.name_en || row.name_ar : '') || '—'

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [planResult, openRes, semRes, yearRes] = await Promise.all([
        loadPlans(supabase),
        supabase.from('program_fee_openings').select('id, plan_id, semester_id, academic_year_id').order('created_at'),
        supabase.from('semesters').select('id, name_en, name_ar, academic_year_id, start_date, end_date, status').order('start_date', { ascending: false }),
        supabase.from('academic_years').select('id, name_en, name_ar, start_date, status').order('start_date', { ascending: false }),
      ])
      for (const res of [openRes, semRes, yearRes]) if (res.error) throw res.error
      const paySelect = (extra) =>
        supabase
          .from('program_fee_payments')
          .select(`id, plan_id, semester_id, amount, currency, status, paid_at, myfatoorah_payment_id${extra}, students (student_id, name_en, name_ar), semesters (name_en, name_ar), program_fee_plans (majors (name_en, name_ar))`)
          .in('status', ['paid', 'cancelled'])
          .order('paid_at', { ascending: false })
          .limit(1000)
      let payRes = await paySelect(', method, reference, note')
      if (payRes.error) payRes = await paySelect('')
      if (payRes.error) throw payRes.error
      setPlans(planResult.plans)
      setMigrated(planResult.migrated)
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
  const paidPayments = payments.filter((p) => p.status === 'paid')
  const foreignPlans = plans.filter((p) => (p.currency || 'USD') !== 'GMD')

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

  const paidInCell = (planId, semId) => paidPayments.filter((p) => p.plan_id === planId && p.semester_id === semId).length

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
    toast(t('fees.openedToast', { count: rows.length }))
  }

  const closeCells = (key, pairs, message) => {
    const ids = [...new Set(pairs.map(({ plan, sem }) => cellOpening(plan.id, sem)?.id).filter(Boolean))]
    if (ids.length === 0) return
    setConfirmState({
      title: t('fees.closeTitle'),
      body: message,
      confirmLabel: t('programFees.actionClose'),
      run: async () => {
        setBusyKey(key)
        const { error: delErr } = await supabase.from('program_fee_openings').delete().in('id', ids)
        setBusyKey('')
        if (delErr) throw delErr
        setOpenings((prev) => prev.filter((o) => !ids.includes(o.id)))
        toast(t('fees.closedToast'))
      },
    })
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

  const groupIsOpen = (sems) => activePlanRows.length > 0 && activePlanRows.every((plan) => sems.every((sem) => cellOpening(plan.id, sem)))

  const monthFmt = new Intl.DateTimeFormat(isArabic ? 'ar-u-nu-latn' : 'en-GB', { month: 'short', year: 'numeric' })
  const semRange = (s) =>
    [s.start_date, s.end_date]
      .filter(Boolean)
      .map((d) => monthFmt.format(new Date(`${d}T00:00:00`)))
      .join(' – ')

  const runConfirm = async () => {
    if (!confirmState) return
    setConfirmState((prev) => ({ ...prev, busy: true }))
    try {
      await confirmState.run()
      setConfirmState(null)
    } catch (err) {
      setConfirmState(null)
      setError(err?.message || String(err))
    }
  }

  const openPeriodCount = new Set(openings.map((o) => (o.semester_id ? `sem:${o.semester_id}` : `year:${o.academic_year_id}`))).size
  const collectedByCurrency = paidPayments.reduce((acc, p) => {
    const c = p.currency || 'GMD'
    acc[c] = (acc[c] || 0) + Number(p.amount || 0)
    return acc
  }, {})
  const collectedText = Object.keys(collectedByCurrency).length
    ? Object.entries(collectedByCurrency)
        .map(([c, v]) => formatMoney(v, c))
        .join(' + ')
    : formatMoney(0, 'GMD')
  const boardColumns = boardYears.reduce((n, y) => n + y.sems.length, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#1a3a6b]" />
      </div>
    )
  }

  const tabs = [
    { id: 'schedule', label: t('fees.views.schedule'), icon: CalendarCheck },
    { id: 'roster', label: t('fees.views.roster'), icon: Users },
    { id: 'programmes', label: t('fees.views.programmes'), icon: GraduationCap },
    { id: 'payments', label: t('fees.views.payments'), icon: Receipt },
  ]

  return (
    <div className="space-y-5">
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      {!migrated && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{t('fees.migrationNeeded')}</p>
        </div>
      )}

      {migrated && foreignPlans.length > 0 && <CurrencyConvert plans={foreignPlans} onDone={load} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: GraduationCap, label: t('programFees.kpiPrograms'), value: activePlanRows.length },
          { icon: Unlock, label: t('programFees.kpiOpen'), value: openPeriodCount },
          { icon: CheckCircle2, label: t('programFees.kpiPaid'), value: paidPayments.length },
          { icon: Wallet, label: t('programFees.kpiCollected'), value: collectedText, ltr: true },
        ].map(({ icon: Icon, label, value, ltr }) => (
          <div key={label} className="rounded-2xl border border-[#dde3ef] bg-white p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Icon className="h-4 w-4 text-[#1a3a6b]" aria-hidden="true" />
              {label}
            </div>
            <div className="mt-1 truncate text-xl font-extrabold tabular-nums text-[#1a3a6b]" dir={ltr ? 'ltr' : undefined} style={{ textAlign: 'start' }}>
              {value}
            </div>
          </div>
        ))}
      </div>

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-[#dde3ef] bg-white p-1" aria-label={t('fees.viewsLabel')}>
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            aria-current={view === id ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${
              view === id ? 'bg-[#1a3a6b] text-white' : 'text-slate-600 hover:bg-[#eef2f9] hover:text-[#1a3a6b]'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {view === 'schedule' && (
        <section className="rounded-2xl border border-[#dde3ef] bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-[#1a3a6b]">{t('programFees.boardTitle')}</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">{t('programFees.boardHint')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded bg-emerald-500" />
                {t('programFees.legendOpen')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 w-3 rounded border border-dashed border-slate-400" />
                {t('programFees.legendClosed')}
              </span>
            </div>
          </div>

          {activePlanRows.length === 0 || boardColumns === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-[#dde3ef] px-4 py-6 text-center text-sm text-slate-500">
              {activePlanRows.length === 0 ? t('programFees.noPlans') : t('programFees.noSemesters')}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-[#dde3ef]">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th rowSpan={2} className="sticky start-0 z-10 min-w-[15rem] border-b border-e border-[#dde3ef] bg-[#f4f6fb] px-4 py-3 text-start align-bottom text-xs font-semibold text-slate-500">
                      {t('programFees.program')}
                    </th>
                    {boardYears.map(({ year, sems }) => {
                      const key = `year:${sems[0].academic_year_id}`
                      const yearName = nameOf(year).trim()
                      return (
                        <th key={key} colSpan={sems.length} className="border-b border-e border-[#dde3ef] bg-[#f4f6fb] px-3 py-2 last:border-e-0">
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            <span className="text-xs font-bold text-slate-700">{yearName}</span>
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
                          <th key={key} className="min-w-[9.5rem] border-b border-[#dde3ef] bg-white px-3 py-2.5 align-top font-normal">
                            <div className="text-sm font-bold text-slate-900">{nameOf(sem).trim()}</div>
                            <div className="mt-0.5 text-[11px] text-slate-500">{semRange(sem)}</div>
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
                          <td colSpan={boardColumns + 1} className="border-b border-slate-100 bg-[#f4f6fb]/70 px-4 py-1.5 text-[11px] font-bold text-slate-500">
                            {t(`applyForm.degreeLevels.${level}`, level)}
                          </td>
                        </tr>
                        {rows.map((plan) => (
                          <tr key={plan.id}>
                            <td className="sticky start-0 z-10 border-b border-e border-slate-100 bg-white px-4 py-2.5">
                              <div className="font-semibold leading-snug text-slate-900">{nameOf(plan.majors)}</div>
                              <div className="mt-0.5 text-xs text-slate-500">
                                <PlanPriceLine plan={plan} />
                              </div>
                            </td>
                            {boardYears
                              .flatMap(({ sems }) => sems)
                              .map((sem) => {
                                const row = cellOpening(plan.id, sem)
                                const key = `cell:${plan.id}:${sem.id}`
                                return (
                                  <td key={sem.id} className="border-b border-slate-100 px-2 py-2">
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
      )}

      {view === 'roster' && (
        <FeeRoster
          plans={activePlanRows}
          semesters={semesters}
          openings={openings}
          isArabic={isArabic}
          migrated={migrated}
          onPaymentsChanged={load}
        />
      )}

      {view === 'programmes' && (
        <>
          {plans.length === 0 && <div className="rounded-2xl border border-[#dde3ef] bg-white p-10 text-center text-slate-600">{t('programFees.noPlans')}</div>}
          {groups.map(([level, levelPlans]) => (
            <section key={level} className="space-y-3">
              <h2 className="text-sm font-extrabold text-slate-500">{t(`applyForm.degreeLevels.${level}`, level)}</h2>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                {levelPlans.map((plan) =>
                  editingId === plan.id ? (
                    <PlanEditor
                      key={plan.id}
                      plan={plan}
                      migrated={migrated}
                      title={nameOf(plan.majors)}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => {
                        setEditingId(null)
                        toast(t('fees.savedToast'))
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
                      onClose={(o) =>
                        setConfirmState({
                          title: t('fees.closeTitle'),
                          body: t('programFees.confirmClose', { period: periodLabel(o) }),
                          confirmLabel: t('programFees.actionClose'),
                          run: async () => {
                            const { error: delErr } = await supabase.from('program_fee_openings').delete().eq('id', o.id)
                            if (delErr) throw delErr
                            setOpenings((prev) => prev.filter((x) => x.id !== o.id))
                          },
                        })
                      }
                      onEdit={() => setEditingId(plan.id)}
                    />
                  )
                )}
              </div>
            </section>
          ))}
        </>
      )}

      {view === 'payments' && <PaymentsTable payments={payments} isArabic={isArabic} nameOf={nameOf} />}

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title || ''}
        body={confirmState?.body || ''}
        confirmLabel={confirmState?.confirmLabel || t('programFees.actionClose')}
        cancelLabel={t('programFees.cancel')}
        busy={Boolean(confirmState?.busy)}
        onConfirm={runConfirm}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  )
}

/** "8 installments of D 39,637" or "D 2,100 per credit hour + D 5,250 fixed per semester". */
function PlanPriceLine({ plan }) {
  const { t } = useTranslation()
  const currency = plan.currency || 'USD'
  if (isCreditHourPlan(plan)) {
    const { feesPerSemester } = planParts(plan)
    return (
      <span>
        {t('fees.perHourLine', { rate: formatMoney(plan.credit_hour_rate, currency), fees: formatMoney(feesPerSemester, currency) })}
      </span>
    )
  }
  return (
    <span>
      {t('programFees.installmentsOf', { count: plan.installments })} <span dir="ltr">{formatMoney(installmentAmount(plan), currency)}</span>
    </span>
  )
}

/** Converts every plan still priced in another currency to dalasi at one rate the user enters. */
function CurrencyConvert({ plans, onDone }) {
  const { t } = useTranslation()
  const [rate, setRate] = useState('')
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const currencies = [...new Set(plans.map((p) => p.currency || 'USD'))]
  const value = Number(rate)
  const valid = Number.isFinite(value) && value > 0

  const convert = async () => {
    setBusy(true)
    try {
      for (const plan of plans) {
        for (const item of plan.program_fee_items || []) {
          const { error } = await supabase
            .from('program_fee_items')
            .update({ amount: Math.round(Number(item.amount || 0) * value * 100) / 100 })
            .eq('id', item.id)
          if (error) throw error
        }
        const { error: planErr } = await supabase
          .from('program_fee_plans')
          .update({
            currency: 'GMD',
            credit_hour_rate: plan.credit_hour_rate != null ? Math.round(Number(plan.credit_hour_rate) * value * 100) / 100 : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', plan.id)
        if (planErr) throw planErr
      }
      toast(t('fees.convert.done', { count: plans.length }))
      setAsking(false)
      onDone()
    } catch (err) {
      toast(err?.message || t('programFees.errors.save'), 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#c8a84b]/50 bg-[#fbf7ea] px-4 py-3">
      <ArrowLeftRight className="h-5 w-5 shrink-0 text-[#a88a35]" aria-hidden="true" />
      <p className="min-w-[14rem] flex-1 text-sm text-[#5c4a14]">{t('fees.convert.hint', { count: plans.length, currency: currencies.join(', ') })}</p>
      <label className="flex items-center gap-2 text-sm font-semibold text-[#5c4a14]">
        <span dir="ltr">1 {currencies[0]} =</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="70"
          dir="ltr"
          className="h-10 w-24 rounded-xl border border-[#dde3ef] bg-white px-3 text-sm"
        />
        <span>GMD</span>
      </label>
      <Button variant="gold" disabled={!valid} onClick={() => setAsking(true)}>
        {t('fees.convert.button')}
      </Button>
      <ConfirmDialog
        open={asking}
        tone="primary"
        title={t('fees.convert.confirmTitle')}
        body={t('fees.convert.confirmBody', { rate: value || 0, currency: currencies[0], count: plans.length })}
        confirmLabel={t('fees.convert.button')}
        cancelLabel={t('programFees.cancel')}
        busy={busy}
        onConfirm={convert}
        onCancel={() => setAsking(false)}
      />
    </div>
  )
}

function PaymentsTable({ payments, isArabic, nameOf }) {
  const { t } = useTranslation()
  const methodLabel = (m) => t(`fees.method.${m || 'card'}`)
  return (
    <section className="rounded-2xl border border-[#dde3ef] bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <Receipt className="h-5 w-5 text-[#1a3a6b]" />
        <h2 className="text-base font-extrabold text-[#1a3a6b]">{t('programFees.paymentsTitle')}</h2>
      </div>
      {payments.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500">{t('programFees.noPayments')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[#f4f6fb] text-xs text-slate-500">
              <tr>
                <th className="px-5 py-3 text-start font-semibold">{t('programFees.student')}</th>
                <th className="px-5 py-3 text-start font-semibold">{t('programFees.program')}</th>
                <th className="px-5 py-3 text-start font-semibold">{t('programFees.semester')}</th>
                <th className="px-5 py-3 text-start font-semibold">{t('programFees.amount')}</th>
                <th className="px-5 py-3 text-start font-semibold">{t('fees.methodLabel')}</th>
                <th className="px-5 py-3 text-start font-semibold">{t('programFees.date')}</th>
                <th className="px-5 py-3 text-start font-semibold">{t('programFees.reference')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((p) => (
                <tr key={p.id} className={p.status === 'cancelled' ? 'text-slate-400' : ''}>
                  <td className="px-5 py-3">
                    <div className="font-medium text-slate-900">{nameOf(p.students)}</div>
                    <div className="text-xs text-slate-500" dir="ltr">
                      {p.students?.student_id}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-700">{nameOf(p.program_fee_plans?.majors)}</td>
                  <td className="px-5 py-3 text-slate-700">{nameOf(p.semesters)}</td>
                  <td className={`px-5 py-3 font-semibold ${p.status === 'cancelled' ? 'line-through' : 'text-slate-900'}`} dir="ltr">
                    {formatMoney(p.amount, p.currency)}
                  </td>
                  <td className="px-5 py-3">
                    {p.status === 'cancelled' ? <Badge tone="err">{t('fees.cancelled')}</Badge> : <Badge tone={p.method === 'card' || !p.method ? 'info' : 'gold'}>{methodLabel(p.method)}</Badge>}
                  </td>
                  <td className="px-5 py-3 text-slate-700" dir="ltr">
                    {p.paid_at ? new Date(p.paid_at).toLocaleDateString(isArabic ? 'ar-u-nu-latn' : 'en-GB') : '—'}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs text-slate-500" dir="ltr">
                    {p.reference || p.myfatoorah_payment_id || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function GroupButton({ open, busy, disabled, onClick, openLabel, closeLabel }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 transition disabled:opacity-50 ${
        open ? 'bg-white text-slate-600 ring-slate-200 hover:bg-red-50 hover:text-red-700 hover:ring-red-200' : 'bg-[#eef2f9] text-[#1a3a6b] ring-[#dde3ef] hover:bg-[#dde3ef]'
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
          : 'border-dashed border-slate-300 bg-white text-slate-400 hover:border-[#9fb0d1] hover:bg-[#eef2f9] hover:text-[#1a3a6b]'
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
  const currency = plan.currency || 'USD'
  const creditHours = isCreditHourPlan(plan)
  const n = plan.installments || 1

  return (
    <article className={`rounded-2xl border bg-white p-5 ${plan.is_active ? 'border-[#dde3ef]' : 'border-dashed border-slate-300 opacity-70'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-extrabold leading-snug text-slate-900">{title}</h3>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone={creditHours ? 'gold' : 'info'}>{creditHours ? t('fees.mode.credit_hours') : t('fees.mode.installment')}</Badge>
            {plan.study_mode && <Badge>{t(`applyForm.workload.${plan.study_mode}`)}</Badge>}
            {!plan.is_active && <Badge>{t('programFees.inactive')}</Badge>}
          </div>
        </div>
        <Button size="sm" variant="quiet" icon={Pencil} onClick={onEdit}>
          {t('programFees.edit')}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-[#eef2f9] px-3 py-2.5">
          <div className="text-xs text-slate-600">{t('programFees.total')}</div>
          <div className="text-lg font-extrabold text-[#1a3a6b]" dir="ltr" style={{ textAlign: 'start' }}>
            {formatMoney(total, currency)}
          </div>
        </div>
        <div className="rounded-xl bg-[#f4f6fb] px-3 py-2.5">
          {creditHours ? (
            <>
              <div className="text-xs text-slate-600">{t('fees.perCreditHour')}</div>
              <div className="text-lg font-extrabold text-slate-900" dir="ltr" style={{ textAlign: 'start' }}>
                {formatMoney(plan.credit_hour_rate, currency)}
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-slate-600">{t('programFees.installmentsOf', { count: n })}</div>
              <div className="text-lg font-extrabold text-slate-900" dir="ltr" style={{ textAlign: 'start' }}>
                {formatMoney(installmentAmount(plan), currency)}
              </div>
            </>
          )}
        </div>
      </div>

      {creditHours && <p className="mt-3 text-xs leading-relaxed text-slate-600">{t('fees.creditHoursExplain', { count: n, fees: formatMoney(planParts(plan).feesPerSemester, currency) })}</p>}

      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500">
            <th className="pb-1.5 text-start font-semibold">{t('programFees.item')}</th>
            <th className="pb-1.5 text-end font-semibold">{t('programFees.amount')}</th>
            <th className="pb-1.5 text-end font-semibold">{t('fees.perSemester')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => (
            <tr key={item.id} className={item.is_optional ? 'text-slate-400' : 'text-slate-800'}>
              <td className="py-1.5">
                {isArabic ? item.name_ar || item.name_en : item.name_en || item.name_ar}
                {item.is_tuition && <span className="ms-1.5 rounded bg-[#fbf7ea] px-1.5 py-0.5 text-[10px] font-bold text-[#8a6d1f]">{t('fees.tuitionTag')}</span>}
                {item.is_optional && <span className="ms-1.5 text-xs">({t('programFees.notInTotal')})</span>}
              </td>
              <td className="py-1.5 text-end tabular-nums" dir="ltr">
                {formatMoney(item.amount, currency)}
              </td>
              <td className="py-1.5 text-end tabular-nums text-slate-500" dir="ltr">
                {item.is_optional ? '—' : creditHours && item.is_tuition ? t('fees.byHours') : formatMoney(Number(item.amount) / n, currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <div className="text-xs font-semibold text-slate-500">{t('programFees.openedFor')}</div>
        {openings.length === 0 ? (
          <p className="mt-1 text-sm text-slate-500">{t('programFees.notOpened')}</p>
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

function PlanEditor({ plan, title, migrated, onCancel, onSaved }) {
  const { t } = useTranslation()
  const [installments, setInstallments] = useState(String(plan.installments || 1))
  const [isActive, setIsActive] = useState(Boolean(plan.is_active))
  const [studyMode, setStudyMode] = useState(plan.study_mode || '')
  const [billingMode, setBillingMode] = useState(plan.billing_mode || 'installment')
  const [rate, setRate] = useState(plan.credit_hour_rate != null ? String(plan.credit_hour_rate) : '')
  const [items, setItems] = useState(() =>
    sortedItems(plan).map((i) => ({ id: i.id, name_ar: i.name_ar, name_en: i.name_en, amount: String(i.amount), is_optional: i.is_optional, is_tuition: Boolean(i.is_tuition) }))
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const currency = plan.currency || 'USD'

  const total = items.filter((i) => !i.is_optional).reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const fixed = items.filter((i) => !i.is_optional && !i.is_tuition).reduce((s, i) => s + (Number(i.amount) || 0), 0)
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
    if (billingMode === 'credit_hours' && !(Number(rate) > 0)) {
      setError(t('fees.errors.rate'))
      return
    }
    setSaving(true)
    setError('')
    try {
      const planValues = { installments: count, is_active: isActive, study_mode: studyMode || null, updated_at: new Date().toISOString() }
      if (migrated) {
        planValues.billing_mode = billingMode
        planValues.credit_hour_rate = billingMode === 'credit_hours' ? Number(rate) : null
      }
      const { error: planErr } = await supabase.from('program_fee_plans').update(planValues).eq('id', plan.id)
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
        if (migrated) values.is_tuition = row.is_tuition
        const { error: itemErr } = row.id ? await supabase.from('program_fee_items').update(values).eq('id', row.id) : await supabase.from('program_fee_items').insert(values)
        if (itemErr) throw itemErr
      }
      onSaved()
    } catch (err) {
      setError(err?.message || t('programFees.errors.save'))
    } finally {
      setSaving(false)
    }
  }

  const input = 'w-full rounded-lg border border-[#dde3ef] bg-white px-2.5 py-1.5 text-sm'

  return (
    <article className="rounded-2xl border-2 border-[#9fb0d1] bg-white p-5 xl:col-span-2">
      <h3 className="text-base font-extrabold text-slate-900">{title}</h3>

      {migrated && (
        <fieldset className="mt-4">
          <legend className="text-xs font-semibold text-slate-600">{t('fees.modeLabel')}</legend>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            {['installment', 'credit_hours'].map((mode) => (
              <label
                key={mode}
                className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm ${billingMode === mode ? 'border-[#1a3a6b] bg-[#eef2f9]' : 'border-[#dde3ef]'}`}
              >
                <input type="radio" name={`mode-${plan.id}`} checked={billingMode === mode} onChange={() => setBillingMode(mode)} className="mt-0.5" />
                <span>
                  <span className="block font-bold text-slate-900">{t(`fees.mode.${mode}`)}</span>
                  <span className="block text-xs text-slate-600">{t(`fees.modeHint.${mode}`)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="text-xs font-semibold text-slate-600">
          {billingMode === 'credit_hours' ? t('fees.semestersForFixed') : t('programFees.installmentsLabel')}
          <input type="number" min="1" max="24" value={installments} onChange={(e) => setInstallments(e.target.value)} className={`${input} mt-1`} dir="ltr" />
        </label>
        {billingMode === 'credit_hours' && (
          <label className="text-xs font-semibold text-slate-600">
            {t('fees.perCreditHour')} ({currency})
            <input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className={`${input} mt-1`} dir="ltr" />
          </label>
        )}
        <label className="text-xs font-semibold text-slate-600">
          {t('applyForm.fields.workload')}
          <select value={studyMode} onChange={(e) => setStudyMode(e.target.value)} className={`${input} mt-1`}>
            <option value="">—</option>
            <option value="online">{t('applyForm.workload.online')}</option>
            <option value="on_campus">{t('applyForm.workload.on_campus')}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-slate-700">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          {t('programFees.active')}
        </label>
      </div>

      <div className="mt-4 space-y-2">
        {items.map((row, index) => (
          <div key={row.id || `new-${index}`} className="grid grid-cols-1 items-center gap-2 rounded-xl bg-[#f4f6fb] p-2.5 md:grid-cols-[1fr_1fr_8rem_auto_auto_auto]">
            <input value={row.name_ar} onChange={(e) => update(index, { name_ar: e.target.value })} placeholder={t('programFees.nameAr')} dir="rtl" className={input} />
            <input value={row.name_en} onChange={(e) => update(index, { name_en: e.target.value })} placeholder={t('programFees.nameEn')} dir="ltr" className={input} />
            <input type="number" min="0" step="0.01" value={row.amount} onChange={(e) => update(index, { amount: e.target.value })} placeholder="0" dir="ltr" className={input} />
            {migrated ? (
              <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-600" title={t('fees.tuitionHint')}>
                <input type="checkbox" checked={row.is_tuition} onChange={(e) => update(index, { is_tuition: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                {t('fees.tuitionTag')}
              </label>
            ) : (
              <span />
            )}
            <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-600">
              <input type="checkbox" checked={row.is_optional} onChange={(e) => update(index, { is_optional: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
              {t('programFees.notInTotal')}
            </label>
            <button type="button" onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))} className="justify-self-end rounded-lg p-1.5 text-red-600 hover:bg-red-50" title={t('programFees.removeItem')}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <Button
          size="sm"
          variant="ghost"
          icon={Plus}
          onClick={() => setItems((prev) => [...prev, { id: null, name_ar: '', name_en: '', amount: '', is_optional: false, is_tuition: false }])}
        >
          {t('programFees.addItem')}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <div className="text-sm text-slate-700">
          {t('programFees.total')}: <strong dir="ltr">{formatMoney(total, currency)}</strong>
          <span className="mx-2 text-slate-300">|</span>
          {billingMode === 'credit_hours' ? (
            <>
              {t('fees.fixedPerSemester')}: <strong dir="ltr">{formatMoney(Math.round((fixed / n) * 100) / 100, currency)}</strong>
            </>
          ) : (
            <>
              {t('programFees.installmentsOf', { count: n })}: <strong dir="ltr">{formatMoney(Math.round((total / n) * 100) / 100, currency)}</strong>
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="quiet" onClick={onCancel} disabled={saving}>
            {t('programFees.cancel')}
          </Button>
          <Button onClick={save} loading={saving}>
            {t('programFees.save')}
          </Button>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </article>
  )
}
