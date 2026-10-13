import { useState } from 'react'

/**
 * Small, dependency-free charts for the dashboard.
 * One hue per chart, values written as text next to every mark, hover shows the exact figure.
 */

const NAVY = '#1a3a6b'
const NAVY_HOVER = '#2a5298'
const GOLD = '#c8a84b'
const TRACK = '#eef2f9'

/** Horizontal bars: a ranked list of labels with counts. */
export function BarList({ items, format, color = NAVY, empty, share, max: fixedMax }) {
  if (!items.length) return <p className="text-sm text-slate-500">{empty}</p>
  const max = fixedMax || Math.max(1, ...items.map((i) => i.count))
  const total = items.reduce((s, i) => s + i.count, 0)
  return (
    <ul className="space-y-2.5">
      {items.map((item) => {
        const pct = total ? Math.round((item.count / total) * 100) : 0
        return (
          <li key={item.key} title={`${item.label}: ${format(item.count)}${share ? ` (${pct}%)` : ''}`}>
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className={`truncate font-semibold ${item.muted ? 'text-slate-400' : 'text-slate-700'}`}>{item.label}</span>
              <span className="shrink-0 font-bold tabular-nums text-slate-800" dir="ltr">
                {format(item.count)}
                {share ? <span className="ms-1 font-semibold text-slate-400">{pct}%</span> : null}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full" style={{ background: TRACK }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${item.count ? Math.max(2, Math.round((item.count / max) * 100)) : 0}%`, background: item.muted ? '#cbd5e1' : color }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Vertical columns, one per period (months). */
export function ColumnChart({ items, format, label }) {
  const max = Math.max(1, ...items.map((i) => i.count))
  return (
    <div className="flex items-end gap-2" role="img" aria-label={label}>
      {items.map((m) => (
        <div key={m.key} className="group flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`${m.title}: ${format(m.count)}`}>
          <span className="text-xs font-bold tabular-nums text-slate-700">{m.count ? format(m.count) : ''}</span>
          <div className="flex h-32 w-full items-end border-b border-[#dde3ef]">
            <div
              className="mx-auto w-full max-w-[44px] rounded-t-[4px] transition-colors"
              style={{ height: `${m.count ? Math.max(4, Math.round((m.count / max) * 128)) : 0}px`, background: NAVY }}
              onMouseEnter={(e) => (e.currentTarget.style.background = NAVY_HOVER)}
              onMouseLeave={(e) => (e.currentTarget.style.background = NAVY)}
            />
          </div>
          <span className="text-[11px] text-slate-500">{m.short}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * Daily line with a soft area, a hover crosshair and a tooltip.
 * items: [{ key, title, count }] in time order. ticks: indexes to label under the axis.
 */
export function TrendLine({ items, format, label, isRTL }) {
  const [hover, setHover] = useState(null)
  const W = 600
  const H = 160
  const PAD_T = 12
  const PAD_B = 4
  const max = Math.max(1, ...items.map((i) => i.count))
  const step = items.length > 1 ? W / (items.length - 1) : W
  // Time runs right-to-left in Arabic.
  const xAt = (i) => (isRTL ? W - i * step : i * step)
  const yAt = (v) => PAD_T + (H - PAD_T - PAD_B) * (1 - v / max)
  const points = items.map((d, i) => `${xAt(i).toFixed(1)},${yAt(d.count).toFixed(1)}`)
  const line = `M${points.join(' L')}`
  const area = `${line} L${xAt(items.length - 1).toFixed(1)},${H} L${xAt(0).toFixed(1)},${H} Z`
  const gridValues = [max, Math.round(max / 2)]
  const tickIdx = [0, Math.floor((items.length - 1) / 2), items.length - 1]
  const active = hover == null ? null : items[hover]

  return (
    <div>
      <div className="relative" role="img" aria-label={label}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-40 w-full overflow-visible">
          {gridValues.map((v) => (
            <line key={v} x1="0" x2={W} y1={yAt(v)} y2={yAt(v)} stroke="#e7ebf3" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <line x1="0" x2={W} y1={H} y2={H} stroke="#dde3ef" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <path d={area} fill={NAVY} opacity="0.08" />
          <path d={line} fill="none" stroke={NAVY} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {active ? (
            <line x1={xAt(hover)} x2={xAt(hover)} y1={PAD_T - 6} y2={H} stroke={NAVY} strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          ) : null}
        </svg>
        {/* Grid labels */}
        {gridValues.map((v) => (
          <span key={v} className="pointer-events-none absolute start-0 -translate-y-full text-[10px] tabular-nums text-slate-400" style={{ top: `${(yAt(v) / H) * 100}%` }}>
            {format(v)}
          </span>
        ))}
        {/* Hover dot (HTML so it stays round when the SVG stretches) */}
        {active ? (
          <span
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{ left: `${(xAt(hover) / W) * 100}%`, top: `${(yAt(active.count) / H) * 100}%`, background: NAVY }}
          />
        ) : null}
        {active ? (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#12284c] px-2.5 py-1.5 text-xs text-white shadow"
            style={{ left: `${Math.min(88, Math.max(12, (xAt(hover) / W) * 100))}%`, top: 0 }}
          >
            <div className="font-bold tabular-nums">{format(active.count)}</div>
            <div className="text-[11px] text-white/70">{active.title}</div>
          </div>
        ) : null}
        {/* Hit areas: one column per day, wider than the line */}
        <div className="absolute inset-0 flex" dir={isRTL ? 'rtl' : 'ltr'} onMouseLeave={() => setHover(null)}>
          {items.map((d, i) => (
            <div key={d.key} className="h-full flex-1" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />
          ))}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
        {tickIdx.map((i) => (
          <span key={i}>{items[i]?.short}</span>
        ))}
      </div>
    </div>
  )
}

/** Stages that each keep a share of the first one. */
export function Funnel({ stages, format }) {
  const first = Math.max(1, stages[0]?.count || 0)
  return (
    <ol className="space-y-2">
      {stages.map((s, i) => {
        const pct = Math.round((s.count / first) * 100)
        return (
          <li key={s.key} title={`${s.label}: ${format(s.count)} (${pct}%)`}>
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="font-semibold text-slate-700">{s.label}</span>
              <span className="font-bold tabular-nums text-slate-800" dir="ltr">
                {format(s.count)}
                {i > 0 ? <span className="ms-1 font-semibold text-slate-400">{pct}%</span> : null}
              </span>
            </div>
            <div className="mt-1 h-6 overflow-hidden rounded-md" style={{ background: TRACK }}>
              <div
                className="h-full rounded-md"
                style={{ width: `${s.count ? Math.max(1.5, pct) : 0}%`, background: i === stages.length - 1 ? GOLD : NAVY, opacity: 1 - i * 0.12 }}
              />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** One bar split into parts (e.g. male / female / not stated), with a labelled key under it. */
export function SplitBar({ parts, format }) {
  const total = parts.reduce((s, p) => s + p.count, 0)
  if (!total) return null
  return (
    <div>
      <div className="flex h-4 gap-[2px] overflow-hidden rounded-full">
        {parts
          .filter((p) => p.count > 0)
          .map((p) => (
            <div key={p.key} className="h-full first:rounded-s-full last:rounded-e-full" style={{ width: `${(p.count / total) * 100}%`, background: p.color }} title={`${p.label}: ${format(p.count)}`} />
          ))}
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2">
        {parts.map((p) => (
          <li key={p.key} className="rounded-xl bg-[#f4f6fb] px-2 py-2.5 text-center">
            <div className="text-lg font-extrabold tabular-nums text-[#1a3a6b]" dir="ltr">
              {total ? Math.round((p.count / total) * 100) : 0}%
            </div>
            <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color }} aria-hidden="true" />
              {p.label}
            </div>
            <div className="text-[11px] tabular-nums text-slate-400">{format(p.count)}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const chartColors = { NAVY, GOLD, MUTED: '#cbd5e1' }
