export const fieldClass =
  'h-10 w-full rounded-xl border border-[#dde3ef] bg-white px-3 text-sm text-slate-800 outline-none transition-colors focus:border-[#1a3a6b]'

/** The numbers for a catalog page, as one strip. On a phone they wrap two across. */
export function Facts({ items }) {
  const shown = (items || []).filter((item) => item && item.label)
  if (!shown.length) return null
  return (
    <div className="flex flex-wrap overflow-hidden rounded-2xl border border-[#dde3ef] bg-white">
      {shown.map((item) => (
        <div key={item.label} className="w-1/2 border-b border-e border-[#dde3ef] px-3.5 py-3 sm:w-1/3 lg:w-1/5">
          <div className="text-[11px] font-semibold leading-snug text-slate-500">{item.label}</div>
          <div className="mt-0.5 break-words text-sm font-extrabold leading-snug text-[#1a3a6b]">{item.value}</div>
        </div>
      ))}
    </div>
  )
}

/** Search above a grid of cards. A lone child (loading or empty) spans the row. */
export function Register({ toolbar, children }) {
  return (
    <div className="space-y-3">
      {toolbar ? <section className="rounded-2xl border border-[#dde3ef] bg-white p-3 sm:p-4">{toolbar}</section> : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 [&>:only-child:not(article)]:md:col-span-2 [&>:only-child:not(article)]:xl:col-span-3 [&>:only-child:not(article)]:rounded-2xl [&>:only-child:not(article)]:border [&>:only-child:not(article)]:border-[#dde3ef] [&>:only-child:not(article)]:bg-white">
        {children}
      </div>
    </div>
  )
}

/** The small mark at the start of a row. */
export function Mark({ icon: Icon }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eef2f9] text-[#1a3a6b]">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  )
}

/**
 * One catalog card. The name leads, so in Arabic the icon and title sit on the right.
 * The code stays left to right. Actions sit along the bottom of the card.
 */
export function RegisterRow({ mark, title, code, detail, tags, note, actions, accent = false }) {
  return (
    <article className={`flex h-full flex-col rounded-2xl border bg-white ${accent ? 'border-[#1a3a6b]' : 'border-[#dde3ef]'}`}>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          {mark}
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-extrabold leading-snug text-[#1a3a6b]">{title}</h3>
            {code ? (
              <div className="mt-0.5 text-start text-sm text-slate-500">
                <span dir="ltr" className="inline-block">{code}</span>
              </div>
            ) : null}
          </div>
        </div>
        {tags ? <div className="flex flex-wrap gap-1.5">{tags}</div> : null}
        {detail ? <div className="text-sm leading-relaxed text-slate-600">{detail}</div> : null}
        {note}
      </div>
      {actions ? <div className="mt-auto flex flex-wrap gap-2 border-t border-[#eef2f9] p-3">{actions}</div> : null}
    </article>
  )
}

/** One figure on a catalog page. The number is the point; the label sits above it. */
export function Stat({ label, value, hint, tone = 'navy' }) {
  const valueClass =
    tone === 'warn' ? 'text-amber-700' : tone === 'ok' ? 'text-emerald-800' : tone === 'gold' ? 'text-[#7d6524]' : 'text-[#1a3a6b]'
  return (
    <div className="rounded-2xl border border-[#dde3ef] bg-white px-4 py-3.5">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className={`mt-1 break-words text-xl font-extrabold leading-snug tracking-tight ${valueClass}`}>{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  )
}
