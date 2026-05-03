import { describe, expect, it } from 'vitest'
import {
  addDaysToDateParts,
  formatDatePartsKey,
  weekdayFromDateParts,
  zonedDateTimeToUtcIso,
} from '@/utils/timezone'

describe('timezone utils', () => {
  it('formats and shifts date parts', () => {
    const p = { year: 2026, month: 4, day: 29 }
    expect(formatDatePartsKey(p)).toBe('2026-04-29')
    expect(addDaysToDateParts(p, 1)).toEqual({ year: 2026, month: 4, day: 30 })
  })

  it('computes weekday from date parts', () => {
    // 2026-04-29 is Wednesday (3 with JS/Supabase dow)
    expect(weekdayFromDateParts({ year: 2026, month: 4, day: 29 })).toBe(3)
  })

  it('converts Europe/Rome local time to UTC in winter and summer', () => {
    const winterIso = zonedDateTimeToUtcIso({
      timeZone: 'Europe/Rome',
      parts: { year: 2026, month: 1, day: 15 },
      hour: 10,
      minute: 30,
    })
    expect(winterIso.startsWith('2026-01-15T09:30:')).toBe(true)

    const summerIso = zonedDateTimeToUtcIso({
      timeZone: 'Europe/Rome',
      parts: { year: 2026, month: 7, day: 15 },
      hour: 10,
      minute: 30,
    })
    expect(summerIso.startsWith('2026-07-15T08:30:')).toBe(true)
  })
})
