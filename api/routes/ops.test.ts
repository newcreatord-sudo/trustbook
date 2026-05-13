import request from 'supertest'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

describe('ops routes (sentry-test)', () => {
  let app: unknown

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test_key'
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_test_key'
    process.env.APP_BASE_URL = 'https://app.example.com'
    process.env.VITE_APP_URL = 'https://app.example.com'
    delete process.env.OPS_REVIEW_REPORTS_TOKEN
    delete process.env.CRON_SECRET

    ;({ default: app } = await import('../app'))
  }, 30_000)

  beforeEach(() => {
    delete process.env.OPS_REVIEW_REPORTS_TOKEN
    delete process.env.CRON_SECRET
  })

  it('returns 503 when token is not configured', async () => {
    const res = await request(app as Parameters<typeof request>[0]).get('/api/ops/sentry-test')
    expect(res.status).toBe(503)
  })

  it('returns 401 when unauthorized', async () => {
    process.env.OPS_REVIEW_REPORTS_TOKEN = 'topsecret-token'
    const res = await request(app as Parameters<typeof request>[0]).get('/api/ops/sentry-test')
    expect(res.status).toBe(401)
  })

  it('returns 200 when authorized', async () => {
    process.env.OPS_REVIEW_REPORTS_TOKEN = 'topsecret-token'
    const res = await request(app as Parameters<typeof request>[0])
      .get('/api/ops/sentry-test')
      .set('authorization', 'Bearer topsecret-token')
    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })
})

