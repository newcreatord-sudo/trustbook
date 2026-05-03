import { resolve } from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: resolve(process.cwd(), '.env.local') })
dotenv.config({ path: resolve(process.cwd(), '.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
const adminToken = process.env.AUTH_ADMIN_SIGNUP_TOKEN

const apiTarget = (process.env.VITE_API_PROXY_TARGET || 'http://localhost:3002').replace(/\/$/, '')

if (!supabaseUrl || !anonKey) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')
if (!adminToken) throw new Error('Missing AUTH_ADMIN_SIGNUP_TOKEN')

function assertOk(res, payload, label) {
  if (!res.ok) throw new Error(`${label} failed: ${res.status} ${JSON.stringify(payload)}`)
}

async function adminSignup({ email, password, role }) {
  const res = await fetch(`${apiTarget}/api/auth/admin-signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Signup-Token': adminToken,
    },
    body: JSON.stringify({ email, password, role, firstName: 'Smoke', lastName: role }),
  })
  const payload = await res.json().catch(() => null)
  assertOk(res, payload, 'admin-signup')
  return payload.userId
}

function newSupabase() {
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

async function signIn(email, password) {
  const sb = newSupabase()
  const r = await sb.auth.signInWithPassword({ email, password })
  if (r.error || !r.data.session) throw new Error(`signIn failed: ${r.error?.message ?? 'missing session'}`)
  return { sb, session: r.data.session }
}

function isoPlusMinutes(minutes) {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

const ownerEmail = `smoke.owner.${Date.now()}@trustbook.local`
const ownerPass = 'SmokeTest1234'
await adminSignup({ email: ownerEmail, password: ownerPass, role: 'attivita' })
const { sb: ownerSb, session: ownerSession } = await signIn(ownerEmail, ownerPass)

const ownerId = ownerSession.user.id

const staffUser1Email = `smoke.staff1.${Date.now()}@trustbook.local`
const staffUser2Email = `smoke.staff2.${Date.now()}@trustbook.local`
const staffPass = 'SmokeTest1234'
const staffUser1Id = await adminSignup({ email: staffUser1Email, password: staffPass, role: 'attivita' })
const staffUser2Id = await adminSignup({ email: staffUser2Email, password: staffPass, role: 'attivita' })

const biz = await ownerSb
  .from('businesses')
  .insert({
    owner_user_id: ownerId,
    name: `E2E Ristorante ${new Date().toISOString()}`,
    category: 'ristorante',
    description: 'E2E smoke floorplan/booking/ai',
    lat: 41.9028,
    lng: 12.4964,
    is_paused: false,
    allow_overbooking: false,
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
if (biz.error) throw new Error(`business insert failed: ${biz.error.message}`)
const businessId = biz.data.id

const staff1 = await ownerSb
  .from('team_members')
  .insert({
    business_id: businessId,
    user_id: staffUser1Id,
    role: 'staff',
    is_bookable: true,
    max_simultaneous_bookings: 1,
    color: '#ef4444',
  })
  .select('id')
  .single()
if (staff1.error) throw new Error(`staff1 insert failed: ${staff1.error.message}`)

const staff2 = await ownerSb
  .from('team_members')
  .insert({
    business_id: businessId,
    user_id: staffUser2Id,
    role: 'staff',
    is_bookable: true,
    max_simultaneous_bookings: 1,
    color: '#3b82f6',
  })
  .select('id')
  .single()
if (staff2.error) throw new Error(`staff2 insert failed: ${staff2.error.message}`)

const staffId1 = staff1.data.id
const staffId2 = staff2.data.id

const svc = await ownerSb
  .from('services')
  .insert({ business_id: businessId, name: 'Cena', duration_min: 45, price_cents: null, is_active: true })
  .select('id')
  .single()
if (svc.error) throw new Error(`services insert failed: ${svc.error.message}`)
const serviceId = svc.data.id

const windows = Array.from({ length: 7 }, (_, weekday) => ({
  business_id: businessId,
  weekday,
  start_time: '00:00',
  end_time: '23:59',
}))
const ow = await ownerSb.from('business_opening_windows').insert(windows)
if (ow.error) throw new Error(`opening windows insert failed: ${ow.error.message}`)

const eco1 = await ownerSb
  .from('business_booking_ecosystem')
  .update({
    resource_management_enabled: true,
    booking_vertical: 'hospitality_table',
    customer_table_choice: 'required',
    default_table_assignment_mode: 'customer_choice',
    ai_notes_enabled: true,
    ai_floor_plan_read_enabled: false,
    ai_table_assignment_enabled: false,
    ai_blocked_slots_enabled: false,
  })
  .eq('business_id', businessId)
  .select('business_id')
  .single()
if (eco1.error) throw new Error(`ecosystem update failed: ${eco1.error.message}`)

const floorPlanLayout = {
  version: 1,
  bounds: { width_px: 800, height_px: 500 },
  nodes: [],
}

const fp = await ownerSb.rpc('upsert_floor_plan', {
  p_business_id: businessId,
  p_floor_plan_id: null,
  p_name: 'Sala Principale',
  p_layout_json: floorPlanLayout,
  p_is_active: true,
})
if (fp.error) throw new Error(`upsert_floor_plan failed: ${fp.error.message}`)
const floorPlanId = fp.data

const t1 = await ownerSb.rpc('upsert_booking_resource', {
  p_business_id: businessId,
  p_resource_id: null,
  p_floor_plan_id: floorPlanId,
  p_kind: 'table',
  p_label: 'T1',
  p_capacity_min: 1,
  p_capacity_max: 2,
  p_position_json: { x: 0.1, y: 0.2 },
  p_metadata: { zone: 'sala' },
  p_is_active: true,
})
if (t1.error) throw new Error(`upsert_booking_resource T1 failed: ${t1.error.message}`)

const t2 = await ownerSb.rpc('upsert_booking_resource', {
  p_business_id: businessId,
  p_resource_id: null,
  p_floor_plan_id: floorPlanId,
  p_kind: 'table',
  p_label: 'T2',
  p_capacity_min: 2,
  p_capacity_max: 4,
  p_position_json: { x: 0.35, y: 0.2 },
  p_metadata: { zone: 'sala' },
  p_is_active: true,
})
if (t2.error) throw new Error(`upsert_booking_resource T2 failed: ${t2.error.message}`)

const table1Id = t1.data
const table2Id = t2.data

const customerEmail = `smoke.customer.${Date.now()}@trustbook.local`
const customerPass = 'SmokeTest1234'
await adminSignup({ email: customerEmail, password: customerPass, role: 'cliente' })
const { sb: customerSb } = await signIn(customerEmail, customerPass)

const startAt = isoPlusMinutes(120)
const endAt = isoPlusMinutes(165)

const avail = await customerSb.rpc('list_available_resources_for_slot', {
  p_business_id: businessId,
  p_service_id: serviceId,
  p_start_at: startAt,
  p_end_at: endAt,
  p_party_size: 2,
})
if (avail.error) throw new Error(`list_available_resources_for_slot failed: ${avail.error.message}`)
if (!Array.isArray(avail.data) || avail.data.length < 2) {
  throw new Error(`expected >=2 tables available, got ${JSON.stringify(avail.data)}`)
}

const b1 = await customerSb.rpc('create_booking_v3', {
  p_business_id: businessId,
  p_service_id: serviceId,
  p_start_at: startAt,
  p_end_at: endAt,
  p_staff_id: staffId1,
})
if (b1.error) throw new Error(`create_booking_v3 #1 failed: ${b1.error.message}`)
const booking1Id = b1.data.id

const asg1 = await customerSb.rpc('assign_table_to_booking', {
  p_booking_id: booking1Id,
  p_resource_id: table1Id,
  p_party_size: 2,
})
if (asg1.error) throw new Error(`assign_table_to_booking #1 failed: ${asg1.error.message}`)

const b2 = await customerSb.rpc('create_booking_v3', {
  p_business_id: businessId,
  p_service_id: serviceId,
  p_start_at: startAt,
  p_end_at: endAt,
  p_staff_id: staffId2,
})
if (b2.error) throw new Error(`create_booking_v3 #2 failed: ${b2.error.message}`)
const booking2Id = b2.data.id

const asg2 = await customerSb.rpc('assign_table_to_booking', {
  p_booking_id: booking2Id,
  p_resource_id: table1Id,
  p_party_size: 2,
})
if (!asg2.error) throw new Error('expected assign_table_to_booking #2 to fail (overlap), but succeeded')
if (!String(asg2.error.message || '').includes('resource_not_available')) {
  throw new Error(`expected resource_not_available, got: ${asg2.error.message}`)
}

const eco2 = await ownerSb
  .from('business_booking_ecosystem')
  .update({
    customer_table_choice: 'preferred',
    default_table_assignment_mode: 'auto',
  })
  .eq('business_id', businessId)
  .select('business_id')
  .single()
if (eco2.error) throw new Error(`ecosystem update #2 failed: ${eco2.error.message}`)

const b3SlotStart = isoPlusMinutes(240)
const b3SlotEnd = isoPlusMinutes(285)

const b3 = await customerSb.rpc('create_booking_v3_with_resource_assignment', {
  p_business_id: businessId,
  p_service_id: serviceId,
  p_start_at: b3SlotStart,
  p_end_at: b3SlotEnd,
  p_staff_id: staffId1,
  p_primary_resource_id: null,
  p_auto_assign_resource: true,
  p_party_size: 2,
})
if (b3.error)
  throw new Error(`create_booking_v3_with_resource_assignment (auto) failed: ${b3.error.message}`)
if (!b3.data || typeof b3.data !== 'object' || !b3.data.id) {
  throw new Error('create_booking_v3_with_resource_assignment returned no booking row')
}
const booking3Id = b3.data.id

const bra = await ownerSb
  .from('booking_resource_assignments')
  .select('primary_resource_id')
  .eq('booking_id', booking3Id)
  .maybeSingle()
if (bra.error) throw new Error(`booking_resource_assignments lookup failed: ${bra.error.message}`)
const assignedRes = bra.data?.primary_resource_id
if (assignedRes !== table1Id && assignedRes !== table2Id)
  throw new Error(`atomic auto assigned unexpected table: ${assignedRes}`)

const note = await ownerSb.rpc('upsert_business_operational_note', {
  p_business_id: businessId,
  p_note_id: null,
  p_title: 'Smoke note',
  p_body: 'Nota creata da smoke e2e',
  p_tags: ['smoke', 'e2e'],
  p_pinned: true,
  p_agent_id: 'smoke_e2e',
})
if (note.error) throw new Error(`upsert_business_operational_note failed: ${note.error.message}`)

const notes = await ownerSb.rpc('list_business_operational_notes', { p_business_id: businessId, p_limit: 10 })
if (notes.error) throw new Error(`list_business_operational_notes failed: ${notes.error.message}`)
if (!Array.isArray(notes.data) || notes.data.length < 1) throw new Error('expected >=1 note')

const del = await ownerSb.rpc('delete_business_operational_note', {
  p_business_id: businessId,
  p_note_id: note.data,
  p_agent_id: 'smoke_e2e',
})
if (del.error) throw new Error(`delete_business_operational_note failed: ${del.error.message}`)

const aiNo = await fetch(
  `${apiTarget}/api/ai-tools/floor-plan/bundle?businessId=${encodeURIComponent(businessId)}`,
  {
    headers: {
      Authorization: `Bearer ${ownerSession.access_token}`,
    },
  },
)
if (aiNo.status !== 403) throw new Error(`expected AI bundle 403 when scope OFF, got ${aiNo.status}`)

const eco3 = await ownerSb
  .from('business_booking_ecosystem')
  .update({ ai_floor_plan_read_enabled: true })
  .eq('business_id', businessId)
  .select('business_id')
  .single()
if (eco3.error) throw new Error(`ecosystem update #3 failed: ${eco3.error.message}`)

const aiYes = await fetch(
  `${apiTarget}/api/ai-tools/floor-plan/bundle?businessId=${encodeURIComponent(businessId)}`,
  {
    headers: {
      Authorization: `Bearer ${ownerSession.access_token}`,
    },
  },
)
if (!aiYes.ok) {
  const t = await aiYes.text().catch(() => '')
  throw new Error(`expected AI bundle 200 when scope ON, got ${aiYes.status}: ${t}`)
}

console.log({
  ok: true,
  businessId,
  floorPlanId,
  serviceId,
  created: {
    ownerEmail,
    customerEmail,
    staffUser1Email,
    staffUser2Email,
    staffId1,
    staffId2,
    table1Id,
    table2Id,
    booking1Id,
    booking2Id,
    booking3Id: b3.data.id,
  },
})
