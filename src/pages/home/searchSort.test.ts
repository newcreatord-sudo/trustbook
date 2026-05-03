import { describe, expect, it } from 'vitest'
import type { BusinessRow } from '@/domain/supabase'
import { relevanceScore } from '@/pages/home/searchSort'

function b(partial: Partial<BusinessRow>): BusinessRow {
  return {
    id: 'b1',
    owner_user_id: 'u1',
    name: 'Studio Nails',
    category: 'estetica',
    description: null,
    address_text: 'Via Roma 1',
    postal_code: null,
    city: 'Torino',
    phone: null,
    email: null,
    website: null,
    logo_url: null,
    gallery_urls: [],
    is_paused: false,
    listing_visible: true,
    lat: 45,
    lng: 9,
    min_gap_min: 0,
    approval_mode: 'risk_based',
    required_reliability_min: 0,
    cancellation_window_min: 120,
    booking_lead_time_min: 0,
    deposit_enabled: false,
    deposit_rule: 'off',
    deposit_risky_threshold: 60,
    block_reliability_threshold: 15,
    auto_block_no_show_count: 3,
    deposit_fixed_cents: null,
    deposit_percent: null,
    deposit_min_cents: null,
    deposit_max_cents: null,
    created_at: new Date().toISOString(),
    deposit_mode: 'none' as const,
  deposit_value_type: 'percentage' as const,
  deposit_green_rule: { type: 'percentage' as const, value: 0 },
  deposit_yellow_rule: { type: 'percentage' as const, value: 0 },
  deposit_red_rule: { type: 'percentage' as const, value: 0 },
  manual_approval_for_high_risk: false,
  cancellation_free_until_hours: 24,
  refund_policy: 'flexible' as const,
  deposit_retained_on_no_show: false,
  deposit_retained_on_late_cancel: false,
  updated_at: new Date().toISOString(),
    ...partial,
  }
}

describe('relevanceScore', () => {
  it('scores startsWith higher than includes', () => {
    const row = b({ name: 'Barber Shop', category: 'barbiere', city: 'Milano' })
    expect(relevanceScore(row, 'bar')).toBeGreaterThan(relevanceScore(row, 'shop'))
  })
})
