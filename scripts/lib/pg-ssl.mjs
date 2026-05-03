import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

function readTrimmed(name) {
  const v = process.env[name]
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.length ? t : null
}

export function pgSslFromEnv(label = 'db') {
  if (readTrimmed('DB_SSL_DISABLE') === '1') return undefined

  const rejectUnauthorized = readTrimmed('DB_SSL_REJECT_UNAUTHORIZED') !== '0'

  let ca = null
  const caB64 = readTrimmed('DB_SSL_CA_B64')
  const caPem = readTrimmed('DB_SSL_CA_PEM')
  const caFile = readTrimmed('DB_SSL_CA_FILE')

  if (caB64) ca = Buffer.from(caB64, 'base64').toString('utf8')
  else if (caPem) ca = caPem
  else if (caFile) ca = readFileSync(resolve(process.cwd(), caFile), 'utf8')

  if (!rejectUnauthorized) {
    process.stderr.write(
      `[${label}] WARNING: DB_SSL_REJECT_UNAUTHORIZED=0 disables certificate verification (MITM risk). Prefer DB_SSL_REJECT_UNAUTHORIZED=1 with DB_SSL_CA_* configured.\n`,
    )
  }

  return ca ? { rejectUnauthorized, ca } : { rejectUnauthorized }
}
