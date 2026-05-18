import { describe, expect, it } from 'vitest'
import { computeTrustTier } from './trustTier.logic'

describe('computeTrustTier', () => {
  it('maps null score or few bookings to newcomer', () => {
    expect(computeTrustTier({ score: null }).tier).toBe('newcomer')
    expect(computeTrustTier({ score: undefined }).tier).toBe('newcomer')
    expect(computeTrustTier({ score: NaN }).tier).toBe('newcomer')
    expect(computeTrustTier({ score: 100, completedBookings: 2 }).tier).toBe('newcomer')
  })

  it('maps blocked when score < 50 with history', () => {
    expect(
      computeTrustTier({ score: 49, completedBookings: 10, noShowCount: 0 }).tier,
    ).toBe('blocked')
  })

  it('maps at-risk when 50 ≤ score < 70', () => {
    expect(
      computeTrustTier({ score: 69, completedBookings: 10 }).tier,
    ).toBe('at-risk')
  })

  it('maps champion only at high score, ≥15 bookings, zero no-shows', () => {
    expect(
      computeTrustTier({
        score: 95,
        completedBookings: 15,
        noShowCount: 0,
      }).tier,
    ).toBe('champion')

    expect(
      computeTrustTier({
        score: 95,
        completedBookings: 15,
        noShowCount: 1,
      }).tier,
    ).not.toBe('champion')
  })

  it('prefers verified over reliable when thresholds met', () => {
    expect(
      computeTrustTier({ score: 85, completedBookings: 5 }).tier,
    ).toBe('verified')

    expect(
      computeTrustTier({ score: 84, completedBookings: 5 }).tier,
    ).toBe('reliable')
  })

  it('uses reliable default for middling mature scores', () => {
    expect(
      computeTrustTier({
        score: 80,
        completedBookings: 10,
        noShowCount: 0,
      }).tier,
    ).toBe('reliable')
  })
})
