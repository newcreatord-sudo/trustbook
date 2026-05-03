/**
 * This is a user authentication API route demo.
 * Handle user registration, login, token management, etc.
 */
import { Router, type Request, type Response } from 'express'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'
import { readEnvAny } from '../lib/env.js'

const router = Router()
const ADMIN_SIGNUP_ENDPOINT = '/api/auth/admin-signup'
/** Solo sviluppo: registrazione senza invio email (createUser + email confermato). Mai abilitare in produzione. */
const DEV_CONFIRM_SIGNUP_ENDPOINT = '/api/auth/dev-signup-confirmed'
const ADMIN_RATE_WINDOW_MS = Number(process.env.AUTH_ADMIN_SIGNUP_RATE_LIMIT_WINDOW_MS ?? 10 * 60_000)
const ADMIN_RATE_MAX_ATTEMPTS = Number(process.env.AUTH_ADMIN_SIGNUP_MAX_ATTEMPTS ?? 10)
const adminSignupAttemptMap = new Map<string, number[]>()
const RESEND_RATE_WINDOW_MS = Number(process.env.AUTH_RESEND_RATE_LIMIT_WINDOW_MS ?? 10 * 60_000)
const RESEND_RATE_MAX_ATTEMPTS = Number(process.env.AUTH_RESEND_MAX_ATTEMPTS ?? 5)
const resendAttemptMap = new Map<string, number[]>()

function buildSupabaseAdminClient() {
  const supabaseUrl = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const serviceRoleKey = readEnvAny([
    'SUPABASE_SERVICE_ROLE_KEY',
    'SERVICE_ROLE_KEY',
    'SUPABASE_SERVICE_KEY',
    'service_role',
    'SERVICE_ROLE',
  ])
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

function buildSupabaseAnonClient() {
  const supabaseUrl = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
  const anonKey = readEnvAny([
    'SUPABASE_ANON_KEY',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_SUPABASE_ANON_KEY_',
    'SUPABASE_ANON',
    'anon_key',
  ])
  if (!supabaseUrl || !anonKey) return null
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

function isRole(x: unknown): x is 'cliente' | 'attivita' {
  return x === 'cliente' || x === 'attivita'
}

function keyFormat(key: string): 'jwt' | 'sb_secret' | 'sb_publishable' | 'unknown' {
  if (key.split('.').length === 3) return 'jwt'
  if (key.startsWith('sb_secret_')) return 'sb_secret'
  if (key.startsWith('sb_publishable_')) return 'sb_publishable'
  return 'unknown'
}

function errText(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  return 'Unknown error'
}

function adminSignupToken(req: Request): string | null {
  const h = req.header('x-admin-signup-token') || req.header('X-Admin-Signup-Token')
  if (!h) return null
  return String(h).trim() || null
}

function requestIp(req: Request): string {
  const xff = req.header('x-forwarded-for') || req.header('X-Forwarded-For')
  if (xff) return String(xff).split(',')[0]?.trim() || 'unknown'
  const xrip = req.header('x-real-ip') || req.header('X-Real-IP')
  if (xrip) return String(xrip).trim() || 'unknown'
  return req.ip || 'unknown'
}

function timingSafeTokenEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

function cleanupRateLimitBucket(now: number, bucket: number[]): number[] {
  const from = now - Math.max(1, ADMIN_RATE_WINDOW_MS)
  return bucket.filter((ts) => ts >= from)
}

function consumeAdminSignupAttempt(key: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now()
  const prev = adminSignupAttemptMap.get(key) ?? []
  const clean = cleanupRateLimitBucket(now, prev)
  if (clean.length >= Math.max(1, ADMIN_RATE_MAX_ATTEMPTS)) {
    const oldest = clean[0] ?? now
    const retryAfterMs = Math.max(1_000, oldest + Math.max(1, ADMIN_RATE_WINDOW_MS) - now)
    return { allowed: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) }
  }
  clean.push(now)
  adminSignupAttemptMap.set(key, clean)
  return { allowed: true, retryAfterSec: 0 }
}

const devSignupAttemptMap = new Map<string, number[]>()

function consumeDevSignupAttempt(key: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now()
  const prev = devSignupAttemptMap.get(key) ?? []
  const clean = cleanupRateLimitBucket(now, prev)
  if (clean.length >= Math.max(1, ADMIN_RATE_MAX_ATTEMPTS)) {
    const oldest = clean[0] ?? now
    const retryAfterMs = Math.max(1_000, oldest + Math.max(1, ADMIN_RATE_WINDOW_MS) - now)
    return { allowed: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) }
  }
  clean.push(now)
  devSignupAttemptMap.set(key, clean)
  return { allowed: true, retryAfterSec: 0 }
}

