import process from 'node:process'
import { resolve } from 'node:path'
import dotenv from 'dotenv'
import { Client } from 'pg'
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

const businessId = readArg('business-id')
const customerUserId = readArg('customer-user-id')
if (!businessId && !customerUserId) {
  process.stderr.write('[db-get-subscription] Provide --business-id=<uuid> or --customer-user-id=<uuid>\n')
  process.exit(2)
}
if (businessId && customerUserId) {
  process.stderr.write('[db-get-subscription] Provide only one of --business-id or --customer-user-id\n')
  process.exit(2)
}

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? null
if (!connectionString) {
  process.stderr.write('[db-get-subscription] Missing DATABASE_URL/SUPABASE_DB_URL\n')
  process.exit(2)
}

const useSsl = pgSslFromEnv('db-get-subscription')

const url = new URL(connectionString)
url.searchParams.delete('sslmode')
url.searchParams.delete('uselibpqcompat')

const client = new Client({ connectionString: url.toString(), ssl: useSsl })
await client.connect()

try {
  if (businessId) {
    const r = await client.query(
      'select business_id,plan_id,status,stripe_customer_id,stripe_subscription_id,current_period_end,created_at,updated_at from public.business_subscriptions where business_id = $1 limit 1',
      [businessId],
    )
    process.stdout.write(`${JSON.stringify(r.rows[0] ?? null, null, 2)}\n`)
    process.exit(0)
  }

  const r = await client.query(
    'select user_id,plan_id,status,stripe_customer_id,stripe_subscription_id,current_period_end,created_at,updated_at from public.customer_subscriptions where user_id = $1 limit 1',
    [customerUserId],
  )
  process.stdout.write(`${JSON.stringify(r.rows[0] ?? null, null, 2)}\n`)
} finally {
  await client.end()
}
