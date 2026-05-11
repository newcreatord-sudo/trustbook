/**
 * Web Push fan-out.
 *
 * Reads enabled subscriptions for a target user and sends a Web Push payload
 * using VAPID auth (`web-push` package). Cleans up `Gone` (410) endpoints and
 * increments failure counters. Records each attempt into
 * `notification_delivery_log`.
 *
 * Required env:
 *   WEB_PUSH_VAPID_PUBLIC_KEY
 *   WEB_PUSH_VAPID_PRIVATE_KEY
 *   WEB_PUSH_VAPID_SUBJECT   (e.g. "mailto:noreply@trustbook.it")
 *
 * If env keys are missing this dispatcher becomes a no-op (returns `{ skipped: true }`),
 * so the system continues to function with the in-app channel only.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { logEvent } from './observability.js'

type DispatchInput = {
  userId: string
  title: string
  body: string
  url?: string
  notificationId?: string
  priority?: 'low' | 'normal' | 'high' | 'critical'
}

type DispatchResult = {
  attempted: number
  delivered: number
  removed: number
  skipped?: boolean
  reason?: string
}

function mustEnv(key: string): string | null {
  const v = process.env[key]
  return typeof v === 'string' && v.length > 0 ? v : null
}

let adminClient: SupabaseClient | null = null
function getAdminClient(): SupabaseClient | null {
  if (adminClient) return adminClient
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  adminClient = createClient(url, key, { auth: { persistSession: false } })
  return adminClient
}

export async function dispatchWebPush(input: DispatchInput): Promise<DispatchResult> {
  const publicKey = mustEnv('WEB_PUSH_VAPID_PUBLIC_KEY')
  const privateKey = mustEnv('WEB_PUSH_VAPID_PRIVATE_KEY')
  const subject = mustEnv('WEB_PUSH_VAPID_SUBJECT') ?? 'mailto:noreply@trustbook.it'

  if (!publicKey || !privateKey) {
    return { attempted: 0, delivered: 0, removed: 0, skipped: true, reason: 'vapid_missing' }
  }

  const sb = getAdminClient()
  if (!sb) {
    return { attempted: 0, delivered: 0, removed: 0, skipped: true, reason: 'supabase_admin_missing' }
  }

  let webpush: typeof import('web-push')
  try {
    webpush = (await import('web-push')).default ?? (await import('web-push'))
  } catch {
    return { attempted: 0, delivered: 0, removed: 0, skipped: true, reason: 'webpush_not_installed' }
  }
  webpush.setVapidDetails(subject, publicKey, privateKey)

  const { data: subs, error: subErr } = await sb
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', input.userId)
    .eq('enabled', true)

  if (subErr || !Array.isArray(subs) || subs.length === 0) {
    return { attempted: 0, delivered: 0, removed: 0, skipped: !subs?.length, reason: subErr?.message }
  }

  const payload = JSON.stringify({
    title: input.title,
    body: input.body,
    url: input.url ?? '/',
    priority: input.priority ?? 'normal',
    notificationId: input.notificationId ?? null,
  })

  let delivered = 0
  let removed = 0
  const ttl = input.priority === 'critical' ? 3600 : input.priority === 'high' ? 600 : 60
  const urgency = input.priority === 'critical' ? 'high' : input.priority === 'low' ? 'low' : 'normal'

  for (const sub of subs) {
    const subRow = sub as { id: string; endpoint: string; p256dh: string; auth: string }
    try {
      await webpush.sendNotification(
        { endpoint: subRow.endpoint, keys: { p256dh: subRow.p256dh, auth: subRow.auth } },
        payload,
        { TTL: ttl, urgency },
      )
      delivered += 1
      await sb.from('notification_delivery_log').insert({
        notification_id: input.notificationId ?? null,
        recipient_user_id: input.userId,
        channel: 'push',
        provider: 'web-push',
        status: 'sent',
        metadata: { endpoint_host: tryHost(subRow.endpoint) },
      })
    } catch (e) {
      const errInfo = e as { statusCode?: number; message?: string }
      const code = errInfo.statusCode ?? 0
      const gone = code === 404 || code === 410
      if (gone) {
        await sb.from('push_subscriptions').delete().eq('id', subRow.id)
        removed += 1
      } else {
        await sb
          .from('push_subscriptions')
          .update({ failure_count: 1 })
          .eq('id', subRow.id)
      }
      await sb.from('notification_delivery_log').insert({
        notification_id: input.notificationId ?? null,
        recipient_user_id: input.userId,
        channel: 'push',
        provider: 'web-push',
        status: 'failed',
        error_code: code ? String(code) : null,
        error_message: errInfo.message ?? null,
      })
      logEvent('warn', 'push_delivery_failed', { user_id: input.userId, code, message: errInfo.message })
    }
  }

  return { attempted: subs.length, delivered, removed }
}

function tryHost(endpoint: string): string | null {
  try {
    return new URL(endpoint).host
  } catch {
    return null
  }
}
