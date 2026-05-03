import process from 'node:process'
import { Client } from 'pg'
import dotenv from 'dotenv'
import { resolve } from 'node:path'
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

const planId = readArg('plan')
const stripePriceId = readArg('stripe-price')
const stripeProductId = readArg('stripe-product')
const mollieSku = readArg('mollie-sku')
const clearStripePrice = readArg('clear-stripe-price')
const clearStripeProduct = readArg('clear-stripe-product')
const clearMollieSku = readArg('clear-mollie-sku')
const priceCentsRaw = readArg('price-cents')
const activateRaw = readArg('activate')

if (!planId) {
  process.stderr.write('[stripe-set-plan-psp] Missing --plan=<plan_id>\n')
  process.exit(2)
}

if (
  !stripePriceId &&
  !stripeProductId &&
  !mollieSku &&
  !priceCentsRaw &&
  !activateRaw &&
  clearStripePrice === null &&
  clearStripeProduct === null &&
  clearMollieSku === null
) {
  process.stderr.write(
    '[stripe-set-plan-psp] Provide at least one of --stripe-price= --stripe-product= --mollie-sku= --price-cents= --activate=0|1 --clear-stripe-price=1 --clear-stripe-product=1 --clear-mollie-sku=1\n',
  )
  process.exit(2)
}

let priceCents = null
if (priceCentsRaw !== null) {
  const n = Number.parseInt(priceCentsRaw, 10)
  if (Number.isNaN(n) || n < 0) {
    process.stderr.write('[stripe-set-plan-psp] Invalid --price-cents (expect int >= 0)\n')
    process.exit(2)
  }
  priceCents = n
}

let activate = null
if (activateRaw !== null) {
  if (!['0', '1'].includes(activateRaw)) {
    process.stderr.write('[stripe-set-plan-psp] Invalid --activate (expect 0 or 1)\n')
    process.exit(2)
  }
  activate = activateRaw === '1'
}

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? null
if (!connectionString) {
  process.stderr.write('[stripe-set-plan-psp] Missing DATABASE_URL/SUPABASE_DB_URL.\n')
  process.exit(2)
}

const useSsl = pgSslFromEnv('stripe-set-plan-psp')

const url = new URL(connectionString)
url.searchParams.delete('sslmode')
url.searchParams.delete('uselibpqcompat')

const client = new Client({ connectionString: url.toString(), ssl: useSsl })
await client.connect()

try {
  const doClearStripePrice = clearStripePrice === '1'
  const doClearStripeProduct = clearStripeProduct === '1'
  const doClearMollieSku = clearMollieSku === '1'

  const update = {
    stripe_price_id: doClearStripePrice ? null : stripePriceId ?? undefined,
    stripe_product_id: doClearStripeProduct ? null : stripeProductId ?? undefined,
    mollie_sku: doClearMollieSku ? null : mollieSku ?? undefined,
    price_cents: priceCents,
    is_active: activate,
  }

  const sets = []
  const values = []
  let idx = 1
  for (const [k, v] of Object.entries(update)) {
    if (v === undefined) continue
    if (v === null && (k === 'price_cents' || k === 'is_active')) continue
    sets.push(`${k} = $${idx++}`)
    values.push(v)
  }
  if (sets.length === 0) {
    process.stderr.write('[stripe-set-plan-psp] Nothing to update (check args).\n')
    process.exit(2)
  }
  values.push(planId)
  const sql = `update public.subscription_plans set ${sets.join(', ')} where id = $${idx} returning id, target_audience, name, price_cents, is_active, stripe_product_id, stripe_price_id, mollie_sku`
  const r = await client.query(sql, values)

  if (r.rowCount !== 1) {
    process.stderr.write(`[stripe-set-plan-psp] Plan not found: ${planId}\n`)
    process.exit(1)
  }

  process.stdout.write(`[stripe-set-plan-psp] OK\n${JSON.stringify(r.rows[0], null, 2)}\n`)
} finally {
  await client.end()
}
