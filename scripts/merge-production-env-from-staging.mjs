import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'

function readEnvFile(filePath) {
  if (!existsSync(filePath)) return null
  const raw = readFileSync(filePath, 'utf8')
  return { raw, parsed: dotenv.parse(raw) }
}

function getLineKey(line) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line.trim())
  return m?.[1] ?? null
}

function isEmptyValueLine(line) {
  const idx = line.indexOf('=')
  if (idx < 0) return false
  const v = line.slice(idx + 1).trim()
  return v === '' || v === '""' || v === "''"
}

function setOrAppend(lines, key, value) {
  const normalized = `${key}=${value}`
  const idx = lines.findIndex((l) => getLineKey(l) === key)
  if (idx >= 0) lines[idx] = normalized
  else lines.push(normalized)
}

function setIfMissingOrEmpty(lines, key, value) {
  const idx = lines.findIndex((l) => getLineKey(l) === key)
  if (idx < 0) {
    lines.push(`${key}=${value}`)
    return true
  }
  if (isEmptyValueLine(lines[idx])) {
    lines[idx] = `${key}=${value}`
    return true
  }
  return false
}

const root = process.cwd()
const stagingPath = resolve(root, '.env.staging')
const productionPath = resolve(root, '.env.production')

const st = readEnvFile(stagingPath)
if (!st) {
  process.stderr.write(`[merge-prod-env] Missing ${stagingPath}. Cannot copy values.\n`)
  process.exit(1)
}
const pr = readEnvFile(productionPath)
if (!pr) {
  process.stderr.write(`[merge-prod-env] Missing ${productionPath}. Create it first.\n`)
  process.exit(1)
}

const prodLines = pr.raw.split(/\r?\n/)

const COPY_KEYS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_GOOGLE_MAPS_API_KEY',
  'VITE_GOOGLE_MAPS_MAP_ID',
  'VITE_STRIPE_PUBLISHABLE_KEY',
  'PAYMENTS_ENABLED',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'AUTH_ADMIN_SIGNUP_TOKEN',
  'REQUIRE_DB_ASSERTIONS',
  'EMAIL_DISPATCH_TOKEN',
  'CRON_SECRET',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_FROM',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_SECURE',
]

let merged = 0
for (const key of COPY_KEYS) {
  const v = st.parsed[key]
  if (typeof v !== 'string') continue
  const trimmed = v.trim()
  if (!trimmed) continue
  if (setIfMissingOrEmpty(prodLines, key, trimmed)) merged += 1
}

const DEFAULT_APP_BASE_URL = 'https://traetrustbookjdrz.vercel.app'
const DEFAULT_VITE_APP_URL = DEFAULT_APP_BASE_URL

if (setIfMissingOrEmpty(prodLines, 'APP_BASE_URL', DEFAULT_APP_BASE_URL)) merged += 1
if (setIfMissingOrEmpty(prodLines, 'VITE_APP_URL', DEFAULT_VITE_APP_URL)) merged += 1

if (!prodLines.at(-1)?.trim()) {
  // keep trailing newline normalization
} else {
  prodLines.push('')
}

writeFileSync(productionPath, prodLines.join('\n').replace(/\n*$/, '\n'), 'utf8')
process.stdout.write(`[merge-prod-env] OK: merged ${merged} key(s) into .env.production (without overwriting non-empty values).\n`)

