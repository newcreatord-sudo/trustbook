import { Router, type Request, type Response } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { syncTrustBookSaasFromCheckoutSession } from '../lib/stripeSaasSync.js'
import { readEnvAny } from '../lib/env.js'

const router = Router()

type PlanChangeDecision = 'approved' | 'rejected'

function getBearerToken(req: Request): string | null {
  const h = req.header('authorization') || req.header('Authorization')
  if (!h) return null
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m?.[1]?.trim() ?? null
}

function readAdminToken(req: Request): string | null {
  const h = req.header('x-admin-signup-token') || req.header('X-Admin-Signup-Token')
  if (!h) return null
  const s = String(h).trim()
  return s || null
}

function asDecision(v: unknown): PlanChangeDecision | null {
  return v === 'approved' || v === 'rejected' ? v : null
}

function mustSupabaseAdmin() {
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

async function requireUserId(req: Request): Promise<string | null> {
  const u = await requireAuthUser(req)
  return u?.id ?? null
}

async function requireAuthUser(req: Request): Promise<{ id: string; email: string | null } | null> {
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
  return { id: data.user.id, email: data.user.email ?? null }
}

function stripeOptional(): Stripe | null {
  const key = readEnvAny(['STRIPE_SECRET_KEY', 'STRIPE_SK', 'STRIPE_SECRET'])
  if (!key) return null
  return new Stripe(key, { apiVersion: '2026-03-25.dahlia' })
}

function checkoutAppBaseUrl(req: Request): string {
  const fromEnv = readEnvAny(['APP_BASE_URL', 'VITE_APP_URL'])
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) ?? 'http'
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host
  if (!host) return 'http://localhost:5173'
  return `${proto}://${host}`.replace(/\/$/, '')
}

async function isBusinessOwner(params: { req: Request; businessId: string }): Promise<boolean> {
  const supabaseUrl = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const anonKey = readEnvAny(['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON', 'anon_key'])
  const token = getBearerToken(params.req)
  if (!supabaseUrl || !anonKey || !token) return false
  const sb = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data, error } = await sb.rpc('is_business_owner', { bid: params.businessId })
  if (error) return false
  return Boolean(data)
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

/** Columns needed for Stripe Checkout subscription mode */
type SubscriptionPlanCheckoutRow = {
  target_audience: string
  price_cents: number
  is_active: boolean
  stripe_price_id: string | null
}

router.get('/business/change-requests', async (req: Request, res: Response): Promise<void> => {
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

    const owner = await isBusinessOwner({ req, businessId })
    if (!owner) {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }

    const sbAdmin = mustSupabaseAdmin()
    const { data, error } = await sbAdmin
      .from('subscription_change_requests')
      .select('id,business_id,current_plan_id,target_plan_id,status,request_note,admin_note,resolved_at,created_at,updated_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(10)
    if (error) throw error
    res.status(200).json({ success: true, rows: data ?? [] })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'Service error' })
  }
})

router.post('/business/request-change', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = await requireUserId(req)
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = String(req.body?.businessId ?? '').trim()
    const targetPlanId = String(req.body?.targetPlanId ?? '').trim()
    const noteRaw = typeof req.body?.note === 'string' ? req.body.note.trim() : ''
    const note = noteRaw ? noteRaw.slice(0, 500) : null
    if (!businessId || !targetPlanId) {
      res.status(400).json({ success: false, error: 'Missing businessId or targetPlanId' })
      return
    }

    const owner = await isBusinessOwner({ req, businessId })
    if (!owner) {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }

    const sbAdmin = mustSupabaseAdmin()
    const { data: requestId, error } = await sbAdmin.rpc('request_business_plan_change', {
      p_business_id: businessId,
      p_target_plan_id: targetPlanId,
      p_note: note,
    })
    if (error) {
      const msg = String(error.message ?? 'Request failed')
      const isConflict =
        msg.includes('already_on_target_plan') ||
        msg.includes('target_plan_not_active') ||
        msg.includes('subscription_not_found')
      res.status(isConflict ? 409 : 400).json({ success: false, error: msg })
      return
    }

    const { data: requestRow, error: rowErr } = await sbAdmin
      .from('subscription_change_requests')
      .select('id,business_id,current_plan_id,target_plan_id,status,request_note,created_at,updated_at')
      .eq('id', requestId)
      .maybeSingle()
    if (rowErr) throw rowErr

    res.status(200).json({ success: true, request: requestRow })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'Service error' })
  }
})

