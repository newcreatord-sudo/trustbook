import request from 'supertest'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

type Booking = {
  id: string
  customer_user_id: string
  business_id: string
  status: string
  deposit_status: string
  deposit_amount_cents: number
  confirmed_at: string | null
  start_at?: string
  businesses?: { cancellation_window_min: number | null } | null
}

type BookingPayment = {
  id: string
  booking_id: string
  provider: 'stripe'
  kind: 'deposit'
  amount_cents: number
  currency: string
  status: string
  stripe_session_id: string | null
  stripe_payment_intent_id: string | null
  created_at: string
}

const state = {
  bookings: new Map<string, Booking>(),
  payments: new Map<string, BookingPayment>(),
  webhookEvents: new Set<string>(),
  transitions: [] as Array<Record<string, unknown>>,
}

type Actor = { userId: string; isMember: boolean; isOwner: boolean }
const actorsByToken: Record<string, Actor> = {
  token_1: { userId: 'user_1', isMember: true, isOwner: true },
  token_staff: { userId: 'user_staff', isMember: true, isOwner: false },
  token_customer: { userId: 'user_customer', isMember: false, isOwner: false },
}

const stripeRetrieveMock = vi.fn()
const stripeCreateMock = vi.fn()
const stripeRefundCreateMock = vi.fn()
const stripeConstructEventMock = vi.fn()
const createClientMock = vi.fn()

vi.mock('stripe', () => {
  class StripeMock {
    checkout = { sessions: { retrieve: stripeRetrieveMock, create: stripeCreateMock } }
    refunds = { create: stripeRefundCreateMock }
    webhooks = { constructEvent: stripeConstructEventMock }
  }
  return { default: StripeMock }
})

function findPaymentBySession(sessionId: string) {
  return Array.from(state.payments.values()).find((p) => p.stripe_session_id === sessionId) ?? null
}

function makeSelectBuilder(table: string) {
  const filters: Record<string, unknown> = {}
  const builder: Record<string, unknown> = {
    eq: (k: string, v: unknown) => {
      filters[k] = v
      return builder
    },
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => {
      if (table === 'bookings') {
        const id = String(filters['id'] ?? '')
        return { data: state.bookings.get(id) ?? null, error: null }
      }

      if (table === 'booking_payments') {
        if (typeof filters['stripe_session_id'] === 'string') {
          return { data: findPaymentBySession(filters['stripe_session_id']) ?? null, error: null }
        }
        if (typeof filters['booking_id'] === 'string') {
          const rows = Array.from(state.payments.values())
            .filter((p) => p.booking_id === filters['booking_id'])
            .filter((p) => (typeof filters['provider'] === 'string' ? p.provider === filters['provider'] : true))
            .filter((p) => (typeof filters['kind'] === 'string' ? p.kind === filters['kind'] : true))
            .filter((p) => (typeof filters['status'] === 'string' ? p.status === filters['status'] : true))
            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          return { data: rows[0] ?? null, error: null }
        }
      }
      if (table === 'stripe_webhook_events') {
        if (typeof filters['id'] === 'string') {
          return { data: state.webhookEvents.has(filters['id']) ? { id: filters['id'] } : null, error: null }
        }
      }

      return { data: null, error: null }
    },
  }
  return builder
}

function makeUpdateBuilder(table: string, patch: Record<string, unknown>) {
  const filters: Record<string, unknown> = {}
  let applied = false
  const apply = () => {
    if (applied) return { data: null, error: null }
    applied = true

    if (table === 'booking_payments') {
      const byId = typeof filters['id'] === 'string' ? state.payments.get(filters['id']) ?? null : null
      if (byId) {
        state.payments.set(byId.id, { ...byId, ...patch } as BookingPayment)
        return { data: null, error: null }
      }
    }
    return { data: null, error: null }
  }

  const builder: Record<string, unknown> = {
    eq: (k: string, v: unknown) => {
      filters[k] = v
      return builder
    },
    then: (resolve: (value: { data: null; error: null }) => void) => {
      resolve(apply())
    },
  }
  return builder
}

function actorFromAuthorizationHeader(header?: string): Actor {
  const token = (header ?? '').replace(/^Bearer\s+/i, '').trim()
  return actorsByToken[token] ?? { userId: 'anonymous', isMember: false, isOwner: false }
}

