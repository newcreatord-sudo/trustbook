import process from 'node:process'

function read(name) {
  const v = process.env[name]
  return typeof v === 'string' ? v.trim() : ''
}

function fail(msg) {
  process.stderr.write(`[vercel-prebuild] FAILED: ${msg}\n`)
  process.exit(1)
}

if (read('VERCEL') !== '1') {
  process.stdout.write('[vercel-prebuild] skip (not running on Vercel)\n')
  process.exit(0)
}

const vercelEnv = read('VERCEL_ENV') || 'unknown'
const apiKey = read('VITE_GOOGLE_MAPS_API_KEY')
const mapId = read('VITE_GOOGLE_MAPS_MAP_ID')

if (!apiKey) fail('Missing VITE_GOOGLE_MAPS_API_KEY (Vercel env var).')
if (!mapId) fail('Missing VITE_GOOGLE_MAPS_MAP_ID (Vercel env var).')

if (vercelEnv === 'production' && mapId.toUpperCase().includes('DEMO')) {
  fail('VITE_GOOGLE_MAPS_MAP_ID production cannot be a DEMO Map ID.')
}

process.stdout.write(`[vercel-prebuild] OK (env=${vercelEnv})\n`)
