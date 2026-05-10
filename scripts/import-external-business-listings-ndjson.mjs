import { createReadStream, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import readline from 'node:readline'
import dotenv from 'dotenv'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function readArg(name) {
  const raw = process.argv.find((x) => x.startsWith(`--${name}=`)) ?? null
  if (!raw) return null
  const v = raw.slice(`--${name}=`.length).trim()
  return v.length ? v : null
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function fail(msg) {
  process.stderr.write(`[import-external-listings-ndjson] ${msg}\n`)
  process.exit(2)
}

const envFile = readArg('env-file') ?? '.env.staging'
const inputFile = readArg('input')
const source = readArg('source') ?? 'manual'
const dryRun = hasFlag('dry-run')
const batchSize = Math.max(50, Math.min(1000, Number(readArg('batch') ?? 500)))

if (!inputFile) fail('Missing --input=/path/to/file.ndjson')

const envPath = resolve(process.cwd(), envFile)
if (!existsSync(envPath)) fail(`Missing env file: ${envFile}`)
const parsedEnv = dotenv.parse(readFileSync(envPath, 'utf8'))
for (const [k, v] of Object.entries(parsedEnv)) process.env[k] = v

const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
const supabaseServiceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!supabaseUrl) fail('Missing SUPABASE_URL (or VITE_SUPABASE_URL)')
if (!supabaseServiceRole) fail('Missing SUPABASE_SERVICE_ROLE_KEY')

const inputPath = resolve(process.cwd(), inputFile)
if (!existsSync(inputPath)) fail(`Missing input file: ${inputFile}`)

process.stdout.write(
  JSON.stringify(
    {
      envFile,
      inputFile,
      source,
      dryRun,
      batchSize,
    },
    null,
    2,
  ) + '\n',
)

if (dryRun) process.exit(0)

const sb = createClient(supabaseUrl, supabaseServiceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const rl = readline.createInterface({
  input: createReadStream(inputPath, { encoding: 'utf8' }),
  crlfDelay: Infinity,
})

const nowIso = new Date().toISOString()
let batch = []
let read = 0
let ok = 0

async function flush() {
  if (batch.length === 0) return
  const payload = batch.map((r) => ({
    ...r,
    source: String(r.source ?? source).trim() || source,
    updated_at: nowIso,
  }))
  const { error } = await sb.from('external_business_listings').upsert(payload, { onConflict: 'source,source_ref' })
  if (error) fail(error.message)
  ok += payload.length
  batch = []
  process.stdout.write(`[import-external-listings-ndjson] upserted ${ok}\n`)
}

for await (const line of rl) {
  const t = String(line ?? '').trim()
  if (!t) continue
  read += 1
  let obj
  try {
    obj = JSON.parse(t)
  } catch {
    continue
  }
  if (typeof obj !== 'object' || obj === null) continue
  if (!obj.name || !obj.source_ref) continue
  batch.push(obj)
  if (batch.length >= batchSize) await flush()
}

await flush()
process.stdout.write(
  JSON.stringify(
    {
      linesRead: read,
      rowsUpserted: ok,
    },
    null,
    2,
  ) + '\n',
)

