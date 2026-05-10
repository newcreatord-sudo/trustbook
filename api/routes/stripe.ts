import { Router, type Request, type Response } from 'express'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import {
  syncTrustBookSaasFromCheckoutSession,
  syncTrustBookSaasFromStripeSubscription,
} from '../lib/stripeSaasSync.js'
import {
  asPaymentStatus,
  canTransitionPaymentStatus,
  type PaymentStatus,
} from '../lib/paymentStatus.js'
import { readEnvAny } from '../lib/env.js'
import {
  mustSupabaseAdmin,
  adminTransitionBookingState as transitionBookingState,
  adminGetLatestPaymentByBooking as getLatestPaymentByBooking,
  adminUpdateLatestPaymentByBooking as updateLatestPaymentByBooking,
  runCancelBookingByBusiness,
  runForfeitBookingDeposit,
  isPaymentsEnabled,
  isBusinessMemberFromRequest,
} from '../lib/bookingDepositStripeAdmin.js'

const router = Router()

type BookingCheckoutRow = {
  id: string
  customer_user_id: string
  business_id: string
  status: string
  deposit_status: string
  deposit_amount_cents: number
}

type BookingConfirmRow = {
  id: string
  status: string
  confirmed_at: string | null
  deposit_amount_cents: number
}

type BookingCancelRow = {
  id: string
  customer_user_id: string
  business_id: string
  start_at: string
  status: string
  deposit_status: string
  deposit_amount_cents: number
  businesses: { cancellation_window_min: number | null } | null
}

type BookingPaymentRow = {
  id: string
  booking_id: string
  provider: 'stripe'
  kind: 'deposit'
  amount_cents: number
  currency: string
  stripe_session_id: string | null
  stripe_payment_intent_id: string | null
  status: string
  created_at: string
  updated_at: string
}

type SessionPaymentRow = {
  id: string
  booking_id: string
  amount_cents: number
  currency: string
  status: string
  stripe_session_id: string | null
  stripe_payment_intent_id: string | null
}

type WebhookEventInsert = {
  id: string
  event_type: string
  livemode: boolean
  stripe_created_at: string | null
}

type PaymentBookingRow = {
  id: string
  start_at: string
  end_at: string
  service_id: string
  customer_user_id: string
}

type PaymentServiceRow = { id: string; name: string }

type PaymentProfileRow = {
  id: string
  first_name: string | null
  last_name: string | null
  phone: string | null
}

function getBaseUrl(req: Request): string {
  const fromEnv = readEnvAny(['APP_BASE_URL'])
  if (fromEnv) return fromEnv
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http'
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host
  if (!host) return 'http://localhost:5173'
  return `${proto}://${host}`
}

function getBearerToken(req: Request): string | null {
  const h = req.headers.authorization
  if (!h) return null
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m?.[1]?.trim() ?? null
}

async function requireUserId(req: Request): Promise<string | null> {
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

function mustStripe(): Stripe {
  const key = readEnvAny(['STRIPE_SECRET_KEY', 'STRIPE_SK', 'STRIPE_SECRET'])
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY')
  return new Stripe(key, { apiVersion: '2026-03-25.dahlia' })
}

function safeErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e && typeof e === 'object') {
    const anyE = e as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown }
    const msg = typeof anyE.message === 'string' ? anyE.message : null
    const code = typeof anyE.code === 'string' ? anyE.code : null
    const details = typeof anyE.details === 'string' ? anyE.details : null
    const hint = typeof anyE.hint === 'string' ? anyE.hint : null
    const out = [msg, code ? `code=${code}` : null, details, hint].filter((x) => typeof x === 'string' && x.trim().length > 0)
    if (out.length) return out.join(' | ')
  }
  return 'Service error'
}

function isBookingPaymentClosedStatus(status: string): boolean {
  return (
    status === 'cancelled_by_customer' ||
    status === 'cancelled_by_business' ||
    status === 'rejected' ||
    status === 'completed' ||
    status === 'no_show' ||
    status === 'late_cancel'
  )
}

function isPgUniqueViolation(error: unknown): boolean {
  const e = error as { code?: unknown }
  return e?.code === '23505'
}

