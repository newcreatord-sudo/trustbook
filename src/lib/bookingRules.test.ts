import { describe, expect, test } from 'vitest'
import type { DepositCalculationResult } from '@/domain/depositEngine'
import { computeDepositCents, depositStatusForAmount, statusAfterBusinessAccept, withCustomerNoDepositWaive } from './bookingRules'
import type { BusinessRow, ServiceRow } from '@/domain/supabase'

describe('Booking Rules & Deposit Logic', () => {
  const baseBusiness = {
    id: 'b1',
    owner_user_id: 'u1',
    name: 'Test Business',
    category: 'parrucchiere',
    is_paused: false,
    deposit_enabled: true,
    deposit_rule: 'risky_only',
    deposit_risky_threshold: 60,
    deposit_fixed_cents: null,
    deposit_percent: 20,
    deposit_min_cents: null,
    deposit_max_cents: null,
    approval_mode: 'auto',
    required_reliability_min: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  } as unknown as BusinessRow

  const baseService = {
    id: 's1',
    business_id: 'b1',
    name: 'Taglio',
    duration_min: 30,
    price_cents: 5000, // 50.00€
    created_at: new Date().toISOString(),
  } as unknown as ServiceRow

  describe('computeDepositCents', () => {
    test('ritorna 0 se il deposito è disabilitato', () => {
      const b = { ...baseBusiness, deposit_enabled: false }
      expect(computeDepositCents({ business: b, customerScore: 50, service: baseService })).toBe(0)
    })

    test('ritorna 0 se la regola è "off"', () => {
      const b = { ...baseBusiness, deposit_rule: 'off' as const }
      expect(computeDepositCents({ business: b, customerScore: 50, service: baseService })).toBe(0)
    })

    test('applica caparra a clienti rischiosi se regola è "risky_only"', () => {
      const b = { ...baseBusiness, deposit_rule: 'risky_only' as const, deposit_risky_threshold: 70 }
      // Score 60 < 70 -> Rischioso -> 20% di 50.00 = 10.00
      expect(computeDepositCents({ business: b, customerScore: 60, service: baseService })).toBe(1000)
      
      // Score 80 >= 70 -> Affidabile -> Nessuna caparra
      expect(computeDepositCents({ business: b, customerScore: 80, service: baseService })).toBe(0)
    })

    test('applica caparra a tutti se regola è "all"', () => {
      const b = { ...baseBusiness, deposit_rule: 'all' as const }
      expect(computeDepositCents({ business: b, customerScore: 90, service: baseService })).toBe(1000)
    })

    test('calcola correttamente caparra fissa', () => {
      const b = { ...baseBusiness, deposit_rule: 'all' as const, deposit_fixed_cents: 1500, deposit_percent: null }
      expect(computeDepositCents({ business: b, customerScore: 90, service: baseService })).toBe(1500)
    })

    test('applica min e max alla caparra percentuale', () => {
      const b = { 
        ...baseBusiness, 
        deposit_rule: 'all' as const, 
        deposit_percent: 50, // 50% di 50.00 = 25.00
        deposit_min_cents: 3000, // Forza minimo a 30.00
        deposit_max_cents: 5000
      }
      expect(computeDepositCents({ business: b, customerScore: 90, service: baseService })).toBe(3000)

      const bMax = { 
        ...baseBusiness, 
        deposit_rule: 'all' as const, 
        deposit_percent: 50, // 50% di 50.00 = 25.00
        deposit_max_cents: 1000 // Forza massimo a 10.00
      }
      expect(computeDepositCents({ business: bMax, customerScore: 90, service: baseService })).toBe(1000)
    })

    test('non inventa caparra percentuale se il servizio non ha prezzo', () => {
      const b = {
        ...baseBusiness,
        deposit_rule: 'all' as const,
        deposit_percent: 30,
        deposit_min_cents: 500,
      }
      const noPriceService = { ...baseService, price_cents: null }
      expect(computeDepositCents({ business: b, customerScore: 20, service: noPriceService })).toBe(0)
    })

    test('usa score di default prudente quando customerScore è null', () => {
      const b = { ...baseBusiness, deposit_rule: 'risky_only' as const, deposit_risky_threshold: 70 }
      // Score di fallback = 80 => non rischioso
      expect(computeDepositCents({ business: b, customerScore: null, service: baseService })).toBe(0)
    })
  })

  describe('withCustomerNoDepositWaive', () => {
    test('azzera caparra quando waive è true', () => {
      const base: DepositCalculationResult = {
        depositRequired: true,
        depositAmountCents: 2500,
        depositAmount: 2500,
        depositPercent: 50,
        reason: 'test',
        requiresManualApproval: false,
        refundRule: null,
        customerMessage: 'vecchio',
        ownerMessage: 'owner',
      }
      const out = withCustomerNoDepositWaive(base, true)
      expect(out.depositRequired).toBe(false)
      expect(out.depositAmountCents).toBe(0)
      expect(out.reason).toBe('customer_subscription_no_deposit')
      expect(out.customerMessage).toContain('esenzione caparra')
    })

    test('non modifica quando waive è false', () => {
      const base: DepositCalculationResult = {
        depositRequired: true,
        depositAmountCents: 100,
        depositAmount: 100,
        depositPercent: 10,
        reason: 'x',
        requiresManualApproval: true,
        refundRule: null,
        customerMessage: 'msg',
        ownerMessage: 'o',
      }
      expect(withCustomerNoDepositWaive(base, false)).toEqual(base)
    })
  })

  describe('depositStatusForAmount', () => {
    test('richiede deposito se amount > 0', () => {
      expect(depositStatusForAmount(1000)).toBe('required')
    })
    test('non richiede deposito se amount è 0', () => {
      expect(depositStatusForAmount(0)).toBe('not_required')
    })
  })

  describe('statusAfterBusinessAccept', () => {
    test('stato requires_deposit se c è caparra', () => {
      expect(statusAfterBusinessAccept({ depositCents: 1000 })).toBe('requires_deposit')
    })
    test('stato pending_payment_setup se setup pagamento non pronto', () => {
      expect(statusAfterBusinessAccept({ depositCents: 1000, paymentSetupReady: false })).toBe('pending_payment_setup')
    })
    test('stato pending_approval se richiede approvazione manuale', () => {
      expect(statusAfterBusinessAccept({ depositCents: 1000, requiresManualApproval: true })).toBe('pending_approval')
    })
    test('stato confirmed se non c è caparra', () => {
      expect(statusAfterBusinessAccept({ depositCents: 0 })).toBe('confirmed')
    })
  })
})