function buildMockClient(params?: { authorizationHeader?: string }) {
  const actor = actorFromAuthorizationHeader(params?.authorizationHeader)

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: actor.userId } },
        error: null,
      }),
    },
    rpc: vi.fn(async (fnName: string, params: Record<string, unknown>) => {
      if (fnName === 'is_business_member') return { data: actor.isMember, error: null }
      if (fnName === 'is_business_owner') return { data: actor.isOwner, error: null }

      if (fnName === 'transition_booking_state') {
        state.transitions.push(params)
        const bookingId = String(params.p_booking_id ?? '')
        const current = state.bookings.get(bookingId)
        if (current) {
          state.bookings.set(bookingId, {
            ...current,
            status: (params.p_next_status as string | null) ?? current.status,
            deposit_status: (params.p_next_deposit_status as string | null) ?? current.deposit_status,
          })
        }
        return { data: null, error: null }
      }

      return { data: null, error: null }
    }),
    from: vi.fn((table: string) => ({
      select: () => makeSelectBuilder(table),
      update: (patch: Record<string, unknown>) => makeUpdateBuilder(table, patch),
      insert: async (payload: Record<string, unknown>) => {
        if (table === 'booking_payments') {
          const alreadyOpen = Array.from(state.payments.values()).find(
            (p) =>
              p.booking_id === String(payload.booking_id) &&
              p.provider === 'stripe' &&
              p.kind === 'deposit' &&
              p.status === 'created',
          )
          if (alreadyOpen) {
            return { data: null, error: { code: '23505', message: 'booking_payments_open_created_unique' } }
          }
          const id = `pay_${state.payments.size + 1}`
          state.payments.set(id, {
            id,
            booking_id: String(payload.booking_id),
            provider: 'stripe',
            kind: 'deposit',
            amount_cents: Number(payload.amount_cents ?? 0),
            currency: String(payload.currency ?? 'eur'),
            status: String(payload.status ?? 'created'),
            stripe_session_id: typeof payload.stripe_session_id === 'string' ? payload.stripe_session_id : null,
            stripe_payment_intent_id:
              typeof payload.stripe_payment_intent_id === 'string' ? payload.stripe_payment_intent_id : null,
            created_at: new Date().toISOString(),
          })
        }
        if (table === 'stripe_webhook_events') {
          const eventId = String(payload.id ?? '')
          if (state.webhookEvents.has(eventId)) {
            return { data: null, error: { code: '23505', message: 'duplicate webhook event' } }
          }
          state.webhookEvents.add(eventId)
        }
        return { data: null, error: null }
      },
    })),
  }
}

vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: (...args: unknown[]) => createClientMock(...args),
  }
})

