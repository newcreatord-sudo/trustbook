import { supabase } from '@/lib/supabase'

export type BusinessPlanId = 'business_free' | 'business_pro' | 'business_ultra' | 'business_elite'
export type CustomerPlanId = 'customer_free' | 'customer_plus' | 'customer_vip'

export type PlanFeatureKey =
  | 'advanced_agenda'
  | 'stats'
  | 'dynamic_deposit'
  | 'advanced_notifications'
  | 'ai_suggestions'
  | 'advanced_automations'
  | 'multi_location'
  | 'discovery_priority'
  | 'advanced_reports'
  | 'priority_booking'
  | 'advanced_reminders'
  | 'perks'
  | 'reputation_boost'
  | 'no_deposit_required'

export type PlatformFeePolicy = {
  percentMin: number
  percentMax: number
  percentDefault: number
  fixedCents: number
  source: 'override' | 'plan' | 'global' | 'fallback'
}

export type CommissionPreview = {
  amountCents: number
  platformFeeCents: number
  netCents: number
  effectivePercent: number
}

export const planFeatures: Record<string, Record<string, unknown>> = {
  business_free: {
    max_staff: 1,
    max_services: 10,
    anti_noshow: true,
    no_show_suite: false,
    custom_deposits: false,
    resource_management: true,
    platform_fee_percent_min: 3.0,
    platform_fee_percent_max: 4.0,
    platform_fee_percent_default: 4.0,
    platform_fee_fixed_cents: 0,
  },
  business_pro: {
    max_staff: 10,
    max_services: 50,
    anti_noshow: true,
    no_show_suite: true,
    custom_deposits: true,
    resource_management: true,
    advanced_agenda: true,
    stats: true,
    dynamic_deposit: true,
    advanced_notifications: true,
    platform_fee_percent_min: 1.5,
    platform_fee_percent_max: 2.0,
    platform_fee_percent_default: 2.0,
    platform_fee_fixed_cents: 0,
  },
  business_ultra: {
    max_staff: 999,
    max_services: 999,
    anti_noshow: true,
    no_show_suite: true,
    custom_deposits: true,
    resource_management: true,
    advanced_agenda: true,
    stats: true,
    dynamic_deposit: true,
    advanced_notifications: true,
    ai_suggestions: true,
    advanced_automations: true,
    multi_location: true,
    discovery_priority: true,
    advanced_reports: true,
    platform_fee_percent_min: 0.5,
    platform_fee_percent_max: 1.0,
    platform_fee_percent_default: 1.0,
    platform_fee_fixed_cents: 0,
  },
  customer_free: {
    priority_booking: false,
    no_deposit_required: false,
    advanced_reminders: false,
    perks: false,
    reputation_boost: false,
  },
  customer_plus: {
    priority_booking: true,
    no_deposit_required: false,
    advanced_reminders: true,
    perks: true,
    reputation_boost: true,
  },
}

export function subscriptionPlan(planId: string | null | undefined, dbFeatures?: Record<string, unknown> | null) {
  const id = typeof planId === 'string' ? planId : null
  const fallback = (id && planFeatures[id]) ? planFeatures[id] : {}
  const merged = { ...fallback, ...(dbFeatures ?? {}) }
  return { id, features: merged }
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function asBoolean(v: unknown): boolean | null {
  return v === true ? true : v === false ? false : null
}

export function featureGate(
  features: Record<string, unknown> | null | undefined,
  key: PlanFeatureKey,
  opts?: { enforce?: boolean },
): boolean {
  const enforce = opts?.enforce === true
  const f = features ?? {}
  const raw = asRecord(f)?.[key]
  const v = asBoolean(raw) ?? false
  if (!enforce) return true
  return v
}

export function platformFeePolicy(features: Record<string, unknown> | null | undefined): PlatformFeePolicy {
  const f = features ?? {}
  const min = asNumber(asRecord(f)?.platform_fee_percent_min) ?? null
  const max = asNumber(asRecord(f)?.platform_fee_percent_max) ?? null
  const def = asNumber(asRecord(f)?.platform_fee_percent_default) ?? null
  const fixed = asNumber(asRecord(f)?.platform_fee_fixed_cents) ?? 0

  if (min !== null && max !== null && def !== null) {
    const percentMin = Math.max(0, min)
    const percentMax = Math.max(percentMin, max)
    const percentDefault = Math.min(percentMax, Math.max(percentMin, def))
    return { percentMin, percentMax, percentDefault, fixedCents: Math.max(0, Math.floor(fixed)), source: 'plan' }
  }

  return { percentMin: 0, percentMax: 0, percentDefault: 0, fixedCents: 0, source: 'fallback' }
}

export function commissionPreview(amountCents: number, policy: PlatformFeePolicy): CommissionPreview {
  const amt = Math.max(0, Math.floor(amountCents))
  const pct = Math.max(0, policy.percentDefault)
  const pctFee = Math.floor((amt * pct) / 100)
  const platformFeeCents = Math.max(0, pctFee + Math.max(0, Math.floor(policy.fixedCents)))
  const netCents = Math.max(0, amt - platformFeeCents)
  const effectivePercent = amt > 0 ? (platformFeeCents / amt) * 100 : 0
  return { amountCents: amt, platformFeeCents, netCents, effectivePercent }
}

export async function fetchEffectivePlatformFeePolicy(businessId: string): Promise<PlatformFeePolicy | null> {
  const { data, error } = await supabase.rpc('get_effective_platform_fee_policy', { p_business_id: businessId })
  if (error) throw error
  const r = asRecord(data)
  if (!r) return null
  const percentMin = asNumber(r.percent_min) ?? 0
  const percentMax = asNumber(r.percent_max) ?? percentMin
  const percentDefault = asNumber(r.percent_default) ?? percentMax
  const fixedCents = asNumber(r.fixed_cents) ?? 0
  const source = r.source === 'override' || r.source === 'plan' || r.source === 'global' ? r.source : 'fallback'
  return {
    percentMin: Math.max(0, percentMin),
    percentMax: Math.max(0, percentMax),
    percentDefault: Math.max(0, percentDefault),
    fixedCents: Math.max(0, Math.floor(fixedCents)),
    source,
  }
}
