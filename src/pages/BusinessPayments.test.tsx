import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import BusinessPayments from '@/pages/BusinessPayments'
import { useAuth } from '@/providers/authContext'
import type { BusinessRow } from '@/domain/supabase'

vi.mock('@/components/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div>,
}))

vi.mock('@/providers/authContext', () => ({ useAuth: vi.fn() }))

const fromMock = vi.fn()

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}))

function makeBusiness(overrides: Partial<BusinessRow> = {}): BusinessRow {
  return {
    id: 'biz-pay-1',
    owner_user_id: 'owner-1',
    name: 'Salon Pay Test',
    category: 'parrucchiere',
    description: null,
    address_text: null,
    postal_code: null,
    city: null,
    timezone: 'Europe/Rome',
    phone: null,
    email: null,
    website: null,
    logo_url: null,
    gallery_urls: [],
    is_paused: false,
    listing_visible: true,
    lat: 0,
    lng: 0,
    min_gap_min: 0,
    approval_mode: 'risk_based',
    required_reliability_min: 60,
    cancellation_window_min: 60,
    booking_lead_time_min: 0,
    deposit_enabled: true,
    deposit_rule: 'risky_only',
    deposit_risky_threshold: 60,
    block_reliability_threshold: 15,
    auto_block_no_show_count: 3,
    deposit_fixed_cents: 1000,
    deposit_percent: null,
    deposit_min_cents: null,
    deposit_max_cents: null,
    created_at: '2026-01-01T00:00:00.000Z',
    deposit_mode: 'none',
    deposit_value_type: 'percentage',
    deposit_green_rule: { type: 'percentage', value: 0 },
    deposit_yellow_rule: { type: 'percentage', value: 0 },
    deposit_red_rule: { type: 'percentage', value: 0 },
    manual_approval_for_high_risk: false,
    cancellation_free_until_hours: 24,
    refund_policy: 'flexible',
    deposit_retained_on_no_show: false,
    deposit_retained_on_late_cancel: false,
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function createChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    in: () => chain,
    then: (onOk: (v: typeof result) => void) => Promise.resolve(result).then(onOk),
  }
  return chain
}

describe('BusinessPayments', () => {
  const fetchMock = vi.fn()

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    vi.clearAllMocks()
    ;(useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      session: { user: { id: 'user-1' }, access_token: 'jwt-test' },
      loading: false,
    })

    fromMock.mockImplementation((table: string) => {
      if (table === 'businesses') {
        return createChain({ data: [makeBusiness()], error: null })
      }
      if (table === 'team_members') {
        return createChain({ data: [], error: null })
      }
      return createChain({ data: [], error: null })
    })

    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        rows: [
          {
            id: 'pay-1',
            booking_id: 'bk-1',
            provider: 'stripe',
            kind: 'deposit',
            amount_cents: 2500,
            currency: 'eur',
            stripe_session_id: null,
            stripe_payment_intent_id: null,
            status: 'paid',
            created_at: '2026-01-10T10:00:00.000Z',
            updated_at: '2026-01-10T10:00:00.000Z',
            booking: {
              id: 'bk-1',
              start_at: '2026-01-11T12:00:00.000Z',
              end_at: '2026-01-11T13:00:00.000Z',
              service_name: 'Taglio',
              customer: { first_name: 'Luigi', last_name: 'Bianchi', phone: null },
            },
          },
        ],
      }),
    })
  })

  it('carica pagamenti e mostra riga caparra dopo fetch API', async () => {
    render(<BusinessPayments />)

    await screen.findByText(/Caparra/i)
    await screen.findByText(/Taglio/)
    await screen.findByText(/Luigi/)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/stripe/business/payments?'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer jwt-test' }) }),
    )
  })

  it('pulsante Aggiorna richiama di nuovo il caricamento pagamenti', async () => {
    render(<BusinessPayments />)

    await screen.findByText(/Taglio/)
    const initialCalls = fetchMock.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: /Aggiorna/i }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(initialCalls)
    })
  })

  it('empty state quando non ci sono attività collegate', async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === 'businesses') return createChain({ data: [], error: null })
      if (table === 'team_members') return createChain({ data: [], error: null })
      return createChain({ data: [], error: null })
    })

    render(<BusinessPayments />)

    await screen.findByText(/Nessuna attività collegata/i)
  })
})
