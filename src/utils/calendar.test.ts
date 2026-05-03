import { describe, expect, it } from 'vitest'
import { formatDateInput, getWeekRange, parseDateInput, startOfDay } from '@/utils/calendar'

describe('calendar utils', () => {
  it('formatDateInput formats YYYY-MM-DD', () => {
    expect(formatDateInput(new Date('2026-04-21T12:30:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('parseDateInput parses valid date', () => {
    const d = parseDateInput('2026-04-21')
    expect(d).not.toBeNull()
    expect(formatDateInput(d!)).toBe('2026-04-21')
  })

  it('getWeekRange returns 7-day inclusive range', () => {
    const anchor = new Date('2026-04-22T10:00:00')
    const r = getWeekRange(anchor, true)
    const start = startOfDay(r.start)
    const end = startOfDay(r.end)
    const days = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
    expect(days).toBe(6)
  })
})

