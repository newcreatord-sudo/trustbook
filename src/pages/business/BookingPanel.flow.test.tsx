import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import BookingPanel from '@/pages/business/BookingPanel'
import type { BookableStaffOptionRow, BusinessRow, BookingRow, ServiceRow } from '@/domain/supabase'

const floorPlanMocks = vi.hoisted(() => ({
  listAvailableResourcesForSlot: vi.fn(),
  getFloorPlanPreviewForCustomerBooking: vi.fn(),
}))

vi.mock('@/lib/floorPlanApi', () => ({
  listAvailableResourcesForSlot: floorPlanMocks.listAvailableResourcesForSlot,
  getFloorPlanPreviewForCustomerBooking: floorPlanMocks.getFloorPlanPreviewForCustomerBooking,
}))

vi.mock('@/lib/storage', () => ({
  createBusinessPrivateSignedUrl: vi.fn().mockResolvedValue('https://example.invalid/signed'),
}))

const mockTableRows = [
  {
    resource_id: 'res-table-1',
    label: 'T1',
    kind: 'table' as const,
    capacity_min: 2,
    capacity_max: 4,
    zone: 'sala',
    position_json: {},
    floor_plan_name: 'Sala',
    floor_plan_id: 'fp-1',
  },
]

function bookingRow(): BookingRow {
  return {
    id: 'bk-1',
    customer_user_id: 'customer-1',
    business_id: 'biz-1',
    service_id: 'svc-1',
    start_at: '2026-06-01T09:00:00.000Z',
    end_at: '2026-06-01T10:00:00.000Z',
    status: 'pending_deposit',
    deposit_status: 'required',
    deposit_amount_cents: 1000,
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
  }
}

