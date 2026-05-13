import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ReactNode } from 'react'
import Bookings from '@/pages/Bookings'

const { fromMock, channelMock, removeChannelMock } = vi.hoisted(() => {
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel),
  }
  return {
    fromMock: vi.fn(),
    channelMock: channel,
    removeChannelMock: vi.fn(async () => ({ error: null })),
  }
})

vi.mock('@/components/AppShell', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/BookingChat', () => ({
  default: () => <div>chat-mock</div>,
}))

vi.mock('@/shared/ui/toastContext', () => ({
  useToast: () => ({ push: vi.fn() }),
}))

vi.mock('@/providers/authContext', () => ({
  useAuth: () => ({
    session: { user: { id: 'customer-1' }, access_token: 'token-customer' },
  }),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: fromMock,
    channel: vi.fn(() => channelMock),
    removeChannel: removeChannelMock,
  },
}))

function thenableResult(data: unknown, error: unknown = null) {
  const p = Promise.resolve({ data, error })
  return {
    then: p.then.bind(p),
  }
}

describe('Bookings customer flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/stripe/deposit/cancel')) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              bookingId: 'bk-1',
              inTime: true,
              depositStatus: 'refunded',
              cancelledAt: '2026-06-01T08:00:00.000Z',
            }),
          } as Response
        }
        if (url.includes('/api/bookings/accept-time-proposal')) {
          return {
            ok: true,
            json: async () => ({ success: true, booking: { id: 'bk-1', status: 'confirmed' } }),
          } as Response
        }
        if (url.includes('/api/bookings/reject-time-proposal')) {
          return {
            ok: true,
            json: async () => ({ success: true, booking: { id: 'bk-1', status: 'confirmed' } }),
          } as Response
        }
        if (url.includes('/api/bookings/customer/propose-reschedule')) {
          return {
            ok: true,
            json: async () => ({ success: true, booking: { id: 'bk-1', status: 'change_proposed' } }),
          } as Response
        }
        return { ok: false, json: async () => ({ success: false }) } as Response
      }),
    )

    fromMock.mockImplementation((table: string) => {
      if (table === 'bookings') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () =>
                  thenableResult([
                    {
                      id: 'bk-1',
                      customer_user_id: 'customer-1',
                      business_id: 'biz-1',
                      service_id: 'svc-1',
                      start_at: '2026-06-02T10:00:00.000Z',
                      end_at: '2026-06-02T11:00:00.000Z',
                      status: 'confirmed',
                      deposit_status: 'paid',
                      deposit_amount_cents: 1500,
                      created_at: '2026-01-01T00:00:00.000Z',
                      updated_at: '2026-01-01T00:00:00.000Z',
                      confirmed_at: null,
                      cancelled_at: null,
                      completed_at: null,
                      no_show_at: null,
                      approved_by_user_id: null,
                      rejected_by_user_id: null,
                      rejection_reason: null,
                      proposed_start_at: null,
                      proposed_end_at: null,
                      proposed_by_role: null,
                      proposal_message: null,
                      proposal_created_at: null,
                      businesses: { name: 'Barberia Test', cancellation_window_min: 120, booking_lead_time_min: 0 },
                    },
                  ]),
              }),
            }),
            single: async () => ({ data: null, error: null }),
          }),
        }
      }
      if (table === 'customer_reliability') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  score: 80,
                  stars: 0,
                  completed_count: 2,
                  late_cancel_count: 0,
                  no_show_count: 0,
                },
                error: null,
              }),
              single: async () => ({ data: { score: 81 }, error: null }),
            }),
          }),
        }
      }
      if (table === 'reliability_events') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => thenableResult([]),
              }),
            }),
          }),
        }
      }
      if (table === 'reviews') {
        return {
          select: () => ({
            eq: () => thenableResult([]),
          }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })
  })

  test('shows booking and cancels it via api when allowed', async () => {
    render(
      <MemoryRouter initialEntries={['/prenotazioni']}>
        <Routes>
          <Route path="/prenotazioni" element={<Bookings />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByText(/Barberia Test/i)
    fireEvent.click(screen.getByRole('button', { name: /^Cancella$/i }))

    await screen.findByText(/Confermi annullamento/i)
    fireEvent.click(screen.getByRole('button', { name: /Annulla prenotazione/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled()
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^Cancella$/i })).toBeNull()
    })
  })

  test('accetta una proposta orario attività via api', async () => {
    fromMock.mockImplementationOnce((table: string) => {
      if (table !== 'bookings') throw new Error(`Unexpected table ${table}`)
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: () =>
                thenableResult([
                  {
                    id: 'bk-1',
                    customer_user_id: 'customer-1',
                    business_id: 'biz-1',
                    service_id: 'svc-1',
                    start_at: '2026-06-02T10:00:00.000Z',
                    end_at: '2026-06-02T11:00:00.000Z',
                    status: 'change_proposed',
                    deposit_status: 'paid',
                    deposit_amount_cents: 1500,
                    created_at: '2026-01-01T00:00:00.000Z',
                    updated_at: '2026-01-01T00:00:00.000Z',
                    confirmed_at: null,
                    cancelled_at: null,
                    completed_at: null,
                    no_show_at: null,
                    approved_by_user_id: null,
                    rejected_by_user_id: null,
                    rejection_reason: null,
                    proposed_start_at: '2026-06-02T12:00:00.000Z',
                    proposed_end_at: '2026-06-02T13:00:00.000Z',
                    proposed_by_role: 'attivita',
                    proposal_message: null,
                    proposal_created_at: null,
                    businesses: { name: 'Barberia Test', cancellation_window_min: 120, booking_lead_time_min: 0 },
                  },
                ]),
            }),
          }),
          single: async () => ({ data: null, error: null }),
        }),
      }
    })

    render(
      <MemoryRouter initialEntries={['/prenotazioni']}>
        <Routes>
          <Route path="/prenotazioni" element={<Bookings />} />
        </Routes>
      </MemoryRouter>,
    )

    await screen.findByText(/Barberia Test/i)
    fireEvent.click(screen.getByRole('button', { name: /^Accetta$/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/bookings/accept-time-proposal',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer token-customer',
            'Content-Type': 'application/json',
          }),
        }),
      )
    })
  })
})
