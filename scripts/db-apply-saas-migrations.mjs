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
  process.stderr.write('[db-apply-saas] Missing DATABASE_URL/SUPABASE_DB_URL.\n')
  process.exit(2)
}

const migrationPaths = [
  'supabase/migrations/0044_saas_platform_upgrades.sql',
  'supabase/migrations/0045_subscription_change_requests.sql',
].map((p) => resolve(process.cwd(), p))

const useSsl = pgSslFromEnv('db-apply-saas')

const url = new URL(connectionString)
url.searchParams.delete('sslmode')
url.searchParams.delete('uselibpqcompat')

const client = new Client({
  connectionString: url.toString(),
  ssl: useSsl,
})

try {
  await client.connect()
  for (const filePath of migrationPaths) {
    const sql = readFileSync(filePath, 'utf8')
    process.stdout.write(`[db-apply-saas] Applying ${filePath}\n`)
    await client.query(sql)
  }
  process.stdout.write('[db-apply-saas] Done.\n')
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`[db-apply-saas] FAILED: ${msg}\n`)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}
