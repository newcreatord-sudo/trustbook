import { Router, type Request, type Response } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { readEnvAny } from '../lib/env.js'

const router = Router()

function readAdminToken(req: Request): string | null {
  const h = req.header('x-admin-signup-token') || req.header('X-Admin-Signup-Token')
  if (!h) return null
  const s = String(h).trim()
  return s || null
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function asDateOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  const d = new Date(s)
  if (Number.isNaN(d.valueOf())) return null
  return d.toISOString()
}

function mustSupabaseAdmin() {
  const supabaseUrl = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const serviceRoleKey = readEnvAny([
    'SUPABASE_SERVICE_ROLE_KEY',
    'SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_KEY',
    'service_role',
    'SERVICE_ROLE',
  ])
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

router.post('/admin/fee-override/upsert', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = readAdminToken(req)
    const expected = readEnvAny(['AUTH_ADMIN_SIGNUP_TOKEN', 'ADMIN_SIGNUP_TOKEN'])
    if (!token || !expected) {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }
    if (
      token.length !== expected.length ||
      !timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(expected, 'utf8'))
    ) {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }

    const businessId = String(req.body?.businessId ?? '').trim()
    if (!businessId || !isUuid(businessId)) {
      res.status(400).json({ success: false, error: 'Invalid businessId' })
      return
    }

    const percentMin = asNumber(req.body?.percentMin)
    const percentMax = asNumber(req.body?.percentMax)
    const percentDefault = asNumber(req.body?.percentDefault)
    const fixedCents = asNumber(req.body?.fixedCents) ?? 0
    if (percentMin === null || percentMax === null || percentDefault === null) {
      res.status(400).json({ success: false, error: 'Missing percentMin/percentMax/percentDefault' })
      return
    }

    const min = Math.max(0, percentMin)
    const max = Math.max(0, percentMax)
    if (max < min) {
      res.status(400).json({ success: false, error: 'percentMax must be >= percentMin' })
      return
    }
    const def = Math.max(min, Math.min(max, percentDefault))
    const fixed = Math.max(0, Math.floor(fixedCents))

    const startsAt = asDateOrNull(req.body?.startsAt)
    const endsAt = asDateOrNull(req.body?.endsAt)
    const noteRaw = typeof req.body?.note === 'string' ? req.body.note.trim() : ''
    const note = noteRaw ? noteRaw.slice(0, 500) : null

    const sbAdmin = mustSupabaseAdmin()
    const { data, error } = await sbAdmin
      .from('business_platform_fee_overrides')
      .upsert(
        {
          business_id: businessId,
          percent_min: min,
          percent_max: max,
          percent_default: def,
          fixed_cents: fixed,
          starts_at: startsAt,
          ends_at: endsAt,
          note,
        },
        { onConflict: 'business_id' },
      )
      .select('*')
      .single()

    if (error) throw error
    res.status(200).json({ success: true, row: data })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'Service error' })
  }
})

router.post('/admin/fee-override/delete', async (req: Request, res: Response): Promise<void> => {
  try {
    const token = readAdminToken(req)
    const expected = readEnvAny(['AUTH_ADMIN_SIGNUP_TOKEN', 'ADMIN_SIGNUP_TOKEN'])
    if (!token || !expected) {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }
    if (
      token.length !== expected.length ||
      !timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(expected, 'utf8'))
    ) {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }

    const businessId = String(req.body?.businessId ?? '').trim()
    if (!businessId || !isUuid(businessId)) {
      res.status(400).json({ success: false, error: 'Invalid businessId' })
      return
    }

    const sbAdmin = mustSupabaseAdmin()
    const { error } = await sbAdmin.from('business_platform_fee_overrides').delete().eq('business_id', businessId)
    if (error) throw error
    res.status(200).json({ success: true })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'Service error' })
  }
})

export default router

