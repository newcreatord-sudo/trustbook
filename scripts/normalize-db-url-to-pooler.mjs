import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
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

function supabaseRefFromUrl(v) {
  try {
    const u = new URL(v)
    const host = u.hostname.toLowerCase()
    const m = /^([a-z0-9-]+)\.supabase\.co$/.exec(host)
    return m?.[1] ?? null
  } catch {
    return null
  }
}

function normalizePoolerUrl({ ref, password, dbName, port, sslmode, poolerHost }) {
  const user = `postgres.${ref}`
  const u = new URL(`postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${poolerHost}:${port}/${dbName}`)
  if (sslmode) u.searchParams.set('sslmode', sslmode)
  return u.toString()
}

function pickPasswordFromExisting(urlStr) {
  if (!urlStr) return null
  try {
    const u = new URL(urlStr)
    const pwd = decodeURIComponent(u.password || '')
    return pwd.trim() ? pwd : null
  } catch {
    return null
  }
}

async function main() {
  const envFile = readArg('env-file') ?? '.env.staging.local'
  const poolerHost = readArg('pooler-host') ?? 'aws-0-eu-west-1.pooler.supabase.com'
  const sslmode = readArg('sslmode') ?? 'require'

  const abs = resolve(process.cwd(), envFile)
  if (!existsSync(abs)) {
    process.stderr.write(`[normalize-db-url-to-pooler] Missing ${envFile}\n`)
    process.exit(2)
  }

  const raw = readFileSync(abs, 'utf8')
  const parsed = dotenv.parse(raw)

  const supabaseUrl = String(parsed.SUPABASE_URL || parsed.VITE_SUPABASE_URL || '').trim()
  const ref = supabaseRefFromUrl(supabaseUrl)
  if (!ref) {
    process.stderr.write('[normalize-db-url-to-pooler] Missing/invalid SUPABASE_URL in env file\n')
    process.exit(2)
  }

  const existingDbUrl = String(parsed.DATABASE_URL || parsed.SUPABASE_DB_URL || '').trim()
  const password = pickPasswordFromExisting(existingDbUrl)
  if (!password) {
    process.stderr.write('[normalize-db-url-to-pooler] Missing DB password in DATABASE_URL/SUPABASE_DB_URL\n')
    process.exit(2)
  }

  const port = 5432
  const dbName = 'postgres'
  const newPooler = normalizePoolerUrl({ ref, password, dbName, port, sslmode, poolerHost })

  const backup = `${abs}.bak.${stamp()}`
  copyFileSync(abs, backup)

  const lines = raw.split(/\r?\n/)
  setOrAppend(lines, 'SUPABASE_DB_URL', newPooler)
  setOrAppend(lines, 'DATABASE_URL', '')

  if (!lines.at(-1)?.trim()) {
  } else {
    lines.push('')
  }

  writeFileSync(abs, lines.join('\n').replace(/\n*$/, '\n'), 'utf8')
  process.stdout.write(`[normalize-db-url-to-pooler] OK: wrote SUPABASE_DB_URL (pooler) and cleared DATABASE_URL in ${envFile}\n`)
  process.stdout.write(`[normalize-db-url-to-pooler] backup=${backup}\n`)
}

main().catch((e) => {
  process.stderr.write(`[normalize-db-url-to-pooler] ${String(e?.message || e)}\n`)
  process.exitCode = 1
})
