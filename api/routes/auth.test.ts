import request from 'supertest'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const createUserMock = vi.fn()
const resendMock = vi.fn()
const listUsersMock = vi.fn()
const updateUserByIdMock = vi.fn()
const insertMock = vi.fn()
const fromMock = vi.fn()
const createClientMock = vi.fn()

vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: (...args: unknown[]) => createClientMock(...args),
  }
})

function buildMockClient() {
  return {
    auth: {
      resend: resendMock,
      admin: {
        createUser: createUserMock,
        listUsers: listUsersMock,
        updateUserById: updateUserByIdMock,
      },
    },
    from: fromMock,
  }
}

describe('auth admin-signup security', () => {
  let app: unknown

  beforeAll(async () => {
    process.env.AUTH_ADMIN_SIGNUP_TOKEN = 'topsecret-token'
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test_key'
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_test_key'
    process.env.APP_BASE_URL = 'https://app.example.com'
    process.env.AUTH_ADMIN_SIGNUP_MAX_ATTEMPTS = '1'
    process.env.AUTH_ADMIN_SIGNUP_RATE_LIMIT_WINDOW_MS = '60000'

    createClientMock.mockImplementation(() => buildMockClient())
    ;({ default: app } = await import('../app'))
  }, 30_000)

  beforeEach(() => {
    delete process.env.AUTH_DEV_SIGNUP_CONFIRMED
    createUserMock.mockReset()
    resendMock.mockReset()
    listUsersMock.mockReset()
    updateUserByIdMock.mockReset()
    insertMock.mockReset()
    fromMock.mockReset()
    createClientMock.mockClear()

    createUserMock.mockResolvedValue({
      data: { user: { id: 'user_123' } },
      error: null,
    })
    resendMock.mockResolvedValue({ error: null })
    listUsersMock.mockResolvedValue({ data: { users: [] }, error: null })
    updateUserByIdMock.mockResolvedValue({ data: { user: { id: 'user_123' } }, error: null })

    insertMock.mockResolvedValue({ error: null })
    fromMock.mockReturnValue({
      insert: insertMock,
    })

    createClientMock.mockImplementation(() => buildMockClient())
  })

  it('resends signup confirmation email when payload is valid', async () => {
    const res = await request(app as Parameters<typeof request>[0]).post('/api/auth/resend-confirmation').send({
      email: 'pending-user@example.com',
    })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.delivered).toBe(true)
    expect(resendMock).toHaveBeenCalledTimes(1)
    expect(resendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'signup',
        email: 'pending-user@example.com',
      }),
    )
  })

  it('ignores invalid redirectTo origins and enforces /auth/callback', async () => {
    const res = await request(app as Parameters<typeof request>[0]).post('/api/auth/resend-confirmation').send({
      email: 'pending-user@example.com',
      redirectTo: 'https://evil.example.com/phish',
    })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(resendMock).toHaveBeenCalledTimes(1)
    expect(resendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ emailRedirectTo: 'https://app.example.com/auth/callback' }),
      }),
    )
  })

  it('supports resend confirmation dry-run for environment smoke checks', async () => {
    const res = await request(app as Parameters<typeof request>[0]).post('/api/auth/resend-confirmation').send({
      email: 'pending-user@example.com',
      dryRun: true,
    })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.dryRun).toBe(true)
    expect(res.body.configured).toBe(true)
    expect(resendMock).not.toHaveBeenCalled()
  })

  it('confirms user email via admin endpoint when token is valid', async () => {
    listUsersMock.mockResolvedValue({
      data: { users: [{ id: 'user_999', email: 'pending-user@example.com', email_confirmed_at: null }] },
      error: null,
    })
    updateUserByIdMock.mockResolvedValue({ data: { user: { id: 'user_999' } }, error: null })

    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/auth/admin/confirm-email')
      .set('x-admin-signup-token', 'topsecret-token')
      .send({ email: 'pending-user@example.com' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.userId).toBe('user_999')
    expect(listUsersMock).toHaveBeenCalled()
    expect(updateUserByIdMock).toHaveBeenCalledWith('user_999', expect.objectContaining({ email_confirm: true }))
  })

  it('rejects resend confirmation with invalid email', async () => {
    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/auth/resend-confirmation')
      .send({ email: 'invalid-email' })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(resendMock).not.toHaveBeenCalled()
  })

  it('returns forbidden when admin token header is missing', async () => {
    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/auth/admin-signup')
      .set('x-forwarded-for', '10.1.1.1')
      .send({
        email: 'missing-token@example.com',
        password: 'password123',
        role: 'cliente',
      })

    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
    expect(res.body.error).toBe('Forbidden')
    expect(createUserMock).not.toHaveBeenCalled()
    expect(fromMock).toHaveBeenCalledWith('admin_security_events')
  })

  it('returns not found for dev signup when disabled', async () => {
    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/auth/dev-signup-confirmed')
      .set('x-forwarded-for', '10.8.8.8')
      .send({
        email: 'dev-off@example.com',
        password: 'password123',
        role: 'cliente',
      })

    expect(res.status).toBe(404)
    expect(createUserMock).not.toHaveBeenCalled()
  })

  it('hides dev signup when NODE_ENV is production', async () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    process.env.AUTH_DEV_SIGNUP_CONFIRMED = 'true'
    try {
      const res = await request(app as Parameters<typeof request>[0])
        .post('/api/auth/dev-signup-confirmed')
        .send({
          email: 'dev-prod@example.com',
          password: 'password123',
          role: 'cliente',
        })

      expect(res.status).toBe(404)
      expect(createUserMock).not.toHaveBeenCalled()
    } finally {
      process.env.NODE_ENV = prev
      delete process.env.AUTH_DEV_SIGNUP_CONFIRMED
    }
  })

  it('creates confirmed user when dev signup enabled', async () => {
    process.env.AUTH_DEV_SIGNUP_CONFIRMED = 'true'
    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/auth/dev-signup-confirmed')
      .set('x-forwarded-for', '10.9.9.9')
      .send({
        email: 'dev-create@example.com',
        password: 'password123',
        role: 'cliente',
        firstName: 'Test',
        lastName: 'User',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.userId).toBe('user_123')
    expect(createUserMock).toHaveBeenCalledTimes(1)
    expect(createUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'dev-create@example.com',
        email_confirm: true,
      }),
    )
    expect(fromMock).toHaveBeenCalledWith('admin_security_events')
  })

  it('creates user when token and payload are valid', async () => {
    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/auth/admin-signup')
      .set('x-admin-signup-token', 'topsecret-token')
      .set('x-forwarded-for', '10.1.1.2')
      .send({
        email: 'valid-signup@example.com',
        password: 'password123',
        role: 'attivita',
        firstName: 'Mario',
        lastName: 'Rossi',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.userId).toBe('user_123')
    expect(createUserMock).toHaveBeenCalledTimes(1)
    expect(fromMock).toHaveBeenCalledWith('admin_security_events')
  })

  it('rate limits repeated attempts on same ip and email', async () => {
    const first = await request(app as Parameters<typeof request>[0])
      .post('/api/auth/admin-signup')
      .set('x-admin-signup-token', 'wrong-token')
      .set('x-forwarded-for', '10.1.1.3')
      .send({
        email: 'limited@example.com',
        password: 'password123',
        role: 'cliente',
      })

    expect(first.status).toBe(403)

    const second = await request(app as Parameters<typeof request>[0])
      .post('/api/auth/admin-signup')
      .set('x-admin-signup-token', 'wrong-token')
      .set('x-forwarded-for', '10.1.1.3')
      .send({
        email: 'limited@example.com',
        password: 'password123',
        role: 'cliente',
      })

    expect(second.status).toBe(429)
    expect(second.body.success).toBe(false)
    expect(second.body.error).toContain('Too many attempts')
    expect(createUserMock).not.toHaveBeenCalled()
  })
})
