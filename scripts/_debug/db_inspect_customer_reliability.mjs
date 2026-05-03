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

const cols = await client.query(
  `
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name='customer_reliability'
order by ordinal_position
`.trim(),
)

const idx = await client.query(
  `
select indexname, indexdef
from pg_indexes
where schemaname='public' and tablename='customer_reliability'
order by indexname
`.trim(),
)

const cons = await client.query(
  `
select conname, contype, conkey
from pg_constraint
where connamespace = 'public'::regnamespace
  and conrelid = 'public.customer_reliability'::regclass
order by conname
`.trim(),
)

console.log({ columns: cols.rows, indexes: idx.rows, constraints: cons.rows })
await client.end()