router.post('/business/resolve-change', async (req: Request, res: Response): Promise<void> => {
  try {
    const expected = readEnvAny(['AUTH_ADMIN_SIGNUP_TOKEN', 'ADMIN_SIGNUP_TOKEN'])
    const provided = readAdminToken(req)
    if (!expected || !provided) {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }
    const eb = Buffer.from(expected)
    const pb = Buffer.from(provided)
    if (eb.length !== pb.length || !timingSafeEqual(eb, pb)) {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }

    const requestId = String(req.body?.requestId ?? '').trim()
    const decision = asDecision(req.body?.decision)
    const adminNoteRaw = typeof req.body?.adminNote === 'string' ? req.body.adminNote.trim() : ''
    const adminNote = adminNoteRaw ? adminNoteRaw.slice(0, 500) : null
    const adminUserIdRaw = typeof req.body?.adminUserId === 'string' ? req.body.adminUserId.trim() : ''
    const adminUserId = adminUserIdRaw && isUuid(adminUserIdRaw) ? adminUserIdRaw : null
    if (!requestId || !decision) {
      res.status(400).json({ success: false, error: 'Missing requestId or invalid decision' })
      return
    }

    const sbAdmin = mustSupabaseAdmin()
    const { data: requestRow, error: reqErr } = await sbAdmin
      .from('subscription_change_requests')
      .select('id,business_id,current_plan_id,target_plan_id,status')
      .eq('id', requestId)
      .maybeSingle()
    if (reqErr) throw reqErr
    if (!requestRow) {
      res.status(404).json({ success: false, error: 'Request not found' })
      return
    }

    const currentStatus = String(requestRow.status ?? '')
    if (currentStatus !== 'pending') {
      res.status(409).json({ success: false, error: 'Request already resolved' })
      return
    }

    if (decision === 'approved') {
      const { error: subErr } = await sbAdmin
        .from('business_subscriptions')
        .update({
          plan_id: requestRow.target_plan_id,
          status: 'active',
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        })
        .eq('business_id', requestRow.business_id)
      if (subErr) throw subErr
    }

    const resolvedAt = new Date().toISOString()
    const { error: updateErr } = await sbAdmin
      .from('subscription_change_requests')
      .update({
        status: decision,
        admin_note: adminNote,
        resolved_by_user_id: adminUserId,
        resolved_at: resolvedAt,
      })
      .eq('id', requestId)
    if (updateErr) throw updateErr

    const { error: eventErr } = await sbAdmin.from('subscription_change_request_events').insert({
      request_id: requestId,
      action: decision,
      actor_user_id: adminUserId,
      metadata: {
        from_plan_id: requestRow.current_plan_id,
        to_plan_id: requestRow.target_plan_id,
      },
    })
    if (eventErr) throw eventErr

    res.status(200).json({
      success: true,
      requestId,
      decision,
      resolvedAt,
    })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'Service error' })
  }
})

