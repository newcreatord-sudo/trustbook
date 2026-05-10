import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'

function readArg(name) {
  const raw = process.argv.find((x) => x.startsWith(`--${name}=`)) ?? null
  if (!raw) return null
  const v = raw.slice(`--${name}=`.length).trim()
  return v.length ? v : null
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

function normalizeValue(v) {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  if (t.includes('[YOUR-PASSWORD]')) return null
  if (t.includes('YOUR_') || t.includes('your_') || t.includes('project-ref')) return null
  return t
}

async function main() {
  const envFile = readArg('env-file') ?? '.env.staging'
  const absBase = resolve(process.cwd(), envFile)
  const absLocal = resolve(process.cwd(), `${envFile}.local`)

  if (!existsSync(absBase)) {
    process.stderr.write(`[merge-env-local-into-base] Missing ${envFile}\n`)
    process.exit(2)
  }
  if (!existsSync(absLocal)) {
    process.stderr.write(`[merge-env-local-into-base] Missing ${envFile}.local\n`)
    process.exit(2)
  }

  const baseRaw = readFileSync(absBase, 'utf8')
  const localRaw = readFileSync(absLocal, 'utf8')
  const baseParsed = dotenv.parse(baseRaw)
  const localParsed = dotenv.parse(localRaw)

  const keys = readArg('keys')
    ?.split(',')
    .map((x) => x.trim())
    .filter(Boolean) ?? null

  const defaultKeys = [
    'SUPABASE_SERVICE_ROLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'VITE_GOOGLE_MAPS_API_KEY',
    'VITE_STRIPE_PUBLISHABLE_KEY',
    'DATABASE_URL',
    'SUPABASE_DB_URL',
  ]

  const selected = keys ?? defaultKeys

  const lines = baseRaw.split(/\r?\n/)
  let merged = 0

  for (const k of selected) {
    const v = normalizeValue(localParsed[k])
    if (v === null) continue
    const baseV = normalizeValue(baseParsed[k])
    if (baseV === v) continue
    setOrAppend(lines, k, v)
    merged += 1
  }

  if (!lines.at(-1)?.trim()) {
  } else {
    lines.push('')
  }

  writeFileSync(absBase, lines.join('\n').replace(/\n*$/, '\n'), 'utf8')
  process.stdout.write(`[merge-env-local-into-base] OK: merged ${merged} key(s) into ${envFile}\n`)
}

main().catch((e) => {
  process.stderr.write(`[merge-env-local-into-base] ${String(e?.message || e)}\n`)
  process.exitCode = 1
})
