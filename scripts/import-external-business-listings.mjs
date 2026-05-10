import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
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
  process.stderr.write(`[import-external-listings] ${msg}\n`)
  process.exit(2)
}

const envFile = readArg('env-file') ?? '.env.staging'
const inputFile = readArg('input')
const source = readArg('source') ?? 'manual'
const dryRun = hasFlag('dry-run')

if (!inputFile) fail('Missing --input=/path/to/file.json')

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
const raw = readFileSync(inputPath, 'utf8')

let rows
try {
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) fail('Input must be a JSON array')
  rows = parsed
} catch {
  fail('Invalid JSON input')
}

const nowIso = new Date().toISOString()
const normalized = rows
  .map((r) => (typeof r === 'object' && r !== null ? r : null))
  .filter(Boolean)
  .map((r) => {
    const rec = r
    const name = String(rec.name ?? '').trim()
    const city = String(rec.city ?? '').trim()
    const lat = rec.lat === null || rec.lat === undefined ? null : Number(rec.lat)
    const lng = rec.lng === null || rec.lng === undefined ? null : Number(rec.lng)
    if (!name) return null
    const sourceRefRaw = String(rec.source_ref ?? '').trim()
    const sourceRef = sourceRefRaw || `${name}|${city}|${lat ?? ''}|${lng ?? ''}`.toLowerCase()
    return {
      name,
      category: String(rec.category ?? 'altro').trim().toLowerCase() || 'altro',
      description: rec.description ? String(rec.description).trim() : null,
      address_text: rec.address_text ? String(rec.address_text).trim() : null,
      postal_code: rec.postal_code ? String(rec.postal_code).trim() : null,
      city: city || null,
      province: rec.province ? String(rec.province).trim() : null,
      region: rec.region ? String(rec.region).trim() : null,
      country_code: String(rec.country_code ?? 'IT').trim() || 'IT',
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      phone: rec.phone ? String(rec.phone).trim() : null,
      email: rec.email ? String(rec.email).trim() : null,
      website: rec.website ? String(rec.website).trim() : null,
      listing_status: String(rec.listing_status ?? 'unverified').trim() || 'unverified',
      source,
      source_ref: sourceRef,
      source_url: rec.source_url ? String(rec.source_url).trim() : null,
      source_license: rec.source_license ? String(rec.source_license).trim() : null,
      source_attribution: rec.source_attribution ? String(rec.source_attribution).trim() : null,
      data_checked_at: rec.data_checked_at ? String(rec.data_checked_at).trim() : null,
      imported_at: rec.imported_at ? String(rec.imported_at).trim() : nowIso,
      updated_at: nowIso,
    }
  })
  .filter(Boolean)

if (normalized.length === 0) fail('No valid rows found')

process.stdout.write(
  JSON.stringify(
    {
      envFile,
      inputFile,
      source,
      dryRun,
      rowsIn: rows.length,
      rowsValid: normalized.length,
    },
    null,
    2,
  ) + '\n',
)

if (dryRun) process.exit(0)

const sb = createClient(supabaseUrl, supabaseServiceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const batchSize = 500
let ok = 0
for (let i = 0; i < normalized.length; i += batchSize) {
  const batch = normalized.slice(i, i + batchSize)
  const { error } = await sb
    .from('external_business_listings')
    .upsert(batch, { onConflict: 'source,source_ref' })
  if (error) fail(error.message)
  ok += batch.length
  process.stdout.write(`[import-external-listings] upserted ${ok}/${normalized.length}\n`)
}

process.stdout.write(`[import-external-listings] done\n`)

