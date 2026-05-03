import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { completeAuthRedirectHandshake } from '@/lib/authRedirectHandshake'
import FullScreenLoader from '@/shared/ui/FullScreenLoader'
import Alert from '@/shared/ui/Alert'
import Button from '@/shared/ui/Button'

export default function AuthCallback() {
  const nav = useNavigate()
  const [phase, setPhase] = useState<'working' | 'done' | 'error'>('working')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    ;(async () => {
      try {
        const sleep = async (ms: number) => {
          await new Promise<void>((resolve) => window.setTimeout(resolve, Math.max(0, ms)))
        }

        const handshake = await completeAuthRedirectHandshake('/auth/callback')
        if (!mounted) return
        if (handshake.ok === false) {
          setError(handshake.errorMessage)
          setPhase('error')
          return
        }

        let lastSessionUserId: string | null = null
        for (let i = 0; i < 10; i++) {
          try {
            const { data } = await supabase.auth.getSession()
            lastSessionUserId = data.session?.user?.id ?? null
            if (lastSessionUserId) break
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e)
            const normalized = msg.toLowerCase()
            const isLock =
              normalized.includes('lock "lock:sb-') ||
              normalized.includes('another request stole it') ||
              normalized.includes('was released because another request')
            if (!isLock) throw e
          }
          await sleep(250)
        }

        if (!mounted) return
        if (lastSessionUserId) {
          setPhase('done')
          return
        }
        setError('Conferma non completata. Il link potrebbe essere scaduto oppure non autorizzato.')
        setPhase('error')
      } catch (e: unknown) {
        if (!mounted) return
        setError(e instanceof Error ? e.message : 'Errore conferma email.')
        setPhase('error')
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  if (phase === 'done') return <Navigate to="/" replace />

  return (
    <div className="tb-page grid grid-cols-1 gap-6 py-6 md:py-16">
      {phase === 'working' ? (
        <FullScreenLoader title="Verifica in corso" subtitle="Sto completando l’accesso…" />
      ) : null}
      {phase === 'error' && error ? (
        <div className="mx-auto w-full max-w-2xl">
          <Alert tone="danger">{error}</Alert>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => nav('/login?mode=login', { replace: true })}>
              Vai al login
            </Button>
            <Button type="button" variant="secondary" onClick={() => nav('/login?mode=forgot', { replace: true })}>
              Recupero password
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