function consumeResendAttempt(key: string): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now()
  const prev = resendAttemptMap.get(key) ?? []
  const from = now - Math.max(1, RESEND_RATE_WINDOW_MS)
  const clean = prev.filter((ts) => ts >= from)
  if (clean.length >= Math.max(1, RESEND_RATE_MAX_ATTEMPTS)) {
    const oldest = clean[0] ?? now
    const retryAfterMs = Math.max(1_000, oldest + Math.max(1, RESEND_RATE_WINDOW_MS) - now)
    resendAttemptMap.set(key, clean)
    return { allowed: false, retryAfterSec: Math.ceil(retryAfterMs / 1000) }
  }
  clean.push(now)
  resendAttemptMap.set(key, clean)
  return { allowed: true, retryAfterSec: 0 }
}

function normalizeAuthCallbackUrl(fromBody: string | null): string | undefined {
  const appBaseUrl = normalizeBaseUrl(readEnvAny(['APP_BASE_URL', 'VITE_APP_URL']))
  const allowOrigin = appBaseUrl ? new URL(appBaseUrl).origin : null
  const fallback = appBaseUrl ? `${appBaseUrl}/auth/callback` : undefined

  const raw = (fromBody ?? '').trim()
  if (!raw) return fallback
  try {
    const u = new URL(raw)
    if (!allowOrigin || u.origin !== allowOrigin) return fallback
    if (!u.pathname.startsWith('/auth/callback')) return fallback
    u.hash = ''
    return u.toString()
  } catch {
    return fallback
  }
}

async function isDbRateLimited(params: {
  ip: string
  email: string | null
  maxAttempts: number
  windowMs: number
}): Promise<boolean> {
  try {
    const sbAdmin = buildSupabaseAdminClient()
    if (!sbAdmin) return false
    const fromIso = new Date(Date.now() - Math.max(1, params.windowMs)).toISOString()

    let q = sbAdmin
      .from('admin_security_events')
      .select('id', { count: 'exact', head: true })
      .eq('endpoint', ADMIN_SIGNUP_ENDPOINT)
      .eq('ip', params.ip)
      .eq('success', false)
      .gte('created_at', fromIso)

    if (params.email) q = q.eq('email', params.email)

    const { count, error } = await q
    if (error) return false
    return (count ?? 0) >= Math.max(1, params.maxAttempts)
  } catch {
    return false
  }
}

function buildAuditContext(req: Request) {
  const body = req.body as Record<string, unknown> | undefined
  const emailRaw = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  const roleRaw = body?.role
  const role = isRole(roleRaw) ? roleRaw : null
  const ip = requestIp(req)
  const userAgent = req.header('user-agent') || req.header('User-Agent') || null
  return { email: emailRaw || null, role, ip, userAgent }
}

function normalizeBaseUrl(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

async function logAdminSecurityEvent(params: {
  req: Request
  email?: string | null
  role?: 'cliente' | 'attivita' | null
  success: boolean
  reason: string
  endpoint?: string
}) {
  try {
    const supabaseUrl = readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])
    const serviceRoleKey = readEnvAny([
      'SUPABASE_SERVICE_ROLE_KEY',
      'SERVICE_ROLE_KEY',
      'SUPABASE_SERVICE_KEY',
      'service_role',
      'SERVICE_ROLE',
    ])
    if (!supabaseUrl || !serviceRoleKey) return

    const ip = requestIp(params.req)
    const userAgent = params.req.header('user-agent') || params.req.header('User-Agent') || null
    const sbAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })

    await sbAdmin.from('admin_security_events').insert({
      endpoint: params.endpoint ?? ADMIN_SIGNUP_ENDPOINT,
      ip,
      user_agent: userAgent,
      email: params.email ?? null,
      role: params.role ?? null,
      success: params.success,
      reason: params.reason,
    })
  } catch {
    // best-effort security telemetry
  }
}