async function updatePaymentBySession(params: {
  sbAdmin: ReturnType<typeof mustSupabaseAdmin>
  sessionId: string
  nextStatus: PaymentStatus
  stripePaymentIntentId?: string | null
}) {
  const { data, error } = await params.sbAdmin
    .from('booking_payments')
    .select('id,status')
    .eq('stripe_session_id', params.sessionId)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('payment_not_found_for_session')

  const current = asPaymentStatus((data as { status?: unknown }).status)
  if (!current) throw new Error('invalid_payment_status')
  if (!canTransitionPaymentStatus(current, params.nextStatus)) throw new Error('invalid_payment_transition')
  if (current === params.nextStatus) return

  const patch: Record<string, unknown> = { status: params.nextStatus }
  if (params.stripePaymentIntentId !== undefined) {
    patch.stripe_payment_intent_id = params.stripePaymentIntentId
  }

  const { error: updateErr } = await params.sbAdmin
    .from('booking_payments')
    .update(patch)
    .eq('id', (data as { id: string }).id)
  if (updateErr) throw updateErr
}

async function getPaymentBySession(params: {
  sbAdmin: ReturnType<typeof mustSupabaseAdmin>
  sessionId: string
}): Promise<SessionPaymentRow | null> {
  const { data, error } = await params.sbAdmin
    .from('booking_payments')
    .select('id,booking_id,amount_cents,currency,status,stripe_session_id,stripe_payment_intent_id')
    .eq('stripe_session_id', params.sessionId)
    .maybeSingle()
  if (error) throw error
  return (data as SessionPaymentRow | null) ?? null
}

async function isWebhookEventProcessed(params: {
  sbAdmin: ReturnType<typeof mustSupabaseAdmin>
  eventId: string
}): Promise<boolean> {
  const { data, error } = await params.sbAdmin.from('stripe_webhook_events').select('id').eq('id', params.eventId).maybeSingle()
  if (error) throw error
  return Boolean(data)
}

async function markWebhookEventProcessed(params: {
  sbAdmin: ReturnType<typeof mustSupabaseAdmin>
  event: Stripe.Event
}): Promise<void> {
  const payload: WebhookEventInsert = {
    id: params.event.id,
    event_type: params.event.type,
    livemode: Boolean(params.event.livemode),
    stripe_created_at:
      typeof params.event.created === 'number' ? new Date(params.event.created * 1000).toISOString() : null,
  }
  const { error } = await params.sbAdmin.from('stripe_webhook_events').insert(payload)
  if (!error || isPgUniqueViolation(error)) return
  throw error
}

router.post('/deposit/checkout', async (req: Request, res: Response) => {
  try {
    if (!isPaymentsEnabled()) {
      res.status(503).json({ success: false, error: 'Payments are currently disabled by configuration' })
      return
    }
    const userId = await requireUserId(req)
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const bookingId = String(req.body?.bookingId ?? '').trim()
    if (!bookingId) {
      res.status(400).json({ success: false, error: 'Missing bookingId' })
      return
    }

    const sbAdmin = mustSupabaseAdmin()
    const { data: booking, error: bErr } = await sbAdmin
      .from('bookings')
      .select('id,customer_user_id,business_id,status,deposit_status,deposit_amount_cents')
      .eq('id', bookingId)
      .maybeSingle()
    if (bErr) throw bErr
    if (!booking) {
      res.status(404).json({ success: false, error: 'Booking not found' })
      return
    }
    const bookingRow = booking as unknown as BookingCheckoutRow

    if (bookingRow.customer_user_id !== userId) {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }
    if (bookingRow.status !== 'pending_deposit' && bookingRow.status !== 'requires_deposit' && bookingRow.status !== 'pending_payment_setup') {
      res.status(400).json({ success: false, error: 'Booking is not awaiting deposit' })
      return
    }
    const amount = Number(bookingRow.deposit_amount_cents ?? 0)
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ success: false, error: 'Invalid deposit amount' })
      return
    }

    const stripe = mustStripe()
    const baseUrl = getBaseUrl(req)
    const { data: existingRow, error: existingErr } = await sbAdmin
      .from('booking_payments')
      .select('id,status,stripe_session_id')
      .eq('booking_id', bookingId)
      .eq('provider', 'stripe')
      .eq('kind', 'deposit')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existingErr) throw existingErr
    const row = existingRow as { status?: unknown; stripe_session_id?: unknown } | null
    const existingStatus = asPaymentStatus(row?.status)
    const existingSessionId = typeof row?.stripe_session_id === 'string' ? row.stripe_session_id : null
    if (existingStatus === 'created' && existingSessionId) {
      try {
        const existingSession = await stripe.checkout.sessions.retrieve(existingSessionId)
        if (existingSession.url && existingSession.payment_status !== 'paid') {
          res.status(200).json({ success: true, url: existingSession.url, reused: true })
          return
        }
      } catch {
        // The old session can be expired or invalid: create a fresh one below.
      }
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: amount,
            product_data: {
              name: 'Caparra prenotazione',
              description: 'Caparra per confermare la prenotazione su TrustBook.',
            },
          },
        },
      ],
      success_url: `${baseUrl}/prenotazioni?deposit=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/prenotazioni?deposit=cancelled`,
      metadata: {
        booking_id: bookingId,
        customer_user_id: userId,
        business_id: bookingRow.business_id,
      },
    })

    const paymentInsert = {
      booking_id: bookingId,
      provider: 'stripe',
      kind: 'deposit',
      amount_cents: amount,
      currency: 'eur',
      stripe_session_id: session.id,
      stripe_payment_intent_id: null,
      status: 'created',
    }
    const { error: insertErr } = await sbAdmin.from('booking_payments').insert(paymentInsert)
    if (insertErr) {
      if (isPgUniqueViolation(insertErr)) {
        const { data: openPayment, error: openPaymentErr } = await sbAdmin
          .from('booking_payments')
          .select('stripe_session_id,status')
          .eq('booking_id', bookingId)
          .eq('provider', 'stripe')
          .eq('kind', 'deposit')
          .eq('status', 'created')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (openPaymentErr) throw openPaymentErr
        const openSessionId = typeof openPayment?.stripe_session_id === 'string' ? openPayment.stripe_session_id : null
        if (openSessionId) {
          try {
            const openSession = await stripe.checkout.sessions.retrieve(openSessionId)
            if (openSession.url && openSession.payment_status !== 'paid') {
              res.status(200).json({ success: true, url: openSession.url, reused: true })
              return
            }
          } catch {
            // fallback to explicit conflict below if existing session cannot be retrieved
          }
        }
        res.status(409).json({ success: false, error: 'Payment checkout already in progress' })
        return
      }
      throw insertErr
    }

    res.status(200).json({ success: true, url: session.url })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: safeErrorMessage(e) })
  }
})

