import process from 'node:process'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
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

const envFile = readArg('env-file') ?? '.env.staging'
const targets = (readArg('targets') ?? 'production')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean)
const tokenArg = readArg('token') ?? null
const keys = parseKeys(readArg('keys')) ?? [
  'APP_BASE_URL',
  'PAYMENTS_ENABLED',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'VITE_GOOGLE_MAPS_API_KEY',
  'VITE_GOOGLE_MAPS_MAP_ID',
  'VITE_STRIPE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
]

const optionalKeys = new Set(['ALLOWED_ORIGINS', 'VITE_APP_URL', 'STRIPE_WH_SECRET'])

const raw = readFileSync(resolve(process.cwd(), envFile), 'utf8')
const parsed = dotenv.parse(raw)
const token = (tokenArg ?? String(parsed.VERCEL_TOKEN ?? '').trim() ?? '').trim() || null

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

const wh1 = String(parsed.STRIPE_WEBHOOK_SECRET ?? '').trim()
const wh2 = String(parsed.STRIPE_WH_SECRET ?? '').trim()
if (!wh1 && !wh2) {
  process.stderr.write(
    `[vercel-push-env] Missing webhook secret: set STRIPE_WEBHOOK_SECRET (or STRIPE_WH_SECRET) in ${envFile}\n`,
  )
  process.exit(2)
}

const pushKey = (k) => {
  const v = String(parsed[k] ?? '').trim()
  for (const target of targets) {
    const cmd =
      process.platform === 'win32'
        ? {
            file: 'cmd',
            args: [
              '/c',
              'npx',
              '-y',
              'vercel@53.1.0',
              'env',
              'add',
              k,
              target,
              '--force',
              '--yes',
              ...(token ? ['--token', token] : []),
            ],
          }
        : {
            file: 'npx',
            args: ['-y', 'vercel@53.1.0', 'env', 'add', k, target, '--force', '--yes', ...(token ? ['--token', token] : [])],
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
