import { describe, expect, it } from 'vitest'
import type { BookingEventRow } from '@/domain/supabase'
import { bookingEventToUi } from '@/utils/bookingEventsUi'

function ev(partial: Partial<BookingEventRow>): BookingEventRow {
  return {
    id: partial.id ?? 'e1',
    booking_id: partial.booking_id ?? 'b1',
    business_id: partial.business_id ?? 'biz1',
    kind: partial.kind ?? 'booking_created',
    visibility: partial.visibility ?? 'all',
    actor_user_id: partial.actor_user_id ?? null,
    payload: partial.payload ?? {},
    created_at: partial.created_at ?? new Date('2026-01-01T10:00:00.000Z').toISOString(),
  }
}

describe('bookingEventToUi', () => {
  it('maps status change', () => {
    const ui = bookingEventToUi(ev({ kind: 'status_changed', payload: { from: 'requires_deposit', to: 'confirmed' } }))
    expect(ui.title).toBe('Stato aggiornato')
    expect(ui.description).toContain('Caparra richiesta')
    expect(ui.description).toContain('Confermata')
  })

  it('maps internal note', () => {
    const ui = bookingEventToUi(ev({ kind: 'internal_note_updated', visibility: 'business_only', payload: { len: 12 } }))
    expect(ui.title).toBe('Nota interna aggiornata')
    expect(ui.description).toContain('12')
  })
})