router.post('/deposit/verify', async (req: Request, res: Response) => {
  try {
    if (!isPaymentsEnabled()) {
      res.status(503).json({ success: false, error: 'Payments are currently disabled by configuration' })
      return
    }
    const userId = await requireUserId(req)
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const sessionId = String(req.body?.sessionId ?? '').trim()
    if (!sessionId) {
      res.status(400).json({ success: false, error: 'Missing sessionId' })
      return
    }

    const stripe = mustStripe()
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] })
    const paymentStatus = session.payment_status
    const bookingId = session.metadata?.booking_id ?? ''
    const sessionUserId = session.metadata?.customer_user_id ?? ''

    if (!bookingId || !sessionUserId || sessionUserId !== userId) {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }

    const sbAdmin = mustSupabaseAdmin()
    const { data: booking, error: bErr } = await sbAdmin
      .from('bookings')
      .select('id,status,deposit_status,deposit_amount_cents,confirmed_at,customer_user_id')
      .eq('id', bookingId)
      .maybeSingle()
    if (bErr) throw bErr
    if (!booking) {
      res.status(404).json({ success: false, error: 'Booking not found' })
      return
    }
    const bookingRow = booking as unknown as {
      customer_user_id: string
      status: string
      confirmed_at: string | null
      deposit_amount_cents: number
    }
    if (bookingRow.customer_user_id !== userId) {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }
    if (isBookingPaymentClosedStatus(bookingRow.status)) {
      res.status(409).json({ success: false, error: 'Booking is not payable in current status' })
      return
    }

    const payment = await getPaymentBySession({ sbAdmin, sessionId })
    if (!payment) {
      res.status(404).json({ success: false, error: 'Payment not found for session' })
      return
    }
    if (payment.booking_id !== bookingId) {
      res.status(409).json({ success: false, error: 'Payment session mismatch' })
      return
    }
    if (payment.amount_cents !== Number(bookingRow.deposit_amount_cents ?? 0)) {
      res.status(409).json({ success: false, error: 'Payment amount mismatch' })
      return
    }
    if (payment.currency.toLowerCase() !== 'eur') {
      res.status(409).json({ success: false, error: 'Invalid payment currency' })
      return
    }
    if (typeof session.amount_total === 'number' && session.amount_total !== payment.amount_cents) {
      res.status(409).json({ success: false, error: 'Stripe session amount mismatch' })
      return
    }

    const paid = paymentStatus === 'paid'
    if (paid) {
      const pi = session.payment_intent
      const piId = typeof pi === 'string' ? pi : pi?.id ?? null

      await updatePaymentBySession({
        sbAdmin,
        sessionId,
        nextStatus: 'paid',
        stripePaymentIntentId: piId,
      })

      if (bookingRow.status === 'pending_deposit' || bookingRow.status === 'requires_deposit' || bookingRow.status === 'pending_payment_setup') {
        await transitionBookingState({
          sbAdmin,
          bookingId,
          nextStatus: 'confirmed',
          nextDepositStatus: 'paid',
          requireCurrentStatus: bookingRow.status,
          touchConfirmedAt: true,
        })
      } else if (bookingRow.status === 'confirmed') {
        await transitionBookingState({
          sbAdmin,
          bookingId,
          nextDepositStatus: 'paid',
        })
      } else {
        res.status(409).json({ success: false, error: 'Booking is not payable in current status' })
        return
      }

      res.status(200).json({ success: true, paid: true, bookingId })
      return
    }

    res.status(200).json({ success: true, paid: false, bookingId, status: paymentStatus })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: safeErrorMessage(e) })
  }
})

