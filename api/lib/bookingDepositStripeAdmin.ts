import type { Request } from 'express'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import {
  asPaymentStatus,
  canTransitionPaymentStatus,
  type PaymentStatus,
} from './paymentStatus.js'
import { readEnvAny } from './env.js'

export function isPaymentsEnabled(): boolean {
  const raw = readEnvAny(['PAYMENTS_ENABLED', 'VITE_PAYMENTS_ENABLED'])
  return raw !== '0'
}

export function getBearerToken(req: Request): string | null {
  const h = req.headers.authorization
  if (!h) return null
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m?.[1]?.trim() ?? null
}

export async function requireUserIdFromRequest(req: Request): Promise<string | null> {
  const supabaseUrl = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const anonKey = readEnvAny(['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON', 'anon_key'])
  const token = getBearerToken(req)
  if (!supabaseUrl || !anonKey || !token) return null

  const sb = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data, error } = await sb.auth.getUser()
  if (error || !data.user) return null
  return data.user.id
}

export async function isBusinessMemberFromRequest(req: Request, businessId: string): Promise<boolean> {
  const supabaseUrl = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const anonKey = readEnvAny(['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON', 'anon_key'])
  const token = getBearerToken(req)
  if (!supabaseUrl || !anonKey || !token) return false

  const sb = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data, error } = await sb.rpc('is_business_member', { bid: businessId })
  if (error) return false
  return Boolean(data)
}