describe('stripe routes critical flows', () => {
  let app: unknown

  beforeAll(async () => {
    // Override .env.local: stripe routes return 503 when PAYMENTS_ENABLED is '0'.
    process.env.PAYMENTS_ENABLED = '1'
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon_test_key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test_key'
    process.env.STRIPE_SECRET_KEY = 'sk_test_123'
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_123'

    createClientMock.mockImplementation((...args: unknown[]) => {
      const options = (args[2] as { global?: { headers?: { Authorization?: string } } } | undefined) ?? undefined
      const authorizationHeader = options?.global?.headers?.Authorization
      return buildMockClient({ authorizationHeader })
    })
    ;({ default: app } = await import('../app'))
  })

  beforeEach(() => {
    state.bookings.clear()
    state.payments.clear()
    state.webhookEvents.clear()
    state.transitions.length = 0
    stripeRetrieveMock.mockReset()
    stripeCreateMock.mockReset()
    stripeRefundCreateMock.mockReset()
    stripeConstructEventMock.mockReset()
    createClientMock.mockClear()
    createClientMock.mockImplementation((...args: unknown[]) => {
      const options = (args[2] as { global?: { headers?: { Authorization?: string } } } | undefined) ?? undefined
      const authorizationHeader = options?.global?.headers?.Authorization
      return buildMockClient({ authorizationHeader })
    })
  })

  it('deposit verify marks payment paid and confirms pending_deposit booking', async () => {
    state.bookings.set('b1', {
      id: 'b1',
      customer_user_id: 'user_1',
      business_id: 'biz_1',
      status: 'pending_deposit',
      deposit_status: 'required',
      deposit_amount_cents: 1200,
      confirmed_at: null,
    })
    state.payments.set('pay_1', {
      id: 'pay_1',
      booking_id: 'b1',
      provider: 'stripe',
      kind: 'deposit',
      amount_cents: 1200,
      currency: 'eur',
      status: 'created',
      stripe_session_id: 'sess_1',
      stripe_payment_intent_id: null,
      created_at: new Date().toISOString(),
    })

    stripeRetrieveMock.mockResolvedValue({
      payment_status: 'paid',
      metadata: { booking_id: 'b1', customer_user_id: 'user_1' },
      payment_intent: 'pi_1',
    })

    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/stripe/deposit/verify')
      .set('Authorization', 'Bearer token_1')
      .send({ sessionId: 'sess_1' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.paid).toBe(true)
    expect(state.payments.get('pay_1')?.status).toBe('paid')
    expect(state.payments.get('pay_1')?.stripe_payment_intent_id).toBe('pi_1')
    expect(state.transitions.some((t) => t.p_next_status === 'confirmed' && t.p_next_deposit_status === 'paid')).toBe(true)
  })

  it('forfeit-by-business marks payment and booking deposit as forfeited', async () => {
    state.bookings.set('b2', {
      id: 'b2',
      customer_user_id: 'user_x',
      business_id: 'biz_2',
      status: 'confirmed',
      deposit_status: 'paid',
      deposit_amount_cents: 2000,
      confirmed_at: null,
    })
    state.payments.set('pay_2', {
      id: 'pay_2',
      booking_id: 'b2',
      provider: 'stripe',
      kind: 'deposit',
      amount_cents: 2000,
      currency: 'eur',
      status: 'paid',
      stripe_session_id: 'sess_2',
      stripe_payment_intent_id: 'pi_2',
      created_at: new Date().toISOString(),
    })

    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/stripe/deposit/forfeit-by-business')
      .set('Authorization', 'Bearer token_1')
      .send({ bookingId: 'b2' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.depositStatus).toBe('forfeited')
    expect(state.payments.get('pay_2')?.status).toBe('forfeited')
    expect(state.transitions.some((t) => t.p_booking_id === 'b2' && t.p_next_deposit_status === 'forfeited')).toBe(true)
  })

  it('staff can forfeit deposit when team member (aligned with dashboard)', async () => {
    state.bookings.set('b_staff', {
      id: 'b_staff',
      customer_user_id: 'user_x',
      business_id: 'biz_staff',
      status: 'confirmed',
      deposit_status: 'paid',
      deposit_amount_cents: 1500,
      confirmed_at: null,
    })
    state.payments.set('pay_staff', {
      id: 'pay_staff',
      booking_id: 'b_staff',
      provider: 'stripe',
      kind: 'deposit',
      amount_cents: 1500,
      currency: 'eur',
      status: 'paid',
      stripe_session_id: 'sess_staff',
      stripe_payment_intent_id: 'pi_staff',
      created_at: new Date().toISOString(),
    })

    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/stripe/deposit/forfeit-by-business')
      .set('Authorization', 'Bearer token_staff')
      .send({ bookingId: 'b_staff' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.depositStatus).toBe('forfeited')
    expect(state.payments.get('pay_staff')?.status).toBe('forfeited')
  })

  it('customer is forbidden on owner-only business cancellation action', async () => {
    state.bookings.set('b_customer', {
      id: 'b_customer',
      customer_user_id: 'user_x',
      business_id: 'biz_customer',
      status: 'confirmed',
      deposit_status: 'paid',
      deposit_amount_cents: 1600,
      confirmed_at: null,
    })
    state.payments.set('pay_customer', {
      id: 'pay_customer',
      booking_id: 'b_customer',
      provider: 'stripe',
      kind: 'deposit',
      amount_cents: 1600,
      currency: 'eur',
      status: 'paid',
      stripe_session_id: 'sess_customer',
      stripe_payment_intent_id: 'pi_customer',
      created_at: new Date().toISOString(),
    })

    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/stripe/deposit/cancel-by-business')
      .set('Authorization', 'Bearer token_customer')
      .send({ bookingId: 'b_customer' })

    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBe('Forbidden')
    expect(state.payments.get('pay_customer')?.status).toBe('paid')
  })

  it('deposit cancel on-time refunds payment and cancels booking', async () => {
    const start = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString()
    state.bookings.set('b3', {
      id: 'b3',
      customer_user_id: 'user_1',
      business_id: 'biz_3',
      status: 'confirmed',
      deposit_status: 'paid',
      deposit_amount_cents: 1500,
      confirmed_at: null,
      start_at: start,
      businesses: { cancellation_window_min: 120 },
    })
    state.payments.set('pay_3', {
      id: 'pay_3',
      booking_id: 'b3',
      provider: 'stripe',
      kind: 'deposit',
      amount_cents: 1500,
      currency: 'eur',
      status: 'paid',
      stripe_session_id: 'sess_3',
      stripe_payment_intent_id: 'pi_3',
      created_at: new Date().toISOString(),
    })
    stripeRefundCreateMock.mockResolvedValue({ id: 're_3' })

    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/stripe/deposit/cancel')
      .set('Authorization', 'Bearer token_1')
      .send({ bookingId: 'b3' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.inTime).toBe(true)
    expect(res.body.depositStatus).toBe('refunded')
    expect(stripeRefundCreateMock).toHaveBeenCalledTimes(1)
    expect(state.payments.get('pay_3')?.status).toBe('refunded')
    expect(
      state.transitions.some(
        (t) => t.p_booking_id === 'b3' && t.p_next_status === 'cancelled_by_customer' && t.p_next_deposit_status === 'refunded',
      ),
    ).toBe(true)
  })

  it('deposit cancel late forfeits payment without refund call', async () => {
    const start = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    state.bookings.set('b4', {
      id: 'b4',
      customer_user_id: 'user_1',
      business_id: 'biz_4',
      status: 'confirmed',
      deposit_status: 'paid',
      deposit_amount_cents: 1700,
      confirmed_at: null,
      start_at: start,
      businesses: { cancellation_window_min: 120 },
    })
    state.payments.set('pay_4', {
      id: 'pay_4',
      booking_id: 'b4',
      provider: 'stripe',
      kind: 'deposit',
      amount_cents: 1700,
      currency: 'eur',
      status: 'paid',
      stripe_session_id: 'sess_4',
      stripe_payment_intent_id: 'pi_4',
      created_at: new Date().toISOString(),
    })

    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/stripe/deposit/cancel')
      .set('Authorization', 'Bearer token_1')
      .send({ bookingId: 'b4' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.inTime).toBe(false)
    expect(res.body.depositStatus).toBe('forfeited')
    expect(stripeRefundCreateMock).not.toHaveBeenCalled()
    expect(state.payments.get('pay_4')?.status).toBe('forfeited')
  })

  it('cancel-by-business returns 409 when payment intent is missing', async () => {
    state.bookings.set('b5', {
      id: 'b5',
      customer_user_id: 'user_x',
      business_id: 'biz_5',
      status: 'confirmed',
      deposit_status: 'paid',
      deposit_amount_cents: 1900,
      confirmed_at: null,
    })
    state.payments.set('pay_5', {
      id: 'pay_5',
      booking_id: 'b5',
      provider: 'stripe',
      kind: 'deposit',
      amount_cents: 1900,
      currency: 'eur',
      status: 'paid',
      stripe_session_id: 'sess_5',
      stripe_payment_intent_id: null,
      created_at: new Date().toISOString(),
    })

    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/stripe/deposit/cancel-by-business')
      .set('Authorization', 'Bearer token_1')
      .send({ bookingId: 'b5' })

    expect(res.status).toBe(409)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toContain('Missing payment reference')
  })

  it('webhook duplicate delivery stays stable and keeps payment paid', async () => {
    state.bookings.set('b6', {
      id: 'b6',
      customer_user_id: 'user_1',
      business_id: 'biz_6',
      status: 'pending_deposit',
      deposit_status: 'required',
      deposit_amount_cents: 2100,
      confirmed_at: null,
    })
    state.payments.set('pay_6', {
      id: 'pay_6',
      booking_id: 'b6',
      provider: 'stripe',
      kind: 'deposit',
      amount_cents: 2100,
      currency: 'eur',
      status: 'created',
      stripe_session_id: 'sess_6',
      stripe_payment_intent_id: null,
      created_at: new Date().toISOString(),
    })

    stripeConstructEventMock.mockReturnValue({
      id: 'evt_6',
      type: 'checkout.session.completed',
      livemode: false,
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'sess_6',
          payment_status: 'paid',
          payment_intent: 'pi_6',
          metadata: { booking_id: 'b6' },
        },
      },
    })

    const first = await request(app as Parameters<typeof request>[0])
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'sig_test')
      .set('Content-Type', 'application/json')
      .send({ any: 'payload' })
    const second = await request(app as Parameters<typeof request>[0])
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'sig_test')
      .set('Content-Type', 'application/json')
      .send({ any: 'payload' })

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(second.body.duplicate).toBe(true)
    expect(state.payments.get('pay_6')?.status).toBe('paid')
    expect(state.payments.get('pay_6')?.stripe_payment_intent_id).toBe('pi_6')
    expect(state.webhookEvents.has('evt_6')).toBe(true)
  })

  it('deposit verify blocks paid session for closed booking state', async () => {
    state.bookings.set('b_closed', {
      id: 'b_closed',
      customer_user_id: 'user_1',
      business_id: 'biz_closed',
      status: 'cancelled_by_customer',
      deposit_status: 'required',
      deposit_amount_cents: 1200,
      confirmed_at: null,
    })
    state.payments.set('pay_closed', {
      id: 'pay_closed',
      booking_id: 'b_closed',
      provider: 'stripe',
      kind: 'deposit',
      amount_cents: 1200,
      currency: 'eur',
      status: 'created',
      stripe_session_id: 'sess_closed',
      stripe_payment_intent_id: null,
      created_at: new Date().toISOString(),
    })
    stripeRetrieveMock.mockResolvedValue({
      payment_status: 'paid',
      amount_total: 1200,
      metadata: { booking_id: 'b_closed', customer_user_id: 'user_1' },
      payment_intent: 'pi_closed',
    })

    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/stripe/deposit/verify')
      .set('Authorization', 'Bearer token_1')
      .send({ sessionId: 'sess_closed' })

    expect(res.status).toBe(409)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toContain('not payable')
    expect(state.payments.get('pay_closed')?.status).toBe('created')
  })

  it('deposit checkout reuses latest open stripe session on double click', async () => {
    state.bookings.set('b_reuse', {
      id: 'b_reuse',
      customer_user_id: 'user_1',
      business_id: 'biz_reuse',
      status: 'pending_deposit',
      deposit_status: 'required',
      deposit_amount_cents: 1800,
      confirmed_at: null,
    })
    state.payments.set('pay_reuse', {
      id: 'pay_reuse',
      booking_id: 'b_reuse',
      provider: 'stripe',
      kind: 'deposit',
      amount_cents: 1800,
      currency: 'eur',
      status: 'created',
      stripe_session_id: 'sess_reuse',
      stripe_payment_intent_id: null,
      created_at: new Date().toISOString(),
    })
    stripeRetrieveMock.mockResolvedValue({
      id: 'sess_reuse',
      payment_status: 'unpaid',
      url: 'https://checkout.stripe/reuse',
    })

    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/stripe/deposit/checkout')
      .set('Authorization', 'Bearer token_1')
      .send({ bookingId: 'b_reuse' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.reused).toBe(true)
    expect(res.body.url).toBe('https://checkout.stripe/reuse')
    expect(stripeCreateMock).not.toHaveBeenCalled()
    expect(state.payments.size).toBe(1)
  })

  it('deposit verify rejects amount mismatch between booking and payment record', async () => {
    state.bookings.set('b_mismatch', {
      id: 'b_mismatch',
      customer_user_id: 'user_1',
      business_id: 'biz_mismatch',
      status: 'pending_deposit',
      deposit_status: 'required',
      deposit_amount_cents: 3000,
      confirmed_at: null,
    })
    state.payments.set('pay_mismatch', {
      id: 'pay_mismatch',
      booking_id: 'b_mismatch',
      provider: 'stripe',
      kind: 'deposit',
      amount_cents: 1000,
      currency: 'eur',
      status: 'created',
      stripe_session_id: 'sess_mismatch',
      stripe_payment_intent_id: null,
      created_at: new Date().toISOString(),
    })
    stripeRetrieveMock.mockResolvedValue({
      payment_status: 'paid',
      amount_total: 1000,
      metadata: { booking_id: 'b_mismatch', customer_user_id: 'user_1' },
      payment_intent: 'pi_mismatch',
    })

    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/stripe/deposit/verify')
      .set('Authorization', 'Bearer token_1')
      .send({ sessionId: 'sess_mismatch' })

    expect(res.status).toBe(409)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toContain('amount mismatch')
    expect(state.payments.get('pay_mismatch')?.status).toBe('created')
    expect(state.transitions.some((t) => t.p_booking_id === 'b_mismatch')).toBe(false)
  })

  it('webhook returns duplicate when event id was already processed', async () => {
    state.webhookEvents.add('evt_done')
    stripeConstructEventMock.mockReturnValue({
      id: 'evt_done',
      type: 'checkout.session.completed',
      livemode: false,
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'sess_done',
          payment_status: 'paid',
          payment_intent: 'pi_done',
          metadata: { booking_id: 'b_done' },
        },
      },
    })

    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/stripe/webhook')
      .set('stripe-signature', 'sig_test')
      .set('Content-Type', 'application/json')
      .send({ any: 'payload' })

    expect(res.status).toBe(200)
    expect(res.body.received).toBe(true)
    expect(res.body.duplicate).toBe(true)
  })
})
