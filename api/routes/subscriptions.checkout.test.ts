import request from 'supertest'
import type { Express } from 'express'
import { beforeAll, describe, expect, it } from 'vitest'

describe('subscription checkout routes', () => {
  let app: Express

  beforeAll(async () => {
    process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'https://example.supabase.co'
    process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'anon_test_key'
    delete process.env.STRIPE_SECRET_KEY
    const mod = await import('../app')
    app = mod.default as Express
  }, 60_000)

  it('returns 401 without bearer on business checkout-session', async () => {
    const res = await request(app).post('/api/subscriptions/business/checkout-session').send({
      businessId: '00000000-0000-4000-8000-000000000001',
      targetPlanId: 'business_pro',
    })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('returns 401 without bearer on customer checkout-session', async () => {
    const res = await request(app).post('/api/subscriptions/customer/checkout-session').send({
      targetPlanId: 'customer_plus',
    })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })

  it('returns 401 without bearer on stripe confirm-session', async () => {
    const res = await request(app).post('/api/subscriptions/stripe/confirm-session').send({
      sessionId: 'cs_test_123',
    })
    expect(res.status).toBe(401)
    expect(res.body.success).toBe(false)
  })
})
