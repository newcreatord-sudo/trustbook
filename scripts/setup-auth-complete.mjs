/**
 * Setup Auth/email end-to-end quanto automatizzabile dal repo:
 * - db:apply-critical se DATABASE_URL / SUPABASE_DB_URL è valorizzato
 * - auth:templates:sync se token Management API e (URL *.supabase.co oppure SUPABASE_PROJECT_REF)
 *
 * Il resto (SMTP dashboard, conferma email ON, test registrazione) è in docs/AUTH_EMAIL_COMPLETE_IT.md
 */

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'

const envFileArg = process.argv.find((x) => x.startsWith('--env-file=')) ?? null
if (envFileArg) {
  const envFile = envFileArg.slice('--env-file='.length).trim()
  if (envFile) dotenv.config({ path: resolve(process.cwd(), envFile), override: true })
}

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

function managementAccessToken() {
  for (const k of ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_MANAGEMENT_ACCESS_TOKEN', 'SUPABASE_CLI_ACCESS_TOKEN']) {
    const v = process.env[k]?.trim()
    if (v) return v
  }
  return ''
}

function run(label, cmd, args) {
  process.stdout.write(`\n[setup:auth-complete] ▶ ${label}\n`)
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: process.cwd(),
    env: process.env,
  })
  return r.status ?? 1
}

let exit = 0

const dbUrl = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL
if (dbUrl?.trim()) {
  const code = run(
    'Migrazioni critiche (email/auth + booking + recensioni verificate)',
    'npm',
    ['run', 'db:apply-critical'],
  )
  if (code !== 0) exit = code
} else {
  process.stdout.write('[setup:auth-complete] SKIP db:apply-critical — manca DATABASE_URL o SUPABASE_DB_URL.\n')
}

function normalizeProjectRef(raw) {
  if (!raw || typeof raw !== 'string') return null
  const s = raw.trim().toLowerCase()
  if (!/^[a-z0-9]{15,}$/.test(s)) return null
  return s
}

const token = managementAccessToken()
const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '').trim()
const cloud = url.includes('supabase.co')
const projectRef = normalizeProjectRef(process.env.SUPABASE_PROJECT_REF ?? '')
const canPushTemplates = Boolean(token && (cloud || projectRef))

if (canPushTemplates) {
  const code = run('Template email → progetto Supabase Cloud', 'npm', ['run', 'auth:templates:sync'])
  if (code !== 0) exit = code
} else {
  process.stdout.write(
    '[setup:auth-complete] SKIP auth:templates:sync — serve token Management API e (URL *.supabase.co oppure SUPABASE_PROJECT_REF).\n',
  )
  process.stdout.write(
    `[setup:auth-complete] Diagnostica (no segreti): TOKEN_ok=${Boolean(token)} cloud_url=${cloud} PROJECT_REF_ok=${Boolean(projectRef)}\n`,
  )
}

process.stdout.write(`
[setup:auth-complete] Fatto (codice uscita ${exit}).
Guida operativa completa: docs/AUTH_EMAIL_COMPLETE_IT.md
`)

process.exit(exit)
