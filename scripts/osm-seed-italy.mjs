import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

function readArg(name) {
  const raw = process.argv.find((x) => x.startsWith(`--${name}=`)) ?? null
  if (!raw) return null
  const v = raw.slice(`--${name}=`.length).trim()
  return v.length ? v : null
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function fail(msg) {
  process.stderr.write(`[osm-seed-italy] ${msg}\n`)
  process.exit(2)
}

function toText(v) {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length ? s : null
}

function buildAddress(tags) {
  const street = toText(tags['addr:street'])
  const housenumber = toText(tags['addr:housenumber'])
  const suburb = toText(tags['addr:suburb'])
  const hamlet = toText(tags['addr:hamlet'])
  const place = suburb ?? hamlet
  const a = street ? (housenumber ? `${street} ${housenumber}` : street) : null
  if (a && place) return `${a}, ${place}`
  return a ?? place ?? null
}

function categoryFromOsm(tags) {
  const amenity = toText(tags.amenity)
  const shop = toText(tags.shop)
  const tourism = toText(tags.tourism)
  const leisure = toText(tags.leisure)
  const office = toText(tags.office)
  const craft = toText(tags.craft)
  const cuisine = toText(tags.cuisine)

  if (shop === 'hairdresser') return 'parrucchiere'
  if (shop === 'beauty') return 'estetista'
  if (shop === 'tattoo') return 'tatuatore'
  if (shop === 'barber') return 'barbiere'
  if (amenity === 'barber') return 'barbiere'
  if (amenity === 'hairdresser') return 'parrucchiere'
  if (amenity === 'restaurant') return cuisine && cuisine.toLowerCase().includes('pizza') ? 'pizzeria' : 'ristorante'
  if (amenity === 'fast_food') return cuisine && cuisine.toLowerCase().includes('pizza') ? 'pizzeria' : 'ristorante'
  if (amenity === 'cafe') return 'ristorante'
  if (amenity === 'pub') return 'ristorante'
  if (tourism === 'hotel' || tourism === 'guest_house' || tourism === 'hostel') return 'hotel_bnb'
  if (tourism === 'motel') return 'hotel_bnb'
  if (tourism === 'apartment') return 'hotel_bnb'
  if (office) return 'professionista'
  if (craft === 'car_repair') return 'officina'
  if (amenity === 'car_repair') return 'officina'
  if (leisure === 'fitness_centre' || leisure === 'sports_centre' || leisure === 'stadium') return 'centro_sportivo'
  if (amenity === 'gym') return 'centro_sportivo'
  if (amenity === 'clinic' || amenity === 'doctors' || amenity === 'dentist' || amenity === 'hospital') return 'studio_medico'
  if (craft === 'massage') return 'massaggiatore'
  if (amenity === 'spa') return 'massaggiatore'
  if (office === 'consulting' || office === 'accountant' || office === 'financial') return 'consulente'
  return null
}

function sourceUrlFor(el) {
  const type = String(el.type ?? '').trim()
  const id = typeof el.id === 'number' ? el.id : null
  if (!id) return null
  if (type === 'node') return `https://www.openstreetmap.org/node/${id}`
  if (type === 'way') return `https://www.openstreetmap.org/way/${id}`
  if (type === 'relation') return `https://www.openstreetmap.org/relation/${id}`
  return null
}

function osmRef(el) {
  const type = String(el.type ?? '').trim()
  const id = typeof el.id === 'number' ? el.id : null
  if (!id) return null
  if (type !== 'node' && type !== 'way' && type !== 'relation') return null
  return `${type}/${id}`
}

function parseBbox(s) {
  const parts = String(s ?? '')
    .trim()
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
  if (parts.length !== 4) return null
  const [minLat, minLng, maxLat, maxLng] = parts.map((x) => Number(x))
  if (![minLat, minLng, maxLat, maxLng].every((x) => Number.isFinite(x))) return null
  if (minLat >= maxLat || minLng >= maxLng) return null
  return { minLat, minLng, maxLat, maxLng }
}

function tileId(t) {
  const a = String(t.minLat).replaceAll('.', '_')
  const b = String(t.minLng).replaceAll('.', '_')
  const c = String(t.maxLat).replaceAll('.', '_')
  const d = String(t.maxLng).replaceAll('.', '_')
  return `${a}-${b}-${c}-${d}`
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

const envFile = readArg('env-file') ?? '.env.staging'
const endpointArg = readArg('endpoint') ?? 'auto'
const timeoutSec = clamp(Number(readArg('timeout') ?? 120), 25, 300)
const delaySec = clamp(Number(readArg('delay') ?? 8), 1, 60)
const batchSize = clamp(Number(readArg('batch') ?? 500), 50, 1000)
const tileStep = clamp(Number(readArg('tile-step') ?? 0.5), 0.2, 2.0)
const maxTiles = clamp(Number(readArg('max-tiles') ?? 999999), 1, 999999)
const dryRun = hasFlag('dry-run')

const italyBbox =
  parseBbox(readArg('bbox') ?? '') ??
  ({
    minLat: 35.0,
    minLng: 6.0,
    maxLat: 47.6,
    maxLng: 19.2,
  })

const stateFile = readArg('state-file') ?? './artifacts/osm-seed-italy.state.json'
const envPath = resolve(process.cwd(), envFile)
if (!existsSync(envPath)) fail(`Missing env file: ${envFile}`)
const parsedEnv = dotenv.parse(readFileSync(envPath, 'utf8'))
for (const [k, v] of Object.entries(parsedEnv)) process.env[k] = v

const envLocalPath = resolve(process.cwd(), `${envFile}.local`)
if (existsSync(envLocalPath)) {
  const parsedLocal = dotenv.parse(readFileSync(envLocalPath, 'utf8'))
  for (const [k, v] of Object.entries(parsedLocal)) process.env[k] = v
}

const supabaseUrl = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
const supabaseServiceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
if (!supabaseUrl) fail('Missing SUPABASE_URL (or VITE_SUPABASE_URL)')
if (!supabaseServiceRole) fail('Missing SUPABASE_SERVICE_ROLE_KEY')

const defaultEndpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
]
const endpoints =
  endpointArg !== 'auto' && endpointArg.trim()
    ? [endpointArg.trim()]
    : defaultEndpoints

function loadState() {
  const abs = resolve(process.cwd(), stateFile)
  if (!existsSync(abs)) return { done: {}, updatedAt: null }
  try {
    const raw = readFileSync(abs, 'utf8')
    const data = JSON.parse(raw)
    const done = typeof data?.done === 'object' && data.done ? data.done : {}
    const updatedAt = typeof data?.updatedAt === 'string' ? data.updatedAt : null
    return { done, updatedAt }
  } catch {
    return { done: {}, updatedAt: null }
  }
}

function saveState(done) {
  const abs = resolve(process.cwd(), stateFile)
  const dir = resolve(abs, '..')
  mkdirSync(dir, { recursive: true })
  writeFileSync(abs, JSON.stringify({ done, updatedAt: new Date().toISOString() }, null, 2) + '\n', 'utf8')
}

function buildTiles(bbox, step) {
  const tiles = []
  for (let lat = bbox.minLat; lat < bbox.maxLat; lat += step) {
    for (let lng = bbox.minLng; lng < bbox.maxLng; lng += step) {
      const t = {
        minLat: Number(lat.toFixed(6)),
        minLng: Number(lng.toFixed(6)),
        maxLat: Number(Math.min(bbox.maxLat, lat + step).toFixed(6)),
        maxLng: Number(Math.min(bbox.maxLng, lng + step).toFixed(6)),
      }
      tiles.push(t)
    }
  }
  return tiles
}

async function wait(sec) {
  if (sec <= 0) return
  await new Promise((r) => setTimeout(r, sec * 1000))
}

async function postOverpass(query) {
  const headers = {
    accept: 'application/json',
    'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
    'user-agent': 'trustbook-import',
  }
  const body = new URLSearchParams({ data: query })
  const retryDelays = [1.5, 4]

  let lastErr = null
  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt < retryDelays.length + 1; attempt += 1) {
      try {
        const res = await fetch(endpoint, { method: 'POST', headers, body })
        if (!res.ok) {
          const t = await res.text().catch(() => '')
          const msg = `Overpass HTTP ${res.status} ${res.statusText} ${t ? `- ${t.slice(0, 180)}` : ''}`.trim()
          if ([406, 429, 502, 503, 504].includes(res.status)) {
            lastErr = msg
            if (attempt < retryDelays.length) {
              await wait(retryDelays[attempt])
              continue
            }
            break
          }
          throw new Error(msg)
        }
        const data = await res.json()
        return { endpoint, data }
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e)
        if (attempt < retryDelays.length) {
          await wait(retryDelays[attempt])
          continue
        }
      }
    }
  }
  throw new Error(lastErr ?? 'Overpass failed')
}