router.post('/deposit/cancel', async (req: Request, res: Response) => {
  try {
    const userId = await requireUserId(req)
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const bookingId = String(req.body?.bookingId ?? '').trim()
    if (!bookingId) {
      res.status(400).json({ success: false, error: 'Missing bookingId' })
      return
    }

    const sbAdmin = mustSupabaseAdmin()
    const { data: booking, error: bErr } = await sbAdmin
      .from('bookings')
      .select('id,customer_user_id,business_id,start_at,status,deposit_status,deposit_amount_cents,businesses(cancellation_window_min)')
      .eq('id', bookingId)
      .maybeSingle()
    if (bErr) throw bErr
    if (!booking) {
      res.status(404).json({ success: false, error: 'Booking not found' })
      return
    }
    const b = booking as unknown as BookingCancelRow
    if (b.customer_user_id !== userId) {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }

    const now = new Date()
    const start = new Date(b.start_at)
    const windowMin = b.businesses?.cancellation_window_min ?? 120
    const inTime = start.getTime() - now.getTime() >= windowMin * 60_000

    let nextDepositStatus = b.deposit_status
    if (b.deposit_status === 'paid' && b.deposit_amount_cents > 0) {
      if (inTime) {
        if (!isPaymentsEnabled()) {
          res.status(503).json({ success: false, error: 'Refund requires payments to be enabled' })
          return
        }
        const payment = await getLatestPaymentByBooking({ sbAdmin, bookingId })
        if (payment.status !== 'paid' || !payment.paymentIntentId) {
          res.status(409).json({ success: false, error: 'Missing payment reference for refund' })
          return
        }

        const stripe = mustStripe()
        await stripe.refunds.create({ payment_intent: payment.paymentIntentId, reason: 'requested_by_customer' })
        await updateLatestPaymentByBooking({
          sbAdmin,
          bookingId,
          nextStatus: 'refunded',
          requirePaymentIntent: true,
        })
        nextDepositStatus = 'refunded'
      } else {
        nextDepositStatus = 'forfeited'
        await updateLatestPaymentByBooking({
          sbAdmin,
          bookingId,
          nextStatus: 'forfeited',
        })
      }
    }

    await transitionBookingState({
      sbAdmin,
      bookingId,
      nextStatus: 'cancelled_by_customer',
      nextDepositStatus,
      touchCancelledAt: true,
    })

    res.status(200).json({
      success: true,
      bookingId,
      inTime,
      depositStatus: nextDepositStatus,
      cancelledAt: now.toISOString(),
    })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: safeErrorMessage(e) })
  }
})

