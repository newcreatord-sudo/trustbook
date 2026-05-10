import process from 'node:process'
import { resolve } from 'node:path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

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

function fail(msg) {
  throw new Error(msg)
}

function argValue(name) {
  const found = process.argv.find((x) => x.startsWith(`--${name}=`)) ?? null
  return found ? found.slice(name.length + 3).trim() : null
}

function typeFromArgs() {
  const raw = (argValue('type') || 'recovery').toLowerCase()
  if (raw === 'recovery' || raw === 'signup') return raw
  return 'recovery'
}

async function main() {
  const type = typeFromArgs()
  const email = String(argValue('email') || '').trim().toLowerCase()
  const redirectTo = String(argValue('redirect-to') || argValue('redirectTo') || '').trim() || null
  if (!email || !email.includes('@')) fail('Missing --email=<email>')

  const supabaseUrl = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const serviceRoleKey = readEnvAny(['SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'])
  if (!supabaseUrl || !serviceRoleKey) fail('Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY')

  const sbAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })

  const { data, error } = await sbAdmin.auth.admin.generateLink({
    type,
    email,
    options: redirectTo ? { redirectTo } : undefined,
  })
  if (error) fail(String(error.message || error))

  const actionLink = data?.properties?.action_link ?? null
  const emailOtp = data?.properties?.email_otp ?? null
  const hashedToken = data?.properties?.hashed_token ?? null

  if (actionLink) process.stdout.write(`AUTH_ACTION_LINK=${actionLink}\n`)
  if (emailOtp) process.stdout.write(`AUTH_EMAIL_OTP=${emailOtp}\n`)
  if (hashedToken) process.stdout.write(`AUTH_HASHED_TOKEN=${hashedToken}\n`)
}

main().catch((e) => {
  process.stderr.write(`[generate-auth-link] ${String(e?.message || e)}\n`)
  process.exitCode = 1
})
