import request from 'supertest'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const createClientMock = vi.fn()
const rpcMock = vi.fn()

vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: (...args: unknown[]) => createClientMock(...args),
  }
})

describe('bookings routes (resource assignment)', () => {
  let app: unknown

  beforeAll(async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon_test_key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test_key'
    process.env.APP_BASE_URL = 'https://app.example.com'
    process.env.VITE_APP_URL = 'https://app.example.com'

    createClientMock.mockImplementation(() => ({
      rpc: (...args: unknown[]) => rpcMock(...args),
    }))

    ;({ default: app } = await import('../app'))
  }, 30_000)

  beforeEach(() => {
    rpcMock.mockReset()
    createClientMock.mockClear()
    createClientMock.mockImplementation(() => ({
      rpc: (...args: unknown[]) => rpcMock(...args),
    }))
  })

  it('assign-resource returns 401 when unauthorized', async () => {
    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/bookings/business/assign-resource')
      .send({
        bookingId: '11111111-1111-4111-8111-111111111111',
        resourceId: '22222222-2222-4222-8222-222222222222',
      })
    expect(res.status).toBe(401)
  })

  it('assign-resource returns 400 when missing ids', async () => {
    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/bookings/business/assign-resource')
      .set('authorization', 'Bearer tok')
      .send({})
    expect(res.status).toBe(400)
  })

  it('assign-resource calls assign_table_to_booking and sets party_size', async () => {
    rpcMock.mockImplementation(async (fnName: string) => {
      if (fnName === 'assign_table_to_booking') return { data: null, error: null }
      if (fnName === 'set_booking_primary_resource') return { data: null, error: null }
      return { data: null, error: null }
    })

    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/bookings/business/assign-resource')
      .set('authorization', 'Bearer tok')
      .send({
        bookingId: '11111111-1111-4111-8111-111111111111',
        resourceId: '22222222-2222-4222-8222-222222222222',
        partySize: 4,
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(rpcMock).toHaveBeenCalledWith('assign_table_to_booking', {
      p_booking_id: '11111111-1111-4111-8111-111111111111',
      p_resource_id: '22222222-2222-4222-8222-222222222222',
    })
    expect(rpcMock).toHaveBeenCalledWith('set_booking_primary_resource', {
      p_booking_id: '11111111-1111-4111-8111-111111111111',
      p_resource_id: '22222222-2222-4222-8222-222222222222',
      p_party_size: 4,
    })
  })

  it('auto-assign-resource returns resourceId', async () => {
    rpcMock.mockImplementation(async (fnName: string) => {
      if (fnName === 'auto_assign_resource_for_booking') return { data: '33333333-3333-4333-8333-333333333333', error: null }
      return { data: null, error: null }
    })

    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/bookings/business/auto-assign-resource')
      .set('authorization', 'Bearer tok')
      .send({ bookingId: '11111111-1111-4111-8111-111111111111', partySizeHint: 3 })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.resourceId).toBe('33333333-3333-4333-8333-333333333333')
  })
})

