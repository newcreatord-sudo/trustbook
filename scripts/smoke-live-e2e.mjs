import process from 'node:process'
import { resolve } from 'node:path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const envFileArg = process.argv.find((x) => x.startsWith('--env-file=')) ?? null
if (envFileArg) {
  const envFile = envFileArg.slice('--env-file='.length).trim()
  if (envFile) dotenv.config({ path: resolve(process.cwd(), envFile), override: true })
}

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

function readEnvAny(names) {
  for (const n of names) {
    const raw = process.env[n]
    if (typeof raw !== 'string') continue
    const v = raw.trim()
    if (v) return v
  }
  return null
}

function fail(msg) {
  process.stderr.write(`[smoke-live-e2e] ${msg}\n`)
  process.exit(1)
}

function redactToken(t) {
  if (!t) return null
  if (t.length <= 10) return '***'
  return `${t.slice(0, 4)}…${t.slice(-4)}`
}

function mergedHeaders(existing, extra) {
  const h = new Headers(existing || undefined)
  for (const [k, v] of Object.entries(extra || {})) {
    if (typeof v === 'string') h.set(k, v)
  }
  return h
}

async function expectOk(res, label) {
  if (res.ok) return
  const txt = await res.text().catch(() => '')
  fail(`${label} failed: HTTP ${res.status} ${txt}`)
}

function baseUrlFromEnv() {
  const appBaseUrl = readEnvAny(['APP_BASE_URL', 'VITE_APP_URL'])
  const baseUrlArg = process.argv.find((x) => x.startsWith('--base-url=')) ?? null
  const baseUrl = (baseUrlArg?.slice('--base-url='.length).trim() || appBaseUrl || '').replace(/\/$/, '')
  return baseUrl || null
}

function calendarPartsInTimeZone(date, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(date)
  const read = (type) => Number(parts.find((p) => p.type === type)?.value ?? '0')
  return { year: read('year'), month: read('month'), day: read('day') }
}

function formatDatePartsKey(parts) {
  const mm = String(parts.month).padStart(2, '0')
  const dd = String(parts.day).padStart(2, '0')
  return `${parts.year}-${mm}-${dd}`
}

const baseUrl = baseUrlFromEnv()
if (!baseUrl) fail('Missing --base-url or APP_BASE_URL/VITE_APP_URL')

