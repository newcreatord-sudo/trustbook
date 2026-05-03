import { describe, expect, it } from 'vitest'
import type { BusinessRow } from '@/domain/supabase'
import { topCategories } from '@/pages/home/homeLogic'

function b(category: string): BusinessRow {
  return {
    id: crypto.randomUUID(),
    owner_user_id: crypto.randomUUID(),
    name: 'X',
    category,
    description: null,
    address_text: null,
    postal_code: null,
    city: null,
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
    updated_at: new Date().toISOString(),
  }
}

describe('topCategories', () => {
  it('returns sorted categories by count', () => {
    const rows = [b('bar'), b('bar'), b('ristorante'), b('taxi')]
    const top = topCategories(rows, 3)
    expect(top[0]).toEqual({ category: 'bar', count: 2 })
    expect(top.map((x) => x.category)).toEqual(['bar', 'ristorante', 'taxi'])
  })
})
