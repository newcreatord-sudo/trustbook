import process from 'node:process'
import { resolve } from 'node:path'
import { Client } from 'pg'
import dotenv from 'dotenv'
import { pgSslFromEnv } from './lib/pg-ssl.mjs'

const envFileArg = process.argv.find((x) => x.startsWith('--env-file=')) ?? null
if (envFileArg) {
  const envFile = envFileArg.slice('--env-file='.length).trim()
  if (envFile) dotenv.config({ path: resolve(process.cwd(), envFile), override: true })
}

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? null
if (!connectionString) {
  process.stderr.write('[db-check-floorplan-0090] Missing DATABASE_URL/SUPABASE_DB_URL.\n')
  process.exit(2)
}

const useSsl = pgSslFromEnv('db-check-floorplan-0090')

const url = new URL(connectionString)
url.searchParams.delete('sslmode')
url.searchParams.delete('uselibpqcompat')

const client = new Client({
  connectionString: url.toString(),
  ssl: useSsl,
})

try {
  await client.connect()
  const { rows } = await client.query(
    "select proname from pg_proc where proname in ('get_resource_occupancy_at','list_available_resources_for_slot') order by proname",
  )
  const names = new Set(rows.map((r) => r.proname))
  const ok =
    names.has('get_resource_occupancy_at') &&
    names.has('list_available_resources_for_slot')
  process.stdout.write(`[db-check-floorplan-0090] rpc_ok=${ok}\n`)
  if (!ok) process.exit(1)
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`[db-check-floorplan-0090] FAILED: ${msg}\n`)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}
