import { createWriteStream } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'

function readArg(name) {
  const raw = process.argv.find((x) => x.startsWith(`--${name}=`)) ?? null
  if (!raw) return null
  const v = raw.slice(`--${name}=`.length).trim()
  return v.length ? v : null
}

function fail(msg) {
  process.stderr.write(`[osm-overpass-export] ${msg}\n`)
  process.exit(2)
}

function parseBbox(raw) {
  const parts = String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (parts.length !== 4) return null
  const nums = parts.map((x) => Number(x))
  if (!nums.every((n) => Number.isFinite(n))) return null
  const [minLat, minLng, maxLat, maxLng] = nums
  if (minLat >= maxLat || minLng >= maxLng) return null
  return { minLat, minLng, maxLat, maxLng }
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

const bboxRaw = readArg('bbox')
const outFile = readArg('out') ?? './artifacts/osm-export.ndjson'
const endpointArg = readArg('endpoint') ?? 'auto'
const timeoutSec = Math.max(25, Math.min(300, Number(readArg('timeout') ?? 120)))

const bbox = parseBbox(bboxRaw)
if (!bbox) fail('Missing/invalid --bbox=minLat,minLng,maxLat,maxLng')

const defaultEndpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
]
const endpoints =
  endpointArg !== 'auto' && endpointArg.trim()
    ? [endpointArg.trim()]
    : defaultEndpoints

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

const query = `
[out:json][timeout:${timeoutSec}];
(
  nwr["name"]["amenity"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
  nwr["name"]["shop"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
  nwr["name"]["tourism"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
  nwr["name"]["leisure"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
  nwr["name"]["office"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
  nwr["name"]["craft"](${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng});
);
out center;
`
  .trim()
  .replace(/\n+/g, '\n')

const { endpoint, data } = await postOverpass(query)
const elements = Array.isArray(data?.elements) ? data.elements : []

const outPath = resolve(process.cwd(), outFile)
const stream = createWriteStream(outPath, { encoding: 'utf8' })

const nowIso = new Date().toISOString()
let kept = 0
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

  const row = {
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
  }

  stream.write(`${JSON.stringify(row)}\n`)
  kept += 1
}

await new Promise((r) => stream.end(r))

process.stdout.write(
  JSON.stringify(
    {
      bbox,
      endpoint,
      outFile,
      elements: elements.length,
      exported: kept,
    },
    null,
    2,
  ) + '\n',
)
