import { readFileSync, readdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'
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

const connectionString =
  (typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.trim() ? process.env.DATABASE_URL.trim() : null) ??
  (typeof process.env.SUPABASE_DB_URL === 'string' && process.env.SUPABASE_DB_URL.trim() ? process.env.SUPABASE_DB_URL.trim() : null)

if (!connectionString) {
  process.stderr.write('[db-apply-all] Missing DATABASE_URL/SUPABASE_DB_URL.\n')
  process.exit(2)
}

function migrationNumericPrefix(fileName) {
  const m = /^(\d+)_/.exec(fileName)
  return m ? Number.parseInt(m[1], 10) : null
}

const fromArg = process.argv.find((x) => x.startsWith('--from=')) ?? null
const fromMigrationId = fromArg ? fromArg.slice('--from='.length).trim() : null
const fromNum = fromMigrationId ? Number.parseInt(fromMigrationId, 10) : null
if (fromMigrationId && (fromNum === null || Number.isNaN(fromNum))) {
  process.stderr.write('[db-apply-all] Invalid --from= value (expect e.g. --from=0033).\n')
  process.exit(2)
}

const migrationsDir = resolve(process.cwd(), 'supabase/migrations')
const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql') && /^\d+_/.test(f))
  .sort((a, b) => {
    const na = migrationNumericPrefix(a) ?? 0
    const nb = migrationNumericPrefix(b) ?? 0
    if (na !== nb) return na - nb
    return a.localeCompare(b)
  })
  .filter((f) => {
    if (!fromMigrationId) return true
    const n = migrationNumericPrefix(f)
    return n !== null && n >= fromNum
  })

if (migrationFiles.length === 0) {
  process.stderr.write('[db-apply-all] No migrations found.\n')
  process.exit(2)
}

const useSsl = pgSslFromEnv('db-apply-all')

const url = new URL(connectionString)
url.searchParams.delete('sslmode')
url.searchParams.delete('uselibpqcompat')

const client = new Client({
  connectionString: url.toString(),
  ssl: useSsl,
})

try {
  await client.connect()

  await client.query(`
    create table if not exists public._trustbook_schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `)

  for (const fileName of migrationFiles) {
    const already = await client.query(
      'select 1 from public._trustbook_schema_migrations where filename = $1',
      [fileName],
    )
    if (already.rowCount && already.rowCount > 0) continue

    const filePath = resolve(migrationsDir, fileName)
    const sql = readFileSync(filePath, 'utf8')
    process.stdout.write(`[db-apply-all] Applying ${basename(filePath)}\n`)

    await client.query('begin')
    try {
      await client.query(sql)
      await client.query('insert into public._trustbook_schema_migrations(filename) values ($1)', [fileName])
      await client.query('commit')
    } catch (err) {
      await client.query('rollback')
      throw err
    }
  }

  process.stdout.write('[db-apply-all] Done.\n')
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`[db-apply-all] FAILED: ${msg}\n`)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}

