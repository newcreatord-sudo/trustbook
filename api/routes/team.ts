import { Router, type Request, type Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { readEnvAny } from '../lib/env.js'

const router = Router()

function bearer(req: Request): string | null {
  const h = req.header('authorization') || req.header('Authorization')
  if (!h) return null
  const m = /^Bearer\s+(.+)$/.exec(h)
  return m?.[1]?.trim() || null
}

router.post('/resolve-user', async (req: Request, res: Response): Promise<void> => {
  try {
    const supabaseUrl = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
    const serviceRoleKey = readEnvAny([
      'SUPABASE_SERVICE_ROLE_KEY',
      'SERVICE_ROLE_KEY',
      'SUPABASE_SERVICE_KEY',
      'service_role',
      'SERVICE_ROLE',
    ])
    if (!supabaseUrl || !serviceRoleKey) {
      res.status(500).json({ success: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
      return
    }

    const token = bearer(req)
    if (!token) {
      res.status(401).json({ success: false, error: 'Missing Authorization Bearer token' })
      return
    }

    const businessId = String(req.body?.businessId ?? '').trim()
    const email = String(req.body?.email ?? '').trim().toLowerCase()
    if (!businessId || !email || !email.includes('@')) {
      res.status(400).json({ success: false, error: 'Invalid businessId or email' })
      return
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })

    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token)
    if (authErr || !authData.user) {
      res.status(401).json({ success: false, error: 'Invalid session token' })
      return
    }

    const uid = authData.user.id
    const { data: owned, error: ownedErr } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .eq('owner_user_id', uid)
      .maybeSingle()
    if (ownedErr) {
      res.status(502).json({ success: false, error: ownedErr.message })
      return
    }
    if (!owned) {
      res.status(403).json({ success: false, error: 'Not allowed' })
      return
    }

    const { data: userIdResult, error } = await supabaseAdmin.rpc('get_user_id_by_email', { p_email: email })
    if (error) {
      res.status(502).json({ success: false, error: error.message })
      return
    }

    if (!userIdResult) {
      res.status(404).json({ success: false, error: 'Utente non trovato' })
      return
    }

    res.status(200).json({ success: true, userId: userIdResult })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Service is unavailable'
    res.status(502).json({ success: false, error: msg })
  }
})

export default router

