import { Router, type Request, type Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { readEnv, readEnvAny } from '../lib/env.js'
import { timingSafeTokenEquals } from '../lib/security.js'
import { dispatchPendingEmails, runDueNotificationJobs } from './notifications.js'

const router = Router()

function authorized(req: Request): boolean {
  const cronSecret = readEnv('CRON_SECRET')
  if (!cronSecret) return false
  const auth = (req.header('authorization') || req.header('Authorization') || '').trim()
  const prefix = 'Bearer '
  if (!auth.startsWith(prefix)) return false
  const token = auth.slice(prefix.length).trim()
  return token.length > 0 && timingSafeTokenEquals(token, cronSecret)
}

function adminClientOrThrow() {
  const supabaseUrl = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const serviceRoleKey = readEnvAny([
    'SUPABASE_SERVICE_ROLE_KEY',
    'SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_KEY',
    'service_role',
    'SERVICE_ROLE',
  ])
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

router.get('/notifications/due', async (req: Request, res: Response) => {
  try {
    if (!authorized(req)) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const sbAdmin = adminClientOrThrow()
    await sbAdmin.rpc('backfill_booking_reminder_jobs', {
      p_horizon_hours: 36,
      p_limit: 300,
    })
    const limit = Math.max(1, Math.min(200, Math.floor(Number(req.query?.limit ?? 100) || 100)))
    const processed = await runDueNotificationJobs({ sbAdmin, limit })
    res.status(200).json({ success: true, processed })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'Service error' })
  }
})

router.get('/notifications/email', async (req: Request, res: Response) => {
  try {
    if (!authorized(req)) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const sbAdmin = adminClientOrThrow()
    const limit = Math.max(1, Math.min(50, Math.floor(Number(req.query?.limit ?? 25) || 25)))
    const out = await dispatchPendingEmails({ sbAdmin, limit })
    res.status(200).json({ success: true, ...out })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'Service error' })
  }
})

router.get('/notifications/all', async (req: Request, res: Response) => {
  try {
    if (!authorized(req)) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }
    const sbAdmin = adminClientOrThrow()
    const dueLimit = Math.max(1, Math.min(200, Math.floor(Number(req.query?.dueLimit ?? 100) || 100)))
    const emailLimit = Math.max(1, Math.min(50, Math.floor(Number(req.query?.emailLimit ?? 25) || 25)))
    const processed = await runDueNotificationJobs({ sbAdmin, limit: dueLimit })
    const email = await dispatchPendingEmails({ sbAdmin, limit: emailLimit })
    res.status(200).json({ success: true, processed, ...email })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'Service error' })
  }
})

export default router
