import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleUser,
  ClipboardList,
  Clock,
  CreditCard,
  LayoutDashboard,
  LayoutGrid,
  Layers,
  LogOut,
  MapPin,
  Menu,
  NotebookTabs,
  Settings2,
  Star,
  Store,
  User,
  Users,
  Briefcase,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/authContext'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import Navbar from '@/shared/ui/Navbar'
import Button from '@/shared/ui/Button'
import Select from '@/shared/ui/Select'
import Badge from '@/shared/ui/Badge'
import Alert from '@/shared/ui/Alert'
import Card from '@/shared/ui/Card'
import ListItem from '@/shared/ui/ListItem'
import { useToast } from '@/shared/ui/toastContext'
import VoiceCommandFab from '@/components/VoiceCommandFab'
import MobileBottomNav from '@/components/MobileBottomNav'
import type { VoiceNavContext } from '@/lib/voiceNavigation'
import { encodeNext, safeNextPath } from '@/shared/navigation/next'

export default function AppShell(props: { children: React.ReactNode }) {
  const { session, profile, signOut, refreshProfile } = useAuth()
  const { push } = useToast()
  const nav = useNavigate()
  const loc = useLocation()

  const user = session?.user ?? null
  const voiceNavRole: VoiceNavContext =
    profile?.role === 'attivita' ? 'attivita' : profile?.role === 'cliente' ? 'cliente' : 'unknown'
  const isActivity = profile?.role === 'attivita'
  const [roleUpdating, setRoleUpdating] = useState(false)
  const [roleError, setRoleError] = useState<string | null>(null)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifError, setNotifError] = useState<string | null>(null)
  const [notifItems, setNotifItems] = useState<Array<{ label: string; to: string; count: number }>>([])
  const notifMenuRef = useRef<HTMLDivElement | null>(null)
  const [myScore, setMyScore] = useState<number | null>(null)
  const [myStars, setMyStars] = useState<number | null>(null)
  /** Solo chi ha almeno un’attività come owner può aprire Pagamenti Stripe (API già 403 per lo staff). */
  const [ownsBusinessActivity, setOwnsBusinessActivity] = useState(false)
  const notifRefreshInFlight = useRef(false)
  const [activityMenuOpen, setActivityMenuOpen] = useState(false)
  const [activityMenuCollapsed, setActivityMenuCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('tb_activity_menu_collapsed') === '1'
  })

  const notifCount = useMemo(() => {
    return notifItems.reduce((a, x) => a + x.count, 0)
  }, [notifItems])

  useEffect(() => {
    if (!user || !profile) return
    let mounted = true

    const refresh = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      if (notifRefreshInFlight.current) return
      notifRefreshInFlight.current = true
      try {
        setNotifError(null)

        const loadUnreadMessages = async (
          params: { to: string; businessIds?: string[]; customerOnly?: boolean },
        ) => {
          const { data, error } = await supabase.rpc(
            'unread_booking_messages_count_for_current_user',
            {
              p_business_ids: params.businessIds?.length ? params.businessIds : null,
              p_customer_only: Boolean(params.customerOnly),
            },
          )
          if (error) throw error
          const total = typeof data === 'number' ? data : 0
          const shown = Math.min(99, total)
          return shown > 0 ? ({ label: 'Messaggi', to: params.to, count: shown } as const) : null
        }

        const loadUnreadNotifications = async () => {
          const nowIso = new Date().toISOString()
          const { data, error } = await supabase
            .from('notifications')
            .select('id')
            .eq('recipient_user_id', user.id)
            .is('read_at', null)
            .or(`deliver_at.is.null,deliver_at.lte.${nowIso}`)
            .limit(99)
          if (error) throw error
          const shown = Math.min(99, Array.isArray(data) ? data.length : 0)
          return shown > 0 ? ({ label: 'Notifiche', to: '/notifiche', count: shown } as const) : null
        }

        if (profile.role === 'cliente') {
          if (mounted) setOwnsBusinessActivity(false)
          const { data: rel, error: relErr } = await supabase
            .from('customer_reliability')
            .select('score,stars')
            .eq('user_id', user.id)
            .maybeSingle()
          if (relErr) throw relErr
          if (mounted) {
            setMyScore(((rel as { score: number } | null)?.score ?? 80) as number)
            setMyStars(((rel as { stars: number } | null)?.stars ?? 0) as number)
          }

          const { data, error } = await supabase
            .from('bookings')
            .select('id,status')
            .eq('customer_user_id', user.id)
            .in('status', ['pending_deposit', 'requires_deposit', 'pending_payment_setup', 'change_proposed'])
          if (error) throw error
          const rows = (data as Array<{ status: string }> | null) ?? []
          const pendingDeposit = rows.filter((r) => r.status === 'pending_deposit' || r.status === 'requires_deposit' || r.status === 'pending_payment_setup').length
          const changeProposed = rows.filter((r) => r.status === 'change_proposed').length

          const now = new Date()
          const next24h = new Date(now.getTime() + 24 * 60 * 60_000)
          const { data: reminderRows, error: remErr } = await supabase
            .from('bookings')
            .select('id')
            .eq('customer_user_id', user.id)
            .gte('start_at', now.toISOString())
            .lt('start_at', next24h.toISOString())
            .in('status', ['confirmed', 'pending_deposit', 'requires_deposit', 'pending_payment_setup', 'pending_approval'])
            .limit(99)
          if (remErr) throw remErr
          const reminderCount = Math.min(99, Array.isArray(reminderRows) ? reminderRows.length : 0)

          const next: Array<{ label: string; to: string; count: number }> = []
          const unreadNotifs = await loadUnreadNotifications()
          if (unreadNotifs) next.push(unreadNotifs)
          if (pendingDeposit) next.push({ label: 'Paga caparra', to: '/prenotazioni', count: pendingDeposit })
          if (changeProposed) next.push({ label: 'Proposte orario', to: '/prenotazioni', count: changeProposed })
          if (reminderCount > 0) next.push({ label: 'Promemoria 24h', to: '/prenotazioni', count: reminderCount })
          const unread = await loadUnreadMessages({ to: '/prenotazioni', customerOnly: true })
          if (unread) next.push(unread)
          if (mounted) setNotifItems(next)
          return
        }

        if (mounted) {
          setMyScore(null)
          setMyStars(null)
        }

        const [ownedRes, memberRes] = await Promise.all([
          supabase.from('businesses').select('id').eq('owner_user_id', user.id),
          supabase.from('team_members').select('business_id').eq('user_id', user.id),
        ])
        if (ownedRes.error) throw ownedRes.error
        if (memberRes.error) throw memberRes.error
        const ownedIds = ((ownedRes.data as Array<{ id: string }>) ?? []).map((x) => x.id)
        const memberIds = ((memberRes.data as Array<{ business_id: string }>) ?? []).map((x) => x.business_id)
        if (mounted) setOwnsBusinessActivity(ownedIds.length > 0)
        const businessIds = Array.from(new Set([...ownedIds, ...memberIds].filter(Boolean)))
        if (!businessIds.length) {
          if (mounted) setNotifItems([])
          return
        }

        const { data, error } = await supabase
          .from('bookings')
          .select('id,status')
          .in('business_id', businessIds)
          .in('status', ['requested', 'pending_approval', 'change_proposed'])
        if (error) throw error
        const rows = (data as Array<{ status: string }> | null) ?? []
        const requested = rows.filter((r) => r.status === 'requested').length
        const pendingApproval = rows.filter((r) => r.status === 'pending_approval').length
        const changeProposed = rows.filter((r) => r.status === 'change_proposed').length

        const next: Array<{ label: string; to: string; count: number }> = []
        const unreadNotifs = await loadUnreadNotifications()
        if (unreadNotifs) next.push(unreadNotifs)
        if (requested) next.push({ label: 'Nuove richieste', to: '/dashboard-attivita', count: requested })
        if (pendingApproval) next.push({ label: 'In attesa', to: '/dashboard-attivita', count: pendingApproval })
        if (changeProposed) next.push({ label: 'Proposte inviate', to: '/dashboard-attivita', count: changeProposed })
        const unread = await loadUnreadMessages({ to: '/dashboard-attivita', businessIds })
        if (unread) next.push(unread)
        if (mounted) setNotifItems(next)
      } catch (e: unknown) {
        if (!mounted) return
        setNotifError(errorMessage(e, 'Errore notifiche.'))
        setNotifItems([])
        setOwnsBusinessActivity(false)
        if (mounted) {
          setMyScore(null)
          setMyStars(null)
        }
      } finally {
        notifRefreshInFlight.current = false
      }
    }

    void refresh()
    /**
     * Polling fallback: only when the realtime channel is NOT connected.
     * When `tb:realtime-online` is dispatched, we widen the interval to 5min
     * (heartbeat) to reduce duplicate work; on `tb:realtime-offline` we drop back to 30s.
     * This single-source-of-truth approach eliminates the duplicate-refresh
     * cost noted in the audit (was: polling AND realtime concurrently).
     */
    let intervalMs = 30_000
    let id = window.setInterval(() => {
      void refresh()
    }, intervalMs)
    const reschedule = (ms: number) => {
      if (intervalMs === ms) return
      window.clearInterval(id)
      intervalMs = ms
      id = window.setInterval(() => {
        void refresh()
      }, intervalMs)
    }
    const onRealtimeOnline = () => reschedule(300_000)
    const onRealtimeOffline = () => reschedule(30_000)
    const onForceRefresh = () => {
      void refresh()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    window.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('tb:refresh-notifs', onForceRefresh)
    window.addEventListener('tb:realtime-online', onRealtimeOnline)
    window.addEventListener('tb:realtime-offline', onRealtimeOffline)

    return () => {
      mounted = false
      window.clearInterval(id)
      window.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('tb:refresh-notifs', onForceRefresh)
      window.removeEventListener('tb:realtime-online', onRealtimeOnline)
      window.removeEventListener('tb:realtime-offline', onRealtimeOffline)
    }
  }, [profile, user])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem('tb_activity_menu_collapsed', activityMenuCollapsed ? '1' : '0')
  }, [activityMenuCollapsed])

  useEffect(() => {
    if (!activityMenuOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActivityMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activityMenuOpen])

  useEffect(() => {
    if (!notifOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotifOpen(false)
    }
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target
      if (!(target instanceof Node)) return
      if (notifMenuRef.current && !notifMenuRef.current.contains(target)) setNotifOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [notifOpen])

  const tabs: Array<{ to: string; label: string; icon: React.ReactNode; show?: boolean }> = [
    {
      to: '/dashboard-cliente',
      label: 'La mia area',
      icon: <CircleUser className="h-4 w-4" />,
      show: profile?.role === 'cliente',
    },
    {
      to: '/esplora',
      label: 'Esplora',
      icon: <MapPin className="h-4 w-4" />,
      show: profile?.role === 'cliente',
    },
    {
      to: '/prenotazioni',
      label: 'Prenotazioni',
      icon: <NotebookTabs className="h-4 w-4" />,
      show: profile?.role === 'cliente',
    },
    {
      to: '/dashboard-attivita',
      label: 'Area attività',
      icon: <Store className="h-4 w-4" />,
      show: profile?.role === 'attivita',
    },
    {
      to: '/pagamenti-attivita',
      label: 'Pagamenti',
      icon: <NotebookTabs className="h-4 w-4" />,
      show: profile?.role === 'attivita' && ownsBusinessActivity,
    },
    { to: '/profilo', label: 'Profilo', icon: <User className="h-4 w-4" /> },
    { to: '/impostazioni', label: 'Impostazioni', icon: <Settings2 className="h-4 w-4" /> },
  ]

  const activityNavItems = useMemo<Array<{ to: string; label: string; icon: React.ReactNode; badge?: number }>>(() => {
    const base: Array<{ to: string; label: string; icon: React.ReactNode; badge?: number }> = [
      { to: '/dashboard-attivita', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
      ...(ownsBusinessActivity ? [{ to: '/pagamenti-attivita', label: 'Pagamenti', icon: <CreditCard className="h-4 w-4" /> }] : []),
      {
        to: '/notifiche',
        label: 'Notifiche',
        icon: <Bell className="h-4 w-4" />,
        badge: notifCount > 0 ? Math.min(99, notifCount) : 0,
      },
      { to: '/impostazioni', label: 'Impostazioni', icon: <Settings2 className="h-4 w-4" /> },
      { to: '/profilo', label: 'Profilo', icon: <User className="h-4 w-4" /> },
    ]

    if (loc.pathname !== '/dashboard-attivita') return base

    const badge = notifCount > 0 ? Math.min(99, notifCount) : 0
    const dashTabs = [
      { key: 'tutte', label: 'Tutte', icon: <Layers className="h-4 w-4" /> },
      { key: 'panoramica', label: 'Panoramica', icon: <LayoutGrid className="h-4 w-4" /> },
      { key: 'prenotazioni', label: 'Prenotazioni', icon: <ClipboardList className="h-4 w-4" /> },
      { key: 'calendario', label: 'Calendario', icon: <CalendarDays className="h-4 w-4" /> },
      { key: 'direzione', label: 'Direzione', icon: <BarChart3 className="h-4 w-4" /> },
      { key: 'notifiche', label: 'Notifiche', icon: <Bell className="h-4 w-4" />, badge },
      { key: 'impostazioni', label: 'Impostazioni', icon: <Settings2 className="h-4 w-4" /> },
      { key: 'servizi', label: 'Servizi', icon: <Briefcase className="h-4 w-4" /> },
      { key: 'orari', label: 'Orari/Ferie', icon: <Clock className="h-4 w-4" /> },
      { key: 'staff', label: 'Staff', icon: <Users className="h-4 w-4" /> },
      { key: 'abbonamento', label: 'Abbonamento', icon: <CreditCard className="h-4 w-4" /> },
    ] as const

    const dashItems = dashTabs.map((t) => ({
      to: `/dashboard-attivita?tab=${t.key}`,
      label: t.label,
      icon: t.icon,
      badge: 'badge' in t ? t.badge : undefined,
    }))

    return [...dashItems, ...base]
  }, [loc.pathname, notifCount, ownsBusinessActivity])

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/[0.08] bg-[#0a111d]/78 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.38)]">
        <div className="mx-auto max-w-6xl px-4 py-3">
          <Navbar>
            <div className="flex items-center gap-2">
              {isActivity ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="md:hidden"
                  aria-label="Apri menu"
                  leftIcon={<Menu className="h-4 w-4" />}
                  onClick={() => setActivityMenuOpen(true)}
                />
              ) : null}

              {isActivity ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="hidden md:inline-flex"
                  aria-label={activityMenuCollapsed ? 'Espandi menu' : 'Comprimi menu'}
                  leftIcon={(activityMenuCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />) as unknown as React.ReactNode}
                  onClick={() => setActivityMenuCollapsed((v) => !v)}
                />
              ) : null}

              <Link to="/" className="flex items-center gap-3 text-white transition-opacity hover:opacity-95">
                <div
                  className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#7398FF] via-[#4F7CFF] to-[#3559d8] shadow-lg shadow-[#4F7CFF]/35 ring-2 ring-white/[0.12]"
                  aria-hidden
                />
                <div className="leading-tight">
                  <div className="text-[15px] font-semibold tracking-tight">TrustBook</div>
                  <div className="text-[11px] font-medium text-white/62">Prenotazioni anti no-show</div>
                </div>
              </Link>
            </div>

            {!isActivity ? (
              <nav className="hidden items-center gap-2 md:flex">
                {tabs
                  .filter((t) => t.show !== false)
                  .map((t) => {
                    const active = loc.pathname === t.to
                    return (
                      <Link
                        key={t.to}
                        to={t.to}
                        className={cn(
                          'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold tracking-tight transition-colors duration-150',
                          active
                            ? 'bg-[#4F7CFF]/18 text-white shadow-sm shadow-black/25 ring-1 ring-[#4F7CFF]/35'
                            : 'text-white/72 hover:bg-white/[0.07] hover:text-white',
                        )}
                      >
                        {t.icon}
                        {t.label}
                      </Link>
                    )
                  })}
              </nav>
            ) : (
              <div className="hidden md:block" />
            )}

          <div className="flex items-center gap-3">
            {user && (
              <div className="hidden rounded-xl border border-white/[0.09] bg-white/[0.045] px-3 py-2 text-xs text-white/82 shadow-sm shadow-black/20 backdrop-blur-sm sm:block">
                <div className="font-medium text-white">{user.email}</div>
                <div className="text-white/60">
                  Ruolo: {profile?.role ?? '—'}
                </div>
                {profile?.role === 'cliente' && (
                  <div className="text-white/60">Affidabilità: {myScore ?? 80}/100</div>
                )}
                {profile?.role === 'cliente' && (
                  <div className="text-white/60">Stelle: {myStars ?? 0}</div>
                )}
              </div>
            )}

            {user && profile && (
              <div className="hidden items-center gap-2 md:flex">
                <Select
                  value={profile.role}
                  disabled={roleUpdating}
                  onChange={(e) => {
                    const nextRole = e.target.value
                    if (nextRole !== 'cliente' && nextRole !== 'attivita') return
                    setRoleError(null)
                    setRoleUpdating(true)
                    ;(async () => {
                      try {
                        const { error } = await supabase
                          .from('profiles')
                          .update({ role: nextRole })
                          .eq('id', user.id)
                        if (error) throw error

                        await refreshProfile()
                        if (nextRole === 'attivita') nav('/dashboard-attivita', { replace: true })
                        else nav('/esplora', { replace: true })
                        push({ tone: 'success', title: 'Ruolo aggiornato', description: `Ora sei in modalità ${nextRole}.` })
                      } catch (err: unknown) {
                        setRoleError(errorMessage(err, 'Errore cambio ruolo.'))
                        push({ tone: 'danger', title: 'Errore cambio ruolo', description: 'Riprova tra poco.' })
                      } finally {
                        setRoleUpdating(false)
                      }
                    })()
                  }}
                  className={cn('text-xs', roleUpdating && 'opacity-60')}
                >
                  <option value="cliente">Cliente</option>
                  <option value="attivita">Attività</option>
                </Select>
              </div>
            )}

            {user && profile?.role === 'cliente' && (
              <div className="inline-flex items-center gap-2 rounded-xl border border-white/[0.09] bg-white/[0.045] px-3 py-2 text-xs font-semibold tracking-tight text-white/82 shadow-sm shadow-black/15 backdrop-blur-sm">
                <span className="font-semibold">{myScore ?? 80}/100</span>
                <span className="text-white/50">·</span>
                <Star
                  className={cn(
                    'h-4 w-4',
                    (myScore ?? 80) === 100 ? 'fill-[#4F7CFF] text-[#4F7CFF]' : 'text-white/60',
                  )}
                />
                <span className="font-semibold">{myStars ?? 0}</span>
              </div>
            )}

            {user ? (
              <>
                <div className="relative" ref={notifMenuRef}>
                  <Button
                    type="button"
                    onClick={() => setNotifOpen((v) => !v)}
                    variant="secondary"
                    size="sm"
                    leftIcon={<Bell className="h-4 w-4" />}
                    aria-expanded={notifOpen}
                    aria-haspopup="dialog"
                  >
                    <span className="hidden sm:inline">Notifiche</span>
                    {notifCount > 0 && (
                      <Badge className="ml-1" tone="info">
                        {notifCount}
                      </Badge>
                    )}
                  </Button>

                  {notifOpen && (
                    <div className="absolute right-0 top-12 z-30 w-80">
                      <Card
                        padded={false}
                        className="tb-card-blur border-white/[0.1] bg-[#0c1426]/92 p-3 shadow-tbElevated"
                      >
                      <div className="text-xs font-semibold text-white/60">AZIONI</div>
                      {notifError && (
                        <div className="mt-2">
                          <Alert tone="danger">{notifError}</Alert>
                        </div>
                      )}
                      {notifItems.length === 0 ? (
                        <div className="mt-2 text-sm text-white/70">Niente di urgente.</div>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {notifItems.map((it) => (
                            <button
                              key={`${it.to}_${it.label}`}
                              type="button"
                              onClick={() => {
                                setNotifOpen(false)
                                nav(it.to)
                              }}
                              className="group w-full rounded-2xl text-left"
                            >
                              <ListItem
                                title={it.label}
                                right={
                                  <Badge tone="neutral" className="px-2">
                                    {it.count}
                                  </Badge>
                                }
                                className="group-hover:bg-white/10 group-active:bg-white/10"
                              />
                            </button>
                          ))}
                        </div>
                      )}

                        <div className="mt-3">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setNotifOpen(false)
                              nav('/notifiche')
                            }}
                            className="w-full"
                          >
                            Vedi tutte le notifiche
                          </Button>
                        </div>
                      </Card>
                    </div>
                  )}
                </div>

                <Button
                  type="button"
                  onClick={() => {
                    ;(async () => {
                      await Promise.race([
                        signOut(),
                        new Promise<void>((resolve) => {
                          window.setTimeout(() => resolve(), 1500)
                        }),
                      ])
                    })().finally(() => {
                      nav('/login', { replace: true })
                    })
                  }}
                  variant="secondary"
                  size="sm"
                  leftIcon={<LogOut className="h-4 w-4" />}
                >
                  Esci
                </Button>
              </>
            ) : (
              <Link
                to={`/start${(() => {
                  const next = safeNextPath(`${loc.pathname}${loc.search}`)
                  return next ? `?next=${encodeNext(next)}` : ''
                })()}`}
              >
                <Button type="button" variant="secondary" size="sm" leftIcon={<User className="h-4 w-4" />}>
                  Accedi
                </Button>
              </Link>
            )}
          </div>
          </Navbar>
        </div>
      </header>

      {roleError && (
        <div className="mx-auto max-w-6xl px-4 pt-4">
          <Alert tone="danger">{roleError}</Alert>
        </div>
      )}

      {isActivity ? (
        <div className="mx-auto max-w-6xl px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-6">
          <div className="flex items-start gap-4">
            <aside
              className={cn(
                'hidden md:block sticky top-24 tb-card tb-card-blur tb-scroll max-h-[calc(100vh-7.5rem)] overflow-y-scroll overscroll-contain border-white/[0.09] p-3 pr-2 shadow-[var(--tb-card-shadow)]',
                activityMenuCollapsed ? 'w-[76px]' : 'w-64',
              )}
            >
              <div className={cn('space-y-2', activityMenuCollapsed ? 'items-center' : '')}>
                {activityNavItems.map((it) => {
                  const active = (() => {
                    if (it.to.startsWith('/dashboard-attivita?tab=')) {
                      if (loc.pathname !== '/dashboard-attivita') return false
                      const current = new URLSearchParams(loc.search).get('tab')
                      const mine = it.to.split('tab=')[1] ?? null
                      return Boolean(current && mine && current === mine)
                    }
                    return loc.pathname === it.to
                  })()
                  return (
                    <Link
                      key={it.to}
                      to={it.to}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl border border-white/[0.09] bg-white/[0.04] px-3 py-2 text-sm font-semibold tracking-tight shadow-sm shadow-black/15 transition-colors duration-150 ease-out',
                        active ? 'border-[#4F7CFF]/28 bg-[#4F7CFF]/14 text-white ring-1 ring-[#4F7CFF]/22' : 'text-white/72 hover:border-white/[0.12] hover:bg-white/[0.07] hover:text-white',
                        activityMenuCollapsed ? 'justify-center px-2' : '',
                      )}
                    >
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.06] text-white/88 shadow-inner shadow-black/20">
                        {it.icon}
                      </span>
                      {activityMenuCollapsed ? <span className="sr-only">{it.label}</span> : <span className="min-w-0 flex-1 truncate">{it.label}</span>}
                      {!activityMenuCollapsed && it.badge ? (
                        <Badge tone="info" className="px-2">
                          {it.badge}
                        </Badge>
                      ) : null}
                    </Link>
                  )
                })}
              </div>
            </aside>

            <main className="min-w-0 flex-1">{props.children}</main>
          </div>
        </div>
      ) : (
        <main id="main" className="mx-auto max-w-6xl px-4 py-6 pb-[calc(env(safe-area-inset-bottom)+72px)] md:pb-6">{props.children}</main>
      )}

      {user && profile ? <MobileBottomNav role={voiceNavRole} notifCount={notifCount} /> : null}

      {isActivity ? (
        <div
          className={cn(
            'fixed inset-0 z-[60] md:hidden transition',
            activityMenuOpen ? 'pointer-events-auto' : 'pointer-events-none',
          )}
          aria-hidden={!activityMenuOpen}
        >
          <div
            className={cn('absolute inset-0 bg-black/60 transition-opacity', activityMenuOpen ? 'opacity-100' : 'opacity-0')}
            onClick={() => setActivityMenuOpen(false)}
          />
          <div
            className={cn(
              'absolute left-0 top-0 h-[100dvh] w-[84%] max-w-[340px] overflow-hidden p-3 transition-transform duration-200 ease-out',
              activityMenuOpen ? 'translate-x-0' : '-translate-x-full',
            )}
          >
            <div className="tb-card tb-card-blur tb-scroll h-full overflow-y-scroll overscroll-contain border-white/[0.1] p-3 shadow-tbElevated">
              <div className="sticky top-0 z-10 -mx-3 border-b border-white/[0.06] bg-[#0c1426]/88 px-4 py-3 backdrop-blur-md">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#a8b9ff]/95">Menu attività</div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    aria-label="Chiudi menu"
                    leftIcon={<X className="h-4 w-4" />}
                    onClick={() => setActivityMenuOpen(false)}
                  />
                </div>
              </div>
              <div className="space-y-2 pr-2">
                {activityNavItems.map((it) => {
                  const active = (() => {
                    if (it.to.startsWith('/dashboard-attivita?tab=')) {
                      if (loc.pathname !== '/dashboard-attivita') return false
                      const current = new URLSearchParams(loc.search).get('tab')
                      const mine = it.to.split('tab=')[1] ?? null
                      return Boolean(current && mine && current === mine)
                    }
                    return loc.pathname === it.to
                  })()
                  return (
                    <Link
                      key={it.to}
                      to={it.to}
                      onClick={() => setActivityMenuOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-2xl border border-white/[0.09] bg-white/[0.04] px-3 py-2 text-sm font-semibold tracking-tight shadow-sm shadow-black/15 transition-colors duration-150 ease-out',
                        active ? 'border-[#4F7CFF]/28 bg-[#4F7CFF]/14 text-white ring-1 ring-[#4F7CFF]/22' : 'text-white/72 hover:border-white/[0.12] hover:bg-white/[0.07] hover:text-white',
                      )}
                    >
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.06] text-white/88 shadow-inner shadow-black/20">
                        {it.icon}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{it.label}</span>
                      {it.badge ? (
                        <Badge tone="info" className="px-2">
                          {it.badge}
                        </Badge>
                      ) : null}
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <VoiceCommandFab userId={user?.id ?? null} profileRole={voiceNavRole} />
    </div>
  )
}
