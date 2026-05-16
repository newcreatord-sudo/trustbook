import { useState } from 'react'
import Alert from '@/shared/ui/Alert'
import Button from '@/shared/ui/Button'
import type { ApiFailureDisplay } from '@/lib/errors'

export default function ActionableErrorAlert(props: {
  error: ApiFailureDisplay
  tone?: 'warning' | 'danger'
  className?: string
}) {
  const { error, tone = 'warning', className } = props
  const [copied, setCopied] = useState(false)

  const copyRequestId = async () => {
    if (!error.requestId || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(error.requestId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Alert tone={tone} className={className}>
      <div className="space-y-2">
        <div className="text-sm font-semibold">{error.title}</div>
        <div className="text-sm opacity-95">
          <span className="font-medium">Causa probabile:</span> {error.probableCause}
        </div>
        <div className="text-sm opacity-95">
          <span className="font-medium">Cosa fare adesso:</span> {error.nextStep}
        </div>
        {error.requestId ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <code className="rounded bg-black/20 px-2 py-1 text-xs">ID richiesta: {error.requestId}</code>
            <Button type="button" size="sm" variant="secondary" onClick={() => void copyRequestId()}>
              {copied ? 'ID copiato' : 'Copia ID'}
            </Button>
          </div>
        ) : null}
      </div>
    </Alert>
  )
}
