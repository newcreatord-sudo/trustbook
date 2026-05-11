import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'node:crypto'

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'].trim() : ''
  const requestId = incoming || randomUUID()
  ;(req as unknown as { requestId?: string }).requestId = requestId
  res.setHeader('X-Request-Id', requestId)
  next()
}
