import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, test, vi } from 'vitest'
import ExternalListingResultCard from '@/pages/home/ExternalListingResultCard'
import type { ExternalBusinessListingRow } from '@/domain/supabase'

vi.mock('@/shared/ui/MediaThumb', () => ({
  default: () => <div>thumb</div>,
}))

function baseListing(overrides?: Partial<ExternalBusinessListingRow>): ExternalBusinessListingRow {
  return {
    id: 'listing-1',
    slug: 'pizzeria-ramona-catania-d420cbf0',
    name: 'Pizzeria Ramona',
    category: 'pizzeria',
    description: 'Scheda informativa non verificata.',
    address_text: 'Via Etnea 1',
    postal_code: '95100',
    city: 'Catania',
    province: null,
    region: null,
    country_code: 'IT',
    lat: 37.502,
    lng: 15.087,
    phone: null,
    email: null,
    website: null,
    listing_status: 'unverified',
    source: 'openstreetmap',
    source_ref: 'node/123',
    source_url: 'https://www.openstreetmap.org/node/123',
    source_license: 'ODbL 1.0',
    source_attribution: '© OpenStreetMap contributors',
    data_checked_at: null,
    imported_at: '2026-05-08T00:00:00.000Z',
    updated_at: '2026-05-08T00:00:00.000Z',
    claimed_business_id: null,
    claimed_at: null,
    claimed_by_user_id: null,
    ...overrides,
  }
}

describe('ExternalListingResultCard', () => {
  test('shows directory label for unverified listing', async () => {
    render(
      <MemoryRouter>
        <ExternalListingResultCard listing={baseListing()} active={false} distanceKm={null} onSelect={() => {}} />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/Non verificata/i)).toBeTruthy()
    expect(await screen.findByText(/Directory/i)).toBeTruthy()
    expect(await screen.findByText(/Vedi scheda/i)).toBeTruthy()
  })

  test('shows claimed badge and opens business when claimed_business_id is set', async () => {
    render(
      <MemoryRouter>
        <ExternalListingResultCard
          listing={baseListing({ claimed_business_id: 'biz-123', listing_status: 'claimed' })}
          active={false}
          distanceKm={null}
          onSelect={() => {}}
        />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/Gestita dal titolare/i)).toBeTruthy()
    expect(await screen.findByText(/Apri attività/i)).toBeTruthy()
  })
})

