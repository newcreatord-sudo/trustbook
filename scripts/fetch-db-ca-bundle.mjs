import process from 'node:process'
import { resolve } from 'node:path'
import { writeFileSync } from 'node:fs'
import dotenv from 'dotenv'
import { Client } from 'pg'

const envFileArg = process.argv.find((x) => x.startsWith('--env-file=')) ?? null
if (envFileArg) {
  const envFile = envFileArg.slice('--env-file='.length).trim()
  if (envFile) dotenv.config({ path: resolve(process.cwd(), envFile), override: true })
}

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

function readArg(name) {
  const raw = process.argv.find((x) => x.startsWith(`--${name}=`)) ?? null
  if (!raw) return null
  const v = raw.slice(`--${name}=`.length).trim()
  return v.length ? v : null
}

function toPem(der) {
  const b64 = Buffer.from(der).toString('base64')
  const lines = b64.match(/.{1,64}/g) ?? []
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----\n`
}

const connectionString =
  (typeof process.env.DATABASE_URL === 'string' && process.env.DATABASE_URL.trim() ? process.env.DATABASE_URL.trim() : null) ??
  (typeof process.env.SUPABASE_DB_URL === 'string' && process.env.SUPABASE_DB_URL.trim() ? process.env.SUPABASE_DB_URL.trim() : null)

if (!connectionString) {
  process.stderr.write('[fetch-db-ca-bundle] Missing SUPABASE_DB_URL/DATABASE_URL.\n')
  process.exit(2)
}

const outPath = resolve(process.cwd(), readArg('out') ?? 'artifacts/db-ca-bundle.pem')
const parsed = new URL(connectionString)
parsed.searchParams.delete('sslmode')
parsed.searchParams.delete('uselibpqcompat')
const db = new Client({
  connectionString: parsed.toString(),
  ssl: process.env.DB_SSL_DISABLE === '1' ? undefined : { rejectUnauthorized: false },
})

const certs = []
await db.connect()
try {
  const stream = db.connection?.stream
  if (!stream || typeof stream.getPeerCertificate !== 'function') {
    process.stderr.write('[fetch-db-ca-bundle] TLS stream not available.\n')
    process.exit(1)
  }
  let c = stream.getPeerCertificate(true)
  const seen = new Set()
  while (c && typeof c === 'object' && c.raw && !seen.has(c.fingerprint256 || c.fingerprint || String(c.serialNumber || ''))) {
    const key = c.fingerprint256 || c.fingerprint || String(c.serialNumber || '')
    seen.add(key)
    certs.push(c)
    if (!c.issuerCertificate || c.issuerCertificate === c) break
    c = c.issuerCertificate
  }
} finally {
  await db.end().catch(() => {})
}

if (certs.length === 0) {
  process.stderr.write('[fetch-db-ca-bundle] No certificates received.\n')
  process.exit(1)
}

const pemBundle = certs.map((c) => toPem(c.raw)).join('\n')
writeFileSync(outPath, pemBundle, 'utf8')
process.stdout.write(`[fetch-db-ca-bundle] Wrote ${certs.length} certificate(s) to ${outPath}\n`)
