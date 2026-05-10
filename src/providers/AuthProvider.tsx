import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { ProfileRow } from '@/domain/supabase'
import { getPreferredRole, setPreferredRole } from '@/shared/storage/preferredRole'
import { AuthContext, type AuthContextValue } from '@/providers/authContext'
import { safeParseProfileRow } from '@/domain/parse'
import { logSecurityEvent } from '@/lib/securityEvents'
import { clearQueryCache } from '@/lib/queryCache'
import { authCallbackUrl } from '@/lib/authUrls'

const PROFILE_QUERY_TIMEOUT_MS = 8_000
const PROFILE_FALLBACK_AFTER_MS = 14_000

function formatProfileLoadError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  const normalized = msg.toLowerCase()
  if (normalized.includes('auth profile query timeout') || normalized.includes('auth profile upsert timeout')) {
    return 'Il server sta impiegando troppo tempo a rispondere.'
  }
  if (
    normalized.includes('failed to fetch') ||
    normalized.includes('fetch failed') ||
    normalized.includes('network') ||
    normalized.includes('err_aborted') ||
    normalized.includes('aborted')
  ) {
    return 'Problema di rete durante il caricamento del profilo.'
  }
  if (normalized.includes('permission denied') || normalized.includes('not authorized') || normalized.includes('jwt')) {
    return 'Permessi non validi per leggere il profilo.'
  }
  if (normalized.includes('relation') && normalized.includes('profiles') && normalized.includes('does not exist')) {
    return 'Database non inizializzato: manca la tabella profili.'
  }
  return 'Impossibile caricare il profilo.'
}

function isRetryableProfileLoadError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  const normalized = msg.toLowerCase()
  return (
    normalized.includes('auth profile query timeout') ||
    normalized.includes('auth profile upsert timeout') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('fetch failed') ||
    normalized.includes('network') ||
    normalized.includes('err_aborted') ||
    normalized.includes('aborted')
  )
}

/** In Vite dev prova prima la registrazione confermata via API locale (se `AUTH_DEV_SIGNUP_CONFIRMED` è attivo). */
function shouldTryDevSignupFirst(): boolean {
  return import.meta.env.DEV
}

function isSupabaseAuthLockError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  const normalized = msg.toLowerCase()
  return (
    normalized.includes('lock "lock:sb-') ||
    normalized.includes('another request stole it') ||
    normalized.includes('was released because another request')
  )
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, Math.max(0, ms)))
}

async function withLockRetry<T>(fn: () => Promise<T>, opts?: { maxMs?: number }): Promise<T> {
  const maxMs = opts?.maxMs ?? 4_000
  const startedAt = Date.now()
  let attempt = 0
  while (true) {
    try {
      return await fn()
    } catch (e: unknown) {
      if (!isSupabaseAuthLockError(e)) throw e
      const elapsed = Date.now() - startedAt
      if (elapsed >= maxMs) throw e
      attempt++
      const nextDelay = Math.min(750, 50 * 2 ** Math.min(6, attempt))
      await sleep(nextDelay)
    }
  }
}

async function withTimeout<T>(promiseLike: PromiseLike<T>, timeoutMs: number, label: string): Promise<T> {
  return await Promise.race([
    Promise.resolve(promiseLike),
    new Promise<T>((_, reject) => {
      globalThis.setTimeout(() => reject(new Error(label)), Math.max(1000, timeoutMs))
    }),
  ])
}

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await withTimeout(
    (async () => {
      return await withLockRetry(
        async () =>
          await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle(),
        { maxMs: 4_000 },
      )
    })(),
    PROFILE_QUERY_TIMEOUT_MS,
    'Auth profile query timeout',
  )
  if (error) throw error
  return data ? safeParseProfileRow(data) : null
}

async function ensureProfileForUser(user: { id: string; user_metadata?: Record<string, unknown> }) {
  const existing = await fetchProfile(user.id)
  if (existing) return existing

  const md = user.user_metadata ?? {}
  const roleMeta = md['role']
  const roleFromMeta = roleMeta === 'cliente' || roleMeta === 'attivita' ? roleMeta : null
  const role = roleFromMeta ?? getPreferredRole() ?? 'cliente'
  const firstName = typeof md['first_name'] === 'string' ? md['first_name'] : null
  const lastName = typeof md['last_name'] === 'string' ? md['last_name'] : null
  const phone = typeof md['phone'] === 'string' ? md['phone'] : null

  const pRes = await withTimeout(
    (async () => {
      return await withLockRetry(
        async () =>
          await supabase.from('profiles').upsert({
            id: user.id,
            role,
            first_name: firstName?.trim() || null,
            last_name: lastName?.trim() || null,
            phone: phone?.trim() || null,
          }),
        { maxMs: 4_000 },
      )
    })(),
    PROFILE_QUERY_TIMEOUT_MS,
    'Auth profile upsert timeout',
  )
  if (pRes.error) throw pRes.error

  if (role === 'cliente') {
    // Check if reliability exists, if not initialize it.
    // The RLS policy doesn't allow insert from client anymore, but we can do it via a service or leave it to DB trigger.
    // Actually, DB trigger on auth.users or profiles should create it. Or we just fetch it.
    // I will remove the upsert.
  }
  return await fetchProfile(user.id)
}

