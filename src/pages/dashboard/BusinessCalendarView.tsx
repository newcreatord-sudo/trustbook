import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BookingRow, ProfileRow, ServiceRow } from '@/domain/supabase'
import { addDays, formatDateInput, getWeekRange, parseDateInput, startOfDay } from '@/utils/calendar'
import { computeEffectiveReliability } from '@/utils/reliability'
import { getRiskLevel } from '@/domain/antiNoShowEngine'
import { bookingStatusLabel, isClosedBookingStatus } from '@/utils/bookingUi'
import CalendarBookingCard from '@/pages/dashboard/CalendarBookingCard'

function formatDayLabel(d: Date): string {
  return new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: '2-digit', month: 'short' }).format(d)
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

function serviceName(services: ServiceRow[], id: string): string {
  return services.find((s) => s.id === id)?.name ?? 'Servizio'
}

export default function BusinessCalendarView(props: {
  bookings: BookingRow[]
  services: ServiceRow[]
  reliability: Record<string, { score: number; stars: number; noShowCount: number; lateCancelCount: number }>
  customerProfiles: Record<string, Pick<ProfileRow, 'first_name' | 'last_name' | 'phone'>>
  busy: boolean
  onChat: (bookingId: string) => void
  onApprove: (bookingId: string, customerEffectiveScore: number) => Promise<void>
  onConfirm: (payload: { kind: 'reject' | 'cancel' | 'no_show' | 'complete'; bookingId: string }) => void
}) {
  const [mode, setMode] = useState<'day' | 'week'>('day')
  const [anchor, setAnchor] = useState<Date>(() => startOfDay(new Date()))

  const range = useMemo(() => {
    if (mode === 'day') {
      const start = startOfDay(anchor)
      const end = new Date(start)
      end.setHours(23, 59, 59, 999)
      return { start, end }
    }
    return getWeekRange(anchor, true)
  }, [anchor, mode])

  const rangeBookings = useMemo(() => {
    const startMs = range.start.getTime()
    const endMs = range.end.getTime()
    return props.bookings
      .filter((b) => {
        const t = new Date(b.start_at).getTime()
        return t >= startMs && t <= endMs
      })
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
  }, [props.bookings, range.end, range.start])

  const weekDays = useMemo(() => {
    if (mode !== 'week') return []
    const start = startOfDay(range.start)
    return Array.from({ length: 7 }).map((_, i) => addDays(start, i))
  }, [mode, range.start])

  const byDay = useMemo(() => {
    if (mode !== 'week') return []
    return weekDays.map((d) => {
      const s = startOfDay(d)
      const e = new Date(s)
      e.setHours(23, 59, 59, 999)
      const items = rangeBookings.filter((b) => {
        const t = new Date(b.start_at).getTime()
        return t >= s.getTime() && t <= e.getTime()
      })
      return { day: d, items }
    })
  }, [mode, rangeBookings, weekDays])

  const requiresDepositCount = useMemo(() => {
    return rangeBookings.filter((b) => b.status === 'pending_deposit' || b.deposit_status === 'required').length
  }, [rangeBookings])

  const urgent = useMemo(() => {
    const nowMs = Date.now()
    const soonWindowMs = 45 * 60 * 1000
    const open = rangeBookings.filter((b) => !isClosedBookingStatus(b.status))
    const inProgress = open
      .filter((b) => {
        const start = new Date(b.start_at).getTime()
        const end = new Date(b.end_at).getTime()
        return start <= nowMs && nowMs < end
      })
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
    const soon = open
      .filter((b) => {
        const start = new Date(b.start_at).getTime()
        return start > nowMs && start - nowMs <= soonWindowMs
      })
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
    return { inProgress, soon }
  }, [rangeBookings])

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">Calendario prenotazioni</div>
          <div className="mt-1 text-xs text-white/70">Vista giorno/settimana, azioni rapide, meno rumore.</div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-2xl border border-white/10 bg-white/5 p-1">
            <button
              type="button"
              onClick={() => setMode('day')}
              className={cn(
                'inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition',
                mode === 'day' ? 'bg-[#4F7CFF]/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
              )}
            >
              <List className="h-4 w-4" />
              Giorno
            </button>
            <button
              type="button"
              onClick={() => setMode('week')}
              className={cn(
                'inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-semibold transition',
                mode === 'week' ? 'bg-[#4F7CFF]/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white',
              )}
            >
              <LayoutGrid className="h-4 w-4" />
              Settimana
            </button>
          </div>

          <div className="inline-flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAnchor((d) => addDays(d, mode === 'day' ? -1 : -7))}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 transition hover:bg-white/10"
              aria-label="Indietro"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={formatDateInput(anchor)}
              onChange={(e) => {
                const parsed = parseDateInput(e.target.value)
                if (parsed) setAnchor(startOfDay(parsed))
              }}
              className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none focus:border-[#4F7CFF]/60"
            />
            <button
              type="button"
              onClick={() => setAnchor((d) => addDays(d, mode === 'day' ? 1 : 7))}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/80 transition hover:bg-white/10"
              aria-label="Avanti"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setAnchor(startOfDay(new Date()))}
              className="h-10 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white/80 transition hover:bg-white/10"
            >
              Oggi
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
          Totale: <span className="text-white">{rangeBookings.length}</span>
        </div>
        <div className="rounded-xl border border-[#4F7CFF]/30 bg-[#4F7CFF]/10 px-3 py-2 text-xs text-white/80">
          Richiede caparra: <span className="text-white">{requiresDepositCount}</span>
        </div>
      </div>

      {mode === 'day' ? (
        <div className="mt-4 space-y-2">
          {rangeBookings.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center text-sm text-white/70">
              Nessuna prenotazione per questo giorno.
            </div>
          ) : (
            rangeBookings.map((b) => {
              const rel =
                props.reliability[b.customer_user_id] ??
                ({ score: 80, stars: 0, noShowCount: 0, lateCancelCount: 0 } as const)
              const eff = computeEffectiveReliability({
                baseScore: rel.score,
                stars: rel.stars,
                noShowCount: rel.noShowCount,
                lateCancelCount: rel.lateCancelCount,
              })
              const risk = getRiskLevel(eff.effectiveScore)
              const cp = props.customerProfiles[b.customer_user_id] ?? null
              const customerName = cp
                ? `${cp.first_name ?? ''} ${cp.last_name ?? ''}`.trim() || b.customer_user_id
                : b.customer_user_id
              const requiresDeposit = b.status === 'pending_deposit' || b.status === 'requires_deposit' || b.status === 'pending_payment_setup' || b.deposit_status === 'required'
              return (
                <CalendarBookingCard
                  key={b.id}
                  booking={b}
                  customerName={customerName}
                  customerPhone={cp?.phone ?? null}
                  serviceLabel={serviceName(props.services, b.service_id)}
                  riskLevel={risk}
                  effectiveScore={eff.effectiveScore}
                  requiresDeposit={requiresDeposit}
                  busy={props.busy}
                  onChat={() => props.onChat(b.id)}
                  onApprove={() => void props.onApprove(b.id, eff.effectiveScore)}
                  onReject={() => props.onConfirm({ kind: 'reject', bookingId: b.id })}
                  onCancel={() => props.onConfirm({ kind: 'cancel', bookingId: b.id })}
                  onNoShow={() => props.onConfirm({ kind: 'no_show', bookingId: b.id })}
                  onComplete={() => props.onConfirm({ kind: 'complete', bookingId: b.id })}
                />
              )
            })
          )}
        </div>
      ) : (
        <div className="mt-4">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-9">
            <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="text-xs font-semibold tracking-wide text-emerald-100/80">IN CORSO</div>
              <div className="mt-3 space-y-2">
                {urgent.inProgress.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">—</div>
                ) : (
                  urgent.inProgress.slice(0, 8).map((b) => {
                    const cp = props.customerProfiles[b.customer_user_id] ?? null
                    const customerName = cp
                      ? `${cp.first_name ?? ''} ${cp.last_name ?? ''}`.trim() || b.customer_user_id
                      : b.customer_user_id
                    const requiresDeposit = b.status === 'pending_deposit' || b.status === 'requires_deposit' || b.status === 'pending_payment_setup' || b.deposit_status === 'required'
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => props.onChat(b.id)}
                        className={cn(
                          'w-full rounded-2xl border px-3 py-2 text-left transition hover:bg-white/10',
                          requiresDeposit ? 'border-[#4F7CFF]/40 bg-[#4F7CFF]/10' : 'border-white/10 bg-white/5',
                        )}
                      >
                        <div className="text-xs font-semibold text-white">{formatTime(b.start_at)}</div>
                        <div className="mt-1 text-xs text-white/70">{customerName}</div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            <div className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-3">
              <div className="text-xs font-semibold tracking-wide text-amber-50/80">TRA POCO</div>
              <div className="mt-3 space-y-2">
                {urgent.soon.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">—</div>
                ) : (
                  urgent.soon.slice(0, 8).map((b) => {
                    const cp = props.customerProfiles[b.customer_user_id] ?? null
                    const customerName = cp
                      ? `${cp.first_name ?? ''} ${cp.last_name ?? ''}`.trim() || b.customer_user_id
                      : b.customer_user_id
                    const requiresDeposit = b.status === 'pending_deposit' || b.deposit_status === 'required'
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => props.onChat(b.id)}
                        className={cn(
                          'w-full rounded-2xl border px-3 py-2 text-left transition hover:bg-white/10',
                          requiresDeposit ? 'border-[#4F7CFF]/40 bg-[#4F7CFF]/10' : 'border-white/10 bg-white/5',
                        )}
                      >
                        <div className="text-xs font-semibold text-white">{formatTime(b.start_at)}</div>
                        <div className="mt-1 text-xs text-white/70">{customerName}</div>
                      </button>
                    )
                  })
                )}
              </div>
            </div>

            {byDay.map(({ day, items }) => {
              const openItems = items.filter((b) => !isClosedBookingStatus(b.status))
              const requiresDeposit = openItems.filter((b) => b.status === 'pending_deposit' || b.status === 'requires_deposit' || b.status === 'pending_payment_setup' || b.deposit_status === 'required')
              return (
                <div key={day.toISOString()} className="rounded-3xl border border-white/10 bg-white/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold tracking-wide text-white/60">{formatDayLabel(day)}</div>
                    <div className="text-[11px] text-white/60">
                      {openItems.length}
                      {requiresDeposit.length ? ` · caparra ${requiresDeposit.length}` : ''}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {openItems.length === 0 ? (
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">—</div>
                    ) : (
                      openItems.slice(0, 10).map((b) => {
                        const cp = props.customerProfiles[b.customer_user_id] ?? null
                        const customerName = cp
                          ? `${cp.first_name ?? ''} ${cp.last_name ?? ''}`.trim() || b.customer_user_id
                          : b.customer_user_id
                        const needsDeposit = b.status === 'pending_deposit' || b.deposit_status === 'required'
                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => props.onChat(b.id)}
                            className={cn(
                              'w-full rounded-2xl border px-3 py-2 text-left transition hover:bg-white/10',
                              needsDeposit ? 'border-[#4F7CFF]/40 bg-[#4F7CFF]/10' : 'border-white/10 bg-white/5',
                            )}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs font-semibold text-white">{formatTime(b.start_at)}</div>
                              <div className="text-[11px] text-white/60">{bookingStatusLabel(b.status)}</div>
                            </div>
                            <div className="mt-1 text-xs text-white/70">{customerName}</div>
                            <div className="mt-1 text-[11px] text-white/60">{serviceName(props.services, b.service_id)}</div>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
