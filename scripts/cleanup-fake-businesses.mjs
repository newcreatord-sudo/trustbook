import { existsSync } from 'node:fs'
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
  process.stderr.write(`[cleanup-fake-businesses] ${msg}\n`)
  process.exit(2)
}

const envFileArg = readArg('env-file') ?? null
if (envFileArg) {
  const basePath = resolve(process.cwd(), envFileArg)
  if (!existsSync(basePath)) fail(`Missing env file: ${envFileArg}`)
  dotenv.config({ path: basePath, override: true })
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
const useSsl = pgSslFromEnv('cleanup-fake-businesses')

const url = new URL(connectionString)
url.searchParams.delete('sslmode')
url.searchParams.delete('uselibpqcompat')

const client = new Client({
  connectionString: url.toString(),
  ssl: useSsl,
})

async function hasColumn(table, column) {
  const res = await client.query(
    `
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
        and column_name = $2
      limit 1;
    `,
    [table, column],
  )
  return (res.rowCount ?? 0) > 0
}

function likeAny(fieldSql, patterns, startIndex) {
  if (!patterns.length) return { sql: 'false', params: [] }
  const parts = []
  const params = []
  for (let i = 0; i < patterns.length; i += 1) {
    parts.push(`${fieldSql} ilike $${startIndex + i}`)
    params.push(patterns[i])
  }
  return { sql: `(${parts.join(' or ')})`, params }
}

try {
  await client.connect()

  const hasEmail = await hasColumn('businesses', 'email')

  const nameExact = ['RLS Impersonation Fixture', 'RLS Hidden Fixture']
  const nameLike = ['E2E Business %', 'E2E Ristorante %', 'Ristorante Smoke %', 'Onboarding RPC %', 'DBG %']
  const emailLike = ['smoke.%@trustbook.local', 'dbg.%@trustbook.local', 'rls-impersonation-%@trustbook.local', 'e2e.%@example.com']

  const whereParts = []
  const params = []
  let idx = 1

  if (nameExact.length) {
    const inList = nameExact.map((_, i) => `$${idx + i}`).join(',')
    whereParts.push(`name in (${inList})`)
    params.push(...nameExact)
    idx += nameExact.length
  }

  const likeName = likeAny('name', nameLike, idx)
  if (likeName.sql !== 'false') {
    whereParts.push(likeName.sql)
    params.push(...likeName.params)
    idx += likeName.params.length
  }

  if (hasEmail) {
    const likeEmail = likeAny('email', emailLike, idx)
    if (likeEmail.sql !== 'false') {
      whereParts.push(likeEmail.sql)
      params.push(...likeEmail.params)
      idx += likeEmail.params.length
    }
  }

  const whereSql = whereParts.length ? `(${whereParts.join(' or ')})` : 'false'

  if (dryRun) {
    const res = await client.query(
      `
        select count(*)::int as cnt
        from public.businesses
        where ${whereSql};
      `,
      params,
    )
    const sample = await client.query(
      `
        select id, name, listing_visible, is_paused
        from public.businesses
        where ${whereSql}
        order by created_at desc nulls last
        limit 25;
      `,
      params,
    )
    process.stdout.write(JSON.stringify({ hasEmail, wouldAffect: res.rows?.[0]?.cnt ?? 0, sample: sample.rows ?? [] }, null, 2) + '\n')
    process.exit(0)
  }

  await client.query('begin')
  const updated = await client.query(
    `
      update public.businesses
      set listing_visible = false,
          is_paused = true,
          updated_at = now()
      where ${whereSql}
      returning id, name;
    `,
    params,
  )
  await client.query('commit')

  process.stdout.write(JSON.stringify({ hasEmail, hiddenAndPaused: updated.rowCount ?? 0, sample: (updated.rows ?? []).slice(0, 25) }, null, 2) + '\n')
} catch (err) {
  await client.query('rollback').catch(() => {})
  const msg = err instanceof Error ? err.message : String(err)
  fail(msg)
} finally {
  await client.end().catch(() => {})
}
