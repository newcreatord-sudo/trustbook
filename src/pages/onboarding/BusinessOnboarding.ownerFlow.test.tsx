import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { BusinessOnboardingForm } from '@/pages/onboarding/BusinessOnboarding'
import { useAuth } from '@/providers/authContext'
import { createBusinessWithDefaults } from '@/lib/businessSetup'
import BusinessOnboarding from '@/pages/onboarding/BusinessOnboarding'

const navigateMock = vi.fn()
const upsertCalls: Array<Record<string, unknown>> = []
const deleteCalls: Array<{ userId: string; kind: string }> = []
let remotePayload: { payload: { idx: number; form: BusinessOnboardingForm; savedAt: number } } | null = null
let externalListingPayload: Record<string, unknown> | null = null

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('@/components/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/providers/authContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/lib/businessSetup', () => ({
  createBusinessWithDefaults: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'onboarding_drafts') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: remotePayload }),
              }),
            }),
          }),
          upsert: async (payload: Record<string, unknown>) => {
            upsertCalls.push(payload)
            return { error: null }
          },
          delete: () => ({
            eq: (_col: string, userId: string) => ({
              eq: async (_col2: string, kind: string) => {
                deleteCalls.push({ userId, kind })
                return { error: null }
              },
            }),
          }),
        }
      }
      if (table === 'external_business_listings_public') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: externalListingPayload, error: null }),
            }),
          }),
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  },
}))

function completeForm(overrides?: Partial<BusinessOnboardingForm>): BusinessOnboardingForm {
  return {
    name: 'Barberia Centrale',
    category: 'parrucchiere',
    description: 'Taglio uomo e barba',
    phone: '+390212345678',
    email: 'owner@test.it',
    website: 'https://barberia.test',
    addressText: 'Via Roma 10',
    city: 'Milano',
    postalCode: '20100',
    lat: '45.4642',
    lng: '9.1900',
    logoUrl: '',
    galleryText: '',
    isPaused: false,
    approvalMode: 'risk_based',
    requiredReliabilityMin: '70',
    cancellationWindowMin: '120',
    minGapMin: '5',
    depositMode: 'risk_based',
    depositValueType: 'percentage',
    depositFixedCents: '500',
    depositPercent: '20',
    depositMin: '500',
    depositMax: '3000',
    depositGreenType: 'percentage',
    depositGreenValue: '0',
    depositYellowType: 'percentage',
    depositYellowValue: '20',
    depositRedType: 'percentage',
    depositRedValue: '50',
    manualApprovalForHighRisk: true,
    cancellationFreeUntilHours: '24',
    refundPolicy: 'flexible',
    depositRetainedOnNoShow: true,
    depositRetainedOnLateCancel: true,
    services: [{ name: 'Taglio uomo', durationMin: '45', priceCents: '25' }],
    schedule: {
      1: [{ start: '09:00', end: '13:00' }],
      2: [{ start: '15:00', end: '19:00' }],
    },
    staffEmails: [],
    ...overrides,
  }
}

