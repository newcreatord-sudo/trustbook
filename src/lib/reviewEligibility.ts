import type { BookingRow } from '@/domain/supabase'

/** All public ratings use the same post-visit window (aligned with DB migration 0062). */
export const REVIEW_WINDOW_DAYS = 90
export const REVIEW_WINDOW_MS = REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000

/** Aligned with migration 0099 `reviews_comment_max_length`. */
export const REVIEW_COMMENT_MAX_LENGTH = 1500

/** Segnalazioni moderazione (RPC `submit_review_report`). */
export const REVIEW_REPORT_REASON_MIN_LENGTH = 12
export const REVIEW_REPORT_REASON_MAX_LENGTH = 2000

export type CustomerReviewBlockReason =
  | 'not_completed'
  | 'missing_completion_timestamp'
  | 'slot_not_finished'
  | 'window_expired'

export type BusinessReviewBlockReason =
  | 'invalid_status'
  | 'missing_completion_timestamp'
  | 'missing_no_show_timestamp'
  | 'slot_not_finished'
  | 'no_show_not_marked_yet'
  | 'window_expired_completed'
  | 'window_expired_no_show'

export function customerReviewEligibility(
  booking: Pick<BookingRow, 'status' | 'completed_at' | 'end_at'>,
  nowMs: number = Date.now(),
): { ok: true } | { ok: false; reason: CustomerReviewBlockReason } {
  if (booking.status !== 'completed') return { ok: false, reason: 'not_completed' }
  if (!booking.completed_at) return { ok: false, reason: 'missing_completion_timestamp' }
  const endMs = Date.parse(booking.end_at)
  if (!Number.isFinite(endMs)) return { ok: false, reason: 'slot_not_finished' }
  if (endMs > nowMs) return { ok: false, reason: 'slot_not_finished' }
  if (endMs < nowMs - REVIEW_WINDOW_MS) return { ok: false, reason: 'window_expired' }
  return { ok: true }
}

export function businessReviewEligibility(
  booking: Pick<BookingRow, 'status' | 'completed_at' | 'end_at' | 'no_show_at'>,
  nowMs: number = Date.now(),
): { ok: true } | { ok: false; reason: BusinessReviewBlockReason } {
  const endMs = Date.parse(booking.end_at)
  if (!Number.isFinite(endMs)) return { ok: false, reason: 'slot_not_finished' }
  if (endMs > nowMs) return { ok: false, reason: 'slot_not_finished' }

  if (booking.status === 'completed') {
    if (!booking.completed_at) return { ok: false, reason: 'missing_completion_timestamp' }
    if (endMs < nowMs - REVIEW_WINDOW_MS) return { ok: false, reason: 'window_expired_completed' }
    return { ok: true }
  }

  if (booking.status === 'no_show') {
    if (!booking.no_show_at) return { ok: false, reason: 'missing_no_show_timestamp' }
    const nsMs = Date.parse(booking.no_show_at)
    if (!Number.isFinite(nsMs)) return { ok: false, reason: 'missing_no_show_timestamp' }
    if (nsMs > nowMs) return { ok: false, reason: 'no_show_not_marked_yet' }
    if (nsMs < nowMs - REVIEW_WINDOW_MS) return { ok: false, reason: 'window_expired_no_show' }
    return { ok: true }
  }

  return { ok: false, reason: 'invalid_status' }
}

export function customerReviewBlockedMessage(reason: CustomerReviewBlockReason): string {
  switch (reason) {
    case 'not_completed':
      return 'La recensione si attiva solo dopo che l’attività ha registrato la visita come completata.'
    case 'missing_completion_timestamp':
      return 'La prenotazione risulta incompleta lato sistema: riprova più tardi o contatta il supporto.'
    case 'slot_not_finished':
      return 'Potrai lasciare una recensione dopo l’orario di fine dell’appuntamento.'
    case 'window_expired':
      return `Il periodo per recensire (max ${REVIEW_WINDOW_DAYS} giorni dopo la visita) è scaduto.`
    default:
      return 'Recensione non disponibile.'
  }
}

export function businessReviewBlockedMessage(reason: BusinessReviewBlockReason): string {
  switch (reason) {
    case 'invalid_status':
      return 'Valuta il cliente solo su prenotazioni completate o con no-show registrato.'
    case 'missing_completion_timestamp':
      return 'Completa correttamente la prenotazione prima di valutare il cliente.'
    case 'missing_no_show_timestamp':
      return 'Registra il no-show prima di valutare il comportamento.'
    case 'slot_not_finished':
      return 'Potrai valutare il cliente dopo l’orario di fine dello slot prenotato.'
    case 'no_show_not_marked_yet':
      return 'La data no-show non è ancora effettiva; riprova tra poco.'
    case 'window_expired_completed':
      return `Finestra recensione scaduta (${REVIEW_WINDOW_DAYS} giorni dalla visita).`
    case 'window_expired_no_show':
      return `Finestra recensione no-show scaduta (${REVIEW_WINDOW_DAYS} giorni).`
    default:
      return 'Recensione non disponibile.'
  }
}
