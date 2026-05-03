import { useEffect, useState } from 'react'
import Modal from '@/shared/ui/Modal'
import Button from '@/shared/ui/Button'
import Textarea from '@/shared/ui/Textarea'
import Alert from '@/shared/ui/Alert'
import { REVIEW_REPORT_REASON_MAX_LENGTH, REVIEW_REPORT_REASON_MIN_LENGTH } from '@/lib/reviewEligibility'

export default function ReviewReportModal(props: {
  open: boolean
  title?: string
  description?: string
  busy?: boolean
  error?: string | null
  onClose: () => void
  onSubmit: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [localErr, setLocalErr] = useState<string | null>(null)

  useEffect(() => {
    if (!props.open) {
      setReason('')
      setLocalErr(null)
    }
  }, [props.open])

  const busy = Boolean(props.busy)
  const title = props.title ?? 'Segnala contenuto'
  const description =
    props.description ??
    'Descrivi il problema (linguaggio offensivo, dati sensibili, spam…). TrustBook registra la segnalazione per verifiche interne e può intervenire nei limiti di policy applicabile.'

  const validate = (raw: string): string | null => {
    const t = raw.trim()
    if (t.length < REVIEW_REPORT_REASON_MIN_LENGTH) {
      return `Inserisci almeno ${REVIEW_REPORT_REASON_MIN_LENGTH} caratteri utili.`
    }
    if (t.length > REVIEW_REPORT_REASON_MAX_LENGTH) return 'Testo troppo lungo.'
    return null
  }

  return (
    <Modal
      open={props.open}
      title={title}
      description={description}
      onClose={() => {
        if (!busy) props.onClose()
      }}
      footer={
        <div className="flex flex-col gap-3">
          {(props.error ?? localErr) ? <Alert tone="danger">{props.error ?? localErr}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => props.onClose()}>
              Annulla
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={async () => {
                const err = validate(reason)
                setLocalErr(err)
                if (err) return
                await props.onSubmit(reason.trim())
              }}
            >
              {busy ? 'Invio…' : 'Invia segnalazione'}
            </Button>
          </div>
        </div>
      }
    >
      <Textarea
        value={reason}
        disabled={busy}
        maxLength={REVIEW_REPORT_REASON_MAX_LENGTH}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Motivo della segnalazione…"
        aria-label="Motivo della segnalazione"
      />
      <div className="mt-2 text-[11px] text-white/45">
        {reason.trim().length}/{REVIEW_REPORT_REASON_MAX_LENGTH} · minimo consigliato {REVIEW_REPORT_REASON_MIN_LENGTH}{' '}
        caratteri
      </div>
    </Modal>
  )
}
