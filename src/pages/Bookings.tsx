import { useEffect, useMemo, useState } from 'react'
import { Ban, CalendarClock, CheckCircle2, CreditCard, Star } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import { cn } from '@/lib/utils'
import { useAuth } from '@/providers/authContext'
import { supabase } from '@/lib/supabase'
import type { BookingRow, DepositStatus } from '@/domain/supabase'
import { formatDateTime, formatMoneyEUR } from '@/utils/time'
import { errorMessage } from '@/lib/errors'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import { bookingStatusLabel, depositStatusLabel } from '@/utils/bookingUi'
import BookingChat from '@/components/BookingChat'
import { customerRiskPresentation, getRiskLevel } from '@/domain/antiNoShowEngine'
import { computeEffectiveReliability, tierFromStars } from '@/utils/reliability'
import Card from '@/shared/ui/Card'
import Alert from '@/shared/ui/Alert'
import EmptyState from '@/shared/ui/EmptyState'
import Button from '@/shared/ui/Button'
import Input from '@/shared/ui/Input'
import Select from '@/shared/ui/Select'
import {
  customerReviewBlockedMessage,
  customerReviewEligibility,
  REVIEW_COMMENT_MAX_LENGTH,
  REVIEW_WINDOW_DAYS,
} from '@/lib/reviewEligibility'
import { safeParseBookingRow } from '@/domain/parse'