describe('BookingPanel flow', () => {
  beforeEach(() => {
    sessionStorage.clear()
    floorPlanMocks.listAvailableResourcesForSlot.mockReset()
    floorPlanMocks.listAvailableResourcesForSlot.mockResolvedValue([])
    floorPlanMocks.getFloorPlanPreviewForCustomerBooking.mockReset()
    floorPlanMocks.getFloorPlanPreviewForCustomerBooking.mockResolvedValue(null)
  })

  function slotTimeButton(): HTMLElement | undefined {
    return screen.getAllByRole('button').find((b) => /\d{1,2}:\d{2}/.test(b.textContent ?? ''))
  }

  test('creates booking and exposes deposit payment action', async () => {
    const onCreateBooking = vi.fn(async () => ({ ok: true as const, booking: bookingRow() }))
    const onPayDeposit = vi.fn(async () => undefined)

    const business: BusinessRow = {
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

    const services: ServiceRow[] = [
      {
        id: 'svc-1',
        business_id: 'biz-1',
        name: 'Taglio',
        duration_min: 60,
        price_cents: 2500,
        description: null,
        is_active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]

    render(
      <MemoryRouter>
        <BookingPanel
          business={business}
          services={services}
          customerScore={80}
          customerStars={0}
          customerEffectiveScore={80}
          reliabilityPenalty={0}
          noShowCount={0}
          lateCancelCount={0}
          isPaused={false}
          canBook={true}
          isAuthenticated={true}
          fetchAvailabilitySlots={vi.fn(async () => [
            { startAt: '2026-06-01T09:00:00.000Z', endAt: '2026-06-01T10:00:00.000Z' },
          ])}
          onCreateBooking={onCreateBooking}
          onPayDeposit={onPayDeposit}
        />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(slotTimeButton()).toBeTruthy()
    })
    const slotButton = slotTimeButton()
    if (!slotButton) throw new Error('Missing availability slot button')
    fireEvent.click(slotButton)
    fireEvent.click(screen.getByRole('button', { name: /Conferma/i }))

    await waitFor(() => {
      expect(onCreateBooking).toHaveBeenCalled()
    })
    await screen.findByText(/Prenotazione creata/i)
    expect(screen.getByRole('button', { name: /Paga caparra ora/i })).toBeTruthy()
  })

  test('single create_booking RPC even if confirm is double-clicked before resolve', async () => {
    let resolveBooking!: (value: { ok: true; booking: BookingRow }) => void
    const bookingPromise = new Promise<{ ok: true; booking: BookingRow }>((resolve) => {
      resolveBooking = resolve
    })
    const onCreateBooking = vi.fn(() => bookingPromise)
    const onPayDeposit = vi.fn(async () => undefined)

    const business: BusinessRow = {
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

    const services: ServiceRow[] = [
      {
        id: 'svc-1',
        business_id: 'biz-1',
        name: 'Taglio',
        duration_min: 60,
        price_cents: 2500,
        description: null,
        is_active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]

    render(
      <MemoryRouter>
        <BookingPanel
          business={business}
          services={services}
          customerScore={80}
          customerStars={0}
          customerEffectiveScore={80}
          reliabilityPenalty={0}
          noShowCount={0}
          lateCancelCount={0}
          isPaused={false}
          canBook={true}
          isAuthenticated={true}
          fetchAvailabilitySlots={vi.fn(async () => [
            { startAt: '2026-06-01T09:00:00.000Z', endAt: '2026-06-01T10:00:00.000Z' },
          ])}
          onCreateBooking={onCreateBooking}
          onPayDeposit={onPayDeposit}
        />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(slotTimeButton()).toBeTruthy()
    })
    const slotButton = slotTimeButton()
    if (!slotButton) throw new Error('Missing availability slot button')
    fireEvent.click(slotButton)

    const confirmBtn = screen.getByRole('button', { name: /Conferma/i })
    fireEvent.click(confirmBtn)
    fireEvent.click(confirmBtn)

    expect(onCreateBooking).toHaveBeenCalledTimes(1)

    resolveBooking({ ok: true, booking: bookingRow() })

    await waitFor(() => {
      expect(screen.getByText(/Prenotazione creata/i)).toBeTruthy()
    })
  })

  test('passes selected staff id to onCreateBooking when operator chip changes', async () => {
    const onCreateBooking = vi.fn(async () => ({ ok: true as const, booking: bookingRow() }))
    const onPayDeposit = vi.fn(async () => undefined)

    const bookableStaff: BookableStaffOptionRow[] = [
      { id: 'staff-a', display_name: 'Alice', color: '#ff0000' },
      { id: 'staff-b', display_name: 'Bob', color: '#00bb00' },
    ]

    const business: BusinessRow = {
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

    const services: ServiceRow[] = [
      {
        id: 'svc-1',
        business_id: 'biz-1',
        name: 'Taglio',
        duration_min: 60,
        price_cents: 2500,
        description: null,
        is_active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]

    render(
      <MemoryRouter>
        <BookingPanel
          business={business}
          services={services}
          bookableStaff={bookableStaff}
          customerScore={80}
          customerStars={0}
          customerEffectiveScore={80}
          reliabilityPenalty={0}
          noShowCount={0}
          lateCancelCount={0}
          isPaused={false}
          canBook={true}
          isAuthenticated={true}
          fetchAvailabilitySlots={vi.fn(async () => [
            { startAt: '2026-06-01T09:00:00.000Z', endAt: '2026-06-01T10:00:00.000Z' },
          ])}
          onCreateBooking={onCreateBooking}
          onPayDeposit={onPayDeposit}
        />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: /Bob/i }))

    await waitFor(() => {
      expect(slotTimeButton()).toBeTruthy()
    })
    const slotButton = slotTimeButton()
    if (!slotButton) throw new Error('Missing availability slot button')
    fireEvent.click(slotButton)
    fireEvent.click(screen.getByRole('button', { name: /Conferma/i }))

    await waitFor(() => {
      expect(onCreateBooking).toHaveBeenCalled()
    })

    expect(onCreateBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        staffId: 'staff-b',
        serviceId: 'svc-1',
        startAt: '2026-06-01T09:00:00.000Z',
        endAt: '2026-06-01T10:00:00.000Z',
      }),
    )
  })

  test('passes resourceAssignment explicit when customerChoice required and table selected', async () => {
    floorPlanMocks.listAvailableResourcesForSlot.mockResolvedValue(mockTableRows)

    const onCreateBooking = vi.fn(async () => ({ ok: true as const, booking: bookingRow() }))
    const onPayDeposit = vi.fn(async () => undefined)

    const business: BusinessRow = {
      id: 'biz-1',
      owner_user_id: 'owner-1',
      name: 'Ristorante Test',
      category: 'ristorante',
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

    const services: ServiceRow[] = [
      {
        id: 'svc-1',
        business_id: 'biz-1',
        name: 'Cena',
        duration_min: 60,
        price_cents: 2500,
        description: null,
        is_active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]

    const { container } = render(
      <MemoryRouter>
        <BookingPanel
          business={business}
          services={services}
          customerScore={80}
          customerStars={0}
          customerEffectiveScore={80}
          reliabilityPenalty={0}
          noShowCount={0}
          lateCancelCount={0}
          isPaused={false}
          canBook={true}
          isAuthenticated={true}
          tableSelection={{ customerChoice: 'required', defaultAssignmentMode: 'customer_choice', resourceLabel: 'tavolo' }}
          fetchAvailabilitySlots={vi.fn(async () => [
            { startAt: '2026-06-01T09:00:00.000Z', endAt: '2026-06-01T10:00:00.000Z' },
          ])}
          onCreateBooking={onCreateBooking}
          onPayDeposit={onPayDeposit}
        />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(slotTimeButton()).toBeTruthy()
    })
    const slotButton = slotTimeButton()
    if (!slotButton) throw new Error('Missing availability slot button')
    fireEvent.click(slotButton)

    const tableSelect = await waitFor(() => {
      const el = container.querySelector('select')
      expect(el).toBeTruthy()
      return el as HTMLSelectElement
    })
    fireEvent.change(tableSelect, { target: { value: 'res-table-1' } })

    fireEvent.click(screen.getByRole('button', { name: /Conferma/i }))

    await waitFor(() => {
      expect(onCreateBooking).toHaveBeenCalled()
    })

    expect(onCreateBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'svc-1',
        resourceAssignment: { kind: 'explicit', resourceId: 'res-table-1', partySize: 2 },
      }),
    )
  })

  test('passes resourceAssignment auto when preferred + defaultAssignmentMode auto', async () => {
    floorPlanMocks.listAvailableResourcesForSlot.mockResolvedValue(mockTableRows)

    const onCreateBooking = vi.fn(async () => ({ ok: true as const, booking: bookingRow() }))
    const onPayDeposit = vi.fn(async () => undefined)

    const business: BusinessRow = {
      id: 'biz-1',
      owner_user_id: 'owner-1',
      name: 'Ristorante Test',
      category: 'ristorante',
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

    const services: ServiceRow[] = [
      {
        id: 'svc-1',
        business_id: 'biz-1',
        name: 'Cena',
        duration_min: 60,
        price_cents: 2500,
        description: null,
        is_active: true,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]

    render(
      <MemoryRouter>
        <BookingPanel
          business={business}
          services={services}
          customerScore={80}
          customerStars={0}
          customerEffectiveScore={80}
          reliabilityPenalty={0}
          noShowCount={0}
          lateCancelCount={0}
          isPaused={false}
          canBook={true}
          isAuthenticated={true}
          tableSelection={{ customerChoice: 'preferred', defaultAssignmentMode: 'auto', resourceLabel: 'tavolo' }}
          fetchAvailabilitySlots={vi.fn(async () => [
            { startAt: '2026-06-01T09:00:00.000Z', endAt: '2026-06-01T10:00:00.000Z' },
          ])}
          onCreateBooking={onCreateBooking}
          onPayDeposit={onPayDeposit}
        />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(slotTimeButton()).toBeTruthy()
    })
    const slotButton = slotTimeButton()
    if (!slotButton) throw new Error('Missing availability slot button')
    fireEvent.click(slotButton)

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Automatico \(consigliato\)/i })).toBeTruthy()
    })

    fireEvent.click(screen.getByRole('button', { name: /Conferma/i }))

    await waitFor(() => {
      expect(onCreateBooking).toHaveBeenCalled()
    })

    expect(onCreateBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: 'svc-1',
        resourceAssignment: { kind: 'auto', partySize: 2 },
      }),
    )
  })
})
