import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import crypto from 'node:crypto'

function readArg(name) {
  const raw = process.argv.find((x) => x.startsWith(`--${name}=`)) ?? null
  if (!raw) return null
  const v = raw.slice(`--${name}=`.length).trim()
  return v.length ? v : null
}

const envFile = readArg('env-file') ?? '.env.production'
const envPath = resolve(process.cwd(), envFile)

if (!existsSync(envPath)) {
  process.stderr.write(`[ensure-env-secrets] Missing env file: ${envFile}\n`)
  process.exit(2)
}

const raw = readFileSync(envPath, 'utf8')
const lines = raw.split(/\r?\n/)

function keyOf(line) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line.trim())
  return m?.[1] ?? null
}

function valueOf(line) {
  const idx = line.indexOf('=')
  if (idx < 0) return null
  return line.slice(idx + 1).trim()
}

function isEmptyVal(v) {
  if (v === null) return true
  const t = v.trim()
  return t === '' || t === '""' || t === "''"
}

function setKey(key, value) {
  const idx = lines.findIndex((l) => keyOf(l) === key)
  const row = `${key}=${value}`
  if (idx >= 0) lines[idx] = row
  else lines.push(row)
}

function ensureSecret(key, bytes) {
  const idx = lines.findIndex((l) => keyOf(l) === key)
  const cur = idx >= 0 ? valueOf(lines[idx]) : null
  if (!isEmptyVal(cur)) return false
  const next = crypto.randomBytes(bytes).toString('hex')
  setKey(key, next)
  return true
}

const changed = []
if (ensureSecret('CRON_SECRET', 24)) changed.push('CRON_SECRET')
if (ensureSecret('EMAIL_DISPATCH_TOKEN', 24)) changed.push('EMAIL_DISPATCH_TOKEN')
if (ensureSecret('AUTH_ADMIN_SIGNUP_TOKEN', 32)) changed.push('AUTH_ADMIN_SIGNUP_TOKEN')
if (ensureSecret('OPS_REVIEW_REPORTS_TOKEN', 24)) changed.push('OPS_REVIEW_REPORTS_TOKEN')
if (ensureSecret('DB_SSL_REJECT_UNAUTHORIZED', 1)) {
  // byte random is not a good fit for a boolean-ish flag; force secure default
  setKey('DB_SSL_REJECT_UNAUTHORIZED', '1')
  changed.push('DB_SSL_REJECT_UNAUTHORIZED')
}

if (changed.length === 0) {
  process.stdout.write(`[ensure-env-secrets] OK: no changes (${envFile}).\n`)
  process.exit(0)
}

writeFileSync(envPath, lines.join('\n').replace(/\n*$/, '\n'), 'utf8')
process.stdout.write(`[ensure-env-secrets] OK: set ${changed.length} secret(s) in ${envFile}.\n`)
