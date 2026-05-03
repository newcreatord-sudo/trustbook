import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'

const envFileArg = process.argv.find((x) => x.startsWith('--env-file=')) ?? null
const envFile = envFileArg?.slice('--env-file='.length).trim() || '.env.staging'
const envPath = resolve(process.cwd(), envFile)
const fileKind = envFile.toLowerCase().includes('production') ? 'production' : 'staging'
const requirePayments = process.argv.includes('--require-payments')
const requireStripeSaas = process.argv.includes('--require-stripe-saas')

if (!existsSync(envPath)) {
  process.stderr.write(`[env-validate] FAILED: missing env file ${envFile}\n`)
  process.exit(1)
}

const raw = readFileSync(envPath, 'utf8')
const parsed = dotenv.parse(raw)

function readKey(name) {
  const v = parsed[name]
  if (typeof v !== 'string') return null
  const trimmed = v.trim()
  return trimmed.length ? trimmed : null
}

function looksPlaceholder(v) {
  return (
    v.includes('<') ||
    v.includes('>') ||
    v.includes('YOUR_') ||
    v.includes('your_') ||
    v.includes('[YOUR') ||
    v.includes('LA_TUA_') ||
    v.includes('example.com') ||
    v.includes('project-ref')
  )
}

function isValidUrl(v, protocols = ['https:']) {
  try {
    const u = new URL(v)
    return protocols.includes(u.protocol)
  } catch {
    return false
  }
}

function isValidPgUrl(v) {
  try {
    const u = new URL(v)
    return ['postgres:', 'postgresql:'].includes(u.protocol) && Boolean(u.hostname) && Boolean(u.pathname)
  } catch {
    return false
  }
}

function supabaseProjectRefFromUrl(v) {
  try {
    const u = new URL(v)
    const host = u.hostname.toLowerCase()
    const m = /^([a-z0-9-]+)\.supabase\.co$/.exec(host)
    return m?.[1] ?? null
  } catch {
    return null
  }
}

function dbUrlLooksLikeSameSupabaseProject(dbUrl, ref) {
  if (!dbUrl || !ref) return true
  try {
    const u = new URL(dbUrl)
    const host = u.hostname.toLowerCase()
    const user = decodeURIComponent(u.username || '').toLowerCase()
    return host.includes(ref) || user.includes(ref)
  } catch {
    return true
  }
}

const requiredCore = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_GOOGLE_MAPS_API_KEY',
  'VITE_GOOGLE_MAPS_MAP_ID',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DATABASE_URL',
  'SUPABASE_DB_URL',
  'APP_BASE_URL',
  'AUTH_ADMIN_SIGNUP_TOKEN',
  'REQUIRE_DB_ASSERTIONS',
]

const requiredPayments = ['VITE_STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']

const errors = []
const warnings = []

for (const key of requiredCore) {
  const v = readKey(key)
  if (!v) {
    errors.push(`Missing required key: ${key}`)
    continue
  }
  if (looksPlaceholder(v)) {
    errors.push(`Placeholder detected in ${key}`)
  }
}

const paymentsEnabledRaw = readKey('PAYMENTS_ENABLED')
const paymentsEnabled = requirePayments || paymentsEnabledRaw === '1'
const saasEnabled = requireStripeSaas

if (paymentsEnabledRaw && !['0', '1'].includes(paymentsEnabledRaw)) {
  errors.push('PAYMENTS_ENABLED must be 0 or 1 when provided')
}

for (const key of requiredPayments) {
  const v = readKey(key)
  if ((paymentsEnabled || saasEnabled) && !v) {
    errors.push(`Missing required key: ${key}`)
    continue
  }
  if (v && looksPlaceholder(v)) {
    errors.push(`Placeholder detected in ${key}`)
  }
}

const viteSupabaseUrl = readKey('VITE_SUPABASE_URL')
const supabaseUrl = readKey('SUPABASE_URL')
const appBaseUrl = readKey('APP_BASE_URL')
const dbUrl = readKey('DATABASE_URL')
const supabaseDbUrl = readKey('SUPABASE_DB_URL')
const requireDbAssertions = readKey('REQUIRE_DB_ASSERTIONS')
const viteAnon = readKey('VITE_SUPABASE_ANON_KEY')
const anon = readKey('SUPABASE_ANON_KEY')

