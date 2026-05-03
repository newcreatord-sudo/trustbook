import { supabase } from '@/lib/supabase'
import type { SecurityEventSource, SecurityEventType, UserSecurityEventRow } from '@/domain/supabase'
import { safeParseUserSecurityEventRow } from '@/domain/parse'

function deviceLabelFromUserAgent(ua: string): string {
  const s = ua.toLowerCase()
  const isMobile = /android|iphone|ipad/.test(s)
  const os =
    s.includes('windows')
      ? 'Windows'
      : s.includes('mac os')
        ? 'macOS'
        : s.includes('android')
          ? 'Android'
          : s.includes('iphone') || s.includes('ipad')
            ? 'iOS'
            : 'Altro'
  const browser =
    s.includes('edg')
      ? 'Edge'
      : s.includes('chrome')
        ? 'Chrome'
        : s.includes('safari') && !s.includes('chrome')
          ? 'Safari'
          : s.includes('firefox')
            ? 'Firefox'
            : 'Browser'
  return `${browser} · ${os}${isMobile ? ' (mobile)' : ''}`
}

export function tryDecodeJwtIat(accessToken: string | null | undefined): number | null {
  if (!accessToken) return null
  const parts = accessToken.split('.')
  if (parts.length < 2) return null
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
    const json = atob(padded)
    const payload = JSON.parse(json) as { iat?: unknown }
    const iat = typeof payload.iat === 'number' ? payload.iat : null
    return iat && Number.isFinite(iat) ? iat : null
  } catch {
    return null
  }
}

export async function logSecurityEvent(params: {
  userId: string
  eventType: SecurityEventType
  source: SecurityEventSource
}) {
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
    const device = ua ? deviceLabelFromUserAgent(ua) : null
    const { error } = await supabase.from('user_security_events').insert({
      user_id: params.userId,
      event_type: params.eventType,
      source: params.source,
      device,
      user_agent: ua || null,
      ip: null,
    })
    if (error) throw error
  } catch {
    return
  }
}

export async function fetchRecentSecurityEvents(userId: string, limit: number): Promise<UserSecurityEventRow[]> {
  const n = Math.max(1, Math.min(50, Math.floor(limit)))
  const { data, error } = await supabase
    .from('user_security_events')
    .select('id,user_id,event_type,source,device,user_agent,ip,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(n)
  if (error) throw error
  return (((data as unknown[]) ?? []) as unknown[])
    .map((x) => safeParseUserSecurityEventRow(x))
    .filter(Boolean) as UserSecurityEventRow[]
}