router.post('/deposit/cancel-by-business', async (req: Request, res: Response) => {
  try {
    const bookingId = String(req.body?.bookingId ?? '').trim()
    if (!bookingId) {
      res.status(400).json({ success: false, error: 'Missing bookingId' })
      return
    }
    const out = await runCancelBookingByBusiness(req, bookingId)
    res.status(200).json({ success: true, ...out })
  } catch (e: unknown) {
    const msg = safeErrorMessage(e)
    if (msg === 'Unauthorized') {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    if (msg === 'Forbidden') {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }
    if (msg === 'Booking not found') {
      res.status(404).json({ success: false, error: 'Booking not found' })
      return
    }
    if (msg === 'Refund requires payments to be enabled') {
      res.status(503).json({ success: false, error: msg })
      return
    }
    if (msg.includes('Missing payment reference')) {
      res.status(409).json({ success: false, error: msg })
      return
    }
    res.status(502).json({ success: false, error: msg })
  }
})

router.post('/deposit/forfeit-by-business', async (req: Request, res: Response) => {
  try {
    const bookingId = String(req.body?.bookingId ?? '').trim()
    if (!bookingId) {
      res.status(400).json({ success: false, error: 'Missing bookingId' })
      return
    }
    const out = await runForfeitBookingDeposit(req, bookingId)
    res.status(200).json({ success: true, ...out })
  } catch (e: unknown) {
    const msg = safeErrorMessage(e)
    if (msg === 'Unauthorized') {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    if (msg === 'Forbidden') {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }
    if (msg === 'Booking not found') {
      res.status(404).json({ success: false, error: 'Booking not found' })
      return
    }
    res.status(502).json({ success: false, error: msg })
  }
})

router.get('/business/payments', async (req: Request, res: Response) => {
  try {
    const userId = await requireUserId(req)
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = String(req.query?.businessId ?? '').trim()
    if (!businessId) {
      res.status(400).json({ success: false, error: 'Missing businessId' })
      return
    }

    const member = await isBusinessMemberFromRequest(req, businessId)
    if (!member) {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }

    const sbAdmin = mustSupabaseAdmin()
    const { data: bookingIdsRes, error: idErr } = await sbAdmin
      .from('bookings')
      .select('id')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (idErr) throw idErr
    const bookingIds = ((bookingIdsRes as Array<{ id: string }>) ?? []).map((x) => x.id)
    if (bookingIds.length === 0) {
      res.status(200).json({ success: true, rows: [] as BookingPaymentRow[] })
      return
    }

    const { data, error } = await sbAdmin
      .from('booking_payments')
      .select(
        'id,booking_id,provider,kind,amount_cents,currency,stripe_session_id,stripe_payment_intent_id,status,created_at,updated_at',
      )
      .in('booking_id', bookingIds)
      .order('created_at', { ascending: false })
      .limit(100)
    if (error) throw error

    const paymentRows = ((data as BookingPaymentRow[]) ?? []) as BookingPaymentRow[]
    const ids = paymentRows.map((r) => r.booking_id).filter(Boolean)
    const uniqueIds = Array.from(new Set(ids))

    const { data: bookingRowsRes, error: bkErr } = await sbAdmin
      .from('bookings')
      .select('id,start_at,end_at,service_id,customer_user_id')
      .in('id', uniqueIds)
    if (bkErr) throw bkErr
    const bookingRows = ((bookingRowsRes as PaymentBookingRow[]) ?? []) as PaymentBookingRow[]
    const bookingById = new Map<string, PaymentBookingRow>(bookingRows.map((b) => [b.id, b]))

    const serviceIds = Array.from(new Set(bookingRows.map((b) => b.service_id).filter(Boolean)))
    const customerIds = Array.from(new Set(bookingRows.map((b) => b.customer_user_id).filter(Boolean)))

    const [svcRes, profRes] = await Promise.all([
      serviceIds.length
        ? sbAdmin.from('services').select('id,name').in('id', serviceIds)
        : Promise.resolve({ data: [] as unknown, error: null } as { data: unknown; error: null }),
      customerIds.length
        ? sbAdmin.from('profiles').select('id,first_name,last_name,phone').in('id', customerIds)
        : Promise.resolve({ data: [] as unknown, error: null } as { data: unknown; error: null }),
    ])
    if (svcRes.error) throw svcRes.error
    if (profRes.error) throw profRes.error

    const services = ((svcRes.data as PaymentServiceRow[]) ?? []) as PaymentServiceRow[]
    const profiles = ((profRes.data as PaymentProfileRow[]) ?? []) as PaymentProfileRow[]
    const serviceById = new Map<string, PaymentServiceRow>(services.map((s) => [s.id, s]))
    const profileById = new Map<string, PaymentProfileRow>(profiles.map((p) => [p.id, p]))

    const enriched = paymentRows.map((p) => {
      const bk = bookingById.get(p.booking_id) ?? null
      const svc = bk ? (serviceById.get(bk.service_id) ?? null) : null
      const prof = bk ? (profileById.get(bk.customer_user_id) ?? null) : null
      return {
        ...p,
        booking: bk
          ? {
              id: bk.id,
              start_at: bk.start_at,
              end_at: bk.end_at,
              service_name: svc?.name ?? null,
              customer: prof
                ? { first_name: prof.first_name, last_name: prof.last_name, phone: prof.phone }
                : null,
            }
          : null,
      }
    })

    res.status(200).json({ success: true, rows: enriched })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: safeErrorMessage(e) })
  }
})

