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

const limitArg = process.argv.find((x) => x.startsWith('--limit=')) ?? null
const limit = (() => {
  const raw = limitArg ? limitArg.slice('--limit='.length).trim() : '20'
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 && n <= 200 ? n : 20
})()

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? null
if (!connectionString) {
  process.stderr.write('[db-last-stripe-events] Missing DATABASE_URL/SUPABASE_DB_URL\n')
  process.exit(2)
}

const useSsl = pgSslFromEnv('db-last-stripe-events')

const url = new URL(connectionString)
url.searchParams.delete('sslmode')
url.searchParams.delete('uselibpqcompat')

const client = new Client({ connectionString: url.toString(), ssl: useSsl })
await client.connect()

try {
  const r = await client.query(
    'select id,event_type,livemode,stripe_created_at,created_at from public.stripe_webhook_events order by created_at desc limit $1',
    [limit],
  )
  process.stdout.write(`${JSON.stringify(r.rows, null, 2)}\n`)
} finally {
  await client.end()
}
