import { Router, type Request, type Response } from 'express'
import { readEnv } from '../lib/env.js'
import { timingSafeTokenEquals } from '../lib/security.js'
import { captureBackendException } from '../lib/observability.js'

const router = Router()

function opsToken(): string | null {
  return readEnv('OPS_SENTRY_TEST_TOKEN') ?? readEnv('OPS_REVIEW_REPORTS_TOKEN') ?? readEnv('CRON_SECRET')
}

function authorized(req: Request): boolean {
  const expected = opsToken()
  if (!expected) return false

  const headerTok = (req.header('x-ops-token') || '').trim()
  if (headerTok && timingSafeTokenEquals(headerTok, expected)) return true

  const auth = (req.header('authorization') || req.header('Authorization') || '').trim()
  const prefix = 'Bearer '
  if (auth.startsWith(prefix)) {
    const token = auth.slice(prefix.length).trim()
    if (token && timingSafeTokenEquals(token, expected)) return true
  }

  return false
}

router.get('/sentry-test', (req: Request, res: Response) => {
  if (!opsToken()) {
    res.status(503).json({ success: false, error: 'OPS_SENTRY_TEST_TOKEN (or OPS_REVIEW_REPORTS_TOKEN/CRON_SECRET) not configured' })
    return
  }
  if (!authorized(req)) {
    res.status(401).json({ success: false, error: 'Unauthorized' })
    return
  }

  const requestId = (req as unknown as { requestId?: string }).requestId ?? null
  captureBackendException(new Error('ops_sentry_test'), { request_id: requestId })
  res.status(200).json({ success: true, requestId })
})

export default router
