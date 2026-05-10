import request from 'supertest'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const getUserMock = vi.fn()
const rpcMock = vi.fn()
const createClientMock = vi.fn()

vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: (...args: unknown[]) => createClientMock(...args),
  }
})

function buildMockClient() {
  return {
    auth: {
      getUser: getUserMock,
    },
    rpc: rpcMock,
  }
}

describe('ai-tools routes (notes + floor tools)', () => {
  let app: unknown

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'sb_publishable_test_key'
    createClientMock.mockImplementation(() => buildMockClient())
    ;({ default: app } = await import('../app'))
  }, 30_000)

  beforeEach(() => {
    getUserMock.mockReset()
    rpcMock.mockReset()
    createClientMock.mockClear()
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null })
    rpcMock.mockResolvedValue({ data: [], error: null })
  })

  it('rejects without bearer token', async () => {
    const res = await request(app as never).get('/api/ai-tools/notes').expect(401)
    expect(res.body?.success).toBe(false)
  })

  it('requires businessId on notes list', async () => {
    const res = await request(app as never)
      .get('/api/ai-tools/notes')
      .set('Authorization', 'Bearer test.jwt')
      .expect(400)
    expect(res.body?.success).toBe(false)
  })

  it('calls RPC list_business_operational_notes', async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ id: 'n1' }], error: null })
    const res = await request(app as never)
      .get('/api/ai-tools/notes')
      .query({ businessId: '11111111-1111-4111-8111-111111111111', limit: 10 })
      .set('Authorization', 'Bearer test.jwt')
      .expect(200)
    expect(res.body?.success).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('list_business_operational_notes', expect.any(Object))
  })

  it('requires businessId on floor-plan bundle', async () => {
    const res = await request(app as never)
      .get('/api/ai-tools/floor-plan/bundle')
      .set('Authorization', 'Bearer test.jwt')
      .expect(400)
    expect(res.body?.success).toBe(false)
  })

  it('calls RPC ai_get_floor_plan_bundle', async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ floor_plan_id: 'fp1' }], error: null })
    const res = await request(app as never)
      .get('/api/ai-tools/floor-plan/bundle')
      .query({ businessId: '11111111-1111-4111-8111-111111111111' })
      .set('Authorization', 'Bearer test.jwt')
      .expect(200)
    expect(res.body?.success).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('ai_get_floor_plan_bundle', expect.any(Object))
  })

  it('calls RPC ai_list_business_bookings', async () => {
    rpcMock.mockResolvedValueOnce({ data: [{ id: 'b1' }], error: null })
    const res = await request(app as never)
      .get('/api/ai-tools/bookings/list')
      .query({
        businessId: '11111111-1111-4111-8111-111111111111',
        from: '2026-05-01T00:00:00.000Z',
        to: '2026-05-08T00:00:00.000Z',
      })
      .set('Authorization', 'Bearer test.jwt')
      .expect(200)
    expect(res.body?.success).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('ai_list_business_bookings', expect.any(Object))
  })

  it('maps ai_booking_operator_disabled to 403', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'ai_booking_operator_disabled' } })
    const res = await request(app as never)
      .get('/api/ai-tools/bookings/list')
      .query({
        businessId: '11111111-1111-4111-8111-111111111111',
        from: '2026-05-01T00:00:00.000Z',
        to: '2026-05-08T00:00:00.000Z',
      })
      .set('Authorization', 'Bearer test.jwt')
      .expect(403)
    expect(res.body?.success).toBe(false)
  })
})
