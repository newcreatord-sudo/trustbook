import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookingRow, BusinessRow } from '@/domain/supabase'
import BusinessDashboard from '@/pages/BusinessDashboard'
import { useAuth } from '@/providers/authContext'

const rpcMock = vi.hoisted(() => vi.fn())

/** Prenotazione listata nella tab appuntamenti (override per test no-show su confermata). */
const bookingOverride = vi.hoisted(() => ({ current: null as BookingRow | null }))

const subscriptionMocks = vi.hoisted(() => ({
  fetchBusinessSubscription: vi.fn(),
  fetchSubscriptionPlans: vi.fn(),
}))

const fetchMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/subscriptions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/subscriptions')>()
  return {
    ...actual,
    fetchBusinessSubscription: subscriptionMocks.fetchBusinessSubscription,
    fetchSubscriptionPlans: subscriptionMocks.fetchSubscriptionPlans,
  }
})

function makeBusiness(): BusinessRow {
  return {
    id: 'biz-1',
    owner_user_id: 'owner-1',
    name: 'Barberia Test',
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
    lat: 45.4642,
    lng: 9.19,
    min_gap_min: 0,
    approval_mode: 'risk_based',
    required_reliability_min: 60,
    cancellation_window_min: 120,
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
  }
}

function makePendingBooking(): BookingRow {
  return {
    id: 'bk-pend-1',
    customer_user_id: 'cust-1',
    business_id: 'biz-1',
    service_id: 'svc-1',
    start_at: new Date(Date.now() + 3_600_000).toISOString(),
    end_at: new Date(Date.now() + 7_200_000).toISOString(),
    status: 'pending_approval',
    deposit_status: 'not_required',
    deposit_amount_cents: 0,
    created_at: '2026-01-01T09:00:00.000Z',
    updated_at: '2026-01-01T09:00:00.000Z',
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
  }
}

const kpisPayload = {
  timezone: 'Europe/Rome',
  today_active_count: 0,
  upcoming_7_active_count: 0,
  pending_pipeline_count: 1,
  last30: {
    completed: 0,
    no_show: 0,
    late_cancel: 0,
    show_denominator: 0,
    forfeited_deposit_cents: 0,
    forfeited_deposit_cases: 0,
  },
}

function makeConfirmedBooking(): BookingRow {
  const base = makePendingBooking()
  return {
    ...base,
    id: 'bk-conf-1',
    status: 'confirmed',
    confirmed_at: '2026-01-10T11:00:00.000Z',
  }
}

function createThenableQuery(table: string) {
  const listBooking = bookingOverride.current ?? makePendingBooking()
  const business = makeBusiness()
  const payloadByTable: Record<string, unknown[]> = {
    businesses: [business],
    team_members: [],
    bookings: [listBooking],
    services: [
      {
        id: 'svc-1',
        business_id: 'biz-1',
        name: 'Taglio',
        duration_min: 60,
        price_cents: 2500,
        description: null,
        is_active: true,
        created_at: '2026-01-01T08:00:00.000Z',
        updated_at: '2026-01-01T08:00:00.000Z',
      },
    ],
    business_opening_windows: [
      {
        id: 'w-1',
        business_id: 'biz-1',
        weekday: 1,
        start_time: '09:00:00',
        end_time: '18:00:00',
      },
    ],
    business_closures: [],
    reviews: [],
    customer_reliability: [
      {
        user_id: 'cust-1',
        score: 80,
        stars: 4,
        no_show_count: 0,
        late_cancel_count: 0,
      },
    ],
    profiles: [{ id: 'cust-1', first_name: 'Mario', last_name: 'Rossi', phone: null }],
    business_customer_tags: [],
    booking_internal_notes: [],
    business_customer_blocks: [],
  }

  let executed: Promise<{ data: unknown[]; error: null }> | null = null
  const execute = () => {
    if (!executed) {
      executed = Promise.resolve({ data: payloadByTable[table] ?? [], error: null })
    }
    return executed
  }

  const singleThen = {
    then: (onFulfilled: (v: { data: unknown; error: null }) => void, onRejected?: (e: unknown) => void) =>
      Promise.resolve({ data: { score: 80 }, error: null }).then(onFulfilled, onRejected),
  }

  const deleteChain = {
    eq: () => deleteChain,
    then: (onFulfilled: (v: { data: unknown; error: null }) => void, onRejected?: (e: unknown) => void) =>
      Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected),
  }

  const upsertThen = {
    then: (onFulfilled: (v: { data: unknown; error: null }) => void, onRejected?: (e: unknown) => void) =>
      Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected),
  }

  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    range: () => builder,
    in: () => builder,
    single: () => singleThen,
    upsert: () => upsertThen,
    delete: () => deleteChain,
    update: () => ({
      eq: () => ({
        then: (onFulfilled: (v: { data: unknown; error: null }) => void, onRejected?: (e: unknown) => void) =>
          Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected),
      }),
    }),
    then: (onFulfilled: (v: { data: unknown[]; error: null }) => void, onRejected?: (e: unknown) => void) =>
      execute().then(onFulfilled, onRejected),
  }
  return builder
}