export async function stripeWebhookHandler(req: Request, res: Response) {
  try {
    const stripe = mustStripe()
    const secret = readEnvAny(['STRIPE_WEBHOOK_SECRET', 'STRIPE_WH_SECRET'])
    if (!secret) {
      res.status(500).json({ success: false, error: 'Missing STRIPE_WEBHOOK_SECRET' })
      return
    }

    const sig = req.headers['stripe-signature']
    if (typeof sig !== 'string') {
      res.status(400).send('Missing stripe-signature')
      return
    }

    const event = stripe.webhooks.constructEvent(req.body, sig, secret)
    const sbAdmin = mustSupabaseAdmin()
    const alreadyProcessed = await isWebhookEventProcessed({ sbAdmin, eventId: event.id })
    if (alreadyProcessed) {
      res.status(200).json({ received: true, duplicate: true })
      return
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      try {
        const saasDone = await syncTrustBookSaasFromCheckoutSession(sbAdmin, stripe, session)
        if (saasDone) {
          await markWebhookEventProcessed({ sbAdmin, event })
          res.status(200).json({ received: true, saas: true })
          return
        }
      } catch (saasErr: unknown) {
        res.status(400).send(saasErr instanceof Error ? saasErr.message : 'saas_webhook_error')
        return
      }

      if (!isPaymentsEnabled()) {
        await markWebhookEventProcessed({ sbAdmin, event })
        res.status(200).json({ received: true, skipped: 'payments_disabled' })
        return
      }

      const paymentStatus = session.payment_status
      if (paymentStatus === 'paid') {
        const bookingId = session.metadata?.booking_id ?? ''
        if (bookingId) {
          const payment = await getPaymentBySession({ sbAdmin, sessionId: session.id })
          if (!payment || payment.booking_id !== bookingId) {
            res.status(409).json({ success: false, error: 'Payment session mismatch' })
            return
          }
          await updatePaymentBySession({
            sbAdmin,
            sessionId: session.id,
            nextStatus: 'paid',
            stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          })

          const { data: booking } = await sbAdmin
            .from('bookings')
            .select('id,status,confirmed_at,deposit_amount_cents')
            .eq('id', bookingId)
            .maybeSingle()
          const b = booking as unknown as BookingConfirmRow | null
          if (b && typeof (b as { deposit_amount_cents?: unknown }).deposit_amount_cents === 'number') {
            const amount = (b as { deposit_amount_cents: number }).deposit_amount_cents
            if (amount !== payment.amount_cents) {
              res.status(409).json({ success: false, error: 'Payment amount mismatch' })
              return
            }
          }
          if (b && (b.status === 'pending_deposit' || b.status === 'requires_deposit' || b.status === 'pending_payment_setup')) {
            await transitionBookingState({
              sbAdmin,
              bookingId,
              nextStatus: 'confirmed',
              nextDepositStatus: 'paid',
              requireCurrentStatus: b.status,
              touchConfirmedAt: true,
            })
          } else if (b && b.status === 'confirmed') {
            await transitionBookingState({
              sbAdmin,
              bookingId,
              nextDepositStatus: 'paid',
            })
          }
        }
      }

      await markWebhookEventProcessed({ sbAdmin, event })
      res.status(200).json({ received: true })
      return
    }

    if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription
      try {
        const saasDone = await syncTrustBookSaasFromStripeSubscription(sbAdmin, sub, {
          deleted: event.type === 'customer.subscription.deleted',
        })
        if (saasDone) {
          await markWebhookEventProcessed({ sbAdmin, event })
          res.status(200).json({ received: true, saas: true })
          return
        }
      } catch (saasErr: unknown) {
        res.status(400).send(saasErr instanceof Error ? saasErr.message : 'saas_webhook_error')
        return
      }
      await markWebhookEventProcessed({ sbAdmin, event })
      res.status(200).json({ received: true })
      return
    }

    if (!isPaymentsEnabled()) {
      await markWebhookEventProcessed({ sbAdmin, event })
      res.status(200).json({ received: true, skipped: 'payments_disabled' })
      return
    }

    await markWebhookEventProcessed({ sbAdmin, event })
    res.status(200).json({ received: true })
  } catch (e: unknown) {
    res.status(400).send(e instanceof Error ? e.message : 'Webhook error')
  }
}

export default router
