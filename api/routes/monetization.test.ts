import request from 'supertest'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const upsertMock = vi.fn()
const selectMock = vi.fn()
const singleMock = vi.fn()
const eqMock = vi.fn()
const fromMock = vi.fn()
const createClientMock = vi.fn()

vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: (...args: unknown[]) => createClientMock(...args),
  }
})

function buildMockClient() {
  return {
    from: fromMock,
  }
}

describe('monetization admin fee overrides', () => {
  let app: unknown

  beforeAll(async () => {
    process.env.AUTH_ADMIN_SIGNUP_TOKEN = 'topsecret-token'
    process.env.SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test_key'

    createClientMock.mockImplementation(() => buildMockClient())
    ;({ default: app } = await import('../app'))
  }, 30_000)

  beforeEach(() => {
    upsertMock.mockReset()
    selectMock.mockReset()
    singleMock.mockReset()
    eqMock.mockReset()
    fromMock.mockReset()
    createClientMock.mockClear()

    singleMock.mockResolvedValue({ data: { business_id: 'biz', percent_min: 0 }, error: null })
    selectMock.mockReturnValue({ single: singleMock })
    upsertMock.mockReturnValue({ select: selectMock })

    eqMock.mockResolvedValue({ error: null })

    fromMock.mockImplementation((table: string) => {
      if (table === 'business_platform_fee_overrides') {
        return {
          upsert: upsertMock,
          delete: () => ({ eq: eqMock }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })

    createClientMock.mockImplementation(() => buildMockClient())
  })

  it('rejects upsert when admin token header is missing', async () => {
    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/monetization/admin/fee-override/upsert')
      .send({
        businessId: '9f0b3c79-8d69-4c73-a3f5-4d67b50af32b',
        percentMin: 0,
        percentMax: 0,
        percentDefault: 0,
        fixedCents: 0,
      })

    expect(res.status).toBe(403)
    expect(res.body.success).toBe(false)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('upserts override with admin token', async () => {
    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/monetization/admin/fee-override/upsert')
      .set('X-Admin-Signup-Token', 'topsecret-token')
      .send({
        businessId: '9f0b3c79-8d69-4c73-a3f5-4d67b50af32b',
        percentMin: 0,
        percentMax: 1,
        percentDefault: 1,
        fixedCents: 0,
        note: 'promo',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(upsertMock).toHaveBeenCalledTimes(1)
  })

  it('deletes override with admin token', async () => {
    const res = await request(app as Parameters<typeof request>[0])
      .post('/api/monetization/admin/fee-override/delete')
      .set('X-Admin-Signup-Token', 'topsecret-token')
      .send({ businessId: '9f0b3c79-8d69-4c73-a3f5-4d67b50af32b' })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(eqMock).toHaveBeenCalledTimes(1)
  })
})
