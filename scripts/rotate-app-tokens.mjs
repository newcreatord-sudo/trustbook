import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import crypto from 'node:crypto'
import dotenv from 'dotenv'

function readArg(name) {
  const raw = process.argv.find((x) => x.startsWith(`--${name}=`)) ?? null
  if (!raw) return null
  const v = raw.slice(`--${name}=`.length).trim()
  return v.length ? v : null
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function getLineKey(line) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line.trim())
  return m?.[1] ?? null
}

function setOrAppend(lines, key, value) {
  const idx = lines.findIndex((l) => getLineKey(l) === key)
  if (idx >= 0) lines[idx] = `${key}=${value}`
  else lines.push(`${key}=${value}`)
}

function randomHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex')
}

const envFile = readArg('env-file') ?? '.env.staging.local'
const abs = resolve(process.cwd(), envFile)
if (!existsSync(abs)) {
  process.stderr.write(`[rotate-app-tokens] Missing ${envFile}\n`)
  process.exit(2)
}

const raw = readFileSync(abs, 'utf8')
const parsed = dotenv.parse(raw)

const keys = (readArg('keys') ?? 'AUTH_ADMIN_SIGNUP_TOKEN,CRON_SECRET,EMAIL_DISPATCH_TOKEN,OPS_REVIEW_REPORTS_TOKEN,VERCEL_AUTOMATION_BYPASS_SECRET')
  .split(',')
  .map((x) => x.trim())
  .filter(Boolean)

const backup = `${abs}.bak.${stamp()}`
copyFileSync(abs, backup)

const lines = raw.split(/\r?\n/)
let updated = 0
for (const k of keys) {
  const bytes = k === 'VERCEL_AUTOMATION_BYPASS_SECRET' ? 32 : 32
  const v = randomHex(bytes)
  setOrAppend(lines, k, v)
  updated += 1
  parsed[k] = v
}

if (!lines.at(-1)?.trim()) {
} else {
  lines.push('')
}

writeFileSync(abs, lines.join('\n').replace(/\n*$/, '\n'), 'utf8')

process.stdout.write(`[rotate-app-tokens] OK: updated ${updated} key(s) in ${envFile}\n`)
process.stdout.write(`[rotate-app-tokens] backup=${backup}\n`)
