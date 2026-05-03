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
  if (!props.open) return null

  const confirmText = props.confirmText ?? 'Conferma'
  const cancelText = props.cancelText ?? 'Annulla'

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={() => (props.busy ? null : props.onCancel())} />
      <div className="relative w-full max-w-md rounded-3xl border border-white/10 bg-[#0B1220] p-6 shadow-2xl shadow-black/50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-bold text-white">{props.title}</div>
            {props.description && <div className="mt-2 text-sm text-white/70 leading-relaxed">{props.description}</div>}
          </div>
          <button
            type="button"
            onClick={() => {
              if (props.busy) return
              props.onCancel()
            }}
            className={cn(
              'rounded-xl border border-white/10 bg-white/5 p-2 text-white/70 transition hover:bg-white/10 hover:text-white',
              props.busy && 'cursor-not-allowed opacity-60',
            )}
            aria-label="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button type="button" disabled={props.busy} onClick={props.onCancel} variant="secondary">
            {cancelText}
          </Button>
          <Button
            type="button"
            disabled={props.busy}
            onClick={props.onConfirm}
            variant={props.tone === 'danger' ? 'danger' : 'primary'}
          >
            {props.busy ? 'Attendi…' : confirmText}
          </Button>
        </div>
      </div>
    </div>
  )
}
