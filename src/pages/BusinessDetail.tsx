import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, Star } from 'lucide-react'
import AppShell from '@/components/AppShell'
import { useAuth } from '@/providers/authContext'
import BusinessInfo from '@/pages/business/BusinessInfo'
import BookingPanel from '@/pages/business/BookingPanel'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/errors'
import Button from '@/shared/ui/Button'
import Card from '@/shared/ui/Card'
import Alert from '@/shared/ui/Alert'
import EmptyState from '@/shared/ui/EmptyState'
import { useToast } from '@/shared/ui/toastContext'
import ReviewReportModal from '@/components/ReviewReportModal'
import {
  parseBusinessRow,
  parseBusinessClosureRow,
  parseBusinessOpeningWindowRow,
  parseBookingRow,
  parseReviewPublicRow,
  parseServiceRow,
} from '@/domain/parse'
import { REVIEW_WINDOW_MS } from '@/lib/reviewEligibility'
import type {
  BookableStaffOptionRow,
  BusinessRow,
  BusinessClosureRow,
  BusinessOpeningWindowRow,
  ReviewPublicRow,
  ServiceRow,
} from '@/domain/supabase'
import { computeEffectiveReliability } from '@/utils/reliability'
import { calendarPartsInTimeZone, formatDatePartsKey } from '@/utils/timezone'
import {
  fetchCustomerSubscription,
  fetchSubscriptionPlans,
  isDepositBypassedForCustomer,
  parseCustomerFeatures,
} from '@/lib/subscriptions'
import { fetchBusinessBookingEcosystem } from '@/lib/businessEcosystem'
import type { BookingTableSelectionPolicy } from '@/pages/business/BookingPanel'
import { parseBusinessPublicReputationRpcRow, type BusinessPublicReputation } from '@/lib/businessReputation'
import { applyBusinessPublicSeo, clearBusinessPublicSeo } from '@/lib/seoBusinessPublicPage'

function parseBookableStaffRpcRow(raw: unknown): BookableStaffOptionRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : null
  const display_name = typeof r.display_name === 'string' ? r.display_name : null
  const color = typeof r.color === 'string' ? r.color : '#3b82f6'
  if (!id || !display_name) return null
  return { id, display_name, color }
}

function parseBookableSlotRpcRow(raw: unknown): { startAt: string; endAt: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const sa = typeof r.start_at === 'string' ? r.start_at : null
  const ea = typeof r.end_at === 'string' ? r.end_at : null
  if (!sa || !ea) return null
  return { startAt: sa, endAt: ea }
}

/** Messaggi UX da codici/eccezioni RPC create_booking_v3 (+ variant con risorsa). */
function mapCreateBookingRpcHaystack(haystack: string, bumpSlotRefresh: () => void): string | null {
  const h = haystack.toLowerCase()
  if (h.includes('blocked_by_business')) return 'Prenotazione bloccata dall’attività per questo account.'
  if (h.includes('reliability_too_low'))
    return 'Affidabilità troppo bassa per prenotare. Contatta l’attività o prova più tardi.'
  if (h.includes('too_many_no_shows'))
    return 'Prenotazione bloccata per troppi no-show nello storico. Contatta l’attività.'
  if (h.includes('business_paused')) return 'Attività in pausa.'
  if (h.includes('business_closed')) {
    bumpSlotRefresh()
    return 'Attività chiusa in questa fascia oraria.'
  }
  if (h.includes('outside_opening_hours')) {
    bumpSlotRefresh()
    return 'Orario fuori dalle fasce di apertura dell’attività.'
  }
  if (h.includes('service_not_found') || h.includes('service_inactive'))
    return 'Servizio non più disponibile. Aggiorna la pagina.'
  if (h.includes('invalid_duration'))
    return 'Durata servizio non valida. Seleziona un altro servizio.'
  if (h.includes('invalid_booking_interval')) return 'Intervallo orario non valido.'
  if (h.includes('lead_time_not_respected'))
    return 'Orario troppo vicino: anticipo minimo non rispettato.'
  if (h.includes('staff_unavailable')) {
    bumpSlotRefresh()
    return 'Operatore non disponibile in questa fascia. Scegli un altro orario.'
  }
  if (h.includes('slot_unavailable')) {
    bumpSlotRefresh()
    return 'Questo orario è stato appena occupato. Scegli un altro orario.'
  }
  if (h.includes('booking_time_conflict')) {
    bumpSlotRefresh()
    return 'Conflitto orario rilevato in tempo reale. Aggiorna e scegli un altro slot.'
  }
  if (h.includes('auto_resource_assignment_failed')) {
    bumpSlotRefresh()
    return 'Nessuna postazione libera per questo slot con i coperti indicati. Scegli un altro orario o riduci i coperti.'
  }
  if (h.includes('resource_not_available')) {
    bumpSlotRefresh()
    return 'Questa postazione non è più disponibile. Aggiorna e scegli un altro tavolo o orario.'
  }
  if (
    h.includes('customer_table_selection_not_available') ||
    h.includes('auto_assignment_not_allowed_for_customer')
  ) {
    return 'La configurazione dell’attività non consente questa assegnazione. Aggiorna la pagina.'
  }
  if (h.includes('invalid_resource_assignment_params'))
    return 'Richiesta non valida. Aggiorna la pagina e riprova.'
  return null
}