export function mustSupabaseAdmin() {
  const supabaseUrl = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const serviceRoleKey = readEnvAny([
    'SUPABASE_SERVICE_ROLE_KEY',
    'SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_KEY',
    'service_role',
    'SERVICE_ROLE',
  ])
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

export function mustStripe(): Stripe {
  const key = readEnvAny(['STRIPE_SECRET_KEY', 'STRIPE_SK', 'STRIPE_SECRET'])
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY')
  return new Stripe(key, { apiVersion: '2026-03-25.dahlia' })
}

export async function adminTransitionBookingState(params: {
  sbAdmin: ReturnType<typeof mustSupabaseAdmin>
  bookingId: string
  nextStatus?: string
  nextDepositStatus?: string
  requireCurrentStatus?: string
  touchConfirmedAt?: boolean
  touchCancelledAt?: boolean
}): Promise<void> {
  const { error } = await params.sbAdmin.rpc('transition_booking_state', {
    p_booking_id: params.bookingId,
    p_next_status: params.nextStatus ?? null,
    p_next_deposit_status: params.nextDepositStatus ?? null,
    p_require_current_status: params.requireCurrentStatus ?? null,
    p_touch_confirmed_at: params.touchConfirmedAt ?? false,
    p_touch_cancelled_at: params.touchCancelledAt ?? false,
  })
  if (error) throw error
}

export async function adminUpdateLatestPaymentByBooking(params: {
  sbAdmin: ReturnType<typeof mustSupabaseAdmin>
  bookingId: string
  nextStatus: PaymentStatus
  requirePaymentIntent?: boolean
}): Promise<{ paymentIntentId: string | null }> {
  const { data, error } = await params.sbAdmin
    .from('booking_payments')
    .select('id,status,stripe_payment_intent_id')
    .eq('booking_id', params.bookingId)
    .eq('provider', 'stripe')
    .eq('kind', 'deposit')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('payment_not_found_for_booking')

  const row = data as { id: string; status: unknown; stripe_payment_intent_id: string | null }
  const current = asPaymentStatus(row.status)
  if (!current) throw new Error('invalid_payment_status')
  if (!canTransitionPaymentStatus(current, params.nextStatus)) throw new Error('invalid_payment_transition')

  const piId = row.stripe_payment_intent_id ?? null
  if (params.requirePaymentIntent && !piId) throw new Error('payment_intent_missing')

  if (current !== params.nextStatus) {
    const { error: updateErr } = await params.sbAdmin
      .from('booking_payments')
      .update({ status: params.nextStatus })
      .eq('id', row.id)
    if (updateErr) throw updateErr
  }

  return { paymentIntentId: piId }
}

export async function adminGetLatestPaymentByBooking(params: {
  sbAdmin: ReturnType<typeof mustSupabaseAdmin>
  bookingId: string
}): Promise<{ status: PaymentStatus; paymentIntentId: string | null }> {
  const { data, error } = await params.sbAdmin
    .from('booking_payments')
    .select('status,stripe_payment_intent_id')
    .eq('booking_id', params.bookingId)
    .eq('provider', 'stripe')
    .eq('kind', 'deposit')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('payment_not_found_for_booking')
  const row = data as { status: unknown; stripe_payment_intent_id: string | null }
  const status = asPaymentStatus(row.status)
  if (!status) throw new Error('invalid_payment_status')
  return { status, paymentIntentId: row.stripe_payment_intent_id ?? null }
}

/** Annullamento da attività: rimborso Stripe se caparra pagata, poi stato booking. Richiede is_business_member. */
export async function runCancelBookingByBusiness(
  req: Request,
  bookingId: string,
): Promise<{ bookingId: string; depositStatus: string; cancelledAt: string }> {
  const userId = await requireUserIdFromRequest(req)
  if (!userId) throw new Error('Unauthorized')

  const sbAdmin = mustSupabaseAdmin()
  const { data: booking, error: bErr } = await sbAdmin
    .from('bookings')
    .select('id,customer_user_id,business_id,start_at,status,deposit_status,deposit_amount_cents')
    .eq('id', bookingId)
    .maybeSingle()
  if (bErr) throw bErr
  if (!booking) throw new Error('Booking not found')

  const b = booking as unknown as {
    id: string
    customer_user_id: string
    business_id: string
    deposit_status: string
    deposit_amount_cents: number
  }

  const member = await isBusinessMemberFromRequest(req, b.business_id)
  if (!member) throw new Error('Forbidden')

  let nextDepositStatus = b.deposit_status
  if (b.deposit_status === 'paid' && b.deposit_amount_cents > 0) {
    if (!isPaymentsEnabled()) throw new Error('Refund requires payments to be enabled')
    const payment = await adminGetLatestPaymentByBooking({ sbAdmin, bookingId })
    if (payment.status !== 'paid' || !payment.paymentIntentId) {
      throw new Error('Missing payment reference for refund')
    }

    const stripe = mustStripe()
    await stripe.refunds.create({ payment_intent: payment.paymentIntentId, reason: 'requested_by_customer' })
    await adminUpdateLatestPaymentByBooking({
      sbAdmin,
      bookingId,
      nextStatus: 'refunded',
      requirePaymentIntent: true,
    })
    nextDepositStatus = 'refunded'
  }

  await adminTransitionBookingState({
    sbAdmin,
    bookingId,
    nextStatus: 'cancelled_by_business',
    nextDepositStatus,
    touchCancelledAt: true,
  })

  const cancelledAt = new Date().toISOString()
  return { bookingId, depositStatus: nextDepositStatus, cancelledAt }
}

/** Trattenuta caparra (record pagamento): stesso effetto della route Stripe. Richiede is_business_member. */
export async function runForfeitBookingDeposit(req: Request, bookingId: string): Promise<{ bookingId: string; depositStatus: string }> {
  const userId = await requireUserIdFromRequest(req)
  if (!userId) throw new Error('Unauthorized')

  const sbAdmin = mustSupabaseAdmin()
  const { data: booking, error: bErr } = await sbAdmin
    .from('bookings')
    .select('id,business_id,deposit_status,deposit_amount_cents')
    .eq('id', bookingId)
    .maybeSingle()
  if (bErr) throw bErr
  if (!booking) throw new Error('Booking not found')

  const b = booking as unknown as { business_id: string; deposit_status: string; deposit_amount_cents: number }
  const member = await isBusinessMemberFromRequest(req, b.business_id)
  if (!member) throw new Error('Forbidden')

  if (b.deposit_status === 'forfeited') {
    try {
      const pay = await adminGetLatestPaymentByBooking({ sbAdmin, bookingId })
      if (pay.status === 'paid') {
        await adminUpdateLatestPaymentByBooking({
          sbAdmin,
          bookingId,
          nextStatus: 'forfeited',
        })
      }
    } catch {
      // Nessuna riga pagamento: nulla da allineare.
    }
    return { bookingId, depositStatus: 'forfeited' }
  }

  let nextDepositStatus = b.deposit_status
  if (b.deposit_status === 'paid' && b.deposit_amount_cents > 0) {
    await adminUpdateLatestPaymentByBooking({
      sbAdmin,
      bookingId,
      nextStatus: 'forfeited',
    })
    nextDepositStatus = 'forfeited'
  }

  if (nextDepositStatus !== b.deposit_status) {
    await adminTransitionBookingState({
      sbAdmin,
      bookingId,
      nextDepositStatus,
    })
  }

  return { bookingId, depositStatus: nextDepositStatus }
}