const sb = createClient(supabaseUrl, supabaseServiceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
})

async function upsertRows(rows) {
  if (rows.length === 0) return { ok: 0 }
  let ok = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize)
    const { error } = await sb.from('external_business_listings').upsert(batch, { onConflict: 'source,source_ref' })
    if (error) fail(error.message)
    ok += batch.length
  }
  return { ok }
}

const tiles = buildTiles(italyBbox, tileStep)
const state = loadState()
const done = state.done ?? {}
const pending = tiles.filter((t) => !done[tileId(t)])

process.stdout.write(
  JSON.stringify(
    {
      envFile,
      endpoint: endpoints[0],
      timeoutSec,
      delaySec,
      batchSize,
      tileStep,
      bbox: italyBbox,
      totalTiles: tiles.length,
      pendingTiles: pending.length,
      maxTiles,
      dryRun,
      stateFile,
      lastStateUpdatedAt: state.updatedAt,
    },
    null,
    2,
  ) + '\n',
)

if (dryRun) process.exit(0)

let processed = 0
for (const t of pending) {
  if (processed >= maxTiles) break
  const id = tileId(t)
  const bbox = `${t.minLat},${t.minLng},${t.maxLat},${t.maxLng}`
  const query = `
[out:json][timeout:${timeoutSec}];
(
  nwr["name"]["amenity"](${bbox});
  nwr["name"]["shop"](${bbox});
  nwr["name"]["tourism"](${bbox});
  nwr["name"]["leisure"](${bbox});
  nwr["name"]["office"](${bbox});
  nwr["name"]["craft"](${bbox});
);
out center;
`
    .trim()
    .replace(/\n+/g, '\n')

  process.stdout.write(`[osm-seed-italy] fetch tile=${id} bbox=${bbox}\n`)
  const startedAt = Date.now()
  const { endpoint, data } = await postOverpass(query)
  const elements = Array.isArray(data?.elements) ? data.elements : []
  process.stdout.write(`[osm-seed-italy] source ${endpoint} elements=${elements.length}\n`)

  const nowIso = new Date().toISOString()
  const rows = []
  for (const el of elements) {
    if (typeof el !== 'object' || el === null) continue
    const ref = osmRef(el)
    if (!ref) continue
    const tags = typeof el.tags === 'object' && el.tags !== null ? el.tags : {}
    const name = toText(tags.name)
    if (!name) continue

    const center = typeof el.center === 'object' && el.center !== null ? el.center : null
    const lat =
      typeof el.lat === 'number' && Number.isFinite(el.lat)
        ? el.lat
        : typeof center?.lat === 'number' && Number.isFinite(center.lat)
          ? center.lat
          : null
    const lon =
      typeof el.lon === 'number' && Number.isFinite(el.lon)
        ? el.lon
        : typeof center?.lon === 'number' && Number.isFinite(center.lon)
          ? center.lon
          : null
    if (lat === null || lon === null) continue

    const category = categoryFromOsm(tags)
    if (!category) continue

    const countryHint = toText(tags['addr:country'] ?? tags['is_in:country_code'] ?? tags['contact:country'] ?? '')
    if (countryHint && countryHint.toUpperCase() !== 'IT') continue

    const city = toText(tags['addr:city'] ?? tags['contact:city'] ?? tags['is_in:city'] ?? '')
    const postal = toText(tags['addr:postcode'] ?? tags['contact:postcode'] ?? '')
    const addressText = buildAddress(tags)

    const phone = toText(tags.phone ?? tags['contact:phone'] ?? tags['addr:phone'] ?? '')
    const email = toText(tags.email ?? tags['contact:email'] ?? '')
    const website = toText(tags.website ?? tags['contact:website'] ?? '')

    const extras = {
      osm: {
        amenity: toText(tags.amenity),
        shop: toText(tags.shop),
        tourism: toText(tags.tourism),
        leisure: toText(tags.leisure),
        office: toText(tags.office),
        craft: toText(tags.craft),
        cuisine: toText(tags.cuisine),
        opening_hours: toText(tags.opening_hours),
        wheelchair: toText(tags.wheelchair),
      },
    }

    rows.push({
      name,
      category,
      description: null,
      address_text: addressText,
      postal_code: postal,
      city,
      province: null,
      region: null,
      country_code: 'IT',
      lat,
      lng: lon,
      phone,
      email,
      website,
      listing_status: 'unverified',
      source: 'openstreetmap',
      source_ref: ref,
      source_url: sourceUrlFor(el),
      source_license: 'ODbL 1.0',
      source_attribution: '© OpenStreetMap contributors',
      data_checked_at: null,
      imported_at: nowIso,
      updated_at: nowIso,
      extras,
    })
  }

  const { ok } = await upsertRows(rows)
  done[id] = {
    ok,
    elements: elements.length,
    rowCount: rows.length,
    ms: Date.now() - startedAt,
    endpoint,
    at: new Date().toISOString(),
  }
  saveState(done)
  processed += 1
  process.stdout.write(`[osm-seed-italy] upserted ${ok} rows tile=${id}\n`)
  await wait(delaySec)
}

process.stdout.write(`[osm-seed-italy] done processed=${processed}\n`)
