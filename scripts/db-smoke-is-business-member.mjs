import { Client } from 'pg'
import dotenv from 'dotenv'
import { resolve } from 'node:path'
import process from 'node:process'
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
  process.stderr.write('[db-smoke-is-business-member] Missing DATABASE_URL/SUPABASE_DB_URL.\n')
  process.exit(2)
}

const useSsl = pgSslFromEnv('db-smoke-is-business-member')

const url = new URL(connectionString)
url.searchParams.delete('sslmode')
url.searchParams.delete('uselibpqcompat')

const client = new Client({ connectionString: url.toString(), ssl: useSsl })
await client.connect()

try {
  const users = await client.query('select id from auth.users order by created_at asc limit 4')
  if (users.rows.length < 3) {
    process.stderr.write('[db-smoke-is-business-member] Not enough users.\n')
    process.exit(2)
  }
  const customerUid = users.rows[1].id
  const biz = await client.query('select id from public.businesses order by created_at asc limit 1')
  const bid = biz.rows[0]?.id ?? null
  if (!bid) {
    process.stderr.write('[db-smoke-is-business-member] No business found.\n')
    process.exit(2)
  }

  await client.query('begin')
  await client.query('set local role authenticated')
  await client.query(`select set_config('request.jwt.claim.role','authenticated',true)`)
  await client.query(`select set_config('request.jwt.claim.sub',$1,true)`, [customerUid])

  const m = await client.query('select public.is_business_member($1) as m', [bid])
  const c = await client.query('select count(*)::int as c from public.businesses')
  await client.query('rollback')

  process.stdout.write(JSON.stringify({ ok: true, is_member: m.rows[0].m, visible_businesses: c.rows[0].c }) + '\n')
} finally {
  await client.end().catch(() => {})
}
