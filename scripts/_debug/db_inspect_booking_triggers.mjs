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

const triggers = await client.query(
  `
select
  t.tgname,
  p.proname,
  pg_get_triggerdef(t.oid) as trigger_def,
  p.oid as proc_oid
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public'
  and c.relname = 'bookings'
  and not t.tgisinternal
order by t.tgname;
`.trim(),
)

const funcs = await client.query(
  `
select p.oid as proc_oid, p.proname, p.prosrc
from pg_proc p
where p.oid = any($1::oid[])
`.trim(),
  [triggers.rows.map((r) => r.proc_oid)],
)

const funcById = new Map(funcs.rows.map((r) => [String(r.proc_oid), r]))

const report = triggers.rows.map((t) => {
  const f = funcById.get(String(t.proc_oid))
  const src = String(f?.prosrc ?? '')
  const hasOnConflict = src.toLowerCase().includes('on conflict')
  return {
    tgname: t.tgname,
    function: t.proname,
    hasOnConflict,
    trigger_def: t.trigger_def,
    onConflictSnippet: hasOnConflict ? src : null,
  }
})

console.log(report)

await client.end()
