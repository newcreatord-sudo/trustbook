import { Router, type Request, type Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { readEnvAny } from '../lib/env.js'
import { primaryRpcErrorMessage } from '../lib/supabaseRpcCoerce.js'
import { getBearerToken, runForfeitBookingDeposit } from '../lib/bookingDepositStripeAdmin.js'

const router = Router()

function safeErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e && typeof e === 'object' && 'message' in e) {
    const m = (e as { message?: unknown }).message
    if (typeof m === 'string') return m
  }
  return 'Unknown error'
}

function mustAuthedSupabase(req: Request) {
  const supabaseUrl = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const anonKey = readEnvAny(['SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON', 'anon_key'])
  const token = getBearerToken(req)
  if (!supabaseUrl || !anonKey || !token) return null
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

function readBookingId(req: Request): string | null {
  const bookingId = String(req.body?.bookingId ?? '').trim()
  return bookingId ? bookingId : null
}

function asUuid(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s) ? s : null
}

function readIsoDate(req: Request, key: string): string | null {
  const raw = String((req.body as Record<string, unknown> | null | undefined)?.[key] ?? '').trim()
  if (!raw) return null
  const d = new Date(raw)
  if (!Number.isFinite(d.getTime())) return null
  return d.toISOString()
}

router.post('/business/assign-resource', async (req: Request, res: Response) => {
  try {
    const bookingId = asUuid(req.body?.bookingId)
    const resourceId = asUuid(req.body?.resourceId)
    if (!bookingId || !resourceId) {
      res.status(400).json({ success: false, error: 'Missing bookingId/resourceId' })
      return
    }

    const partySize = typeof req.body?.partySize === 'number' ? Math.floor(req.body.partySize) : null
    const partySizeSafe = Number.isFinite(partySize as number) && (partySize as number) >= 1 ? (partySize as number) : null

    const sb = mustAuthedSupabase(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const { error: aErr } = await sb.rpc('assign_table_to_booking', { p_booking_id: bookingId, p_resource_id: resourceId })
    if (aErr) {
      const msg = primaryRpcErrorMessage(aErr) || safeErrorMessage(aErr)
      if (msg === 'not_authenticated') {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }
      if (msg === 'member_only' || msg === 'not_authorized') {
        res.status(403).json({ success: false, error: 'Forbidden' })
        return
      }
      if (msg === 'resource_not_available') {
        res.status(409).json({ success: false, error: msg })
        return
      }
      throw aErr
    }

    if (partySizeSafe !== null) {
      const { error: psErr } = await sb.rpc('set_booking_primary_resource', {
        p_booking_id: bookingId,
        p_resource_id: resourceId,
        p_party_size: partySizeSafe,
      })
      if (psErr) throw psErr
    }

    res.status(200).json({ success: true })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: safeErrorMessage(e) })
  }
})

router.post('/business/auto-assign-resource', async (req: Request, res: Response) => {
  try {
    const bookingId = asUuid(req.body?.bookingId)
    if (!bookingId) {
      res.status(400).json({ success: false, error: 'Missing bookingId' })
      return
    }

    const partySizeHint = typeof req.body?.partySizeHint === 'number' ? Math.floor(req.body.partySizeHint) : null
    const partySizeSafe =
      Number.isFinite(partySizeHint as number) && (partySizeHint as number) >= 1 ? (partySizeHint as number) : null

    const sb = mustAuthedSupabase(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const { data, error } = await sb.rpc('auto_assign_resource_for_booking', {
      p_booking_id: bookingId,
      p_party_size_hint: partySizeSafe,
    })
    if (error) {
      const msg = primaryRpcErrorMessage(error) || safeErrorMessage(error)
      if (msg === 'not_authenticated') {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }
      if (msg === 'member_only' || msg === 'not_authorized') {
        res.status(403).json({ success: false, error: 'Forbidden' })
        return
      }
      if (msg === 'resource_management_not_enabled' || msg === 'vertical_does_not_support_table_assignment') {
        res.status(409).json({ success: false, error: msg })
        return
      }
      throw error
    }

    res.status(200).json({ success: true, resourceId: (data as string | null) ?? null })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: safeErrorMessage(e) })
  }
})

router.post('/business/approve', async (req: Request, res: Response) => {
  try {
    const bookingId = readBookingId(req)
    if (!bookingId) {
      res.status(400).json({ success: false, error: 'Missing bookingId' })
      return
    }

    const sb = mustAuthedSupabase(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const { data, error } = await sb.rpc('business_approve_pending_booking', { p_booking_id: bookingId })
    if (error) {
      const msg = primaryRpcErrorMessage(error) || safeErrorMessage(error)
      if (msg === 'not_authenticated') {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }
      if (msg === 'member_only') {
        res.status(403).json({ success: false, error: 'Forbidden' })
        return
      }
      if (msg.endsWith('_not_allowed_for_status') || msg === 'invalid_transition_state') {
        res.status(409).json({ success: false, error: msg })
        return
      }
      throw error
    }

    res.status(200).json({ success: true, booking: data })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: safeErrorMessage(e) })
  }
})

