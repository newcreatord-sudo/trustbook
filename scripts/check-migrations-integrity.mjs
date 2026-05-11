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

const legacyAllowed = new Set(['0030', '0045', '0092', '0093', '0094', '0120', '0121', '0123'])

const unexpected = []
for (const [prefix, group] of byPrefix.entries()) {
  if (group.length <= 1) continue
  if (!legacyAllowed.has(prefix)) unexpected.push({ prefix, files: group })
}

if (unexpected.length) {
  for (const item of unexpected) {
    process.stderr.write(`[migrations-integrity] Duplicate prefix ${item.prefix}: ${item.files.join(', ')}\n`)
  }
  process.exit(1)
}

process.stdout.write('[migrations-integrity] OK\n')
