import { describe, expect, test } from 'vitest'
import {
  REVIEW_WINDOW_MS,
  businessReviewEligibility,
  customerReviewEligibility,
} from '@/lib/reviewEligibility'

const t = (iso: string) => Date.parse(iso)

describe('customerReviewEligibility', () => {
  test('allows completed visit after slot end, inside window', () => {
    const now = t('2026-06-15T12:00:00.000Z')
    const row = {
      status: 'completed' as const,
      completed_at: '2026-06-02T11:30:00.000Z',
      end_at: '2026-06-02T11:00:00.000Z',
    }
    expect(customerReviewEligibility(row, now)).toEqual({ ok: true })
  })

  test('blocks before end of slot', () => {
    const now = t('2026-06-02T10:30:00.000Z')
    const row = {
      status: 'completed' as const,
      completed_at: '2026-06-02T10:29:00.000Z',
      end_at: '2026-06-02T11:00:00.000Z',
    }
    expect(customerReviewEligibility(row, now)).toEqual({ ok: false, reason: 'slot_not_finished' })
  })

  test('blocks without completed_at', () => {
    const now = t('2026-06-15T12:00:00.000Z')
    const row = {
      status: 'completed' as const,
      completed_at: null,
      end_at: '2026-06-02T11:00:00.000Z',
    }
    expect(customerReviewEligibility(row, now)).toEqual({
      ok: false,
      reason: 'missing_completion_timestamp',
    })
  })

  test('blocks outside 90-day window from end_at', () => {
    const end = '2026-01-01T12:00:00.000Z'
    const now = t('2026-06-15T12:00:00.000Z')
    expect(now - Date.parse(end)).toBeGreaterThan(REVIEW_WINDOW_MS)
    const row = {
      status: 'completed' as const,
      completed_at: '2026-01-01T13:00:00.000Z',
      end_at: end,
    }
    expect(customerReviewEligibility(row, now)).toEqual({ ok: false, reason: 'window_expired' })
  })
})

describe('businessReviewEligibility', () => {
  test('allows completed mirror rules', () => {
    const now = t('2026-06-15T12:00:00.000Z')
    const row = {
      status: 'completed' as const,
      completed_at: '2026-06-02T11:05:00.000Z',
      end_at: '2026-06-02T11:00:00.000Z',
      no_show_at: null,
    }
    expect(businessReviewEligibility(row, now)).toEqual({ ok: true })
  })

  test('allows no_show after slot end and marking', () => {
    const now = t('2026-06-02T14:00:00.000Z')
    const row = {
      status: 'no_show' as const,
      completed_at: null,
      end_at: '2026-06-02T11:00:00.000Z',
      no_show_at: '2026-06-02T11:15:00.000Z',
    }
    expect(businessReviewEligibility(row, now)).toEqual({ ok: true })
  })

  test('blocks no_show before slot end', () => {
    const now = t('2026-06-02T10:30:00.000Z')
    const row = {
      status: 'no_show' as const,
      completed_at: null,
      end_at: '2026-06-02T11:00:00.000Z',
      no_show_at: '2026-06-02T10:20:00.000Z',
    }
    expect(businessReviewEligibility(row, now)).toEqual({ ok: false, reason: 'slot_not_finished' })
  })

  test('blocks irrelevant statuses', () => {
    const now = t('2026-06-15T12:00:00.000Z')
    const row = {
      status: 'confirmed' as const,
      completed_at: null,
      end_at: '2026-06-02T11:00:00.000Z',
      no_show_at: null,
    }
    expect(businessReviewEligibility(row, now)).toEqual({ ok: false, reason: 'invalid_status' })
  })
})
