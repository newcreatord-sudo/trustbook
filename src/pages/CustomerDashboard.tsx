import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Heart, Star, ShieldCheck, ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/authContext'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/utils/time'
import Card from '@/shared/ui/Card'
import Button from '@/shared/ui/Button'
import Alert from '@/shared/ui/Alert'
import EmptyState from '@/shared/ui/EmptyState'
import Skeleton from '@/shared/ui/Skeleton'
import CustomerSubscriptionPanel from '@/pages/dashboard/CustomerSubscriptionPanel'

type BookingLite = {
  id: string
  status: string
  start_at: string
  businesses: { id: string; name: string } | null
}

export default function CustomerDashboard() {
  const { session, profile } = useAuth()
  const userId = session?.user?.id ?? null

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [score, setScore] = useState<number>(80)
  const [stars, setStars] = useState<number>(0)
  const [upcoming, setUpcoming] = useState<BookingLite[]>([])
  const [history, setHistory] = useState<BookingLite[]>([])
  const [favorites, setFavorites] = useState<Array<{ businessId: string; name: string; category: string; city: string | null }>>(
    [],
  )

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      setUpcoming([])
      setHistory([])
      setFavorites([])
      return
    }
    let mounted = true
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const nowIso = new Date().toISOString()

        const [relRes, upcomingRes, historyRes, favRes] = await Promise.all([
          supabase.from('customer_reliability').select('score,stars').eq('user_id', userId).maybeSingle(),
          supabase
            .from('bookings')
            .select('id,status,start_at,businesses(id,name)')
            .eq('customer_user_id', userId)
            .gte('start_at', nowIso)
            .order('start_at', { ascending: true })
            .limit(6),
          supabase
            .from('bookings')
            .select('id,status,start_at,businesses(id,name)')
            .eq('customer_user_id', userId)
            .lt('start_at', nowIso)
            .order('start_at', { ascending: false })
            .limit(6),
          supabase
            .from('favorite_businesses')
            .select('business_id,businesses(id,name,category,city)')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(6),
        ])

        if (!mounted) return
        if (relRes.error) throw relRes.error
        if (upcomingRes.error) throw upcomingRes.error
        if (historyRes.error) throw historyRes.error
        if (favRes.error) throw favRes.error

        const rel = (relRes.data as { score: number; stars: number } | null) ?? null
        setScore(rel?.score ?? 80)
        setStars(rel?.stars ?? 0)

        const firstRel = <T,>(x: T | T[] | null | undefined): T | null => {
          if (Array.isArray(x)) return x[0] ?? null
          return x ?? null
        }

        const normalizeBookings = (raw: unknown) => {
          const list = (raw as Array<{
            id: string
            status: string
            start_at: string
            businesses: { id: string; name: string } | Array<{ id: string; name: string }> | null
          }>)
          return (list ?? []).map((b) => ({
            id: b.id,
            status: b.status,
            start_at: b.start_at,
            businesses: firstRel(b.businesses),
          })) as BookingLite[]
        }

        setUpcoming(normalizeBookings(upcomingRes.data))
        setHistory(normalizeBookings(historyRes.data))

        const favRaw = (favRes.data as unknown as Array<{
          business_id: string
          businesses: { id: string; name: string; category: string; city: string | null } | Array<{ id: string; name: string; category: string; city: string | null }> | null
        }>)
        setFavorites(
          (favRaw ?? [])
            .map((x) => {
              const biz = firstRel(x.businesses)
              return biz ? { businessId: x.business_id, name: biz.name, category: biz.category, city: biz.city } : null
            })
            .filter(Boolean) as Array<{ businessId: string; name: string; category: string; city: string | null }>,
        )
      } catch (e: unknown) {
        if (!mounted) return
        setError(errorMessage(e, 'Errore caricamento dashboard.'))
      }

      if (mounted) setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [userId])

  const isCustomer = profile?.role === 'cliente'

  const scoreLabel = useMemo(() => {
    if (score >= 90) return 'Eccellente'
    if (score >= 75) return 'Buona'
    if (score >= 60) return 'Media'
    return 'Bassa'
  }, [score])

  return (
    <AppShell>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <Card padded={false} className="border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent p-6 shadow-2xl md:p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">Il tuo profilo</h1>
                <p className="mt-1 text-sm font-medium text-white/60">Gestisci prenotazioni, affidabilità e preferiti.</p>
              </div>
              <Link to="/prenotazioni">
                <Button type="button" variant="secondary" rightIcon={<ChevronRight className="h-4 w-4" />}>
                  Gestisci prenotazioni
                </Button>
              </Link>
            </div>

            {!isCustomer && (
              <div className="mt-6">
                <Alert tone="info">
                  Per usare la dashboard cliente devi entrare come <span className="font-bold">Cliente</span>.
                </Alert>
              </div>
            )}

            {error && (
              <div className="mt-6">
                <Alert tone="danger">{error}</Alert>
              </div>
            )}

            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02] p-5 shadow-inner">
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-[#4F7CFF]/10 blur-2xl" />
                <div className="relative">
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-[#7D9BFF]">
                    <ShieldCheck className="h-4 w-4" />
                    Affidabilità
                  </div>
                  <div className="mt-3 flex items-end justify-between">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold leading-none text-white">{score}</span>
                      <span className="text-sm font-medium text-white/40">/100</span>
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-xs font-bold text-amber-400">
                      <Star className="h-3 w-3 fill-amber-400" />
                      {stars}
                    </div>
                  </div>
                  <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#4F7CFF] to-[#8CA8FF] transition-all duration-1000 ease-out" style={{ width: `${score}%` }} />
                  </div>
                  <div className="mt-2 text-xs font-medium text-white/50">{scoreLabel}.</div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 shadow-inner transition-colors hover:bg-white/[0.04]">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  <CalendarDays className="h-4 w-4" />
                  Prossime
                </div>
                <div className="mt-3 text-3xl font-bold leading-none text-white">{upcoming.length}</div>
                <div className="mt-4 text-xs font-medium text-white/50">In arrivo a breve.</div>
              </div>

              <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 shadow-inner transition-colors hover:bg-white/[0.04]">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-rose-400">
                  <Heart className="h-4 w-4" />
                  Preferiti
                </div>
                <div className="mt-3 text-3xl font-bold leading-none text-white">{favorites.length}</div>
                <div className="mt-4 text-xs font-medium text-white/50">Attività salvate.</div>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-white/80">Prossimi appuntamenti</h3>
                </div>
                <div className="space-y-3">
                  {loading ? (
                    <Skeleton className="h-24 w-full rounded-2xl" />
                  ) : upcoming.length === 0 ? (
                    <EmptyState
                      title="Nessun appuntamento"
                      description="Non hai prenotazioni future."
                    />
                  ) : (
                    upcoming.map((b) => (
                      <Link
                        key={b.id}
                        to="/prenotazioni"
                        className="group flex flex-col justify-center rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:border-white/10 hover:bg-white/[0.04]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-base font-bold text-white group-hover:text-[#4F7CFF] transition-colors">{b.businesses?.name ?? 'Attività'}</span>
                          <span className={cn(
                            "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
                            b.status === 'confirmed' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                            b.status === 'pending_approval' ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                            b.status === 'pending_deposit' || b.status === 'requires_deposit' || b.status === 'pending_payment_setup' ? "bg-[#4F7CFF]/10 text-[#7D9BFF] border border-[#4F7CFF]/20" :
                            "bg-white/5 text-white/60 border border-white/10"
                          )}>
                            {b.status}
                          </span>
                        </div>
                        <div className="mt-2 text-sm font-medium text-white/50">{formatDateTime(b.start_at)}</div>
                      </Link>
                    ))
                  )}
                </div>
              </div>

              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-white/80">Storico recente</h3>
                </div>
                <div className="space-y-3">
                  {loading ? (
                    <Skeleton className="h-24 w-full rounded-2xl" />
                  ) : history.length === 0 ? (
                    <EmptyState
                      title="Nessuno storico"
                      description="Nessuna prenotazione passata."
                    />
                  ) : (
                    history.map((b) => (
                      <Link
                        key={b.id}
                        to="/prenotazioni"
                        className="group flex flex-col justify-center rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:border-white/10 hover:bg-white/[0.04]"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-base font-bold text-white group-hover:text-[#4F7CFF] transition-colors">{b.businesses?.name ?? 'Attività'}</span>
                          <span className="text-xs font-semibold text-white/40 capitalize">{b.status}</span>
                        </div>
                        <div className="mt-2 text-sm font-medium text-white/50">{formatDateTime(b.start_at)}</div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </div>
            
            <div className="mt-8 pt-8 border-t border-white/10">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wide text-white/80">Attività preferite</h3>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {loading ? (
                  <Skeleton className="h-20 w-full rounded-2xl" />
                ) : favorites.length === 0 ? (
                  <div className="sm:col-span-2 lg:col-span-3">
                    <EmptyState
                      title="Nessun preferito"
                      description="Salva le tue attività preferite esplorando."
                    />
                  </div>
                ) : (
                  favorites.map((f) => (
                    <Link
                      key={f.businessId}
                      to={`/attivita/${encodeURIComponent(f.businessId)}`}
                      className="group flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] p-4 transition-all hover:border-[#4F7CFF]/30 hover:bg-[#4F7CFF]/5"
                    >
                      <div>
                        <div className="text-sm font-bold text-white group-hover:text-[#4F7CFF] transition-colors">{f.name}</div>
                        <div className="mt-1 text-xs font-medium text-white/50">
                          {f.category} {f.city ? ` · ${f.city}` : ''}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-white/20 transition-transform group-hover:translate-x-1 group-hover:text-[#4F7CFF]" />
                    </Link>
                  ))
                )}
              </div>
            </div>

          </Card>
        </div>

        <div className="lg:col-span-4">
          <div className="sticky top-[88px]">
            <Card padded={false} className="border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent p-6 shadow-2xl md:p-8">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                  <Star className="h-5 w-5 fill-amber-400" />
                </div>
                <h3 className="text-lg font-bold text-white">Trust System</h3>
              </div>
              <div className="mt-6 space-y-4 text-sm font-medium text-white/70 leading-relaxed">
                <p>Mantieni un punteggio alto (100/100) per sbloccare le stelle e ottenere vantaggi esclusivi.</p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-2">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                    <span>Prenota e completa gli appuntamenti.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                    <span>Cancella per tempo se non puoi andare.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-400" />
                    <span>Evita no-show e cancellazioni tardive: riducono rapidamente il punteggio.</span>
                  </li>
                </ul>
              </div>
              <div className="mt-8 rounded-xl border border-[#4F7CFF]/20 bg-[#4F7CFF]/5 p-4 text-[11px] font-medium leading-relaxed text-[#7D9BFF]">
                TrustBook è progettato per garantire il massimo rispetto del tempo di clienti e professionisti. I clienti affidabili non pagano caparra.
              </div>
            </Card>

            {isCustomer ? (
              <div className="mt-6">
                <CustomerSubscriptionPanel />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
