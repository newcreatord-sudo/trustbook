import type { BookingRow, BusinessRow, DepositStatus, ServiceRow } from '@/domain/supabase'
import { calculateRequiredDeposit, type DepositCalculationResult, type UserRiskLevel } from '@/domain/depositEngine'
import { getRiskLevel } from '@/domain/antiNoShowEngine'

export function computeDepositCents(params: {
  business: BusinessRow
  customerScore: number | null
  service?: ServiceRow | null
}): number {
  const { business, customerScore, service } = params
  const score = customerScore ?? 80
  const riskLevel: UserRiskLevel = getRiskLevel(score)

  const result = calculateRequiredDeposit({
    businessPolicy: business,
    servicePriceCents: service?.price_cents ?? 0,
    userReliabilityScore: score,
    userRiskLevel: riskLevel,
  })

  return Math.max(0, result.depositAmountCents)
}

export function depositStatusForAmount(amountCents: number): DepositStatus {
  return amountCents > 0 ? 'required' : 'not_required'
}

/** Allinea UI al waiver server-side per piani cliente con `no_deposit_required` (es. TrustBook VIP attivo). */
export function withCustomerNoDepositWaive(result: DepositCalculationResult, waive: boolean): DepositCalculationResult {
  if (!waive) return result
  return {
    ...result,
    depositRequired: false,
    depositAmountCents: 0,
    depositAmount: 0,
    depositPercent: 0,
    reason: 'customer_subscription_no_deposit',
    customerMessage:
      'Piano cliente con esenzione caparra attivo: nessun anticipo richiesto per questa prenotazione (restano valide approvazioni manuali dell’attività se previste).',
  }
}

export function statusAfterBusinessAccept(params: {
  depositCents: number
  requiresManualApproval?: boolean
  paymentSetupReady?: boolean
}): BookingRow['status'] {
  if (params.requiresManualApproval) return 'pending_approval'
  if (params.depositCents <= 0) return 'confirmed'
  return params.paymentSetupReady === false ? 'pending_payment_setup' : 'requires_deposit'
}