router.post('/business/reject', async (req: Request, res: Response) => {
  try {
    const bookingId = readBookingId(req)
    if (!bookingId) {
      res.status(400).json({ success: false, error: 'Missing bookingId' })
      return
    }

    const reason = String(req.body?.reason ?? '').trim() || null

    const sb = mustAuthedSupabase(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const { data, error } = await sb.rpc('business_reject_pending_booking', {
      p_booking_id: bookingId,
      p_rejection_reason: reason,
    })
    if (error) {
      const msg = primaryRpcErrorMessage(error) || safeErrorMessage(error)
      if (msg === 'not_authenticated') {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }
      if (msg === 'member_only') {
        res.status(403).json({ success: false, error: 'Forbidden' })
        return
      }
      if (msg.endsWith('_not_allowed_for_status') || msg === 'invalid_transition_state') {
        res.status(409).json({ success: false, error: msg })
        return
      }
      throw error
    }

    res.status(200).json({ success: true, booking: data })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: safeErrorMessage(e) })
  }
})

router.post('/customer/propose-reschedule', async (req: Request, res: Response) => {
  try {
    const bookingId = readBookingId(req)
    if (!bookingId) {
      res.status(400).json({ success: false, error: 'Missing bookingId' })
      return
    }

    const newStartAt = readIsoDate(req, 'newStartAt')
    const newEndAt = readIsoDate(req, 'newEndAt')
    if (!newStartAt || !newEndAt) {
      res.status(400).json({ success: false, error: 'Missing newStartAt/newEndAt' })
      return
    }
    if (new Date(newStartAt).getTime() >= new Date(newEndAt).getTime()) {
      res.status(400).json({ success: false, error: 'Invalid time interval' })
      return
    }

    const message = String(req.body?.message ?? '').trim() || null

    const sb = mustAuthedSupabase(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const { data, error } = await sb.rpc('customer_propose_booking_reschedule', {
      p_booking_id: bookingId,
      p_new_start_at: newStartAt,
      p_new_end_at: newEndAt,
      p_message: message,
    })

    if (error) {
      const msg = primaryRpcErrorMessage(error) || safeErrorMessage(error)
      if (msg === 'not_authenticated') {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }
      if (msg === 'not_authorized' || msg === 'member_only') {
        res.status(403).json({ success: false, error: 'Forbidden' })
        return
      }
      if (msg.endsWith('_not_allowed_for_status') || msg === 'proposal_not_pending' || msg === 'invalid_booking_interval') {
        res.status(409).json({ success: false, error: msg })
        return
      }
      throw error
    }

    res.status(200).json({ success: true, booking: data })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: safeErrorMessage(e) })
  }
})

router.post('/business/propose-reschedule', async (req: Request, res: Response) => {
  try {
    const bookingId = readBookingId(req)
    if (!bookingId) {
      res.status(400).json({ success: false, error: 'Missing bookingId' })
      return
    }

    const newStartAt = readIsoDate(req, 'newStartAt')
    const newEndAt = readIsoDate(req, 'newEndAt')
    if (!newStartAt || !newEndAt) {
      res.status(400).json({ success: false, error: 'Missing newStartAt/newEndAt' })
      return
    }
    if (new Date(newStartAt).getTime() >= new Date(newEndAt).getTime()) {
      res.status(400).json({ success: false, error: 'Invalid time interval' })
      return
    }

    const message = String(req.body?.message ?? '').trim() || null

    const sb = mustAuthedSupabase(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const { data, error } = await sb.rpc('business_propose_booking_reschedule', {
      p_booking_id: bookingId,
      p_new_start_at: newStartAt,
      p_new_end_at: newEndAt,
      p_message: message,
    })

    if (error) {
      const msg = primaryRpcErrorMessage(error) || safeErrorMessage(error)
      if (msg === 'not_authenticated') {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }
      if (msg === 'member_only' || msg === 'not_authorized') {
        res.status(403).json({ success: false, error: 'Forbidden' })
        return
      }
      if (msg.endsWith('_not_allowed_for_status') || msg === 'proposal_not_pending') {
        res.status(409).json({ success: false, error: msg })
        return
      }
      throw error
    }

    res.status(200).json({ success: true, booking: data })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: safeErrorMessage(e) })
  }
})

router.post('/accept-time-proposal', async (req: Request, res: Response) => {
  try {
    const bookingId = readBookingId(req)
    if (!bookingId) {
      res.status(400).json({ success: false, error: 'Missing bookingId' })
      return
    }

    const sb = mustAuthedSupabase(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const { data, error } = await sb.rpc('accept_booking_time_proposal', { p_booking_id: bookingId })
    if (error) {
      const msg = primaryRpcErrorMessage(error) || safeErrorMessage(error)
      if (msg === 'not_authenticated') {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }
      if (msg === 'not_authorized' || msg === 'member_only') {
        res.status(403).json({ success: false, error: 'Forbidden' })
        return
      }
      if (msg === 'proposal_not_pending' || msg === 'proposal_actor_mismatch') {
        res.status(409).json({ success: false, error: msg })
        return
      }
      throw error
    }

    res.status(200).json({ success: true, booking: data })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: safeErrorMessage(e) })
  }
})

