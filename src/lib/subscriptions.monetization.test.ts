import { describe, expect, it } from 'vitest'
import {
  BUSINESS_FEATURE_DEFAULTS_FREE,
  parseBusinessFeatures,
  parseCustomerFeatures,
} from '@/lib/subscriptions'

describe('parseBusinessFeatures monetization fail-safe', () => {
  it('uses restrictive defaults when features JSON is empty', () => {
    expect(parseBusinessFeatures({})).toEqual(BUSINESS_FEATURE_DEFAULTS_FREE)
  })

  it('does not enable no-show suite or custom deposits when keys are omitted', () => {
    const g = parseBusinessFeatures({ anti_noshow: true, max_staff: 10 })
    expect(g.noShowSuite).toBe(false)
    expect(g.customDepositsEnabled).toBe(false)
    expect(g.maxStaff).toBe(10)
  })

  it('enables suite only when explicitly true', () => {
    expect(parseBusinessFeatures({ anti_noshow: true, no_show_suite: true }).noShowSuite).toBe(true)
    expect(parseBusinessFeatures({ anti_noshow: false, no_show_suite: true }).noShowSuite).toBe(false)
  })

  it('defaults resource_management to true when omitted (free-tier parity)', () => {
    expect(parseBusinessFeatures({}).resourceManagement).toBe(true)
  })

  it('respects explicit resource_management false', () => {
    expect(parseBusinessFeatures({ resource_management: false }).resourceManagement).toBe(false)
  })
})

describe('parseCustomerFeatures', () => {
  it('parses explicit booleans only', () => {
    expect(parseCustomerFeatures({})).toEqual({
      noDepositRequired: false,
      priorityBooking: false,
      advancedReminders: false,
      perks: false,
      reputationBoost: false,
    })
    expect(parseCustomerFeatures({ priority_booking: true, perks: true })).toMatchObject({
      priorityBooking: true,
      perks: true,
      advancedReminders: false,
    })
  })
})
