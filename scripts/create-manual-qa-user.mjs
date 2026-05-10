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

function baseUrlFromEnv() {
  const appBaseUrl = readEnvAny(['APP_BASE_URL', 'VITE_APP_URL'])
  const baseUrlArg = process.argv.find((x) => x.startsWith('--base-url=')) ?? null
  const baseUrl = (baseUrlArg?.slice('--base-url='.length).trim() || appBaseUrl || '').replace(/\/$/, '')
  return baseUrl || null
}

function roleFromArgs() {
  const roleArg = process.argv.find((x) => x.startsWith('--role=')) ?? null
  const role = (roleArg?.slice('--role='.length).trim() || 'cliente').toLowerCase()
  if (role === 'cliente' || role === 'attivita') return role
  return 'cliente'
}

function fail(msg) {
  throw new Error(msg)
}

function mergedHeaders(existing, extra) {
  const h = new Headers(existing || undefined)
  for (const [k, v] of Object.entries(extra || {})) {
    if (typeof v === 'string') h.set(k, v)
  }
  return h
}

async function main() {
  const preferServiceRole = process.argv.includes('--prefer-service-role') || process.argv.includes('--service-role')
  const unconfirmed = process.argv.includes('--unconfirmed')
  const adminSignupToken = preferServiceRole ? null : readEnvAny(['AUTH_ADMIN_SIGNUP_TOKEN', 'ADMIN_SIGNUP_TOKEN'])
  const baseUrl = baseUrlFromEnv()
  if (!adminSignupToken && !readEnvAny(['SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'])) {
    fail('Missing AUTH_ADMIN_SIGNUP_TOKEN/ADMIN_SIGNUP_TOKEN and missing SUPABASE_SERVICE_ROLE_KEY')
  }
  if (adminSignupToken && !baseUrl) fail('Missing --base-url or APP_BASE_URL/VITE_APP_URL')

  const vercelBypass = readEnvAny(['VERCEL_AUTOMATION_BYPASS_SECRET'])
  const role = roleFromArgs()

  const tag = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  const email = `manual.qa.${role}+${tag}@example.com`
  const password = `TB!${Date.now()}aA1`

  async function fetchTb(path, init) {
    const url = path.startsWith('http') ? path : `${baseUrl}${path}`
    const extra = vercelBypass ? { 'x-vercel-protection-bypass': vercelBypass } : null
    const headers = extra ? mergedHeaders(init?.headers, extra) : init?.headers
    return fetch(url, { ...(init || {}), headers })
  }

  if (adminSignupToken) {
    const res = await fetchTb('/api/auth/admin-signup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Signup-Token': adminSignupToken,
      },
      body: JSON.stringify({
        email,
        password,
        role,
        firstName: 'Manual',
        lastName: 'QA',
      }),
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      fail(`admin-signup failed: HTTP ${res.status} ${txt}`)
    }

    const json = await res.json().catch(() => null)
    if (!json || json.success !== true) fail(`Bad payload: ${JSON.stringify(json)}`)
  } else {
    const supabaseUrl = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
    const serviceRoleKey = readEnvAny(['SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY'])
    if (!supabaseUrl || !serviceRoleKey) fail('Missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY')
    const sbAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
    const { error } = await sbAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: !unconfirmed,
      user_metadata: { role, first_name: 'Manual', last_name: 'QA' },
    })
    if (error) fail(`service-role createUser failed: ${String(error.message || error)}`)
  }

  process.stdout.write(`MANUAL_QA_USER_EMAIL=${email}\n`)
  process.stdout.write(`MANUAL_QA_USER_PASSWORD=${password}\n`)
}

main().catch((e) => {
  process.stderr.write(`[create-manual-qa-user] ${String(e?.message || e)}\n`)
  process.exitCode = 1
})
