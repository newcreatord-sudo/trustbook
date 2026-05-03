/**
 * Carica i template HTML da supabase/templates e li applica al progetto Supabase Cloud
 * tramite Management API (PATCH /v1/projects/:ref/config/auth).
 *
 * Uso:
 *   node scripts/push-auth-email-templates.mjs              → solo dry-run (default)
 *   node scripts/push-auth-email-templates.mjs --live       → applica sul progetto remoto
 *   node scripts/push-auth-email-templates.mjs --verify   → GET config auth e controllo basilare
 *
 * Env richiesti per --live / --verify:
 *   SUPABASE_ACCESS_TOKEN — Account → Access Tokens (dashboard.supabase.com)
 *   SUPABASE_PROJECT_REF — opzionale se ricavabile da SUPABASE_URL / VITE_SUPABASE_URL (*.supabase.co)
 */

import { readFileSync, existsSync } from 'node:fs'
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

const LIVE = process.argv.includes('--live')
const VERIFY = process.argv.includes('--verify')

const TEMPLATE_DIR = resolve(process.cwd(), 'supabase/templates')

const SUBJECTS = {
  confirmation: 'Conferma il tuo indirizzo email — TrustBook',
  recovery: 'Reimposta la password — TrustBook',
  email_change: 'Conferma il nuovo indirizzo email — TrustBook',
  magic_link: 'Il tuo link di accesso — TrustBook',
  password_changed: 'La tua password TrustBook è stata modificata',
}

/** @type {Record<string, string>} */
const FILES = {
  confirmation: 'confirmation.html',
  recovery: 'recovery.html',
  email_change: 'email_change.html',
  magic_link: 'magic_link.html',
  password_changed_notification: 'password_changed_notification.html',
}

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
  process.stderr.write(`[push-auth-email-templates] ${msg}\n`)
  process.exit(1)
}

/** Ref progetto estratto dall’host tipo `<ref>.supabase.co` */
function projectRefFromSupabaseUrl(urlStr) {
  try {
    const h = new URL(urlStr).hostname.toLowerCase()
    const m = h.match(/^([a-z0-9]{15,})\.supabase\.co$/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

function normalizeProjectRef(raw) {
  const s = raw.trim().toLowerCase()
  if (!/^[a-z0-9]{15,}$/.test(s)) return null
  return s
}

function loadTemplate(filename) {
  const p = resolve(TEMPLATE_DIR, filename)
  if (!existsSync(p)) fail(`Missing template file: ${p}`)
  return readFileSync(p, 'utf8')
}

function buildPatchPayload() {
  const confirmation = loadTemplate(FILES.confirmation)
  const recovery = loadTemplate(FILES.recovery)
  const emailChange = loadTemplate(FILES.email_change)
  const magicLink = loadTemplate(FILES.magic_link)
  const pwdChanged = loadTemplate(FILES.password_changed_notification)

  return {
    mailer_subjects_confirmation: SUBJECTS.confirmation,
    mailer_templates_confirmation_content: confirmation,
    mailer_subjects_recovery: SUBJECTS.recovery,
    mailer_templates_recovery_content: recovery,
    mailer_subjects_email_change: SUBJECTS.email_change,
    mailer_templates_email_change_content: emailChange,
    mailer_subjects_magic_link: SUBJECTS.magic_link,
    mailer_templates_magic_link_content: magicLink,
    mailer_notifications_password_changed_enabled: true,
    mailer_subjects_password_changed_notification: SUBJECTS.password_changed,
    mailer_templates_password_changed_notification_content: pwdChanged,
  }
}

function summarizePayload(payload) {
  const keys = Object.keys(payload).sort()
  process.stdout.write('[push-auth-email-templates] Payload keys:\n')
  for (const k of keys) {
    const v = payload[k]
    const len = typeof v === 'string' ? v.length : JSON.stringify(v).length
    process.stdout.write(`  ${k}: ${typeof v === 'string' ? `${len} chars` : String(v)}\n`)
  }
}

async function fetchAuthConfig(projectRef, token) {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, json, text }
}

async function patchAuthConfig(projectRef, token, body) {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* ignore */
  }
  return { ok: res.ok, status: res.status, json, text }
}

function verifyRemoteTemplates(authJson) {
  if (!authJson || typeof authJson !== 'object') {
    process.stdout.write('[push-auth-email-templates] WARN verify: unexpected GET response shape.\n')
    return
  }
  const conf = authJson.mailer_templates_confirmation_content
  const okTrustBook =
    typeof conf === 'string' &&
    conf.includes('TrustBook') &&
    conf.includes('{{ .ConfirmationURL }}')
  process.stdout.write(
    `[push-auth-email-templates] Verify confirmation template: ${okTrustBook ? 'OK (TrustBook + ConfirmationURL)' : 'CHECK MANUALLY'}\n`,
  )
}

const supabaseUrl = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
const token = readEnvAny([
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_MANAGEMENT_ACCESS_TOKEN',
  'SUPABASE_CLI_ACCESS_TOKEN',
])
let projectRef =
  normalizeProjectRef(readEnvAny(['SUPABASE_PROJECT_REF']) ?? '') ||
  (supabaseUrl ? projectRefFromSupabaseUrl(supabaseUrl) : null)

if (!VERIFY && !LIVE) {
  process.stdout.write('[push-auth-email-templates] Dry-run (nessun invio remoto).\n')
  process.stdout.write('[push-auth-email-templates] Aggiungi --live per applicare al progetto Cloud.\n')
  process.stdout.write('[push-auth-email-templates] Aggiungi --verify per leggere la config auth remota.\n\n')
  const payload = buildPatchPayload()
  summarizePayload(payload)
  process.stdout.write('\n[push-auth-email-templates] Dry-run OK.\n')
  process.exit(0)
}

if (!token) fail('Missing SUPABASE_ACCESS_TOKEN (richiesto per --live / --verify)')
if (!projectRef) {
  fail(
    'Missing SUPABASE_PROJECT_REF o URL *.supabase.co in SUPABASE_URL/VITE_SUPABASE_URL per ricavare il ref.',
  )
}

process.stdout.write(`[push-auth-email-templates] Project ref: ${projectRef}\n`)

if (VERIFY) {
  const got = await fetchAuthConfig(projectRef, token)
  if (!got.ok) {
    process.stderr.write(`[push-auth-email-templates] GET auth config failed HTTP ${got.status}\n${got.text.slice(0, 800)}\n`)
    process.exit(1)
  }
  verifyRemoteTemplates(got.json)
  process.stdout.write('[push-auth-email-templates] GET OK.\n')
  if (!LIVE) process.exit(0)
}

if (LIVE) {
  process.stdout.write('[push-auth-email-templates] PATCH auth templates (--live)...\n')
  const payload = buildPatchPayload()
  summarizePayload(payload)
  const patched = await patchAuthConfig(projectRef, token, payload)
  if (!patched.ok) {
    process.stderr.write(
      `[push-auth-email-templates] PATCH failed HTTP ${patched.status}\n${patched.text.slice(0, 1200)}\n`,
    )
    process.exit(1)
  }
  process.stdout.write('[push-auth-email-templates] PATCH OK.\n')

  const recheck = await fetchAuthConfig(projectRef, token)
  if (recheck.ok && recheck.json) verifyRemoteTemplates(recheck.json)
}

process.stdout.write('[push-auth-email-templates] Done.\n')
