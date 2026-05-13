import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const sourcePath = resolve(process.cwd(), 'src/pages/BusinessDashboard.tsx')

function fail(message) {
  process.stderr.write(`[business-dashboard-budget] FAILED: ${message}\n`)
  process.exit(1)
}

function parsePositiveIntEnv(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    fail(`Invalid ${name}="${raw}". Use a positive integer.`)
  }
  return parsed
}

let source = ''
try {
  source = readFileSync(sourcePath, 'utf8')
} catch {
  fail('Cannot read src/pages/BusinessDashboard.tsx.')
}

const rpcAnchor = source.indexOf("supabase.rpc('business_dashboard_bootstrap_v1'")
if (rpcAnchor < 0) {
  fail("Cannot find supabase.rpc('business_dashboard_bootstrap_v1') call in BusinessDashboard.")
}

const effectStart = source.lastIndexOf('useEffect(() => {', rpcAnchor)
if (effectStart < 0) fail('Cannot find bookings bootstrap useEffect start.')

const effectEnd = source.indexOf('\n  }, [activeBusinessId])', effectStart)
if (effectEnd < 0) fail('Cannot find activeBusinessId bookings bootstrap effect end.')

const bootstrapEffect = source.slice(effectStart, effectEnd)
if (!bootstrapEffect.includes("supabase.rpc('business_dashboard_bootstrap_v1'")) {
  fail("Cannot confirm business_dashboard_bootstrap_v1 usage inside the expected bootstrap effect.")
}

const maxFromCalls = parsePositiveIntEnv('BUSINESS_DASHBOARD_BOOTSTRAP_MAX_FROM_CALLS', 0)
const maxAwaitedSupabaseCalls = parsePositiveIntEnv('BUSINESS_DASHBOARD_BOOTSTRAP_MAX_AWAITED_SUPABASE_CALLS', 1)

const fromCalls = bootstrapEffect.match(/\.from\('/g) ?? []
const awaitedSupabaseCalls = [...bootstrapEffect.matchAll(/await\s+supabase\s*\./g)]

if (fromCalls.length > maxFromCalls) {
  fail(
    `Found ${fromCalls.length} supabase.from() calls inside bootstrap effect (max ${maxFromCalls}). Keep bootstrap consolidated in the RPC.`,
  )
}
if (awaitedSupabaseCalls.length > maxAwaitedSupabaseCalls) {
  fail(
    `Found ${awaitedSupabaseCalls.length} awaited Supabase calls inside bootstrap effect (max ${maxAwaitedSupabaseCalls}). Keep a single RPC to avoid fan-out.`,
  )
}

process.stdout.write(
  `[business-dashboard-budget] OK: awaitedSupabaseCalls=${awaitedSupabaseCalls.length}, fromCalls=${fromCalls.length}\n`,
)
