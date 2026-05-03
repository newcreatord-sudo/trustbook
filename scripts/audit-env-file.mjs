import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'

function readArg(name) {
  const raw = process.argv.find((x) => x.startsWith(`--${name}=`)) ?? null
  if (!raw) return null
  const v = raw.slice(`--${name}=`.length).trim()
  return v.length ? v : null
}

const envFile = readArg('env-file') ?? '.env.production'
const templateFile = readArg('template-file') ?? `${envFile}.example`

const envPath = resolve(process.cwd(), envFile)
const templatePath = resolve(process.cwd(), templateFile)

if (!existsSync(envPath)) {
  process.stderr.write(`[audit-env] Missing env file: ${envFile}\n`)
  process.exit(2)
}
if (!existsSync(templatePath)) {
  process.stderr.write(`[audit-env] Missing template file: ${templateFile}\n`)
  process.exit(2)
}

const envParsed = dotenv.parse(readFileSync(envPath, 'utf8'))
const tplParsed = dotenv.parse(readFileSync(templatePath, 'utf8'))

const looksPlaceholder = (v) => {
  const t = String(v ?? '').trim()
  if (!t) return true
  if (t === '""' || t === "''") return true
  if (t.includes('[YOUR-') || t.includes('<YOUR') || t.includes('YOUR_')) return true
  return false
}

const missing = []
const emptyOrPlaceholder = []
for (const k of Object.keys(tplParsed)) {
  if (!(k in envParsed)) missing.push(k)
  else if (looksPlaceholder(envParsed[k])) emptyOrPlaceholder.push(k)
}

process.stdout.write(
  JSON.stringify(
    {
      envFile,
      templateFile,
      templateKeys: Object.keys(tplParsed).length,
      missing,
      emptyOrPlaceholder,
    },
    null,
    2,
  ) + '\n',
)

