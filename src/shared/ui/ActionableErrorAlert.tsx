import { useMemo, useState } from 'react'
import Alert from '@/shared/ui/Alert'
import Button from '@/shared/ui/Button'

export type ApiFailureDisplay = {
  title: string
  probableCause: string
  nextStep: string
  requestId?: string | null
}

export default function ActionableErrorAlert(props: { failure: ApiFailureDisplay; className?: string }) {
  const { failure, className } = props
  const [copied, setCopied] = useState(false)

  const details = useMemo(() => {
    return JSON.stringify(
      {
        title: failure.title,
        probableCause: failure.probableCause,
        nextStep: failure.nextStep,
        requestId: failure.requestId ?? null,
      },
      null,
      2,
    )
  }, [failure])

  const canCopy = typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.writeText)

  return (
    <Alert className={className} tone="danger">
      <div className="text-sm font-semibold text-white">{failure.title}</div>
      <div className="mt-2 text-xs text-white/80">
        <div className="text-white/60">Causa probabile</div>
        <div className="mt-0.5">{failure.probableCause}</div>
      </div>
      <div className="mt-3 text-xs text-white/80">
        <div className="text-white/60">Cosa fare adesso</div>
        <div className="mt-0.5">{failure.nextStep}</div>
      </div>
      {failure.requestId ? (
        <div className="mt-3 text-[11px] text-white/55">
          Request ID: <span className="font-semibold text-white/70">{failure.requestId}</span>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {canCopy ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(details)
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1200)
              } catch {
                return
              }
            }}
          >
            {copied ? 'Copiato' : 'Copia dettagli'}
          </Button>
        ) : null}
      </div>
    </Alert>
  )
}

