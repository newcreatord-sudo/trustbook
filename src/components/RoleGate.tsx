import { Navigate, useLocation } from 'react-router-dom'
import type { UserRole } from '@/domain/supabase'
import { useAuth } from '@/providers/authContext'
import FullScreenLoader from '@/shared/ui/FullScreenLoader'
import { encodeNext, safeNextPath } from '@/shared/navigation/next'

export default function RoleGate(props: { role: UserRole; children: React.ReactNode }) {
  const { session, profile, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <FullScreenLoader title="Caricamento" subtitle="Sto caricando il profilo…" />
  const next = safeNextPath(`${loc.pathname}${loc.search}`)
  if (!session?.user) {
    const q = next ? `?next=${encodeNext(next)}` : ''
    return <Navigate to={`/login${q}`} replace />
  }
  if (!profile) {
    const q = next ? `?next=${encodeNext(next)}` : ''
    return <Navigate to={`/login${q}`} replace />
  }
  if (profile.role !== props.role) return <Navigate to={profile.role === 'attivita' ? '/dashboard-attivita' : '/esplora'} replace />
  return <>{props.children}</>
}

