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

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? null
if (!connectionString) {
  process.stderr.write('[db-dump-paid-plans] Missing DATABASE_URL/SUPABASE_DB_URL\n')
  process.exit(2)
}

const useSsl = pgSslFromEnv('db-dump-paid-plans')

const url = new URL(connectionString)
url.searchParams.delete('sslmode')
url.searchParams.delete('uselibpqcompat')

const client = new Client({ connectionString: url.toString(), ssl: useSsl })
await client.connect()

try {
  const r = await client.query(
    "select id,target_audience,price_cents,is_active,stripe_product_id,stripe_price_id from public.subscription_plans where price_cents > 0 order by target_audience asc, id asc",
  )
  process.stdout.write(`${JSON.stringify(r.rows, null, 2)}\n`)
} finally {
  await client.end()
}
