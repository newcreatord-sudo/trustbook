import process from 'node:process'
import { resolve } from 'node:path'
import { Client } from 'pg'
import dotenv from 'dotenv'
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
  process.stderr.write('[db-check-portfolio-0091] Missing DATABASE_URL/SUPABASE_DB_URL.\n')
  process.exit(2)
}

const url = new URL(connectionString)
url.searchParams.delete('sslmode')
url.searchParams.delete('uselibpqcompat')

const useSsl = pgSslFromEnv('db-check-portfolio-0091')

const client = new Client({
  connectionString: url.toString(),
  ssl: useSsl,
})

try {
  await client.connect()
  const { rows } = await client.query(
    "select proname from pg_proc where proname in ('list_business_live_overview')",
  )
  const ok = rows.some((r) => r.proname === 'list_business_live_overview')
  process.stdout.write(`[db-check-portfolio-0091] rpc_ok=${ok}\n`)
  if (!ok) process.exit(1)
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`[db-check-portfolio-0091] FAILED: ${msg}\n`)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}
