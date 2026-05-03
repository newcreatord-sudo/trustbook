import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
import { Client } from 'pg'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const raw = process.env.DATABASE_URL ?? null
if (!raw) throw new Error('Missing DATABASE_URL')

const u = new URL(raw)
for (const k of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'sslcrl', 'uselibpqcompat']) {
  u.searchParams.delete(k)
}

const c = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } })
await c.connect()

const r = await c.query(
  `
select i.relname as index_name, ix.indisunique, ix.indisvalid, ix.indisready, ix.indislive
from pg_class i
join pg_index ix on ix.indexrelid = i.oid
where i.relname = any($1::text[])
order by i.relname
`.trim(),
  [['notifications_dedupe', 'reliability_events_unique_user_booking_kind', 'customer_reliability_pkey']],
)

console.log(r.rows)
await c.end()

