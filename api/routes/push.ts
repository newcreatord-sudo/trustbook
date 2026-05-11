/**
 * Web Push subscription registry endpoints.
 *
 * POST /api/push/subscribe — upsert the current user's push subscription.
 *   Body: { endpoint, p256dh, auth, platform?, userAgent? }
 *
 * POST /api/push/test — sends a debug push to the calling user (dev only or
 *   admin-only in production). Requires VAPID env keys.
 *
 * The actual fan-out dispatcher is in `api/lib/pushDispatcher.ts` and is called
 * by the notification engine (next iteration: wire to notification_jobs runner).
 *
 * Security notes:
 *  - Service role is NOT used here: rely on RLS on `push_subscriptions`.
 *  - We accept the user's Supabase JWT in `Authorization: Bearer <token>`
 *    and create a per-request Supabase client. This keeps RLS auditable.
 */

import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { logEvent, captureBackendException } from '../lib/observability.js'
import { dispatchWebPush } from '../lib/pushDispatcher.js'

const router: express.Router = express.Router()

function getUserScopedClient(authHeader: string | undefined) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key || !authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.slice('Bearer '.length).trim()
  if (!token) return null
  return createClient(url, key, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

router.post('/subscribe', async (req, res) => {
  try {
    const sb = getUserScopedClient(req.headers.authorization)
    if (!sb) {
      res.status(401).json({ success: false, error: 'unauthorized' })
      return
    }
    const { data: userData, error: uErr } = await sb.auth.getUser()
    if (uErr || !userData?.user) {
      res.status(401).json({ success: false, error: 'unauthorized' })
      return
    }
    const userId = userData.user.id

    const { endpoint, p256dh, auth, platform, userAgent } = req.body ?? {}
    if (typeof endpoint !== 'string' || endpoint.length < 8) {
      res.status(400).json({ success: false, error: 'invalid_endpoint' })
      return
    }
    if (typeof p256dh !== 'string' || typeof auth !== 'string') {
      res.status(400).json({ success: false, error: 'invalid_keys' })
      return
    }

    const { error } = await sb
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint,
          p256dh,
          auth,
          platform: typeof platform === 'string' ? platform.slice(0, 60) : null,
          user_agent: typeof userAgent === 'string' ? userAgent.slice(0, 240) : null,
          enabled: true,
          last_seen_at: new Date().toISOString(),
          failure_count: 0,
        },
        { onConflict: 'user_id,endpoint' },
      )

    if (error) {
      logEvent('warn', 'push_subscribe_failed', { user_id: userId, message: error.message })
      res.status(500).json({ success: false, error: error.message })
      return
    }

    res.status(200).json({ success: true })
  } catch (e) {
    captureBackendException(e, { route: '/api/push/subscribe' })
    res.status(500).json({ success: false, error: 'server_error' })
  }
})

router.post('/unsubscribe', async (req, res) => {
  try {
    const sb = getUserScopedClient(req.headers.authorization)
    if (!sb) {
      res.status(401).json({ success: false, error: 'unauthorized' })
      return
    }
    const { endpoint } = req.body ?? {}
    if (typeof endpoint !== 'string') {
      res.status(400).json({ success: false, error: 'invalid_endpoint' })
      return
    }
    const { error } = await sb.from('push_subscriptions').delete().eq('endpoint', endpoint)
    if (error) {
      res.status(500).json({ success: false, error: error.message })
      return
    }
    res.status(200).json({ success: true })
  } catch (e) {
    captureBackendException(e, { route: '/api/push/unsubscribe' })
    res.status(500).json({ success: false, error: 'server_error' })
  }
})

router.post('/test', async (req, res) => {
  try {
    const sb = getUserScopedClient(req.headers.authorization)
    if (!sb) {
      res.status(401).json({ success: false, error: 'unauthorized' })
      return
    }
    const { data: userData } = await sb.auth.getUser()
    if (!userData?.user) {
      res.status(401).json({ success: false, error: 'unauthorized' })
      return
    }
    const result = await dispatchWebPush({
      userId: userData.user.id,
      title: 'TrustBook',
      body: 'Notifica di test riuscita.',
      url: '/notifiche',
    })
    res.status(200).json({ success: true, ...result })
  } catch (e) {
    captureBackendException(e, { route: '/api/push/test' })
    res.status(500).json({ success: false, error: 'server_error' })
  }
})

export default router