describe('Business onboarding owner flow', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    upsertCalls.length = 0
    deleteCalls.length = 0
    remotePayload = null
    externalListingPayload = null
    localStorage.clear()
    ;(useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      session: { user: { id: 'owner-1' } },
      profile: { role: 'attivita' },
      loading: false,
    })
    ;(createBusinessWithDefaults as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'biz-1' })
  })

  test('restores draft and autosave keeps restored values', async () => {
    remotePayload = {
      payload: {
        idx: 0,
        form: completeForm({ name: 'Bozza Attivita' }),
        savedAt: Date.now(),
      },
    }

    render(
      <MemoryRouter>
        <BusinessOnboarding />
      </MemoryRouter>,
    )

    await screen.findByDisplayValue('Bozza Attivita')

    await waitFor(() => expect(upsertCalls.length).toBeGreaterThan(0), { timeout: 3000 })
    const last = upsertCalls.at(-1)
    const payload = last?.payload as { form: BusinessOnboardingForm }
    expect(payload.form.name).toBe('Bozza Attivita')
  })

  test('prefillListing overrides identity/location but does not import contacts', async () => {
    remotePayload = {
      payload: {
        idx: 0,
        form: completeForm({ name: 'Nome sbagliato draft', phone: '+391111111', email: 'x@y.it', website: 'https://x.test' }),
        savedAt: Date.now(),
      },
    }
    externalListingPayload = {
      id: 'listing-1',
      slug: 'pizzeria-ramona-catania-d420cbf0',
      name: 'Pizzeria Ramona',
      category: 'pizzeria',
      address_text: 'Via Etnea 1',
      city: 'Catania',
      postal_code: '95100',
      lat: 37.502,
      lng: 15.087,
      listing_status: 'unverified',
    }

    render(
      <MemoryRouter initialEntries={['/onboarding-attivita?prefillListing=pizzeria-ramona-catania-d420cbf0']}>
        <BusinessOnboarding />
      </MemoryRouter>,
    )

    await screen.findByDisplayValue('Pizzeria Ramona')

    fireEvent.click(screen.getByRole('button', { name: /Contatti/i }))
    await screen.findByDisplayValue('Via Etnea 1')
    await screen.findByDisplayValue('Catania')
    await waitFor(() => {
      expect(screen.queryByDisplayValue('+391111111')).toBeNull()
      expect(screen.queryByDisplayValue('x@y.it')).toBeNull()
      expect(screen.queryByDisplayValue('https://x.test')).toBeNull()
    })
  })

  test('blocks invalid critical data on final creation', async () => {
    remotePayload = {
      payload: {
        idx: 8,
        form: completeForm({ lat: '120' }),
        savedAt: Date.now(),
      },
    }

    render(
      <MemoryRouter>
        <BusinessOnboarding />
      </MemoryRouter>,
    )

    const createBtn = await screen.findByRole('button', { name: /Crea attività e vai alla dashboard/i })
    fireEvent.click(createBtn)

    await screen.findAllByText(/Latitudine non valida/i)
    expect(createBusinessWithDefaults).not.toHaveBeenCalled()
  })

  test('blocks overlapping schedule ranges at final step', async () => {
    remotePayload = {
      payload: {
        idx: 8,
        form: completeForm({
          schedule: {
            1: [
              { start: '09:00', end: '12:00' },
              { start: '11:30', end: '13:00' },
            ],
          },
        }),
        savedAt: Date.now(),
      },
    }

    render(
      <MemoryRouter>
        <BusinessOnboarding />
      </MemoryRouter>,
    )

    const createBtn = await screen.findByRole('button', { name: /Crea attività e vai alla dashboard/i })
    fireEvent.click(createBtn)

    await screen.findAllByText(/non possono sovrapporsi/i)
    expect(createBusinessWithDefaults).not.toHaveBeenCalled()
  })


  test('blocks risk based approval with zero reliability threshold', async () => {
    remotePayload = {
      payload: {
        idx: 8,
        form: completeForm({
          approvalMode: 'risk_based',
          requiredReliabilityMin: '0',
        }),
        savedAt: Date.now(),
      },
    }

    render(
      <MemoryRouter>
        <BusinessOnboarding />
      </MemoryRouter>,
    )

    const createBtn = await screen.findByRole('button', { name: /Crea attività e vai alla dashboard/i })
    fireEvent.click(createBtn)

    await screen.findAllByText(/soglia almeno 1/i)
    expect(createBusinessWithDefaults).not.toHaveBeenCalled()
  })

  test('creates business and clears remote draft on success', async () => {
    remotePayload = {
      payload: {
        idx: 8,
        form: completeForm(),
        savedAt: Date.now(),
      },
    }

    render(
      <MemoryRouter>
        <BusinessOnboarding />
      </MemoryRouter>,
    )

    const createBtn = await screen.findByRole('button', { name: /Crea attività e vai alla dashboard/i })
    fireEvent.click(createBtn)

    await waitFor(() => expect(createBusinessWithDefaults).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(deleteCalls).toContainEqual({ userId: 'owner-1', kind: 'business' }))
    expect(navigateMock).toHaveBeenCalledWith('/dashboard-attivita', { replace: true })
  })
})