function fallbackProfileForUser(user: { id: string; user_metadata?: Record<string, unknown> }): ProfileRow {
  const md = user.user_metadata ?? {}
  const roleMeta = md['role']
  const roleFromMeta = roleMeta === 'cliente' || roleMeta === 'attivita' ? roleMeta : null
  const role = roleFromMeta ?? getPreferredRole() ?? 'cliente'
  const firstName = typeof md['first_name'] === 'string' ? md['first_name'] : null
  const lastName = typeof md['last_name'] === 'string' ? md['last_name'] : null
  const phone = typeof md['phone'] === 'string' ? md['phone'] : null
  const now = new Date().toISOString()
  return {
    id: user.id,
    role,
    first_name: firstName?.trim() || null,
    last_name: lastName?.trim() || null,
    phone: phone?.trim() || null,
    avatar_url: null,
    city: null,
    lat: null,
    lng: null,
    account_status: 'active',
    created_at: now,
    updated_at: now,
  }
}

export function AuthProvider(props: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const loadingRef = useRef(true)
  const ensureProfileInFlightRef = useRef(false)
  const ensureProfileTargetRef = useRef<{ id: string; user_metadata: Record<string, unknown> } | null>(null)
  const ensureProfileRetryTimerRef = useRef<number | null>(null)
  const ensureProfileRetryAttemptRef = useRef(0)
  const ensureProfileStartedAtRef = useRef<number>(0)

  useEffect(() => {
    loadingRef.current = loading
  }, [loading])

  const refreshProfile = useCallback(async () => {
    if (!session?.user) {
      setProfile(null)
      setProfileLoading(false)
      setProfileError(null)
      return null
    }
    try {
      setProfileLoading(true)
      setProfileError(null)
      const p = await fetchProfile(session.user.id)
      setProfile(p)
      setProfileLoading(false)
      if (!p) setProfileError('Profilo non trovato.')
      return p
    } catch (e: unknown) {
      setProfile(null)
      setProfileLoading(false)
      setProfileError(formatProfileLoadError(e))
      return null
    }
  }, [session?.user])

  useEffect(() => {
    let mounted = true
    const timeoutId = window.setTimeout(() => {
      if (!mounted) return
      setLoading(false)
    }, 8000)

    const clearEnsureProfileRetry = () => {
      if (ensureProfileRetryTimerRef.current) window.clearTimeout(ensureProfileRetryTimerRef.current)
      ensureProfileRetryTimerRef.current = null
      ensureProfileRetryAttemptRef.current = 0
    }

    const scheduleEnsureProfileRetry = (delayMs: number) => {
      if (!mounted) return
      if (ensureProfileRetryTimerRef.current) window.clearTimeout(ensureProfileRetryTimerRef.current)
      ensureProfileRetryTimerRef.current = window.setTimeout(() => {
        void runEnsureProfile()
      }, Math.max(0, delayMs))
    }

    const runEnsureProfile = async () => {
      if (!mounted) return
      const target = ensureProfileTargetRef.current
      if (!target) return
      if (ensureProfileInFlightRef.current) return
      ensureProfileInFlightRef.current = true
      try {
        setProfileLoading(true)
        setProfileError(null)
        const p = await ensureProfileForUser(target)
        if (!mounted) return
        if (!p) throw new Error('profile_missing_after_ensure')
        clearEnsureProfileRetry()
        setProfile(p)
        setProfileLoading(false)
      } catch (e: unknown) {
        ensureProfileInFlightRef.current = false
        if (!mounted) return
        if (isSupabaseAuthLockError(e)) {
          ensureProfileRetryAttemptRef.current += 1
          const delay = Math.min(2_000, 150 * 2 ** Math.min(6, ensureProfileRetryAttemptRef.current))
          scheduleEnsureProfileRetry(delay)
          return
        }
        if (isRetryableProfileLoadError(e) && ensureProfileRetryAttemptRef.current < 3) {
          ensureProfileRetryAttemptRef.current += 1
          const elapsed = ensureProfileStartedAtRef.current ? Date.now() - ensureProfileStartedAtRef.current : 0
          if (elapsed >= PROFILE_FALLBACK_AFTER_MS) {
            clearEnsureProfileRetry()
            setProfile(fallbackProfileForUser(target))
            setProfileLoading(false)
            return
          }
          const delay = Math.min(2_500, 250 * 2 ** Math.min(3, ensureProfileRetryAttemptRef.current))
          scheduleEnsureProfileRetry(delay)
          return
        }
        clearEnsureProfileRetry()
        setProfile(null)
        setProfileLoading(false)
        setProfileError(formatProfileLoadError(e))
        return
      } finally {
        ensureProfileInFlightRef.current = false
      }
    }

    const requestEnsureProfile = (user: { id: string; user_metadata?: Record<string, unknown> }) => {
      ensureProfileTargetRef.current = {
        id: user.id,
        user_metadata: (user.user_metadata as Record<string, unknown>) ?? {},
      }
      setProfileLoading(true)
      setProfileError(null)
      ensureProfileRetryAttemptRef.current = 0
      ensureProfileStartedAtRef.current = Date.now()
      void runEnsureProfile()
    }

    const bundle = `${window.location.search}${window.location.hash}`.toLowerCase()
    const path = window.location.pathname
    const isHandshakePage = path === '/auth/callback' || path === '/reset-password'
    const hasHandshakeParams =
      bundle.includes('code=') ||
      bundle.includes('token_hash=') ||
      bundle.includes('access_token=') ||
      bundle.includes('refresh_token=') ||
      bundle.includes('type=recovery') ||
      bundle.includes('type=signup')

    if (isHandshakePage && hasHandshakeParams) {
      setLoading(false)
      window.clearTimeout(timeoutId)
    } else {
      withLockRetry(async () => await supabase.auth.getSession(), { maxMs: 4_000 })
        .then(async ({ data }) => {
          if (!mounted) return
          setSession(data.session)
          if (data.session?.user) {
            requestEnsureProfile({
              id: data.session.user.id,
              user_metadata: (data.session.user.user_metadata as Record<string, unknown>) ?? {},
            })
          } else {
            ensureProfileTargetRef.current = null
            clearEnsureProfileRetry()
            setProfile(null)
            setProfileLoading(false)
            setProfileError(null)
          }
          setLoading(false)
        })
        .catch(() => {
          if (!mounted) return
          setLoading(false)
        })
        .finally(() => {
          window.clearTimeout(timeoutId)
        })
    }

    const { data } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user) {
        requestEnsureProfile({
          id: nextSession.user.id,
          user_metadata: (nextSession.user.user_metadata as Record<string, unknown>) ?? {},
        })
      } else {
        ensureProfileTargetRef.current = null
        clearEnsureProfileRetry()
        setProfile(null)
        setProfileLoading(false)
        setProfileError(null)
      }

      if (loadingRef.current) setLoading(false)
    })

    return () => {
      mounted = false
      window.clearTimeout(timeoutId)
      clearEnsureProfileRetry()
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    return {
      session,
      profile,
      profileLoading,
      profileError,
      loading,
      signIn: async ({ email, password }) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) {
          const msg = error.message
          const normalized = msg.toLowerCase()
          if (normalized.includes('invalid login credentials')) {
            return { ok: false as const, error: 'Email o password non valide.' }
          }
          if (normalized.includes('email not confirmed') || normalized.includes('email non confermata')) {
            return {
              ok: false as const,
              error: 'Account non confermato. Controlla la mail di conferma oppure usa il codice ricevuto via email su questa pagina.',
            }
          }
          if (
            normalized.includes('too many requests') ||
            normalized.includes('rate limit') ||
            normalized.includes('too many') ||
            normalized.includes('429')
          ) {
            return {
              ok: false as const,
              error: 'Troppi tentativi. Attendi qualche minuto e riprova.',
            }
          }
          if (normalized.includes('fetch failed') || normalized.includes('network') || normalized.includes('failed to fetch')) {
            return {
              ok: false as const,
              error: 'Problema di rete. Controlla la connessione e riprova.',
            }
          }
          return { ok: false as const, error: 'Accesso non riuscito. Riprova tra poco.' }
        }
        const { data: sessionRes } = await supabase.auth.getSession()
        const userId = sessionRes.session?.user?.id
        if (userId) void logSecurityEvent({ userId, eventType: 'login', source: 'app' })

        const preferred = getPreferredRole()
        if (preferred) setPreferredRole(preferred)
        return { ok: true as const }
      },
      signUp: async ({ email, password, role, firstName, lastName, phone }) => {
        if (shouldTryDevSignupFirst()) {
          try {
            const apiRes = await fetch('/api/auth/dev-signup-confirmed', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email,
                password,
                role,
                firstName,
                lastName,
                phone,
              }),
            })
            const payload = (await apiRes.json().catch(() => null)) as {
              success?: boolean
              error?: string
            } | null
            if (apiRes.status !== 404) {
              if (!apiRes.ok || !payload?.success) {
                return { ok: false as const, error: payload?.error ?? 'Registrazione non riuscita.' }
              }
              const signInRes = await supabase.auth.signInWithPassword({ email, password })
              if (signInRes.error) {
                return { ok: false as const, error: signInRes.error.message }
              }
              setPreferredRole(role)
              const { data: sessionRes } = await supabase.auth.getSession()
              const userId = sessionRes.session?.user?.id
              if (userId) void logSecurityEvent({ userId, eventType: 'login', source: 'app' })
              return { ok: true as const }
            }
          } catch {
            return {
              ok: false as const,
              error: 'Impossibile contattare l’API locale. Usa `npm run dev` (frontend + server) o disabilita AUTH_DEV_SIGNUP_CONFIRMED.',
            }
          }
        }

        const emailRedirectTo = authCallbackUrl()
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo,
            data: {
              role,
              first_name: firstName?.trim() || null,
              last_name: lastName?.trim() || null,
              phone: phone?.trim() || null,
            },
          },
        })
        if (error) return { ok: false as const, error: error.message }

        setPreferredRole(role)
        if (!data.session) {
          return {
            ok: true as const,
            needsEmailConfirmation: true,
            message: 'Controlla la tua email per confermare l’account, poi accedi.',
          }
        }

        return { ok: true as const }
      },
      requestPasswordReset: async ({ email, redirectTo }) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
        if (error) return { ok: false as const, error: error.message }
        return { ok: true as const }
      },
      resendSignupEmail: async ({ email, redirectTo }) => {
        try {
          const apiRes = await fetch('/api/auth/resend-confirmation', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              redirectTo: redirectTo || authCallbackUrl(),
            }),
          })
          const payload = (await apiRes.json().catch(() => null)) as { success?: boolean; error?: string } | null
          if (apiRes.ok && payload?.success) return { ok: true as const }
        } catch {
          // fallback below
        }

        const { error } = await supabase.auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: redirectTo || authCallbackUrl() },
        })
        if (error) return { ok: false as const, error: 'Impossibile inviare ora. Riprova tra poco.' }
        return { ok: true as const }
      },
      updatePassword: async ({ password }) => {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) return { ok: false as const, error: error.message }
        const { data: sessionRes } = await supabase.auth.getSession()
        const userId = sessionRes.session?.user?.id
        if (userId) void logSecurityEvent({ userId, eventType: 'password_changed', source: 'recovery' })
        return { ok: true as const }
      },
      verifySignupWithCode: async ({ email, token }) => {
        const clean = token.replace(/\s/g, '')
        if (clean.length < 6) {
          return { ok: false as const, error: 'Inserisci il codice ricevuto via email.' }
        }
        const { error } = await supabase.auth.verifyOtp({
          email: email.trim().toLowerCase(),
          token: clean,
          type: 'signup',
        })
        if (error) return { ok: false as const, error: error.message }
        const preferred = getPreferredRole()
        if (preferred) setPreferredRole(preferred)
        const { data: sessionRes } = await supabase.auth.getSession()
        const userId = sessionRes.session?.user?.id
        if (userId) void logSecurityEvent({ userId, eventType: 'login', source: 'app' })
        return { ok: true as const }
      },
      signOut: async () => {
        const userId = session?.user?.id
        if (userId) void logSecurityEvent({ userId, eventType: 'logout', source: 'app' })
        setSession(null)
        setProfile(null)
        clearQueryCache()
        try {
          const signOutPromise = (() => {
            try {
              return supabase.auth.signOut({ scope: 'local' })
            } catch {
              return supabase.auth.signOut()
            }
          })()

          await Promise.race([
            signOutPromise,
            new Promise<void>((resolve) => {
              window.setTimeout(() => resolve(), 1500)
            }),
          ])
        } catch {
          // ignore
        } finally {
          setSession(null)
          setProfile(null)
          clearQueryCache()
        }
      },
      refreshProfile,
    }
  }, [loading, profile, profileError, profileLoading, refreshProfile, session])

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>
}
