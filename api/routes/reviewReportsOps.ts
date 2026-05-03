import { Router, type Request, type Response } from 'express'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { readEnv, readEnvAny } from '../lib/env.js'
import { timingSafeTokenEquals } from '../lib/security.js'

const router = Router()

export type ReviewReportAdminRow = {
  report_id: string
  reported_at: string
  reporter_user_id: string
  review_id: string
  review_direction: string
  review_rating: number
  review_comment: string | null
  review_business_id: string
  review_booking_id: string
  review_created_at: string
  reason: string
}

function opsReportsToken(): string | null {
  return readEnv('OPS_REVIEW_REPORTS_TOKEN') ?? readEnv('CRON_SECRET')
}

function authorized(req: Request): boolean {
  const expected = opsReportsToken()
  if (!expected) return false

  const headerTok = (req.header('x-ops-reports-token') || '').trim()
  if (headerTok && timingSafeTokenEquals(headerTok, expected)) return true

  const auth = (req.header('authorization') || req.header('Authorization') || '').trim()
  const prefix = 'Bearer '
  if (auth.startsWith(prefix)) {
    const token = auth.slice(prefix.length).trim()
    if (token && timingSafeTokenEquals(token, expected)) return true
  }

  return false
}

function adminClientOrThrow(): SupabaseClient {
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

export async function fetchReviewReportsAdmin(args: {
  sbAdmin: SupabaseClient
  limit: number
}): Promise<ReviewReportAdminRow[]> {
  const lim = Math.max(1, Math.min(500, Math.floor(Number(args.limit) || 100)))
  const { data, error } = await args.sbAdmin.rpc('list_review_reports_admin', { p_limit: lim })
  if (error) throw new Error(error.message)
  const rows = (data as ReviewReportAdminRow[] | null) ?? []
  return rows.filter((r) => r && r.report_id && r.review_id)
}

/** POST JSON optional `{ "limit": number }`. Auth: Bearer OPS_REVIEW_REPORTS_TOKEN / CRON_SECRET, or header x-ops-reports-token. */
router.post('/list', async (req: Request, res: Response) => {
  try {
    if (!opsReportsToken()) {
      res.status(503).json({
        success: false,
        error: 'OPS_REVIEW_REPORTS_TOKEN or CRON_SECRET not configured',
      })
      return
    }
    if (!authorized(req)) {
      res.status(401).json({ success: false, error: 'Unauthorized' })
      return
    }

    const sbAdmin = adminClientOrThrow()
    const limit = Math.max(1, Math.min(500, Math.floor(Number(req.body?.limit ?? 100) || 100)))
    const rows = await fetchReviewReportsAdmin({ sbAdmin, limit })
    res.status(200).json({ success: true, count: rows.length, rows })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: e instanceof Error ? e.message : 'Service error' })
  }
})

export default router
