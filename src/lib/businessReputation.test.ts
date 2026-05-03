import { describe, expect, test } from 'vitest'
import { computeTrustBadges, formatMinutes, formatPercent01, type BusinessPublicReputation } from '@/lib/businessReputation'

function mkRep(partial?: Partial<BusinessPublicReputation>): BusinessPublicReputation {
  return {
    business_id: 'b1',
    window_days: 90,
    avg_rating: 0,
    review_count: 0,
    confirmed_rate: null,
    cancelled_by_business_rate: null,
    response_time_avg_minutes: null,
    on_time_rate: null,
    computed_at: new Date().toISOString(),
    ...(partial ?? {}),
  }
}

describe('businessReputation', () => {
  test('formatPercent01 clamps and rounds', () => {
    expect(formatPercent01(null)).toBe(null)
    expect(formatPercent01(0)).toBe('0%')
    expect(formatPercent01(0.234)).toBe('23%')
    expect(formatPercent01(1)).toBe('100%')
    expect(formatPercent01(2)).toBe('100%')
    expect(formatPercent01(-1)).toBe('0%')
  })

  test('formatMinutes humanizes', () => {
    expect(formatMinutes(null)).toBe(null)
    expect(formatMinutes(0.2)).toBe('<1 min')
    expect(formatMinutes(12.4)).toBe('12 min')
    expect(formatMinutes(60)).toBe('1 h')
    expect(formatMinutes(75)).toBe('1 h 15 min')
  })

  test('computeTrustBadges returns meaningful badges', () => {
    const rep = mkRep({
      avg_rating: 4.8,
      review_count: 12,
      confirmed_rate: 0.9,
      cancelled_by_business_rate: 0.02,
      response_time_avg_minutes: 20,
      on_time_rate: 0.9,
    })
    const labels = computeTrustBadges(rep).map((b) => b.label)
    expect(labels).toContain('Top rated')
    expect(labels).toContain('Risposta veloce')
    expect(labels).toContain('Alta conferma')
    expect(labels).toContain('Basse cancellazioni')
    expect(labels).toContain('Puntuale')
  })

  test('computeTrustBadges labels new businesses', () => {
    const labels = computeTrustBadges(mkRep({ avg_rating: 5, review_count: 0 })).map((b) => b.label)
    expect(labels).toContain('Nuova su TrustBook')
  })
})

