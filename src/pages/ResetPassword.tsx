import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/providers/authContext'
import Card from '@/shared/ui/Card'
import Input from '@/shared/ui/Input'
import Button from '@/shared/ui/Button'
import Alert from '@/shared/ui/Alert'
import FullScreenLoader from '@/shared/ui/FullScreenLoader'
import { useToast } from '@/shared/ui/toastContext'
import { completeAuthRedirectHandshake, urlLooksLikeRecoveryRedirect } from '@/lib/authRedirectHandshake'

export default function ResetPassword() {
  const { session, updatePassword, signOut, profile } = useAuth()
  const { push } = useToast()
  const nav = useNavigate()

  const [recoveryFromUrl] = useState(() =>
    typeof window !== 'undefined' ? urlLooksLikeRecoveryRedirect() : false,
  )

  const [handshakePhase, setHandshakePhase] = useState<'pending' | 'ok' | 'error'>(
    recoveryFromUrl ? 'pending' : 'ok',
  )
  const [handshakeError, setHandshakeError] = useState<string | null>(null)

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!recoveryFromUrl) return

    let mounted = true
    ;(async () => {
      const result = await completeAuthRedirectHandshake('/reset-password')
      if (!mounted) return
      if (result.ok === false) {
        setHandshakeError(result.errorMessage)
        setHandshakePhase('error')
        return
      }
      setHandshakePhase('ok')
    })()

    return () => {
      mounted = false
    }
  }, [recoveryFromUrl])

  const canSubmit = useMemo(() => {
    if (!password || !confirm) return false
    if (password.length < 8) return false
    if (password !== confirm) return false
    return true
  }, [confirm, password])

  if (!recoveryFromUrl && session?.user && profile?.role) {
    return <Navigate to={profile.role === 'attivita' ? '/dashboard-attivita' : '/esplora'} replace />
  }

  if (recoveryFromUrl && handshakePhase === 'pending') {
    return (
      <div className="tb-page py-6 md:py-16">
        <FullScreenLoader title="Verifica link" subtitle="Sto aprendo il link di recupero…" />
      </div>
    )
  }

  if (recoveryFromUrl && handshakePhase === 'error') {
    return (
      <div className="tb-page py-6 md:py-16">
        <Card>
          <Alert tone="danger">{handshakeError ?? 'Link non valido o scaduto.'}</Alert>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => nav('/login?mode=forgot', { replace: true })}>
              Richiedi nuovo link
            </Button>
            <Button type="button" variant="secondary" onClick={() => nav('/login', { replace: true })}>
              Vai al login
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  if (recoveryFromUrl && handshakePhase === 'ok' && !session?.user) {
    return (
      <div className="tb-page py-6 md:py-16">
        <Card>
          <Alert tone="danger">
            Impossibile completare il recupero password: sessione non creata (link scaduto, già usato, o redirect non
            autorizzato nel progetto Supabase).
          </Alert>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="secondary" onClick={() => nav('/login?mode=forgot', { replace: true })}>
              Richiedi nuovo link
            </Button>
            <Button type="button" variant="secondary" onClick={() => nav('/login', { replace: true })}>
              Vai al login
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="tb-page grid grid-cols-1 gap-6 py-6 md:py-16">
      <Card>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#4F7CFF]">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="tb-title">Reimposta password</div>
            <div className="tb-subtitle">Scegli una nuova password per il tuo account.</div>
          </div>
        </div>

        {!session?.user ? (
          <div className="mt-6">
            <Alert tone="info">
              Apri questa pagina dal link che hai ricevuto via email. Se il link è scaduto, richiedi un nuovo reset.
            </Alert>
            <div className="mt-4 flex gap-2">
              <Button type="button" variant="secondary" onClick={() => nav('/login?mode=forgot', { replace: true })}>
                Richiedi nuovo link
              </Button>
              <Button type="button" variant="secondary" onClick={() => nav('/login', { replace: true })}>
                Vai al login
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div>
              <label className="tb-label">Nuova password</label>
              <Input
                className="mt-1"
                type="password"
                placeholder="Min 8 caratteri"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="tb-label">Conferma password</label>
              <Input
                className="mt-1"
                type="password"
                placeholder="Ripeti la password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>

            {error && <Alert tone="danger">{error}</Alert>}

            <Button
              type="button"
              className="w-full"
              disabled={!canSubmit || busy}
              leftIcon={<KeyRound className="h-4 w-4" />}
              onClick={() => {
                if (!canSubmit) return
                setBusy(true)
                setError(null)
                ;(async () => {
                  try {
                    const res = await updatePassword({ password })
                    if (res.ok === false) {
                      setError(res.error)
                      push({ tone: 'danger', title: 'Errore password', description: 'Riprova tra poco.' })
                      return
                    }
                    push({ tone: 'success', title: 'Password aggiornata', description: 'Accedi con la nuova password.' })
                    await signOut()
                    nav('/login?mode=login', { replace: true })
                  } finally {
                    setBusy(false)
                  }
                })()
              }}
            >
              {busy ? 'Aggiornamento…' : 'Aggiorna password'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
