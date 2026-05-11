import type { Request, Response, NextFunction } from 'express'

type Bucket = {
  resetAt: number
  count: number
}

type Rule = {
  windowMs: number
  max: number
}

function ipFromRequest(req: Request): string {
  const xff = typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'] : ''
  const first = xff.split(',')[0]?.trim()
  if (first) return first
  if (typeof req.ip === 'string' && req.ip.trim()) return req.ip.trim()
  return 'unknown'
}

function pickRule(pathname: string): Rule {
  if (pathname.startsWith('/api/auth')) return { windowMs: 60_000, max: 40 }
  if (pathname.startsWith('/api/stripe')) return { windowMs: 60_000, max: 80 }
  if (pathname.startsWith('/api/cron')) return { windowMs: 60_000, max: 30 }
  if (pathname.startsWith('/api/ops/')) return { windowMs: 60_000, max: 30 }
  return { windowMs: 60_000, max: 120 }
}

const buckets = new Map<string, Bucket>()

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'OPTIONS') {
    next()
    return
  }

  const pathname = typeof req.path === 'string' ? req.path : ''
  const rule = pickRule(pathname)
  const ip = ipFromRequest(req)
  const key = `${ip}|${pathname.split('/').slice(0, 3).join('/')}`

  const now = Date.now()
  const existing = buckets.get(key)
  if (!existing || now >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + rule.windowMs })
    next()
    return
  }

  existing.count += 1
  if (existing.count > rule.max) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    res.setHeader('Retry-After', String(retryAfterSec))
    res.status(429).json({ success: false, error: 'Too many requests' })
    return
  }

  next()
}
