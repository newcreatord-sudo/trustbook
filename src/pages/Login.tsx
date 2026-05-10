import { useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import type { UserRole } from '@/domain/supabase'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/authContext'
import { getPreferredRole, setPreferredRole } from '@/shared/storage/preferredRole'
import Button from '@/shared/ui/Button'
import Input from '@/shared/ui/Input'
import Alert from '@/shared/ui/Alert'
import { safeNextPath } from '@/shared/navigation/next'
import { useToast } from '@/shared/ui/toastContext'
import Tabs, { type TabItem } from '@/shared/ui/Tabs'
import FullScreenLoader from '@/shared/ui/FullScreenLoader'
import { authCallbackUrl } from '@/lib/authUrls'
import { supabase } from '@/lib/supabase'

type Mode = 'login' | 'register' | 'forgot'

export default function Login() {
  const { session, profile, profileError, signIn, signUp, requestPasswordReset, resendSignupEmail, verifySignupWithCode } = useAuth()
  const { push } = useToast()
  const nav = useNavigate()
  const [searchParams] = useSearchParams()

  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>(() => getPreferredRole() ?? 'cliente')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [canResend, setCanResend] = useState(false)
  const [signupOtp, setSignupOtp] = useState('')
  const [resendCooldownUntil, setResendCooldownUntil] = useState(0)
  const [profileWaitTooLong, setProfileWaitTooLong] = useState(false)

  const demo = useMemo(
    () => ({
      cliente: { email: 'demo@cliente.it', password: 'demo1234' },
      attivita: { email: 'demo@attivita.it', password: 'demo1234' },
    }),
    [],
  )

  useEffect(() => {
    const m = searchParams.get('mode')
    if (m === 'login' || m === 'register' || m === 'forgot') setMode(m)
    const r = searchParams.get('role')
    if (r === 'cliente' || r === 'attivita') {
      setRole(r)
      setPreferredRole(r)
    }
  }, [searchParams])

  const next = safeNextPath(searchParams.get('next') ?? searchParams.get('returnTo') ?? searchParams.get('redirectTo'))

  useEffect(() => {
    setProfileWaitTooLong(false)
    if (!session?.user || profile) return
    const id = window.setTimeout(() => setProfileWaitTooLong(true), 12_000)
    return () => window.clearTimeout(id)
  }, [profile, session?.user])

  const modeTabs: TabItem[] = useMemo(
    () => [
      { key: 'login', label: 'Login' },
      { key: 'register', label: 'Registrati' },
      { key: 'forgot', label: 'Recupero' },
    ],
    [],
  )

  const validateEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
  const validatePassword = (v: string) => v.trim().length >= 8

  const submit = async () => {
    setError(null)
    setNotice(null)
    if (busy) return

    const e = email.trim()
    if (!validateEmail(e)) {
      setError('Inserisci un’email valida.')
      return
    }

    if (mode === 'forgot') {
      setBusy(true)
      try {
        const redirectTo = `${window.location.origin}/reset-password`
        const res = await requestPasswordReset({ email: e, redirectTo })
        if (res.ok === false) {
          setError(res.error)
          push({ tone: 'danger', title: 'Errore recupero password', description: 'Riprova tra poco.' })
          return
        }
        setNotice('Se l’email esiste, riceverai un link per reimpostare la password.')
        push({ tone: 'success', title: 'Email inviata', description: 'Controlla la posta in arrivo.' })
      } finally {
        setBusy(false)
      }
      return
    }

    const p = password
    if (!p) {
      setError('Inserisci la password.')
      return
    }
    if (mode === 'register' && !validatePassword(p)) {
      setError('La password deve avere almeno 8 caratteri.')
      return
    }
    if (mode === 'register' && firstName.trim().length < 2) {
      setError('Inserisci il nome.')
      return
    }

    setBusy(true)
    try {
      if (mode === 'login') {
        const res = await signIn({ email: e, password: p })
        if (res.ok === false) {
          const normalized = res.error.toLowerCase()
          const canResendNow = normalized.includes('non conferm')
          setCanResend(canResendNow)
          if (canResendNow) {
            setError(null)
            setNotice(`${res.error} Puoi continuare su questa pagina e, se serve, premere “Rimanda email di conferma”.`)
          } else {
            setNotice(null)
            setError(res.error)
          }
          return
        }
        setPreferredRole(role)
        nav(next ?? '/', { replace: true })
        return
      }

      const reg = await signUp({ email: e, password: p, role, firstName, lastName, phone })
      if (reg.ok === false) {
        const normalized = reg.error.toLowerCase()
        if (normalized.includes('already') || normalized.includes('registered') || normalized.includes('email')) {
          setCanResend(true)
          setError(null)
          setNotice(
            'Se l’account esiste ma non è ancora confermato, puoi inviare di nuovo la mail di conferma e continuare da questa pagina.',
          )
        } else {
          setError(reg.error)
        }
        return
      }
      if (reg.needsEmailConfirmation) {
        setNotice(reg.message ?? 'Controlla la tua email per confermare l’account.')
        setCanResend(true)
        setMode('login')
        setPassword('')
        return
      }
      setPreferredRole(role)
      nav(next ?? (role === 'attivita' ? '/dashboard-attivita' : '/esplora'), { replace: true })
    } finally {
      setBusy(false)
    }
  }

  if (session?.user) {
    if (!profile) {
      return (
        <FullScreenLoader
          title="Caricamento"
          subtitle={profileError ? `Impossibile caricare il profilo. ${profileError}` : 'Sto caricando il profilo…'}
          action={
            profileError || profileWaitTooLong ? (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    supabase.auth.signOut({ scope: 'local' }).catch(() => {})
                    try {
                      Object.keys(window.localStorage)
                        .filter((k) => k.startsWith('sb-') || k.includes('supabase'))
                        .forEach((k) => window.localStorage.removeItem(k))
                    } catch {
                      // Alcuni browser bloccano clear parziale in modalità restrittiva.
                    }
                    window.location.href = '/login'
                  }}
                  className="text-xs font-semibold text-white/50 hover:text-white underline underline-offset-2 transition-colors"
                >
                  Forza disconnessione e riprova
                </button>
              </div>
            ) : null
          }
        />
      )
    }
    if (next) return <Navigate to={next} replace />
    return <Navigate to={profile?.role === 'attivita' ? '/dashboard-attivita' : '/esplora'} replace />
  }

  return (
    <div className="tb-page grid grid-cols-1 gap-6 py-6 md:grid-cols-2 md:gap-8 md:py-16">
      <div className="tb-immersive-panel p-6 md:p-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#7398FF] via-[#4F7CFF] to-[#3559d8] shadow-lg shadow-[#4F7CFF]/35 ring-2 ring-white/15">
            <ShieldCheck className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="tb-title">TrustBook</div>
            <div className="tb-subtitle">Prenotazioni serie, meno no-show.</div>
          </div>
        </div>

        <div className="mt-6 space-y-3 text-sm text-white/75">
          <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-4 shadow-inner shadow-black/25 backdrop-blur-sm">
            <div className="font-semibold text-white">Per le attività</div>
            <div className="mt-1 text-white/70">
              Caparra leggera + regole chiare. Niente caos: prenotazioni filtrate e affidabili.
            </div>
          </div>
          <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-4 shadow-inner shadow-black/25 backdrop-blur-sm">
            <div className="font-semibold text-white">Per i clienti</div>
            <div className="mt-1 text-white/70">
              Prenoti più veloce e costruisci reputazione: più affidabilità = meno attrito.
            </div>
          </div>
        </div>

        {import.meta.env.DEV && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-white/70">
            Demo rapida:{' '}
            <button
              type="button"
              className="tb-link font-semibold"
              onClick={() => {
                setMode('login')
                setEmail(demo.cliente.email)
                setPassword(demo.cliente.password)
                setRole('cliente')
                setPreferredRole('cliente')
                setError(null)
              }}
            >
              cliente
            </button>
            {' · '}
            <button
              type="button"
              className="tb-link font-semibold"
              onClick={() => {
                setMode('login')
                setEmail(demo.attivita.email)
                setPassword(demo.attivita.password)
                setRole('attivita')
                setPreferredRole('attivita')
                setError(null)
              }}
            >
              attività
            </button>
          </div>
        )}
      </div>

      <div className="tb-card tb-card-blur tb-card-pad border-white/12 shadow-tbElevated">
        <Tabs
          items={modeTabs}
          value={mode}
          onChange={(k) => {
            if (k !== 'login' && k !== 'register' && k !== 'forgot') return
            setMode(k)
            setError(null)
            if (k === 'forgot') setNotice(null)
          }}
        />

        <div className="mt-6 space-y-4">
          {mode === 'register' && (
            <div>
              <div className="tb-kicker">SCEGLI RUOLO</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole('cliente')}
                  className={cn(
                    'rounded-2xl border px-4 py-3 text-left transition',
                    role === 'cliente' ? 'tb-choice-active' : 'tb-choice-idle',
                  )}
                >
                  <div className="text-sm font-semibold text-white">Cliente</div>
                  <div className="mt-1 text-xs text-white/70">Cerchi e prenoti.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setRole('attivita')}
                  className={cn(
                    'rounded-2xl border px-4 py-3 text-left transition',
                    role === 'attivita' ? 'tb-choice-active' : 'tb-choice-idle',
                  )}
                >
                  <div className="text-sm font-semibold text-white">Attività</div>
                  <div className="mt-1 text-xs text-white/70">Ricevi prenotazioni.</div>
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            {mode === 'register' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="tb-label">Nome</label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1"
                    placeholder="Mario"
                  />
                </div>
                <div>
                  <label className="tb-label">Cognome</label>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="mt-1"
                    placeholder="Rossi"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="tb-label">Email</label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1"
                placeholder="nome@email.it"
                inputMode="email"
              />
            </div>

            {mode !== 'forgot' && (
              <div>
                <label className="tb-label">Password</label>
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1"
                  placeholder={mode === 'login' ? '••••••••' : 'Min 8 caratteri'}
                  type="password"
                />
              </div>
            )}

            {mode === 'register' && (
              <div>
                <label className="tb-label">Telefono (facoltativo)</label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1"
                  placeholder="+39 333 123 4567"
                />
              </div>
            )}
          </div>

          {error && (
            <Alert tone="danger">{error}</Alert>
          )}

          {notice && (
            <Alert tone="info">{notice}</Alert>
          )}

          {canResend && email.trim() ? (
            <div className="mt-3">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={busy || Date.now() < resendCooldownUntil}
                onClick={() => {
                  const e = email.trim()
                  if (!e) return
                  setBusy(true)
                  setError(null)
                  setNotice(null)
                  ;(async () => {
                    try {
                      setResendCooldownUntil(Date.now() + 15_000)
                      const res = await resendSignupEmail({ email: e, redirectTo: authCallbackUrl() })
                      setNotice(
                        "Se l'account esiste e non è ancora confermato, riceverai un'email di conferma. Controlla anche spam/promozioni e continua su questa pagina.",
                      )
                      if (res.ok === false) {
                        push({ tone: 'info', title: 'Richiesta inviata', description: 'Se non arriva subito, riprova tra poco.' })
                        return
                      }
                      push({ tone: 'success', title: 'Richiesta inviata', description: 'Controlla la posta in arrivo.' })
                    } finally {
                      setBusy(false)
                    }
                  })()
                }}
              >
                Rimanda email di conferma
              </Button>
              <div className="mt-2 text-xs text-white/60">
                Il redirect usato è `{authCallbackUrl()}` e deve essere autorizzato in Supabase (Auth → URL Configuration).
              </div>
            </div>
          ) : null}

          {mode === 'login' && (
            <div className="rounded-2xl border border-white/12 bg-white/[0.06] p-4 shadow-inner shadow-black/25 backdrop-blur-sm">
              <div className="tb-kicker">CODICE EMAIL</div>
              <p className="mt-2 text-xs leading-relaxed text-white/70">
                Se la mail non mostra il pulsante o il link viene consumato dall&apos;antivirus, usa il codice ricevuto via
                email insieme all&apos;email dell&apos;account.
              </p>
              <Input
                className="mt-3"
                value={signupOtp}
                onChange={(e) => setSignupOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="Codice (6-8 cifre)"
                inputMode="numeric"
                autoComplete="one-time-code"
              />
              <Button
                type="button"
                variant="secondary"
                className="mt-3 w-full"
                disabled={busy || signupOtp.trim().length < 6 || !validateEmail(email)}
                onClick={() => {
                  const e = email.trim()
                  if (!validateEmail(e) || signupOtp.trim().length < 6) return
                  setBusy(true)
                  setError(null)
                  setNotice(null)
                  ;(async () => {
                    try {
                      const res = await verifySignupWithCode({ email: e, token: signupOtp })
                      if (res.ok === false) {
                        setError(res.error)
                        push({ tone: 'danger', title: 'Codice non valido', description: 'Controlla email e codice.' })
                        return
                      }
                      setSignupOtp('')
                      push({ tone: 'success', title: 'Account confermato', description: 'Accesso effettuato.' })
                      nav(next ?? '/', { replace: true })
                    } finally {
                      setBusy(false)
                    }
                  })()
                }}
              >
                Conferma account con codice
              </Button>
            </div>
          )}

          <div className="tb-note text-xs text-white/70">
            Caparra anti no-show: se richiesta, paghi con Stripe e segui lo stato direttamente qui.
          </div>

          <Button type="button" onClick={submit} className="w-full" disabled={busy}>
            {busy ? 'Attendi…' : mode === 'login' ? 'Accedi' : mode === 'register' ? 'Crea account' : 'Invia link'}
          </Button>

          {mode !== 'forgot' && (
            <button
              type="button"
              onClick={() => {
                setMode('forgot')
                setError(null)
                setNotice(null)
              }}
              className="mt-2 text-xs font-semibold text-white/70 hover:text-white"
            >
              Password dimenticata?
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
