import { describe, it, expect } from 'vitest'
import { calculateRequiredDeposit } from './depositEngine'
import type { BusinessRow } from './supabase'

const defaultBusiness: Partial<BusinessRow> = {
  deposit_mode: 'none',
  deposit_value_type: 'percentage',
  deposit_percent: 20,
  deposit_fixed_cents: 1000,
  deposit_green_rule: { type: 'percentage', value: 0 },
  deposit_yellow_rule: { type: 'percentage', value: 20 },
  deposit_red_rule: { type: 'percentage', value: 50 },
  manual_approval_for_high_risk: true,
  refund_policy: 'flexible',
  cancellation_free_until_hours: 24,
  deposit_min_cents: null,
  deposit_max_cents: null,
}

describe('Deposit Policy Engine', () => {
  it('returns no deposit when mode is none', () => {
    const res = calculateRequiredDeposit({
      businessPolicy: { ...defaultBusiness } as BusinessRow,
      servicePriceCents: 5000,
      userReliabilityScore: 100,
      userRiskLevel: 'green',
    })
    expect(res.depositRequired).toBe(false)
  })

  it('applies deposit for everyone', () => {
    const res = calculateRequiredDeposit({
      businessPolicy: { ...defaultBusiness, deposit_mode: 'everyone', deposit_percent: 25 } as BusinessRow,
      servicePriceCents: 10000,
      userReliabilityScore: 100,
      userRiskLevel: 'green',
    })
    expect(res.depositRequired).toBe(true)
    expect(res.depositAmountCents).toBe(2500)
    expect(res.customerMessage.toLowerCase()).toContain('protezione agenda')
  })

  it('waives deposit for green users in risk_based mode', () => {
    const res = calculateRequiredDeposit({
      businessPolicy: { ...defaultBusiness, deposit_mode: 'risk_based', deposit_percent: 20 } as BusinessRow,
      servicePriceCents: 10000,
      userReliabilityScore: 90,
      userRiskLevel: 'green',
    })
    expect(res.depositRequired).toBe(false)
    expect(res.customerMessage.toLowerCase()).toContain('garanzia prenotazione non richiesta')
  })

  it('requires deposit for red users in risk_based mode', () => {
    const res = calculateRequiredDeposit({
      businessPolicy: { ...defaultBusiness, deposit_mode: 'risk_based', deposit_percent: 30 } as BusinessRow,
      servicePriceCents: 10000,
      userReliabilityScore: 40,
      userRiskLevel: 'red',
    })
    expect(res.depositRequired).toBe(true)
    expect(res.depositAmountCents).toBe(3000)
  })

  it('dynamic mode: green gets 0%, yellow gets 20%, red gets 50% + manual approval', () => {
    const b = { ...defaultBusiness, deposit_mode: 'dynamic' } as BusinessRow

    const green = calculateRequiredDeposit({ businessPolicy: b, servicePriceCents: 10000, userReliabilityScore: 90, userRiskLevel: 'green' })
    expect(green.depositRequired).toBe(false)
    expect(green.requiresManualApproval).toBe(false)

    const yellow = calculateRequiredDeposit({ businessPolicy: b, servicePriceCents: 10000, userReliabilityScore: 60, userRiskLevel: 'yellow' })
    expect(yellow.depositRequired).toBe(true)
    expect(yellow.depositAmountCents).toBe(2000)
    expect(yellow.requiresManualApproval).toBe(false)

    const red = calculateRequiredDeposit({ businessPolicy: b, servicePriceCents: 10000, userReliabilityScore: 30, userRiskLevel: 'red' })
    expect(red.depositRequired).toBe(true)
    expect(red.depositAmountCents).toBe(5000)
    expect(red.requiresManualApproval).toBe(true)
  })

  it('dynamic mode supports fixed deposit also for green users', () => {
    const b = {
      ...defaultBusiness,
      deposit_mode: 'dynamic',
      deposit_green_rule: { type: 'fixed_amount', value: 700 },
    } as BusinessRow
    const green = calculateRequiredDeposit({
      businessPolicy: b,
      servicePriceCents: 5000,
      userReliabilityScore: 95,
      userRiskLevel: 'green',
    })
    expect(green.depositRequired).toBe(true)
    expect(green.depositAmountCents).toBe(700)
  })

  it('respects min and max limits', () => {
    const b = { 
      ...defaultBusiness, 
      deposit_mode: 'everyone', 
      deposit_percent: 50,
      deposit_min_cents: 1000, // 10 EUR min
      deposit_max_cents: 2000  // 20 EUR max
    } as BusinessRow

    const lowPrice = calculateRequiredDeposit({ businessPolicy: b, servicePriceCents: 1000, userReliabilityScore: 100, userRiskLevel: 'green' })
    // 50% of 10 EUR = 5 EUR, but min is 10 EUR. So it should be 10 EUR.
    expect(lowPrice.depositAmountCents).toBe(1000)

    const highPrice = calculateRequiredDeposit({ businessPolicy: b, servicePriceCents: 10000, userReliabilityScore: 100, userRiskLevel: 'green' })
    // 50% of 100 EUR = 50 EUR, but max is 20 EUR.
    expect(highPrice.depositAmountCents).toBe(2000)
  })

  it('handles zero price and service without price safely', () => {
    const b = { ...defaultBusiness, deposit_mode: 'everyone', deposit_percent: 30 } as BusinessRow
    const zero = calculateRequiredDeposit({
      businessPolicy: b,
      servicePriceCents: 0,
      userReliabilityScore: 70,
      userRiskLevel: 'yellow',
    })
    expect(zero.depositRequired).toBe(false)
    expect(zero.depositAmountCents).toBe(0)
  })

  it('clamps out-of-range percentages and rounds cents consistently', () => {
    const b = { ...defaultBusiness, deposit_mode: 'everyone', deposit_percent: 150 } as BusinessRow
    const res = calculateRequiredDeposit({
      businessPolicy: b,
      servicePriceCents: 1999,
      userReliabilityScore: 20,
      userRiskLevel: 'red',
    })
    expect(res.depositPercent).toBe(100)
    expect(res.depositAmountCents).toBe(1999)
  })

  it('keeps non-punitive copy and supports cancellation policy override', () => {
    const b = { ...defaultBusiness, deposit_mode: 'everyone', deposit_percent: 10 } as BusinessRow
    const res = calculateRequiredDeposit({
      businessPolicy: b,
      servicePriceCents: 10000,
      userReliabilityScore: 55,
      userRiskLevel: 'yellow',
      bookingTime: '2026-06-01T10:00:00+02:00',
      cancellationPolicy: {
        cancellationFreeUntilHoursBefore: 48,
        refundPolicy: 'strict',
      },
    })
    expect(res.refundRule).toBe('strict')
    expect(res.customerMessage.toLowerCase()).toContain('garanzia prenotazione')
    expect(res.customerMessage.toLowerCase()).not.toContain('punizione')
    expect(res.customerMessage).toContain('48 ore')
  })

  it('forces manual approval for red users when policy requires it', () => {
    const b = {
      ...defaultBusiness,
      deposit_mode: 'dynamic',
      manual_approval_for_high_risk: true,
      deposit_red_rule: { type: 'percentage', value: 30 },
    } as BusinessRow
    const res = calculateRequiredDeposit({
      businessPolicy: b,
      servicePriceCents: 12000,
      userReliabilityScore: 30,
      userRiskLevel: 'red',
    })
    expect(res.depositRequired).toBe(true)
    expect(res.requiresManualApproval).toBe(true)
    expect(res.reason).toContain('dynamic_red')
  })
})