import { describe, expect, it, vi } from 'vitest'
import { fetchReviewReportsAdmin } from './reviewReportsOps.js'

describe('fetchReviewReportsAdmin', () => {
  it('returns RPC rows', async () => {
    const sbAdmin = {
      rpc: vi.fn().mockResolvedValue({
        data: [
          {
            report_id: 'rep-1',
            reported_at: '2026-04-01T00:00:00.000Z',
            reporter_user_id: 'user-1',
            review_id: 'rev-1',
            review_direction: 'customer_to_business',
            review_rating: 4,
            review_comment: 'ok',
            review_business_id: 'biz-1',
            review_booking_id: 'bk-1',
            review_created_at: '2026-03-31T00:00:00.000Z',
            reason: 'test reason here twelve',
          },
        ],
        error: null,
      }),
    }
    const rows = await fetchReviewReportsAdmin({ sbAdmin: sbAdmin as never, limit: 50 })
    expect(sbAdmin.rpc).toHaveBeenCalledWith('list_review_reports_admin', { p_limit: 50 })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.report_id).toBe('rep-1')
  })

  it('propagates RPC errors', async () => {
    const sbAdmin = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'rpc boom' },
      }),
    }
    await expect(fetchReviewReportsAdmin({ sbAdmin: sbAdmin as never, limit: 10 })).rejects.toThrow('rpc boom')
  })
})
