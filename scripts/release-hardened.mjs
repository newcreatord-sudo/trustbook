import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import dotenv from 'dotenv'

const envFileArg = process.argv.find((x) => x.startsWith('--env-file=')) ?? null
if (envFileArg) {
  const envFile = envFileArg.slice('--env-file='.length).trim()
  if (envFile) dotenv.config({ path: resolve(process.cwd(), envFile), override: true })
}

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const hasDb = Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL)
if (!hasDb) {
  process.stderr.write(
    '[release-hardened] FAILED: DATABASE_URL/SUPABASE_DB_URL missing. Configure DB connection first.\n',
  )
  process.exit(2)
}

const steps = [
  { label: 'Apply critical DB migrations', cmd: 'npm run db:apply-critical' },
  { label: 'Strict release gate', cmd: 'npm run gate:release:strict' },
]

const startedAt = Date.now()

for (const step of steps) {
  const stepStart = Date.now()
  process.stdout.write(`\n[release-hardened] ${step.label}...\n`)
  const result = spawnSync(step.cmd, {
    stdio: 'inherit',
    shell: true,
  })
  if (result.status !== 0) {
    const elapsed = ((Date.now() - stepStart) / 1000).toFixed(2)
    process.stderr.write(`[release-hardened] FAILED at "${step.label}" after ${elapsed}s.\n`)
    process.exit(result.status ?? 1)
  }
  const elapsed = ((Date.now() - stepStart) / 1000).toFixed(2)
  process.stdout.write(`[release-hardened] OK: ${step.label} (${elapsed}s)\n`)
}

const total = ((Date.now() - startedAt) / 1000).toFixed(2)
process.stdout.write(`\n[release-hardened] ALL GREEN in ${total}s.\n`)