export default function Bookings() {
  const { session } = useAuth()
  const userId = session?.user?.id
  const accessToken = session?.access_token ?? null
  const nav = useNavigate()
  const loc = useLocation()

  type BookingWithBusiness = BookingRow & {
    businesses: { name: string; cancellation_window_min: number | null; booking_lead_time_min: number | null } | null
  }

  const mergeBookingKeepBusiness = (prev: BookingWithBusiness, raw: unknown): BookingWithBusiness => {
    const row = safeParseBookingRow(raw)
    return row ? { ...row, businesses: prev.businesses } : prev
  }

  const [rows, setRows] = useState<BookingWithBusiness[]>([])
  const [loading, setLoading] = useState(false)
  const [score, setScore] = useState<number | null>(null)
  const [stars, setStars] = useState<number>(0)
  const [stats, setStats] = useState<{
    completedCount: number
    lateCancelCount: number
    noShowCount: number
  } | null>(null)
  const [events, setEvents] = useState<Array<{ kind: string; delta: number; createdAt: string }>>([])
  const [showReliabilityDetails, setShowReliabilityDetails] = useState(true)
  const [reviewed, setReviewed] = useState<Set<string>>(new Set())
  const [reviewDraft, setReviewDraft] = useState<Record<string, { rating: number; comment: string }>>({})
  const [openChat, setOpenChat] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [changeDraft, setChangeDraft] = useState<Record<string, { open: boolean; start: string; message: string }>>({})
  const [confirm, setConfirm] = useState<
    | {
        open: true
        booking: BookingWithBusiness
        title: string
        description: string
        confirmText: string
        tone: 'primary' | 'danger'
      }
    | { open: false }
  >({ open: false })

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId || !accessToken) return
    const params = new URLSearchParams(loc.search)
    const deposit = params.get('deposit')
    const sessionId = params.get('session_id')
    if (deposit !== 'success' || !sessionId) return

    setError(null)
    setBusyId('deposit-verify')
    ;(async () => {
      try {
        const res = await fetch('/api/stripe/deposit/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ sessionId }),
        })
        const json = (await res.json()) as { success: boolean; paid?: boolean; bookingId?: string; error?: string }
        if (!res.ok || !json.success) throw new Error(json.error || 'Verifica pagamento fallita')
        // Reliability delta is handled by DB trigger on status/deposit update!
      } catch (e: unknown) {
        setError(errorMessage(e, 'Errore verifica pagamento.'))
      } finally {
        setBusyId(null)
        nav('/prenotazioni', { replace: true })
      }
    })()
  }, [accessToken, loc.search, nav, userId])

  useEffect(() => {
    if (!userId) {
      setLoading(false)
      return
    }
    let mounted = true
    setLoading(true)
    Promise.all([
      supabase
        .from('bookings')
        .select(
          '*, businesses(name,cancellation_window_min,booking_lead_time_min)'
        )
        .eq('customer_user_id', userId)
        .order('start_at', { ascending: false })
        .limit(100),
      supabase
        .from('customer_reliability')
        .select('score,stars,completed_count,late_cancel_count,no_show_count')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('reliability_events')
        .select('kind,delta,created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(6),
      supabase.from('reviews').select('booking_id,direction').eq('author_user_id', userId),
    ])
      .then(([bRes, rRes, eRes, revRes]) => {
        if (!mounted) return
        if (bRes.error) throw bRes.error
        if (rRes.error) throw rRes.error
        if (eRes.error) throw eRes.error
        if (revRes.error) throw revRes.error
        setRows((bRes.data as BookingWithBusiness[]) ?? [])

        const r = (rRes.data as {
          score: number
          stars: number
          completed_count: number
          late_cancel_count: number
          no_show_count: number
        } | null) ?? null
        setScore((r?.score ?? 80) as number)
        setStars((r?.stars ?? 0) as number)
        setStats(
          r
            ? {
                completedCount: r.completed_count ?? 0,
                lateCancelCount: r.late_cancel_count ?? 0,
                noShowCount: r.no_show_count ?? 0,
              }
            : { completedCount: 0, lateCancelCount: 0, noShowCount: 0 },
        )

        setEvents(
          (((eRes.data as Array<{ kind: string; delta: number; created_at: string }>) ?? [])
            .filter((x) => x && typeof x.kind === 'string')
            .map((x) => ({ kind: x.kind, delta: x.delta ?? 0, createdAt: x.created_at })) as Array<{
            kind: string
            delta: number
            createdAt: string
          }>) ?? [],
        )

        const set = new Set<string>()
        for (const r of (revRes.data as Array<{ booking_id: string; direction: string }>) ?? []) {
          if (r.direction === 'customer_to_business') set.add(r.booking_id)
        }
        setReviewed(set)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (!mounted) return
        setError(errorMessage(e, 'Errore caricamento.'))
        setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`bookings_customer:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `customer_user_id=eq.${userId}`,
        },
        async (payload) => {
          const row = payload.new as BookingRow
          if (!row?.id) return

          if (payload.eventType === 'INSERT') {
            const { data, error } = await supabase
              .from('bookings')
              .select('*, businesses(name,cancellation_window_min,booking_lead_time_min)')
              .eq('id', row.id)
              .single()
            if (error) return
            setRows((prev) => {
              if (prev.some((x) => x.id === row.id)) return prev
              return [...prev, data as BookingWithBusiness]
            })
            return
          }

          setRows((prev) =>
            prev.map((b) => {
              if (b.id !== row.id) return b
              return { ...b, ...(row as BookingRow) }
            }),
          )
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId])

  const mine = useMemo(() => rows, [rows])
  const effective = useMemo(() => {
    return computeEffectiveReliability({
      baseScore: score ?? 80,
      stars,
      noShowCount: stats?.noShowCount ?? 0,
      lateCancelCount: stats?.lateCancelCount ?? 0,
    })
  }, [score, stars, stats?.lateCancelCount, stats?.noShowCount])

  const risk = useMemo(() => getRiskLevel(effective.effectiveScore), [effective.effectiveScore])
  const trustBadge = useMemo(() => customerRiskPresentation(risk), [risk])

  function toLocalInputValue(iso: string): string {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    const yyyy = d.getFullYear()
    const mm = pad(d.getMonth() + 1)
    const dd = pad(d.getDate())
    const hh = pad(d.getHours())
    const min = pad(d.getMinutes())
    return `${yyyy}-${mm}-${dd}T${hh}:${min}`
  }

  return (
    <AppShell>
      <Card padded={false} className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="tb-kicker">PRENOTAZIONI</div>
            <div className="mt-1 text-base font-semibold text-white">Le tue prenotazioni</div>
            <div className="mt-1 text-xs text-white/60">Chat, caparra e modifiche orario nello stesso posto.</div>
          </div>
          {score !== null && (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="text-sm text-white/80">
                  Affidabilità: <span className="font-semibold text-white">{score}/100</span>
                </div>
                <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white/80">
                  <Star className={cn('h-4 w-4', score === 100 ? 'fill-[#4F7CFF] text-[#4F7CFF]' : 'text-white/60')} />
                  {stars}
                </div>
                <div
                  className={cn(
                    'rounded-xl border px-2.5 py-1 text-xs font-semibold',
                    trustBadge.badgeTone === 'danger'
                      ? 'border-red-500/30 bg-red-500/10 text-red-100'
                      : trustBadge.badgeTone === 'warning'
                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-50'
                        : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-50',
                  )}
                >
                  Affidabilità: {trustBadge.labelIt}
                </div>
                <button type="button" onClick={() => setShowReliabilityDetails((v) => !v)} className="tb-link text-xs font-semibold">
                  {showReliabilityDetails ? 'Chiudi dettagli' : 'Dettagli'}
                </button>
              </div>
              <div className="mt-1 text-xs text-white/60">Livello {tierFromStars(stars)} · Eff: {effective.effectiveScore}/100</div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[#4F7CFF]"
                  style={{ width: `${Math.max(0, Math.min(100, effective.effectiveScore))}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-white/60">
                0–100. A 100/100 guadagni 1 stella. No-show e cancellazioni tardive lo abbassano.
              </div>
              {showReliabilityDetails && (
                <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <div className="grid grid-cols-3 gap-2 text-xs text-white/70">
                    <div>
                      <span className="text-white/60">Completate</span>{' '}
                      <span className="font-semibold text-white">{stats?.completedCount ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-white/60">Cancel tardive</span>{' '}
                      <span className="font-semibold text-white">{stats?.lateCancelCount ?? 0}</span>
                    </div>
                    <div>
                      <span className="text-white/60">No-show</span>{' '}
                      <span className="font-semibold text-white">{stats?.noShowCount ?? 0}</span>
                    </div>
                  </div>

                  <div className="mt-3 space-y-1">
                    {events.length === 0 ? (
                      <div className="text-xs text-white/60">Nessun evento recente.</div>
                    ) : (
                      events.map((e, idx) => (
                        <div key={`${e.createdAt}_${idx}`} className="flex items-center justify-between text-xs">
                          <div className="text-white/70">{e.kind}</div>
                          <div className={cn('font-semibold', e.delta < 0 ? 'text-red-100' : 'text-emerald-50')}>
                            {e.delta < 0 ? e.delta : `+${e.delta}`}
                            <span className="ml-2 font-normal text-white/50">{formatDateTime(e.createdAt)}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {error && <Alert className="mt-4" tone="danger">{error}</Alert>}

        <div className="mt-4 space-y-2">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="h-4 w-56 rounded-lg bg-white/10" />
                      <div className="mt-2 h-3 w-40 rounded-lg bg-white/5" />
                    </div>
                    <div className="h-3 w-28 rounded-lg bg-white/5" />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <div className="h-8 w-20 rounded-xl bg-white/5" />
                    <div className="h-8 w-28 rounded-xl bg-white/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : mine.length === 0 ? (
            <EmptyState
              title="Nessuna prenotazione"
              description="Quando prenoti un’attività, la trovi qui con chat e stati aggiornati."
              action={
                <Button type="button" variant="secondary" onClick={() => nav('/esplora')}>
                  Vai a Esplora
                </Button>
              }
            />
          ) : (
            mine.map((b) => {
              const title = b.businesses?.name ?? b.business_id
              const isPendingDeposit = b.status === 'pending_deposit' || b.status === 'requires_deposit' || b.status === 'pending_payment_setup'
              const isConfirmed = b.status === 'confirmed'
              const isCompleted = b.status === 'completed'
              const isNoShow = b.status === 'no_show'
              const isCancelled =
                b.status === 'cancelled_by_business' || b.status === 'cancelled_by_customer'
              const customerRev = customerReviewEligibility(b)

              return (
                <div key={b.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{title}</div>
                      <div className="mt-1 text-xs text-white/70">{formatDateTime(b.start_at)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-white/70">
                        Caparra: {formatMoneyEUR(b.deposit_amount_cents)}
                      </div>
                      <div className="mt-1 text-xs text-white/60">Stato: {bookingStatusLabel(b.status)}</div>
                    </div>
                  </div>

                  {b.status === 'change_proposed' && b.proposed_start_at && b.proposed_end_at && (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm font-semibold text-white">
                        {b.proposed_by_role === 'cliente' ? 'Richiesta inviata' : 'Proposta attività'}
                      </div>
                      <div className="mt-1 text-sm text-white/70">
                        {formatDateTime(b.proposed_start_at)} → {formatDateTime(b.proposed_end_at)}
                      </div>
                      {b.proposal_message && (
                        <div className="mt-2 text-sm text-white/70">{b.proposal_message}</div>
                      )}

                      {b.proposed_by_role === 'cliente' && (
                        <p className="mt-3 text-sm text-white/65 leading-relaxed">
                          Hai chiesto un nuovo orario: solo l&apos;attività può confermarlo o rifiutarlo dalla sua dashboard.
                          Non serve alcun pulsante qui; quando risponderanno vedrai lo stato aggiornato (notifica in app se attiva).
                        </p>
                      )}

                      {b.proposed_by_role !== 'cliente' && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setError(null)
                              ;(async () => {
                                try {
                                  const { data, error } = await supabase.rpc('accept_booking_time_proposal', {
                                    p_booking_id: b.id,
                                  })
                                  if (error) throw error
                                  setRows((prev) =>
                                    prev.map((x) => (x.id === b.id ? mergeBookingKeepBusiness(x, data) : x)),
                                  )
                                } catch (e: unknown) {
                                  setError(errorMessage(e, 'Errore accettazione proposta.'))
                                }
                              })()
                            }}
                          >
                            Accetta
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setError(null)
                              ;(async () => {
                                try {
                                  const { data, error } = await supabase.rpc('reject_booking_time_proposal', {
                                    p_booking_id: b.id,
                                  })
                                  if (error) throw error
                                  setRows((prev) =>
                                    prev.map((x) => (x.id === b.id ? mergeBookingKeepBusiness(x, data) : x)),
                                  )
                                } catch (e: unknown) {
                                  setError(errorMessage(e, 'Errore rifiuto proposta.'))
                                }
                              })()
                            }}
                          >
                            Rifiuta proposta
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setOpenChat((prev) => (prev === b.id ? null : b.id))}
                    >
                      {openChat === b.id ? 'Chiudi chat' : 'Chat'}
                    </Button>
                    {isPendingDeposit && (
                      <Button
                        type="button"
                        size="sm"
                        disabled={busyId === b.id || busyId === 'deposit-verify'}
                        onClick={() => {
                          setError(null)
                          setBusyId(b.id)
                          ;(async () => {
                            try {
                              if (!accessToken) throw new Error('Sessione non valida')
                              const res = await fetch('/api/stripe/deposit/checkout', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  Authorization: `Bearer ${accessToken}`,
                                },
                                body: JSON.stringify({ bookingId: b.id }),
                              })
                              const json = (await res.json()) as { success: boolean; url?: string; error?: string }
                              if (!res.ok || !json.success || !json.url) {
                                throw new Error(json.error || 'Impossibile avviare pagamento')
                              }
                              window.location.assign(json.url)
                            } catch (e: unknown) {
                              setError(errorMessage(e, 'Errore avvio pagamento caparra.'))
                              setBusyId(null)
                            }
                          })()
                        }}
                      >
                        <CreditCard className="h-4 w-4" />
                        {busyId === b.id ? 'Pagamento…' : 'Paga caparra'}
                      </Button>
                    )}

                    {(isConfirmed || isPendingDeposit) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busyId === b.id}
                        onClick={() => {
                          setError(null)
                          const now = new Date()
                          const start = new Date(b.start_at)
                          const windowMin = b.businesses?.cancellation_window_min ?? 120
                          const inTime = start.getTime() - now.getTime() >= windowMin * 60_000
                          const nextDepositStatus: DepositStatus =
                            b.deposit_status !== 'paid' ? b.deposit_status : inTime ? 'refunded' : 'forfeited'

                          const outcome = (() => {
                            if (b.deposit_amount_cents <= 0) return null
                            return nextDepositStatus === 'refunded'
                              ? 'Caparra rimborsata.'
                              : nextDepositStatus === 'forfeited'
                                ? 'Caparra trattenuta.'
                                : null
                          })()
                          const rel = inTime ? 'Affidabilità: +1' : 'Affidabilità: -10 (cancellazione tardiva)'
                          const desc = [
                            `Cancellazione consentita fino a ${windowMin} min prima.`,
                            outcome,
                            rel,
                          ]
                            .filter(Boolean)
                            .join(' ')

                          setConfirm({
                            open: true,
                            booking: b,
                            title: 'Confermi annullamento?',
                            description: desc,
                            confirmText: 'Annulla prenotazione',
                            tone: 'danger',
                          })
                        }}
                      >
                        <Ban className="h-4 w-4" />
                        Cancella
                      </Button>
                    )}

                    {(isConfirmed || isPendingDeposit) && b.status !== 'change_proposed' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busyId === b.id}
                        onClick={() => {
                          setError(null)
                          setChangeDraft((m) => ({
                            ...m,
                            [b.id]: {
                              open: !(m[b.id]?.open ?? false),
                              start: m[b.id]?.start ?? toLocalInputValue(b.start_at),
                              message: m[b.id]?.message ?? '',
                            },
                          }))
                        }}
                      >
                        Modifica orario
                      </Button>
                    )}

                    {isConfirmed && (
                      <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-50">
                        <CalendarClock className="h-4 w-4" />
                        Confermata
                      </div>
                    )}
                    {isCompleted && (
                      <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-50">
                        <CheckCircle2 className="h-4 w-4" />
                        Completata
                      </div>
                    )}
                    {isNoShow && (
                      <div className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-100">
                        <Ban className="h-4 w-4" />
                        No-show
                      </div>
                    )}
                    {isCancelled && (
                      <div
                        className={cn(
                          'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold',
                          b.deposit_status === 'forfeited'
                            ? 'border-red-500/30 bg-red-500/10 text-red-100'
                            : 'border-white/10 bg-white/5 text-white/70',
                        )}
                      >
                        Caparra: {depositStatusLabel(b.deposit_status)}
                      </div>
                    )}

                    {isCompleted && !reviewed.has(b.id) && customerRev.ok && (
                      <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="text-sm font-semibold text-white">Valuta l’attività</div>
                        <div className="mt-1 text-xs text-white/55">
                          Pubblica solo dopo visita completata dall’attività e allo scadere dell’appuntamento (finestra{' '}
                          {REVIEW_WINDOW_DAYS} giorni). Commento max {REVIEW_COMMENT_MAX_LENGTH} caratteri.
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                          <Select
                            value={reviewDraft[b.id]?.rating ?? 5}
                            onChange={(e) =>
                              setReviewDraft((m) => ({
                                ...m,
                                [b.id]: {
                                  rating: Number(e.target.value),
                                  comment: m[b.id]?.comment ?? '',
                                },
                              }))
                            }
                          >
                            {[5, 4, 3, 2, 1].map((r) => (
                              <option key={r} value={r}>
                                {r} stelle
                              </option>
                            ))}
                          </Select>
                          <Input
                            value={reviewDraft[b.id]?.comment ?? ''}
                            maxLength={REVIEW_COMMENT_MAX_LENGTH}
                            onChange={(e) =>
                              setReviewDraft((m) => ({
                                ...m,
                                [b.id]: {
                                  rating: m[b.id]?.rating ?? 5,
                                  comment: e.target.value.slice(0, REVIEW_COMMENT_MAX_LENGTH),
                                },
                              }))
                            }
                            placeholder="Commento (opz.)"
                            className="md:col-span-2"
                          />
                        </div>

                        <Button
                          type="button"
                          onClick={() => {
                            setError(null)
                            const rating = Math.max(1, Math.min(5, reviewDraft[b.id]?.rating ?? 5))
                            const raw = (reviewDraft[b.id]?.comment ?? '').trim()
                            const comment = raw.slice(0, REVIEW_COMMENT_MAX_LENGTH) || null
                            ;(async () => {
                              try {
                                const { error: insErr } = await supabase.from('reviews').insert({
                                  booking_id: b.id,
                                  business_id: b.business_id,
                                  author_user_id: userId,
                                  direction: 'customer_to_business',
                                  rating,
                                  comment,
                                })
                                if (insErr) throw insErr
                                setReviewed((prev) => new Set([...Array.from(prev), b.id]))
                              } catch (e: unknown) {
                                setError(errorMessage(e, 'Errore recensione.'))
                              }
                            })()
                          }}
                          className="mt-3 w-full"
                        >
                          Salva recensione
                        </Button>
                      </div>
                    )}
                    {isCompleted && !reviewed.has(b.id) && customerRev.ok === false && (
                      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/60">
                        {customerReviewBlockedMessage(customerRev.reason)}
                      </div>
                    )}
                  </div>

                  {openChat === b.id && (
                    <div className="mt-3">
                      <BookingChat bookingId={b.id} businessId={b.business_id} />
                    </div>
                  )}

                  {(changeDraft[b.id]?.open ?? false) && b.status !== 'change_proposed' && (isConfirmed || isPendingDeposit) && (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm font-semibold text-white">Richiesta modifica orario</div>
                      <div className="mt-1 text-xs text-white/70">
                        L’attività riceverà la tua proposta e potrà accettarla o rifiutarla.
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                        <Input
                          type="datetime-local"
                          value={changeDraft[b.id]?.start ?? ''}
                          onChange={(e) =>
                            setChangeDraft((m) => ({
                              ...m,
                              [b.id]: { open: true, start: e.target.value, message: m[b.id]?.message ?? '' },
                            }))
                          }
                        />
                        <Input
                          value={changeDraft[b.id]?.message ?? ''}
                          onChange={(e) =>
                            setChangeDraft((m) => ({
                              ...m,
                              [b.id]: { open: true, start: m[b.id]?.start ?? '', message: e.target.value },
                            }))
                          }
                          placeholder="Messaggio (opz.)"
                          className="md:col-span-2"
                        />
                      </div>

                      <Button
                        type="button"
                        disabled={busyId === b.id}
                        onClick={() => {
                          setError(null)
                          const startRaw = (changeDraft[b.id]?.start ?? '').trim()
                          if (!startRaw) return setError('Scegli un nuovo orario.')
                          const start = new Date(startRaw)
                          if (!Number.isFinite(start.getTime())) return setError('Orario non valido.')

                          const leadMin = b.businesses?.booking_lead_time_min ?? 0
                          const minStartMs = Date.now() + Math.max(0, leadMin) * 60_000
                          if (start.getTime() < minStartMs) {
                            return setError(`Orario troppo vicino. Anticipo minimo: ${Math.max(0, leadMin)} min.`)
                          }

                          const durMs = Math.max(0, new Date(b.end_at).getTime() - new Date(b.start_at).getTime())
                          const end = new Date(start.getTime() + durMs)
                          if (!(start.getTime() < end.getTime())) return setError('Durata non valida per la modifica.')

                          setBusyId(b.id)
                          ;(async () => {
                            try {
                              const { data, error } = await supabase.rpc('customer_propose_booking_reschedule', {
                                p_booking_id: b.id,
                                p_new_start_at: start.toISOString(),
                                p_new_end_at: end.toISOString(),
                                p_message: (changeDraft[b.id]?.message ?? '').trim() || null,
                              })
                              if (error) throw error
                              setRows((prev) =>
                                prev.map((x) => (x.id === b.id ? mergeBookingKeepBusiness(x, data) : x)),
                              )
                              setChangeDraft((m) => ({ ...m, [b.id]: { open: false, start: '', message: '' } }))
                            } catch (e: unknown) {
                              setError(errorMessage(e, 'Errore invio richiesta.'))
                            } finally {
                              setBusyId(null)
                            }
                          })()
                        }}
                        className={cn('mt-3 w-full', busyId === b.id && 'opacity-60')}
                      >
                        {busyId === b.id ? 'Invio…' : 'Invia richiesta'}
                      </Button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <ConfirmDialog
          open={confirm.open}
          title={confirm.open ? confirm.title : ''}
          description={confirm.open ? confirm.description : undefined}
          confirmText={confirm.open ? confirm.confirmText : undefined}
          tone={confirm.open ? confirm.tone : 'primary'}
          busy={confirm.open ? busyId === confirm.booking.id : false}
          onCancel={() => {
            if (confirm.open && busyId === confirm.booking.id) return
            setConfirm({ open: false })
          }}
          onConfirm={() => {
            if (!confirm.open) return
            const b = confirm.booking
            if (busyId) return
            setBusyId(b.id)
            ;(async () => {
              try {
                if (!accessToken) throw new Error('Sessione non valida')
                const res = await fetch('/api/stripe/deposit/cancel', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${accessToken}`,
                  },
                  body: JSON.stringify({ bookingId: b.id }),
                })
                const json = (await res.json()) as {
                  success: boolean
                  bookingId?: string
                  inTime?: boolean
                  depositStatus?: DepositStatus
                  cancelledAt?: string
                  error?: string
                }
                if (!res.ok || !json.success || !json.cancelledAt || !json.depositStatus) {
                  throw new Error(json.error || 'Errore cancellazione')
                }

                setRows((prev) =>
                  prev.map((x) =>
                    x.id === b.id
                      ? {
                          ...x,
                          status: 'cancelled_by_customer',
                          cancelled_at: json.cancelledAt as string,
                          deposit_status: json.depositStatus as DepositStatus,
                        }
                      : x,
                  ),
                )

                if (userId) {
                  // DB trigger handles reliability update
                  const { data: newRel } = await supabase
                    .from('customer_reliability')
                    .select('score')
                    .eq('user_id', userId)
                    .single()

                  if (newRel?.score !== undefined) setScore(newRel.score)
                }

                setConfirm({ open: false })
              } catch (e: unknown) {
                setError(errorMessage(e, 'Errore cancellazione.'))
              } finally {
                setBusyId(null)
              }
            })()
          }}
        />
      </Card>
    </AppShell>
  )
}

