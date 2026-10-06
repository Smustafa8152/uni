import { useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'

const EVENT = 'ums:toast'

/** Call from anywhere: toast('Course added') or toast('Could not save', 'err'). */
export function toast(message, tone = 'ok') {
  if (!message || typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { id: Date.now() + Math.random(), message: String(message), tone } }))
}

/** Mounted once in App. Confirms what just happened without moving the person off the page. */
export function Toaster() {
  const [items, setItems] = useState([])

  useEffect(() => {
    const onToast = (e) => {
      const item = e.detail
      setItems((prev) => [...prev.slice(-2), item])
      window.setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== item.id)), item.tone === 'err' ? 7000 : 4000)
    }
    window.addEventListener(EVENT, onToast)
    return () => window.removeEventListener(EVENT, onToast)
  }, [])

  if (items.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[80] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          className={`pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-white shadow-xl ${
            item.tone === 'err' ? 'bg-red-700' : 'bg-[#12284c]'
          }`}
        >
          {item.tone === 'err' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#c8a84b]" aria-hidden="true" />}
          <span className="min-w-0 flex-1 leading-snug">{item.message}</span>
          <button type="button" onClick={() => setItems((prev) => prev.filter((x) => x.id !== item.id))} className="shrink-0 rounded-md p-0.5 text-white/70 hover:text-white" aria-label="×">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