router.post('/reject-time-proposal', async (req: Request, res: Response) => {
  try {
    const bookingId = readBookingId(req)
    if (!bookingId) {
      res.status(400).json({ success: false, error: 'Missing bookingId' })
      return
    }

    const sb = mustAuthedSupabase(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const { data, error } = await sb.rpc('reject_booking_time_proposal', { p_booking_id: bookingId })
    if (error) {
      const msg = primaryRpcErrorMessage(error) || safeErrorMessage(error)
      if (msg === 'not_authenticated') {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }
      if (msg === 'not_authorized' || msg === 'member_only') {
        res.status(403).json({ success: false, error: 'Forbidden' })
        return
      }
      if (msg === 'proposal_not_pending' || msg === 'proposal_actor_mismatch') {
        res.status(409).json({ success: false, error: msg })
        return
      }
      throw error
    }

    res.status(200).json({ success: true, booking: data })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: safeErrorMessage(e) })
  }
})

router.post('/business/mark-no-show', async (req: Request, res: Response) => {
  try {
    const bookingId = readBookingId(req)
    if (!bookingId) {
      res.status(400).json({ success: false, error: 'Missing bookingId' })
      return
    }

    const forfeitDeposit = Boolean(req.body?.forfeitDeposit ?? false)

    const sb = mustAuthedSupabase(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const { data: b, error: bErr } = await sb
      .from('bookings')
      .select('id,status,deposit_status')
      .eq('id', bookingId)
      .maybeSingle()
    if (bErr) throw bErr
    if (!b) {
      res.status(404).json({ success: false, error: 'Booking not found' })
      return
    }

    const row = b as { id: string; status: string; deposit_status: string }
    if (row.status === 'no_show') {
      res.status(200).json({ success: true, booking: row, deposit: null })
      return
    }
    if (row.status !== 'confirmed') {
      res.status(409).json({ success: false, error: 'invalid_transition_state' })
      return
    }

    const nextDepositStatus = row.deposit_status === 'paid' ? 'forfeited' : row.deposit_status

    const { data: next, error } = await sb.rpc('transition_booking_state', {
      p_booking_id: bookingId,
      p_next_status: 'no_show',
      p_next_deposit_status: nextDepositStatus,
      p_require_current_status: 'confirmed',
    })
    if (error) {
      const msg = primaryRpcErrorMessage(error) || safeErrorMessage(error)
      if (msg === 'invalid_transition_state') {
        res.status(409).json({ success: false, error: msg })
        return
      }
      if (msg === 'unauthorized_status_transition' || msg === 'not_authenticated') {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }
      if (msg === 'member_only') {
        res.status(403).json({ success: false, error: 'Forbidden' })
        return
      }
      throw error
    }

    const deposit = forfeitDeposit && nextDepositStatus === 'forfeited' ? await runForfeitBookingDeposit(req, bookingId) : null
    res.status(200).json({ success: true, booking: next, deposit })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: safeErrorMessage(e) })
  }
})

router.post('/business/mark-completed', async (req: Request, res: Response) => {
  try {
    const bookingId = readBookingId(req)
    if (!bookingId) {
      res.status(400).json({ success: false, error: 'Missing bookingId' })
      return
    }

    const sb = mustAuthedSupabase(req)
    if (!sb) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const { data: b, error: bErr } = await sb
      .from('bookings')
      .select('id,status')
      .eq('id', bookingId)
      .maybeSingle()
    if (bErr) throw bErr
    if (!b) {
      res.status(404).json({ success: false, error: 'Booking not found' })
      return
    }

    const row = b as { id: string; status: string }
    if (row.status === 'completed') {
      res.status(200).json({ success: true, booking: row })
      return
    }
    if (row.status !== 'confirmed') {
      res.status(409).json({ success: false, error: 'invalid_transition_state' })
      return
    }

    const { data: next, error } = await sb.rpc('transition_booking_state', {
      p_booking_id: bookingId,
      p_next_status: 'completed',
      p_require_current_status: 'confirmed',
    })
    if (error) {
      const msg = primaryRpcErrorMessage(error) || safeErrorMessage(error)
      if (msg === 'invalid_transition_state') {
        res.status(409).json({ success: false, error: msg })
        return
      }
      if (msg === 'unauthorized_status_transition' || msg === 'not_authenticated') {
        res.status(401).json({ success: false, error: 'Unauthorized' })
        return
      }
      if (msg === 'member_only') {
        res.status(403).json({ success: false, error: 'Forbidden' })
        return
      }
      throw error
    }

    res.status(200).json({ success: true, booking: next })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: safeErrorMessage(e) })
  }
})

export default router