if (viteSupabaseUrl && !isValidUrl(viteSupabaseUrl)) {
  errors.push('VITE_SUPABASE_URL must be a valid https URL')
}
if (supabaseUrl && !isValidUrl(supabaseUrl)) {
  errors.push('SUPABASE_URL must be a valid https URL')
}
if (appBaseUrl && !isValidUrl(appBaseUrl)) {
  errors.push('APP_BASE_URL must be a valid https URL')
}
if (dbUrl && !isValidPgUrl(dbUrl)) {
  errors.push('DATABASE_URL must be a valid postgres/postgresql URL')
}
if (supabaseDbUrl && !isValidPgUrl(supabaseDbUrl)) {
  errors.push('SUPABASE_DB_URL must be a valid postgres/postgresql URL')
}
if (requireDbAssertions && !['0', '1'].includes(requireDbAssertions)) {
  errors.push('REQUIRE_DB_ASSERTIONS must be 0 or 1')
}

if (viteSupabaseUrl && supabaseUrl) {
  try {
    const vHost = new URL(viteSupabaseUrl).hostname
    const sHost = new URL(supabaseUrl).hostname
    if (vHost !== sHost) {
      errors.push('VITE_SUPABASE_URL and SUPABASE_URL must target the same host')
    }
  } catch {
    // already handled by URL validators
  }
}

if (viteAnon && anon && viteAnon !== anon) {
  errors.push('VITE_SUPABASE_ANON_KEY and SUPABASE_ANON_KEY must match')
}

if (appBaseUrl?.endsWith('/')) {
  errors.push('APP_BASE_URL must not end with "/"')
}

if (dbUrl && supabaseDbUrl && dbUrl === supabaseDbUrl) {
  errors.push(
    'DATABASE_URL and SUPABASE_DB_URL should be distinct (direct host vs pooler) to reduce connectivity risk',
  )
}

const supabaseRef = supabaseProjectRefFromUrl(supabaseUrl || viteSupabaseUrl || '')
if (supabaseRef) {
  if (dbUrl && !dbUrlLooksLikeSameSupabaseProject(dbUrl, supabaseRef)) {
    errors.push('DATABASE_URL does not appear to target the same Supabase project as SUPABASE_URL')
  }
  if (supabaseDbUrl && !dbUrlLooksLikeSameSupabaseProject(supabaseDbUrl, supabaseRef)) {
    errors.push('SUPABASE_DB_URL does not appear to target the same Supabase project as SUPABASE_URL')
  }
}

if (fileKind === 'production' && appBaseUrl) {
  if (appBaseUrl.includes('staging') || appBaseUrl.includes('localhost')) {
    errors.push('APP_BASE_URL production cannot point to staging/localhost')
  }
}

const mapId = readKey('VITE_GOOGLE_MAPS_MAP_ID')
if (fileKind === 'production' && mapId) {
  if (mapId.toUpperCase().includes('DEMO')) {
    errors.push('VITE_GOOGLE_MAPS_MAP_ID production cannot be a DEMO Map ID')
  }
}

if (fileKind === 'staging' && appBaseUrl) {
  if (appBaseUrl.includes('localhost')) {
    errors.push('APP_BASE_URL staging cannot point to localhost')
  }
}

const sslRejectUnauthorized = readKey('DB_SSL_REJECT_UNAUTHORIZED')
const sslDisable = readKey('DB_SSL_DISABLE')
if (sslRejectUnauthorized && !['0', '1'].includes(sslRejectUnauthorized)) {
  errors.push('DB_SSL_REJECT_UNAUTHORIZED must be 0 or 1 when provided')
}
if (sslDisable && !['0', '1'].includes(sslDisable)) {
  errors.push('DB_SSL_DISABLE must be 0 or 1 when provided')
}
if (fileKind === 'production') {
  if (sslDisable === '1') {
    warnings.push('DB_SSL_DISABLE=1 disables TLS for DB connections (avoid in production workflows)')
  }
  if (sslRejectUnauthorized === '0') {
    warnings.push(
      'DB_SSL_REJECT_UNAUTHORIZED=0 disables certificate verification (prefer 1 with DB_SSL_CA_* configured)',
    )
  }
}

if (errors.length > 0) {
  process.stderr.write(`[env-validate] FAILED for ${envFile}:\n`)
  for (const e of errors) {
    process.stderr.write(`- ${e}\n`)
  }
  process.exit(1)
}

process.stdout.write(`[env-validate] OK: ${envFile} is deploy-safe for ${fileKind}.\n`)
if (warnings.length > 0) {
  process.stderr.write(`[env-validate] WARNINGS for ${envFile}:\n`)
  for (const w of warnings) {
    process.stderr.write(`- ${w}\n`)
  }
}
