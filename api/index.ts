/**
 * Vercel deploy entry handler, for serverless deployment, please don't modify this file
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import app from './app.js'

function toSingle(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.join('/')
  return undefined
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const forwardedPath = toSingle(req.query?.path)
  if (forwardedPath) {
    const cleaned = forwardedPath.startsWith('/') ? forwardedPath.slice(1) : forwardedPath

    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(req.query ?? {})) {
      if (k === 'path') continue
      if (typeof v === 'string') params.append(k, v)
      else if (Array.isArray(v)) for (const x of v) params.append(k, x)
    }

    const qs = params.toString()
    req.url = `/api/${cleaned}${qs ? `?${qs}` : ''}`
  }

  return app(req, res)
}