export default function BusinessDetail() {
  const { session, profile } = useAuth()
  const { push } = useToast()
  const nav = useNavigate()
  const { id, slug } = useParams() as { id?: string; slug?: string }
  const [businessId, setBusinessId] = useState<string | null>(id ?? null)

  const [business, setBusiness] = useState<BusinessRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [services, setServices] = useState<ServiceRow[]>([])
  const [reviews, setReviews] = useState<ReviewPublicRow[]>([])
  const [openingWindows, setOpeningWindows] = useState<BusinessOpeningWindowRow[]>([])
  const [closures, setClosures] = useState<BusinessClosureRow[]>([])
  const [viewerCanReportCustomerReviews, setViewerCanReportCustomerReviews] = useState(false)
  const [reportReviewId, setReportReviewId] = useState<string | null>(null)
  const [reportBusy, setReportBusy] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [publicReputation, setPublicReputation] = useState<BusinessPublicReputation | null>(null)
  const [customerReliability, setCustomerReliability] = useState<
    | {
        score: number
        stars: number
        noShowCount: number
        lateCancelCount: number
      }
    | null
  >(null)
  const [favorite, setFavorite] = useState(false)
  const [slotRefreshEpoch, setSlotRefreshEpoch] = useState(0)
  const [bookableStaff, setBookableStaff] = useState<BookableStaffOptionRow[]>([])
  const [customerNoDepositBypass, setCustomerNoDepositBypass] = useState(false)
  const [bookingEcosystemLoaded, setBookingEcosystemLoaded] = useState(false)
  const [bookingTableSelection, setBookingTableSelection] = useState<BookingTableSelectionPolicy | null>(null)

  const bumpSlotRefresh = useCallback(() => setSlotRefreshEpoch((n) => n + 1), [])

  useEffect(() => {
    setBusinessId(id ?? null)
  }, [id])

  useEffect(() => {
    if (id) return
    if (!slug) return
    let mounted = true
    setLoading(true)
    setLoadError(null)
    ;(async () => {
      try {
        const { data, error } = await supabase.from('businesses').select('id').eq('slug', slug).maybeSingle()
        if (error) throw error
        const resolvedId = (data as { id?: string } | null)?.id ?? null
        if (!mounted) return
        if (!resolvedId) {
          setBusinessId(null)
          setBusiness(null)
          setLoading(false)
          setLoadError('Attività non trovata.')
          return
        }
        setBusinessId(resolvedId)
      } catch (e: unknown) {
        if (!mounted) return
        const code = String((e as { code?: unknown }).code ?? '')
        const msg = String((e as { message?: unknown }).message ?? '')
        setBusinessId(null)
        setBusiness(null)
        setLoading(false)
        if (code === '42703' || msg.toLowerCase().includes('slug')) {
          setLoadError('URL pubblico non disponibile. Aggiorna il database (migrazione slug).')
        } else {
          setLoadError(errorMessage(e, 'Attività non trovata.'))
        }
      }
    })()
    return () => {
      mounted = false
    }
  }, [id, slug])

  useEffect(() => {
    if (!businessId) return
    let mounted = true
    setLoading(true)
    setLoadError(null)
    const reviewsCutoffIso = new Date(Date.now() - REVIEW_WINDOW_MS).toISOString()
    Promise.all([
      supabase.from('businesses').select('*').eq('id', businessId).single(),
      supabase.from('services').select('*').eq('business_id', businessId).eq('is_active', true),
      supabase
        .from('business_opening_windows')
        .select('*')
        .eq('business_id', businessId)
        .order('weekday', { ascending: true })
        .order('start_time', { ascending: true }),
      supabase
        .from('business_closures')
        .select('*')
        .eq('business_id', businessId)
        .order('start_at', { ascending: true })
        .limit(200),
      supabase
        .from('reviews')
        .select('id,booking_id,business_id,direction,rating,comment,created_at')
        .eq('business_id', businessId)
        .eq('direction', 'customer_to_business')
        .gte('created_at', reviewsCutoffIso)
        .order('created_at', { ascending: false })
        .limit(80),
      supabase.rpc('get_business_public_reputation', { p_business_id: businessId, p_window_days: 90 }),
    ])
      .then(([bRes, sRes, owRes, cRes, rRes, repRes]) => {
        if (!mounted) return
        if (bRes.error) throw bRes.error
        if (sRes.error) throw sRes.error
        if (owRes.error) throw owRes.error
        if (cRes.error) throw cRes.error
        if (rRes.error) throw rRes.error
        setBusiness(parseBusinessRow(bRes.data))
        setServices((((sRes.data as unknown[]) ?? []) as unknown[]).map(parseServiceRow))
        setOpeningWindows(
          (((owRes.data as unknown[]) ?? []) as unknown[])
            .map((row) => {
              try {
                return parseBusinessOpeningWindowRow(row)
              } catch {
                return null
              }
            })
            .filter((x): x is BusinessOpeningWindowRow => x !== null),
        )
        setClosures(
          (((cRes.data as unknown[]) ?? []) as unknown[])
            .map((row) => {
              try {
                return parseBusinessClosureRow(row)
              } catch {
                return null
              }
            })
            .filter((x): x is BusinessClosureRow => x !== null),
        )
        setReviews(
          (((rRes.data as unknown[]) ?? []) as unknown[])
            .map((row) => {
              try {
                return parseReviewPublicRow(row)
              } catch {
                return null
              }
            })
            .filter((x): x is ReviewPublicRow => x !== null),
        )
        const repRows = ((repRes?.data as unknown[]) ?? []) as unknown[]
        setPublicReputation(repRows.length ? parseBusinessPublicReputationRpcRow(repRows[0]) : null)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (!mounted) return
        setBusiness(null)
        setLoading(false)
        setLoadError(errorMessage(e, 'Attività non trovata.'))
        setPublicReputation(null)
        setOpeningWindows([])
        setClosures([])
      })

    return () => {
      mounted = false
    }
  }, [businessId])

  useEffect(() => {
    if (loadError) {
      document.title = 'Attività non trovata | TrustBook'
      clearBusinessPublicSeo()
      return
    }
    if (loading) {
      clearBusinessPublicSeo()
      document.title = 'Caricamento… | TrustBook'
      return
    }
    if (!business) {
      clearBusinessPublicSeo()
      document.title = 'TrustBook — Prenotazioni'
      return
    }
    return applyBusinessPublicSeo(business)
  }, [business, loading, loadError])

  useEffect(() => {
    if (!business?.id || !session?.user?.id) {
      setViewerCanReportCustomerReviews(false)
      return
    }
    let mounted = true
    const uid = session.user.id
    const bid = business.id
    ;(async () => {
      try {
        const [ownRes, tmRes] = await Promise.all([
          supabase.from('businesses').select('id').eq('id', bid).eq('owner_user_id', uid).maybeSingle(),
          supabase.from('team_members').select('business_id').eq('business_id', bid).eq('user_id', uid).maybeSingle(),
        ])
        if (!mounted) return
        setViewerCanReportCustomerReviews(Boolean(ownRes.data ?? tmRes.data))
      } catch {
        if (!mounted) return
        setViewerCanReportCustomerReviews(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [business?.id, session?.user?.id])

  useEffect(() => {
    if (!id) return
    let mounted = true
    setBookingEcosystemLoaded(false)
    void fetchBusinessBookingEcosystem(id)
      .then((eco) => {
        if (!mounted || !eco) {
          if (mounted) {
            setBookingTableSelection(null)
            setBookingEcosystemLoaded(true)
          }
          return
        }
        const verticalOk =
          eco.booking_vertical === 'hospitality_table' ||
          eco.booking_vertical === 'seat_assignment' ||
          eco.booking_vertical === 'professional_slot'
        const rawKind = eco.settings?.resource_primary_kind
        const primaryKind =
          rawKind === 'table' || rawKind === 'station' || rawKind === 'seat'
            ? rawKind
            : eco.booking_vertical === 'professional_slot'
              ? 'station'
              : eco.booking_vertical === 'seat_assignment'
                ? 'seat'
                : 'table'
        const resourceLabel = primaryKind === 'station' ? 'postazione' : primaryKind === 'seat' ? 'posto' : 'tavolo'
        if (
          eco.resource_management_enabled &&
          verticalOk &&
          eco.customer_table_choice !== 'off'
        ) {
          setBookingTableSelection({
            customerChoice: eco.customer_table_choice as BookingTableSelectionPolicy['customerChoice'],
            defaultAssignmentMode: eco.default_table_assignment_mode,
            resourceLabel,
          })
        } else {
          setBookingTableSelection(null)
        }
        if (mounted) setBookingEcosystemLoaded(true)
      })
      .catch(() => {
        if (mounted) {
          setBookingTableSelection(null)
          setBookingEcosystemLoaded(true)
        }
      })
    return () => {
      mounted = false
    }
  }, [id])

  useEffect(() => {
    if (!business?.id) return
    let mounted = true
    ;(async () => {
      try {
        const { data, error } = await supabase.rpc('list_bookable_staff_for_booking', {
          p_business_id: business.id,
        })
        if (!mounted) return
        if (error) {
          setBookableStaff([])
          return
        }
        const rows = Array.isArray(data) ? data : []
        const parsed = rows.map(parseBookableStaffRpcRow).filter((x): x is BookableStaffOptionRow => x !== null)
        setBookableStaff(parsed)
      } catch {
        if (!mounted) return
        setBookableStaff([])
      }
    })()
    return () => {
      mounted = false
    }
  }, [business?.id])

  useEffect(() => {
    if (!session?.user) return
    if (profile?.role !== 'cliente') {
      setCustomerReliability(null)
      return
    }
    let mounted = true

    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('customer_reliability')
          .select('score,stars,no_show_count,late_cancel_count')
          .eq('user_id', session.user.id)
          .maybeSingle()
        if (!mounted) return
        if (error) throw error
        const row = (data as {
          score: number
          stars: number
          no_show_count: number
          late_cancel_count: number
        } | null) ?? null
        setCustomerReliability({
          score: row?.score ?? 80,
          stars: row?.stars ?? 0,
          noShowCount: row?.no_show_count ?? 0,
          lateCancelCount: row?.late_cancel_count ?? 0,
        })
      } catch {
        if (!mounted) return
        setCustomerReliability({ score: 80, stars: 0, noShowCount: 0, lateCancelCount: 0 })
      }
    })()

    return () => {
      mounted = false
    }
  }, [profile?.role, session?.user])

  useEffect(() => {
    if (!session?.user?.id || profile?.role !== 'cliente') {
      setCustomerNoDepositBypass(false)
      return
    }
    let mounted = true
    ;(async () => {
      try {
        const [sub, plans] = await Promise.all([
          fetchCustomerSubscription(session.user.id),
          fetchSubscriptionPlans('customer'),
        ])
        if (!mounted) return
        const plan = plans.find((p) => p.id === sub?.plan_id)
        const bypass =
          Boolean(sub?.status === 'active' && plan && isDepositBypassedForCustomer(parseCustomerFeatures(plan.features)))
        setCustomerNoDepositBypass(bypass)
      } catch {
        if (!mounted) return
        setCustomerNoDepositBypass(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [profile?.role, session?.user?.id])

  const effective = computeEffectiveReliability({
    baseScore: profile?.role === 'cliente' ? customerReliability?.score ?? 80 : null,
    stars: customerReliability?.stars ?? 0,
    noShowCount: customerReliability?.noShowCount ?? 0,
    lateCancelCount: customerReliability?.lateCancelCount ?? 0,
  })

  useEffect(() => {
    if (!session?.user?.id || !business?.id) return
    let mounted = true

    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('favorite_businesses')
          .select('id')
          .eq('user_id', session.user.id)
          .eq('business_id', business.id)
          .maybeSingle()
        if (!mounted) return
        if (error) throw error
        setFavorite(Boolean(data))
      } catch {
        if (!mounted) return
        setFavorite(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [business?.id, session?.user?.id])

  const fetchAvailabilitySlots = useCallback(
    async (p: { serviceId: string; day: Date; staffId?: string | null }) => {
      if (!business?.id) return []
      const timeZone = business.timezone ?? 'Europe/Rome'
      const dayParts = calendarPartsInTimeZone(p.day, timeZone)
      const p_on = formatDatePartsKey(dayParts)
      const { data, error } = await supabase.rpc('list_bookable_slots_for_booking', {
        p_business_id: business.id,
        p_service_id: p.serviceId,
        p_on,
        p_staff_id: p.staffId ?? null,
      })
      if (error) throw error
      const rows = Array.isArray(data) ? data : []
      return rows.map(parseBookableSlotRpcRow).filter((x): x is NonNullable<typeof x> => x !== null)
    },
    [business?.id, business?.timezone],
  )

  const businessReviews = reviews

  if (loading) {
    return (
      <AppShell>
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6">
          <div className="h-5 w-56 animate-pulse rounded-lg bg-white/10" />
          <div className="mt-3 h-4 w-72 animate-pulse rounded-lg bg-white/5" />
          <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="h-[520px] animate-pulse rounded-3xl border border-white/10 bg-white/5" />
            </div>
            <div className="lg:col-span-5">
              <div className="h-[520px] animate-pulse rounded-3xl border border-white/10 bg-white/5" />
            </div>
          </div>
        </div>
      </AppShell>
    )
  }

  if (!business) {
    return (
      <AppShell>
        <Card>
          <EmptyState
            title={loadError ?? 'Attività non trovata'}
            description="Torna all’esplora e riprova con un’altra attività."
            action={
              <Button type="button" variant="secondary" onClick={() => nav('/esplora')}>
                Torna a Esplora
              </Button>
            }
          />
        </Card>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          leftIcon={<ChevronLeft className="h-4 w-4" />}
          onClick={() => {
            if (profile?.role === 'attivita') nav('/dashboard-attivita')
            else nav('/esplora')
          }}
        >
          Indietro
        </Button>

        {session?.user?.id && business?.id && (
          <Button
            type="button"
            onClick={() => {
              const userId = session.user.id
              const next = !favorite
              setFavorite(next)
              ;(async () => {
                try {
                  if (next) {
                    const { error } = await supabase
                      .from('favorite_businesses')
                      .insert({ user_id: userId, business_id: business.id })
                    if (error) throw error
                  } else {
                    const { error } = await supabase
                      .from('favorite_businesses')
                      .delete()
                      .eq('user_id', userId)
                      .eq('business_id', business.id)
                    if (error) throw error
                  }

                  push({
                    tone: 'success',
                    title: next ? 'Aggiunto ai preferiti' : 'Rimosso dai preferiti',
                    description: business.name,
                  })
                } catch {
                  setFavorite(!next)
                  push({ tone: 'danger', title: 'Errore preferiti', description: 'Riprova tra poco.' })
                }
              })()
            }}
            variant={favorite ? 'primary' : 'secondary'}
            size="sm"
            leftIcon={<Star className={cn('h-4 w-4', favorite && 'fill-white text-white')} />}
          >
            Preferiti
          </Button>
        )}
      </div>

      {profile?.role === 'attivita' && (
        <Alert tone="info" className="mb-4">
          Stai visualizzando il profilo pubblico. Per gestire prenotazioni e impostazioni usa la dashboard attività.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <BusinessInfo
            business={business}
            reviews={businessReviews}
            services={services}
            openingWindows={openingWindows}
            closures={closures}
            reputation={publicReputation}
            reportCustomerReviewsEnabled={viewerCanReportCustomerReviews}
            onReportCustomerReview={(reviewId) => {
              setReportError(null)
              setReportReviewId(reviewId)
            }}
          />
        </div>

        <div className="lg:col-span-5">
          <BookingPanel
            business={business}
            services={services}
            bookableStaff={bookableStaff}
            customerScore={profile?.role === 'cliente' ? (customerReliability?.score ?? 80) : null}
            customerStars={profile?.role === 'cliente' ? (customerReliability?.stars ?? 0) : null}
            customerEffectiveScore={profile?.role === 'cliente' ? effective.effectiveScore : null}
            reliabilityPenalty={profile?.role === 'cliente' ? effective.penalty : null}
            noShowCount={profile?.role === 'cliente' ? (customerReliability?.noShowCount ?? 0) : null}
            lateCancelCount={profile?.role === 'cliente' ? (customerReliability?.lateCancelCount ?? 0) : null}
            isPaused={Boolean(business.is_paused)}
            canBook={profile?.role === 'cliente' && !business.is_paused}
            slotRefreshEpoch={slotRefreshEpoch}
            bookingDeniedReason={
              session?.user && profile?.role === 'attivita'
                ? 'Questo account è un profilo attività: le prenotazioni cliente si effettuano da Esplora con un account cliente.'
                : undefined
            }
            customerNoDepositBypass={customerNoDepositBypass}
            tableSelection={
              profile?.role === 'cliente' && bookingEcosystemLoaded ? bookingTableSelection : undefined
            }
            isAuthenticated={Boolean(session?.user)}
            fetchAvailabilitySlots={fetchAvailabilitySlots}
            onCreateBooking={async (p) => {
              if (!session?.user) return { ok: false as const, error: 'Non autenticato.' }
              if (profile?.role !== 'cliente') return { ok: false as const, error: 'Ruolo non valido.' }
              if (business.is_paused) return { ok: false as const, error: 'Attività in pausa.' }

              const commonArgs = {
                p_business_id: business.id,
                p_service_id: p.serviceId,
                p_start_at: p.startAt,
                p_end_at: p.endAt,
                p_staff_id: p.staffId ?? null,
              }

              const bookingRpc =
                p.resourceAssignment?.kind === 'explicit'
                  ? await supabase.rpc('create_booking_v3_with_resource_assignment', {
                      ...commonArgs,
                      p_primary_resource_id: p.resourceAssignment.resourceId,
                      p_auto_assign_resource: false,
                      p_party_size: p.resourceAssignment.partySize,
                    })
                  : p.resourceAssignment?.kind === 'auto'
                    ? await supabase.rpc('create_booking_v3_with_resource_assignment', {
                        ...commonArgs,
                        p_primary_resource_id: null,
                        p_auto_assign_resource: true,
                        p_party_size: p.resourceAssignment.partySize,
                      })
                    : await supabase.rpc('create_booking_v3', commonArgs)

              const { data, error } = bookingRpc
              if (error) {
                const msg = String(error.message || '')
                const details =
                  'details' in error && typeof (error as { details?: string }).details === 'string'
                    ? String((error as { details?: string }).details)
                    : ''
                const haystack = `${msg} ${details}`
                const mapped = mapCreateBookingRpcHaystack(haystack, bumpSlotRefresh)
                if (mapped) return { ok: false as const, error: mapped }
                return {
                  ok: false as const,
                  error:
                    msg ||
                    (navigator.onLine === false
                      ? 'Connessione assente. Controlla la rete e riprova.'
                      : 'Errore creazione prenotazione.'),
                }
              }

              const row = Array.isArray(data) ? data[0] : data
              const booking = parseBookingRow(row)
              bumpSlotRefresh()
              push({
                tone: 'success',
                title: 'Prenotazione creata',
                description:
                  booking.status === 'pending_deposit' || booking.status === 'requires_deposit' || booking.status === 'pending_payment_setup'
                    ? 'Completa il pagamento caparra per confermare.'
                    : booking.status === 'pending_approval'
                      ? 'In attesa di approvazione.'
                      : 'Confermata.',
              })
              return { ok: true as const, booking }
            }}
            onPayDeposit={async (bookingId) => {
              const accessToken = session?.access_token ?? null
              if (!accessToken) throw new Error('Sessione non valida')
              const res = await fetch('/api/stripe/deposit/checkout', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({ bookingId }),
              })
              const json = (await res.json()) as { success: boolean; url?: string; error?: string }
              if (!res.ok || !json.success || !json.url) throw new Error(json.error || 'Impossibile avviare pagamento')
              window.location.assign(json.url)
            }}
          />
        </div>
      </div>

      <ReviewReportModal
        open={reportReviewId !== null}
        busy={reportBusy}
        error={reportError}
        title="Segnala una recensione pubblica"
        description="Usa questo modulo se ritieni che il testo violi le regole della piattaforma (diffamazione, dati personali, linguaggio improprio). Non sostituisce azioni legali: conserva eventuali prove."
        onClose={() => {
          if (!reportBusy) setReportReviewId(null)
        }}
        onSubmit={async (reason) => {
          if (!reportReviewId) return
          setReportBusy(true)
          setReportError(null)
          try {
            const { error } = await supabase.rpc('submit_review_report', {
              p_review_id: reportReviewId,
              p_reason: reason,
            })
            if (error) throw error
            push({
              tone: 'success',
              title: 'Segnalazione registrata',
              description: 'Esamineremo il contenuto secondo le policy TrustBook.',
            })
            setReportReviewId(null)
          } catch (e: unknown) {
            setReportError(errorMessage(e, 'Impossibile inviare la segnalazione.'))
          } finally {
            setReportBusy(false)
          }
        }}
      />
    </AppShell>
  )
}
