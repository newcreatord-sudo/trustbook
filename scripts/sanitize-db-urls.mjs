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

function sanitizePgUrl(urlStr, { forceSslmodeRequire }) {
  const u = new URL(urlStr)
  const pwd = decodeURIComponent(u.password || '')
  let nextPwd = pwd
  if (pwd.startsWith('[') && pwd.endsWith(']') && pwd.length > 2) {
    nextPwd = pwd.slice(1, -1)
  }
  if (forceSslmodeRequire) {
    const sslmode = (u.searchParams.get('sslmode') || '').trim().toLowerCase()
    if (!sslmode) u.searchParams.set('sslmode', 'require')
  }
  if (nextPwd !== pwd) {
    u.password = nextPwd
  }
  return u.toString()
}

async function main() {
  const envFile = readArg('env-file') ?? '.env.staging.local'
  const abs = resolve(process.cwd(), envFile)
  if (!existsSync(abs)) {
    process.stderr.write(`[sanitize-db-urls] Missing ${envFile}\n`)
    process.exit(2)
  }

  const raw = readFileSync(abs, 'utf8')
  const parsed = dotenv.parse(raw)
  const keys = (readArg('keys') ?? 'DATABASE_URL,SUPABASE_DB_URL')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)

  const backup = `${abs}.bak.${stamp()}`
  copyFileSync(abs, backup)

  const lines = raw.split(/\r?\n/)
  let changed = 0
  for (const k of keys) {
    const v = String(parsed[k] ?? '').trim()
    if (!v) continue
    let next = null
    try {
      next = sanitizePgUrl(v, { forceSslmodeRequire: true })
    } catch {
      continue
    }
    if (next && next !== v) {
      setOrAppend(lines, k, next)
      changed += 1
    }
  }

  if (!lines.at(-1)?.trim()) {
  } else {
    lines.push('')
  }

  writeFileSync(abs, lines.join('\n').replace(/\n*$/, '\n'), 'utf8')
  process.stdout.write(`[sanitize-db-urls] OK: changed ${changed} url(s) in ${envFile}\n`)
  process.stdout.write(`[sanitize-db-urls] backup=${backup}\n`)
}

main().catch((e) => {
  process.stderr.write(`[sanitize-db-urls] ${String(e?.message || e)}\n`)
  process.exitCode = 1
})

