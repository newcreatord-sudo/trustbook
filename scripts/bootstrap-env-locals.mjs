import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'

function readArg(name) {
  const raw = process.argv.find((x) => x.startsWith(`--${name}=`)) ?? null
  if (!raw) return null
  const v = raw.slice(`--${name}=`.length).trim()
  return v.length ? v : null
}

function parseEnvFile(absPath) {
  if (!existsSync(absPath)) return { raw: null, parsed: {} }
  const raw = readFileSync(absPath, 'utf8')
  return { raw, parsed: dotenv.parse(raw) }
}

function normalizeValue(v) {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  if (t.includes('[YOUR-PASSWORD]')) return null
  return t
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

const root = process.cwd()
const srcLocal = resolve(root, '.env.local')

const stagingBase = resolve(root, readArg('staging') ?? '.env.staging')
const prodBase = resolve(root, readArg('production') ?? '.env.production')

const stLocalOut = resolve(root, `${stagingBase}.local`.replace(`${root}\\`, ''))
const prLocalOut = resolve(root, `${prodBase}.local`.replace(`${root}\\`, ''))

const st = parseEnvFile(stagingBase)
const pr = parseEnvFile(prodBase)
const common = parseEnvFile(srcLocal)

const KEYS = [
  'VITE_APP_URL',
  'APP_BASE_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'SUPABASE_DB_URL',
  'DB_SSL_DISABLE',
  'DB_SSL_REJECT_UNAUTHORIZED',
  'DB_SSL_CA_B64',
  'DB_SSL_CA_PEM',
  'DB_SSL_CA_FILE',
  'VITE_GOOGLE_MAPS_API_KEY',
  'VITE_GOOGLE_MAPS_MAP_ID',
  'VITE_STRIPE_PUBLISHABLE_KEY',
  'PAYMENTS_ENABLED',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'AUTH_ADMIN_SIGNUP_TOKEN',
  'CRON_SECRET',
  'EMAIL_DISPATCH_TOKEN',
  'OPS_REVIEW_REPORTS_TOKEN',
  'VERCEL_AUTOMATION_BYPASS_SECRET',
  'ALLOWED_ORIGINS',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_FROM',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_SECURE',
]

function buildLocal(baseParsed) {
  const out = {}
  for (const k of KEYS) {
    const v =
      normalizeValue(common.parsed[k]) ??
      normalizeValue(baseParsed[k]) ??
      null
    if (v !== null) out[k] = v
  }
  return out
}

function writeLocal(absOutPath, obj) {
  if (existsSync(absOutPath)) {
    const backup = `${absOutPath}.bak.${stamp()}`
    writeFileSync(backup, readFileSync(absOutPath, 'utf8'), 'utf8')
  }
  const lines = []
  for (const k of KEYS) {
    if (!(k in obj)) continue
    lines.push(`${k}=${obj[k]}`)
  }
  lines.push('')
  writeFileSync(absOutPath, lines.join('\n'), 'utf8')
}

if (!st.raw) {
  process.stderr.write(`[bootstrap-env-locals] Missing base file: ${stagingBase}\n`)
  process.exit(2)
}
if (!pr.raw) {
  process.stderr.write(`[bootstrap-env-locals] Missing base file: ${prodBase}\n`)
  process.exit(2)
}

const stLocal = buildLocal(st.parsed)
const prLocal = buildLocal(pr.parsed)

writeLocal(stLocalOut, stLocal)
writeLocal(prLocalOut, prLocal)

const stCount = Object.keys(stLocal).length
const prCount = Object.keys(prLocal).length

process.stdout.write(`[bootstrap-env-locals] OK: wrote ${stCount} key(s) to ${stLocalOut}\n`)
process.stdout.write(`[bootstrap-env-locals] OK: wrote ${prCount} key(s) to ${prLocalOut}\n`)
