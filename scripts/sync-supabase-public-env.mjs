import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'

function readArg(name) {
  const raw = process.argv.find((x) => x.startsWith(`--${name}=`)) ?? null
  if (!raw) return null
  const v = raw.slice(`--${name}=`.length).trim()
  return v.length ? v : null
}

function getLineKey(line) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line.trim())
  return m?.[1] ?? null
}

function isEmptyValueLine(line) {
  const idx = line.indexOf('=')
  if (idx < 0) return false
  const v = line.slice(idx + 1).trim()
  return v === '' || v === '""' || v === "''"
}

function setIfMissingOrEmpty(lines, key, value) {
  const idx = lines.findIndex((l) => getLineKey(l) === key)
  if (idx < 0) {
    lines.push(`${key}=${value}`)
    return true
  }
  if (isEmptyValueLine(lines[idx])) {
    lines[idx] = `${key}=${value}`
    return true
  }
  return false
}

async function deriveSupabasePublicConfig(baseUrl) {
  const htmlRes = await fetch(`${baseUrl.replace(/\/$/, '')}/`)
  const html = await htmlRes.text().catch(() => '')
  if (!htmlRes.ok || !html) throw new Error(`Failed to fetch HTML: HTTP ${htmlRes.status}`)

  const scriptSrc =
    html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i)?.[1] ??
    html.match(/<script[^>]+src="([^"]+\/assets\/index-[^"]+\.js)"/i)?.[1] ??
    null
  if (!scriptSrc) throw new Error('Failed to locate module script src in HTML')

  const jsRes = await fetch(scriptSrc.startsWith('http') ? scriptSrc : `${baseUrl.replace(/\/$/, '')}${scriptSrc}`)
  const js = await jsRes.text().catch(() => '')
  if (!jsRes.ok || !js) throw new Error(`Failed to fetch index bundle: HTTP ${jsRes.status}`)

  const supabaseUrl = js.match(/https:\/\/[a-z0-9]{6,}\.supabase\.co/gi)?.[0] ?? null
  const jwtMatches = js.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ?? []
  const supabaseAnonKey = jwtMatches.sort((a, b) => b.length - a.length)[0] ?? null
  const mapsKey = js.match(/AIza[0-9A-Za-z_-]{30,}/)?.[0] ?? null
  const stripePk = js.match(/pk_(?:live|test)_[0-9a-zA-Z]{10,}/)?.[0] ?? null

  if (!supabaseUrl || !supabaseAnonKey) throw new Error('Failed to derive SUPABASE_URL / SUPABASE_ANON_KEY from bundle')
  return { supabaseUrl, supabaseAnonKey, mapsKey, stripePk }
}

async function main() {
  const envFile = readArg('env-file') ?? '.env.staging'
  const baseUrlArg = readArg('base-url')
  const force = readArg('force') === '1'

  const abs = resolve(process.cwd(), envFile)
  if (!existsSync(abs)) {
    process.stderr.write(`[sync-supabase-public-env] Missing ${envFile}\n`)
    process.exit(2)
  }

  const raw = readFileSync(abs, 'utf8')
  const parsed = dotenv.parse(raw)
  const baseUrl =
    baseUrlArg ??
    String(parsed.VITE_APP_URL ?? '').trim() ??
    String(parsed.APP_BASE_URL ?? '').trim() ??
    ''

  if (!baseUrl) {
    process.stderr.write('[sync-supabase-public-env] Missing base URL (set VITE_APP_URL/APP_BASE_URL in env file or pass --base-url=...)\n')
    process.exit(2)
  }

  const { supabaseUrl, supabaseAnonKey, mapsKey, stripePk } = await deriveSupabasePublicConfig(baseUrl)

  const lines = raw.split(/\r?\n/)
  let changed = 0

  const set = (k, v) => {
    if (force) {
      const idx = lines.findIndex((l) => getLineKey(l) === k)
      if (idx >= 0) lines[idx] = `${k}=${v}`
      else lines.push(`${k}=${v}`)
      changed += 1
      return
    }
    if (setIfMissingOrEmpty(lines, k, v)) changed += 1
  }

  set('VITE_SUPABASE_URL', supabaseUrl)
  set('SUPABASE_URL', supabaseUrl)
  set('VITE_SUPABASE_ANON_KEY', supabaseAnonKey)
  set('SUPABASE_ANON_KEY', supabaseAnonKey)
  if (mapsKey) set('VITE_GOOGLE_MAPS_API_KEY', mapsKey)
  if (stripePk) set('VITE_STRIPE_PUBLISHABLE_KEY', stripePk)

  if (!lines.at(-1)?.trim()) {
  } else {
    lines.push('')
  }

  writeFileSync(abs, lines.join('\n').replace(/\n*$/, '\n'), 'utf8')
  process.stdout.write(`[sync-supabase-public-env] OK: updated ${changed} key(s) in ${envFile}\n`)
}

main().catch((e) => {
  process.stderr.write(`[sync-supabase-public-env] ${String(e?.message || e)}\n`)
  process.exitCode = 1
})
