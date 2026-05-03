import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
import { Client } from 'pg'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const raw = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? null
if (!raw) {
  process.stderr.write('Missing DATABASE_URL (or SUPABASE_DB_URL)\n')
  process.exit(2)
}

const u = new URL(raw)
u.searchParams.delete('sslmode')
u.searchParams.delete('sslcert')
u.searchParams.delete('sslkey')
u.searchParams.delete('sslrootcert')
u.searchParams.delete('sslcrl')
u.searchParams.delete('uselibpqcompat')

const client = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } })
await client.connect()

const idx = await client.query(
  `
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname='public'
  and tablename = any($1::text[])
order by tablename, indexname
`.trim(),
  [['customer_reliability', 'reliability_events', 'notifications']],
)

const cons = await client.query(
  `
select conrelid::regclass::text as table_name, conname, contype, condeferrable, condeferred, pg_get_constraintdef(oid) as def
from pg_constraint
where connamespace='public'::regnamespace
  and conrelid in (
    'public.notifications'::regclass,
    'public.customer_reliability'::regclass,
    'public.reliability_events'::regclass
  )
order by table_name, conname
`.trim(),
)

console.log({ indexes: idx.rows, constraints: cons.rows })
await client.end()
