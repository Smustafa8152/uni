export const fieldClass =
  'h-10 w-full rounded-xl border border-[#dde3ef] bg-white px-3 text-sm text-slate-800 outline-none transition-colors focus:border-[#1a3a6b]'

/** One figure on a catalog page. The number is the point; the label sits above it. */
export function Stat({ label, value, hint, tone = 'navy' }) {
  const valueClass =
    tone === 'warn' ? 'text-amber-700' : tone === 'ok' ? 'text-emerald-800' : tone === 'gold' ? 'text-[#7d6524]' : 'text-[#1a3a6b]'
  return (
    <div className="rounded-2xl border border-[#dde3ef] bg-white px-4 py-3.5">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold tracking-tight ${valueClass}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  )
}
