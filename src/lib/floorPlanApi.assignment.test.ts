import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assignTableToBooking, autoAssignResourceForBooking } from '@/lib/floorPlanApi'

const getSessionMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: (...args: unknown[]) => getSessionMock(...args) },
  },
}))

describe('floorPlanApi booking assignment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('assignTableToBooking calls Booking API with bearer token', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null })
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })

    await assignTableToBooking('b1', 'r1', 4)

    expect(fetch).toHaveBeenCalledWith(
      '/api/bookings/business/assign-resource',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer tok',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ bookingId: 'b1', resourceId: 'r1', partySize: 4 }),
      }),
    )
  })

  it('autoAssignResourceForBooking returns resourceId', async () => {
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'tok' } }, error: null })
    ;(fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, resourceId: 'res-1' }),
    })

    await expect(autoAssignResourceForBooking('b1', 3)).resolves.toBe('res-1')
  })

  it('throws when session is missing', async () => {
    getSessionMock.mockResolvedValue({ data: { session: null }, error: null })
    await expect(assignTableToBooking('b1', 'r1', 2)).rejects.toThrow(/Sessione non valida/i)
  })
})