// SaaS subscription: Checkout Stripe crea/cattura il pagamento lato Stripe; sincronizzare plan_id/status su business_subscriptions richiede webhook dedicati (non il webhook caparra prenotazioni).
router.post('/business/checkout-session', async (req: Request, res: Response): Promise<void> => {
  try {
    const provider = String(req.body?.provider ?? 'stripe').trim().toLowerCase()
    if (provider === 'mollie') {
      res.status(501).json({
        success: false,
        code: 'mollie_not_implemented',
        error:
          'Checkout Mollie non ancora integrato: usa richiesta piano manuale o configura l’API Subscriptions Mollie.',
      })
      return
    }

    const authUser = await requireAuthUser(req)
    if (!authUser) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const stripe = stripeOptional()
    if (!stripe) {
      res.status(503).json({
        success: false,
        code: 'stripe_not_configured',
        error: 'Stripe non configurato sul server (manca STRIPE_SECRET_KEY).',
      })
      return
    }

    const businessId = String(req.body?.businessId ?? '').trim()
    const targetPlanId = String(req.body?.targetPlanId ?? '').trim()
    if (!businessId || !targetPlanId) {
      res.status(400).json({ success: false, error: 'Missing businessId or targetPlanId' })
      return
    }

    const owner = await isBusinessOwner({ req, businessId })
    if (!owner) {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }

    const sbAdmin = mustSupabaseAdmin()

    const { data: planRow, error: planErr } = await sbAdmin
      .from('subscription_plans')
      .select('id,target_audience,price_cents,is_active,stripe_price_id')
      .eq('id', targetPlanId)
      .maybeSingle()
    if (planErr) throw planErr

    const plan = planRow as SubscriptionPlanCheckoutRow | null
    if (!plan || plan.is_active === false) {
      res.status(404).json({ success: false, error: 'Plan not found or inactive' })
      return
    }
    if (plan.target_audience !== 'business') {
      res.status(400).json({ success: false, error: 'Invalid plan audience' })
      return
    }
    if (plan.price_cents <= 0) {
      res.status(400).json({
        success: false,
        code: 'free_plan_checkout',
        error: 'Il piano selezionato è gratuito: checkout non necessario.',
      })
      return
    }

    const stripePriceId =
      typeof plan.stripe_price_id === 'string' && plan.stripe_price_id.trim().length > 0 ? plan.stripe_price_id.trim() : null
    if (!stripePriceId) {
      res.status(409).json({
        success: false,
        code: 'plan_missing_stripe_price',
        error:
          'Questo piano non ha stripe_price_id nel catalogo: impostalo su subscription_plans o usa richiesta manuale.',
      })
      return
    }

    const { data: subRow, error: subErr } = await sbAdmin
      .from('business_subscriptions')
      .select('plan_id,stripe_customer_id')
      .eq('business_id', businessId)
      .maybeSingle()
    if (subErr) throw subErr
    type SubSel = { plan_id: string; stripe_customer_id: string | null }
    const bs = subRow as SubSel | null
    if (!bs) {
      res.status(409).json({ success: false, error: 'business_subscription_missing' })
      return
    }
    if (bs.plan_id === targetPlanId) {
      res.status(409).json({ success: false, error: 'already_on_target_plan' })
      return
    }

    let stripeCustomerId = typeof bs.stripe_customer_id === 'string' ? bs.stripe_customer_id.trim() : null
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: authUser.email ?? undefined,
        metadata: { trustbook_scope: 'business', business_id: businessId },
      })
      stripeCustomerId = customer.id
      const { error: upErr } = await sbAdmin
        .from('business_subscriptions')
        .update({ stripe_customer_id: stripeCustomerId, updated_at: new Date().toISOString() })
        .eq('business_id', businessId)
      if (upErr) throw upErr
    }

    const base = checkoutAppBaseUrl(req)
    const successUrl = `${base}/dashboard-attivita?subscriptionCheckout=success&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${base}/dashboard-attivita?subscriptionCheckout=cancel`

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: `business:${businessId}:${targetPlanId}`,
      metadata: {
        trustbook_kind: 'saas_business_subscription',
        business_id: businessId,
        plan_id: targetPlanId,
      },
      subscription_data: {
        metadata: {
          trustbook_kind: 'saas_business_subscription',
          business_id: businessId,
          plan_id: targetPlanId,
        },
      },
    })

    if (!session.url) {
      res.status(502).json({ success: false, error: 'stripe_session_missing_url' })
      return
    }

    res.status(200).json({
      success: true,
      url: session.url,
      sessionId: session.id,
      provider: 'stripe',
    })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'Service error' })
  }
})

