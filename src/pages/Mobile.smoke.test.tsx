import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { ReactNode } from 'react'
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

describe('Mobile smoke flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 })
    fromMock.mockImplementation((table: string) => {
      if (table === 'businesses') {
        const chain = {
          eq: () => chain,
          order: () => ({
            limit: async () => ({
              data: [
                {
                  id: 'biz-1',
                  owner_user_id: 'owner-1',
                  name: 'Barberia Mobile',
                  category: 'parrucchiere',
                  lat: 45.4642,
                  lng: 9.19,
                  created_at: '2026-01-01T00:00:00.000Z',
                },
              ],
              error: null,
            }),
          }),
        }
        return {
          select: () => ({
            eq: () => chain,
          }),
        }
      }
      if (table === 'reviews') {
        return {
          select: () => ({
            eq: () => ({
              gte: async () => ({ data: [{ business_id: 'biz-1', rating: 5 }], error: null }),
            }),
          }),
        }
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

  test('renders critical explore controls on mobile viewport', async () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    )

    await screen.findByText(/Barberia Mobile/i)
    expect(screen.getByRole('button', { name: /Posizione/i })).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /Mostra|Nascondi/i }).length).toBeGreaterThan(0)
    expect(screen.getByPlaceholderText(/Cerca \(nome, servizio, città, indirizzo\)/i)).toBeTruthy()
  })
})
