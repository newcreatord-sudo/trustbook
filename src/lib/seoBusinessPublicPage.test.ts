import { describe, expect, it } from 'vitest'
import { buildLocalBusinessJsonLd, truncateMetaDescription } from '@/lib/seoBusinessPublicPage'
import type { BusinessRow } from '@/domain/supabase'

const baseBusiness: Partial<BusinessRow> = {
  id: '00000000-0000-4000-8000-000000000001',
  owner_user_id: '00000000-0000-4000-8000-000000000002',
  name: 'Salon Test',
  slug: 'salon-test',
  category: 'parrucchiere',
  description: 'Taglio   professionale\n\ncon stile.',
  address_text: 'Via Roma 1',
  postal_code: '00100',
  city: 'Roma',
  lat: 41.9,
  lng: 12.49,
  phone: '+39061234567',
  email: 'info@example.com',
  website: 'https://example.com',
  logo_url: 'https://example.com/logo.png',
  gallery_urls: [],
  public_profile_settings: {},
  is_paused: false,
  listing_visible: true,
  min_gap_min: 5,
  approval_mode: 'auto',
  required_reliability_min: 0,
  cancellation_window_min: 60,
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
  deposit_mode: 'none',
  deposit_value_type: 'percentage',
  deposit_green_rule: { type: 'percentage', value: 0 },
  deposit_yellow_rule: { type: 'percentage', value: 20 },
  deposit_red_rule: { type: 'percentage', value: 50 },
  manual_approval_for_high_risk: true,
  cancellation_free_until_hours: 24,
  refund_policy: 'flexible',
  deposit_retained_on_no_show: true,
  deposit_retained_on_late_cancel: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

describe('seoBusinessPublicPage', () => {
  it('truncateMetaDescription normalizes whitespace', () => {
    expect(truncateMetaDescription('a\n\nb', 10)).toMatch(/^a b/)
  })

  it('buildLocalBusinessJsonLd omits contact when hidden', () => {
    const hidden = buildLocalBusinessJsonLd({
      ...(baseBusiness as BusinessRow),
      public_profile_settings: { show_contact: false },
    })
    expect(hidden).not.toHaveProperty('telephone')
    expect(hidden).not.toHaveProperty('email')
  })

  it('buildLocalBusinessJsonLd includes geo when show_location', () => {
    const j = buildLocalBusinessJsonLd(baseBusiness as BusinessRow)
    expect(j?.geo).toMatchObject({ latitude: 41.9, longitude: 12.49 })
    expect(j?.telephone).toBe('+39061234567')
  })
})
