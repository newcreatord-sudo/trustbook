import process from 'node:process'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import dotenv from 'dotenv'

const envFileArg = process.argv.find((x) => x.startsWith('--env-file=')) ?? null
if (envFileArg) {
  const envFile = envFileArg.slice('--env-file='.length).trim()
  if (envFile) {
    dotenv.config({ path: resolve(process.cwd(), envFile), override: true })
    const local = `${envFile}.local`
    if (existsSync(resolve(process.cwd(), local))) {
      dotenv.config({ path: resolve(process.cwd(), local), override: true })
    }
  }
}

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

function readEnvAny(names) {
  for (const n of names) {
    const raw = process.env[n]
    if (typeof raw !== 'string') continue
    const v = raw.trim()
    if (v) return v
  }
  return null
}

function fail(msg) {
  process.stderr.write(`[verify-auth-email-api] ${msg}\n`)
  process.exit(1)
}

const supabaseUrl = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
const supabaseAnon = readEnvAny([
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY_',
  'SUPABASE_ANON',
  'anon_key',
])
const appBaseUrl = readEnvAny(['APP_BASE_URL', 'VITE_APP_URL'])
const baseUrlArg = process.argv.find((x) => x.startsWith('--base-url=')) ?? null
const baseUrl = (baseUrlArg?.slice('--base-url='.length).trim() || appBaseUrl || 'http://127.0.0.1:3001').replace(/\/$/, '')
const vercelBypass = readEnvAny(['VERCEL_AUTOMATION_BYPASS_SECRET'])

function mergedHeaders(existing, extra) {
  const h = new Headers(existing || undefined)
  for (const [k, v] of Object.entries(extra || {})) {
    if (typeof v === 'string') h.set(k, v)
  }
  return h
}

async function fetchTb(path, init) {
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`
  const extra = vercelBypass ? { 'x-vercel-protection-bypass': vercelBypass } : null
  const headers = extra ? mergedHeaders(init?.headers, extra) : init?.headers
  return fetch(url, { ...(init || {}), headers })
}

if (!supabaseUrl) fail('Missing SUPABASE_URL or VITE_SUPABASE_URL')
if (!supabaseAnon) fail('Missing SUPABASE_ANON_KEY (or VITE_* alias)')
if (!appBaseUrl) {
  process.stdout.write('[verify-auth-email-api] WARN missing APP_BASE_URL/VITE_APP_URL, fallback redirect may be implicit.\n')
}

const healthRes = await fetchTb('/api/health')
if (!healthRes.ok) fail(`Health endpoint failed with status ${healthRes.status}`)

const smokeEmail = `qa-resend-${Date.now()}@example.com`
const dryRunRes = await fetchTb('/api/auth/resend-confirmation', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: smokeEmail, dryRun: true }),
})

if (!dryRunRes.ok) {
  const txt = await dryRunRes.text().catch(() => '')
  fail(`resend-confirmation dryRun failed: HTTP ${dryRunRes.status} ${txt}`)
}

const payload = await dryRunRes.json().catch(() => null)
if (!payload || payload.success !== true || payload.dryRun !== true || payload.configured !== true) {
  fail('resend-confirmation dryRun returned invalid payload')
}

process.stdout.write('[verify-auth-email-api] OK health + resend-confirmation(dryRun).\n')
