import process from 'node:process'
import { resolve } from 'node:path'
import { Client } from 'pg'
import dotenv from 'dotenv'

const envFileArg = process.argv.find((x) => x.startsWith('--env-file=')) ?? null
if (envFileArg) {
  const envFile = envFileArg.slice('--env-file='.length).trim()
  if (envFile) dotenv.config({ path: resolve(process.cwd(), envFile), override: true })
}

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? null
if (!connectionString) {
  process.stderr.write('[db-check-pg-cron] Missing DATABASE_URL/SUPABASE_DB_URL.\n')
  process.exit(2)
}

const url = new URL(connectionString)
url.searchParams.delete('sslmode')
url.searchParams.delete('uselibpqcompat')

const client = new Client({
  connectionString: url.toString(),
  ssl: { rejectUnauthorized: false },
})

try {
  await client.connect()
  const { rows } = await client.query("select extname from pg_extension where extname = 'pg_cron'")
  const enabled = rows.length > 0
  process.stdout.write(`[db-check-pg-cron] enabled=${enabled}\n`)
  process.exit(enabled ? 0 : 1)
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`[db-check-pg-cron] FAILED: ${msg}\n`)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}

