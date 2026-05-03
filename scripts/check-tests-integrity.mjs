import { readdir, readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const TEST_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx'])
const TEST_FILE_RE = /\.test\.(ts|tsx|js|jsx)$/i

const FORBIDDEN_PATTERNS = [
  { re: /\b(?:it|test|describe)\.only\s*\(/, reason: 'Found .only in test suite' },
  { re: /\b(?:it|test|describe)\.skip\s*\(/, reason: 'Found .skip in test suite' },
  { re: /\b(?:it|test)\.todo\s*\(/, reason: 'Found todo test in test suite' },
  { re: /expect\s*\(\s*true\s*\)\s*\.toBe\s*\(\s*true\s*\)/, reason: 'Found placeholder assertion expect(true).toBe(true)' },
  { re: /expect\s*\(\s*1\s*\)\s*\.toBe\s*\(\s*1\s*\)/, reason: 'Found placeholder assertion expect(1).toBe(1)' },
]

async function collectTestFiles(dir) {
  const out = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...(await collectTestFiles(full)))
      continue
    }
    if (!entry.isFile()) continue
    const ext = extname(entry.name)
    if (!TEST_EXTENSIONS.has(ext)) continue
    if (TEST_FILE_RE.test(entry.name)) out.push(full)
  }
  return out
}

async function main() {
  const files = await collectTestFiles(ROOT)
  const findings = []

  for (const file of files) {
    const content = await readFile(file, 'utf8')
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.re.test(content)) {
        findings.push({ file, reason: pattern.reason })
      }
    }
  }

  if (findings.length > 0) {
    process.stderr.write('[tests-integrity] FAILED: forbidden test patterns found.\n')
    for (const f of findings) {
      process.stderr.write(`- ${f.reason}: ${f.file}\n`)
    }
    process.exit(1)
  }

  process.stdout.write(`[tests-integrity] OK: scanned ${files.length} test files.\n`)
}

await main()
