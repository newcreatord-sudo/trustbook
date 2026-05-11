import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'

const envFileArg = process.argv.find((x) => x.startsWith('--env-file=')) ?? null
const envFile = envFileArg?.slice('--env-file='.length).trim() || '.env.staging'
const envPath = resolve(process.cwd(), envFile)
const envLocalPath = resolve(process.cwd(), `${envFile}.local`)
const fileKind = envFile.toLowerCase().includes('production') ? 'production' : 'staging'
const requirePayments = process.argv.includes('--require-payments')
const requireStripeSaas = process.argv.includes('--require-stripe-saas')

if (!existsSync(envPath)) {
  process.stderr.write(`[env-validate] FAILED: missing env file ${envFile}\n`)
  process.exit(1)
}

function parseFileIfExists(p) {
  if (!existsSync(p)) return null
  const raw = readFileSync(p, 'utf8')
  return { raw, parsed: dotenv.parse(raw) }
}

const base = parseFileIfExists(envPath)
const local = parseFileIfExists(envLocalPath)

const parsed = {
  ...(base?.parsed ?? {}),
  ...(local?.parsed ?? {}),
}

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

function pgUrlSslMode(v) {
  try {
    const u = new URL(v)
    const sslmode = (u.searchParams.get('sslmode') || '').trim().toLowerCase()
    return sslmode || null
  } catch {
    return null
  }
}

function isAcceptableSslMode(sslmode) {
  return sslmode === 'require' || sslmode === 'verify-ca' || sslmode === 'verify-full'
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

const dbUrlOk = Boolean(dbUrl && !looksPlaceholder(dbUrl))
const supabaseDbUrlOk = Boolean(supabaseDbUrl && !looksPlaceholder(supabaseDbUrl))
if (!dbUrlOk && !supabaseDbUrlOk) {
  errors.push('Missing DB connection: set DATABASE_URL or SUPABASE_DB_URL')
}

for (const [label, v] of [
  ['DATABASE_URL', dbUrl],
  ['SUPABASE_DB_URL', supabaseDbUrl],
]) {
  if (!v) continue
  const sslmode = pgUrlSslMode(v)
  if (sslmode && !isAcceptableSslMode(sslmode)) {
    errors.push(`${label} sslmode must be require/verify-ca/verify-full (got ${sslmode})`)
  }
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
  if (dbUrlOk && dbUrl && !dbUrlLooksLikeSameSupabaseProject(dbUrl, supabaseRef)) {
    errors.push('DATABASE_URL does not appear to target the same Supabase project as SUPABASE_URL')
  }
  if (supabaseDbUrlOk && supabaseDbUrl && !dbUrlLooksLikeSameSupabaseProject(supabaseDbUrl, supabaseRef)) {
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

const viteSentryDsn = readKey('VITE_SENTRY_DSN')
const sentryDsn = readKey('SENTRY_DSN')
if (viteSentryDsn && !isValidUrl(viteSentryDsn)) {
  errors.push('VITE_SENTRY_DSN must be a valid https URL')
}
if (sentryDsn && !isValidUrl(sentryDsn)) {
  errors.push('SENTRY_DSN must be a valid https URL')
}
if (viteSentryDsn && sentryDsn && viteSentryDsn !== sentryDsn) {
  warnings.push('VITE_SENTRY_DSN and SENTRY_DSN differ (frontend vs backend); ensure both point to the intended Sentry project')
}

const sentryAuthToken = readKey('SENTRY_AUTH_TOKEN')
const sentryOrg = readKey('SENTRY_ORG')
const sentryProject = readKey('SENTRY_PROJECT')
const sentrySourcemapsAny = Boolean(sentryAuthToken || sentryOrg || sentryProject)
if (sentrySourcemapsAny) {
  for (const key of ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']) {
    const v = readKey(key)
    if (!v) {
      errors.push(`Missing required key: ${key} (required for Sentry sourcemap upload)`)
      continue
    }
    if (looksPlaceholder(v)) {
      errors.push(`Placeholder detected in ${key}`)
    }
  }
}

const posthogKey = readKey('VITE_POSTHOG_KEY')
const posthogHost = readKey('VITE_POSTHOG_HOST')
if (posthogHost && !isValidUrl(posthogHost)) {
  errors.push('VITE_POSTHOG_HOST must be a valid https URL')
}
if (posthogHost && looksPlaceholder(posthogHost)) {
  errors.push('Placeholder detected in VITE_POSTHOG_HOST')
}
if (posthogKey && looksPlaceholder(posthogKey)) {
  errors.push('Placeholder detected in VITE_POSTHOG_KEY')
}

const webPushPublic = readKey('WEB_PUSH_VAPID_PUBLIC_KEY')
const webPushPrivate = readKey('WEB_PUSH_VAPID_PRIVATE_KEY')
const webPushSubject = readKey('WEB_PUSH_VAPID_SUBJECT')
const viteWebPushPublic = readKey('VITE_WEB_PUSH_VAPID_PUBLIC_KEY')
const webPushAny = Boolean(webPushPublic || webPushPrivate || webPushSubject || viteWebPushPublic)
if (webPushAny) {
  for (const key of ['WEB_PUSH_VAPID_PUBLIC_KEY', 'WEB_PUSH_VAPID_PRIVATE_KEY', 'WEB_PUSH_VAPID_SUBJECT']) {
    const v = readKey(key)
    if (!v) {
      errors.push(`Missing required key: ${key}`)
      continue
    }
    if (looksPlaceholder(v)) {
      errors.push(`Placeholder detected in ${key}`)
    }
  }

  if (!viteWebPushPublic) {
    errors.push('Missing required key: VITE_WEB_PUSH_VAPID_PUBLIC_KEY (required to enable web-push subscribe UI)')
  } else if (looksPlaceholder(viteWebPushPublic)) {
    errors.push('Placeholder detected in VITE_WEB_PUSH_VAPID_PUBLIC_KEY')
  } else if (webPushPublic && viteWebPushPublic !== webPushPublic) {
    warnings.push('VITE_WEB_PUSH_VAPID_PUBLIC_KEY differs from WEB_PUSH_VAPID_PUBLIC_KEY; clients must subscribe using the same public key')
  }
}

const emailDispatchToken = readKey('EMAIL_DISPATCH_TOKEN')
const emailProvider = (readKey('EMAIL_PROVIDER') ?? 'smtp').toLowerCase()
if (emailProvider && !['smtp', 'resend'].includes(emailProvider)) {
  errors.push('EMAIL_PROVIDER must be "smtp" or "resend" when provided')
}

if (emailDispatchToken) {
  const emailFrom = readKey('EMAIL_FROM') ?? readKey('SMTP_FROM')
  if (!emailFrom) errors.push('EMAIL_FROM (or SMTP_FROM) is required when EMAIL_DISPATCH_TOKEN is set')

  if (emailProvider === 'resend') {
    const resendKey = readKey('RESEND_API_KEY')
    if (!resendKey) errors.push('RESEND_API_KEY is required when EMAIL_PROVIDER=resend and EMAIL_DISPATCH_TOKEN is set')
    if (resendKey && looksPlaceholder(resendKey)) errors.push('Placeholder detected in RESEND_API_KEY')
  } else {
    for (const key of ['SMTP_HOST', 'SMTP_PORT']) {
      const v = readKey(key)
      if (!v) errors.push(`Missing required key: ${key} (required when EMAIL_DISPATCH_TOKEN is set and EMAIL_PROVIDER=smtp)`)
      if (v && looksPlaceholder(v)) errors.push(`Placeholder detected in ${key}`)
    }
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
