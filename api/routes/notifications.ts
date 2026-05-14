import { Router, type Request, type Response } from 'express'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { emailConfigStatus, sendEmail, type EmailConfigStatus } from '../email.js'
import { readEnv, readEnvAny } from '../lib/env.js'
import { timingSafeTokenEquals } from '../lib/security.js'

const router = Router()

type NotificationRow = {
  id: string
  recipient_user_id: string
  title: string
  body: string | null
  link: string | null
  created_at: string
  email_sent_at: string | null
  kind: string | null
  deliver_at: string | null
}

type UserPrefsEmailRow = {
  channel_email: boolean | null
  notif_booking: boolean | null
  notif_deposit: boolean | null
  notif_messages: boolean | null
  notif_marketing: boolean | null
  notif_reminders: boolean | null
  notif_owner_alerts: boolean | null
}

/** Mirrors src/lib/userPreferences.notificationCategory — email path respects category toggles when prefs row exists. */
export function notificationEmailCategoryAllowed(kind: string | null, pref: UserPrefsEmailRow | null): boolean {
  if (!pref) return true
  const k = String(kind ?? '')
  if (k.includes('reminder')) return pref.notif_reminders !== false
  if (k.includes('risky') || k.includes('owner_')) return pref.notif_owner_alerts !== false
  if (k.includes('deposit')) return pref.notif_deposit !== false
  if (k.includes('message') || k.includes('chat')) return pref.notif_messages !== false
  if (k.includes('marketing') || k.includes('promo')) return pref.notif_marketing !== false
  return pref.notif_booking !== false
}

export async function runDueNotificationJobs(args: { sbAdmin: SupabaseClient; limit: number }): Promise<number> {
  const limit = Math.max(1, Math.min(200, Math.floor(Number(args.limit) || 50)))
  const { data, error } = await args.sbAdmin.rpc('run_due_notification_jobs', {
    p_limit: limit,
    p_now: new Date().toISOString(),
  })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

export async function dispatchPendingEmails(args: {
  sbAdmin: SupabaseClient
  limit: number
}): Promise<{ sent: number; skipped: boolean; email: EmailConfigStatus }> {
  const email = emailConfigStatus()
  if (!email.canSend) return { sent: 0, skipped: true, email }

  const limit = Math.max(1, Math.min(50, Math.floor(Number(args.limit) || 20)))
  const nowIso = new Date().toISOString()
  const { data, error } = await args.sbAdmin
    .from('notifications')
    .select('id,recipient_user_id,title,body,link,created_at,email_sent_at,kind,deliver_at')
    .is('email_sent_at', null)
    .or(`deliver_at.is.null,deliver_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) throw new Error(error.message)

  const rows = ((data as NotificationRow[]) ?? []).filter((r) => r && r.id && r.recipient_user_id)
  let sent = 0
  for (const n of rows) {
    const { data: u } = await args.sbAdmin.auth.admin.getUserById(n.recipient_user_id)
    const email = (u.user?.email ?? '').trim()
    if (!email) {
      await args.sbAdmin.from('notifications').update({ email_sent_at: new Date().toISOString() }).eq('id', n.id)
      continue
    }

    const { data: prefRow } = await args.sbAdmin
      .from('user_preferences')
      .select(
        'channel_email, notif_booking, notif_deposit, notif_messages, notif_marketing, notif_reminders, notif_owner_alerts',
      )
      .eq('user_id', n.recipient_user_id)
      .maybeSingle()
    if (prefRow && prefRow.channel_email === false) {
      await args.sbAdmin.from('notifications').update({ email_sent_at: new Date().toISOString() }).eq('id', n.id)
      continue
    }
    const prefs = prefRow as UserPrefsEmailRow | null
    if (!notificationEmailCategoryAllowed(n.kind, prefs)) {
      await args.sbAdmin.from('notifications').update({ email_sent_at: new Date().toISOString() }).eq('id', n.id)
      continue
    }

    const link = n.link ? `${n.link}` : ''
    const text = [n.title, n.body ?? '', link].filter(Boolean).join('\n\n')
    const html = `
        <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height:1.5">
          <div style="font-size:16px; font-weight:700">${escapeHtml(n.title)}</div>
          ${n.body ? `<div style="margin-top:8px; font-size:14px">${escapeHtml(n.body)}</div>` : ''}
          ${link ? `<div style="margin-top:12px; font-size:13px"><a href="${escapeAttr(link)}">Apri TrustBook</a></div>` : ''}
          <div style="margin-top:14px; font-size:12px; color:#6b7280">${escapeHtml(new Date(n.created_at).toLocaleString('it-IT'))}</div>
        </div>
      `.trim()

    await sendEmail({ to: email, subject: n.title, text, html })
    await args.sbAdmin.from('notifications').update({ email_sent_at: new Date().toISOString() }).eq('id', n.id)
    sent += 1
  }

  return { sent, skipped: false, email }
}

router.post('/dispatch', async (req: Request, res: Response) => {
  try {
    const token = req.header('x-dispatch-token') || req.header('X-Dispatch-Token')
    const expected = readEnv('EMAIL_DISPATCH_TOKEN')
    const provided = token ? token.trim() : ''
    if (!expected || !provided || !timingSafeTokenEquals(provided, expected)) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

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

    const sbAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })

    const limit = Math.max(1, Math.min(50, Math.floor(Number(req.body?.limit ?? 20) || 20)))
    const out = await dispatchPendingEmails({ sbAdmin, limit })
    res.status(200).json({ success: true, ...out })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'Service error' })
  }
})

router.post('/run-due', async (req: Request, res: Response) => {
  try {
    const token = req.header('x-dispatch-token') || req.header('X-Dispatch-Token')
    const expected = readEnv('EMAIL_DISPATCH_TOKEN')
    const provided = token ? token.trim() : ''
    if (!expected || !provided || !timingSafeTokenEquals(provided, expected)) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

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

    const sbAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })

    const limit = Math.max(1, Math.min(200, Math.floor(Number(req.body?.limit ?? 50) || 50)))
    const processed = await runDueNotificationJobs({ sbAdmin, limit })
    res.status(200).json({ success: true, processed })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'Service error' })
  }
})

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/`/g, '&#96;')
}

export default router
