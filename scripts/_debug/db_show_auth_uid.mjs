import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
import { Client } from 'pg'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const raw = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? null
if (!raw) throw new Error('Missing DATABASE_URL')

const u = new URL(raw)
u.searchParams.delete('sslmode')
u.searchParams.delete('sslcert')
u.searchParams.delete('sslkey')
u.searchParams.delete('sslrootcert')
u.searchParams.delete('sslcrl')
u.searchParams.delete('uselibpqcompat')

const client = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } })
await client.connect()

const def = await client.query(`select pg_get_functiondef('auth.uid()'::regprocedure) as def`)
console.log(def.rows[0]?.def ?? null)

const roleDef = await client.query(`select pg_get_functiondef('auth.role()'::regprocedure) as def`)
console.log(roleDef.rows[0]?.def ?? null)

await client.end()

