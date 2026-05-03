/**
 * Orchestrazione rapida per provare il flusso email Auth in modo realistico:
 * 1) valida template locali (dry-run)
 * 2) opzionale: GET config auth remota (--verify fa parte di push script; qui richiamiamo npm)
 * 3) opzionale: health API locale + verify-auth-email dryRun
 *
 * Uso:
 *   npm run auth:email:test-remote
 *
 * Env utili:
 *   SUPABASE_ACCESS_TOKEN + SUPABASE_URL (o VITE_*) → verify remoto automatico
 *   Avvia anche `npm run dev` in un altro terminale per il punto (3).
 */

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

function runNpm(script) {
  process.stdout.write(`\n[auth-email-test-remote] ▶ npm run ${script}\n\n`)
  const r = spawnSync('npm', ['run', script], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true,
    env: process.env,
  })
  return r.status ?? 1
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

let code = runNpm('auth:templates:dry-run')
if (code !== 0) process.exit(code)

const token = readEnvAny(['SUPABASE_ACCESS_TOKEN'])
const url = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
if (token && url?.includes('supabase.co')) {
  code = runNpm('auth:templates:verify-remote')
  if (code !== 0) process.exit(code)
} else {
  process.stdout.write(
    '\n[auth-email-test-remote] Skip verify remoto: imposta SUPABASE_ACCESS_TOKEN e un URL *.supabase.co in SUPABASE_URL/VITE_SUPABASE_URL.\n',
  )
}

async function tryLocalApi() {
  try {
    const res = await fetch('http://localhost:3001/api/health')
    if (!res.ok) return false
    process.stdout.write('\n[auth-email-test-remote] API locale risponde → eseguo api:verify-auth-email\n\n')
    const r = spawnSync('npm', ['run', 'api:verify-auth-email'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: true,
      env: process.env,
    })
    return (r.status ?? 1) === 0
  } catch {
    return false
  }
}

const apiOk = await tryLocalApi()
if (!apiOk) {
  process.stdout.write(
    '\n[auth-email-test-remote] API non raggiungibile su localhost:3001 (normale se `npm run dev` non è avviato).\n',
  )
}

process.stdout.write(`
[auth-email-test-remote] ─── Prova manuale consigliata (mail vera) ───
  1) DB: applica migrazioni inclusa 0060_remove_auth_auto_confirm (npm run db:apply-critical o pipeline SQL).
  2) Dashboard Supabase → Authentication → Providers → Email → **Confirm email** = ON.
  3) Dashboard → SMTP personalizzato configurato (consigliato per recapito reale).
  4) Template remoti: npm run auth:templates:push (prima crea SUPABASE_ACCESS_TOKEN nel dashboard account).
  5) .env.local: commenta/rimuovi AUTH_DEV_SIGNUP_CONFIRMED per non bypassare la mail.
  6) npm run dev → registra un utente con una email che controlli → apri il link → oppure «Conferma account con codice» sul Login.

Guida completa: docs/AUTH_EMAIL_COMPLETE_IT.md

`)

process.stdout.write('[auth-email-test-remote] Fine checklist.\n')
