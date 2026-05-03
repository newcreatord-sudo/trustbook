import type Stripe from 'stripe'
import type { SupabaseClient } from '@supabase/supabase-js'

export type TrustBookSubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing'

export function mapStripeSubscriptionToTrustBookStatus(status: Stripe.Subscription.Status): TrustBookSubscriptionStatus {
  switch (status) {
    case 'active':
      return 'active'
    case 'trialing':
      return 'trialing'
    case 'past_due':
      return 'past_due'
    case 'canceled':
      return 'canceled'
    case 'unpaid':
      return 'past_due'
    case 'incomplete':
      return 'trialing'
    case 'incomplete_expired':
      return 'canceled'
    case 'paused':
      return 'active'
    default:
      return 'active'
  }
}

function subscriptionPeriodEndIso(sub: Stripe.Subscription): string | null {
  const raw = (sub as unknown as { current_period_end?: unknown }).current_period_end
  return typeof raw === 'number' ? new Date(raw * 1000).toISOString() : null
}

async function validateBusinessPlan(sbAdmin: SupabaseClient, planId: string): Promise<boolean> {
  const { data, error } = await sbAdmin
    .from('subscription_plans')
    .select('id,target_audience,is_active')
    .eq('id', planId)
    .maybeSingle()
  if (error) throw error
  const row = data as { target_audience?: string; is_active?: boolean } | null
  return Boolean(row?.is_active !== false && row?.target_audience === 'business')
}

async function validateCustomerPlan(sbAdmin: SupabaseClient, planId: string): Promise<boolean> {
  const { data, error } = await sbAdmin
    .from('subscription_plans')
    .select('id,target_audience,is_active')
    .eq('id', planId)
    .maybeSingle()
  if (error) throw error
  const row = data as { target_audience?: string; is_active?: boolean } | null
  return Boolean(row?.is_active !== false && row?.target_audience === 'customer')
}

function subscriptionEnded(sub: Stripe.Subscription, deleted?: boolean): boolean {
  return (
    deleted ||
    sub.status === 'canceled' ||
    sub.status === 'incomplete_expired'
  )
}

async function resolveStripeSubscription(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<Stripe.Subscription> {
  const ref = session.subscription
  if (typeof ref === 'object' && ref !== null && 'id' in ref) {
    return ref as Stripe.Subscription
  }
  if (typeof ref === 'string' && ref.length > 0) {
    return stripe.subscriptions.retrieve(ref)
  }
  throw new Error('checkout_session_missing_subscription')
}

/**
 * Aggiorna business_subscriptions / customer_subscriptions dopo Checkout subscription.
 * Non richiede payment_status=paid (es. trial).
 */
export async function syncTrustBookSaasFromCheckoutSession(
  sbAdmin: SupabaseClient,
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<boolean> {
  if (session.mode !== 'subscription') return false
  const kind = session.metadata?.trustbook_kind ?? ''
  if (kind !== 'saas_business_subscription' && kind !== 'saas_customer_subscription') return false

  const stripeSub = await resolveStripeSubscription(stripe, session)
  const ended = subscriptionEnded(stripeSub, false)

  if (kind === 'saas_business_subscription') {
    const businessId = String(session.metadata?.business_id ?? '').trim()
    const planId = String(session.metadata?.plan_id ?? '').trim()
    if (!businessId || !planId) return false
    if (!ended && !(await validateBusinessPlan(sbAdmin, planId))) {
      throw new Error('saas_invalid_business_plan')
    }
    await applyBusinessSubscriptionPatch(sbAdmin, businessId, planId, stripeSub, ended)
    return true
  }

  const customerId = String(session.metadata?.customer_id ?? '').trim()
  const planId = String(session.metadata?.plan_id ?? '').trim()
  if (!customerId || !planId) return false
  if (!ended && !(await validateCustomerPlan(sbAdmin, planId))) {
    throw new Error('saas_invalid_customer_plan')
  }
  await applyCustomerSubscriptionPatch(sbAdmin, customerId, planId, stripeSub, ended)
  return true
}

export async function syncTrustBookSaasFromStripeSubscription(
  sbAdmin: SupabaseClient,
  subscription: Stripe.Subscription,
  opts?: { deleted?: boolean },
): Promise<boolean> {
  const kind = subscription.metadata?.trustbook_kind ?? ''
  if (kind !== 'saas_business_subscription' && kind !== 'saas_customer_subscription') return false

  const ended = subscriptionEnded(subscription, Boolean(opts?.deleted))

  if (kind === 'saas_business_subscription') {
    const businessId = String(subscription.metadata?.business_id ?? '').trim()
    const planId = String(subscription.metadata?.plan_id ?? '').trim()
    if (!businessId) return false
    if (!ended && !planId) return false
    if (!ended && !(await validateBusinessPlan(sbAdmin, planId))) {
      throw new Error('saas_invalid_business_plan')
    }
    await applyBusinessSubscriptionPatch(sbAdmin, businessId, planId || 'business_free', subscription, ended)
    return true
  }

  const customerId = String(subscription.metadata?.customer_id ?? '').trim()
  const planId = String(subscription.metadata?.plan_id ?? '').trim()
  if (!customerId) return false
  if (!ended && !planId) return false
  if (!ended && !(await validateCustomerPlan(sbAdmin, planId))) {
    throw new Error('saas_invalid_customer_plan')
  }
  await applyCustomerSubscriptionPatch(sbAdmin, customerId, planId || 'customer_free', subscription, ended)
  return true
}

async function applyBusinessSubscriptionPatch(
  sbAdmin: SupabaseClient,
  businessId: string,
  targetPlanId: string,
  stripeSub: Stripe.Subscription,
  ended: boolean,
) {
  const nowIso = new Date().toISOString()
  let patch: Record<string, unknown>

  if (ended) {
    patch = {
      plan_id: 'business_free',
      stripe_subscription_id: null,
      status: 'canceled',
      current_period_end: null,
      cancel_at_period_end: false,
      updated_at: nowIso,
    }
  } else {
    patch = {
      plan_id: targetPlanId,
      stripe_subscription_id: stripeSub.id,
      status: mapStripeSubscriptionToTrustBookStatus(stripeSub.status),
      current_period_end: subscriptionPeriodEndIso(stripeSub),
      cancel_at_period_end: Boolean(stripeSub.cancel_at_period_end),
      updated_at: nowIso,
    }
  }

  const { error } = await sbAdmin.from('business_subscriptions').update(patch).eq('business_id', businessId)
  if (error) throw error
}

async function applyCustomerSubscriptionPatch(
  sbAdmin: SupabaseClient,
  customerId: string,
  targetPlanId: string,
  stripeSub: Stripe.Subscription,
  ended: boolean,
) {
  const nowIso = new Date().toISOString()
  let patch: Record<string, unknown>

  if (ended) {
    patch = {
      plan_id: 'customer_free',
      stripe_subscription_id: null,
      status: 'canceled',
      current_period_end: null,
      cancel_at_period_end: false,
      updated_at: nowIso,
    }
  } else {
    patch = {
      plan_id: targetPlanId,
      stripe_subscription_id: stripeSub.id,
      status: mapStripeSubscriptionToTrustBookStatus(stripeSub.status),
      current_period_end: subscriptionPeriodEndIso(stripeSub),
      cancel_at_period_end: Boolean(stripeSub.cancel_at_period_end),
      updated_at: nowIso,
    }
  }

  const { error } = await sbAdmin.from('customer_subscriptions').update(patch).eq('customer_id', customerId)
  if (error) throw error
}
