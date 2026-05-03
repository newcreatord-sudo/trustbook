/**
 * Budget guard on post-build dist/assets/*.js (aggregate + largest chunk).
 * Env vars keep the legacy GOOGLE_MAPS_* prefix; caps apply to the whole SPA bundle split,
 * while limiting any single chunk from growing past a sane shipping size.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

const assetsDir = resolve(process.cwd(), 'dist', 'assets')
const files = readdirSync(assetsDir)
const jsFiles = files.filter((f) => f.endsWith('.js'))

if (jsFiles.length === 0) {
  process.stderr.write('[google-maps-bundle-budget] FAILED: no JS assets found in dist/assets.\n')
  process.exit(1)
}

const maxBytes = Number(process.env.GOOGLE_MAPS_BUNDLE_MAX_BYTES ?? 1_900_000)
const maxGzipBytes = Number(process.env.GOOGLE_MAPS_BUNDLE_MAX_GZIP_BYTES ?? 550_000)
const totalMaxBytes = Number(process.env.GOOGLE_MAPS_BUNDLE_TOTAL_MAX_BYTES ?? 2_100_000)
const totalMaxGzipBytes = Number(process.env.GOOGLE_MAPS_BUNDLE_TOTAL_MAX_GZIP_BYTES ?? 550_000)

let totalBytes = 0
let totalGzipBytes = 0
let largest = { file: '', bytes: 0, gzipBytes: 0 }

for (const file of jsFiles) {
  const fullPath = resolve(assetsDir, file)
  const source = readFileSync(fullPath)
  const bytes = statSync(fullPath).size
  const gzipBytes = gzipSync(source).length

  totalBytes += bytes
  totalGzipBytes += gzipBytes

  if (bytes > largest.bytes) {
    largest = { file, bytes, gzipBytes }
  }
}

const violations = []
if (largest.bytes > maxBytes) {
  violations.push(`largest JS asset "${largest.file}" is ${largest.bytes} bytes > ${maxBytes}`)
}
if (largest.gzipBytes > maxGzipBytes) {
  violations.push(`largest JS gzip "${largest.file}" is ${largest.gzipBytes} bytes > ${maxGzipBytes}`)
}
if (totalBytes > totalMaxBytes) {
  violations.push(`total JS size is ${totalBytes} bytes > ${totalMaxBytes}`)
}
if (totalGzipBytes > totalMaxGzipBytes) {
  violations.push(`total JS gzip is ${totalGzipBytes} bytes > ${totalMaxGzipBytes}`)
}

if (violations.length > 0) {
  process.stderr.write('[google-maps-bundle-budget] FAILED:\n')
  for (const v of violations) process.stderr.write(`- ${v}\n`)
  process.exit(1)
}

process.stdout.write(
  `[google-maps-bundle-budget] OK: largest=${largest.file} (${largest.bytes}B/${largest.gzipBytes}B gzip), total=${totalBytes}B/${totalGzipBytes}B gzip.\n`,
)