vi.mock('@/components/AppShell', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/providers/authContext', () => ({ useAuth: vi.fn() }))

vi.mock('@/lib/supabase', () => {
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel),
  }
  return {
    supabase: {
      from: vi.fn((table: string) => createThenableQuery(table)),
      rpc: (...args: unknown[]) => rpcMock(...args),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => ({ error: null })),
    },
  }
})

vi.mock('@/pages/dashboard/BusinessSettingsPanel', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/ServicesManager', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/ScheduleManager', () => ({ default: () => null }))
vi.mock('@/components/BookingChat', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/StaffManager', () => ({ default: () => null }))
vi.mock('@/components/OwnerOnlyPanel', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}))
vi.mock('@/pages/dashboard/BookingFiltersBar', async () => {
  const mod = await import('@/pages/dashboard/BookingFiltersBar')
  return { default: mod.default }
})
vi.mock('@/pages/dashboard/BookingInternalNote', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/CustomerTags', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/BookingTimeline', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/BusinessCalendarView', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/BusinessHealthPanel', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/BusinessAlertsPanel', () => ({ default: () => null }))
vi.mock('@/pages/dashboard/BusinessAiSuggestionsPanel', () => ({ default: () => null }))

describe('BusinessDashboard booking actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    bookingOverride.current = null
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('cancel-by-business')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            cancelledAt: '2026-01-15T12:00:00.000Z',
            depositStatus: 'not_required',
          }),
        })
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      })
    })
    subscriptionMocks.fetchBusinessSubscription.mockResolvedValue(null)
    subscriptionMocks.fetchSubscriptionPlans.mockResolvedValue([])
    rpcMock.mockImplementation(async (fnName: string, params?: Record<string, unknown>) => {
      if (fnName === 'business_dashboard_booking_kpis') {
        return { data: kpisPayload, error: null }
      }
      if (fnName === 'business_approve_pending_booking') {
        const row = { ...makePendingBooking(), status: 'confirmed' as const, confirmed_at: new Date().toISOString() }
        return { data: row, error: null }
      }
      if (fnName === 'business_reject_pending_booking') {
        const row = {
          ...makePendingBooking(),
          status: 'rejected' as const,
          rejected_by_user_id: 'owner-1',
          rejection_reason: null,
        }
        return { data: row, error: null }
      }
      if (fnName === 'transition_booking_state') {
        const base = bookingOverride.current ?? makePendingBooking()
        const nextStatus = params?.p_next_status
        if (nextStatus === 'no_show') {
          return {
            data: { ...base, status: 'no_show' as const, deposit_status: (params?.p_next_deposit_status as string) ?? base.deposit_status, no_show_at: new Date().toISOString() },
            error: null,
          }
        }
        if (nextStatus === 'completed') {
          return { data: { ...base, status: 'completed' as const, completed_at: new Date().toISOString() }, error: null }
        }
        return { data: base, error: null }
      }
      return { data: null, error: null }
    })
    ;(useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      session: { user: { id: 'owner-1' }, access_token: 'token' },
      profile: { role: 'attivita' },
      loading: false,
    })
  })

  afterEach(() => {
    rpcMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('Approva chiama RPC business_approve_pending_booking', async () => {
    render(
      <MemoryRouter initialEntries={['/?tab=prenotazioni']}>
        <BusinessDashboard />
      </MemoryRouter>,
    )

    await screen.findByText(/Lista e azioni rapide/i, {}, { timeout: 10_000 })
    const approveButtons = await screen.findAllByRole('button', { name: /^Approva$/i })
    expect(approveButtons.length).toBeGreaterThan(0)
    fireEvent.click(approveButtons[0]!)

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith(
        'business_approve_pending_booking',
        expect.objectContaining({ p_booking_id: 'bk-pend-1' }),
      )
    })
    await screen.findByText(/Approvata/i)
  })

  it('Rifiuta dopo conferma chiama business_reject_pending_booking', async () => {
    render(
      <MemoryRouter initialEntries={['/?tab=prenotazioni']}>
        <BusinessDashboard />
      </MemoryRouter>,
    )

    await screen.findByText(/Lista e azioni rapide/i, {}, { timeout: 10_000 })
    const rejectButtons = await screen.findAllByRole('button', { name: /^Rifiuta$/i })
    expect(rejectButtons.length).toBeGreaterThan(0)
    fireEvent.click(rejectButtons[0]!)

    const dialog = await screen.findByRole('dialog')
    const confirmReject = within(dialog).getByRole('button', { name: /^Rifiuta$/i })
    fireEvent.click(confirmReject)

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith(
        'business_reject_pending_booking',
        expect.objectContaining({ p_booking_id: 'bk-pend-1' }),
      )
    })
  })

  it('Annulla dopo conferma chiama POST /api/stripe/deposit/cancel-by-business', async () => {
    render(
      <MemoryRouter initialEntries={['/?tab=prenotazioni']}>
        <BusinessDashboard />
      </MemoryRouter>,
    )

    await screen.findByText(/Lista e azioni rapide/i, {}, { timeout: 10_000 })
    const cancelButtons = await screen.findAllByRole('button', { name: /^Annulla$/i })
    expect(cancelButtons.length).toBeGreaterThan(0)
    fireEvent.click(cancelButtons[0]!)

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Annulla prenotazione/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/stripe/deposit/cancel-by-business',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ bookingId: 'bk-pend-1' }),
        }),
      )
    })
  })

  it('No-show dopo conferma aggiorna e mostra conferma', async () => {
    bookingOverride.current = makeConfirmedBooking()

    render(
      <MemoryRouter initialEntries={['/?tab=prenotazioni']}>
        <BusinessDashboard />
      </MemoryRouter>,
    )

    await screen.findByText(/Lista e azioni rapide/i, {}, { timeout: 10_000 })
    const viewTabs = screen.getByRole('tablist', { name: /Lista appuntamenti: oggi o tutte/i })
    fireEvent.click(within(viewTabs).getByRole('tab', { name: /^Tutte$/i }))

    const filtersSection = screen.getByRole('region', { name: /Filtri appuntamenti/i })
    fireEvent.click(within(filtersSection).getByRole('tab', { name: /Confermate/i }))

    const noShowBtns = await screen.findAllByRole('button', { name: /^No-show$/i })
    expect(noShowBtns.length).toBeGreaterThan(0)
    fireEvent.click(noShowBtns[0]!)

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Segna no-show/i }))

    await screen.findByText(/^Aggiornato\.$/i, {}, { timeout: 10_000 })
  })

  it('Completata dopo conferma aggiorna la prenotazione', async () => {
    bookingOverride.current = makeConfirmedBooking()

    render(
      <MemoryRouter initialEntries={['/?tab=prenotazioni']}>
        <BusinessDashboard />
      </MemoryRouter>,
    )

    await screen.findByText(/Lista e azioni rapide/i, {}, { timeout: 10_000 })
    const viewTabs = screen.getByRole('tablist', { name: /Lista appuntamenti: oggi o tutte/i })
    fireEvent.click(within(viewTabs).getByRole('tab', { name: /^Tutte$/i }))

    const filtersSection = screen.getByRole('region', { name: /Filtri appuntamenti/i })
    fireEvent.click(within(filtersSection).getByRole('tab', { name: /Confermate/i }))

    const completeBtns = await screen.findAllByRole('button', { name: /^Completata$/i })
    expect(completeBtns.length).toBeGreaterThan(0)
    fireEvent.click(completeBtns[0]!)

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Segna completata/i }))

    await screen.findByText(/^Aggiornato\.$/i, {}, { timeout: 10_000 })
  })

  it('Blocca cliente (dettagli) esegue upsert su business_customer_blocks', async () => {
    bookingOverride.current = makeConfirmedBooking()
    const { supabase } = await import('@/lib/supabase')

    render(
      <MemoryRouter initialEntries={['/?tab=prenotazioni']}>
        <BusinessDashboard />
      </MemoryRouter>,
    )

    await screen.findByText(/Lista e azioni rapide/i, {}, { timeout: 10_000 })

    const viewTabs = screen.getByRole('tablist', { name: /Lista appuntamenti: oggi o tutte/i })
    fireEvent.click(within(viewTabs).getByRole('tab', { name: /^Tutte$/i }))

    const filtersSection = screen.getByRole('region', { name: /Filtri appuntamenti/i })
    fireEvent.click(within(filtersSection).getByRole('tab', { name: /Confermate/i }))

    const detailButtons = await screen.findAllByRole('button', { name: /^Dettagli$/i })
    fireEvent.click(detailButtons[0]!)

    const blockBtn = await screen.findByRole('button', { name: /^Blocca$/i })
    fireEvent.click(blockBtn)

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /Blocca cliente/i }))

    await waitFor(() => {
      expect(supabase.from).toHaveBeenCalledWith('business_customer_blocks')
    })
    await screen.findByText(/Cliente bloccato/i, {}, { timeout: 10_000 })
  })
})
