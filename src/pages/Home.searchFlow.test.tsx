import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import Home from '@/pages/Home'

const fromMock = vi.fn()

vi.mock('@/components/AppShell', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('@/components/MapView', () => ({
  default: () => <div>map-mock</div>,
}))

vi.mock('@/providers/authContext', () => ({
  useAuth: () => ({ session: null, profile: null, refreshProfile: vi.fn() }),
}))

vi.mock('@/shared/ui/toastContext', () => ({
  useToast: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/queryCache', () => ({
  getOrSetCachedAsync: async <T,>(params: { fn: () => Promise<T> }) => params.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}))

function businessesBuilder(data: unknown[]) {
  const done = Promise.resolve({ data, error: null })
  const chain = {
    eq: () => chain,
    order: () => ({
      limit: () => done,
    }),
  }
  return {
    select: () => ({
      eq: () => chain,
    }),
  }
}

function reviewsBuilder(data: unknown[]) {
  const done = Promise.resolve({ data, error: null })
  return {
    select: () => ({
      eq: () => ({
        gte: () => done,
      }),
    }),
  }
}

describe('Home search flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fromMock.mockImplementation((table: string) => {
      if (table === 'businesses') {
        return businessesBuilder([
          {
            id: 'biz-1',
            owner_user_id: 'owner-1',
            name: 'Barberia Milano Centro',
            category: 'parrucchiere',
            is_paused: false,
            lat: 45.4642,
            lng: 9.19,
            created_at: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'biz-2',
            owner_user_id: 'owner-2',
            name: 'Studio Estetica Roma',
            category: 'estetica',
            is_paused: false,
            lat: 41.9028,
            lng: 12.4964,
            created_at: '2026-01-02T00:00:00.000Z',
          },
        ])
      }
      if (table === 'reviews') {
        return reviewsBuilder([
          { business_id: 'biz-1', rating: 5 },
          { business_id: 'biz-2', rating: 4 },
        ])
      }
      if (table === 'services') {
        return {
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        }
      }
      if (table === 'business_opening_windows') {
        return {
          select: async () => ({ data: [], error: null }),
        }
      }
      throw new Error(`Unexpected table ${table}`)
    })
  })

  test('loads businesses and filters by query', async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )

    await screen.findByText(/Barberia Milano Centro/i)
    await screen.findByText(/Studio Estetica Roma/i)

    fireEvent.change(screen.getByPlaceholderText(/Cerca \(nome, servizio, città, indirizzo\)/i), {
      target: { value: 'Milano' },
    })

    await waitFor(() => {
      expect(screen.getByText(/Barberia Milano Centro/i)).toBeTruthy()
      expect(screen.queryByText(/Studio Estetica Roma/i)).toBeNull()
    })
  })
})
