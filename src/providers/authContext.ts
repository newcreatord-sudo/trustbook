import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { ProfileRow, UserRole } from '@/domain/supabase'

export type AuthContextValue = {
  session: Session | null
  profile: ProfileRow | null
  profileLoading: boolean
  profileError: string | null
  loading: boolean
  signIn: (params: { email: string; password: string }) => Promise<{ ok: true } | { ok: false; error: string }>


  signUp: (params: {
    email: string
    password: string
    role: UserRole
    firstName?: string
    lastName?: string
    phone?: string
  }) => Promise<{ ok: true; needsEmailConfirmation?: boolean; message?: string } | { ok: false; error: string }>
  requestPasswordReset: (params: { email: string; redirectTo: string }) => Promise<{ ok: true } | { ok: false; error: string }>
  resendSignupEmail: (params: { email: string; redirectTo: string }) => Promise<{ ok: true } | { ok: false; error: string }>
  updatePassword: (params: { password: string }) => Promise<{ ok: true } | { ok: false; error: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<ProfileRow | null>
  verifySignupWithCode: (params: { email: string; token: string }) => Promise<{ ok: true } | { ok: false; error: string }>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('AuthProvider missing')
  return ctx
}
