import { existsSync, readFileSync } from 'node:fs'
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
  process.stderr.write(`[osm-seed-it] ${msg}\n`)
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

const cityBoxes = [
  { key: 'milano', label: 'Milano', bbox: '45.36,9.02,45.55,9.35' },
  { key: 'roma', label: 'Roma', bbox: '41.77,12.35,41.97,12.65' },
  { key: 'napoli', label: 'Napoli', bbox: '40.79,14.14,40.93,14.36' },
  { key: 'torino', label: 'Torino', bbox: '45.00,7.55,45.15,7.75' },
  { key: 'bologna', label: 'Bologna', bbox: '44.44,11.25,44.56,11.43' },
  { key: 'firenze', label: 'Firenze', bbox: '43.72,11.18,43.82,11.32' },
  { key: 'palermo', label: 'Palermo', bbox: '38.07,13.26,38.19,13.42' },
  { key: 'catania', label: 'Catania', bbox: '37.46,15.02,37.55,15.13' },
]

const envFile = readArg('env-file') ?? '.env.staging'
const endpointArg = readArg('endpoint') ?? 'auto'
const timeoutSec = Math.max(25, Math.min(300, Number(readArg('timeout') ?? 120)))
const delaySec = Math.max(1, Math.min(60, Number(readArg('delay') ?? 6)))
const batchSize = Math.max(50, Math.min(1000, Number(readArg('batch') ?? 500)))
const dryRun = hasFlag('dry-run')

const citiesRaw = readArg('cities')
const cities = citiesRaw
  ? citiesRaw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  : cityBoxes.map((x) => x.key)

const targets = cityBoxes.filter((x) => cities.includes(x.key))
if (targets.length === 0) fail('No cities selected')

const envPath = resolve(process.cwd(), envFile)
if (!existsSync(envPath)) fail(`Missing env file: ${envFile}`)
const parsedEnv = dotenv.parse(readFileSync(envPath, 'utf8'))
for (const [k, v] of Object.entries(parsedEnv)) process.env[k] = v

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

process.stdout.write(
  JSON.stringify(
    {
      envFile,
      endpoint: endpoints[0],
      timeoutSec,
      delaySec,
      batchSize,
      dryRun,
      cities: targets.map((x) => x.key),
    },
    null,
    2,
  ) + '\n',
)

if (dryRun) process.exit(0)

const sb = createClient(supabaseUrl, supabaseServiceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
})

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

for (const target of targets) {
  const bbox = target.bbox
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

  process.stdout.write(`[osm-seed-it] fetch ${target.label} bbox=${bbox}\n`)
  const { endpoint, data } = await postOverpass(query)
  process.stdout.write(`[osm-seed-it] source ${endpoint}\n`)
  const elements = Array.isArray(data?.elements) ? data.elements : []

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

    const city = toText(tags['addr:city'] ?? tags['contact:city'] ?? tags['is_in:city'] ?? '') ?? target.label
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
  process.stdout.write(`[osm-seed-it] upserted ${ok} rows for ${target.label}\n`)
  await wait(delaySec)
}

process.stdout.write(`[osm-seed-it] done\n`)
