import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
import { Client } from 'pg'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const raw = process.env.DATABASE_URL ?? null
if (!raw) throw new Error('Missing DATABASE_URL')

const u = new URL(raw)
for (const k of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'sslcrl', 'uselibpqcompat']) u.searchParams.delete(k)

const db = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } })
await db.connect()

const user = await db.query(`select id from auth.users order by created_at desc limit 1`)
const recipient = user.rows[0]?.id
if (!recipient) throw new Error('No auth.users rows')

try {
  await db.query(
    `select public.notify_user($1::uuid, null::uuid, null::uuid, 'test', 'Test', 'Body', '/x', $2::text)`,
    [recipient, `dbg:${Date.now()}`],
  )
  console.log({ ok: true })
} catch (e) {
  console.log({
    ok: false,
    error: { message: e?.message, code: e?.code, where: e?.where, detail: e?.detail, hint: e?.hint },
  })
  process.exitCode = 1
} finally {
  await db.end()
}

