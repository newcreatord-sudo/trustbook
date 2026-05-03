import { describe, expect, it } from 'vitest'
import {
  blockedSlotAppliesToStaffChoice,
  isSlotOverlapping,
  occupyingBookingConflictsWithStaffChoice,
  OCCUPYING_BOOKING_STATUSES,
  slotWithServiceBuffers,
  staffClosureBlocksStaffBooking,
} from '@/utils/availability'
import { SCHEDULER_OCCUPYING_BOOKING_STATUSES } from '@/domain/bookingOccupyingStatuses'

describe('availability', () => {
  it('slotWithServiceBuffers expands interval symmetrically', () => {
    const slot = {
      startAt: '2026-06-01T10:00:00.000Z',
      endAt: '2026-06-01T11:00:00.000Z',
    }
    const expanded = slotWithServiceBuffers(slot, 10, 15)
    expect(new Date(expanded.startAt).getTime()).toBe(new Date(slot.startAt).getTime() - 10 * 60_000)
    expect(new Date(expanded.endAt).getTime()).toBe(new Date(slot.endAt).getTime() + 15 * 60_000)
  })

  it('expanded slot overlaps adjacent booking window like server-side guard', () => {
    const expanded = slotWithServiceBuffers(
      {
        startAt: '2026-06-01T10:00:00.000Z',
        endAt: '2026-06-01T11:00:00.000Z',
      },
      30,
      0,
    )
    const existing = {
      startAt: '2026-06-01T09:35:00.000Z',
      endAt: '2026-06-01T10:05:00.000Z',
    }
    expect(isSlotOverlapping(expanded, existing)).toBe(true)
  })

  it('OCCUPYING_BOOKING_STATUSES matches deposit pipeline states', () => {
    expect(OCCUPYING_BOOKING_STATUSES).toBe(SCHEDULER_OCCUPYING_BOOKING_STATUSES)
    expect(OCCUPYING_BOOKING_STATUSES.length).toBe(10)
    expect(OCCUPYING_BOOKING_STATUSES).toContain('requires_deposit')
    expect(OCCUPYING_BOOKING_STATUSES).toContain('pending_payment_setup')
    expect(OCCUPYING_BOOKING_STATUSES).toContain('change_proposed')
  })

  it('occupyingBookingConflictsWithStaffChoice mirrors create_booking_v3 overlap staff predicate', () => {
    expect(occupyingBookingConflictsWithStaffChoice(null, 'u1')).toBe(true)
    expect(occupyingBookingConflictsWithStaffChoice(null, null)).toBe(true)
    expect(occupyingBookingConflictsWithStaffChoice('u1', null)).toBe(false)
    expect(occupyingBookingConflictsWithStaffChoice('u1', 'u1')).toBe(true)
    expect(occupyingBookingConflictsWithStaffChoice('u1', 'u2')).toBe(false)
  })

  it('blockedSlotAppliesToStaffChoice mirrors blocked_slots clause', () => {
    expect(blockedSlotAppliesToStaffChoice(null, null)).toBe(true)
    expect(blockedSlotAppliesToStaffChoice('u1', null)).toBe(true)
    expect(blockedSlotAppliesToStaffChoice(null, 'u1')).toBe(false)
    expect(blockedSlotAppliesToStaffChoice('u1', 'u1')).toBe(true)
    expect(blockedSlotAppliesToStaffChoice('u2', 'u1')).toBe(false)
  })

  it('staffClosureBlocksStaffBooking mirrors create_booking_v3 staff_closures (no buffer)', () => {
    expect(
      staffClosureBlocksStaffBooking({
        selectedStaffId: null,
        closureStaffId: 's1',
        closureStartAt: '2026-06-01T09:00:00.000Z',
        closureEndAt: '2026-06-01T12:00:00.000Z',
        slotStartAt: '2026-06-01T10:00:00.000Z',
        slotEndAt: '2026-06-01T11:00:00.000Z',
      }),
    ).toBe(false)

    expect(
      staffClosureBlocksStaffBooking({
        selectedStaffId: 's1',
        closureStaffId: 's2',
        closureStartAt: '2026-06-01T09:00:00.000Z',
        closureEndAt: '2026-06-01T12:00:00.000Z',
        slotStartAt: '2026-06-01T10:00:00.000Z',
        slotEndAt: '2026-06-01T11:00:00.000Z',
      }),
    ).toBe(false)

    expect(
      staffClosureBlocksStaffBooking({
        selectedStaffId: 's1',
        closureStaffId: 's1',
        closureStartAt: '2026-06-01T09:00:00.000Z',
        closureEndAt: '2026-06-01T12:00:00.000Z',
        slotStartAt: '2026-06-01T10:00:00.000Z',
        slotEndAt: '2026-06-01T11:00:00.000Z',
      }),
    ).toBe(true)
  })

  it('staffClosure overlap uses strict interval semantics like SQL', () => {
    expect(
      staffClosureBlocksStaffBooking({
        selectedStaffId: 's1',
        closureStaffId: 's1',
        closureStartAt: '2026-06-01T10:00:00.000Z',
        closureEndAt: '2026-06-01T11:00:00.000Z',
        slotStartAt: '2026-06-01T11:00:00.000Z',
        slotEndAt: '2026-06-01T12:00:00.000Z',
      }),
    ).toBe(false)
  })
})
