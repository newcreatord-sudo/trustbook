import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { Client } from 'pg'
import dotenv from 'dotenv'
import { pgSslFromEnv } from './lib/pg-ssl.mjs'

const envFileArg = process.argv.find((x) => x.startsWith('--env-file=')) ?? null
if (envFileArg) {
  const envFile = envFileArg.slice('--env-file='.length).trim()
  if (envFile) dotenv.config({ path: resolve(process.cwd(), envFile), override: true })
  if (envFile) {
    const local = `${envFile}.local`
    if (existsSync(resolve(process.cwd(), local))) {
      dotenv.config({ path: resolve(process.cwd(), local), override: true })
    }
  }
}

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

function readNonEmptyEnv(keys) {
  for (const k of keys) {
    const v = process.env[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

const requireArg = process.argv.find((x) => x.startsWith('--require=')) ?? null
const required = (requireArg ? requireArg.slice('--require='.length) : '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0)

if (!required.length) {
  process.stderr.write('[db-migrations-applied-check] Missing --require= file list.\n')
  process.exit(2)
}

const connectionString = readNonEmptyEnv(['DATABASE_URL', 'SUPABASE_DB_URL'])
if (!connectionString) {
  process.stderr.write('[db-migrations-applied-check] Missing DATABASE_URL (or SUPABASE_DB_URL).\n')
  process.exit(2)
}

let parsedUrl
try {
  parsedUrl = new URL(connectionString)
} catch {
  process.stderr.write('[db-migrations-applied-check] Invalid DB URL format.\n')
  process.exit(2)
}

parsedUrl.searchParams.delete('sslmode')
parsedUrl.searchParams.delete('sslcert')
parsedUrl.searchParams.delete('sslkey')
parsedUrl.searchParams.delete('sslrootcert')
parsedUrl.searchParams.delete('sslcrl')
parsedUrl.searchParams.delete('uselibpqcompat')

const client = new Client({
  connectionString: parsedUrl.toString(),
  ssl: pgSslFromEnv('db-migrations-applied-check'),
})

await client.connect()
try {
  const { rows: tableRows } = await client.query(
    "select 1 as ok from information_schema.tables where table_schema = 'public' and table_name = '_trustbook_schema_migrations' limit 1",
  )
  if (!tableRows?.length) {
    process.stderr.write('[db-migrations-applied-check] Missing public._trustbook_schema_migrations.\n')
    process.exit(1)
  }

  const { rows } = await client.query('select filename from public._trustbook_schema_migrations')
  const applied = new Set((rows ?? []).map((r) => String(r.filename)))
  const missing = required.filter((f) => !applied.has(f))

  if (missing.length) {
    process.stderr.write(`[db-migrations-applied-check] Missing applied migrations: ${missing.join(', ')}\n`)
    process.exit(1)
  }

  process.stdout.write('[db-migrations-applied-check] OK\n')
} finally {
  await client.end().catch(() => {})
}