// Stesso schema webhook SaaS cliente → aggiornare customer_subscriptions da eventi Stripe subscription.

router.post('/customer/checkout-session', async (req: Request, res: Response): Promise<void> => {
  try {
    const provider = String(req.body?.provider ?? 'stripe').trim().toLowerCase()
    if (provider === 'mollie') {
      res.status(501).json({
        success: false,
        code: 'mollie_not_implemented',
        error:
          'Checkout Mollie non ancora integrato: usa richiesta piano manuale o configura l’API Subscriptions Mollie.',
      })
      return
    }

    const authUser = await requireAuthUser(req)
    if (!authUser) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const stripe = stripeOptional()
    if (!stripe) {
      res.status(503).json({
        success: false,
        code: 'stripe_not_configured',
        error: 'Stripe non configurato sul server (manca STRIPE_SECRET_KEY).',
      })
      return
    }

    const targetPlanId = String(req.body?.targetPlanId ?? '').trim()
    if (!targetPlanId) {
      res.status(400).json({ success: false, error: 'Missing targetPlanId' })
      return
    }

    const sbAdmin = mustSupabaseAdmin()

    const { data: planRow, error: planErr } = await sbAdmin
      .from('subscription_plans')
      .select('id,target_audience,price_cents,is_active,stripe_price_id')
      .eq('id', targetPlanId)
      .maybeSingle()
    if (planErr) throw planErr

    const plan = planRow as SubscriptionPlanCheckoutRow | null
    if (!plan || plan.is_active === false) {
      res.status(404).json({ success: false, error: 'Plan not found or inactive' })
      return
    }
    if (plan.target_audience !== 'customer') {
      res.status(400).json({ success: false, error: 'Invalid plan audience' })
      return
    }
    if (plan.price_cents <= 0) {
      res.status(400).json({
        success: false,
        code: 'free_plan_checkout',
        error: 'Il piano selezionato è gratuito: checkout non necessario.',
      })
      return
    }

    const stripePriceId =
      typeof plan.stripe_price_id === 'string' && plan.stripe_price_id.trim().length > 0 ? plan.stripe_price_id.trim() : null
    if (!stripePriceId) {
      res.status(409).json({
        success: false,
        code: 'plan_missing_stripe_price',
        error:
          'Questo piano non ha stripe_price_id nel catalogo: impostalo su subscription_plans o usa richiesta manuale.',
      })
      return
    }

    const { data: csRow0, error: csErr } = await sbAdmin
      .from('customer_subscriptions')
      .select('plan_id,stripe_customer_id')
      .eq('customer_id', authUser.id)
      .maybeSingle()
    if (csErr) throw csErr
    let csRow = csRow0

    if (!csRow) {
      const ins = await sbAdmin
        .from('customer_subscriptions')
        .insert({
          customer_id: authUser.id,
          plan_id: 'customer_free',
          status: 'active',
          cancel_at_period_end: false,
        })
        .select('plan_id,stripe_customer_id')
        .maybeSingle()
      if (ins.error) {
        const code = (ins.error as { code?: string }).code
        if (code !== '23505') throw ins.error
      }
      const again = await sbAdmin
        .from('customer_subscriptions')
        .select('plan_id,stripe_customer_id')
        .eq('customer_id', authUser.id)
        .maybeSingle()
      if (again.error) throw again.error
      csRow = again.data
    }

    type CsSel = { plan_id: string; stripe_customer_id: string | null }
    const cs = csRow as CsSel | null
    if (!cs) {
      res.status(409).json({ success: false, error: 'customer_subscription_missing' })
      return
    }
    if (cs.plan_id === targetPlanId) {
      res.status(409).json({ success: false, error: 'already_on_target_plan' })
      return
    }

    let stripeCustomerId = typeof cs.stripe_customer_id === 'string' ? cs.stripe_customer_id.trim() : null
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: authUser.email ?? undefined,
        metadata: { trustbook_scope: 'customer', customer_id: authUser.id },
      })
      stripeCustomerId = customer.id
      const { error: upErr } = await sbAdmin
        .from('customer_subscriptions')
        .update({ stripe_customer_id: stripeCustomerId, updated_at: new Date().toISOString() })
        .eq('customer_id', authUser.id)
      if (upErr) throw upErr
    }

    const base = checkoutAppBaseUrl(req)
    const successUrl = `${base}/impostazioni?subscriptionCheckout=success&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${base}/impostazioni?subscriptionCheckout=cancel`

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: `customer:${authUser.id}:${targetPlanId}`,
      metadata: {
        trustbook_kind: 'saas_customer_subscription',
        customer_id: authUser.id,
        plan_id: targetPlanId,
      },
      subscription_data: {
        metadata: {
          trustbook_kind: 'saas_customer_subscription',
          customer_id: authUser.id,
          plan_id: targetPlanId,
        },
      },
    })

    if (!session.url) {
      res.status(502).json({ success: false, error: 'stripe_session_missing_url' })
      return
    }

    res.status(200).json({
      success: true,
      url: session.url,
      sessionId: session.id,
      provider: 'stripe',
    })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'Service error' })
  }
})

