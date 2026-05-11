/**
 * Web Push client utilities.
 *
 *   - `isPushSupported()` — returns true only when the browser supports
 *     ServiceWorker + PushManager + Notification.
 *   - `subscribeToPush()` — performs the full registration flow: ensures the
 *     SW is ready, asks Notification.permission, calls pushManager.subscribe
 *     with the VAPID public key from env, then POSTs the subscription to
 *     `/api/push/subscribe`.
 *   - `unsubscribeFromPush()` — reverse operation.
 *
 * All functions return discriminated unions so the UI can show precise
 * feedback (permission denied vs server error vs unsupported).
 */

import { supabase } from '@/lib/supabase'

export type PushSupportState =
  | { supported: true }
  | { supported: false; reason: 'no-window' | 'no-sw' | 'no-push' | 'no-notification' }

export function checkPushSupport(): PushSupportState {
  if (typeof window === 'undefined') return { supported: false, reason: 'no-window' }
  if (!('serviceWorker' in navigator)) return { supported: false, reason: 'no-sw' }
  if (!('PushManager' in window)) return { supported: false, reason: 'no-push' }
  if (!('Notification' in window)) return { supported: false, reason: 'no-notification' }
  return { supported: true }
}

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'permission-denied' | 'no-vapid' | 'no-session' | 'server-error'; detail?: string }

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const output = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i += 1) output[i] = rawData.charCodeAt(i)
  return output
}

export async function subscribeToPush(): Promise<SubscribeResult> {
  const support = checkPushSupport()
  if (support.supported === false) return { ok: false, reason: 'unsupported', detail: support.reason }

  const vapidKey = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY
  if (!vapidKey) return { ok: false, reason: 'no-vapid' }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, reason: 'permission-denied' }

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })
  }

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { ok: false, reason: 'no-session' }

  const sj = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  if (!sj.endpoint || !sj.keys?.p256dh || !sj.keys?.auth) return { ok: false, reason: 'server-error', detail: 'malformed_subscription' }

  const resp = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      endpoint: sj.endpoint,
      p256dh: sj.keys.p256dh,
      auth: sj.keys.auth,
      platform: detectPlatform(),
      userAgent: navigator.userAgent.slice(0, 200),
    }),
  })
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '')
    return { ok: false, reason: 'server-error', detail: txt.slice(0, 200) }
  }
  return { ok: true }
}

export async function unsubscribeFromPush(): Promise<SubscribeResult> {
  const support = checkPushSupport()
  if (support.supported === false) return { ok: false, reason: 'unsupported', detail: support.reason }
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return { ok: true }
  const endpoint = sub.endpoint
  try {
    await sub.unsubscribe()
  } catch {
    /* ignore */
  }
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { ok: false, reason: 'no-session' }
  await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint }),
  })
  return { ok: true }
}

function detectPlatform(): string {
  const ua = navigator.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/Mac OS X/i.test(ua)) return 'macos'
  if (/Windows/i.test(ua)) return 'windows'
  if (/Linux/i.test(ua)) return 'linux'
  return 'unknown'
}
