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

// for esm mode
const __filename = fileURLToPath(import.meta.url)
path.dirname(__filename)

// load env
dotenv.config({ path: '.env.local' })
dotenv.config({ path: '.env' })

const app: express.Application = express()

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
      : error?.message || 'Server internal error'
  void req
  void next
  res.status(status).json({
    success: false,
    error: msg,
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
