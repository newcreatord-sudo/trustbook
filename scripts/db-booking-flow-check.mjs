import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
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
  process.stderr.write(
    '[booking-flow-check] Missing DATABASE_URL (or SUPABASE_DB_URL). Cannot run DB assertions.\n',
  )
  process.exit(2)
}

if (
  connectionString.includes('[YOUR-PASSWORD]') ||
  connectionString.includes('LA_TUA_PASSWORD_REALE') ||
  connectionString.includes('YOUR_PASSWORD')
) {
  process.stderr.write(
    '[booking-flow-check] Placeholder password detected in DB URL. Replace it with the real Supabase DB password from Settings > Database > Connection string.\n',
  )
  process.exit(2)
}

let parsedUrl
try {
  parsedUrl = new URL(connectionString)
} catch {
  process.stderr.write('[booking-flow-check] Invalid DB URL format. Use full postgres URI from Supabase dashboard.\n')
  process.exit(2)
}

if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
  process.stderr.write('[booking-flow-check] Invalid DB URL protocol. Expected postgres:// or postgresql://\n')
  process.exit(2)
}

// Avoid SSL mode semantics from URI parser and enforce explicit driver SSL config.
parsedUrl.searchParams.delete('sslmode')
parsedUrl.searchParams.delete('sslcert')
parsedUrl.searchParams.delete('sslkey')
parsedUrl.searchParams.delete('sslrootcert')
parsedUrl.searchParams.delete('sslcrl')
parsedUrl.searchParams.delete('uselibpqcompat')

const normalizedConnectionString = parsedUrl.toString()

const sqlPath = resolve(process.cwd(), 'supabase/verification/booking_flow_assertions.sql')
const sql = readFileSync(sqlPath, 'utf8')
const useSsl = pgSslFromEnv('booking-flow-check')

const client = new Client({
  connectionString: normalizedConnectionString,
  ssl: useSsl,
})

const startedAt = Date.now()

try {
  process.stdout.write(`[booking-flow-check] Running assertions from ${sqlPath}\n`)
  await client.connect()
  const result = await client.query(sql)
  const results = Array.isArray(result) ? result : [result]
  const lastRows = results.at(-1)?.rows ?? []
  const marker = lastRows[0]?.result

  if (marker !== 'booking_flow_assertions_passed') {
    process.stderr.write('[booking-flow-check] Assertion marker missing. Treating as failure.\n')
    process.exit(1)
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(2)
  process.stdout.write(`[booking-flow-check] OK in ${elapsedSec}s\n`)
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('ENOTFOUND')) {
    process.stderr.write(
      '[booking-flow-check] FAILED: DB host not resolvable from this machine/runtime. Use the Supabase "Connection string" from Settings > Database and prefer the pooler URI (port 6543) when direct host db.<project-ref>.supabase.co is not resolvable.\n',
    )
    process.exit(1)
  }
  process.stderr.write(`[booking-flow-check] FAILED: ${msg}\n`)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}
