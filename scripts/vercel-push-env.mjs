import process from 'node:process'
import { resolve } from 'node:path'
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import dotenv from 'dotenv'

function readArg(name) {
  const raw = process.argv.find((x) => x.startsWith(`--${name}=`)) ?? null
  if (!raw) return null
  const v = raw.slice(`--${name}=`.length).trim()
  return v.length ? v : null
}

function parseKeys(raw) {
  if (!raw) return null
  const xs = raw
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  return xs.length ? xs : null
}

function parseFileIfExists(relPath) {
  const abs = resolve(process.cwd(), relPath)
  if (!existsSync(abs)) return null
  const raw = readFileSync(abs, 'utf8')
  return { raw, parsed: dotenv.parse(raw) }
}

const envFile = readArg('env-file') ?? '.env.staging'
const targets = (readArg('targets') ?? 'production')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean)
const tokenArg = readArg('token') ?? null
const keysArg = parseKeys(readArg('keys'))

const raw = readFileSync(resolve(process.cwd(), envFile), 'utf8')
const parsed = dotenv.parse(raw)

const paymentsEnabled = String(parsed.PAYMENTS_ENABLED ?? '').trim() === '1'

const defaultKeys = [
  'APP_BASE_URL',
  'VITE_APP_URL',
  'ALLOWED_ORIGINS',
  'PAYMENTS_ENABLED',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_GOOGLE_MAPS_API_KEY',
  'VITE_GOOGLE_MAPS_MAP_ID',
  'AUTH_ADMIN_SIGNUP_TOKEN',
  'CRON_SECRET',
  'EMAIL_DISPATCH_TOKEN',
  'OPS_REVIEW_REPORTS_TOKEN',
  'VERCEL_AUTOMATION_BYPASS_SECRET',
]

if (paymentsEnabled) {
  defaultKeys.push('VITE_STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET')
}

const keys = keysArg ?? defaultKeys

const optionalKeys = new Set(['ALLOWED_ORIGINS', 'VERCEL_AUTOMATION_BYPASS_SECRET'])

const tokenFallback =
  String(parsed.VERCEL_TOKEN ?? '').trim() ||
  String(parseFileIfExists('.env.local')?.parsed?.VERCEL_TOKEN ?? '').trim() ||
  String(parseFileIfExists('.env')?.parsed?.VERCEL_TOKEN ?? '').trim() ||
  ''

const token = (tokenArg ?? tokenFallback).trim() || null

const missingRequired = keys.filter(
  (k) =>
    !optionalKeys.has(k) && (!(k in parsed) || String(parsed[k] ?? '').trim().length === 0),
)
if (missingRequired.length) {
  process.stderr.write(
    `[vercel-push-env] Missing required keys in ${envFile}: ${missingRequired.join(', ')}\n`,
  )
  process.exit(2)
}

if (paymentsEnabled) {
  const wh1 = String(parsed.STRIPE_WEBHOOK_SECRET ?? '').trim()
  const wh2 = String(parsed.STRIPE_WH_SECRET ?? '').trim()
  if (!wh1 && !wh2) {
    process.stderr.write(
      `[vercel-push-env] Missing webhook secret: set STRIPE_WEBHOOK_SECRET (or STRIPE_WH_SECRET) in ${envFile}\n`,
    )
    process.exit(2)
  }
}

const pushKey = (k) => {
  const v = String(parsed[k] ?? '').trim()
  for (const target of targets) {
    const previewBranch = readArg('preview-branch') ?? 'main'
    const targetArgs =
      target === 'preview'
        ? ['env', 'add', k, target, previewBranch, '--force', '--yes', ...(token ? ['--token', token] : [])]
        : ['env', 'add', k, target, '--force', '--yes', ...(token ? ['--token', token] : [])]

    const cmd =
      process.platform === 'win32'
        ? {
            file: 'cmd',
            args: ['/c', 'npx', '-y', 'vercel@53.1.0', ...targetArgs],
          }
        : {
            file: 'npx',
            args: ['-y', 'vercel@53.1.0', ...targetArgs],
          }

    const res = spawnSync(cmd.file, cmd.args, { input: `${v}\n`, encoding: 'utf8' })
    if (res.status !== 0) {
      process.stderr.write(`[vercel-push-env] Failed to set ${k} (${target})\n`)
      if (res.stdout) process.stderr.write(res.stdout)
      if (res.stderr) process.stderr.write(res.stderr)
      process.exit(res.status ?? 1)
    }
  }
}

for (const k of keys) pushKey(k)

process.stdout.write(`[vercel-push-env] OK (${keys.length} vars)\n`)