router.post('/admin-signup', async (req: Request, res: Response): Promise<void> => {
  try {
    const ctx = buildAuditContext(req)
    const rlKey = `${ctx.ip}:${ctx.email ?? 'unknown'}`
    const rl = consumeAdminSignupAttempt(rlKey)
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfterSec))
      await logAdminSecurityEvent({
        req,
        email: ctx.email,
        role: ctx.role,
        success: false,
        reason: 'rate_limited',
      })
      res.status(429).json({ success: false, error: 'Too many attempts. Retry later.' })
      return
    }

    const dbRateLimited = await isDbRateLimited({
      ip: ctx.ip,
      email: ctx.email,
      maxAttempts: ADMIN_RATE_MAX_ATTEMPTS,
      windowMs: ADMIN_RATE_WINDOW_MS,
    })
    if (dbRateLimited) {
      const retryAfterSec = Math.ceil(Math.max(1, ADMIN_RATE_WINDOW_MS) / 1000)
      res.setHeader('Retry-After', String(retryAfterSec))
      await logAdminSecurityEvent({
        req,
        email: ctx.email,
        role: ctx.role,
        success: false,
        reason: 'rate_limited_db',
      })
      res.status(429).json({ success: false, error: 'Too many attempts. Retry later.' })
      return
    }

    const adminToken = readEnvAny(['AUTH_ADMIN_SIGNUP_TOKEN', 'ADMIN_SIGNUP_TOKEN'])
    if (!adminToken) {
      await logAdminSecurityEvent({
        req,
        email: ctx.email,
        role: ctx.role,
        success: false,
        reason: 'server_missing_admin_token',
      })
      res.status(500).json({ success: false, error: 'Missing AUTH_ADMIN_SIGNUP_TOKEN' })
      return
    }

    const provided = adminSignupToken(req)
    if (!provided) {
      await logAdminSecurityEvent({
        req,
        email: ctx.email,
        role: ctx.role,
        success: false,
        reason: 'missing_admin_signup_token_header',
      })
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }
    if (!timingSafeTokenEquals(provided, adminToken)) {
      await logAdminSecurityEvent({
        req,
        email: ctx.email,
        role: ctx.role,
        success: false,
        reason: 'invalid_admin_signup_token',
      })
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }

    const supabaseAdmin = buildSupabaseAdminClient()
    if (!supabaseAdmin) {
      await logAdminSecurityEvent({
        req,
        email: ctx.email,
        role: ctx.role,
        success: false,
        reason: 'server_missing_supabase_service_role',
      })
      res.status(500).json({
        success: false,
        error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
        debug: {
          hasSupabaseUrl: Boolean(readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL'])),
          hasServiceRoleKey: Boolean(
            readEnvAny([
              'SUPABASE_SERVICE_ROLE_KEY',
              'SERVICE_ROLE_KEY',
              'SUPABASE_SERVICE_KEY',
              'service_role',
              'SERVICE_ROLE',
            ]),
          ),
        },
      })
      return
    }

    const email = String(req.body?.email ?? '').trim().toLowerCase()
    const password = String(req.body?.password ?? '')
    const role = req.body?.role
    if (!email || !password || password.length < 8) {
      await logAdminSecurityEvent({
        req,
        email: email || null,
        role: isRole(role) ? role : null,
        success: false,
        reason: 'invalid_email_or_password',
      })
      res.status(400).json({
        success: false,
        error: 'Invalid email or password',
      })
      return
    }
    if (!isRole(role)) {
      await logAdminSecurityEvent({
        req,
        email,
        role: null,
        success: false,
        reason: 'invalid_role',
      })
      res.status(400).json({
        success: false,
        error: 'Invalid role',
      })
      return
    }

    const firstName = typeof req.body?.firstName === 'string' ? req.body.firstName : ''
    const lastName = typeof req.body?.lastName === 'string' ? req.body.lastName : ''
    const phone = typeof req.body?.phone === 'string' ? req.body.phone : ''

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role,
        first_name: firstName?.trim() || null,
        last_name: lastName?.trim() || null,
        phone: phone?.trim() || null,
      },
    })

    if (error) {
      const msg = error.message || 'Signup failed'
      const code = msg.toLowerCase().includes('already') ? 409 : 400
      await logAdminSecurityEvent({
        req,
        email,
        role,
        success: false,
        reason: `supabase_admin_create_user_error:${msg.slice(0, 180)}`,
      })
      res.status(code).json({
        success: false,
        error: msg,
        debug: {
          supabaseUrlHost: (() => {
            try {
              return new URL(readEnvAny(['SUPABASE_URL', 'VITE_SUPABASE_URL']) ?? '').host
            } catch {
              return null
            }
          })(),
          keyFormat: keyFormat(
            readEnvAny([
              'SUPABASE_SERVICE_ROLE_KEY',
              'SERVICE_ROLE_KEY',
              'SUPABASE_SERVICE_KEY',
              'service_role',
              'SERVICE_ROLE',
            ]) ?? '',
          ),
          keyLength:
            (
              readEnvAny([
                'SUPABASE_SERVICE_ROLE_KEY',
                'SERVICE_ROLE_KEY',
                'SUPABASE_SERVICE_KEY',
                'service_role',
                'SERVICE_ROLE',
              ]) ?? ''
            ).length,
        },
      })
      return
    }

    res.status(200).json({
      success: true,
      userId: data.user.id,
    })
    await logAdminSecurityEvent({
      req,
      email,
      role,
      success: true,
      reason: 'admin_signup_created',
    })
  } catch (e: unknown) {
    const ctx = buildAuditContext(req)
    await logAdminSecurityEvent({
      req,
      email: ctx.email,
      role: ctx.role,
      success: false,
      reason: `admin_signup_unhandled:${errText(e).slice(0, 180)}`,
    })
    res.status(502).json({
      success: false,
      error: 'Service is unavailable',
      detail: errText(e),
    })
  }
})

