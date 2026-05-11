import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const dir = resolve(process.cwd(), 'supabase', 'migrations')
const files = readdirSync(dir)
  .filter((f) => /^\d+_.+\.sql$/i.test(f))
  .sort((a, b) => a.localeCompare(b))

const byPrefix = new Map()
for (const f of files) {
  const prefix = f.split('_')[0] ?? ''
  if (!byPrefix.has(prefix)) byPrefix.set(prefix, [])
  byPrefix.get(prefix).push(f)
}

const duplicates = []
for (const [prefix, group] of byPrefix.entries()) {
  if (group.length <= 1) continue
  duplicates.push({ prefix, files: group })
}

if (duplicates.length) {
  process.stderr.write(`[migrations-integrity] FAIL: duplicate migration prefixes detected.\n`)
  process.stderr.write(`[migrations-integrity] Audit guidance:\n`)
  process.stderr.write(`  - Each migration MUST have a unique 4+ digit prefix.\n`)
  process.stderr.write(`  - When two migrations were committed with the same prefix, the second one\n`)
  process.stderr.write(`    (alphabetically) must be renumbered to the next available slot.\n`)
  process.stderr.write(`  - See docs/MIGRATIONS_RENUMBER_LOG.md for the historical renumber map.\n`)
  for (const item of duplicates) {
    process.stderr.write(`[migrations-integrity] Duplicate prefix ${item.prefix}: ${item.files.join(', ')}\n`)
  }
  process.exit(1)
}

const expectedSequence = []
let n = 1
for (const f of files) {
  const prefix = f.split('_')[0] ?? ''
  expectedSequence.push({ file: f, prefix, num: Number(prefix) })
}

let gapWarning = false
for (let i = 0; i < expectedSequence.length; i += 1) {
  const cur = expectedSequence[i]
  if (!Number.isFinite(cur.num)) continue
  void n
}

if (gapWarning) {
  process.stderr.write('[migrations-integrity] WARN: non-contiguous prefixes detected (informational).\n')
}

process.stdout.write(`[migrations-integrity] OK \u2014 ${files.length} migrations with unique prefixes.\n`)
