import { existsSync } from 'node:fs'
import process from 'node:process'
import { resolve } from 'node:path'
import dotenv from 'dotenv'
import { Client } from 'pg'
import { pgSslFromEnv } from '../lib/pg-ssl.mjs'

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

const raw =
  (typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.trim() ? process.env.DATABASE_URL.trim() : null) ??
  (typeof process.env.SUPABASE_DB_URL === 'string' && process.env.SUPABASE_DB_URL.trim() ? process.env.SUPABASE_DB_URL.trim() : null)

if (!raw) {
  process.stderr.write('[db_show_live_overview_def] Missing DATABASE_URL/SUPABASE_DB_URL.\n')
  process.exit(2)
}

const u = new URL(raw)
u.searchParams.delete('sslmode')
u.searchParams.delete('sslcert')
u.searchParams.delete('sslkey')
u.searchParams.delete('sslrootcert')
u.searchParams.delete('sslcrl')
u.searchParams.delete('uselibpqcompat')

const db = new Client({ connectionString: u.toString(), ssl: pgSslFromEnv('db_show_live_overview_def') })
await db.connect()
try {
  const res = await db.query(`select pg_get_functiondef('public.list_business_live_overview(timestamptz)'::regprocedure) as def`)
  const def = String(res.rows?.[0]?.def ?? '')

  const hasBzTimezone = /coalesce\s*\(\s*bz\.timezone\b/i.test(def)
  const hasUnqualifiedTimezone = /coalesce\s*\(\s*timezone\s*,\s*'Europe\/Rome'\s*\)/i.test(def)

  process.stdout.write(`[db_show_live_overview_def] has_bz_timezone=${hasBzTimezone ? 'yes' : 'no'}\n`)
  process.stdout.write(`[db_show_live_overview_def] has_unqualified_timezone=${hasUnqualifiedTimezone ? 'yes' : 'no'}\n`)

  const applied = await db
    .query(
      `select exists(
        select 1
        from information_schema.tables
        where table_schema='public' and table_name='_trustbook_schema_migrations'
      ) as ok`,
    )
    .catch(() => null)

  if (applied?.rows?.[0]?.ok) {
    const last = await db
      .query(`select name, applied_at from public._trustbook_schema_migrations order by applied_at desc limit 5`)
      .catch(() => null)
    if (last?.rows?.length) {
      const names = last.rows.map((r) => String(r.name)).join(', ')
      process.stdout.write(`[db_show_live_overview_def] recent_migrations=${names}\n`)
    }
  }
} finally {
  await db.end().catch(() => {})
}
