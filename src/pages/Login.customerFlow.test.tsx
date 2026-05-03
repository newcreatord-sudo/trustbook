import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import Login from '@/pages/Login'
import { useAuth } from '@/providers/authContext'

const pushToastMock = vi.fn()
const getPreferredRoleMock = vi.fn(() => 'cliente')
const setPreferredRoleMock = vi.fn()

vi.mock('@/providers/authContext', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/shared/storage/preferredRole', () => ({
  getPreferredRole: () => getPreferredRoleMock(),
  setPreferredRole: (role: 'cliente' | 'attivita') => setPreferredRoleMock(role),
}))

vi.mock('@/shared/ui/toastContext', () => ({
  useToast: () => ({ push: pushToastMock }),
}))

function renderLogin() {
  render(
    <MemoryRouter initialEntries={['/login?mode=register&role=cliente']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/esplora" element={<div>esplora-page</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Login customer flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(useAuth as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      session: null,
      profile: null,
      signIn: vi.fn(),
      signUp: vi.fn().mockResolvedValue({ ok: true }),
      requestPasswordReset: vi.fn(),
      resendSignupEmail: vi.fn(),
      verifySignupWithCode: vi.fn(),
    })
  })

  test('registers customer and redirects to esplora', async () => {
    renderLogin()

    fireEvent.change(screen.getByPlaceholderText('Mario'), { target: { value: 'Mario' } })
    fireEvent.change(screen.getByPlaceholderText('Rossi'), { target: { value: 'Rossi' } })
    fireEvent.change(screen.getByPlaceholderText('nome@email.it'), { target: { value: 'mario@test.it' } })
    fireEvent.change(screen.getByPlaceholderText('Min 8 caratteri'), { target: { value: 'password123' } })

    fireEvent.click(screen.getByRole('button', { name: /Crea account/i }))

    const auth = useAuth as unknown as ReturnType<typeof vi.fn>
    const signUp = (auth.mock.results[0]?.value as { signUp: ReturnType<typeof vi.fn> }).signUp

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledWith({
        email: 'mario@test.it',
        password: 'password123',
        role: 'cliente',
        firstName: 'Mario',
        lastName: 'Rossi',
        phone: '',
      })
    })

    await screen.findByText('esplora-page')
    expect(setPreferredRoleMock).toHaveBeenCalledWith('cliente')
  })
})
