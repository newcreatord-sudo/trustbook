import { Router, type Request, type Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { readEnvAny } from '../lib/env.js'
import { coerceRpcJsonbArray, primaryRpcErrorMessage } from '../lib/supabaseRpcCoerce.js'
import { runCancelBookingByBusiness, runForfeitBookingDeposit } from '../lib/bookingDepositStripeAdmin.js'

const router = Router()

function routeError(res: Response, e: unknown): void {
  const msg = primaryRpcErrorMessage(e)
  if (!msg) {
    res.status(502).json({ success: false, error: 'Service error' })
    return
  }

  if (msg === 'not_authenticated') {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }

  if (msg === 'owner_only' || msg === 'member_only') {
    res.status(403).json({ success: false, error: msg })
    return
  }

  if (/^ai_.*_disabled$/i.test(msg)) {
    res.status(403).json({ success: false, error: msg })
    return
  }

  if (msg === 'invalid_time_range' || msg === 'agent_id_required') {
    res.status(400).json({ success: false, error: msg })
    return
  }

  if (msg === 'booking_not_found') {
    res.status(404).json({ success: false, error: msg })
    return
  }

  res.status(502).json({ success: false, error: msg })
}

function getBearerToken(req: Request): string | null {
  const h = req.header('authorization') || req.header('Authorization')
  if (!h) return null
  const m = /^Bearer\s+(.+)$/i.exec(h)
  return m?.[1]?.trim() ?? null
}

function mustSupabaseUser(req: Request) {
  const supabaseUrl = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const anonKey = readEnvAny(['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON', 'anon_key'])
  const token = getBearerToken(req)
  if (!supabaseUrl || !anonKey || !token) return null
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

function asUuid(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s) ? s : null
}

function parseStatusesQuery(q: unknown): string[] | null {
  if (typeof q !== 'string' || !q.trim()) return null
  const parts = q
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length ? parts : null
}

function parseLimitQuery(q: unknown, fallback: number): number {
  if (typeof q !== 'string') return fallback
  const n = Number(q)
  return Number.isFinite(n) ? n : fallback
}

function asDate(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

/** Default director agent id; empty string in API falls back to TrustBook default. */
function directorAgentIdFromQuery(q: unknown): string {
  if (typeof q !== 'string') return 'trustbook_director_ai'
  const s = q.trim().slice(0, 80)
  return s.length > 0 ? s : 'trustbook_director_ai'
}

function directorAgentIdFromBody(body: unknown): string {
  if (typeof body !== 'object' || body === null) return 'trustbook_director_ai'
  const raw = (body as { agentId?: unknown }).agentId
  if (typeof raw !== 'string') return 'trustbook_director_ai'
  const s = raw.trim().slice(0, 80)
  return s.length > 0 ? s : 'trustbook_director_ai'
}

router.get('/notes', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.query?.businessId)
    if (!businessId) {
      res.status(400).json({ success: false, error: 'Missing businessId' })
      return
    }

    const limit = typeof req.query?.limit === 'string' ? Number(req.query.limit) : 50
    const { data, error } = await sb.rpc('list_business_operational_notes', {
      p_business_id: businessId,
      p_limit: Number.isFinite(limit) ? limit : 50,
    })
    if (error) throw error
    res.status(200).json({ success: true, rows: data ?? [] })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.post('/notes/upsert', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.body?.businessId)
    if (!businessId) {
      res.status(400).json({ success: false, error: 'Missing businessId' })
      return
    }

    const noteId = req.body?.noteId ? asUuid(req.body.noteId) : null
    const title = typeof req.body?.title === 'string' ? req.body.title.trim().slice(0, 120) : null
    const body = typeof req.body?.body === 'string' ? req.body.body.slice(0, 8000) : ''
    const tagsRaw = Array.isArray(req.body?.tags) ? req.body.tags : []
    const tags = tagsRaw.filter((x: unknown): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean).slice(0, 12)
    const pinned = Boolean(req.body?.pinned)
    const agentId = typeof req.body?.agentId === 'string' ? req.body.agentId.trim().slice(0, 80) : 'trustbook_director_ai'

    const { data, error } = await sb.rpc('upsert_business_operational_note', {
      p_business_id: businessId,
      p_note_id: noteId,
      p_title: title,
      p_body: body,
      p_tags: tags,
      p_pinned: pinned,
      p_agent_id: agentId,
    })
    if (error) throw error
    res.status(200).json({ success: true, id: data })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.post('/notes/delete', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.body?.businessId)
    const noteId = asUuid(req.body?.noteId)
    if (!businessId || !noteId) {
      res.status(400).json({ success: false, error: 'Missing businessId/noteId' })
      return
    }
    const agentId = typeof req.body?.agentId === 'string' ? req.body.agentId.trim().slice(0, 80) : 'trustbook_director_ai'

    const { error } = await sb.rpc('delete_business_operational_note', {
      p_business_id: businessId,
      p_note_id: noteId,
      p_agent_id: agentId,
    })
    if (error) throw error
    res.status(200).json({ success: true })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.get('/floor-plan/bundle', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.query?.businessId)
    if (!businessId) {
      res.status(400).json({ success: false, error: 'Missing businessId' })
      return
    }
    const floorPlanId = req.query?.floorPlanId ? asUuid(req.query.floorPlanId) : null
    const agentId = typeof req.query?.agentId === 'string' ? req.query.agentId.trim().slice(0, 80) : 'trustbook_director_ai'

    const { data, error } = await sb.rpc('ai_get_floor_plan_bundle', {
      p_business_id: businessId,
      p_floor_plan_id: floorPlanId,
      p_agent_id: agentId,
    })
    if (error) throw error
    res.status(200).json({ success: true, rows: data ?? [] })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.get('/tables/available', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.query?.businessId)
    const serviceId = asUuid(req.query?.serviceId)
    const startAt = typeof req.query?.startAt === 'string' ? req.query.startAt.trim() : ''
    const endAt = typeof req.query?.endAt === 'string' ? req.query.endAt.trim() : ''
    if (!businessId || !serviceId || !startAt || !endAt) {
      res.status(400).json({ success: false, error: 'Missing businessId/serviceId/startAt/endAt' })
      return
    }
    const partySize = typeof req.query?.partySize === 'string' ? Number(req.query.partySize) : null
    const agentId = typeof req.query?.agentId === 'string' ? req.query.agentId.trim().slice(0, 80) : 'trustbook_director_ai'

    const { data, error } = await sb.rpc('ai_list_available_tables_for_slot', {
      p_business_id: businessId,
      p_service_id: serviceId,
      p_start_at: startAt,
      p_end_at: endAt,
      p_party_size: Number.isFinite(partySize as number) ? partySize : null,
      p_agent_id: agentId,
    })
    if (error) throw error
    res.status(200).json({ success: true, rows: data ?? [] })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.post('/booking/assign-table', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.body?.businessId)
    const bookingId = asUuid(req.body?.bookingId)
    const resourceId = asUuid(req.body?.resourceId)
    if (!businessId || !bookingId || !resourceId) {
      res.status(400).json({ success: false, error: 'Missing businessId/bookingId/resourceId' })
      return
    }
    const partySizeHint = typeof req.body?.partySizeHint === 'number' ? Math.floor(req.body.partySizeHint) : null
    const agentId = typeof req.body?.agentId === 'string' ? req.body.agentId.trim().slice(0, 80) : 'trustbook_director_ai'

    const { error } = await sb.rpc('ai_assign_table_to_booking', {
      p_business_id: businessId,
      p_booking_id: bookingId,
      p_resource_id: resourceId,
      p_party_size_hint: partySizeHint,
      p_agent_id: agentId,
    })
    if (error) throw error
    res.status(200).json({ success: true })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.post('/booking/auto-assign-table', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.body?.businessId)
    const bookingId = asUuid(req.body?.bookingId)
    if (!businessId || !bookingId) {
      res.status(400).json({ success: false, error: 'Missing businessId/bookingId' })
      return
    }
    const partySizeHint = typeof req.body?.partySizeHint === 'number' ? Math.floor(req.body.partySizeHint) : null
    const agentId = typeof req.body?.agentId === 'string' ? req.body.agentId.trim().slice(0, 80) : 'trustbook_director_ai'

    const { data, error } = await sb.rpc('ai_auto_assign_table_for_booking', {
      p_business_id: businessId,
      p_booking_id: bookingId,
      p_party_size_hint: partySizeHint,
      p_agent_id: agentId,
    })
    if (error) throw error
    res.status(200).json({ success: true, resourceId: data ?? null })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.post('/blocked-slots/upsert', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.body?.businessId)
    const staffId = req.body?.staffId ? asUuid(req.body.staffId) : null
    const startAt = typeof req.body?.startAt === 'string' ? req.body.startAt.trim() : ''
    const endAt = typeof req.body?.endAt === 'string' ? req.body.endAt.trim() : ''
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : ''
    if (!businessId || !startAt || !endAt || !reason) {
      res.status(400).json({ success: false, error: 'Missing businessId/startAt/endAt/reason' })
      return
    }
    const agentId = typeof req.body?.agentId === 'string' ? req.body.agentId.trim().slice(0, 80) : 'trustbook_director_ai'

    const { data, error } = await sb.rpc('ai_upsert_blocked_slot', {
      p_business_id: businessId,
      p_staff_id: staffId,
      p_start_at: startAt,
      p_end_at: endAt,
      p_reason: reason,
      p_agent_id: agentId,
    })
    if (error) throw error
    res.status(200).json({ success: true, id: data })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.post('/blocked-slots/delete', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.body?.businessId)
    const blockedSlotId = asUuid(req.body?.blockedSlotId)
    if (!businessId || !blockedSlotId) {
      res.status(400).json({ success: false, error: 'Missing businessId/blockedSlotId' })
      return
    }
    const agentId = typeof req.body?.agentId === 'string' ? req.body.agentId.trim().slice(0, 80) : 'trustbook_director_ai'

    const { error } = await sb.rpc('ai_delete_blocked_slot', {
      p_business_id: businessId,
      p_blocked_slot_id: blockedSlotId,
      p_agent_id: agentId,
    })
    if (error) throw error
    res.status(200).json({ success: true })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.get('/bookings/list', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.query?.businessId)
    const fromAt = typeof req.query?.from === 'string' ? req.query.from.trim() : ''
    const toAt = typeof req.query?.to === 'string' ? req.query.to.trim() : ''
    if (!businessId || !fromAt || !toAt) {
      res.status(400).json({ success: false, error: 'Missing businessId/from/to' })
      return
    }
    const limit = parseLimitQuery(req.query?.limit, 100)
    const statuses = parseStatusesQuery(req.query?.statuses)
    const agentId = directorAgentIdFromQuery(req.query?.agentId)

    const { data, error } = await sb.rpc('ai_list_business_bookings', {
      p_business_id: businessId,
      p_from: fromAt,
      p_to: toAt,
      p_limit: limit,
      p_statuses: statuses,
      p_agent_id: agentId,
    })
    if (error) throw error
    res.status(200).json({ success: true, rows: data ?? [] })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.get('/bookings/detail', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.query?.businessId)
    const bookingId = asUuid(req.query?.bookingId)
    if (!businessId || !bookingId) {
      res.status(400).json({ success: false, error: 'Missing businessId/bookingId' })
      return
    }
    const agentId = directorAgentIdFromQuery(req.query?.agentId)

    const { data, error } = await sb.rpc('ai_get_business_booking', {
      p_business_id: businessId,
      p_booking_id: bookingId,
      p_agent_id: agentId,
    })
    if (error) throw error
    res.status(200).json({ success: true, booking: data ?? null })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.get('/bookings/payments', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.query?.businessId)
    if (!businessId) {
      res.status(400).json({ success: false, error: 'Missing businessId' })
      return
    }
    const limit = parseLimitQuery(req.query?.limit, 100)
    const agentId = directorAgentIdFromQuery(req.query?.agentId)

    const { data, error } = await sb.rpc('ai_list_business_booking_payments', {
      p_business_id: businessId,
      p_limit: limit,
      p_agent_id: agentId,
    })
    if (error) throw error
    const rows = coerceRpcJsonbArray(data)
    res.status(200).json({ success: true, rows })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.get('/day-summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.query?.businessId)
    const day = asDate(req.query?.day)
    if (!businessId || !day) {
      res.status(400).json({ success: false, error: 'Missing businessId/day' })
      return
    }
    const agentId = directorAgentIdFromQuery(req.query?.agentId)

    const { data, error } = await sb.rpc('ai_get_business_day_summary', {
      p_business_id: businessId,
      p_day: day,
      p_agent_id: agentId,
    })
    if (error) throw error
    res.status(200).json({ success: true, summary: data ?? null })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.get('/slots/bookable', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.query?.businessId)
    const serviceId = asUuid(req.query?.serviceId)
    const on = asDate(req.query?.on)
    if (!businessId || !serviceId || !on) {
      res.status(400).json({ success: false, error: 'Missing businessId/serviceId/on' })
      return
    }
    const staffId = req.query?.staffId ? asUuid(req.query.staffId) : null
    const agentId = directorAgentIdFromQuery(req.query?.agentId)

    const { data, error } = await sb.rpc('ai_list_bookable_slots_for_service_day', {
      p_business_id: businessId,
      p_service_id: serviceId,
      p_on: on,
      p_staff_id: staffId,
      p_agent_id: agentId,
    })
    if (error) throw error
    const rows = coerceRpcJsonbArray(data)
    res.status(200).json({ success: true, rows })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.post('/bookings/approve', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.body?.businessId)
    const bookingId = asUuid(req.body?.bookingId)
    if (!businessId || !bookingId) {
      res.status(400).json({ success: false, error: 'Missing businessId/bookingId' })
      return
    }
    const agentId = directorAgentIdFromBody(req.body)

    const { data, error } = await sb.rpc('ai_approve_booking_request', {
      p_business_id: businessId,
      p_booking_id: bookingId,
      p_agent_id: agentId,
    })
    if (error) throw error
    res.status(200).json({ success: true, booking: data ?? null })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.post('/bookings/reject', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.body?.businessId)
    const bookingId = asUuid(req.body?.bookingId)
    if (!businessId || !bookingId) {
      res.status(400).json({ success: false, error: 'Missing businessId/bookingId' })
      return
    }
    const reasonRaw = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 2000) : ''
    const reason = reasonRaw.length > 0 ? reasonRaw : null
    const agentId = directorAgentIdFromBody(req.body)

    const { data, error } = await sb.rpc('ai_reject_booking_request', {
      p_business_id: businessId,
      p_booking_id: bookingId,
      p_rejection_reason: reason,
      p_agent_id: agentId,
    })
    if (error) throw error
    res.status(200).json({ success: true, booking: data ?? null })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.post('/bookings/reschedule-apply', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.body?.businessId)
    const bookingId = asUuid(req.body?.bookingId)
    const newStart = typeof req.body?.newStartAt === 'string' ? req.body.newStartAt.trim() : ''
    const newEnd = typeof req.body?.newEndAt === 'string' ? req.body.newEndAt.trim() : ''
    if (!businessId || !bookingId || !newStart || !newEnd) {
      res.status(400).json({ success: false, error: 'Missing businessId/bookingId/newStartAt/newEndAt' })
      return
    }
    const agentId = directorAgentIdFromBody(req.body)

    const { data, error } = await sb.rpc('ai_apply_booking_reschedule', {
      p_business_id: businessId,
      p_booking_id: bookingId,
      p_new_start_at: newStart,
      p_new_end_at: newEnd,
      p_agent_id: agentId,
    })
    if (error) throw error
    res.status(200).json({ success: true, booking: data ?? null })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.post('/bookings/propose-reschedule', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.body?.businessId)
    const bookingId = asUuid(req.body?.bookingId)
    const newStart = typeof req.body?.newStartAt === 'string' ? req.body.newStartAt.trim() : ''
    const newEnd = typeof req.body?.newEndAt === 'string' ? req.body.newEndAt.trim() : ''
    const message = typeof req.body?.message === 'string' ? req.body.message.trim().slice(0, 2000) : null
    if (!businessId || !bookingId || !newStart || !newEnd) {
      res.status(400).json({ success: false, error: 'Missing businessId/bookingId/newStartAt/newEndAt' })
      return
    }
    const agentId = directorAgentIdFromBody(req.body)

    const { data, error } = await sb.rpc('ai_propose_booking_reschedule', {
      p_business_id: businessId,
      p_booking_id: bookingId,
      p_new_start_at: newStart,
      p_new_end_at: newEnd,
      p_message: message,
      p_agent_id: agentId,
    })
    if (error) throw error
    res.status(200).json({ success: true, booking: data ?? null })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.post('/bookings/accept-time-proposal', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.body?.businessId)
    const bookingId = asUuid(req.body?.bookingId)
    if (!businessId || !bookingId) {
      res.status(400).json({ success: false, error: 'Missing businessId/bookingId' })
      return
    }
    const agentId = directorAgentIdFromBody(req.body)

    const { data, error } = await sb.rpc('ai_accept_booking_time_proposal', {
      p_business_id: businessId,
      p_booking_id: bookingId,
      p_agent_id: agentId,
    })
    if (error) throw error
    res.status(200).json({ success: true, booking: data ?? null })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.post('/bookings/reject-time-proposal', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.body?.businessId)
    const bookingId = asUuid(req.body?.bookingId)
    if (!businessId || !bookingId) {
      res.status(400).json({ success: false, error: 'Missing businessId/bookingId' })
      return
    }
    const agentId = directorAgentIdFromBody(req.body)

    const { data, error } = await sb.rpc('ai_reject_booking_time_proposal', {
      p_business_id: businessId,
      p_booking_id: bookingId,
      p_agent_id: agentId,
    })
    if (error) throw error
    res.status(200).json({ success: true, booking: data ?? null })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.post('/bookings/mark-completed', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.body?.businessId)
    const bookingId = asUuid(req.body?.bookingId)
    if (!businessId || !bookingId) {
      res.status(400).json({ success: false, error: 'Missing businessId/bookingId' })
      return
    }
    const agentId = directorAgentIdFromBody(req.body)

    const { data, error } = await sb.rpc('ai_complete_booking', {
      p_business_id: businessId,
      p_booking_id: bookingId,
      p_agent_id: agentId,
    })
    if (error) throw error
    res.status(200).json({ success: true, booking: data ?? null })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.post('/bookings/mark-no-show', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const businessId = asUuid(req.body?.businessId)
    const bookingId = asUuid(req.body?.bookingId)
    if (!businessId || !bookingId) {
      res.status(400).json({ success: false, error: 'Missing businessId/bookingId' })
      return
    }
    const agentId = directorAgentIdFromBody(req.body)

    const { data, error } = await sb.rpc('ai_mark_booking_no_show', {
      p_business_id: businessId,
      p_booking_id: bookingId,
      p_agent_id: agentId,
    })
    if (error) throw error
    try {
      await runForfeitBookingDeposit(req, bookingId)
    } catch (e: unknown) {
      routeError(res, e)
      return
    }
    res.status(200).json({ success: true, booking: data ?? null })
  } catch (e: unknown) {
    routeError(res, e)
  }
})

router.post('/bookings/cancel-by-business', async (req: Request, res: Response): Promise<void> => {
  try {
    const sb = mustSupabaseUser(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const { data: u, error: ue } = await sb.auth.getUser()
    if (ue || !u.user) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const bookingId = asUuid(req.body?.bookingId)
    if (!bookingId) {
      res.status(400).json({ success: false, error: 'Missing bookingId' })
      return
    }

    try {
      const out = await runCancelBookingByBusiness(req, bookingId)
      res.status(200).json({ success: true, ...out })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : ''
      if (msg === 'Unauthorized') {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }
      if (msg === 'Forbidden') {
        res.status(403).json({ success: false, error: 'Forbidden' })
        return
      }
      if (msg === 'Booking not found') {
        res.status(404).json({ success: false, error: msg })
        return
      }
      if (msg === 'Refund requires payments to be enabled') {
        res.status(503).json({ success: false, error: msg })
        return
      }
      if (msg.includes('Missing payment reference')) {
        res.status(409).json({ success: false, error: msg })
        return
      }
      routeError(res, e)
    }
  } catch (e: unknown) {
    routeError(res, e)
  }
})

export default router
