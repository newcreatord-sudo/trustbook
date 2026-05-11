import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/authContext'

type CheckState =
  | { status: 'loading' }
  | { status: 'ok' }
  | { status: 'denied' }
  | { status: 'unauthenticated' }

/**
 * Route guard for platform admin pages.
 *
 *   - Resolves `is_platform_admin()` server-side: we never trust the client
 *     `profile.is_admin` (it could be stale or tampered with in dev tools).
 *   - While checking, renders a centered spinner with `aria-busy`.
 *   - On denial, redirects to "/" with a flash to the toast bus.
 */
export default function AdminGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const loc = useLocation()
  const [state, setState] = useState<CheckState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (loading) return
      if (!session?.user) {
        if (!cancelled) setState({ status: 'unauthenticated' })
        return
      }
      try {
        const { data, error } = await supabase.rpc('is_platform_admin')
        if (cancelled) return
        if (error) {
          setState({ status: 'denied' })
        } else if (data === true) {
          setState({ status: 'ok' })
        } else {
          setState({ status: 'denied' })
        }
      } catch {
        if (!cancelled) setState({ status: 'denied' })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [session, loading])

  const fallback = useMemo(() => {
    if (state.status === 'unauthenticated') {
      const next = encodeURIComponent(loc.pathname + loc.search)
      return <Navigate to={`/auth/login?next=${next}`} replace />
    }
    if (state.status === 'denied') return <Navigate to="/" replace />
    return null
  }, [state.status, loc.pathname, loc.search])

  if (state.status === 'loading' || loading) {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="flex min-h-[60vh] items-center justify-center"
      >
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-[#4F7CFF]" aria-hidden />
        <span className="sr-only">Verifica permessi amministratore in corso</span>
      </div>
    )
  }
  return fallback ?? <>{children}</>
}