router.post('/dev-signup-confirmed', async (req: Request, res: Response): Promise<void> => {
  try {
    if (process.env.NODE_ENV === 'production') {
      res.status(404).json({ success: false, error: 'Not found' })
      return
    }
    const devEnabled =
      process.env.AUTH_DEV_SIGNUP_CONFIRMED === 'true' || process.env.AUTH_DEV_SIGNUP_CONFIRMED === '1'
    if (!devEnabled) {
      res.status(404).json({ success: false, error: 'Not found' })
      return
    }

    const ctx = buildAuditContext(req)
    const rlKey = `dev:${ctx.ip}:${ctx.email ?? 'unknown'}`
    const rl = consumeDevSignupAttempt(rlKey)
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfterSec))
      await logAdminSecurityEvent({
        req,
        email: ctx.email,
        role: ctx.role,
        success: false,
        reason: 'rate_limited',
        endpoint: DEV_CONFIRM_SIGNUP_ENDPOINT,
      })
      res.status(429).json({ success: false, error: 'Too many attempts. Retry later.' })
      return
    }

    const supabaseAdmin = buildSupabaseAdminClient()
    if (!supabaseAdmin) {
      await logAdminSecurityEvent({
        req,
        email: ctx.email,
        role: ctx.role,
        success: false,
        reason: 'server_missing_supabase_service_role',
        endpoint: DEV_CONFIRM_SIGNUP_ENDPOINT,
      })
      res.status(500).json({
        success: false,
        error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY',
      })
      return
    }

    const email = String(req.body?.email ?? '').trim().toLowerCase()
    const password = String(req.body?.password ?? '')
    const role = req.body?.role
    if (!email || !password || password.length < 8) {
      await logAdminSecurityEvent({
        req,
        email: email || null,
        role: isRole(role) ? role : null,
        success: false,
        reason: 'invalid_email_or_password',
        endpoint: DEV_CONFIRM_SIGNUP_ENDPOINT,
      })
      res.status(400).json({
        success: false,
        error: 'Invalid email or password',
      })
      return
    }
    if (!isRole(role)) {
      await logAdminSecurityEvent({
        req,
        email,
        role: null,
        success: false,
        reason: 'invalid_role',
        endpoint: DEV_CONFIRM_SIGNUP_ENDPOINT,
      })
      res.status(400).json({
        success: false,
        error: 'Invalid role',
      })
      return
    }

    const firstName = typeof req.body?.firstName === 'string' ? req.body.firstName : ''
    const lastName = typeof req.body?.lastName === 'string' ? req.body.lastName : ''
    const phone = typeof req.body?.phone === 'string' ? req.body.phone : ''

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role,
        first_name: firstName?.trim() || null,
        last_name: lastName?.trim() || null,
        phone: phone?.trim() || null,
      },
    })

    if (error) {
      const msg = error.message || 'Signup failed'
      const code = msg.toLowerCase().includes('already') ? 409 : 400
      await logAdminSecurityEvent({
        req,
        email,
        role,
        success: false,
        reason: `dev_signup_confirmed_error:${msg.slice(0, 180)}`,
        endpoint: DEV_CONFIRM_SIGNUP_ENDPOINT,
      })
      res.status(code).json({
        success: false,
        error: msg,
      })
      return
    }

    res.status(200).json({
      success: true,
      userId: data.user.id,
    })
    await logAdminSecurityEvent({
      req,
      email,
      role,
      success: true,
      reason: 'dev_signup_confirmed_created',
      endpoint: DEV_CONFIRM_SIGNUP_ENDPOINT,
    })
  } catch (e: unknown) {
    const ctx = buildAuditContext(req)
    await logAdminSecurityEvent({
      req,
      email: ctx.email,
      role: ctx.role,
      success: false,
      reason: `dev_signup_confirmed_unhandled:${errText(e).slice(0, 180)}`,
      endpoint: DEV_CONFIRM_SIGNUP_ENDPOINT,
    })
    res.status(502).json({
      success: false,
      error: 'Service is unavailable',
      detail: errText(e),
    })
  }
})

