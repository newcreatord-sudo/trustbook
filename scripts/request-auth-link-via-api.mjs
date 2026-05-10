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

function argValue(name) {
  const found = process.argv.find((x) => x.startsWith(`--${name}=`)) ?? null
  return found ? found.slice(name.length + 3).trim() : null
}

function fail(msg) {
  throw new Error(msg)
}

async function main() {
  const baseUrl = String(argValue('base-url') || readEnvAny(['APP_BASE_URL', 'VITE_APP_URL']) || '').trim()
  const token = readEnvAny(['AUTH_ADMIN_SIGNUP_TOKEN', 'ADMIN_SIGNUP_TOKEN'])
  const email = String(argValue('email') || '').trim().toLowerCase()
  const typeRaw = String(argValue('type') || 'signup').trim().toLowerCase()
  const type = typeRaw === 'signup' || typeRaw === 'recovery' ? typeRaw : null
  const redirectTo = String(argValue('redirect-to') || '').trim() || null
  const vercelBypass = readEnvAny(['VERCEL_AUTOMATION_BYPASS_SECRET'])

  if (!baseUrl) fail('Missing --base-url or APP_BASE_URL/VITE_APP_URL')
  if (!token) fail('Missing AUTH_ADMIN_SIGNUP_TOKEN/ADMIN_SIGNUP_TOKEN')
  if (!email || !email.includes('@')) fail('Missing --email=<email>')
  if (!type) fail('Invalid --type (signup|recovery)')

  const headers = {
    'Content-Type': 'application/json',
    'X-Admin-Signup-Token': token,
  }
  if (vercelBypass) headers['x-vercel-protection-bypass'] = vercelBypass

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/auth/admin-generate-link`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, type, redirectTo }),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) fail(`HTTP ${res.status} ${JSON.stringify(json)}`)
  if (!json || json.success !== true) fail(`Bad payload: ${JSON.stringify(json)}`)

  if (json.otp) process.stdout.write(`AUTH_EMAIL_OTP=${json.otp}\n`)
  if (json.actionLink) process.stdout.write(`AUTH_ACTION_LINK=${json.actionLink}\n`)
  if (json.tempPassword) process.stdout.write(`AUTH_TEMP_PASSWORD=${json.tempPassword}\n`)
}

main().catch((e) => {
  process.stderr.write(`[request-auth-link-via-api] ${String(e?.message || e)}\n`)
  process.exitCode = 1
})
