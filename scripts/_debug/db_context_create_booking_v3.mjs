import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const adminToken = process.env.AUTH_ADMIN_SIGNUP_TOKEN
const rawDb = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? null
const apiTarget = (process.env.VITE_API_PROXY_TARGET || 'http://localhost:3002').replace(/\/$/, '')

if (!supabaseUrl || !anonKey) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
if (!adminToken) throw new Error('Missing AUTH_ADMIN_SIGNUP_TOKEN')
if (!rawDb) throw new Error('Missing DATABASE_URL')

function isoPlusMinutes(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

async function adminSignup({ email, password, role }) {
  const res = await fetch(`${apiTarget}/api/auth/admin-signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Signup-Token': adminToken,
    },
    body: JSON.stringify({ email, password, role, firstName: 'Dbg', lastName: role }),
  })
  const payload = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`admin-signup failed: ${res.status} ${JSON.stringify(payload)}`)
  return payload.userId
}

function sb() {
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

async function signIn(email, password) {
  const s = sb()
  const r = await s.auth.signInWithPassword({ email, password })
  if (r.error || !r.data.session) throw new Error(`signIn failed: ${r.error?.message ?? 'missing session'}`)
  return { s, session: r.data.session }
}

const ownerEmail = `dbg.owner.${Date.now()}@trustbook.local`
const ownerPass = 'SmokeTest1234'
await adminSignup({ email: ownerEmail, password: ownerPass, role: 'attivita' })
const { s: ownerSb, session: ownerSession } = await signIn(ownerEmail, ownerPass)

const biz = await ownerSb
  .from('businesses')
  .insert({
    owner_user_id: ownerSession.user.id,
    name: `DBG ${new Date().toISOString()}`,
    category: 'ristorante',
    description: 'dbg',
    lat: 41.9028,
    lng: 12.4964,
    is_paused: false,
    min_gap_min: 0,
    approval_mode: 'auto',
    required_reliability_min: 0,
    cancellation_window_min: 0,
    deposit_mode: 'none',
    deposit_value_type: 'percentage',
    deposit_fixed_cents: 0,
    deposit_percent: 0,
    deposit_min_cents: 0,
    deposit_max_cents: 0,
    deposit_green_rule: { type: 'percentage', value: 0 },
    deposit_yellow_rule: { type: 'percentage', value: 0 },
    deposit_red_rule: { type: 'percentage', value: 0 },
    manual_approval_for_high_risk: false,
    cancellation_free_until_hours: 0,
    refund_policy: 'flexible',
    deposit_retained_on_no_show: false,
    deposit_retained_on_late_cancel: false,
    gallery_urls: [],
  })
  .select('id')
  .single()
if (biz.error) throw new Error(biz.error.message)
const businessId = biz.data.id

const svc = await ownerSb
  .from('services')
  .insert({ business_id: businessId, name: 'Cena', duration_min: 45, price_cents: null, is_active: true })
  .select('id')
  .single()
if (svc.error) throw new Error(svc.error.message)
const serviceId = svc.data.id

await ownerSb.from('business_opening_windows').insert(
  Array.from({ length: 7 }, (_, weekday) => ({
    business_id: businessId,
    weekday,
    start_time: '00:00',
    end_time: '23:59',
  })),
)

const customerEmail = `dbg.customer.${Date.now()}@trustbook.local`
const customerPass = 'SmokeTest1234'
const customerId = await adminSignup({ email: customerEmail, password: customerPass, role: 'cliente' })

const startAt = isoPlusMinutes(120)
const endAt = isoPlusMinutes(165)

const u = new URL(rawDb)
u.searchParams.delete('sslmode')
u.searchParams.delete('sslcert')
u.searchParams.delete('sslkey')
u.searchParams.delete('sslrootcert')
u.searchParams.delete('sslcrl')
u.searchParams.delete('uselibpqcompat')

const db = new Client({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } })
await db.connect()

try {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [customerId])
  await db.query(`select set_config('request.jwt.claim.role', 'authenticated', false)`)
  await db.query(`select set_config('request.jwt.claim.email', $1, false)`, [customerEmail])

  const who = await db.query(`select auth.uid() as uid, auth.role() as role, current_setting('request.jwt.claim.sub', true) as sub`)
  console.log({ jwt: who.rows[0] })

  await db.query(
    `select public.create_booking_v3($1::uuid,$2::uuid,$3::timestamptz,$4::timestamptz,$5::uuid)`,
    [businessId, serviceId, startAt, endAt, null],
  )
  console.log({ ok: true })
} catch (e) {
  console.log({
    ok: false,
    error: {
      message: e?.message,
      code: e?.code,
      detail: e?.detail,
      hint: e?.hint,
      where: e?.where,
      routine: e?.routine,
      schema: e?.schema,
      table: e?.table,
      constraint: e?.constraint,
    },
  })
  process.exitCode = 1
} finally {
  await db.end()
}
