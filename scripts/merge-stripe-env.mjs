import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'

const STRIPE_KEYS = ['VITE_STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'PAYMENTS_ENABLED']

function shouldMerge(key, raw) {
  if (raw === undefined || raw === null) return false
  const t = String(raw).trim()
  if (key === 'PAYMENTS_ENABLED') return t === '0' || t === '1'
  return t.length > 0
}

function mergeIntoTarget(editPath, targetPath, label) {
  if (!existsSync(editPath)) {
    const example = `${editPath}.example`
    if (existsSync(example)) {
      copyFileSync(example, editPath)
      process.stderr.write(`[merge-stripe] Created local edit file from template: ${editPath}\n`)
      process.stderr.write(`[merge-stripe] Fill it, then re-run.\n`)
    } else {
      process.stderr.write(`[merge-stripe] Missing edit file: ${editPath}\n`)
    }
    return false
  }

  if (!existsSync(targetPath)) {
    const example = resolve(process.cwd(), '.env.example')
    if (!existsSync(example)) {
      process.stderr.write(`[merge-stripe] Missing ${targetPath} and no .env.example to bootstrap.\n`)
      return false
    }
    copyFileSync(example, targetPath)
    process.stdout.write(`[merge-stripe] Created ${label} from .env.example — review other vars.\n`)
  }

  const parsed = dotenv.parse(readFileSync(editPath, 'utf8'))
  const lines = readFileSync(targetPath, 'utf8').split(/\r?\n/)

  let merged = 0
  for (const key of STRIPE_KEYS) {
    const raw = parsed[key]
    if (!shouldMerge(key, raw)) continue

    const line = `${key}=${String(raw).trim()}`
    const idx = lines.findIndex((l) => {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(l.trim())
      return m?.[1] === key
    })
    if (idx >= 0) lines[idx] = line
    else lines.push(line)
    merged += 1
  }

  if (merged === 0) {
    process.stderr.write(`[merge-stripe] ${label}: nothing to merge (fill EDIT_* files first).\n`)
    return false
  }

  writeFileSync(targetPath, lines.join('\n').replace(/\n*$/, '\n'), 'utf8')
  process.stdout.write(`[merge-stripe] OK: merged ${merged} keys → ${targetPath}\n`)
  return true
}

const root = process.cwd()
const okSt = mergeIntoTarget(resolve(root, 'env/EDIT_STRIPE_STAGING.env'), resolve(root, '.env.staging'), 'staging')
const okPr = mergeIntoTarget(resolve(root, 'env/EDIT_STRIPE_PRODUCTION.env'), resolve(root, '.env.production'), 'production')

if (!okSt && !okPr) process.exit(1)
