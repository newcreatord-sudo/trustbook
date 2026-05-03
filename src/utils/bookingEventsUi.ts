import type { BookingEventRow, BookingStatus } from '@/domain/supabase'
import { bookingStatusLabel } from '@/utils/bookingUi'
import { formatDateTime } from '@/utils/time'

export type BookingEventUi = {
  title: string
  description: string
  when: string
  tone: 'neutral' | 'good' | 'warn' | 'bad'
}

function asObj(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== 'object') return {}
  return payload as Record<string, unknown>
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}

export function bookingEventToUi(e: BookingEventRow): BookingEventUi {
  const p = asObj(e.payload)
  const when = formatDateTime(e.created_at)

  if (e.kind === 'booking_created') {
    return { title: 'Prenotazione creata', description: 'Richiesta inviata.', when, tone: 'neutral' }
  }

  if (e.kind === 'status_changed') {
    const from = asStr(p.from)
    const to = asStr(p.to)
    const fromLabel = from ? bookingStatusLabel(from as BookingStatus) : '—'
    const toLabel = to ? bookingStatusLabel(to as BookingStatus) : '—'
    const tone: BookingEventUi['tone'] =
      to === 'completed' ? 'good' : to === 'no_show' || to === 'rejected' ? 'bad' : to === 'pending_deposit' || to === 'requires_deposit' || to === 'pending_payment_setup' ? 'warn' : 'neutral'
    return { title: 'Stato aggiornato', description: `${fromLabel} → ${toLabel}`, when, tone }
  }

  if (e.kind === 'deposit_status_changed') {
    const from = asStr(p.from) ?? '—'
    const to = asStr(p.to) ?? '—'
    const tone: BookingEventUi['tone'] = to === 'paid' ? 'good' : to === 'forfeited' ? 'bad' : 'neutral'
    return { title: 'Caparra aggiornata', description: `${from} → ${to}`, when, tone }
  }

  if (e.kind === 'time_change_proposed') {
    const s = asStr(p.proposed_start_at)
    const en = asStr(p.proposed_end_at)
    const msg = asStr(p.message)
    const range = s && en ? `${formatDateTime(s)} → ${formatDateTime(en)}` : 'Nuovo orario proposto'
    return { title: 'Proposta cambio orario', description: msg ? `${range} · “${msg}”` : range, when, tone: 'warn' }
  }

  if (e.kind === 'time_changed') {
    const from = asStr(p.from_start_at)
    const to = asStr(p.to_start_at)
    const range = from && to ? `${formatDateTime(from)} → ${formatDateTime(to)}` : 'Orario aggiornato'
    return { title: 'Orario aggiornato', description: range, when, tone: 'neutral' }
  }

  if (e.kind === 'internal_note_updated') {
    const len = typeof p.len === 'number' ? String(p.len) : null
    return {
      title: 'Nota interna aggiornata',
      description: len ? `Testo: ${len} caratteri.` : 'Testo aggiornato.',
      when,
      tone: 'neutral',
    }
  }

  return { title: 'Evento', description: e.kind, when, tone: 'neutral' }
}

