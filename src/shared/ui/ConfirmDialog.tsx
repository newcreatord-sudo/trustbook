import { useEffect, useId } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import Button from '@/shared/ui/Button'

export default function ConfirmDialog(props: {
  open: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  tone?: 'default' | 'primary' | 'danger'
  busy?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { open, busy, onCancel, onConfirm, title, description, confirmText: confirmTextProp, cancelText: cancelTextProp, tone } = props
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    if (!open || busy) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  useEffect(() => {
    if (!open) return
    const prev = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.documentElement.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  const confirmText = confirmTextProp ?? 'Conferma'
  const cancelText = cancelTextProp ?? 'Annulla'

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4" role="presentation">
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-md transition-opacity"
        aria-hidden
        onClick={() => (busy ? undefined : onCancel())}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className="relative w-full max-w-md rounded-3xl border border-white/[0.1] bg-[#0d1526]/95 p-6 shadow-tbElevated outline-none ring-1 ring-white/[0.06] backdrop-blur-xl motion-safe:transition motion-safe:duration-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div id={titleId} className="text-base font-semibold tracking-tight text-white">
              {title}
            </div>
            {description ? (
              <div id={descId} className="mt-2 text-sm leading-relaxed text-white/72">
                {description}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              if (busy) return
              onCancel()
            }}
            className={cn(
              'rounded-xl border border-white/[0.1] bg-white/[0.06] p-2 text-white/72 transition hover:bg-white/[0.1] hover:text-white',
              busy && 'cursor-not-allowed opacity-60',
            )}
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button type="button" disabled={busy} onClick={onCancel} variant="secondary">
            {cancelText}
          </Button>
          <Button
            type="button"
            loading={busy}
            onClick={onConfirm}
            variant={tone === 'danger' ? 'danger' : 'primary'}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}
