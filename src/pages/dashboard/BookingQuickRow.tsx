import { CheckCircle2, Clock3, MessageSquareText, Sparkles, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDateTime, formatMoneyEUR } from '@/utils/time'
import type { BookingStatus } from '@/domain/supabase'
import type { RiskLevel } from '@/domain/antiNoShowEngine'
import { ownerRiskPresentation } from '@/domain/antiNoShowEngine'
import { bookingStatusLabel } from '@/utils/bookingUi'
import Badge from '@/shared/ui/Badge'
import Button from '@/shared/ui/Button'

function ownerFacingTagLabel(raw: string): string {
  const k = raw.toLowerCase()
  if (k === 'no_show') return 'No-show'
  if (k === 'ritardo') return 'Fuori finestra'
  if (k === 'vip') return 'Preferenziale'
  return raw
}

export default function BookingQuickRow(props: {
  id: string
  startAt: string
  endAt?: string
  customerName: string
  customerPhone: string | null
  customerTags?: string[]
  riskLevel: RiskLevel
  effectiveScore: number
  stars: number
  status: BookingStatus
  depositCents: number | null
  requiresDeposit?: boolean
  timeHint?: 'in_progress' | 'soon' | 'later'
  busy?: boolean
  canApprove: boolean
  canCancel: boolean
  canClose: boolean
  onApprove: () => void
  onReject: () => void
  onCancel: () => void
  onNoShow: () => void
  onComplete: () => void
  onChat: () => void
  onOpen: () => void
}) {
  const riskUi = ownerRiskPresentation(props.riskLevel)
  const timeTone = props.timeHint === 'in_progress' ? 'success' : props.timeHint === 'soon' ? 'warning' : 'neutral'

  return (
    <div
      className={cn(
        'rounded-2xl border bg-white/5 p-4',
        props.requiresDeposit ? 'border-[#4F7CFF]/40' : 'border-white/10',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{formatDateTime(props.startAt)}</div>
          <div className="mt-1 text-xs text-white/70">
            {props.customerName}
            {props.customerPhone ? ` · ${props.customerPhone}` : ''}
          </div>
          {Array.isArray(props.customerTags) && props.customerTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {props.customerTags
                .filter((t) => {
                  const k = t.toLowerCase()
                  return k === 'ritardo' || k === 'no_show' || k === 'vip'
                })
                .slice(0, 2)
                .map((t) => (
                  <Badge key={t} tone={t === 'no_show' ? 'danger' : t === 'ritardo' ? 'warning' : 'success'}>
                    {ownerFacingTagLabel(t)}
                  </Badge>
                ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {props.timeHint && (
              <Badge tone={timeTone} className="gap-1">
                <Clock3 className="h-3.5 w-3.5" />
                {props.timeHint === 'in_progress' ? 'In corso' : props.timeHint === 'soon' ? 'Tra poco' : 'Più tardi'}
              </Badge>
            )}
            <Badge tone={riskUi.badgeTone}>Affidabilità: {riskUi.labelIt}</Badge>
            <Badge tone="neutral" title={`Punteggio effettivo dopo recensioni e comportamento: ${props.effectiveScore} su 100`}>
              Punteggio {props.effectiveScore}/100 · {props.stars}★
            </Badge>
            <Badge tone="neutral" className="text-white/60">
              {bookingStatusLabel(props.status)}
            </Badge>
            {props.requiresDeposit && (
              <Badge tone="info" className="gap-1">
                <Sparkles className="h-3.5 w-3.5" />
                Richiede caparra
              </Badge>
            )}
            {typeof props.depositCents === 'number' && (
              <Badge tone="neutral">Caparra {formatMoneyEUR(props.depositCents)}</Badge>
            )}
          </div>
        </div>

        <Button type="button" onClick={props.onOpen} disabled={props.busy} variant="secondary" size="sm">
          Dettagli
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={props.onChat}
          disabled={props.busy}
          variant="secondary"
          size="sm"
          leftIcon={<MessageSquareText className="h-4 w-4" />}
        >
          Chat
        </Button>

        {props.canApprove && (
          <Button type="button" onClick={props.onApprove} disabled={props.busy} variant="primary" size="sm">
            Approva
          </Button>
        )}

        {props.canApprove && (
          <Button type="button" onClick={props.onReject} disabled={props.busy} variant="danger" size="sm">
            Rifiuta
          </Button>
        )}

        {props.canClose && (
          <Button
            type="button"
            onClick={props.onComplete}
            disabled={props.busy}
            variant="success"
            size="sm"
            leftIcon={<CheckCircle2 className="h-4 w-4" />}
          >
            Completata
          </Button>
        )}

        {props.canClose && (
          <Button
            type="button"
            onClick={props.onNoShow}
            disabled={props.busy}
            variant="danger"
            size="sm"
            leftIcon={<XCircle className="h-4 w-4" />}
          >
            No-show
          </Button>
        )}

        {props.canCancel && (
          <Button type="button" onClick={props.onCancel} disabled={props.busy} variant="secondary" size="sm">
            Annulla
          </Button>
        )}
      </div>
    </div>
  )
}
