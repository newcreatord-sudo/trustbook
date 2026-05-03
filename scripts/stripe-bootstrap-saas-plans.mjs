import process from 'node:process'
import { resolve } from 'node:path'
import dotenv from 'dotenv'
import { Client } from 'pg'
import Stripe from 'stripe'
import { pgSslFromEnv } from './lib/pg-ssl.mjs'

const envFileArg = process.argv.find((x) => x.startsWith('--env-file=')) ?? null
if (envFileArg) {
  const envFile = envFileArg.slice('--env-file='.length).trim()
  if (envFile) dotenv.config({ path: resolve(process.cwd(), envFile), override: true })
}

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

function readArg(name) {
  const raw = process.argv.find((x) => x.startsWith(`--${name}=`)) ?? null
  if (!raw) return null
  const v = raw.slice(`--${name}=`.length).trim()
  return v.length ? v : null
}

function readMultiArg(name) {
  return process.argv
    .filter((x) => x.startsWith(`--${name}=`))
    .map((x) => x.slice(`--${name}=`.length).trim())
    .filter((v) => v.length > 0)
}

function envAny(keys) {
  for (const k of keys) {
    const v = process.env[k]
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return null
}

const stripeKey = envAny(['STRIPE_SECRET_KEY', 'STRIPE_SK', 'STRIPE_SECRET'])
if (!stripeKey) {
  process.stderr.write('[stripe-bootstrap-saas-plans] Missing STRIPE_SECRET_KEY\n')
  process.exit(2)
}

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? null
if (!connectionString) {
  process.stderr.write('[stripe-bootstrap-saas-plans] Missing DATABASE_URL/SUPABASE_DB_URL\n')
  process.exit(2)
}

const audience = (readArg('audience') ?? 'all').toLowerCase()
if (!['all', 'business', 'customer'].includes(audience)) {
  process.stderr.write('[stripe-bootstrap-saas-plans] Invalid --audience (expect all|business|customer)\n')
  process.exit(2)
}

const currency = (readArg('currency') ?? 'eur').toLowerCase()
if (!/^[a-z]{3}$/.test(currency)) {
  process.stderr.write('[stripe-bootstrap-saas-plans] Invalid --currency (expect ISO 4217 like eur)\n')
  process.exit(2)
}

const dryRun = (readArg('dry-run') ?? '0') === '1'
const force = (readArg('force') ?? '0') === '1'
const includeVip = (readArg('include-vip') ?? '0') === '1'
const planIds = readMultiArg('plan')

const createWebhookUrl = readArg('create-webhook-url')
const webhookEventsRaw = readArg('webhook-events')
const webhookEvents = (webhookEventsRaw ?? 'checkout.session.completed,customer.subscription.updated,customer.subscription.deleted')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

const stripe = new Stripe(stripeKey, { apiVersion: '2026-03-25.dahlia' })

function recurringInterval(billingInterval) {
  if (billingInterval === 'monthly') return 'month'
  if (billingInterval === 'yearly') return 'year'
  return null
}

async function findOrCreateProduct(params) {
  const meta = { trustbook_plan_id: params.planId, trustbook_target_audience: params.targetAudience }

  if (params.existingProductId && !force) {
    try {
      const p = await stripe.products.retrieve(params.existingProductId)
      if (p && !p.deleted) return p
    } catch {
      // fallback to search/create
    }
  }

  try {
    const r = await stripe.products.search({
      query: `metadata['trustbook_plan_id']:'${params.planId.replace(/'/g, "\\'")}'`,
      limit: 1,
    })
    const found = r.data?.[0] ?? null
    if (found) return found
  } catch {
    // fallback to create
  }

  return await stripe.products.create({
    name: params.name,
    description: params.description ?? undefined,
    metadata: meta,
  })
}

async function findOrCreateRecurringPrice(params) {
  const meta = { trustbook_plan_id: params.planId, trustbook_target_audience: params.targetAudience }

  if (params.existingPriceId && !force) {
    try {
      const p = await stripe.prices.retrieve(params.existingPriceId)
      if (p && !p.deleted) return p
    } catch {
      // fallback to search/create
    }
  }

  try {
    const q = `metadata['trustbook_plan_id']:'${params.planId.replace(/'/g, "\\'")}' AND active:'true'`
    const r = await stripe.prices.search({ query: q, limit: 10 })
    const candidates = Array.isArray(r.data) ? r.data : []
    const match =
      candidates.find((p) => {
        const amount = typeof p.unit_amount === 'number' ? p.unit_amount : null
        const currOk = typeof p.currency === 'string' && p.currency.toLowerCase() === params.currency
        const intervalOk = p.recurring?.interval === params.interval
        return p.active && currOk && intervalOk && amount === params.amountCents
      }) ?? null
    if (match) return match
  } catch {
    // fallback to create
  }

  return await stripe.prices.create({
    currency: params.currency,
    unit_amount: params.amountCents,
    recurring: { interval: params.interval },
    product: params.productId,
    nickname: params.planId,
    metadata: meta,
  })
}

async function createWebhookEndpoint(url) {
  const existing = await stripe.webhookEndpoints.list({ limit: 100 })
  const found = existing.data.find((x) => x.url === url) ?? null
  if (found) return found
  return await stripe.webhookEndpoints.create({ url, enabled_events: webhookEvents })
}

const useSsl = pgSslFromEnv('stripe-bootstrap-saas-plans')

const url = new URL(connectionString)
url.searchParams.delete('sslmode')
url.searchParams.delete('uselibpqcompat')

const client = new Client({ connectionString: url.toString(), ssl: useSsl })
await client.connect()

try {
  const filters = []
  const values = []
  let idx = 1

  filters.push('is_active = true')
  filters.push("billing_interval in ('monthly','yearly','lifetime')")
  if (audience !== 'all') {
    filters.push(`target_audience = $${idx++}`)
    values.push(audience)
  }
  if (planIds.length > 0) {
    filters.push(`id = any($${idx++})`)
    values.push(planIds)
  }

  const sql = `
    select id, target_audience, name, description, price_cents, billing_interval, stripe_product_id, stripe_price_id, is_active
    from public.subscription_plans
    where ${filters.join(' and ')}
    order by target_audience asc, id asc
  `
  const { rows } = await client.query(sql, values)

  if (createWebhookUrl) {
    process.stdout.write(`[stripe-bootstrap-saas-plans] Webhook endpoint: ${createWebhookUrl}\n`)
    if (!dryRun) {
      const wh = await createWebhookEndpoint(createWebhookUrl)
      process.stdout.write(`[stripe-bootstrap-saas-plans] Webhook OK: ${wh.id}\n`)
    } else {
      process.stdout.write('[stripe-bootstrap-saas-plans] dry-run=1: skipping webhook create\n')
    }
  }

  let processed = 0
  let updated = 0

  for (const r of rows) {
    const planId = String(r.id)
    const targetAudience = String(r.target_audience)
    const name = String(r.name)
    const description = typeof r.description === 'string' ? r.description : null
    const amountCents = Number(r.price_cents ?? 0)
    const billingInterval = String(r.billing_interval)
    const existingProductId = typeof r.stripe_product_id === 'string' ? r.stripe_product_id : null
    const existingPriceId = typeof r.stripe_price_id === 'string' ? r.stripe_price_id : null

    if (!includeVip && /^customer_vip$/i.test(planId)) continue

    if (!Number.isFinite(amountCents) || amountCents <= 0) continue

    const interval = recurringInterval(billingInterval)
    if (!interval) {
      process.stdout.write(`[stripe-bootstrap-saas-plans] Skip ${planId}: billing_interval not supported for recurring price (${billingInterval})\n`)
      continue
    }

    processed += 1
    process.stdout.write(`[stripe-bootstrap-saas-plans] Plan ${planId}: ensure Product/Price\n`)

    if (dryRun) continue

    const product = await findOrCreateProduct({
      planId,
      targetAudience,
      name: `${name}`,
      description,
      existingProductId,
    })

    const price = await findOrCreateRecurringPrice({
      planId,
      targetAudience,
      currency,
      amountCents,
      interval,
      productId: product.id,
      existingPriceId,
    })

    const sets = []
    const updateValues = []
    let u = 1
    if (force || !existingProductId) {
      sets.push(`stripe_product_id = $${u++}`)
      updateValues.push(product.id)
    }
    if (force || !existingPriceId) {
      sets.push(`stripe_price_id = $${u++}`)
      updateValues.push(price.id)
    }

    if (sets.length === 0) continue
    updateValues.push(planId)

    const upSql = `update public.subscription_plans set ${sets.join(', ')} where id = $${u} returning id`
    const res = await client.query(upSql, updateValues)
    if (res.rowCount === 1) updated += 1
  }

  process.stdout.write(`[stripe-bootstrap-saas-plans] Done. processed=${processed} updated=${updated} dryRun=${dryRun ? '1' : '0'}\n`)
} finally {
  await client.end()
}
