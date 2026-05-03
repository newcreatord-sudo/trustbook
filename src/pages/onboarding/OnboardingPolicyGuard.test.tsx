import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { BusinessOnboardingForm } from '@/pages/onboarding/BusinessOnboarding'
import { useAuth } from '@/providers/authContext'
import { createBusinessWithDefaults } from '@/lib/businessSetup'
import BusinessOnboarding from '@/pages/onboarding/BusinessOnboarding'

const navigateMock = vi.fn()
let remotePayload: { payload: { idx: number; form: BusinessOnboardingForm; savedAt: number } } | null = null

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
  }
})

vi.mock('@/components/AppShell', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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
      if (table !== 'onboarding_drafts') throw new Error(`Unexpected table: ${table}`)
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: remotePayload }),
            }),
          }),
        }),
        upsert: async () => ({ error: null }),
        delete: () => ({
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        }),
      }
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

describe('Onboarding policy guard', () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    remotePayload = null
    localStorage.clear()
    ;(useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      session: { user: { id: 'owner-1' } },
      profile: { role: 'attivita' },
    })
    ;(createBusinessWithDefaults as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'biz-1' })
  })



  test('blocks risk based approval with zero threshold', async () => {
    remotePayload = {
      payload: {
        idx: 8,
        form: completeForm({ approvalMode: 'risk_based', requiredReliabilityMin: '0' }),
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
})
