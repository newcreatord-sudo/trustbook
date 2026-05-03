import type {
  SubscriptionPlanRow,
  BusinessSubscriptionRow,
  CustomerSubscriptionRow,
  BillingInterval,
  SubscriptionStatus,
} from '@/domain/supabase'
import { supabase } from '@/lib/supabase'

export interface BusinessFeatureGate {
  maxStaff: number
  maxServices: number
  antiNoShowEnabled: boolean
  /** Suite KPI/policy no-show estesa (legata ad anti-no-show nel piano). */
  noShowSuite: boolean
  /** Tavoli/sale/postazioni (schema risorse + assegnazioni). */
  resourceManagement: boolean
  customDepositsEnabled: boolean
  prioritySupport: boolean
}

export interface CustomerFeatureGate {
  noDepositRequired: boolean
  priorityBooking: boolean
  advancedReminders: boolean
  perks: boolean
  reputationBoost: boolean
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function asBoolean(v: unknown): boolean {
  return v === true
}

function asBillingInterval(v: unknown): BillingInterval | null {
  return v === 'monthly' || v === 'yearly' || v === 'lifetime' ? v : null
}

function asSubscriptionStatus(v: unknown): SubscriptionStatus | null {
  return v === 'active' || v === 'past_due' || v === 'canceled' || v === 'trialing' ? v : null
}

function parseSubscriptionPlanRow(v: unknown): SubscriptionPlanRow | null {
  const r = asRecord(v)
  if (!r) return null
  const id = typeof r.id === 'string' ? r.id : null
  const target_audience = r.target_audience === 'business' || r.target_audience === 'customer' ? r.target_audience : null
  const name = typeof r.name === 'string' ? r.name : null
  const price_cents = asNumber(r.price_cents)
  const billing_interval = asBillingInterval(r.billing_interval)
  if (!id || !target_audience || !name || price_cents === null || !billing_interval) return null
  return {
    id,
    target_audience,
    name,
    description: typeof r.description === 'string' ? r.description : null,
    price_cents,
    billing_interval,
    features: asRecord(r.features) ?? {},
    is_active: r.is_active !== false,
    created_at: typeof r.created_at === 'string' ? r.created_at : new Date(0).toISOString(),
    stripe_product_id: typeof r.stripe_product_id === 'string' ? r.stripe_product_id : null,
    stripe_price_id: typeof r.stripe_price_id === 'string' ? r.stripe_price_id : null,
    mollie_sku: typeof r.mollie_sku === 'string' ? r.mollie_sku : null,
  }
}

function parseBusinessSubscriptionRow(v: unknown): BusinessSubscriptionRow | null {
  const r = asRecord(v)
  if (!r) return null
  const id = typeof r.id === 'string' ? r.id : null
  const business_id = typeof r.business_id === 'string' ? r.business_id : null
  const plan_id = typeof r.plan_id === 'string' ? r.plan_id : null
  const status = asSubscriptionStatus(r.status)
  if (!id || !business_id || !plan_id || !status) return null
  return {
    id,
    business_id,
    plan_id,
    status,
    current_period_end: typeof r.current_period_end === 'string' ? r.current_period_end : null,
    cancel_at_period_end: asBoolean(r.cancel_at_period_end),
    stripe_customer_id: typeof r.stripe_customer_id === 'string' ? r.stripe_customer_id : null,
    stripe_subscription_id: typeof r.stripe_subscription_id === 'string' ? r.stripe_subscription_id : null,
    created_at: typeof r.created_at === 'string' ? r.created_at : new Date(0).toISOString(),
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : new Date(0).toISOString(),
  }
}

function parseCustomerSubscriptionRow(v: unknown): CustomerSubscriptionRow | null {
  const r = asRecord(v)
  if (!r) return null
  const id = typeof r.id === 'string' ? r.id : null
  const customer_id = typeof r.customer_id === 'string' ? r.customer_id : null
  const plan_id = typeof r.plan_id === 'string' ? r.plan_id : null
  const status = asSubscriptionStatus(r.status)
  if (!id || !customer_id || !plan_id || !status) return null
  return {
    id,
    customer_id,
    plan_id,
    status,
    current_period_end: typeof r.current_period_end === 'string' ? r.current_period_end : null,
    cancel_at_period_end: asBoolean(r.cancel_at_period_end),
    stripe_customer_id: typeof r.stripe_customer_id === 'string' ? r.stripe_customer_id : null,
    stripe_subscription_id: typeof r.stripe_subscription_id === 'string' ? r.stripe_subscription_id : null,
    created_at: typeof r.created_at === 'string' ? r.created_at : new Date(0).toISOString(),
    updated_at: typeof r.updated_at === 'string' ? r.updated_at : new Date(0).toISOString(),
  }
}

/**
 * Limiti piano business quando il JSON `features` è vuoto o incompleto (fail-safe monetizzazione).
 * Allinea a `business_free` (migrazione 0088): non concedere mai capacità “unlimited” per omissione.
 */
export const BUSINESS_FEATURE_DEFAULTS_FREE: BusinessFeatureGate = {
  maxStaff: 1,
  maxServices: 10,
  antiNoShowEnabled: true,
  noShowSuite: false,
  resourceManagement: true,
  customDepositsEnabled: false,
  prioritySupport: false,
}

/**
 * Parses the JSONB features field from a SubscriptionPlanRow
 * into a strongly typed BusinessFeatureGate object.
 */
export function parseBusinessFeatures(features: Record<string, unknown> | null): BusinessFeatureGate {
  const f = features ?? {}
  const base = BUSINESS_FEATURE_DEFAULTS_FREE

  const antiNoShowEnabled = f.anti_noshow !== false

  const maxStaffRaw = f.max_staff
  const maxStaff =
    typeof maxStaffRaw === 'number' && Number.isFinite(maxStaffRaw)
      ? Math.max(1, Math.floor(maxStaffRaw))
      : base.maxStaff

  const maxServicesRaw = f.max_services
  const maxServices =
    typeof maxServicesRaw === 'number' && Number.isFinite(maxServicesRaw)
      ? Math.max(1, Math.floor(maxServicesRaw))
      : base.maxServices

  return {
    maxStaff,
    maxServices,
    antiNoShowEnabled,
    noShowSuite: antiNoShowEnabled && f.no_show_suite === true,
    resourceManagement: typeof f.resource_management === 'boolean' ? f.resource_management : true,
    customDepositsEnabled: f.custom_deposits === true,
    prioritySupport: f.priority_support === true,
  }
}

/**
 * Parses the JSONB features field from a SubscriptionPlanRow
 * into a strongly typed CustomerFeatureGate object.
 */
export function parseCustomerFeatures(features: Record<string, unknown> | null): CustomerFeatureGate {
  const f = features ?? {}
  return {
    noDepositRequired: f.no_deposit_required === true,
    priorityBooking: f.priority_booking === true,
    advancedReminders: f.advanced_reminders === true,
    perks: f.perks === true,
    reputationBoost: f.reputation_boost === true,
  }
}

/**
 * Abstract helper to check if a business can add more staff members based on their plan.
 */
export function canAddStaff(currentStaffCount: number, gate: BusinessFeatureGate): boolean {
  return currentStaffCount < gate.maxStaff
}

/**
 * Abstract helper to check if a business can add more services based on their plan.
 */
export function canAddService(currentServiceCount: number, gate: BusinessFeatureGate): boolean {
  return currentServiceCount < gate.maxServices
}

/**
 * Future helper: Connect this to the Booking engine to bypass deposit requirements 
 * if the customer has VIP plan active.
 */
export function isDepositBypassedForCustomer(gate: CustomerFeatureGate): boolean {
  return gate.noDepositRequired
}

export async function fetchSubscriptionPlans(target: 'business' | 'customer'): Promise<SubscriptionPlanRow[]> {
  const { data, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .eq('target_audience', target)
    .eq('is_active', true)
    .order('price_cents', { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown[]).map(parseSubscriptionPlanRow).filter((x): x is SubscriptionPlanRow => Boolean(x))
}

export async function fetchBusinessSubscription(businessId: string): Promise<BusinessSubscriptionRow | null> {
  const { data, error } = await supabase
    .from('business_subscriptions')
    .select('*')
    .eq('business_id', businessId)
    .maybeSingle()
  if (error) throw error
  return parseBusinessSubscriptionRow(data)
}

export async function fetchCustomerSubscription(customerId: string): Promise<CustomerSubscriptionRow | null> {
  const { data, error } = await supabase
    .from('customer_subscriptions')
    .select('*')
    .eq('customer_id', customerId)
    .maybeSingle()
  if (error) throw error
  return parseCustomerSubscriptionRow(data)
}

export function formatPlanPrice(priceCents: number, interval: BillingInterval): string {
  if (priceCents <= 0) return 'Gratis'
  const eur = (priceCents / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })
  if (interval === 'monthly') return `${eur} / mese`
  if (interval === 'yearly') return `${eur} / anno`
  return `${eur} una tantum`
}
