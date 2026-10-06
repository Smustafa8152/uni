import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'

const cx = (...parts) => parts.filter(Boolean).join(' ')

const BUTTON_VARIANTS = {
  primary: 'bg-[#1a3a6b] text-white hover:bg-[#12284c] shadow-sm shadow-[#1a3a6b]/20',
  gold: 'bg-[#c8a84b] text-[#12284c] hover:bg-[#a88a35] hover:text-white',
  quiet: 'bg-white text-[#1a3a6b] border border-[#dde3ef] hover:border-[#9fb0d1] hover:bg-[#eef2f9]',
  danger: 'bg-white text-red-700 border border-red-200 hover:bg-red-50',
  ghost: 'text-[#1a3a6b] hover:bg-[#eef2f9]',
}
const BUTTON_SIZES = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
}

/** The one button. `loading` keeps its width and blocks a second click. */
export function Button({ variant = 'primary', size = 'md', icon: Icon, loading = false, className = '', children, disabled, type = 'button', ...props }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center font-bold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary,
        BUTTON_SIZES[size] || BUTTON_SIZES.md,
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

const BADGE_TONES = {
  neutral: 'bg-slate-100 text-slate-700',
  info: 'bg-[#eef2f9] text-[#1a3a6b]',
  ok: 'bg-emerald-50 text-emerald-800',
  warn: 'bg-amber-50 text-amber-800',
  err: 'bg-red-50 text-red-700',
  gold: 'bg-[#faf5e6] text-[#7d6524]',
}

/** Status in words, never colour alone. */
export function Badge({ tone = 'neutral', icon: Icon, className = '', children }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold leading-none', BADGE_TONES[tone] || BADGE_TONES.neutral, className)}>
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : null}
      {children}
    </span>
  )
}

/** Page title with what the person can do on the page beside it. */
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#1a3a6b] sm:text-[28px]">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

/** A titled surface. `flush` drops the body padding so lists and tables run edge to edge. */
export function Panel({ title, aside, flush = false, className = '', children }) {
  return (
    <section className={cx('rounded-2xl border border-[#dde3ef] bg-white', className)}>
      {title || aside ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dde3ef] px-4 py-3.5 sm:px-5">
          <h2 className="text-[15px] font-extrabold text-[#1a3a6b]">{title}</h2>
          {aside}
        </header>
      ) : null}
      <div className={flush ? '' : 'p-4 sm:p-5'}>{children}</div>
    </section>
  )
}

/** An empty list says what belongs here and how to get it. */
export function EmptyState({ icon: Icon, title, hint, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {Icon ? (
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef2f9] text-[#1a3a6b]">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
      ) : null}
      <p className="text-sm font-bold text-slate-800">{title}</p>
      {hint ? <p className="mt-1 max-w-sm text-sm text-slate-500">{hint}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

/** Placeholder with the shape of what is loading, instead of a spinner on an empty page. */
export function Skeleton({ className = '' }) {
  return <div className={cx('animate-pulse rounded-lg bg-[#dde3ef]/70', className)} aria-hidden="true" />
}

/** Replaces the browser's confirm(): states the consequence and names the action on the button. */
export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, tone = 'danger', busy = false, onConfirm, onCancel }) {
  const confirmRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    confirmRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-[#12284c]/40 p-4 backdrop-blur-[2px] sm:items-center" onClick={() => !busy && onCancel?.()}>
      <div role="alertdialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-extrabold text-[#1a3a6b]">{title}</h3>
        {body ? <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p> : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="quiet" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cx(
              'inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-white transition-colors disabled:opacity-50',
              tone === 'danger' ? 'bg-red-700 hover:bg-red-800' : 'bg-[#1a3a6b] hover:bg-[#12284c]'
            )}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
