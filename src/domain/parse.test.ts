import { describe, expect, it } from 'vitest'
import {
  isBookingStatus,
  isDepositStatus,
  isUserRole,
  parseBookingRow,
  parseBusinessRow,
  parseProfileRow,
  safeParseNotificationRow,
} from '@/domain/parse'

describe('domain parse', () => {
  it('validates enums', () => {
    expect(isUserRole('cliente')).toBe(true)
    expect(isUserRole('attivita')).toBe(true)
    expect(isUserRole('x')).toBe(false)

    expect(isBookingStatus('confirmed')).toBe(true)
    expect(isBookingStatus('no_show')).toBe(true)
    expect(isBookingStatus('whatever')).toBe(false)

    expect(isDepositStatus('paid')).toBe(true)
    expect(isDepositStatus('refunded')).toBe(true)
    expect(isDepositStatus('nope')).toBe(false)
  })

  it('parses profile/business/booking (happy path)', () => {
    const profile = parseProfileRow({
      id: '00000000-0000-0000-0000-000000000000',
      role: 'cliente',
      first_name: 'Mario',
      last_name: 'Rossi',
      phone: null,
      avatar_url: null,
      city: null,
      lat: null,
      lng: null,
      account_status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    expect(profile.role).toBe('cliente')

    const business = parseBusinessRow({
      id: '00000000-0000-0000-0000-000000000001',
      owner_user_id: '00000000-0000-0000-0000-000000000000',
      name: 'Bar Demo',
      category: 'bar',
      lat: 45,
      lng: 9,
      gallery_urls: [],
      approval_mode: 'risk_based',
      deposit_rule: 'all',
      deposit_enabled: false,
      required_reliability_min: 0,
      cancellation_window_min: 120,
      booking_lead_time_min: 0,
      min_gap_min: 0,
      deposit_risky_threshold: 60,
      deposit_fixed_cents: null,
      deposit_percent: null,
      deposit_min_cents: null,
      deposit_max_cents: null,
      is_paused: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    expect(business.name).toBe('Bar Demo')
    expect(business.timezone).toBe('Europe/Rome')

    const booking = parseBookingRow({
      id: '00000000-0000-0000-0000-000000000002',
      customer_user_id: profile.id,
      business_id: business.id,
      service_id: '00000000-0000-0000-0000-000000000003',
      start_at: new Date().toISOString(),
      end_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      status: 'confirmed',
      deposit_status: 'not_required',
      deposit_amount_cents: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
    })
    expect(booking.status).toBe('confirmed')
  })

  it('safe parses notification', () => {
    const ok = safeParseNotificationRow({
      id: 'n1',
      recipient_user_id: 'u1',
      kind: 'booking_confirmed',
      title: 'OK',
      dedupe_key: 'k',
      created_at: new Date().toISOString(),
      read_at: null,
    })
    expect(ok?.id).toBe('n1')

    const bad = safeParseNotificationRow({})
    expect(bad).toBe(null)
  })
})

