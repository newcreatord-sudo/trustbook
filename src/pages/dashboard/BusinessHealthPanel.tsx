import { ArrowRight, Calendar, CheckCircle2, Circle, CreditCard, PauseCircle, Settings2, TrendingUp, Users, ShieldAlert, AlertTriangle, Zap, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BookingRow, BusinessOpeningWindowRow, BusinessRow, ProfileRow, ServiceRow } from '@/domain/supabase'
import type { DashboardBookingKpis } from '@/domain/dashboardKpis'
import { startOfDay } from '@/utils/calendar'
import Card from '@/shared/ui/Card'
import Button from '@/shared/ui/Button'
import { formatMoneyEUR } from '@/utils/time'
import { computeEffectiveReliability } from '@/utils/reliability'
import { getRiskLevel } from '@/domain/antiNoShowEngine'

type ChecklistItem = {
  key: string
  title: string
  subtitle: string
  done: boolean
  ctaLabel: string
  tab: 'impostazioni' | 'servizi' | 'orari' | 'calendario' | 'prenotazioni'
}

function countBookingsInRange(bookings: BookingRow[], start: Date, end: Date, filter?: (b: BookingRow) => boolean): number {
  const s = start.getTime()
  const e = end.getTime()
  let n = 0
  for (const b of bookings) {
    const t = new Date(b.start_at).getTime()
    if (t < s || t > e) continue
    if (filter && !filter(b)) continue
    n += 1
  }
  return n
}

function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

function isClosedStatus(status: string): boolean {
  return (
    status === 'completed' ||
    status === 'no_show' ||
    status === 'late_cancel' ||
    status === 'rejected' ||
    String(status).startsWith('cancelled')
  )
}

