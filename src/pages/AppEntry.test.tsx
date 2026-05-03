import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import AppEntry from '@/pages/AppEntry'
import { useAuth } from '@/providers/authContext'

const supabaseFromMock = vi.fn()

vi.mock('@/providers/authContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => supabaseFromMock(...args),
  },
}))

vi.mock('@/pages/Landing', () => ({
  default: () => <div>landing</div>,
}))

function renderAppEntry() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<AppEntry />} />
        <Route path="/esplora" element={<div>esplora</div>} />
        <Route path="/dashboard-attivita" element={<div>dashboard-attivita</div>} />
        <Route path="/onboarding-attivita" element={<div>onboarding-attivita</div>} />
        <Route path="/login" element={<div>login</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AppEntry routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('routes customer to esplora', async () => {
    ;(useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      session: { user: { id: 'u-customer' } },
      profile: { role: 'cliente' },
      loading: false,
      refreshProfile: vi.fn().mockResolvedValue(null),
    })
    renderAppEntry()
    await screen.findByText('esplora')
  })

  test('owner/member query failure does not leave infinite loader', async () => {
    const brokenBuilder = {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          limit: vi.fn(async () => {
            throw new Error('network down')
          }),
        })),
      })),
    }
    supabaseFromMock.mockReturnValue(brokenBuilder)
    ;(useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      session: { user: { id: 'u-owner' } },
      profile: { role: 'attivita' },
      loading: false,
      refreshProfile: vi.fn().mockResolvedValue(null),
    })

    renderAppEntry()

    await screen.findByText('dashboard-attivita')
    await waitFor(() => {
      expect(screen.queryByText(/Sto preparando la dashboard/i)).toBeNull()
    })
  })

  test('profile refresh failure exits loader with login fallback', async () => {
    ;(useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      session: { user: { id: 'u-stuck' } },
      profile: null,
      loading: false,
      refreshProfile: vi.fn(async () => {
        throw new Error('profile refresh failed')
      }),
    })

    renderAppEntry()
    await screen.findByText('login')
    await waitFor(() => {
      expect(screen.queryByText(/Sto caricando il profilo/i)).toBeNull()
    })
  })

  test('missing profile after refresh redirects to login', async () => {
    ;(useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      session: { user: { id: 'u-noprofile' } },
      profile: null,
      loading: false,
      refreshProfile: vi.fn().mockResolvedValue(null),
    })
    renderAppEntry()
    await screen.findByText('login')
  })
})