router.post('/resend-confirmation', async (req: Request, res: Response): Promise<void> => {
  try {
    const email = String(req.body?.email ?? '').trim().toLowerCase()
    const dryRun = req.body?.dryRun === true
    if (!email || !email.includes('@')) {
      res.status(400).json({ success: false, error: 'Invalid email' })
      return
    }

    const ip = requestIp(req)
    const rateKey = `${ip}::${email}`
    const rl = consumeResendAttempt(rateKey)
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfterSec))
      res.status(429).json({ success: false, error: 'Too many attempts. Retry later.' })
      return
    }

    const fromBodyRedirect = typeof req.body?.redirectTo === 'string' ? req.body.redirectTo : null
    const redirectTo = normalizeAuthCallbackUrl(fromBodyRedirect)

    const anonClient = buildSupabaseAnonClient()
    if (!anonClient) {
      res.status(500).json({ success: false, error: 'Missing SUPABASE_URL or SUPABASE_ANON_KEY' })
      return
    }

    if (dryRun) {
      res.status(200).json({
        success: true,
        dryRun: true,
        configured: true,
        redirectTo: redirectTo ?? null,
      })
      return
    }

    const { error } = await anonClient.auth.resend({
      type: 'signup',
      email,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    })

    if (error) {
      const debug = process.env.AUTH_RESEND_DEBUG === '1'
      res.status(200).json({ success: true, delivered: false, ...(debug ? { debugError: error.message } : null) })
      return
    }

    res.status(200).json({ success: true, delivered: true })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: errText(e) })
  }
})

router.post('/admin/confirm-email', async (req: Request, res: Response): Promise<void> => {
  try {
    const adminToken = readEnvAny(['AUTH_ADMIN_SIGNUP_TOKEN', 'ADMIN_SIGNUP_TOKEN'])
    if (!adminToken) {
      res.status(500).json({ success: false, error: 'Missing AUTH_ADMIN_SIGNUP_TOKEN' })
      return
    }

    const provided = adminSignupToken(req)
    if (!provided || !timingSafeTokenEquals(provided, adminToken)) {
      res.status(403).json({ success: false, error: 'Forbidden' })
      return
    }

    const email = String(req.body?.email ?? '').trim().toLowerCase()
    if (!email || !email.includes('@')) {
      res.status(400).json({ success: false, error: 'Invalid email' })
      return
    }

    const supabaseAdmin = buildSupabaseAdminClient()
    if (!supabaseAdmin) {
      res.status(500).json({ success: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' })
      return
    }

    let foundUser: { id: string; email?: string | null; email_confirmed_at?: string | null } | null = null
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
      if (error) throw error
      const users = (data.users as Array<{ id: string; email?: string | null; email_confirmed_at?: string | null }>) ?? []
      const u = users.find((x) => String(x.email ?? '').toLowerCase() === email) ?? null
      if (u) {
        foundUser = { id: u.id, email: u.email ?? null, email_confirmed_at: u.email_confirmed_at ?? null }
        break
      }
      if (users.length < 200) break
    }

    if (!foundUser) {
      res.status(404).json({ success: false, error: 'Not found' })
      return
    }

    const { data: updated, error: updErr } = await supabaseAdmin.auth.admin.updateUserById(foundUser.id, {
      email_confirm: true,
    })
    if (updErr) throw updErr

    res.status(200).json({ success: true, userId: updated.user.id })
  } catch (e: unknown) {
    res.status(502).json({ success: false, error: errText(e) })
  }
})



/**
 * User Logout
 * POST /api/auth/logout
 */
router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({
    success: true,
    message: 'ok',
    received: {
      userId: req.body?.userId,
    },
  })
})

export default router
