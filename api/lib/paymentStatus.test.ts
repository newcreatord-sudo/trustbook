import { describe, expect, it } from 'vitest'
import { asPaymentStatus, canTransitionPaymentStatus, type PaymentStatus } from './paymentStatus'

describe('paymentStatus', () => {
  it('parses only allowed payment states', () => {
    expect(asPaymentStatus('created')).toBe('created')
    expect(asPaymentStatus('paid')).toBe('paid')
    expect(asPaymentStatus('refunded')).toBe('refunded')
    expect(asPaymentStatus('forfeited')).toBe('forfeited')
    expect(asPaymentStatus('invalid')).toBeNull()
    expect(asPaymentStatus(123)).toBeNull()
    expect(asPaymentStatus(null)).toBeNull()
  })

  it('allows only valid state transitions', () => {
    const cases: Array<[PaymentStatus, PaymentStatus, boolean]> = [
      ['created', 'created', true],
      ['created', 'paid', true],
      ['created', 'refunded', false],
      ['created', 'forfeited', false],
      ['paid', 'paid', true],
      ['paid', 'refunded', true],
      ['paid', 'forfeited', true],
      ['paid', 'created', false],
      ['refunded', 'refunded', true],
      ['refunded', 'paid', false],
      ['forfeited', 'forfeited', true],
      ['forfeited', 'paid', false],
    ]

    for (const [current, next, expected] of cases) {
      expect(canTransitionPaymentStatus(current, next)).toBe(expected)
    }
  })
})
