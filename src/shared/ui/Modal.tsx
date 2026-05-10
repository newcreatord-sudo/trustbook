import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function Modal(props: {
  open: boolean
  title: string
  description?: string
  children: React.ReactNode
  onClose: () => void
  footer?: React.ReactNode
  className?: string
}) {
  const { open, onClose, title, description, children, footer, className } = props
  const titleId = useId()
  const descId = useId()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const prevOverflowRef = useRef<string | null>(null)

  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab') return

      const root = panelRef.current
      if (!root) return
      const focusables = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.getAttribute('aria-hidden'))
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      const active = document.activeElement

      if (e.shiftKey) {
        if (active === first || !root.contains(active)) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)

    prevOverflowRef.current = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'

    window.setTimeout(() => {
      panelRef.current?.focus()
    }, 0)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
      
  }, [open, onClose])

  useEffect(() => {
    if (!open) {
      restoreFocusRef.current?.focus()
      restoreFocusRef.current = null
      document.documentElement.style.overflow = prevOverflowRef.current ?? ''
      prevOverflowRef.current = null
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-md" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          'relative w-full max-w-lg rounded-3xl border border-white/[0.1] bg-[#0d1526]/95 p-5 shadow-tbElevated outline-none ring-1 ring-white/[0.06] backdrop-blur-xl',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div id={titleId} className="text-base font-semibold tracking-tight text-white">{title}</div>
            {description ? <div id={descId} className="mt-1 text-sm leading-relaxed text-white/72">{description}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/[0.1] bg-white/[0.06] p-2 text-white/72 transition hover:bg-white/[0.1] hover:text-white"
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
        {footer ? <div className="mt-4">{footer}</div> : null}
      </div>
    </div>
  )
}
