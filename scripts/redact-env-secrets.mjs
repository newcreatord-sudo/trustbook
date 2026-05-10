import fs from 'node:fs'
import path from 'node:path'

function argValue(name) {
  const found = process.argv.find((x) => x.startsWith(`--${name}=`)) ?? null
  return found ? found.slice(name.length + 3).trim() : null
}

function fail(msg) {
  throw new Error(msg)
}

function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

function shouldRedactKey(key) {
  const k = key.trim()
  if (!k) return false
  if (k === 'DATABASE_URL') return true
  if (k === 'SUPABASE_DB_URL') return true
  if (k.endsWith('_SERVICE_ROLE_KEY')) return true
  if (k.endsWith('_ANON_KEY')) return true
  if (k.endsWith('_API_KEY')) return true
  if (k.endsWith('_PUBLISHABLE_KEY')) return true
  if (k.endsWith('_WEBHOOK_SECRET')) return true
  if (k.endsWith('_SECRET')) return true
  if (k.endsWith('_TOKEN')) return true
  if (k.endsWith('_PASSWORD')) return true
  return false
}

function redactLine(line, redactedKeys) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) return line
  const eq = line.indexOf('=')
  if (eq <= 0) return line
  const key = line.slice(0, eq).trim()
  if (!shouldRedactKey(key)) return line
  redactedKeys.add(key)
  return `${key}=\n`
}

async function main() {
  const envFile = argValue('env-file')
  if (!envFile) fail('Missing --env-file=PATH')

  const abs = path.isAbsolute(envFile) ? envFile : path.resolve(process.cwd(), envFile)
  if (!fs.existsSync(abs)) fail(`File not found: ${envFile}`)

  const backupPath = `${abs}.bak.${stamp()}`
  fs.copyFileSync(abs, backupPath)

  const raw = fs.readFileSync(abs, 'utf8')
  const lines = raw.split(/\r?\n/)
  const redactedKeys = new Set()

  const out = lines.map((l) => redactLine(l, redactedKeys)).join('\n')
  fs.writeFileSync(abs, out, 'utf8')

  const keys = Array.from(redactedKeys).sort()
  process.stdout.write(`[redact-env-secrets] OK: ${path.basename(abs)} redactedKeys=${keys.length}\n`)
  process.stdout.write(`[redact-env-secrets] backup=${path.basename(backupPath)}\n`)
  if (keys.length) process.stdout.write(`[redact-env-secrets] ${keys.join(',')}\n`)
}

main().catch((e) => {
  process.stderr.write(`[redact-env-secrets] ${String(e?.message || e)}\n`)
  process.exitCode = 1
})
