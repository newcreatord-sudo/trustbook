import { describe, expect, test } from 'vitest'
import { openingWindowWeekdayJs } from '@/pages/home/homeLogic'

describe('openingWindowWeekdayJs', () => {
  test('equals Date#getDay (allineamento business_opening_windows.weekday PostgreSQL DOW 0–6)', () => {
    const samples = [
      new Date('2026-04-26T12:00:00'),
      new Date('2026-04-27T12:00:00'),
      new Date('2026-04-28T12:00:00'),
    ]
    for (const d of samples) {
      expect(openingWindowWeekdayJs(d)).toBe(d.getDay())
    }
  })
})
