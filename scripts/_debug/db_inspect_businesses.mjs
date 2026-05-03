import { resolve } from 'node:path'
import process from 'node:process'
import { Client } from 'pg'
import dotenv from 'dotenv'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? null
if (!connectionString) {
  process.stderr.write('Missing DATABASE_URL (or SUPABASE_DB_URL)\n')
  process.exit(2)
}

let parsedUrl
try {
  parsedUrl = new URL(connectionString)
} catch {
  process.stderr.write('Invalid DATABASE_URL format\n')
  process.exit(2)
}

parsedUrl.searchParams.delete('sslmode')
parsedUrl.searchParams.delete('sslcert')
parsedUrl.searchParams.delete('sslkey')
parsedUrl.searchParams.delete('sslrootcert')
parsedUrl.searchParams.delete('sslcrl')
parsedUrl.searchParams.delete('uselibpqcompat')

const normalizedConnectionString = parsedUrl.toString()

const client = new Client({
  connectionString: normalizedConnectionString,
  ssl: { rejectUnauthorized: false },
})

await client.connect()

const columns = await client.query(
  `
select column_name, is_nullable, column_default, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'businesses'
  and column_name in ('timezone','owner_user_id','name','category')
order by column_name
`.trim(),
)

const policies = await client.query(
  `
select policyname as polname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'businesses'
order by polname
`.trim(),
)

const tables = ['businesses', 'services', 'business_opening_windows', 'team_members', 'business_booking_ecosystem']
const rls = await client.query(
  `
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname = any($1::text[])
order by c.relname
`.trim(),
  [tables],
)

const policiesMore = await client.query(
  `
select tablename, policyname as polname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = any($1::text[])
order by tablename, polname
`.trim(),
  [tables],
)

const sampleOwnerId = '4c9bbe34-ff3d-4a7f-911e-eb09ea67a354'
const ownedCount = await client.query(
  `select count(1)::int as n from public.businesses where owner_user_id = $1`,
  [sampleOwnerId],
)

console.log({
  businesses: { columns: columns.rows, policies: policies.rows },
  rls: rls.rows,
  policies_all: policiesMore.rows,
  owned_by_sample_user: { user_id: sampleOwnerId, count: ownedCount.rows[0]?.n ?? null },
})

await client.end()
