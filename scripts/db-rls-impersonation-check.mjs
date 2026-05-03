import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { randomBytes } from 'node:crypto'
import { Client } from 'pg'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
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
  process.stderr.write(
    '[rls-impersonation-check] Missing DATABASE_URL (or SUPABASE_DB_URL). Cannot run DB assertions.\n',
  )
  process.exit(2)
}

const sqlPath = resolve(process.cwd(), 'supabase/verification/rls_impersonation_assertions.sql')
const sql = readFileSync(sqlPath, 'utf8')

const parsed = new URL(connectionString)
parsed.searchParams.delete('sslmode')
parsed.searchParams.delete('uselibpqcompat')

const useSsl = pgSslFromEnv('db-rls-impersonation-check')

const client = new Client({
  connectionString: parsed.toString(),
  ssl: useSsl,
})

const startedAt = Date.now()

function readEnvAny(keys) {
  for (const k of keys) {
    const v = process.env[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return null
}

async function ensureAuthUsers(client) {
  const want = 4
  const current = await client.query('select count(*)::int as c from auth.users')
  const have = Number(current.rows?.[0]?.c ?? 0)
  if (have >= want) return

  const autoSeed = String(process.env.RLS_IMPERSONATION_AUTO_SEED ?? '') === '1'
  if (!autoSeed) return

  const supabaseUrl = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const serviceRoleKey = readEnvAny([
    'SUPABASE_SERVICE_ROLE_KEY',
    'SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_KEY',
    'service_role',
    'SERVICE_ROLE',
  ])
  if (!supabaseUrl || !serviceRoleKey) return

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })

  const need = want - have
  const base = Date.now().toString(36)
  for (let i = 0; i < need; i += 1) {
    const suffix = randomBytes(6).toString('hex')
    const email = `rls-impersonation-${base}-${i}-${suffix}@trustbook.local`
    const password = `Tb_${randomBytes(12).toString('hex')}`
    const role = i === 0 ? 'attivita' : 'cliente'

    const { error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role },
    })
    if (error) {
      process.stderr.write(`[rls-impersonation-check] Auto-seed user failed: ${error.message}\n`)
      break
    }
  }
}

try {
  process.stdout.write(`[rls-impersonation-check] Running assertions from ${sqlPath}\n`)
  await client.connect()
  await ensureAuthUsers(client)
  const result = await client.query(sql)
  const results = Array.isArray(result) ? result : [result]
  const marker = (results.at(-1)?.rows ?? [])[0]?.result
  if (marker !== 'rls_impersonation_assertions_passed') {
    process.stderr.write('[rls-impersonation-check] Assertion marker missing. Treating as failure.\n')
    process.exit(1)
  }
  process.stdout.write(
    `[rls-impersonation-check] OK in ${((Date.now() - startedAt) / 1000).toFixed(2)}s\n`,
  )
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`[rls-impersonation-check] FAILED: ${msg}\n`)
  process.exit(1)
} finally {
  await client.end().catch(() => {})
}
