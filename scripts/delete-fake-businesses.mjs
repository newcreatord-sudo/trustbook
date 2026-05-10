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
  process.stderr.write(`[delete-fake-businesses] ${msg}\n`)
  process.exit(2)
}

function quoteIdent(x) {
  return `"${String(x).replace(/"/g, '""')}"`
}

function quoteTable(qualified) {
  const parts = String(qualified).split('.').filter(Boolean)
  if (parts.length === 1) return quoteIdent(parts[0])
  if (parts.length === 2) return `${quoteIdent(parts[0])}.${quoteIdent(parts[1])}`
  return parts.map((p) => quoteIdent(p)).join('.')
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
const useSsl = pgSslFromEnv('delete-fake-businesses')

const url = new URL(connectionString)
url.searchParams.delete('sslmode')
url.searchParams.delete('uselibpqcompat')

const client = new Client({
  connectionString: url.toString(),
  ssl: useSsl,
})

async function hasColumn(schema, table, column) {
  const res = await client.query(
    `
      select 1
      from information_schema.columns
      where table_schema = $1
        and table_name = $2
        and column_name = $3
      limit 1;
    `,
    [schema, table, column],
  )
  return (res.rowCount ?? 0) > 0
}

async function hasTable(schema, table) {
  const res = await client.query(
    `
      select 1
      from information_schema.tables
      where table_schema = $1
        and table_name = $2
      limit 1;
    `,
    [schema, table],
  )
  return (res.rowCount ?? 0) > 0
}

try {
  await client.connect()

  const hasEmail = await hasColumn('public', 'businesses', 'email')

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

  const idsRes = await client.query(
    `
      select id::text as id, name
      from public.businesses
      where ${whereSql}
      order by created_at desc nulls last
      limit 5000;
    `,
    params,
  )
  const ids = (idsRes.rows ?? []).map((r) => r.id).filter(Boolean)

  const countRes = await client.query(
    `
      select count(*)::int as cnt
      from public.businesses
      where ${whereSql};
    `,
    params,
  )
  const cnt = countRes.rows?.[0]?.cnt ?? 0

  if (!ids.length || cnt === 0) {
    process.stdout.write(JSON.stringify({ hasEmail, found: 0 }, null, 2) + '\n')
    process.exit(0)
  }

  if (dryRun) {
    process.stdout.write(JSON.stringify({ hasEmail, found: cnt, sample: (idsRes.rows ?? []).slice(0, 25) }, null, 2) + '\n')
    process.exit(0)
  }

  await client.query('begin')

  const fkRes = await client.query(
    `
      select
        c.conrelid::regclass::text as table_name,
        n.nspname::text as schema_name,
        rel.relname::text as rel_name,
        a.attname::text as column_name,
        array_length(c.conkey, 1) as key_len
      from pg_constraint c
      join pg_class rel on rel.oid = c.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f'
        and c.confrelid = 'public.businesses'::regclass
        and array_length(c.conkey, 1) = 1
      order by n.nspname, rel.relname, a.attname;
    `,
  )

  const depDeletes = []
  for (const r of fkRes.rows ?? []) {
    const schema = String(r.schema_name ?? '').trim()
    const rel = String(r.rel_name ?? '').trim()
    const col = String(r.column_name ?? '').trim()
    if (!schema || !rel || !col) continue
    if (schema === 'auth') continue
    depDeletes.push({ table: `${schema}.${rel}`, column: col })
  }

  let depDeleted = 0
  for (const d of depDeletes) {
    const sql = `delete from ${quoteTable(d.table)} where ${quoteIdent(d.column)} = any($1::uuid[])`
    const res = await client.query(sql, [ids])
    depDeleted += res.rowCount ?? 0
  }

  if (await hasTable('public', 'external_business_listings')) {
    await client.query(`update public.external_business_listings set claimed_business_id = null where claimed_business_id = any($1::uuid[])`, [
      ids,
    ])
  }

  const delBusinesses = await client.query(`delete from public.businesses where id = any($1::uuid[])`, [ids])

  await client.query('commit')

  process.stdout.write(
    JSON.stringify(
      {
        hasEmail,
        found: cnt,
        dependentRowsDeleted: depDeleted,
        businessesDeleted: delBusinesses.rowCount ?? 0,
        sample: (idsRes.rows ?? []).slice(0, 25),
      },
      null,
      2,
    ) + '\n',
  )
} catch (err) {
  await client.query('rollback').catch(() => {})
  const msg = err instanceof Error ? err.message : String(err)
  fail(msg)
} finally {
  await client.end().catch(() => {})
}
