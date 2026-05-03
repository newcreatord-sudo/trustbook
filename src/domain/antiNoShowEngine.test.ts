import { describe, expect, it } from 'vitest'
import {
  calculateReliabilityScore,
  customerRiskPresentation,
  getRiskLevel,
  ownerRiskPresentation,
  shouldAutoApproveBooking,
  shouldRequireManualApproval,
  shouldSuggestDeposit,
  suggestSaferSlotForRiskyCustomer,
} from './antiNoShowEngine'

describe('antiNoShowEngine', () => {
  it('calculateReliabilityScore clamps correctly', () => {
    expect(calculateReliabilityScore(80)).toBe(80)
    expect(calculateReliabilityScore(120)).toBe(100)
    expect(calculateReliabilityScore(-10)).toBe(0)
  })

  it('calculateReliabilityScore applies star boosts', () => {
    expect(calculateReliabilityScore(80, { stars: 1 })).toBe(83)
    expect(calculateReliabilityScore(80, { stars: 2 })).toBe(86)
    expect(calculateReliabilityScore(80, { stars: 5 })).toBe(90)
  })

  it('calculateReliabilityScore applies penalties', () => {
    // 1 late cancel = -4
    expect(calculateReliabilityScore(80, { lateCancelCount: 1 })).toBe(76)
    // 1 no show = -12
    expect(calculateReliabilityScore(80, { noShowCount: 1 })).toBe(68)
    // both
    expect(calculateReliabilityScore(80, { noShowCount: 1, lateCancelCount: 1 })).toBe(64)
  })

  it('ownerRiskPresentation uses professional Italian labels', () => {
    expect(ownerRiskPresentation('green')).toEqual({ labelIt: 'Nella norma', badgeTone: 'success' })
    expect(ownerRiskPresentation('yellow')).toEqual({ labelIt: 'Moderato', badgeTone: 'warning' })
    expect(ownerRiskPresentation('red')).toEqual({ labelIt: 'Elevato', badgeTone: 'danger' })
  })

  it('customerRiskPresentation uses neutral Italian labels', () => {
    expect(customerRiskPresentation('green')).toEqual({ labelIt: 'Nella norma', badgeTone: 'success' })
    expect(customerRiskPresentation('yellow')).toEqual({ labelIt: 'In evoluzione', badgeTone: 'warning' })
    expect(customerRiskPresentation('red')).toEqual({ labelIt: 'Da migliorare', badgeTone: 'danger' })
  })

  it('getRiskLevel maps scores to green/yellow/red', () => {
    expect(getRiskLevel(100)).toBe('green')
    expect(getRiskLevel(80)).toBe('green')
    expect(getRiskLevel(79)).toBe('yellow')
    expect(getRiskLevel(50)).toBe('yellow')
    expect(getRiskLevel(49)).toBe('red')
    expect(getRiskLevel(0)).toBe('red')
  })

  it('shouldAutoApproveBooking logic', () => {
    expect(shouldAutoApproveBooking('green', true)).toBe(true)
    expect(shouldAutoApproveBooking('yellow', true)).toBe(true)
    expect(shouldAutoApproveBooking('red', true)).toBe(false)
    expect(shouldAutoApproveBooking('red', false)).toBe(true)
  })

  it('shouldRequireManualApproval is inverse of auto approve', () => {
    expect(shouldRequireManualApproval('red', true)).toBe(true)
    expect(shouldRequireManualApproval('yellow', true)).toBe(false)
  })

  it('shouldSuggestDeposit logic', () => {
    expect(shouldSuggestDeposit('green', 'none')).toBe(false)
    expect(shouldSuggestDeposit('red', 'none')).toBe(false)
    
    expect(shouldSuggestDeposit('green', 'everyone')).toBe(true)
    expect(shouldSuggestDeposit('red', 'everyone')).toBe(true)

    expect(shouldSuggestDeposit('green', 'risk_based')).toBe(false)
    expect(shouldSuggestDeposit('yellow', 'risk_based')).toBe(true)
    expect(shouldSuggestDeposit('red', 'risk_based')).toBe(true)

    expect(shouldSuggestDeposit('green', 'dynamic')).toBe(false)
    expect(shouldSuggestDeposit('yellow', 'dynamic')).toBe(true)
  })

  it('suggestSaferSlotForRiskyCustomer sorts non-peak hours first for red users', () => {
    const slots = [
      { start: '10:00', isPeakHour: true },
      { start: '14:00', isPeakHour: false },
      { start: '18:00', isPeakHour: true },
    ]

    const greenSlots = suggestSaferSlotForRiskyCustomer('green', slots)
    expect(greenSlots[0].start).toBe('10:00') // untouched

    const redSlots = suggestSaferSlotForRiskyCustomer('red', slots)
    expect(redSlots[0].start).toBe('14:00') // non-peak moved to top
    expect(redSlots[1].start).toBe('10:00')
  })
})