/**
 * Fallback client: applica lo stesso aggiornamento DB del webhook quando l’utente torna dal Checkout
 * (utile se il webhook è in ritardo). Verifica ownership su business_id / customer_id nei metadata sessione.
 */
router.post('/stripe/confirm-session', async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = await requireAuthUser(req)
    if (!authUser) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const sessionId = String(req.body?.sessionId ?? '').trim()
    const expectedBusinessId = String(req.body?.businessId ?? '').trim()
    if (!sessionId) {
      res.status(400).json({ success: false, error: 'Missing sessionId' })
      return
    }

    const stripe = stripeOptional()
    if (!stripe) {
      res.status(503).json({
        success: false,
        code: 'stripe_not_configured',
        error: 'Stripe non configurato sul server (manca STRIPE_SECRET_KEY).',
      })
      return
    }

    let session: Stripe.Checkout.Session
    try {
      session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['subscription'] })
    } catch {
      res.status(400).json({ success: false, error: 'invalid_or_expired_session' })
      return
    }

    const kind = session.metadata?.trustbook_kind ?? ''
    if (kind === 'saas_business_subscription') {
      const bid = String(session.metadata?.business_id ?? '').trim()
      if (!bid) {
        res.status(400).json({ success: false, error: 'missing_business_metadata' })
        return
      }
      if (expectedBusinessId && bid !== expectedBusinessId) {
        res.status(403).json({ success: false, error: 'business_session_mismatch' })
        return
      }
      const owner = await isBusinessOwner({ req, businessId: bid })
      if (!owner) {
        res.status(403).json({ success: false, error: 'Forbidden' })
        return
      }
    } else if (kind === 'saas_customer_subscription') {
      const cid = String(session.metadata?.customer_id ?? '').trim()
      if (!cid || cid !== authUser.id) {
        res.status(403).json({ success: false, error: 'Forbidden' })
        return
      }
    } else {
      res.status(400).json({ success: false, error: 'session_not_saas_subscription' })
      return
    }

    const sbAdmin = mustSupabaseAdmin()
    try {
      const ok = await syncTrustBookSaasFromCheckoutSession(sbAdmin, stripe, session)
      if (!ok) {
        res.status(409).json({ success: false, error: 'saas_sync_not_applicable' })
        return
      }
    } catch (e: unknown) {
      res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'saas_sync_failed' })
      return
    }

    res.status(200).json({ success: true })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'Service error' })
  }
})

export default router
