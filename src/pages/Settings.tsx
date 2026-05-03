import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Lock, Shield, SlidersHorizontal } from 'lucide-react'
import AppShell from '@/components/AppShell'
import Alert from '@/shared/ui/Alert'
import Button from '@/shared/ui/Button'
import Card from '@/shared/ui/Card'
import Select from '@/shared/ui/Select'
import Switch from '@/shared/ui/Switch'
import Tabs from '@/shared/ui/Tabs'
import type { TabItem } from '@/shared/ui/Tabs'
import { useAuth } from '@/providers/authContext'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { safeParseUserPreferencesRow } from '@/domain/parse'
import { defaultUserPreferences, prefsFromRow, prefsToUpsertRow, type UserPreferences } from '@/lib/userPreferences'
import { fetchRecentSecurityEvents, tryDecodeJwtIat } from '@/lib/securityEvents'
import type { UserSecurityEventRow } from '@/domain/supabase'
import { formatDateTime } from '@/utils/time'
import EmptyState from '@/shared/ui/EmptyState'

type SettingsTab = 'privacy' | 'notifications' | 'security'

export default function Settings() {
  const { session, profile, signOut } = useAuth()
  const nav = useNavigate()
  const userId = session?.user?.id ?? null
  const userEmail = session?.user?.email ?? null

  const [tab, setTab] = useState<SettingsTab>('privacy')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [prefs, setPrefs] = useState<UserPreferences>({ ...defaultUserPreferences })
  const [savedPrefs, setSavedPrefs] = useState<UserPreferences>({ ...defaultUserPreferences })

  const [secLoading, setSecLoading] = useState(false)
  const [secError, setSecError] = useState<string | null>(null)
  const [secEvents, setSecEvents] = useState<UserSecurityEventRow[]>([])

  useEffect(() => {
    document.title = 'Impostazioni | TrustBook'
  }, [])

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }
    let mounted = true
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const { data, error } = await supabase.from('user_preferences').select('*').eq('user_id', userId).maybeSingle()
        if (!mounted) return
        if (error) throw error
        const parsed = data ? safeParseUserPreferencesRow(data) : null
        const next = prefsFromRow(parsed)
        setPrefs(next)
        setSavedPrefs(next)
      } catch (e: unknown) {
        if (!mounted) return
        setError(errorMessage(e, 'Errore caricamento impostazioni.'))
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [userId])

  useEffect(() => {
    if (tab !== 'security') return
    if (!userId) {
      setSecLoading(false)
      setSecEvents([])
      return
    }
    let mounted = true
    setSecLoading(true)
    setSecError(null)
    ;(async () => {
      try {
        const rows = await fetchRecentSecurityEvents(userId, 12)
        if (!mounted) return
        setSecEvents(rows)
      } catch (e: unknown) {
        if (!mounted) return
        setSecError(errorMessage(e, 'Errore caricamento attività account.'))
      } finally {
        if (mounted) setSecLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [tab, userId])

  const isDirty = useMemo(() => JSON.stringify(prefs) !== JSON.stringify(savedPrefs), [prefs, savedPrefs])

  const emailVerified = useMemo(() => {
    const u = session?.user as unknown as { email_confirmed_at?: string | null; confirmed_at?: string | null }
    return Boolean(u?.email_confirmed_at || u?.confirmed_at)
  }, [session?.user])

  const sessionStartedAt = useMemo(() => {
    const iat = tryDecodeJwtIat(session?.access_token)
    return iat ? new Date(iat * 1000) : null
  }, [session?.access_token])

  const items = useMemo<TabItem[]>(
    () => [
      { key: 'privacy', label: 'Privacy' },
      { key: 'notifications', label: 'Notifiche' },
      { key: 'security', label: 'Sicurezza' },
    ],
    [],
  )

  const save = async () => {
    if (!userId) return
    setError(null)
    setBusy(true)
    try {
      const upsert = prefsToUpsertRow(userId, prefs)
      const { data, error } = await supabase.from('user_preferences').upsert(upsert).select('*').single()
      if (error) throw error
      const parsed = safeParseUserPreferencesRow(data)
      const next = prefsFromRow(parsed)
      setPrefs(next)
      setSavedPrefs(next)

      if (prefs.locationSharing !== 'precise') {
        await supabase.from('profiles').update({ lat: null, lng: null }).eq('id', userId)
      }
    } catch (e: unknown) {
      setError(errorMessage(e, 'Errore salvataggio impostazioni.'))
    } finally {
      setBusy(false)
    }
  }

  const updatePreciseLocation = async () => {
    if (!userId) return
    setError(null)
    if (!('geolocation' in navigator)) {
      setError('Geolocalizzazione non supportata dal browser.')
      return
    }
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        ;(async () => {
          try {
            const { error } = await supabase
              .from('profiles')
              .update({ lat: pos.coords.latitude, lng: pos.coords.longitude })
              .eq('id', userId)
            if (error) throw error
          } catch (e: unknown) {
            setError(errorMessage(e, 'Impossibile salvare la posizione.'))
          } finally {
            setBusy(false)
          }
        })()
      },
      () => {
        setError('Permesso posizione negato o non disponibile.')
        setBusy(false)
      },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <Card padded={false} className="p-6 md:p-8 shadow-xl shadow-black/20 border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Impostazioni</div>
              <div className="mt-1 text-xs text-white/70">Privacy, notifiche e sicurezza del tuo account.</div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/profilo">
                <Button type="button" variant="secondary" size="sm" leftIcon={<SlidersHorizontal className="h-4 w-4" />}>
                  Profilo
                </Button>
              </Link>
              <Button type="button" size="sm" disabled={!isDirty || busy || loading} onClick={save}>
                {busy ? 'Salvataggio…' : 'Salva'}
              </Button>
            </div>
          </div>

          {error ? (
            <div className="mt-4">
              <Alert tone="danger">{error}</Alert>
            </div>
          ) : null}
        </Card>

        <div className="-mx-1 overflow-x-auto px-1">
          <Tabs value={tab} onChange={(k) => setTab(k as SettingsTab)} items={items} className="min-w-0 sm:min-w-[560px]" />
        </div>

        {tab === 'privacy' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <Card padded={false} className="p-6 border-white/5 bg-white/[0.02] shadow-inner">
                <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#4F7CFF]">
                  <Shield className="h-4 w-4" />
                  Privacy
                </div>
                <div className="mt-2 text-xs text-white/70">Controlla cosa condividi e come viene usato.</div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <div className="tb-label">Visibilità profilo</div>
                    <Select
                      value={prefs.profileVisibility}
                      onChange={(e) => setPrefs((p) => ({ ...p, profileVisibility: e.target.value as UserPreferences['profileVisibility'] }))}
                      disabled={busy || loading}
                      className="mt-1"
                    >
                      <option value="private">Privato</option>
                      <option value="public">Pubblico</option>
                    </Select>
                    <div className="mt-1 text-xs text-white/60">Se pubblico, nome e avatar possono essere visibili nelle interazioni.</div>
                  </div>

                  <div>
                    <div className="tb-label">Condivisione posizione</div>
                    <Select
                      value={prefs.locationSharing}
                      onChange={(e) => setPrefs((p) => ({ ...p, locationSharing: e.target.value as UserPreferences['locationSharing'] }))}
                      disabled={busy || loading}
                      className="mt-1"
                    >
                      <option value="off">Off</option>
                      <option value="city">Solo città</option>
                      <option value="precise">Precisa</option>
                    </Select>
                    <div className="mt-1 text-xs text-white/60">Serve per suggerimenti “vicino a me”. Puoi disattivarla in ogni momento.</div>
                  </div>
                </div>

                {prefs.locationSharing === 'precise' ? (
                  <div className="mt-4">
                    <Button type="button" variant="secondary" onClick={updatePreciseLocation} disabled={busy || loading}>
                      Aggiorna posizione precisa
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm font-semibold text-white">Posizione precisa disattivata</div>
                    <div className="mt-1 text-xs text-white/70">Per privacy, non salviamo coordinate (lat/lng) nel profilo.</div>
                  </div>
                )}

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <Switch
                    checked={prefs.voiceCommandsEnabled}
                    onChange={(v) => setPrefs((p) => ({ ...p, voiceCommandsEnabled: v }))}
                    disabled={busy || loading}
                    label="Comandi vocali (navigazione)"
                    description="Mostra il pulsante microfono: vai a Esplora, Prenotazioni, Dashboard attività e altre schermate principali (richiede browser con API voce e microfono)."
                  />
                </div>
              </Card>
            </div>

            <div className="lg:col-span-4">
              <Card padded={false} className="p-6 border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent shadow-xl">
                <div className="text-sm font-bold uppercase tracking-wider text-emerald-400">Trasparenza</div>
                <div className="mt-2 text-xs text-white/70">
                  TrustBook usa alcune informazioni (es. affidabilità e caparra) per ridurre no-show.
                </div>
                <div className="mt-3 text-xs text-white/60">Non vendiamo i tuoi dati. Le preferenze servono a darti controllo e chiarezza.</div>
              </Card>
            </div>
          </div>
        )}

        {tab === 'notifications' && (
          <Card padded={false} className="p-6 border-white/5 bg-white/[0.02] shadow-inner">
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#4F7CFF]">
              <SlidersHorizontal className="h-4 w-4" />
              Notifiche
            </div>
            <div className="mt-2 text-xs text-white/70">Scegli cosa vuoi ricevere e dove.</div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <div className="tb-label">Canali</div>
                <Switch
                  checked={prefs.channelInApp}
                  onChange={(v) => setPrefs((p) => ({ ...p, channelInApp: v }))}
                  disabled={busy || loading}
                  label="In-app"
                  description="Mostra notifiche dentro TrustBook."
                />
                <Switch
                  checked={prefs.channelEmail}
                  onChange={(v) => setPrefs((p) => ({ ...p, channelEmail: v }))}
                  disabled={busy || loading}
                  label="Email"
                  description="Ricevi email per gli eventi importanti."
                />
                <Switch
                  checked={prefs.channelPush}
                  onChange={(v) => setPrefs((p) => ({ ...p, channelPush: v }))}
                  disabled={busy || loading}
                  label="Push"
                  description="Notifiche push (preparato, richiede configurazione)."
                />
                <Switch
                  checked={prefs.channelSms}
                  onChange={(v) => setPrefs((p) => ({ ...p, channelSms: v }))}
                  disabled={busy || loading}
                  label="SMS"
                  description="SMS opzionale (preparato, richiede configurazione)."
                />
              </div>

              <div className="space-y-2">
                <div className="tb-label">Categorie</div>
                <Switch
                  checked={prefs.notifBooking}
                  onChange={(v) => setPrefs((p) => ({ ...p, notifBooking: v }))}
                  disabled={busy || loading}
                  label="Prenotazioni"
                  description="Richieste, conferme, rifiuti e cambi orario."
                />
                <Switch
                  checked={prefs.notifDeposit}
                  onChange={(v) => setPrefs((p) => ({ ...p, notifDeposit: v }))}
                  disabled={busy || loading}
                  label="Caparra"
                  description="Quando è richiesta o pagata."
                />
                <Switch
                  checked={prefs.notifMessages}
                  onChange={(v) => setPrefs((p) => ({ ...p, notifMessages: v }))}
                  disabled={busy || loading}
                  label="Messaggi"
                  description="Aggiornamenti di chat e comunicazioni operative."
                />
                <Switch
                  checked={prefs.notifMarketing}
                  onChange={(v) => setPrefs((p) => ({ ...p, notifMarketing: v }))}
                  disabled={busy || loading}
                  label="Marketing"
                  description="Novità e promozioni (facoltativo)."
                />
                <Switch
                  checked={prefs.notifReminders}
                  onChange={(v) => setPrefs((p) => ({ ...p, notifReminders: v }))}
                  disabled={busy || loading}
                  label="Promemoria"
                  description="Promemoria 24h e 2h prima della prenotazione."
                />
                <Switch
                  checked={prefs.notifOwnerAlerts}
                  onChange={(v) => setPrefs((p) => ({ ...p, notifOwnerAlerts: v }))}
                  disabled={busy || loading}
                  label="Avvisi attività"
                  description="Avvisi operativi (es. cliente a rischio no-show, assegnazioni staff)."
                />
              </div>
            </div>

            <div className="mt-4 text-xs text-white/60">
              Le preferenze filtrano subito le notifiche in-app. Le email partono solo se il canale Email è attivo e il backend SMTP è configurato; categorie disattivate non ricevono email. Push e SMS non sono ancora inviati dal server (qui salvi solo la preferenza futura).
            </div>
            <div className="mt-3">
              <Link to="/notifiche">
                <Button type="button" variant="secondary">Apri inbox notifiche</Button>
              </Link>
            </div>
          </Card>
        )}

        {tab === 'security' && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <Card padded={false} className="p-6 border-white/5 bg-white/[0.02] shadow-inner">
                <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-rose-400">
                  <Lock className="h-4 w-4" />
                  Sicurezza
                </div>
                <div className="mt-2 text-xs text-white/70">Azioni e segnali di sicurezza del tuo account.</div>

                <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-white/60">Email</div>
                  <div className="mt-1 text-sm font-semibold text-white">{userEmail ?? '—'}</div>
                  <div className="mt-2 text-xs text-white/70">Verifica email: {emailVerified ? 'completata' : 'non verificata'}</div>
                </div>

                <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-white/60">Sessione attuale</div>
                  <div className="mt-2 text-xs text-white/70">
                    {sessionStartedAt ? `Accesso avviato: ${formatDateTime(sessionStartedAt.toISOString())}` : 'Accesso avviato: —'}
                  </div>
                  <div className="mt-1 text-xs text-white/60">Mostriamo solo dati essenziali. Non salviamo IP in-app.</div>
                </div>

                <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-white/60">Ruolo</div>
                  <div className="mt-1 text-sm font-semibold text-white">{profile?.role ?? '—'}</div>
                  <div className="mt-2 text-xs text-white/70">Stato account: {profile?.account_status ?? 'active'}</div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <Link to="/reset-password" className="w-full">
                    <Button type="button" variant="secondary" className="w-full">Reimposta password</Button>
                  </Link>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      ;(async () => {
                        await signOut()
                      })().finally(() => {
                        nav('/login', { replace: true })
                      })
                    }}
                  >
                    Logout
                  </Button>
                </div>

                <div className="mt-4">
                  <div className="text-sm font-semibold text-white">Attività account</div>
                  <div className="mt-1 text-xs text-white/70">Ultimi accessi e cambi password registrati da TrustBook.</div>

                  {secError ? (
                    <div className="mt-3">
                      <Alert tone="danger">{secError}</Alert>
                    </div>
                  ) : null}

                  {secLoading ? (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">Caricamento…</div>
                  ) : secEvents.length === 0 ? (
                    <div className="mt-3">
                      <EmptyState
                        title="Nessuna attività registrata"
                        description="Dopo i prossimi login/logout vedrai qui una timeline utile per la sicurezza."
                      />
                    </div>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {secEvents.map((ev) => (
                        <div key={ev.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-semibold text-white">
                                {ev.event_type === 'login'
                                  ? 'Accesso'
                                  : ev.event_type === 'logout'
                                    ? 'Logout'
                                    : 'Password aggiornata'}
                              </div>
                              <div className="mt-1 text-xs text-white/70">{formatDateTime(ev.created_at)}</div>
                              {ev.device ? <div className="mt-1 text-xs text-white/60">{ev.device}</div> : null}
                            </div>
                            <div className="text-xs text-white/60">{ev.source === 'recovery' ? 'Recovery' : 'App'}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>
            <div className="lg:col-span-4">
              <Card padded={false} className="p-6 border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent shadow-xl">
                <div className="text-sm font-bold uppercase tracking-wider text-amber-400">Consigli</div>
                <div className="mt-2 text-xs text-white/70">Usa una password unica e aggiorna le preferenze notifiche.</div>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
