import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'node:crypto'
import { logEvent } from '../lib/observability.js'

/**
 * Generates or propagates an `X-Request-Id` correlation header and exposes it
 * on `req.requestId`. Emits a structured access log line on response finish.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'].trim() : ''
  const requestId = incoming || randomUUID()
  ;(req as unknown as { requestId?: string }).requestId = requestId
  res.setHeader('X-Request-Id', requestId)

  const startedAt = process.hrtime.bigint()
  res.on('finish', () => {
    const elapsedNs = Number(process.hrtime.bigint() - startedAt)
    const elapsedMs = Math.round(elapsedNs / 1e6)
    const ua = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 200) : null
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
    logEvent(level, 'http_access', {
      request_id: requestId,
      method: req.method,
      path: req.originalUrl?.split('?')[0] ?? req.url,
      status: res.statusCode,
      duration_ms: elapsedMs,
      user_agent: ua,
    })
  })

  next()
}