const supabaseUrl = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
const supabaseAnon = readEnvAny(['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY_'])
if (!supabaseUrl) fail('Missing SUPABASE_URL/VITE_SUPABASE_URL')
if (!supabaseAnon) fail('Missing SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY')
const supabaseServiceRole = readEnvAny(['SUPABASE_SERVICE_ROLE_KEY'])
const sbService = supabaseServiceRole
  ? createClient(supabaseUrl, supabaseServiceRole, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null

const vercelBypass = readEnvAny(['VERCEL_AUTOMATION_BYPASS_SECRET'])
const adminSignupToken = readEnvAny(['AUTH_ADMIN_SIGNUP_TOKEN', 'ADMIN_SIGNUP_TOKEN'])
const allowProd = readEnvAny(['E2E_ALLOW_PROD']) === '1'

if (!allowProd) {
  const u = new URL(baseUrl)
  const isProdHost = u.hostname === 'trustbook.it' || u.hostname === 'www.trustbook.it'
  if (isProdHost) fail('Refusing to run destructive E2E on prod. Set E2E_ALLOW_PROD=1 to proceed.')
}

async function fetchTb(path, init) {
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`
  const extra = vercelBypass ? { 'x-vercel-protection-bypass': vercelBypass } : null
  const headers = extra ? mergedHeaders(init?.headers, extra) : init?.headers
  return fetch(url, { ...(init || {}), headers })
}

function randTag() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

async function adminSignupIfPossible(params) {
  if (!adminSignupToken) return { ok: false, reason: 'missing-token' }
  const res = await fetchTb('/api/auth/admin-signup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Signup-Token': adminSignupToken,
    },
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    return { ok: false, reason: `http-${res.status}`, details: txt }
  }
  const json = await res.json().catch(() => null)
  if (!json || json.success !== true) {
    return { ok: false, reason: 'bad-payload', details: JSON.stringify(json) }
  }
  return { ok: true, data: json }
}

async function serviceCreateUser(params) {
  if (!supabaseServiceRole) return { ok: false, reason: 'missing-service-role' }
  const sbAdmin = createClient(supabaseUrl, supabaseServiceRole, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await sbAdmin.auth.admin.createUser({
    email: params.email,
    password: params.password,
    email_confirm: true,
    user_metadata: { role: params.role, first_name: params.firstName, last_name: params.lastName },
  })
  if (error) return { ok: false, reason: 'create-user-failed', details: String(error.message || error) }
  const userId = data?.user?.id ?? null
  if (typeof userId !== 'string') return { ok: false, reason: 'missing-user-id' }
  const { error: profErr } = await sbAdmin.from('profiles').update({ role: params.role }).eq('id', userId)
  if (profErr) {
    process.stdout.write(`[smoke-live-e2e] WARN profile update failed: ${String(profErr.message || profErr)}\n`)
  }
  return { ok: true, userId }
}

async function ensureUser(params) {
  const apiRes = await adminSignupIfPossible({
    email: params.email,
    password: params.password,
    role: params.role,
    firstName: params.firstName,
    lastName: params.lastName,
  })
  if (apiRes.ok) return { ok: true, via: 'api' }
  if (apiRes.reason === 'http-403') {
    const svcRes = await serviceCreateUser(params)
    if (svcRes.ok) return { ok: true, via: 'service-role' }
  }
  return apiRes
}

async function signIn(params) {
  const sb = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await sb.auth.signInWithPassword({ email: params.email, password: params.password })
  if (error) throw error
  if (!data?.session?.access_token) throw new Error('Missing access token')
  return { sb, session: data.session }
}

async function pickActiveBusiness(sb) {
  const { data, error } = await sb
    .from('businesses')
    .select('id,timezone,is_paused,listing_visible')
    .eq('listing_visible', true)
    .eq('is_paused', false)
    .limit(10)
  if (error) throw error
  const rows = Array.isArray(data) ? data : []
  const first = rows.find((x) => x && typeof x.id === 'string') ?? null
  if (!first) throw new Error('No active listing_visible business found')
  return first
}

async function pickService(sb, businessId) {
  const { data, error } = await sb
    .from('services')
    .select('id,duration_min,is_active')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(10)
  if (error) throw error
  const rows = Array.isArray(data) ? data : []
  const first = rows.find((x) => x && typeof x.id === 'string') ?? null
  if (!first) throw new Error('No active service found')
  return first
}

async function listSlots(sb, params) {
  const dayParts = calendarPartsInTimeZone(params.day, params.timeZone)
  const p_on = formatDatePartsKey(dayParts)
  const { data, error } = await sb.rpc('list_bookable_slots_for_booking', {
    p_business_id: params.businessId,
    p_service_id: params.serviceId,
    p_on,
    p_staff_id: null,
  })
  if (error) throw error
  const rows = Array.isArray(data) ? data : []
  const parsed = rows
    .map((r) => {
      if (!r || typeof r !== 'object') return null
      const rr = r
      const sa = typeof rr.start_at === 'string' ? rr.start_at : null
      const ea = typeof rr.end_at === 'string' ? rr.end_at : null
      if (!sa || !ea) return null
      return { startAt: sa, endAt: ea }
    })
    .filter(Boolean)
  return parsed
}

async function createBooking(sb, params) {
  const { data, error } = await sb.rpc('create_booking_v3', {
    p_business_id: params.businessId,
    p_service_id: params.serviceId,
    p_start_at: params.startAt,
    p_end_at: params.endAt,
    p_staff_id: null,
  })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  const id = row && typeof row === 'object' ? row.id : null
  const status = row && typeof row === 'object' ? row.status : null
  if (typeof id !== 'string') throw new Error('create_booking_v3 missing booking id')
  return { id, status: typeof status === 'string' ? status : null }
}

async function cancelBookingViaApi(params) {
  const res = await fetchTb('/api/stripe/deposit/cancel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({ bookingId: params.bookingId }),
  })
  await expectOk(res, 'POST /api/stripe/deposit/cancel')
  const json = await res.json().catch(() => null)
  if (!json || json.success !== true) throw new Error('cancel payload invalid')
  return json
}

async function createBusinessWithDefaults(sb, params) {
  const { data, error } = await sb.rpc('create_business_with_defaults', {
    p_input: {
      name: params.name,
      category: 'parrucchiere',
      description: 'E2E test business',
      addressText: 'Via Roma 1',
      postalCode: '20100',
      city: 'Milano',
      phone: '+3902000000',
      email: params.email,
      website: 'https://trustbook.it',
      lat: 45.46,
      lng: 9.19,
      logoUrl: '',
      galleryUrls: [],
      isPaused: false,
      minGapMin: 10,
      approvalMode: 'risk_based',
      requiredReliabilityMin: 0,
      cancellationWindowMin: 120,
      depositMode: 'none',
      depositValueType: 'percentage',
      depositFixedCents: 0,
      depositPercent: 0,
      depositMinCents: 0,
      depositMaxCents: 0,
      depositGreenRule: { type: 'percentage', value: 0 },
      depositYellowRule: { type: 'percentage', value: 0 },
      depositRedRule: { type: 'percentage', value: 0 },
      manualApprovalForHighRisk: false,
      cancellationFreeUntilHours: 24,
      refundPolicy: 'flexible',
      depositRetainedOnNoShow: false,
      depositRetainedOnLateCancel: false,
      services: [{ name: 'Taglio e2e', durationMin: 30, priceCents: null }],
      schedule: {
        0: [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }],
        1: [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }],
        2: [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }],
        3: [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }],
        4: [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }],
        5: [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }],
        6: [{ start: '09:00', end: '13:00' }, { start: '15:00', end: '19:00' }],
      },
      staffEmails: [],
      ownerUserId: params.ownerUserId,
    },
  })
  if (error) throw error
  const id = data && typeof data === 'object' ? data.id : null
  if (typeof id !== 'string') throw new Error('create_business_with_defaults missing id')
  return { id }
}

async function markBookingStatus(sb, params) {
  const { data, error } = await sb
    .from('bookings')
    .update(params.patch)
    .eq('id', params.bookingId)
    .select('id,status')
    .single()
  if (error) throw error
  return data
}

async function forceBookingInPastForReview(params) {
  if (!sbService) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (required for review time-travel)')
  const now = new Date()
  const endAt = new Date(now.getTime() - 45 * 60_000)
  const startAt = new Date(now.getTime() - 75 * 60_000)
  const patch = {
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    status: 'completed',
    completed_at: now.toISOString(),
  }
  const { error } = await sbService.from('bookings').update(patch).eq('id', params.bookingId)
  if (error) throw error
}

async function assertHasNotifications(sb, userId) {
  const { data, error } = await sb
    .from('notifications')
    .select('id,kind,created_at')
    .eq('recipient_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) throw error
  const rows = Array.isArray(data) ? data : []
  return rows.length
}

process.stdout.write(`[smoke-live-e2e] baseUrl=${baseUrl}\n`)
process.stdout.write(
  `[smoke-live-e2e] supabaseUrl=${new URL(supabaseUrl).hostname} adminSignupToken=${adminSignupToken ? redactToken(adminSignupToken) : '—'} vercelBypass=${vercelBypass ? redactToken(vercelBypass) : '—'}\n`,
)

const health = await fetchTb('/api/health')
await expectOk(health, 'GET /api/health')

const tag = randTag()
const customerEmail = readEnvAny(['E2E_CUSTOMER_EMAIL']) ?? `e2e.customer+${tag}@example.com`
const customerPass = readEnvAny(['E2E_CUSTOMER_PASSWORD']) ?? `TB!${tag}aA1`
const ownerEmail = readEnvAny(['E2E_OWNER_EMAIL']) ?? `e2e.owner+${tag}@example.com`
const ownerPass = readEnvAny(['E2E_OWNER_PASSWORD']) ?? `TB!${tag}aA1`

const customerSignup = await ensureUser({
  email: customerEmail,
  password: customerPass,
  role: 'cliente',
  firstName: 'E2E',
  lastName: 'Customer',
})
if (!customerSignup.ok) {
  process.stdout.write(`[smoke-live-e2e] WARN customer creation skipped: ${customerSignup.reason}\n`)
}

const ownerSignup = await ensureUser({
  email: ownerEmail,
  password: ownerPass,
  role: 'attivita',
  firstName: 'E2E',
  lastName: 'Owner',
})
if (!ownerSignup.ok) {
  process.stdout.write(`[smoke-live-e2e] WARN owner creation skipped: ${ownerSignup.reason}\n`)
}

const { sb: sbCustomer, session: customerSession } = await signIn({ email: customerEmail, password: customerPass })
const customerUserId = customerSession.user?.id
if (!customerUserId) fail('Customer session missing user id')

const { sb: sbOwner, session: ownerSession } = await signIn({ email: ownerEmail, password: ownerPass })
const ownerUserId = ownerSession.user?.id
if (!ownerUserId) fail('Owner session missing user id')

const createdBiz = await createBusinessWithDefaults(sbOwner, {
  ownerUserId,
  email: ownerEmail,
  name: `E2E Business ${tag}`,
})

const svc = await pickService(sbOwner, createdBiz.id)
const timeZone = 'Europe/Rome'
const day = new Date(Date.now() + 24 * 60 * 60_000)
const slots = await listSlots(sbCustomer, {
  businessId: createdBiz.id,
  serviceId: svc.id,
  day,
  timeZone,
})
if (!slots.length) fail('No bookable slots returned')

const booking = await createBooking(sbCustomer, {
  businessId: createdBiz.id,
  serviceId: svc.id,
  startAt: slots[0].startAt,
  endAt: slots[0].endAt,
})

process.stdout.write(`[smoke-live-e2e] bookingId=${booking.id} status=${booking.status ?? '—'}\n`)

if (booking.status === 'requested' || booking.status === 'pending_approval') {
  const now = new Date().toISOString()
  await markBookingStatus(sbOwner, {
    bookingId: booking.id,
    patch: { status: 'confirmed', confirmed_at: now, approved_by_user_id: ownerUserId },
  })
}

await cancelBookingViaApi({ bookingId: booking.id, accessToken: customerSession.access_token })

const slots2 = slots[1] ? slots : await listSlots(sbCustomer, { businessId: createdBiz.id, serviceId: svc.id, day, timeZone })
if (!slots2.length) fail('No bookable slots returned (second booking)')
const slotForSecond = slots2[1] ?? slots2[0]

const booking2 = await createBooking(sbCustomer, {
  businessId: createdBiz.id,
  serviceId: svc.id,
  startAt: slotForSecond.startAt,
  endAt: slotForSecond.endAt,
})

process.stdout.write(`[smoke-live-e2e] booking2Id=${booking2.id} status=${booking2.status ?? '—'}\n`)

if (booking2.status === 'requested' || booking2.status === 'pending_approval') {
  const now = new Date().toISOString()
  await markBookingStatus(sbOwner, {
    bookingId: booking2.id,
    patch: { status: 'confirmed', confirmed_at: now, approved_by_user_id: ownerUserId },
  })
}

{
  const now = new Date().toISOString()
  await markBookingStatus(sbOwner, {
    bookingId: booking2.id,
    patch: { status: 'completed', completed_at: now },
  })
}

await forceBookingInPastForReview({ bookingId: booking2.id })

{
  const { error } = await sbCustomer.from('reviews').insert({
    booking_id: booking2.id,
    business_id: createdBiz.id,
    author_user_id: customerUserId,
    direction: 'customer_to_business',
    rating: 5,
    comment: `E2E OK ${tag}`,
  })
  if (error) throw error
}

const notifCount = await assertHasNotifications(sbCustomer, customerUserId)
if (notifCount <= 0) fail('Expected at least 1 notification for customer')

process.stdout.write(`[smoke-live-e2e] OK notifications=${notifCount}\n`)
