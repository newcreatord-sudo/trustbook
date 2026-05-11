#!/usr/bin/env node
/**
 * Security audit: enumerate every place in api/* that instantiates a Supabase
 * client with the service_role key. Service role bypasses RLS, so each
 * occurrence must be justified by an auditor.
 *
 * Exit code 0 always (informational); CI may wrap this with a snapshot
 * comparison to detect new occurrences.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const ROOT = resolve(process.cwd(), 'api')

const SERVICE_ROLE_TOKENS = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_KEY',
  'service_role',
  'mustSupabaseAdmin',
  'createServiceRoleClient',
  'sbAdmin',
]

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    const s = statSync(full)
    if (s.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|js|mjs|cjs)$/i.test(entry) && !/\.test\.(ts|js)$/i.test(entry)) out.push(full)
  }
  return out
}

const files = walk(ROOT)
const hits = []

for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  lines.forEach((line, idx) => {
    for (const tok of SERVICE_ROLE_TOKENS) {
      if (line.includes(tok)) {
        hits.push({ file: relative(process.cwd(), file), line: idx + 1, token: tok, snippet: line.trim().slice(0, 200) })
      }
    }
  })
}

process.stdout.write(`# Service role usage audit\n\n`)
process.stdout.write(`Found ${hits.length} occurrence(s) across ${files.length} backend files.\n\n`)
const byFile = new Map()
for (const h of hits) {
  if (!byFile.has(h.file)) byFile.set(h.file, [])
  byFile.get(h.file).push(h)
}

for (const [file, list] of byFile.entries()) {
  process.stdout.write(`## ${file} (${list.length})\n`)
  for (const h of list) {
    process.stdout.write(`- L${h.line} [${h.token}] ${h.snippet}\n`)
  }
  process.stdout.write('\n')
}

process.stdout.write(`Each occurrence should be reviewed for: (1) input validation, (2) authn upstream,\n(3) least privilege scope, (4) idempotency, (5) audit logging.\n`)
