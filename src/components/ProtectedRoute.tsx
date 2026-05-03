import { Navigate, useLocation } from 'react-router-dom'
import { getPreferredRole } from '@/shared/storage/preferredRole'
import { useAuth } from '@/providers/authContext'
import FullScreenLoader from '@/shared/ui/FullScreenLoader'
import { encodeNext, safeNextPath } from '@/shared/navigation/next'

export default function ProtectedRoute(props: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <FullScreenLoader title="Caricamento" subtitle="Sto verificando la sessione…" />
  if (!session?.user) {
    const preferred = getPreferredRole()
    const next = safeNextPath(`${loc.pathname}${loc.search}`)
    const nextQ = next ? `?next=${encodeNext(next)}` : ''
    if (!preferred) return <Navigate to={`/start${nextQ}`} replace />
    const roleQ = `role=${encodeURIComponent(preferred)}`
    const join = next ? `&next=${encodeNext(next)}` : ''
    return <Navigate to={`/login?mode=login&${roleQ}${join}`} replace />
  }
  return <>{props.children}</>
}

