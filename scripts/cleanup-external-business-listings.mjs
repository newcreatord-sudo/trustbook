import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
import { Client } from 'pg'
import { pgSslFromEnv } from './lib/pg-ssl.mjs'

function readArg(name) {
  const raw = process.argv.find((x) => x.startsWith(`--${name}=`)) ?? null
  if (!raw) return null
  const v = raw.slice(`--${name}=`.length).trim()
  return v.length ? v : null
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function fail(msg) {
  process.stderr.write(`[cleanup-external-listings] ${msg}\n`)
  process.exit(2)
}

const envFileArg = readArg('env-file') ?? null
if (envFileArg) {
  dotenv.config({ path: resolve(process.cwd(), envFileArg), override: true })
  const local = `${envFileArg}.local`
  if (existsSync(resolve(process.cwd(), local))) {
    dotenv.config({ path: resolve(process.cwd(), local), override: true })
  }
}

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const connectionString =
  (typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.trim() ? process.env.DATABASE_URL.trim() : null) ??
  (typeof process.env.SUPABASE_DB_URL === 'string' && process.env.SUPABASE_DB_URL.trim() ? process.env.SUPABASE_DB_URL.trim() : null)

if (!connectionString || connectionString.includes('[YOUR-PASSWORD]')) {
  const hint = envFileArg ? ` (set it in ${envFileArg} or ${envFileArg}.local)` : ''
  fail(`Missing DATABASE_URL/SUPABASE_DB_URL${hint}.`)
}

const dryRun = hasFlag('dry-run')
const source = readArg('source') ?? 'openstreetmap'

const useSsl = pgSslFromEnv('cleanup-external-listings')

const url = new URL(connectionString)
url.searchParams.delete('sslmode')
url.searchParams.delete('uselibpqcompat')

const client = new Client({
  connectionString: url.toString(),
  ssl: useSsl,
})

const statements = [
  {
    label: 'archive_missing_coords',
    sql: `
      update public.external_business_listings
      set listing_status = 'archived'
      where source = $1
        and listing_status = 'unverified'
        and (lat is null or lng is null);
    `,
  },
  {
    label: 'archive_altro',
    sql: `
      update public.external_business_listings
      set listing_status = 'archived'
      where source = $1
        and listing_status = 'unverified'
        and category = 'altro';
    `,
  },
  {
    label: 'block_spam_names',
    sql: `
      update public.external_business_listings
      set listing_status = 'blocked'
      where source = $1
        and listing_status in ('unverified', 'archived')
        and (
          lower(name) ~ '(^|\\s)(test|prova|fake|scam|spam)($|\\s)'
          or lower(name) like '%http%'
          or lower(name) like '%www.%'
        );
    `,
  },
]

try {
  await client.connect()
  await client.query('begin')

  for (const st of statements) {
    if (dryRun) {
      const q = await client.query(st.sql.replace(/\s+/g, ' '), [source])
      process.stdout.write(`[cleanup-external-listings] ${st.label} ok\n`)
      void q
      continue
    }
    const res = await client.query(st.sql, [source])
    process.stdout.write(`[cleanup-external-listings] ${st.label} updated ${res.rowCount}\n`)
  }

  await client.query('commit')
  process.stdout.write('[cleanup-external-listings] done\n')
} catch (err) {
  await client.query('rollback').catch(() => {})
  const msg = err instanceof Error ? err.message : String(err)
  fail(msg)
} finally {
  await client.end().catch(() => {})
}

