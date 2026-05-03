import { Router, type Request, type Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { readEnvAny } from '../lib/env.js'

const router = Router()

function routeError(res: Response, e: unknown): void {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === 'string'
        ? e
        : typeof (e as { message?: unknown } | null | undefined)?.message === 'string'
          ? ((e as { message: string }).message ?? '')
          : ''
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

export default router
