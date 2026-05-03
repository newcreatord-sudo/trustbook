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

const ownerEmail = `smoke.owner.${Date.now()}@trustbook.local`
const staffEmail = `smoke.staff.${Date.now()}@trustbook.local`
const pass = 'SmokeTest1234'
await adminSignup({ email: ownerEmail, password: pass, role: 'attivita' })
await adminSignup({ email: staffEmail, password: pass, role: 'attivita' })

const { sb: ownerSb } = await signIn(ownerEmail, pass)

const { data: biz, error: bizErr } = await ownerSb.rpc('create_business_with_defaults', {
  p_input: {
    name: `Onboarding RPC ${new Date().toISOString()}`,
    category: 'ristorante',
    description: 'smoke onboarding rpc',
    addressText: 'Via Smoke 1',
    postalCode: '00100',
    city: 'Roma',
    phone: '',
    email: '',
    website: '',
    lat: 41.9028,
    lng: 12.4964,
    logoUrl: '',
    galleryUrls: [],
    isPaused: false,
    minGapMin: 0,
    approvalMode: 'auto',
    requiredReliabilityMin: 0,
    cancellationWindowMin: 0,
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
    services: [{ name: 'Cena', durationMin: 60, priceCents: null }],
    schedule: { 5: [{ start: '19:00', end: '23:00' }] },
    staffEmails: [],
  },
})
if (bizErr) throw new Error(`create_business_with_defaults failed: ${bizErr.message}`)

const businessId = biz.id

const { data: tmId, error: tmErr } = await ownerSb.rpc('business_add_staff_by_email', {
  p_business_id: businessId,
  p_email: staffEmail,
})
if (tmErr) throw new Error(`business_add_staff_by_email failed: ${tmErr.message}`)

const { data: tmRows, error: tmSelErr } = await ownerSb
  .from('team_members')
  .select('id,user_id,role')
  .eq('business_id', businessId)
  .eq('id', tmId)
  .limit(1)
if (tmSelErr) throw new Error(`team_members select failed: ${tmSelErr.message}`)

process.stdout.write(
  JSON.stringify(
    {
      ok: true,
      businessId,
      ownerEmail,
      staffEmail,
      teamMember: tmRows?.[0] ?? null,
    },
    null,
    2,
  ) + '\n',
)

