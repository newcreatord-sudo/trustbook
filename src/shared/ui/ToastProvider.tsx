import { useCallback, useMemo, useState } from 'react'
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ToastContext, type ToastItem, type ToastTone } from '@/shared/ui/toastContext'

export default function ToastProvider(props: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback(
    (t: Omit<ToastItem, 'createdAt'> & { ttlMs?: number }) => {
      const id = t.id ?? `${Date.now()}_${Math.random().toString(16).slice(2)}`
      const createdAt = Date.now()
      const item: ToastItem = { id, tone: t.tone as ToastTone, title: t.title, description: t.description, createdAt }
      setItems((prev) => [item, ...prev].slice(0, 3))
      const ttl = typeof t.ttlMs === 'number' ? t.ttlMs : 4500
      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== id))
      }, ttl)
    },
    [setItems],
  )

  const value = useMemo(() => ({ push }), [push])

  const politeItems = items.filter((t) => t.tone !== 'danger' && t.tone !== 'warning')
  const assertiveItems = items.filter((t) => t.tone === 'danger' || t.tone === 'warning')

  return (
    <ToastContext.Provider value={value}>
      {props.children}
      {/*
        Two separate live regions:
          - polite for info/success
          - assertive for danger/warning so screen readers interrupt
        Both regions are visually merged via absolute positioning; visually
        users still see one stack.
      */}
      <div
        className="fixed right-4 top-4 z-[80] flex w-[min(420px,calc(100vw-32px))] flex-col gap-2"
        role="status"
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
      >
        {politeItems.map((t) => (
          <div
            key={t.id}
            className={cn(
              'rounded-2xl border bg-[#0d1526]/95 p-4 shadow-tbElevated backdrop-blur-xl ring-1 ring-white/[0.06]',
              t.tone === 'info' && 'border-white/[0.1]',
              t.tone === 'success' && 'border-emerald-500/30',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 text-white/80">
                  {t.tone === 'success' ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : t.tone === 'warning' || t.tone === 'danger' ? (
                    <TriangleAlert className="h-5 w-5" />
                  ) : (
                    <Info className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{t.title}</div>
                  {t.description ? <div className="mt-1 text-sm leading-relaxed text-white/72">{t.description}</div> : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
                className="rounded-xl border border-white/[0.1] bg-white/[0.06] p-2 text-white/72 transition hover:bg-white/[0.1] hover:text-white"
                aria-label="Chiudi"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div
        className="fixed right-4 top-4 z-[80] flex w-[min(420px,calc(100vw-32px))] flex-col gap-2 pointer-events-none"
        role="alert"
        aria-live="assertive"
        aria-relevant="additions text"
        aria-atomic="true"
      >
        {assertiveItems.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto rounded-2xl border bg-[#0d1526]/95 p-4 shadow-tbElevated backdrop-blur-xl ring-1 ring-white/[0.06]',
              t.tone === 'warning' && 'border-amber-500/30',
              t.tone === 'danger' && 'border-red-500/30',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 text-white/80">
                  <TriangleAlert className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{t.title}</div>
                  {t.description ? <div className="mt-1 text-sm leading-relaxed text-white/72">{t.description}</div> : null}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
                className="rounded-xl border border-white/[0.1] bg-white/[0.06] p-2 text-white/72 transition hover:bg-white/[0.1] hover:text-white"
                aria-label="Chiudi"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
