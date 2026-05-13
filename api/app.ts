/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import teamRoutes from './routes/team.js'
import stripeRoutes, { stripeWebhookHandler } from './routes/stripe.js'
import notificationRoutes from './routes/notifications.js'
import cronRoutes from './routes/cron.js'
import subscriptionRoutes from './routes/subscriptions.js'
import aiToolsRoutes from './routes/aiTools.js'
import monetizationRoutes from './routes/monetization.js'
import reviewReportsOpsRoutes from './routes/reviewReportsOps.js'
import opsRoutes from './routes/ops.js'
import seoRoutes from './routes/seo.js'
import pushRoutes from './routes/push.js'
import aiAgentRoutes from './routes/aiAgent.js'
import bookingRoutes from './routes/bookings.js'
import { requestIdMiddleware } from './middleware/requestId.js'
import { rateLimitMiddleware } from './middleware/rateLimit.js'
import { initBackendObservability, captureBackendException, logEvent } from './lib/observability.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
path.dirname(__filename)

// load env
dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

void initBackendObservability()

const app: express.Application = express()

app.disable('x-powered-by')
app.use(requestIdMiddleware)

/** Strict security headers applied to every response.
 *  CSP is intentionally explicit: every external origin must be enumerated.
 *  Stripe.js + Google Maps + Supabase + Vercel OG are the known third parties.
 *  Frame ancestors locked to 'none' to prevent click-jacking.
 *  Permissions-Policy locks down powerful APIs by default; geolocation is granted to self only. */
function buildContentSecurityPolicy(): string {
  const supabaseOrigin = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  const connectExtras = supabaseOrigin ? ` ${supabaseOrigin} wss://${supabaseOrigin.replace(/^https?:\/\//, '')}` : ''
  const isProd = process.env.NODE_ENV === 'production'
  const scriptSrc = isProd
    ? "script-src 'self' https://js.stripe.com https://maps.googleapis.com https://maps.gstatic.com"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://maps.googleapis.com https://maps.gstatic.com"
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    `connect-src 'self' https://api.stripe.com https://*.supabase.co https://maps.googleapis.com https://places.googleapis.com${connectExtras}`,
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
    "form-action 'self' https://checkout.stripe.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "media-src 'self' blob: https:",
    isProd ? "upgrade-insecure-requests" : '',
  ]
    .filter(Boolean)
    .join('; ')
}

const CSP_HEADER = buildContentSecurityPolicy()

app.use((req: Request, res: Response, next: NextFunction) => {
  void req
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(self), microphone=(), camera=(), payment=(self "https://js.stripe.com"), interest-cohort=()',
  )
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  res.setHeader('Content-Security-Policy', CSP_HEADER)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  }
  next()
})

function parseOrigins(v: string | undefined): string[] {
  if (!v) return []
  return v
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

const allowedOrigins = [
  ...parseOrigins(process.env.ALLOWED_ORIGINS),
  process.env.APP_BASE_URL,
  process.env.VITE_APP_URL,
  'http://localhost:5173',
].filter((v): v is string => typeof v === 'string' && v.length > 0)

function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true
  if (allowedOrigins.includes(origin)) return true
  if (process.env.NODE_ENV === 'development') {
    try {
      const u = new URL(origin)
      return u.hostname === 'localhost' || u.hostname === '127.0.0.1'
    } catch {
      return false
    }
  }
  return false
}

app.use(cors({
  origin: (origin, callback) => {
    if (originAllowed(origin)) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  },
  credentials: true,
}))
app.use(rateLimitMiddleware)
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), stripeWebhookHandler)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

/**
 * API Routes
 */
app.use('/api/auth', authRoutes)
app.use('/api/team', teamRoutes)
app.use('/api/stripe', stripeRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/cron', cronRoutes)
app.use('/api/subscriptions', subscriptionRoutes)
app.use('/api/ai-tools', aiToolsRoutes)
app.use('/api/monetization', monetizationRoutes)
app.use('/api/ops/review-reports', reviewReportsOpsRoutes)
app.use('/api/ops', opsRoutes)
app.use('/api/bookings', bookingRoutes)
app.use('/api/seo', seoRoutes)
app.use('/api/push', pushRoutes)
app.use('/api/ai', aiAgentRoutes)

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response): void => {
    void req
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(error)
    return
  }

  const e = error as unknown as { status?: number; statusCode?: number; type?: string; message?: string }
  const status = typeof e.statusCode === 'number' ? e.statusCode : typeof e.status === 'number' ? e.status : 500
  const msg =
    e.type === 'entity.parse.failed'
      ? 'Invalid JSON'
      : status >= 500 && process.env.NODE_ENV === 'production'
        ? 'Server internal error'
        : error?.message || 'Server internal error'

  const requestId = (req as unknown as { requestId?: string }).requestId ?? null
  if (status >= 500) {
    captureBackendException(error, { request_id: requestId, path: req.originalUrl, method: req.method, status })
  } else {
    logEvent('warn', 'http_error', { request_id: requestId, path: req.originalUrl, method: req.method, status, message: error?.message })
  }

  void next
  res.status(status).json({
    success: false,
    error: msg,
    requestId,
  })
})

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
