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

const pick = await client.query(`select user_id from public.customer_reliability order by updated_at desc limit 1`)
if (!pick.rows[0]?.user_id) throw new Error('No rows in customer_reliability to test with')

const userId = pick.rows[0].user_id

const upsert = await client.query(
  `
insert into public.customer_reliability(user_id, score, total_bookings)
values ($1::uuid, 80, 1)
on conflict (user_id) do update
set total_bookings = public.customer_reliability.total_bookings + 1
returning total_bookings
`.trim(),
  [userId],
)

console.log({ ok: true, userId, total_bookings: upsert.rows[0]?.total_bookings ?? null })

await client.end()

