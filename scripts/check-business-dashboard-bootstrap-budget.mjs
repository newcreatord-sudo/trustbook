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

const bookingsBootstrapAnchor = source.indexOf('const bookingPageRequests = Array.from')
if (bookingsBootstrapAnchor < 0) {
  fail('Cannot find bookings parallel-page bootstrap (bookingPageRequests).')
}

const effectEnd = source.indexOf('\n  }, [activeBusinessId])', bookingsBootstrapAnchor)
if (effectEnd < 0) fail('Cannot find activeBusinessId bookings bootstrap effect end.')

const bootstrapEffect = source.slice(bookingsBootstrapAnchor, effectEnd)
const promiseAllMatches = bootstrapEffect.match(/Promise\.all\s*\(\s*\[/g) ?? []

/** Sequential `await supabase.*` except KPI timezone fallback (`rpc`). */
const sequentialSupabaseMethods = [
  ...bootstrapEffect.matchAll(/await\s+supabase\s*\.\s*(\w+)/g),
].map((m) => m[1])
const sequentialForbidden = sequentialSupabaseMethods.filter((m) => m !== 'rpc')

const totalFromCalls = bootstrapEffect.match(/\.from\('/g) ?? []

const stage1Markers = [
  'const [bookingsPagesRes, servicesRes, windowsRes, closuresRes, reviewsRes, kpisRes] = await Promise.all([',
  'const [bookingsRes, servicesRes, windowsRes, closuresRes, reviewsRes] = await Promise.all([',
]
let stage1Start = -1
for (const marker of stage1Markers) {
  stage1Start = bootstrapEffect.indexOf(marker)
  if (stage1Start >= 0) break
}
if (stage1Start < 0) fail('Cannot find stage-1 parallel bookings bootstrap.')
const stage1End = bootstrapEffect.indexOf('])', stage1Start)
if (stage1End < 0) fail('Cannot detect end of stage-1 Promise.all.')
/** Include parallel booking pages (`bookingPageRequests`) defined above the Promise.all line. */
const stage1CombinedBlock = bootstrapEffect.slice(0, stage1End + 2)
const stage1FromCalls = stage1CombinedBlock.match(/\.from\('/g) ?? []

const stage2Start = bootstrapEffect.indexOf('const [relRes, profilesRes, tagsRes, notesRes] = await Promise.all([')
if (stage2Start < 0) fail('Cannot find stage-2 parallel customer enrichment bootstrap.')
const stage2End = bootstrapEffect.indexOf('])', stage2Start)
if (stage2End < 0) fail('Cannot detect end of stage-2 Promise.all.')
const notesPromiseStart = bootstrapEffect.indexOf('const notesPromise = bookingIds.length')
if (notesPromiseStart < 0 || notesPromiseStart > stage2Start) {
  fail('Cannot find notesPromise prelude for stage-2 query budget.')
}
const stage2CombinedBlock = bootstrapEffect.slice(notesPromiseStart, stage2End + 2)
const stage2FromCalls = stage2CombinedBlock.match(/\.from\('/g) ?? []

const maxPromiseAllStages = parsePositiveIntEnv('BUSINESS_DASHBOARD_BOOTSTRAP_MAX_STAGES', 2)
const maxStage1Queries = parsePositiveIntEnv('BUSINESS_DASHBOARD_BOOTSTRAP_STAGE1_MAX_QUERIES', 8)
const maxStage2Queries = parsePositiveIntEnv('BUSINESS_DASHBOARD_BOOTSTRAP_STAGE2_MAX_QUERIES', 4)
const maxTotalQueries = parsePositiveIntEnv('BUSINESS_DASHBOARD_BOOTSTRAP_TOTAL_MAX_QUERIES', 12)
const perStageLatencyBudgetMs = parsePositiveIntEnv('BUSINESS_DASHBOARD_BOOTSTRAP_STAGE_BUDGET_MS', 450)
const maxEstimatedLatencyMs = parsePositiveIntEnv(
  'BUSINESS_DASHBOARD_BOOTSTRAP_MAX_ESTIMATED_LATENCY_MS',
  maxPromiseAllStages * perStageLatencyBudgetMs,
)

const estimatedLatencyMs = promiseAllMatches.length * perStageLatencyBudgetMs

if (promiseAllMatches.length < 2) {
  fail(`Expected at least 2 Promise.all stages, found ${promiseAllMatches.length}.`)
}
if (promiseAllMatches.length > maxPromiseAllStages) {
  fail(
    `Promise.all stage count regression (${promiseAllMatches.length} > ${maxPromiseAllStages}). Keep bootstrap depth shallow.`,
  )
}
if (sequentialForbidden.length > 0) {
  fail(
    `Found sequential awaited Supabase calls (${sequentialForbidden.join(', ')}). Use staged Promise.all batches except KPI rpc fallback.`,
  )
}
if (stage1FromCalls.length > maxStage1Queries) {
  fail(`Stage-1 query budget exceeded (${stage1FromCalls.length} > ${maxStage1Queries}).`)
}
if (stage2FromCalls.length > maxStage2Queries) {
  fail(`Stage-2 query budget exceeded (${stage2FromCalls.length} > ${maxStage2Queries}).`)
}
if (totalFromCalls.length > maxTotalQueries) {
  fail(`Total query budget exceeded (${totalFromCalls.length} > ${maxTotalQueries}).`)
}
if (estimatedLatencyMs > maxEstimatedLatencyMs) {
  fail(
    `Estimated bootstrap latency exceeded (${estimatedLatencyMs}ms > ${maxEstimatedLatencyMs}ms). Reduce stage depth or tighten stage budget.`,
  )
}

process.stdout.write(
  `[business-dashboard-budget] OK: stages=${promiseAllMatches.length}, stage1Queries=${stage1FromCalls.length}, stage2Queries=${stage2FromCalls.length}, totalQueries=${totalFromCalls.length}, estimatedLatencyMs=${estimatedLatencyMs}\n`,
)
