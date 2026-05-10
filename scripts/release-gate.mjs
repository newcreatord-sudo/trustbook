import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import dotenv from 'dotenv'

const envFileArg = process.argv.find((x) => x.startsWith('--env-file=')) ?? null
if (envFileArg) {
  const envFile = envFileArg.slice('--env-file='.length).trim()
  if (envFile) dotenv.config({ path: resolve(process.cwd(), envFile), override: true })
  if (envFile) {
    const local = `${envFile}.local`
    if (existsSync(resolve(process.cwd(), local))) {
      dotenv.config({ path: resolve(process.cwd(), local), override: true })
    }
  }
}

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const hasDbConnection = Boolean(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL)
const requireDbAssertions = process.env.REQUIRE_DB_ASSERTIONS === '1' || process.argv.includes('--strict-db')
const paymentsEnabled = process.env.PAYMENTS_ENABLED === '1'

if (requireDbAssertions && !hasDbConnection) {
  process.stderr.write(
    '[release-gate] FAILED: REQUIRE_DB_ASSERTIONS=1 but DATABASE_URL/SUPABASE_DB_URL is missing.\n',
  )
  process.exit(2)
}

const steps = [
  { label: 'TypeScript check', cmd: 'npm run check' },
  { label: 'Lint', cmd: 'npm run lint' },
  { label: 'Tests integrity guard', cmd: 'npm run check:tests:integrity' },
  { label: 'Business dashboard bootstrap budget', cmd: 'npm run check:business-dashboard:bootstrap' },
  { label: 'Business dashboard runtime perf test', cmd: 'npm run test:business-dashboard:perf' },
  { label: 'Onboarding policy guard test', cmd: 'npm run test:onboarding-policy-guard' },
  {
    label: paymentsEnabled ? 'Product QA critical flows (payments)' : 'Product QA critical flows (core)',
    cmd: paymentsEnabled ? 'npm run test:qa:flows' : 'npm run test:qa:flows:core',
  },
  {
    label: paymentsEnabled ? 'Critical API tests (payments)' : 'Critical API tests (core)',
    cmd: paymentsEnabled ? 'npm run test:api-critical' : 'npm run test:api-critical:core',
  },
  { label: 'Critical owner onboarding tests', cmd: 'npm run test:critical-owner-onboarding' },
  {
    label: paymentsEnabled ? 'Full test suite (payments)' : 'Full test suite (core)',
    cmd: paymentsEnabled ? 'npm test' : 'npm run test -- --exclude api/routes/stripe.test.ts',
  },
  { label: 'Production build', cmd: 'npm run build' },
  { label: 'Google Maps bundle budget', cmd: 'npm run check:bundle:google-maps' },
]

if (hasDbConnection) {
  steps.push({ label: 'Owner-strict DB assertions', cmd: 'npm run db:verify-owner-strict' })
  steps.push({ label: 'Booking-flow DB assertions', cmd: 'npm run db:verify-booking-flow' })
  steps.push({ label: 'Booking-integrity DB assertions', cmd: 'npm run db:verify-booking-integrity' })
  steps.push({ label: 'RLS impersonation DB assertions', cmd: 'npm run db:verify-rls-impersonation' })
}

const startedAt = Date.now()

for (const step of steps) {
  const stepStart = Date.now()
  process.stdout.write(`\n[release-gate] ${step.label}...\n`)
  const result = spawnSync(step.cmd, {
    stdio: 'inherit',
    shell: true,
  })

  if (result.status !== 0) {
    const ms = Date.now() - stepStart
    process.stderr.write(
      `\n[release-gate] FAILED at "${step.label}" after ${(ms / 1000).toFixed(2)}s.\n`,
    )
    process.exit(result.status ?? 1)
  }

  const ms = Date.now() - stepStart
  process.stdout.write(`[release-gate] OK: ${step.label} (${(ms / 1000).toFixed(2)}s)\n`)
}

const totalMs = Date.now() - startedAt
process.stdout.write(`\n[release-gate] ALL GREEN in ${(totalMs / 1000).toFixed(2)}s.\n`)
