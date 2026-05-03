import { Suspense, lazy, useEffect, useState, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/providers/authContext'
import FullScreenLoader from '@/shared/ui/FullScreenLoader'
import { supabase } from '@/lib/supabase'

const Landing = lazy(() => import('@/pages/Landing'))

/** Evita spinner infinito se PostgREST non risponde (rete / RLS / progetto spento). */
const ACTIVITY_ROUTE_QUERY_MS = 12_000

export default function AppEntry() {
  const { session, profile, loading, refreshProfile } = useAuth()
  const [target, setTarget] = useState<string | null>(null)
  const [profileRecoveryFailed, setProfileRecoveryFailed] = useState(false)
  const recoveryAttemptedRef = useRef(false)
  const sessionUserId = session?.user?.id ?? null

  useEffect(() => {
    recoveryAttemptedRef.current = false
    setProfileRecoveryFailed(false)
  }, [sessionUserId])

  useEffect(() => {
    let mounted = true
    setTarget(null)

    if (loading) return () => {
      mounted = false
    }

    if (!session?.user) return () => {
      mounted = false
    }

    if (!profile) {
      if (recoveryAttemptedRef.current) return () => { mounted = false }

      recoveryAttemptedRef.current = true

      void refreshProfile()
        .then((p) => {
          if (!mounted) return
          if (!p) setProfileRecoveryFailed(true)
        })
        .catch(() => {
          if (!mounted) return
          setProfileRecoveryFailed(true)
        })
      return () => {
        mounted = false
      }
    }

    ;(async () => {
      try {
        if (profile.role === 'cliente') {
          if (mounted) setTarget('/esplora')
          return
        }

        if (profile.role === 'attivita') {
          const userId = session.user.id
          const queries = Promise.all([
            supabase.from('businesses').select('id').eq('owner_user_id', userId).limit(1),
            supabase.from('team_members').select('id').eq('user_id', userId).limit(1),
          ])
          const raced = await Promise.race([
            queries,
            new Promise<null>((resolve) => {
              window.setTimeout(() => resolve(null), ACTIVITY_ROUTE_QUERY_MS)
            }),
          ])
          if (!mounted) return
          if (raced === null) {
            setTarget('/dashboard-attivita')
            return
          }
          const [ownedRes, memberRes] = raced
          const hasOwned = !ownedRes.error && Array.isArray(ownedRes.data) && ownedRes.data.length > 0
          const hasMembership = !memberRes.error && Array.isArray(memberRes.data) && memberRes.data.length > 0
          const bothChecksFailed = Boolean(ownedRes.error && memberRes.error)
          setTarget(hasOwned || hasMembership || bothChecksFailed ? '/dashboard-attivita' : '/onboarding-attivita')
          return
        }

        if (mounted) setTarget('/esplora')
      } catch {
        if (mounted) setTarget(profile.role === 'attivita' ? '/dashboard-attivita' : '/esplora')
      }
    })()

    return () => {
      mounted = false
    }
  }, [loading, profile, refreshProfile, session?.user])

  /** Ultimo salvagente se qualcosa non imposta mai `target` (effetti/React batch). */
  useEffect(() => {
    if (loading || !session?.user || !profile || target) return
    const id = window.setTimeout(() => {
      setTarget(profile.role === 'attivita' ? '/dashboard-attivita' : '/esplora')
    }, 15_000)
    return () => window.clearTimeout(id)
  }, [loading, profile, session?.user, target])

  if (loading) {
    return <FullScreenLoader title="Caricamento" subtitle="Sto preparando la tua esperienza…" />
  }

  if (!session?.user) return <Landing />

  if (!profile) {
    if (profileRecoveryFailed) {
      return <Navigate to="/login" replace />
    }
    return (
      <FullScreenLoader 
        title="Caricamento" 
        subtitle="Sto caricando il profilo…" 
        action={
          <div className="mt-6 flex justify-center">
            <button 
              onClick={() => {
                supabase.auth.signOut().catch(() => {})
                window.location.href = '/login'
              }}
              className="text-xs font-semibold text-white/50 hover:text-white underline underline-offset-2 transition-colors"
            >
              Forza disconnessione e riprova
            </button>
          </div>
        }
      />
    )
  }

  if (!target) return <FullScreenLoader title="Caricamento" subtitle="Sto preparando la dashboard…" />

  return <Navigate to={target} replace />
}

export function AppEntryWithSuspense() {
  return (
    <Suspense
      fallback={
        <FullScreenLoader title="Caricamento" subtitle="Sto preparando la pagina…" />
      }
    >
      <AppEntry />
    </Suspense>
  )
}
