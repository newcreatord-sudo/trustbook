import type { UserRole } from '@/domain/supabase'

const KEY = 'tb_preferred_role'

export function getPreferredRole(): UserRole | null {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (raw === 'cliente' || raw === 'attivita') return raw
    return null
  } catch {
    return null
  }
}

export function setPreferredRole(role: UserRole): void {
  try {
    window.localStorage.setItem(KEY, role)
  } catch {
    return
  }
}

