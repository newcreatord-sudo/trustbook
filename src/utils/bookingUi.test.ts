import { describe, expect, it } from 'vitest'
import { bookingStatusLabel, depositStatusLabel, isClosedBookingStatus } from '@/utils/bookingUi'

describe('bookingUi', () => {
  it('labels booking statuses', () => {
    expect(bookingStatusLabel('confirmed')).toBe('Confermata')
    expect(bookingStatusLabel('pending_deposit')).toBe('In attesa caparra')
    expect(bookingStatusLabel('requires_deposit')).toBe('Caparra richiesta')
    expect(bookingStatusLabel('cancelled_by_customer')).toBe('Annullata (da te)')
  })

  it('labels deposit statuses', () => {
    expect(depositStatusLabel('required')).toBe('Richiesta')
    expect(depositStatusLabel('paid')).toBe('Pagata')
    expect(depositStatusLabel('forfeited')).toBe('Trattenuta')
  })

  it('detects closed statuses', () => {
    expect(isClosedBookingStatus('confirmed')).toBe(false)
    expect(isClosedBookingStatus('completed')).toBe(true)
    expect(isClosedBookingStatus('no_show')).toBe(true)
    expect(isClosedBookingStatus('cancelled_by_business')).toBe(true)
  })
})

