import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import BusinessCalendarView from '@/pages/dashboard/BusinessCalendarView'
import type { BookingRow, ServiceRow } from '@/domain/supabase'

function makeBooking(params: Partial<BookingRow> & { id: string; start_at: string; end_at: string }): BookingRow {
  return {
    id: params.id,
    customer_user_id: params.customer_user_id ?? 'cust-1',
    business_id: params.business_id ?? 'biz-1',
    service_id: params.service_id ?? 'svc-1',
    start_at: params.start_at,
    end_at: params.end_at,
    status: params.status ?? 'confirmed',
    deposit_status: params.deposit_status ?? 'not_required',
    deposit_amount_cents: params.deposit_amount_cents ?? 0,
    created_at: params.created_at ?? '2026-01-01T00:00:00.000Z',
    updated_at: params.updated_at ?? '2026-01-01T00:00:00.000Z',
    confirmed_at: params.confirmed_at ?? null,
    cancelled_at: params.cancelled_at ?? null,
    completed_at: params.completed_at ?? null,
    no_show_at: params.no_show_at ?? null,
    approved_by_user_id: params.approved_by_user_id ?? null,
    rejected_by_user_id: params.rejected_by_user_id ?? null,
    rejection_reason: params.rejection_reason ?? null,
    proposed_start_at: params.proposed_start_at ?? null,
    proposed_end_at: params.proposed_end_at ?? null,
    proposed_by_role: params.proposed_by_role ?? null,
    proposal_message: params.proposal_message ?? null,
    proposal_created_at: params.proposal_created_at ?? null,
  }
}

describe('BusinessCalendarView', () => {
  test('shows weekly calendar and allows quick chat action', () => {
    const chatMock = vi.fn()
    const today = new Date()
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0, 0).toISOString()
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 11, 0, 0).toISOString()

    const bookings: BookingRow[] = [
      makeBooking({
        id: 'bk-1',
        start_at: start,
        end_at: end,
        status: 'pending_deposit',
        deposit_status: 'required',
        deposit_amount_cents: 1000,
      }),
    ]

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
      <BusinessCalendarView
        bookings={bookings}
        services={services}
        reliability={{ 'cust-1': { score: 80, stars: 0, noShowCount: 0, lateCancelCount: 0 } }}
        customerProfiles={{ 'cust-1': { first_name: 'Mario', last_name: 'Rossi', phone: null } }}
        busy={false}
        onChat={chatMock}
        onApprove={async () => undefined}
        onConfirm={() => undefined}
      />,
    )

    expect(screen.getByText(/Calendario prenotazioni/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Settimana/i }))
    expect(screen.getByText(/IN CORSO/i)).toBeTruthy()
    expect(screen.getByText(/Richiede caparra/i)).toBeTruthy()

    const customerNode = screen.getAllByText(/Mario Rossi/i)[0]
    const targetButton = customerNode.closest('button')
    expect(targetButton).toBeTruthy()
    if (!targetButton) throw new Error('Missing booking button')
    fireEvent.click(targetButton)
    expect(chatMock).toHaveBeenCalledWith('bk-1')
  })
})
