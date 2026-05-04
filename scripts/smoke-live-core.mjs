import process from 'node:process'
import { resolve } from 'node:path'
import dotenv from 'dotenv'

const envFileArg = process.argv.find((x) => x.startsWith('--env-file=')) ?? null
if (envFileArg) {
  const envFile = envFileArg.slice('--env-file='.length).trim()
  if (envFile) dotenv.config({ path: resolve(process.cwd(), envFile), override: true })
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

function baseUrlFromEnv() {
  const appBaseUrl = readEnvAny(['APP_BASE_URL', 'VITE_APP_URL'])
  const baseUrlArg = process.argv.find((x) => x.startsWith('--base-url=')) ?? null
  const baseUrl = (baseUrlArg?.slice('--base-url='.length).trim() || appBaseUrl || '').replace(/\/$/, '')
  return baseUrl || null
}

function fail(msg) {
  process.stderr.write(`[smoke-live-core] ${msg}\n`)
  process.exit(1)
}

async function expectOk(res, label) {
  if (res.ok) return
  const txt = await res.text().catch(() => '')
  fail(`${label} failed: HTTP ${res.status} ${txt}`)
}

function redactToken(t) {
  if (!t) return null
  if (t.length <= 10) return '***'
  return `${t.slice(0, 4)}…${t.slice(-4)}`
}

const baseUrl = baseUrlFromEnv()
if (!baseUrl) fail('Missing --base-url or APP_BASE_URL/VITE_APP_URL')

const cronSecret = readEnvAny(['CRON_SECRET'])
const opsToken = readEnvAny(['OPS_REVIEW_REPORTS_TOKEN'])
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

process.stdout.write(`[smoke-live-core] baseUrl=${baseUrl}\n`)
process.stdout.write(
  `[smoke-live-core] cronSecret=${cronSecret ? redactToken(cronSecret) : '—'} opsToken=${opsToken ? redactToken(opsToken) : '—'} vercelBypass=${vercelBypass ? redactToken(vercelBypass) : '—'}\n`,
)

const homeRes = await fetchTb('/', { redirect: 'follow' })
await expectOk(homeRes, 'GET /')

const healthRes = await fetchTb('/api/health')
await expectOk(healthRes, 'GET /api/health')
const healthJson = await healthRes.json().catch(() => null)
if (!healthJson || healthJson.success !== true) fail('Health payload invalid')

const smokeEmail = `qa-resend-${Date.now()}@example.com`
const dryRunRes = await fetchTb('/api/auth/resend-confirmation', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: smokeEmail, dryRun: true }),
})
await expectOk(dryRunRes, 'POST /api/auth/resend-confirmation (dryRun)')
const dryRunJson = await dryRunRes.json().catch(() => null)
if (!dryRunJson || dryRunJson.success !== true || dryRunJson.dryRun !== true || dryRunJson.configured !== true) {
  fail('resend-confirmation dryRun payload invalid')
}

const unauthAi = await fetchTb('/api/ai-tools/notes?businessId=00000000-0000-0000-0000-000000000000')
if (unauthAi.status !== 401) fail(`Expected 401 for unauth AI tools, got ${unauthAi.status}`)

if (cronSecret) {
  const dueRes = await fetchTb('/api/cron/notifications/due?limit=1', {
    headers: { Authorization: `Bearer ${cronSecret}` },
  })
  await expectOk(dueRes, 'GET /api/cron/notifications/due')
  const dueJson = await dueRes.json().catch(() => null)
  if (!dueJson || dueJson.success !== true || typeof dueJson.processed !== 'number') fail('cron due payload invalid')
}

{
  const tok = opsToken || cronSecret
  if (tok) {
    const opsRes = await fetchTb('/api/ops/review-reports/list', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 1 }),
    })
    await expectOk(opsRes, `POST /api/ops/review-reports/list (via ${opsToken ? 'OPS_REVIEW_REPORTS_TOKEN' : 'CRON_SECRET'})`)
    const opsJson = await opsRes.json().catch(() => null)
    if (!opsJson || opsJson.success !== true || typeof opsJson.count !== 'number' || !Array.isArray(opsJson.rows)) {
      fail('ops review-reports payload invalid')
    }
  }
}

process.stdout.write('[smoke-live-core] OK\n')
