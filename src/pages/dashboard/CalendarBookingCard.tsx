import { MessageSquareText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BookingRow } from '@/domain/supabase'
import type { RiskLevel } from '@/domain/antiNoShowEngine'
import { ownerRiskPresentation } from '@/domain/antiNoShowEngine'
import { formatDateTime } from '@/utils/time'

export default function CalendarBookingCard(props: {
  booking: BookingRow
  customerName: string
  customerPhone: string | null
  serviceLabel: string
  riskLevel: RiskLevel
  effectiveScore: number
  requiresDeposit: boolean
  busy: boolean
  onChat: () => void
  onApprove: () => void
  onReject: () => void
  onCancel: () => void
  onNoShow: () => void
  onComplete: () => void
}) {
  const riskUi = ownerRiskPresentation(props.riskLevel)
  const b = props.booking
  const canApprove = b.status === 'requested' || b.status === 'pending_approval'
  const canClose = b.status === 'confirmed'
  const canCancel = b.status === 'pending_approval' || b.status === 'pending_deposit' || b.status === 'requires_deposit' || b.status === 'pending_payment_setup' || b.status === 'confirmed'

  return (
    <div
      className={cn(
        'rounded-2xl border bg-white/5 p-3 sm:p-4',
        props.requiresDeposit ? 'border-[#4F7CFF]/40' : 'border-white/10',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-semibold text-white sm:text-sm">{formatDateTime(b.start_at)}</div>
          <div className="mt-1 text-xs text-white/70">
            {props.customerName}
            {props.customerPhone ? ` · ${props.customerPhone}` : ''} · {props.serviceLabel}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/70">
              Eff {props.effectiveScore}/100 · Affidabilità {riskUi.labelIt}
            </span>
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-white/60">
              {b.status}
            </span>
            {props.requiresDeposit && (
              <span className="inline-flex items-center rounded-full border border-[#4F7CFF]/40 bg-[#4F7CFF]/10 px-2 py-0.5 text-[11px] font-semibold text-white">
                Richiede caparra
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={props.onChat}
          disabled={props.busy}
          className={cn(
            'inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-[11px] font-semibold text-white/80 transition hover:bg-white/10 sm:px-3 sm:text-xs',
            props.busy && 'cursor-not-allowed opacity-60',
          )}
        >
          <MessageSquareText className="h-4 w-4" />
          <span className="hidden sm:inline">Chat</span>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {canApprove && (
          <>
            <button
              type="button"
              onClick={props.onApprove}
              disabled={props.busy}
              className={cn(
                'rounded-xl bg-[#4F7CFF] px-2.5 py-2 text-[11px] font-semibold text-white transition hover:bg-[#6A90FF] sm:px-3 sm:text-xs',
                props.busy && 'cursor-not-allowed opacity-60',
              )}
            >
              Approva
            </button>
            <button
              type="button"
              onClick={props.onReject}
              disabled={props.busy}
              className={cn(
                'rounded-xl border border-red-500/30 bg-red-500/10 px-2.5 py-2 text-[11px] font-semibold text-red-100 transition hover:bg-red-500/15 sm:px-3 sm:text-xs',
                props.busy && 'cursor-not-allowed opacity-60',
              )}
            >
              Rifiuta
            </button>
          </>
        )}

        {canClose && (
          <>
            <button
              type="button"
              onClick={props.onComplete}
              disabled={props.busy}
              className={cn(
                'rounded-xl bg-emerald-500/15 px-2.5 py-2 text-[11px] font-semibold text-emerald-50 transition hover:bg-emerald-500/20 sm:px-3 sm:text-xs',
                props.busy && 'cursor-not-allowed opacity-60',
              )}
            >
              Completata
            </button>
            <button
              type="button"
              onClick={props.onNoShow}
              disabled={props.busy}
              className={cn(
                'rounded-xl bg-red-500/15 px-2.5 py-2 text-[11px] font-semibold text-red-100 transition hover:bg-red-500/20 sm:px-3 sm:text-xs',
                props.busy && 'cursor-not-allowed opacity-60',
              )}
            >
              No-show
            </button>
          </>
        )}

        {canCancel && (
          <button
            type="button"
            onClick={props.onCancel}
            disabled={props.busy}
            className={cn(
              'rounded-xl border border-white/10 bg-white/5 px-2.5 py-2 text-[11px] font-semibold text-white/80 transition hover:bg-white/10 sm:px-3 sm:text-xs',
              props.busy && 'cursor-not-allowed opacity-60',
            )}
          >
            Annulla
          </button>
        )}
      </div>
    </div>
  )
}
