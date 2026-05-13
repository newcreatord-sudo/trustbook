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