export default function BusinessHealthPanel(props: {
  business: BusinessRow
  services: ServiceRow[]
  openingWindows: BusinessOpeningWindowRow[]
  bookings: BookingRow[]
  reliability?: Record<string, { score: number; stars: number; noShowCount: number; lateCancelCount: number }>
  customerProfiles?: Record<string, Pick<ProfileRow, 'first_name' | 'last_name' | 'phone'>>
  metricsLoading?: boolean
  isOwner: boolean
  /** Aggregati SQL completi (superano il campione client delle liste). */
  serverBookingKpis?: DashboardBookingKpis | null
  onGoToTab: (tab: ChecklistItem['tab'] | 'staff' | 'abbonamento') => void
}) {
  const b = props.business
  const hasContact = Boolean((b.phone ?? '').trim() || (b.email ?? '').trim())
  const hasLocation = Boolean((b.city ?? '').trim() && (b.address_text ?? '').trim() && Number.isFinite(b.lat) && Number.isFinite(b.lng))
  const hasDescription = Boolean((b.description ?? '').trim())
  const hasMedia = Boolean((b.logo_url ?? '').trim() || (b.gallery_urls ?? []).length > 0)
  const hasServices = props.services.length > 0
  const hasHours = props.openingWindows.length > 0

  const checklist: ChecklistItem[] = [
    {
      key: 'profile',
      title: 'Profilo pubblico',
      subtitle: 'Contatti + posizione + descrizione minima.',
      done: hasContact && hasLocation && hasDescription,
      ctaLabel: 'Completa profilo',
      tab: 'impostazioni',
    },
    {
      key: 'media',
      title: 'Media',
      subtitle: 'Logo o 2–3 foto aumentano fiducia e conversione.',
      done: hasMedia,
      ctaLabel: 'Aggiungi foto',
      tab: 'impostazioni',
    },
    {
      key: 'services',
      title: 'Servizi',
      subtitle: 'Nome chiaro + durata coerente. (Minimo 1)',
      done: hasServices,
      ctaLabel: 'Configura servizi',
      tab: 'servizi',
    },
    {
      key: 'hours',
      title: 'Orari e ferie',
      subtitle: 'Finestre settimanali e chiusure (ferie/pausa).',
      done: hasHours,
      ctaLabel: 'Imposta orari',
      tab: 'orari',
    },
  ]

  const doneCount = checklist.filter((x) => x.done).length
  const isReady = doneCount === checklist.length && !b.is_paused

  const todayStart = startOfDay(new Date())
  const todayEnd = new Date(todayStart)
  todayEnd.setHours(23, 59, 59, 999)

  const next7Start = todayStart
  const next7End = new Date(todayStart)
  next7End.setDate(next7End.getDate() + 7)
  next7End.setHours(23, 59, 59, 999)

  const srv = props.serverBookingKpis

  const todayBookings = props.bookings.filter((x) => {
    const t = new Date(x.start_at).getTime()
    return t >= todayStart.getTime() && t <= todayEnd.getTime() && !isClosedStatus(x.status)
  })
  const statTodayClient = todayBookings.length

  const statUpcoming7Client = countBookingsInRange(props.bookings, next7Start, next7End, (x) => !isClosedStatus(x.status))

  const statPendingClient = props.bookings.filter(
    (x) => x.status === 'pending_approval' || x.status === 'requested' || x.status === 'change_proposed',
  ).length

  const statToday = srv?.today_active_count ?? statTodayClient
  const statUpcoming7 = srv?.upcoming_7_active_count ?? statUpcoming7Client
  const statPending = srv?.pending_pipeline_count ?? statPendingClient

  let estimatedRevenueCents = 0
  let protectedRevenueCents = 0
  let riskyRevenueCents = 0
  let totalDurationMin = 0

  const riskyCustomerIds = new Set<string>()

  const upcomingActive = props.bookings.filter((x) => {
    const t = new Date(x.start_at).getTime()
    return t >= todayStart.getTime() && !isClosedStatus(x.status)
  })

  for (const bk of todayBookings) {
    const svc = props.services.find((s) => s.id === bk.service_id)
    if (svc && svc.price_cents) {
      estimatedRevenueCents += svc.price_cents
    }
    if (svc && svc.duration_min) {
      totalDurationMin += svc.duration_min
    }
  }

  for (const bk of upcomingActive) {
    if (bk.deposit_amount_cents > 0) {
      protectedRevenueCents += bk.deposit_amount_cents
    }

    if (props.reliability?.[bk.customer_user_id]) {
      const rel = props.reliability[bk.customer_user_id]
      const eff = computeEffectiveReliability({
        baseScore: rel.score,
        stars: rel.stars,
        noShowCount: rel.noShowCount,
        lateCancelCount: rel.lateCancelCount,
      })
      const risk = getRiskLevel(eff.effectiveScore)
      if (risk === 'red' || risk === 'yellow') {
        riskyCustomerIds.add(bk.customer_user_id)
        const svc = props.services.find((s) => s.id === bk.service_id)
        if (svc && svc.price_cents && bk.deposit_amount_cents < svc.price_cents) {
          riskyRevenueCents += svc.price_cents - bk.deposit_amount_cents
        }
      }
    }
  }

  const riskyCustomersCount = riskyCustomerIds.size

  /** Allineato a `business_opening_windows.weekday`: 0 = domenica … 6 = sabato */
  const todayDayOfWeek = todayStart.getDay()
  const todayWindows = props.openingWindows.filter((w) => w.weekday === todayDayOfWeek)
  let totalOpenMin = 0
  for (const w of todayWindows) {
    const startParts = w.start_time.split(':').map(Number)
    const endParts = w.end_time.split(':').map(Number)
    if (startParts.length >= 2 && endParts.length >= 2) {
      const startMin = startParts[0]! * 60 + startParts[1]!
      const endMin = endParts[0]! * 60 + endParts[1]!
      totalOpenMin += Math.max(0, endMin - startMin)
    }
  }

  const activeServicesForAvg = props.services.filter((s) => s.is_active && (s.duration_min ?? 0) > 0)
  const avgServiceDuration =
    activeServicesForAvg.length > 0
      ? activeServicesForAvg.reduce((acc, s) => acc + (s.duration_min ?? 0), 0) / activeServicesForAvg.length
      : null

  const emptyMin = Math.max(0, totalOpenMin - totalDurationMin)
  const emptySlotsEstimate =
    avgServiceDuration !== null && avgServiceDuration > 0 ? Math.floor(emptyMin / avgServiceDuration) : null

  const kpi30Start = new Date(todayStart)
  kpi30Start.setDate(kpi30Start.getDate() - 30)
  const last30 = props.bookings.filter((bk) => {
    const t = new Date(bk.start_at).getTime()
    return t >= kpi30Start.getTime() && t <= todayEnd.getTime()
  })
  const kpiCompletedClient = last30.filter((bk) => bk.status === 'completed').length
  const kpiNoShowClient = last30.filter((bk) => bk.status === 'no_show').length
  const kpiLateCancelClient = last30.filter((bk) => bk.status === 'late_cancel').length
  let avoidedLossesClient = 0
  let forfeitedDepositRowsClient = 0
  for (const row of last30) {
    if (row.status === 'no_show' && row.deposit_status === 'forfeited' && row.deposit_amount_cents > 0) {
      avoidedLossesClient += row.deposit_amount_cents
      forfeitedDepositRowsClient += 1
    }
  }

  const kpiCompleted = srv?.last30.completed ?? kpiCompletedClient
  const kpiNoShow = srv?.last30.no_show ?? kpiNoShowClient
  const kpiLateCancel = srv?.last30.late_cancel ?? kpiLateCancelClient
  const showDen = srv?.last30.show_denominator ?? kpiCompleted + kpiNoShow
  const showRatePct = showDen > 0 ? clampPercent((kpiCompleted / showDen) * 100) : null
  const noShowRatePct = showDen > 0 ? clampPercent((kpiNoShow / showDen) * 100) : null

  const avoidedLossesCents = srv?.last30.forfeited_deposit_cents ?? avoidedLossesClient
  const forfeitedDepositRows = srv?.last30.forfeited_deposit_cases ?? forfeitedDepositRowsClient

  const stripTitle = srv ? 'Ultimi 30 giorni (aggregazione PostgreSQL)' : 'Ultimi 30 giorni (campione caricato)'

  return (
    <div className="space-y-4">
      <Card padded={false} className="relative overflow-hidden border-white/10 bg-gradient-to-br from-[#4F7CFF]/5 to-transparent p-6">
        <div className="pointer-events-none absolute right-0 top-0 p-6 opacity-10">
          <TrendingUp className="h-32 w-32" />
        </div>

        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight text-white">Panoramica Pro</h2>
              {b.is_paused ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-50">
                  <PauseCircle className="h-3.5 w-3.5" /> In pausa
                </span>
              ) : isReady ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Attiva
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white/70">
                  <Circle className="h-3.5 w-3.5" /> Setup {doneCount}/{checklist.length}
                </span>
              )}
            </div>
            <p className="mt-1.5 max-w-xl text-sm text-white/60">
              Monitora gli incassi, proteggi il tuo tempo dai no-show e gestisci le operazioni quotidiane.
            </p>
          </div>

          <div className="flex gap-2">
            {props.isOwner ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => props.onGoToTab('impostazioni')}
                leftIcon={<Settings2 className="h-4 w-4" />}
              >
                Impostazioni
              </Button>
            ) : null}
          </div>
        </div>

        {props.metricsLoading ? (
          <div className="relative z-10 mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="h-3 w-20 rounded bg-white/10" />
                <div className="mt-4 h-8 w-16 rounded-lg bg-white/10" />
                <div className="mt-3 h-4 w-28 rounded bg-white/10" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="relative z-10 mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg">
                <div className="mb-2 flex items-center justify-between text-white/60">
                  <span className="text-xs font-bold tracking-wider">OGGI</span>
                  <Calendar className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-white">{statToday}</span>
                    <span className="mb-1 text-xs text-white/50">appuntamenti</span>
                  </div>
                  <div className="mt-2 text-sm font-medium text-emerald-400">
                    {formatMoneyEUR(estimatedRevenueCents)} <span className="font-normal text-white/40">da listino (oggi)</span>
                  </div>
                  {srv ? (
                    <div className="mt-1 text-[10px] leading-snug text-white/45">
                      Conteggio appuntamenti oggi da DB · fuso {srv.timezone || '—'}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-2xl border border-[#4F7CFF]/20 bg-[#4F7CFF]/10 p-4 shadow-lg">
                <div className="mb-2 flex items-center justify-between text-[#7D9BFF]">
                  <span className="text-xs font-bold tracking-wider">VALORE PROTETTO</span>
                  <ShieldAlert className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-white">{formatMoneyEUR(protectedRevenueCents)}</span>
                  </div>
                  <div className="mt-2 text-sm font-medium text-[#7D9BFF]">Somma caparre importo su appuntamenti futuri</div>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 shadow-lg">
                <div className="mb-2 flex items-center justify-between text-amber-400/80">
                  <span className="text-xs font-bold tracking-wider">RISCHIO CLIENTI</span>
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-amber-400">{riskyCustomersCount}</span>
                    <span className="mb-1 text-xs text-amber-400/60">clienti distinti</span>
                  </div>
                  <div className="mt-2 text-sm font-medium text-white/60">
                    <span className="text-amber-400">{formatMoneyEUR(riskyRevenueCents)}</span> prezzo listino non coperto da caparra
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-between rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg">
                <div className="mb-2 flex items-center justify-between text-white/60">
                  <span className="text-xs font-bold tracking-wider">CAPACITÀ (OGGI)</span>
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-white">{emptySlotsEstimate === null ? '—' : emptySlotsEstimate}</span>
                    <span className="mb-1 text-xs text-white/50">slot stimati</span>
                  </div>
                  <div className="mt-2 text-sm font-medium text-white/60">
                    {avgServiceDuration === null
                      ? 'Servizi attivi senza durata: impossibile stimare.'
                      : `Minuti liberi dopo oggi rispetto agli slot prenotati (${Math.round(emptyMin)} min).`}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative z-10 mt-6 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs text-white/70">
              <div className="font-semibold text-white/85">{stripTitle}</div>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2">
                <span>
                  Prossimi 7 giorni (non chiusi): <span className="text-white">{statUpcoming7}</span>
                </span>
                <span>
                  Show-up:{' '}
                  <span className="text-white">
                    {showRatePct === null ? '—' : `${showRatePct}%`}
                  </span>
                  {showDen > 0 ? (
                    <span className="text-white/45"> ({kpiCompleted}/{showDen} completati+no-show)</span>
                  ) : (
                    <span className="text-white/45"> (nessun completato/no-show nel periodo)</span>
                  )}
                </span>
                <span>
                  No-show:{' '}
                  <span className="text-white">{noShowRatePct === null ? '—' : `${noShowRatePct}%`}</span>
                </span>
                <span>
                  Cancellazioni tardive: <span className="text-white">{kpiLateCancel}</span>
                </span>
                <span>
                  Caparre trattenute (no-show + forfeited):{' '}
                  <span className="text-white">{formatMoneyEUR(avoidedLossesCents)}</span>
                  {forfeitedDepositRows > 0 ? (
                    <span className="text-white/45"> ({forfeitedDepositRows} casi)</span>
                  ) : null}
                </span>
              </div>
            </div>
          </>
        )}
      </Card>

      <Card padded={false} className="border-white/5 p-5">
        <div className="mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-[#4F7CFF]" />
          <h3 className="text-base font-bold text-white">Azioni Rapide</h3>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Button variant="secondary" size="sm" onClick={() => props.onGoToTab('prenotazioni')} className="w-full justify-start">
            <CheckCircle2 className="mr-2 h-4 w-4 shrink-0 text-emerald-400" /> Approva ({statPending})
          </Button>
          <Button variant="secondary" size="sm" onClick={() => props.onGoToTab('calendario')} className="w-full justify-start">
            <Calendar className="mr-2 h-4 w-4 shrink-0 text-[#4F7CFF]" /> Agenda
          </Button>
          <Button variant="secondary" size="sm" onClick={() => props.onGoToTab('prenotazioni')} className="w-full justify-start">
            <CreditCard className="mr-2 h-4 w-4 shrink-0 text-amber-400" /> Caparre
          </Button>
          {props.isOwner ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => props.onGoToTab('staff')} className="w-full justify-start">
                <Users className="mr-2 h-4 w-4 shrink-0 text-purple-400" /> Staff
              </Button>
              <Button variant="secondary" size="sm" onClick={() => props.onGoToTab('impostazioni')} className="w-full justify-start">
                <ShieldAlert className="mr-2 h-4 w-4 shrink-0 text-red-400" /> Regole
              </Button>
              <Button variant="secondary" size="sm" onClick={() => props.onGoToTab('orari')} className="w-full justify-start">
                <Clock className="mr-2 h-4 w-4 shrink-0 text-white/60" /> Orari
              </Button>
            </>
          ) : null}
        </div>
      </Card>

      {!props.metricsLoading && !isReady ? (
        <Card padded={false} className="border-amber-500/20 bg-amber-500/5 p-5">
          <div className="tb-kicker mb-3 text-amber-400/80">
            {props.isOwner ? 'COMPLETA IL SETUP PER INIZIARE' : 'SETUP ATTIVITÀ INCOMPLETO'}
          </div>
          {!props.isOwner ? (
            <p className="mb-3 text-xs leading-relaxed text-white/65">
              Alcuni elementi richiedono l&apos;owner (profilo, servizi, orari). Puoi comunque gestire prenotazioni consentite dal tuo ruolo.
            </p>
          ) : null}
          <div className="space-y-2">
            {checklist.map((it) => (
              <div
                key={it.key}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-xl border px-4 py-3',
                  it.done ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-amber-500/20 bg-amber-500/10',
                )}
              >
                <div className="flex items-start gap-3">
                  {it.done ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" />
                  ) : (
                    <Circle className="mt-0.5 h-5 w-5 text-amber-400/50" />
                  )}
                  <div>
                    <div className="text-sm font-semibold text-white">{it.title}</div>
                    <div className="mt-0.5 text-xs text-white/70">{it.subtitle}</div>
                  </div>
                </div>

                {!it.done && props.isOwner ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    className="shrink-0 border-none bg-amber-500 text-white shadow-amber-500/20 hover:bg-amber-600"
                    onClick={() => props.onGoToTab(it.tab)}
                    rightIcon={<ArrowRight className="h-4 w-4" />}
                  >
                    {it.ctaLabel}
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  )
}
