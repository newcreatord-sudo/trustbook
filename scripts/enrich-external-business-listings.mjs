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
  process.stderr.write(`[enrich-external-listings] ${msg}\n`)
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
const limit = Math.max(1, Math.min(200000, Number(readArg('limit') ?? 200000)))
const statementTimeoutMs = Math.max(1_000, Math.min(1_800_000, Number(readArg('statement-timeout-ms') ?? 600_000)))

const useSsl = pgSslFromEnv('enrich-external-listings')

const url = new URL(connectionString)
url.searchParams.delete('sslmode')
url.searchParams.delete('uselibpqcompat')

const client = new Client({
  connectionString: url.toString(),
  ssl: useSsl,
})

const sql = `
with target as (
  select id
  from public.external_business_listings
  where source = $1
    and listing_status = 'unverified'
    and country_code = 'IT'
    and (description is null or trim(description) = '')
    and category <> 'altro'
  order by imported_at desc
  limit $2
)
update public.external_business_listings b
set description = concat_ws(
  ' ',
  'Scheda informativa non verificata.',
  case
    when b.category is not null and trim(b.category) <> '' and b.city is not null and trim(b.city) <> ''
      then initcap(replace(b.category, '_', ' ')) || ' a ' || b.city || '.'
    when b.category is not null and trim(b.category) <> ''
      then initcap(replace(b.category, '_', ' ')) || '.'
    when b.city is not null and trim(b.city) <> ''
      then 'Attività a ' || b.city || '.'
    else null
  end,
  case
    when nullif(trim(coalesce(b.address_text, '')), '') is not null
      then 'Indirizzo: ' || trim(b.address_text) || '.'
    else null
  end,
  'Dati da fonte pubblica/partner.',
  'Sei il titolare? Verifica e completa la scheda su TrustBook.'
),
updated_at = now()
from target
where b.id = target.id
returning b.id;
`

try {
  await client.connect()
  if (dryRun) {
    const res = await client.query(
      `
        select count(*)::int as cnt
        from public.external_business_listings
        where source = $1
          and listing_status = 'unverified'
          and country_code = 'IT'
          and (description is null or trim(description) = '')
          and category <> 'altro';
      `,
      [source],
    )
    process.stdout.write(JSON.stringify({ source, wouldUpdate: res.rows?.[0]?.cnt ?? 0 }, null, 2) + '\n')
    process.exit(0)
  }

  await client.query('begin')
  await client.query(`set local statement_timeout = ${statementTimeoutMs}`)
  const res = await client.query(sql, [source, limit])
  await client.query('commit')
  process.stdout.write(JSON.stringify({ source, updated: res.rowCount ?? 0 }, null, 2) + '\n')
} catch (err) {
  await client.query('rollback').catch(() => {})
  const msg = err instanceof Error ? err.message : String(err)
  fail(msg)
} finally {
  await client.end().catch(() => {})
}
