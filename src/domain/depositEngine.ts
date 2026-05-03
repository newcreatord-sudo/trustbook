import type { BusinessRow } from '@/domain/supabase'

export type UserRiskLevel = 'green' | 'yellow' | 'red' | 'unknown'

export interface DepositCalculationParams {
  businessPolicy: BusinessRow
  servicePriceCents: number
  userReliabilityScore: number | null
  userRiskLevel: UserRiskLevel
  bookingTime?: string | Date
  cancellationPolicy?: {
    cancellationFreeUntilHoursBefore?: number
    refundPolicy?: string
  }
}

export interface DepositCalculationResult {
  depositRequired: boolean
  depositAmount: number
  depositAmountCents: number
  depositPercent: number
  reason: string
  requiresManualApproval: boolean
  refundRule: string
  customerMessage: string
  ownerMessage: string
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function positiveCents(value: number | null | undefined): number {
  return Math.max(0, Math.floor(value ?? 0))
}

function parseRule(rule: BusinessRow['deposit_green_rule'] | null | undefined): { type: 'percentage' | 'fixed_amount'; value: number } {
  if (!rule || typeof rule !== 'object') return { type: 'percentage', value: 0 }
  const typeRaw = (rule as { type?: unknown }).type
  const valueRaw = (rule as { value?: unknown }).value
  const type = typeRaw === 'fixed_amount' ? 'fixed_amount' : 'percentage'
  const value = typeof valueRaw === 'number' && Number.isFinite(valueRaw) ? valueRaw : 0
  return { type, value }
}

export function calculateRequiredDeposit({
  businessPolicy,
  servicePriceCents,
  userReliabilityScore,
  userRiskLevel,
  bookingTime,
  cancellationPolicy,
}: DepositCalculationParams): DepositCalculationResult {
  const p = businessPolicy
  const price = positiveCents(servicePriceCents)
  const score = clampInt(userReliabilityScore ?? 80, 0, 100)
  const bookingDate = bookingTime ? new Date(bookingTime) : new Date()
  void bookingDate
  const refundRule = cancellationPolicy?.refundPolicy ?? p.refund_policy
  const cancellationHours = clampInt(
    cancellationPolicy?.cancellationFreeUntilHoursBefore ?? p.cancellation_free_until_hours ?? 24,
    0,
    168,
  )

  // Base fallback result
  const baseResult: DepositCalculationResult = {
    depositRequired: false,
    depositAmount: 0,
    depositAmountCents: 0,
    depositPercent: 0,
    reason: 'deposit_none',
    requiresManualApproval: false,
    refundRule,
    customerMessage: 'Protezione agenda non richiesta: puoi completare la prenotazione senza caparra.',
    ownerMessage: 'Nessuna caparra richiesta su questo slot.',
  }

  const mode = p.deposit_mode ?? (p.deposit_enabled ? (p.deposit_rule === 'all' ? 'everyone' : p.deposit_rule === 'risky_only' ? 'risk_based' : 'none') : 'none')
  if (mode === 'none') {
    return baseResult
  }

  // 2. Determine applicable rule
  let ruleToApply: { type: 'percentage' | 'fixed_amount'; value: number } | null = null
  let reason = 'deposit_none'
  let manualApproval = false

  const inferredType: 'percentage' | 'fixed_amount' = (() => {
    if (p.deposit_value_type === 'fixed_amount' || p.deposit_value_type === 'percentage') return p.deposit_value_type
    if ((p.deposit_fixed_cents ?? null) !== null && (p.deposit_percent ?? 0) <= 0) return 'fixed_amount'
    return 'percentage'
  })()
  const defaultRule: { type: 'percentage' | 'fixed_amount'; value: number } = {
    type: inferredType,
    value: inferredType === 'fixed_amount' ? positiveCents(p.deposit_fixed_cents) : clampInt(p.deposit_percent ?? 0, 0, 100),
  }

  if (mode === 'everyone') {
    ruleToApply = defaultRule
    reason = 'deposit_everyone'
  } else if (mode === 'risk_based') {
    const threshold = clampInt(p.deposit_risky_threshold ?? 60, 0, 100)
    const riskyByScore = score < threshold
    const riskyByLevel = userRiskLevel === 'yellow' || userRiskLevel === 'red' || userRiskLevel === 'unknown'
    if (riskyByScore || riskyByLevel) {
      ruleToApply = defaultRule
      reason = `deposit_risk_based_${userRiskLevel}`
    } else {
      return {
        ...baseResult,
        reason: 'deposit_risk_based_green',
        customerMessage: 'Garanzia prenotazione non richiesta: profilo affidabile con protezione agenda già sufficiente.',
        ownerMessage: 'Cliente green: nessuna caparra applicata in modalità risk_based.',
      }
    }
  } else if (mode === 'dynamic') {
    if (userRiskLevel === 'green') {
      ruleToApply = parseRule(p.deposit_green_rule)
      reason = 'deposit_dynamic_green'
    } else if (userRiskLevel === 'yellow') {
      ruleToApply = parseRule(p.deposit_yellow_rule)
      reason = 'deposit_dynamic_yellow'
    } else if (userRiskLevel === 'red' || userRiskLevel === 'unknown') {
      ruleToApply = parseRule(p.deposit_red_rule)
      reason = userRiskLevel === 'red' ? 'deposit_dynamic_red' : 'deposit_dynamic_unknown'
      manualApproval = p.manual_approval_for_high_risk
    }
  }

  if (!ruleToApply || ruleToApply.value === 0) {
    return {
      ...baseResult,
      requiresManualApproval: manualApproval,
      reason: manualApproval ? 'deposit_manual_approval_only' : baseResult.reason,
      customerMessage: manualApproval
        ? 'Per tutela del tempo dell’attività, la prenotazione richiede approvazione manuale.'
        : baseResult.customerMessage,
      ownerMessage: manualApproval
        ? 'Utente ad alto rischio: approvazione manuale richiesta, caparra non impostata.'
        : baseResult.ownerMessage,
    }
  }

  // 3. Calculate amount
  let amountCents = 0
  let percent = 0

  if (ruleToApply.type === 'percentage') {
    percent = clampInt(ruleToApply.value, 0, 100)
    amountCents = Math.round((price * percent) / 100)
  } else {
    amountCents = positiveCents(ruleToApply.value)
    percent = price > 0 ? Math.round((amountCents / price) * 100) : 0
  }

  // 4. Apply min/max limits
  const shouldApplyBounds = ruleToApply.type === 'fixed_amount' || amountCents > 0
  if (shouldApplyBounds && p.deposit_min_cents && amountCents < p.deposit_min_cents) {
    amountCents = p.deposit_min_cents
  }
  if (shouldApplyBounds && p.deposit_max_cents && amountCents > p.deposit_max_cents) {
    amountCents = p.deposit_max_cents
  }

  // Cannot exceed total price when price is known and > 0.
  if (price > 0 && amountCents > price) {
    amountCents = price
  }

  if (amountCents <= 0) {
    return {
      ...baseResult,
      requiresManualApproval: manualApproval,
      reason: manualApproval ? 'deposit_manual_approval_only' : baseResult.reason,
      customerMessage: manualApproval
        ? 'Per tutela del tempo dell’attività, la prenotazione richiede approvazione manuale.'
        : baseResult.customerMessage,
      ownerMessage: manualApproval
        ? 'Utente ad alto rischio: approvazione manuale richiesta, caparra non impostata.'
        : baseResult.ownerMessage,
    }
  }

  const amountEur = (amountCents / 100).toFixed(2).replace('.', ',')
  return {
    depositRequired: true,
    depositAmount: amountCents,
    depositAmountCents: amountCents,
    depositPercent: percent,
    reason,
    requiresManualApproval: manualApproval,
    refundRule,
    customerMessage: `Garanzia prenotazione ${amountEur} EUR: protezione agenda attiva per ridurre no-show e tutelare il tempo dell’attività. Cancellazione gratuita fino a ${cancellationHours} ore prima.`,
    ownerMessage: `Caparra ${amountEur} EUR applicata (${reason}) per protezione agenda. Finestra cancellazione libera: ${cancellationHours}h.`,
  }
}
