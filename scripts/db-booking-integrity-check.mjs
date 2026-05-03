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
  process.stderr.write('[booking-integrity-check] Missing DATABASE_URL (or SUPABASE_DB_URL).\n')
  process.exit(2)
}

const sqlPath = resolve(process.cwd(), 'supabase/verification/booking_integrity_assertions.sql')
const sql = readFileSync(sqlPath, 'utf8')

const url = new URL(connectionString)
url.searchParams.delete('sslmode')
url.searchParams.delete('uselibpqcompat')

const useSsl = pgSslFromEnv('booking-integrity-check')

const client = new Client({
  connectionString: url.toString(),
  ssl: useSsl,
})

const startedAt = Date.now()

try {
  process.stdout.write(`[booking-integrity-check] Running assertions from ${sqlPath}\n`)
  await client.connect()
  const result = await client.query(sql)
  const results = Array.isArray(result) ? result : [result]
  const marker = (results.at(-1)?.rows ?? [])[0]?.result
  if (marker !== 'booking_integrity_assertions_passed') {
    process.stderr.write('[booking-integrity-check] Assertion marker missing.\n')
    process.exit(1)
  }
  process.stdout.write(`[booking-integrity-check] OK in ${((Date.now() - startedAt) / 1000).toFixed(2)}s\n`)
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`[booking-integrity-check] FAILED: ${msg}\n`)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}
