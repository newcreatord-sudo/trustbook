import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const apiBase = process.env.APP_BASE_URL?.trim() || 'http://localhost:5174'
const api = apiBase.replace(/\/$/, '') + '/api'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const adminToken = process.env.AUTH_ADMIN_SIGNUP_TOKEN

if (!supabaseUrl || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
}
if (!adminToken) {
  throw new Error('Missing AUTH_ADMIN_SIGNUP_TOKEN')
}

const email = `smoke.attivita.${Date.now()}@trustbook.local`
const password = 'SmokeTest1234'

const adminSignupRes = await fetch(`${api}/auth/admin-signup`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Admin-Signup-Token': adminToken,
  },
  body: JSON.stringify({
    email,
    password,
    role: 'attivita',
    firstName: 'Smoke',
    lastName: 'Owner',
  }),
})
const adminSignupPayload = await adminSignupRes.json().catch(() => null)
if (!adminSignupRes.ok) {
  throw new Error(`admin-signup failed: ${adminSignupRes.status} ${JSON.stringify(adminSignupPayload)}`)
}

const supabase = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})

const signIn = await supabase.auth.signInWithPassword({ email, password })
if (signIn.error || !signIn.data.session) {
  throw new Error(`signIn failed: ${signIn.error?.message ?? 'missing session'}`)
}

const userId = signIn.data.session.user.id

const bizInsert = await supabase
  .from('businesses')
  .insert({
    owner_user_id: userId,
    name: `Ristorante Smoke ${new Date().toISOString()}`,
    category: 'ristorante',
    description: 'Smoke create business via RLS',
    lat: 41.9028,
    lng: 12.4964,
    is_paused: false,
    min_gap_min: 5,
    approval_mode: 'risk_based',
    required_reliability_min: 70,
    cancellation_window_min: 120,
    deposit_mode: 'risk_based',
    deposit_value_type: 'percentage',
    deposit_fixed_cents: 500,
    deposit_percent: 20,
    deposit_min_cents: 500,
    deposit_max_cents: 3000,
    deposit_green_rule: { type: 'percentage', value: 0 },
    deposit_yellow_rule: { type: 'percentage', value: 20 },
    deposit_red_rule: { type: 'percentage', value: 50 },
    manual_approval_for_high_risk: true,
    cancellation_free_until_hours: 24,
    refund_policy: 'flexible',
    deposit_retained_on_no_show: true,
    deposit_retained_on_late_cancel: true,
    gallery_urls: [],
  })
  .select('*')
  .single()

if (bizInsert.error) throw new Error(`business insert failed: ${bizInsert.error.message}`)
const businessId = bizInsert.data.id

const svcInsert = await supabase.from('services').insert({
  business_id: businessId,
  name: 'Servizio base',
  duration_min: 45,
  price_cents: null,
})
if (svcInsert.error) throw new Error(`services insert failed: ${svcInsert.error.message}`)

const winInsert = await supabase.from('business_opening_windows').insert([
  { business_id: businessId, weekday: 1, start_time: '09:00', end_time: '13:00' },
  { business_id: businessId, weekday: 1, start_time: '15:00', end_time: '19:00' },
])
if (winInsert.error) throw new Error(`opening windows insert failed: ${winInsert.error.message}`)

const eco = await supabase
  .from('business_booking_ecosystem')
  .select('business_id, booking_vertical, resource_management_enabled')
  .eq('business_id', businessId)
  .maybeSingle()

if (eco.error) throw new Error(`ecosystem select failed: ${eco.error.message}`)

console.log({
  ok: true,
  created: {
    email,
    userId,
    businessId,
    ecosystem: eco.data ?? null,
  },
})

