import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, ShieldAlert, XCircle } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import { useAuth } from '@/providers/authContext'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import ConfirmDialog from '@/shared/ui/ConfirmDialog'
import Card from '@/shared/ui/Card'
import Alert from '@/shared/ui/Alert'
import EmptyState from '@/shared/ui/EmptyState'
import Tabs from '@/shared/ui/Tabs'
import ListItem from '@/shared/ui/ListItem'
import Button from '@/shared/ui/Button'
import Input from '@/shared/ui/Input'
import Select from '@/shared/ui/Select'
import type {
  BookingRow,
  BusinessClosureRow,
  BusinessOpeningWindowRow,
  BusinessRow,
  DepositStatus,
  ProfileRow,
  ServiceRow,
} from '@/domain/supabase'
import { formatDateTime, formatMoneyEUR } from '@/utils/time'
import { errorMessage } from '@/lib/errors'
import { computeDepositCents, depositStatusForAmount, statusAfterBusinessAccept } from '@/lib/bookingRules'
import { bookingStatusLabel } from '@/utils/bookingUi'
import OwnerOnlyPanel from '@/components/OwnerOnlyPanel'
import { getRiskLevel } from '@/domain/antiNoShowEngine'
import { computeEffectiveReliability, tierFromStars } from '@/utils/reliability'
import BookingFiltersBar, { type BookingFilterKey, type BookingSortKey } from '@/pages/dashboard/BookingFiltersBar'
import BookingQuickRow from '@/pages/dashboard/BookingQuickRow'
import BookingInternalNote from '@/pages/dashboard/BookingInternalNote'
import CustomerTags from '@/pages/dashboard/CustomerTags'
import BookingTimeline from '@/pages/dashboard/BookingTimeline'

const BusinessAiSuggestionsPanel = lazy(() => import('@/pages/dashboard/BusinessAiSuggestionsPanel'))
const MultiBusinessOverviewPanel = lazy(() => import('@/pages/dashboard/MultiBusinessOverviewPanel'))
const BusinessNotificationsPanel = lazy(() => import('@/pages/dashboard/BusinessNotificationsPanel'))
const BusinessSettingsPanel = lazy(() => import('@/pages/dashboard/BusinessSettingsPanel'))
const ServicesManager = lazy(() => import('@/pages/dashboard/ServicesManager'))
const ScheduleManager = lazy(() => import('@/pages/dashboard/ScheduleManager'))
const StaffManager = lazy(() => import('@/pages/dashboard/StaffManager'))
const SmartAgenda = lazy(() => import('@/pages/dashboard/SmartAgenda'))
const BusinessDirectorPanel = lazy(() => import('@/pages/dashboard/BusinessDirectorPanel'))
const BusinessSubscriptionPanel = lazy(() => import('@/pages/dashboard/BusinessSubscriptionPanel'))
const BusinessHealthPanel = lazy(() => import('@/pages/dashboard/BusinessHealthPanel'))
const BusinessAlertsPanel = lazy(() => import('@/pages/dashboard/BusinessAlertsPanel'))
const BookingChat = lazy(() => import('@/components/BookingChat'))
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useDashboardMutationGate } from '@/hooks/useDashboardMutationGate'
import type { DashboardBookingKpis } from '@/domain/dashboardKpis'
import { parseDashboardBookingKpis } from '@/domain/dashboardKpis'
import {
  fetchBusinessSubscription,
  fetchSubscriptionPlans,
  parseBusinessFeatures,
  type BusinessFeatureGate,
} from '@/lib/subscriptions'
import { businessReviewBlockedMessage, businessReviewEligibility, REVIEW_COMMENT_MAX_LENGTH, REVIEW_WINDOW_DAYS } from '@/lib/reviewEligibility'
import { safeParseBookingRow } from '@/domain/parse'

/** PostgREST di solito pagina a 1000 righe; richieste parallele per coprire volumi più alti sul dashboard. */
const DASHBOARD_BOOKINGS_PAGE_SIZE = 1000
const DASHBOARD_BOOKINGS_PARALLEL_PAGES = 3

const DASHBOARD_TAB_KEYS = [
  'tutte',
  'panoramica',
  'prenotazioni',
  'calendario',
  'direzione',
  'notifiche',
  'impostazioni',
  'servizi',
  'orari',
  'staff',
  'abbonamento',
] as const

type DashboardTabKey = (typeof DASHBOARD_TAB_KEYS)[number]

function isDashboardTabKey(v: string | null): v is DashboardTabKey {
  return v !== null && (DASHBOARD_TAB_KEYS as readonly string[]).includes(v)
}

function DashboardTabSkeleton() {
  return (
    <Card padded={false} className="p-5">
      <div className="space-y-3">
        <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
        <div className="h-3 w-64 animate-pulse rounded bg-white/10" />
        <div className="mt-4 h-28 w-full animate-pulse rounded-2xl bg-white/5" />
        <div className="h-28 w-full animate-pulse rounded-2xl bg-white/5" />
      </div>
    </Card>
  )
}

export default function BusinessDashboard() {
  const { session, profile } = useAuth()
  const userId = session?.user?.id
  const [searchParams, setSearchParams] = useSearchParams()
  const accessToken = session?.access_token ?? null

  const [businesses, setBusinesses] = useState<BusinessRow[]>([])
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null)
  const [businessPlanGate, setBusinessPlanGate] = useState<BusinessFeatureGate>(() => parseBusinessFeatures({}))
  const [businessPlanLabel, setBusinessPlanLabel] = useState<string | null>(null)
  const [businessPlanReloadTick, setBusinessPlanReloadTick] = useState(0)
  const bumpBusinessPlanReload = useCallback(() => setBusinessPlanReloadTick((x) => x + 1), [])
  const [loadingBusinesses, setLoadingBusinesses] = useState(true)
  const [bookings, setBookings] = useState<BookingRow[]>([])
  /** Ultima pagina “piena”: potrebbero esistere prenotazioni più vecchie non caricate → KPI storici potenzialmente incompleti */
  const [bookingsTruncated, setBookingsTruncated] = useState(false)
  const [dashboardBookingKpis, setDashboardBookingKpis] = useState<DashboardBookingKpis | null>(null)
  const [loadingBookings, setLoadingBookings] = useState(false)
  const [reliability, setReliability] = useState<
    Record<string, { score: number; stars: number; noShowCount: number; lateCancelCount: number }>
  >({})
  const [customerProfiles, setCustomerProfiles] = useState<Record<string, Pick<ProfileRow, 'first_name' | 'last_name' | 'phone'>>>({})
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState<{ kind: 'success' | 'info'; message: string } | null>(null)

  const [bookingFilter, setBookingFilter] = useState<BookingFilterKey>('pending')
  const [bookingQuery, setBookingQuery] = useState('')
  const debouncedBookingQuery = useDebouncedValue(bookingQuery, 250)
  const [bookingSort, setBookingSort] = useState<BookingSortKey>('upcoming')
  const [bookingView, setBookingView] = useState<'today' | 'all'>('today')
  const [showAdvancedBookingTools, setShowAdvancedBookingTools] = useState(true)
  const [customerFilter, setCustomerFilter] = useState<'all' | 'risk_high' | 'tag_ritardo' | 'tag_no_show'>('all')
  const [highlightBookingId, setHighlightBookingId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<
    | {
        open: true
        title: string
        description?: string
        confirmText: string
        tone: 'primary' | 'danger'
        kind: 'reject' | 'cancel' | 'no_show' | 'complete' | 'block_customer' | 'unblock_customer'
        bookingId: string
        customerUserId?: string
      }
    | { open: false }
  >({ open: false })
  const { busy: actionBusy, isHeld, runExclusive: runBookingExclusive } = useDashboardMutationGate()
  /** Blocca azioni sulle prenotazioni mentre una conferma è aperta o una mutation è in corso */
  const interactionsLocked = actionBusy || confirm.open || isHeld()

  const pushFlash = (kind: 'success' | 'info', message: string) => {
    setFlash({ kind, message })
    window.setTimeout(() => setFlash(null), 2500)
  }

  const [services, setServices] = useState<ServiceRow[]>([])
  const [openingWindows, setOpeningWindows] = useState<BusinessOpeningWindowRow[]>([])
  const [closures, setClosures] = useState<BusinessClosureRow[]>([])
  const [tab, setTab] = useState<DashboardTabKey>('panoramica')
  const tabAutoInitRef = useRef(false)
  const urlTab = useMemo(() => {
    const raw = searchParams.get('tab')
    return isDashboardTabKey(raw) ? raw : null
  }, [searchParams])

  const goToTab = useCallback(
    (next: DashboardTabKey) => {
      setTab(next)
      const sp = new URLSearchParams(window.location.search)
      sp.set('tab', next)
      setSearchParams(sp, { replace: true })
    },
    [setSearchParams],
  )

  useEffect(() => {
    if (!urlTab) return
    if (urlTab === tab) return
    setTab(urlTab)
  }, [tab, urlTab])

  const [rejectReason, setRejectReason] = useState<Record<string, string>>({})
  const [proposalDraft, setProposalDraft] = useState<
    Record<string, { start: string; end: string; message: string }>
  >({})

  const [reviewDraft, setReviewDraft] = useState<Record<string, { rating: number; comment: string }>>({})
  const [reviewedBookings, setReviewedBookings] = useState<Set<string>>(new Set())
  const [openChat, setOpenChat] = useState<string | null>(null)
  const [openDetails, setOpenDetails] = useState<string | null>(null)
  const [customerTags, setCustomerTags] = useState<Record<string, string[]>>({})
  const [bookingHasNote, setBookingHasNote] = useState<Record<string, boolean>>({})
  const [blockedCustomers, setBlockedCustomers] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!userId) {
      setLoadingBusinesses(false)
      setLoadingBookings(false)
      setBusinesses([])
      setActiveBusinessId(null)
      setBookings([])
      setBookingsTruncated(false)
      setDashboardBookingKpis(null)
      return
    }
    let mounted = true

    setLoadingBusinesses(true)

    ;(async () => {
      try {
        const [ownedRes, memberRes] = await Promise.all([
          supabase
            .from('businesses')
            .select('*')
            .eq('owner_user_id', userId)
            .order('created_at', { ascending: false }),
          supabase.from('team_members').select('business_id').eq('user_id', userId),
        ])
        if (ownedRes.error) throw ownedRes.error
        if (memberRes.error) throw memberRes.error

        const owned = (ownedRes.data as BusinessRow[]) ?? []
        const memberBusinessIds = Array.from(
          new Set(
            ((memberRes.data as Array<{ business_id: string }>) ?? [])
              .map((x) => x.business_id)
              .filter(Boolean),
          ),
        )
        let memberBusinesses: BusinessRow[] = []
        if (memberBusinessIds.length) {
          const { data: mb, error: mbErr } = await supabase
            .from('businesses')
            .select('*')
            .in('id', memberBusinessIds)
          if (mbErr) throw mbErr
          memberBusinesses = (mb as BusinessRow[]) ?? []
        }

        const mergedMap = new Map<string, BusinessRow>()
        for (const b of [...owned, ...memberBusinesses]) mergedMap.set(b.id, b)
        const list = Array.from(mergedMap.values()).sort((a, b) => b.created_at.localeCompare(a.created_at))
        if (!mounted) return
        setBusinesses(list)
        if (!tabAutoInitRef.current) {
          tabAutoInitRef.current = true
          const hasTabParam = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).has('tab') : false
          if (list.length > 1 && !hasTabParam) goToTab('tutte')
        }
        const saved = typeof window !== 'undefined' ? window.localStorage.getItem('tb_active_business_id') : null
        setActiveBusinessId(saved && list.some((x) => x.id === saved) ? saved : (list[0]?.id ?? null))
      } catch (e: unknown) {
        if (!mounted) return
        setError(errorMessage(e, 'Errore caricamento attività.'))
      } finally {
        if (mounted) setLoadingBusinesses(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [userId, goToTab])

  useEffect(() => {
    if (!activeBusinessId || typeof window === 'undefined') return
    try {
      window.localStorage.setItem('tb_active_business_id', activeBusinessId)
    } catch {
      // Storage può essere disabilitato o in quota esaurita: preferenza solo in-session.
    }
  }, [activeBusinessId])

  useEffect(() => {
    if (!activeBusinessId) {
      setBusinessPlanGate(parseBusinessFeatures({}))
      setBusinessPlanLabel(null)
      return
    }
    let mounted = true
    ;(async () => {
      try {
        const sub = await fetchBusinessSubscription(activeBusinessId)
        const plans = await fetchSubscriptionPlans('business')
        const plan = plans.find((p) => p.id === sub?.plan_id)
        if (!mounted) return
        setBusinessPlanGate(parseBusinessFeatures(plan?.features ?? {}))
        setBusinessPlanLabel(plan?.name ?? (sub?.plan_id ? sub.plan_id : 'Starter'))
      } catch {
        if (!mounted) return
        setBusinessPlanGate(parseBusinessFeatures({}))
        setBusinessPlanLabel(null)
      }
    })()
    return () => {
      mounted = false
    }
  }, [activeBusinessId, businessPlanReloadTick])

  useEffect(() => {
    if (!activeBusinessId) {
      setBookings([])
      setBookingsTruncated(false)
      setDashboardBookingKpis(null)
      setServices([])
      setOpeningWindows([])
      setClosures([])
      setLoadingBookings(false)
      return
    }
    let mounted = true

    setLoadingBookings(true)
    setBookingsTruncated(false)
    setDashboardBookingKpis(null)
    setBookings([])
    setServices([])
    setOpeningWindows([])
    setClosures([])
    setReviewedBookings(new Set())
    setReliability({})
    setCustomerProfiles({})
    setCustomerTags({})
    setBookingHasNote({})
    setBlockedCustomers({})

    ;(async () => {
      try {
        const bookingPageRequests = Array.from({ length: DASHBOARD_BOOKINGS_PARALLEL_PAGES }, (_, page) => {
          const from = page * DASHBOARD_BOOKINGS_PAGE_SIZE
          const to = from + DASHBOARD_BOOKINGS_PAGE_SIZE - 1
          return supabase
            .from('bookings')
            .select('*')
            .eq('business_id', activeBusinessId)
            .order('start_at', { ascending: false })
            .range(from, to)
        })

        const browserTz =
          typeof Intl !== 'undefined'
            ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Europe/Rome'
            : 'Europe/Rome'

        const [bookingsPagesRes, servicesRes, windowsRes, closuresRes, reviewsRes, kpisRes] = await Promise.all([
          Promise.all(bookingPageRequests),
          supabase
            .from('services')
            .select('*')
            .eq('business_id', activeBusinessId)
            .order('created_at', { ascending: false }),
          supabase
            .from('business_opening_windows')
            .select('*')
            .eq('business_id', activeBusinessId)
            .order('weekday', { ascending: true })
            .order('start_time', { ascending: true }),
          supabase
            .from('business_closures')
            .select('*')
            .eq('business_id', activeBusinessId)
            .order('start_at', { ascending: false }),
          supabase
            .from('reviews')
            .select('booking_id,direction')
            .eq('business_id', activeBusinessId),
          supabase.rpc('business_dashboard_booking_kpis', {
            p_business_id: activeBusinessId,
            p_timezone: browserTz,
          }),
        ])
        if (!mounted) return
        for (const br of bookingsPagesRes) {
          if (br.error) throw br.error
        }
        if (servicesRes.error) throw servicesRes.error
        if (windowsRes.error) throw windowsRes.error
        if (closuresRes.error) throw closuresRes.error
        if (reviewsRes.error) throw reviewsRes.error

        let parsedKpis = !kpisRes.error && kpisRes.data ? parseDashboardBookingKpis(kpisRes.data) : null
        if (!parsedKpis && mounted && kpisRes.error) {
          const k2 = await supabase.rpc('business_dashboard_booking_kpis', {
            p_business_id: activeBusinessId,
            p_timezone: 'Europe/Rome',
          })
          if (!mounted) return
          parsedKpis = !k2.error && k2.data ? parseDashboardBookingKpis(k2.data) : null
        }
        if (mounted) setDashboardBookingKpis(parsedKpis)

        const mergedMap = new Map<string, BookingRow>()
        for (const br of bookingsPagesRes) {
          for (const row of (br.data as BookingRow[]) ?? []) {
            mergedMap.set(row.id, row)
          }
        }
        const list = Array.from(mergedMap.values()).sort(
          (a, b) => new Date(b.start_at).getTime() - new Date(a.start_at).getTime(),
        )
        const lastPageRows = bookingsPagesRes[DASHBOARD_BOOKINGS_PARALLEL_PAGES - 1]?.data ?? []
        setBookingsTruncated(Array.isArray(lastPageRows) && lastPageRows.length === DASHBOARD_BOOKINGS_PAGE_SIZE)
        setBookings(list)
        setServices((servicesRes.data as ServiceRow[]) ?? [])
        setOpeningWindows((windowsRes.data as BusinessOpeningWindowRow[]) ?? [])
        setClosures((closuresRes.data as BusinessClosureRow[]) ?? [])

        const reviewedSet = new Set<string>()
        for (const r of (reviewsRes.data as Array<{ booking_id: string; direction: string }>) ?? []) {
          if (r.direction === 'business_to_customer') reviewedSet.add(r.booking_id)
        }
        setReviewedBookings(reviewedSet)

        const customerIds = Array.from(new Set(list.map((b) => b.customer_user_id)))
        if (customerIds.length === 0) {
          setReliability({})
          setCustomerProfiles({})
          setCustomerTags({})
          setBookingHasNote({})
          return
        }
        const bookingIds = list.map((b) => b.id)
        const notesPromise = bookingIds.length
          ? supabase
            .from('booking_internal_notes')
            .select('booking_id,body')
            .in('booking_id', bookingIds)
          : Promise.resolve({ data: [], error: null } as const)
        const [relRes, profilesRes, tagsRes, notesRes] = await Promise.all([
          supabase
            .from('customer_reliability')
            .select('user_id,score,stars,no_show_count,late_cancel_count')
            .in('user_id', customerIds),
          supabase
            .from('profiles')
            .select('id,first_name,last_name,phone')
            .in('id', customerIds),
          supabase
            .from('business_customer_tags')
            .select('id,business_id,customer_user_id,tag')
            .eq('business_id', activeBusinessId)
            .in('customer_user_id', customerIds),
          notesPromise,
        ])
        if (!mounted) return
        if (relRes.error) throw relRes.error
        if (profilesRes.error) throw profilesRes.error
        if (tagsRes.error) throw tagsRes.error
        if (notesRes.error) throw notesRes.error

        const relMap: Record<string, { score: number; stars: number; noShowCount: number; lateCancelCount: number }> = {}
        for (const r of
          (relRes.data as Array<{
            user_id: string
            score: number
            stars: number
            no_show_count: number
            late_cancel_count: number
          }>) ?? []) {
          relMap[r.user_id] = {
            score: r.score ?? 80,
            stars: r.stars ?? 0,
            noShowCount: r.no_show_count ?? 0,
            lateCancelCount: r.late_cancel_count ?? 0,
          }
        }
        setReliability(relMap)

        const pMap: Record<string, Pick<ProfileRow, 'first_name' | 'last_name' | 'phone'>> = {}
        for (const p of (profilesRes.data as Array<Pick<ProfileRow, 'id' | 'first_name' | 'last_name' | 'phone'>>) ?? []) {
          pMap[p.id] = { first_name: p.first_name ?? null, last_name: p.last_name ?? null, phone: p.phone ?? null }
        }
        setCustomerProfiles(pMap)

        const tagMap: Record<string, string[]> = {}
        for (const t of (tagsRes.data as Array<{ customer_user_id: string; tag: string }>) ?? []) {
          if (!tagMap[t.customer_user_id]) tagMap[t.customer_user_id] = []
          if (!tagMap[t.customer_user_id].includes(t.tag)) tagMap[t.customer_user_id].push(t.tag)
        }
        setCustomerTags(tagMap)

        if (bookingIds.length) {
          const noteMap: Record<string, boolean> = {}
          for (const n of (notesRes.data as Array<{ booking_id: string; body: string }>) ?? []) {
            noteMap[n.booking_id] = Boolean((n.body ?? '').trim())
          }
          setBookingHasNote(noteMap)
        } else {
          setBookingHasNote({})
        }
      } catch (e: unknown) {
        if (!mounted) return
        setError(errorMessage(e, 'Errore caricamento prenotazioni.'))
      } finally {
        if (mounted) setLoadingBookings(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [activeBusinessId])

  useEffect(() => {
    if (!activeBusinessId) return
    const channel = supabase
      .channel(`bookings_business:${activeBusinessId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `business_id=eq.${activeBusinessId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Partial<BookingRow>
            if (!oldRow?.id) return
            setBookings((prev) => prev.filter((x) => x.id !== oldRow.id))
            return
          }
          const row = payload.new as BookingRow
          if (!row?.id) return
          if (payload.eventType === 'INSERT') {
            setBookings((prev) => {
              if (prev.some((x) => x.id === row.id)) return prev
              return [...prev, row].sort((a, b) => a.start_at.localeCompare(b.start_at))
            })
            return
          }
          setBookings((prev) => prev.map((b) => (b.id === row.id ? { ...b, ...(row as BookingRow) } : b)))
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [activeBusinessId])

  const activeBusiness = useMemo(() => {
    if (!activeBusinessId) return null
    return businesses.find((b) => b.id === activeBusinessId) ?? null
  }, [activeBusinessId, businesses])

  const isOwner = Boolean(activeBusiness && userId && activeBusiness.owner_user_id === userId)

  useEffect(() => {
    if (!activeBusinessId) {
      setBlockedCustomers({})
      return
    }
    let mounted = true
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('business_customer_blocks')
          .select('customer_user_id')
          .eq('business_id', activeBusinessId)
        if (!mounted) return
        if (error) throw error
        const map: Record<string, boolean> = {}
        for (const r of ((data as unknown[]) ?? []) as unknown[]) {
          if (typeof r !== 'object' || r === null) continue
          const rec = r as Record<string, unknown>
          const uid = typeof rec.customer_user_id === 'string' ? rec.customer_user_id : null
          if (uid) map[uid] = true
        }
        setBlockedCustomers(map)
      } catch {
        if (!mounted) return
        setBlockedCustomers({})
      }
    })()
    return () => {
      mounted = false
    }
  }, [activeBusinessId])

  const bookingSummary = useMemo(() => {
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)
    const isClosedStatus = (status: string) =>
      status === 'completed' ||
      status === 'no_show' ||
      status === 'late_cancel' ||
      status === 'rejected' ||
      String(status).startsWith('cancelled')
    const todayActiveSample = bookings.filter((b) => {
      const t = new Date(b.start_at).getTime()
      return (
        t >= startOfDay.getTime() &&
        t <= endOfDay.getTime() &&
        !isClosedStatus(b.status)
      )
    }).length
    const today =
      dashboardBookingKpis !== null ? dashboardBookingKpis.today_active_count : todayActiveSample
    const todayTooltip =
      dashboardBookingKpis !== null
        ? 'Appuntamenti di oggi ancora operativi (completati, no-show e cancellati esclusi). Totale completo dal database.'
        : 'Appuntamenti di oggi ancora operativi, calcolati sul campione caricato in pagina (max ~3000 righe): può essere sottostimato finché il KPI server non è disponibile.'
    const pendingClient = bookings.filter(
      (b) => b.status === 'requested' || b.status === 'pending_approval' || b.status === 'change_proposed',
    ).length
    const pending = dashboardBookingKpis?.pending_pipeline_count ?? pendingClient
    const deposit = bookings.filter(
      (b) => !isClosedStatus(b.status) && (b.status === 'pending_deposit' || b.deposit_status === 'required'),
    ).length
    return { today, pending, deposit, todayTooltip }
  }, [bookings, dashboardBookingKpis])

  const customerFilteredBookings = useMemo(() => {
    const byCustomer = (b: BookingRow) => {
      if (customerFilter === 'all') return true
      if (customerFilter === 'tag_ritardo') return (customerTags[b.customer_user_id] ?? []).includes('ritardo')
      if (customerFilter === 'tag_no_show') return (customerTags[b.customer_user_id] ?? []).includes('no_show')

      const rel = reliability[b.customer_user_id] ?? ({ score: 80, stars: 0, noShowCount: 0, lateCancelCount: 0 } as const)
      const eff = computeEffectiveReliability({
        baseScore: rel.score,
        stars: rel.stars,
        noShowCount: rel.noShowCount,
        lateCancelCount: rel.lateCancelCount,
      })
      return getRiskLevel(eff.effectiveScore) === 'red'
    }

    return bookings.filter(byCustomer)
  }, [bookings, customerFilter, customerTags, reliability])

  const bookingCounts = useMemo(() => {
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)

    const base: Record<BookingFilterKey, number> = {
      all: customerFilteredBookings.length,
      today: 0,
      pending: 0,
      deposit: 0,
      confirmed: 0,
      closed: 0,
    }

    for (const b of customerFilteredBookings) {
      const t = new Date(b.start_at).getTime()
      if (t >= startOfDay.getTime() && t <= endOfDay.getTime()) base.today += 1
      if (b.status === 'requested' || b.status === 'pending_approval' || b.status === 'change_proposed') base.pending += 1
      if (b.status === 'pending_deposit') base.deposit += 1
      if (b.status === 'confirmed') base.confirmed += 1
      if (b.status === 'completed' || b.status === 'no_show' || b.status === 'rejected' || String(b.status).startsWith('cancelled')) base.closed += 1
    }
    return base
  }, [customerFilteredBookings])

  const visibleBookings = useMemo(() => {
    const q = debouncedBookingQuery.trim().toLowerCase()
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)

    const byFilter = (b: BookingRow) => {
      if (bookingFilter === 'all') return true
      if (bookingFilter === 'today') {
        const t = new Date(b.start_at).getTime()
        return t >= startOfDay.getTime() && t <= endOfDay.getTime()
      }
      if (bookingFilter === 'pending') return b.status === 'requested' || b.status === 'pending_approval' || b.status === 'change_proposed'
      if (bookingFilter === 'deposit') return b.status === 'pending_deposit'
      if (bookingFilter === 'confirmed') return b.status === 'confirmed'
      return b.status === 'completed' || b.status === 'no_show' || b.status === 'rejected' || String(b.status).startsWith('cancelled')
    }

    const byQuery = (b: BookingRow) => {
      if (!q) return true
      const cp = customerProfiles[b.customer_user_id] ?? null
      const label = cp ? `${cp.first_name ?? ''} ${cp.last_name ?? ''}`.trim() : ''
      const hay = `${label} ${cp?.phone ?? ''} ${b.customer_user_id}`.toLowerCase()
      return hay.includes(q)
    }

    const base = customerFilteredBookings.filter((b) => byFilter(b) && byQuery(b))
    return base.sort((a, b) => {
      if (bookingSort === 'recent') return b.start_at.localeCompare(a.start_at)
      if (bookingSort === 'pending_first') {
        const ap = a.status === 'requested' || a.status === 'pending_approval' || a.status === 'change_proposed'
        const bp = b.status === 'requested' || b.status === 'pending_approval' || b.status === 'change_proposed'
        if (ap !== bp) return ap ? -1 : 1
      }
      return a.start_at.localeCompare(b.start_at)
    })
  }, [bookingFilter, bookingSort, customerFilteredBookings, customerProfiles, debouncedBookingQuery])

  const todayBuckets = useMemo(() => {
    const now = new Date()
    const startOfDay = new Date(now)
    startOfDay.setHours(0, 0, 0, 0)
    const endOfDay = new Date(now)
    endOfDay.setHours(23, 59, 59, 999)

    const nowMs = now.getTime()
    const soonWindowMs = 45 * 60 * 1000

    const pending = customerFilteredBookings
      .filter((b) => b.status === 'requested' || b.status === 'pending_approval' || b.status === 'change_proposed')
      .sort((a, b) => a.start_at.localeCompare(b.start_at))

    const todayActive = customerFilteredBookings
      .filter((b) => {
        const t = new Date(b.start_at).getTime()
        const isToday = t >= startOfDay.getTime() && t <= endOfDay.getTime()
        const isClosed =
          b.status === 'completed' ||
          b.status === 'no_show' ||
          b.status === 'rejected' ||
          String(b.status).startsWith('cancelled')
        return isToday && !isClosed
      })
      .sort((a, b) => a.start_at.localeCompare(b.start_at))

    const inProgress: BookingRow[] = []
    const soon: BookingRow[] = []
    const later: BookingRow[] = []
    for (const b of todayActive) {
      const startMs = new Date(b.start_at).getTime()
      const endMs = new Date(b.end_at).getTime()
      if (startMs <= nowMs && nowMs < endMs) {
        inProgress.push(b)
      } else if (startMs > nowMs && startMs - nowMs <= soonWindowMs) {
        soon.push(b)
      } else {
        later.push(b)
      }
    }

    const upcoming = customerFilteredBookings
      .filter((b) => {
        const t = new Date(b.start_at).getTime()
        if (t <= endOfDay.getTime()) return false
        const isClosed =
          b.status === 'completed' ||
          b.status === 'no_show' ||
          b.status === 'rejected' ||
          String(b.status).startsWith('cancelled')
        return !isClosed
      })
      .sort((a, b) => a.start_at.localeCompare(b.start_at))
      .slice(0, 12)

    const requiresDeposit = todayActive.filter((b) => b.status === 'pending_deposit' || b.deposit_status === 'required')

    return { pending, inProgress, soon, later, upcoming, requiresDeposit }
  }, [customerFilteredBookings])

  const customerFilterCounts = useMemo(() => {
    let riskHigh = 0
    let tagRitardo = 0
    let tagNoShow = 0

    for (const b of bookings) {
      const tags = customerTags[b.customer_user_id] ?? []
      if (tags.includes('ritardo')) tagRitardo += 1
      if (tags.includes('no_show')) tagNoShow += 1

      const rel = reliability[b.customer_user_id] ?? ({ score: 80, stars: 0, noShowCount: 0, lateCancelCount: 0 } as const)
      const eff = computeEffectiveReliability({
        baseScore: rel.score,
        stars: rel.stars,
        noShowCount: rel.noShowCount,
        lateCancelCount: rel.lateCancelCount,
      })
      if (getRiskLevel(eff.effectiveScore) === 'red') riskHigh += 1
    }

    return { riskHigh, tagRitardo, tagNoShow }
  }, [bookings, customerTags, reliability])

  const doReject = async (bookingId: string) => {
    const b = bookings.find((x) => x.id === bookingId)
    if (!b) return
    const now = new Date().toISOString()
    const reason = (rejectReason[b.id] ?? '').trim() || null
    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: 'rejected',
        rejected_by_user_id: userId ?? null,
        rejection_reason: reason,
        cancelled_at: now,
      })
      .eq('id', b.id)
      .select('*')
      .single()
    if (error) throw error
    setBookings((prev) => prev.map((x) => (x.id === b.id ? (data as BookingRow) : x)))
  }

  const doApprove = async (bookingId: string, customerEffectiveScore: number) => {
    const b = bookings.find((x) => x.id === bookingId)
    if (!b) return
    if (!activeBusiness) return
    const now = new Date().toISOString()
    const svc = services.find((s) => s.id === b.service_id) ?? null
    const deposit = computeDepositCents({ business: activeBusiness, customerScore: customerEffectiveScore, service: svc })
    const nextStatus = statusAfterBusinessAccept({ depositCents: deposit })
    const nextDepositStatus = depositStatusForAmount(deposit)
    const { data, error } = await supabase
      .from('bookings')
      .update({
        status: nextStatus,
        deposit_amount_cents: deposit,
        deposit_status: nextDepositStatus,
        approved_by_user_id: userId ?? null,
        confirmed_at: nextStatus === 'confirmed' ? now : null,
      })
      .eq('id', b.id)
      .select('*')
      .single()
    if (error) throw error
    setBookings((prev) => prev.map((x) => (x.id === b.id ? (data as BookingRow) : x)))
    pushFlash('success', nextStatus === 'pending_deposit' ? 'Approvata: in attesa caparra.' : 'Approvata.')
  }

  useEffect(() => {
    if (bookingView !== 'all') return
    if (!highlightBookingId) return
    const el = document.getElementById(`booking-${highlightBookingId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [bookingView, highlightBookingId])

  const openInAll = (bookingId: string, withChat: boolean) => {
    goToTab('prenotazioni')
    setBookingView('all')
    setBookingFilter('all')
    setHighlightBookingId(bookingId)
    if (withChat) setOpenChat(bookingId)
  }

  const requestConfirm = (kind: 'reject' | 'cancel' | 'no_show' | 'complete', bookingId: string) => {
    if (interactionsLocked) return
    if (kind === 'reject') {
      setConfirm({
        open: true,
        kind,
        bookingId,
        title: 'Rifiutare la richiesta?',
        description: 'Il cliente verrà avvisato. Puoi aggiungere un motivo (opzionale).',
        confirmText: 'Rifiuta',
        tone: 'danger',
      })
      return
    }
    if (kind === 'cancel') {
      setConfirm({
        open: true,
        kind,
        bookingId,
        title: 'Annullare la prenotazione?',
        description: 'Il cliente verrà avvisato. Se la caparra è pagata verrà rimborsata.',
        confirmText: 'Annulla prenotazione',
        tone: 'danger',
      })
      return
    }
    if (kind === 'no_show') {
      setConfirm({
        open: true,
        kind,
        bookingId,
        title: 'Confermi no-show?',
        description: 'Segna la prenotazione come no-show. Se la caparra è pagata verrà trattenuta.',
        confirmText: 'Segna no-show',
        tone: 'danger',
      })
      return
    }
    setConfirm({
      open: true,
      kind,
      bookingId,
      title: 'Confermi completata?',
      description: 'Segna la prenotazione come completata e aggiorna l’affidabilità del cliente.',
      confirmText: 'Segna completata',
      tone: 'primary',
    })
  }

  const requestBlockConfirm = (bookingId: string, customerUserId: string, next: 'block' | 'unblock') => {
    if (interactionsLocked) return
    setConfirm({
      open: true,
      kind: next === 'block' ? 'block_customer' : 'unblock_customer',
      bookingId,
      customerUserId,
      title: next === 'block' ? 'Bloccare il cliente?' : 'Sbloccare il cliente?',
      description:
        next === 'block'
          ? 'Blocca le nuove prenotazioni da questo cliente per ridurre no-show.'
          : 'Rimuovi il blocco e consenti nuove prenotazioni.',
      confirmText: next === 'block' ? 'Blocca cliente' : 'Sblocca cliente',
      tone: next === 'block' ? 'danger' : 'primary',
    })
  }

  const doBlockCustomer = async (businessId: string, customerUserId: string) => {
    const reason = 'Blocco attivato da dashboard (anti no-show)'
    const { error } = await supabase.from('business_customer_blocks').upsert({
      business_id: businessId,
      customer_user_id: customerUserId,
      reason,
      created_by_user_id: userId,
    })
    if (error) throw error
    setBlockedCustomers((m) => ({ ...m, [customerUserId]: true }))
  }

  const doUnblockCustomer = async (businessId: string, customerUserId: string) => {
    const { error } = await supabase
      .from('business_customer_blocks')
      .delete()
      .eq('business_id', businessId)
      .eq('customer_user_id', customerUserId)
    if (error) throw error
    setBlockedCustomers((m) => {
      const next = { ...m }
      delete next[customerUserId]
      return next
    })
  }

  const runApprove = async (bookingId: string, customerEffectiveScore: number) => {
    setError(null)
    if (interactionsLocked) return
    await runBookingExclusive(async () => {
      try {
        await doApprove(bookingId, customerEffectiveScore)
      } catch (e: unknown) {
        setError(errorMessage(e, 'Errore approvazione.'))
      }
    })
  }

  const doCancel = async (bookingId: string) => {
    const b = bookings.find((x) => x.id === bookingId)
    if (!b) return
    if (!accessToken) throw new Error('Sessione non valida')

    const res = await fetch('/api/stripe/deposit/cancel-by-business', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ bookingId: b.id }),
    })
    const json = (await res.json()) as {
      success: boolean
      cancelledAt?: string
      depositStatus?: DepositStatus
      error?: string
    }
    if (!res.ok || !json.success || !json.cancelledAt || !json.depositStatus) {
      throw new Error(json.error || 'Errore annullamento')
    }

    setBookings((prev) =>
      prev.map((x) =>
        x.id === b.id
          ? {
              ...x,
              status: 'cancelled_by_business',
              cancelled_at: json.cancelledAt as string,
              deposit_status: json.depositStatus as DepositStatus,
            }
          : x,
      ),
    )
  }

  const doNoShow = async (bookingId: string) => {
    const b = bookings.find((x) => x.id === bookingId)
    if (!b) return
    const now = new Date().toISOString()
    const nextDepositStatus: DepositStatus = b.deposit_status === 'paid' ? 'forfeited' : b.deposit_status
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'no_show', no_show_at: now, deposit_status: nextDepositStatus })
      .eq('id', b.id)
    if (error) throw error
    setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, status: 'no_show', no_show_at: now, deposit_status: nextDepositStatus } : x)))

    if (nextDepositStatus === 'forfeited' && accessToken) {
      void fetch('/api/stripe/deposit/forfeit-by-business', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ bookingId: b.id }),
      })
    }

    // Reliability is now fully handled by the DB trigger on update!
    const { data: newRel } = await supabase
      .from('customer_reliability')
      .select('score')
      .eq('user_id', b.customer_user_id)
      .single()

    if (newRel?.score !== undefined) {
      setReliability((m) => ({
        ...m,
        [b.customer_user_id]: {
          ...(m[b.customer_user_id] ?? { score: 80, stars: 0, noShowCount: 0, lateCancelCount: 0 }),
          score: newRel.score,
        },
      }))
    }
  }

  const doComplete = async (bookingId: string) => {
    const b = bookings.find((x) => x.id === bookingId)
    if (!b) return
    const now = new Date().toISOString()
    const { error } = await supabase.from('bookings').update({ status: 'completed', completed_at: now }).eq('id', b.id)
    if (error) throw error
    setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, status: 'completed', completed_at: now } : x)))

    // Reliability is now fully handled by the DB trigger on update!
    const { data: newRel } = await supabase
      .from('customer_reliability')
      .select('score')
      .eq('user_id', b.customer_user_id)
      .single()

    if (newRel?.score !== undefined) {
      setReliability((m) => ({
        ...m,
        [b.customer_user_id]: {
          ...(m[b.customer_user_id] ?? { score: 80, stars: 0, noShowCount: 0, lateCancelCount: 0 }),
          score: newRel.score,
        },
      }))
    }
  }

  return (
    <AppShell>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Card className="p-5" padded={false}>
            <div className="tb-kicker">DASHBOARD</div>
            <div className="mt-1 text-base font-semibold text-white">La tua attività</div>
            <div className="mt-1 text-xs text-white/60">Seleziona un profilo e gestisci prenotazioni con priorità chiare.</div>

            {businesses.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-2 text-[11px] text-white/55">
                <span>
                  Piano: <span className="font-semibold text-white/75">{businessPlanLabel ?? 'Starter'}</span>
                </span>
                <span className="text-white/35">·</span>
                <button
                  type="button"
                  className="font-semibold text-[#7D9BFF] underline-offset-2 hover:underline"
                  onClick={() => goToTab('abbonamento')}
                >
                  Limiti e upgrade
                </button>
              </div>
            ) : null}

            {error && <Alert className="mt-4" tone="danger">{error}</Alert>}

            {businesses.length > 0 ? (
              <div className="mt-4 space-y-2">
                <div className="tb-kicker">LE MIE ATTIVITÀ</div>
                <div className="space-y-2">
                  {businesses.map((b) => {
                    const active = b.id === activeBusinessId
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setActiveBusinessId(b.id)}
                        className="group w-full rounded-2xl text-left"
                      >
                        <ListItem
                          className={cn(
                            active
                              ? 'border-[#4F7CFF]/50 bg-[#4F7CFF]/10'
                              : 'border-white/10 bg-white/5 group-hover:bg-white/10',
                          )}
                          title={b.name}
                          subtitle={`${b.category} · ${b.city ?? '—'}`}
                        />
                      </button>
                    )
                  })}
                </div>

                <div className="mt-4 text-xs text-white/55">
                  Sezioni disponibili nel menu laterale.
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {loadingBusinesses && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
                    <div className="mt-3 h-10 w-full animate-pulse rounded-xl bg-white/10" />
                  </div>
                )}
                {profile?.role !== 'attivita' ? (
                  <EmptyState title="Accedi come Attività" description="Entra come Attività per configurare un profilo." />
                ) : (
                  <div>
                    <EmptyState
                      title="Nessuna attività configurata"
                      description="Completa il setup minimo in pochi step: profilo, regole, caparra, orari."
                      action={
                        <Link
                          to="/onboarding-attivita"
                          aria-disabled={loadingBusinesses}
                          className="tb-btn tb-btn-primary w-full"
                        >
                          Configura attività
                        </Link>
                      }
                    />
                    <div className="tb-note mt-3 text-xs text-white/60">
                      Dopo il setup potrai gestire prenotazioni, servizi, orari e staff.
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        <div className="lg:col-span-8">
          {loadingBusinesses ? (
            <Card padded={false} className="p-5">
              <div className="space-y-3">
                <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
                <div className="h-3 w-64 animate-pulse rounded bg-white/10" />
                <div className="mt-4 h-24 w-full animate-pulse rounded-2xl bg-white/5" />
                <div className="h-24 w-full animate-pulse rounded-2xl bg-white/5" />
              </div>
            </Card>
          ) : activeBusiness ? (
            <Suspense fallback={<DashboardTabSkeleton />}>
              {tab === 'tutte' ? (
              <MultiBusinessOverviewPanel
                businesses={businesses}
                onOpenBusiness={(id) => {
                  setActiveBusinessId(id)
                  goToTab('panoramica')
                }}
              />
            ) : tab === 'notifiche' ? (
              userId ? (
                <BusinessNotificationsPanel businessId={activeBusiness.id} userId={userId} />
              ) : (
                <OwnerOnlyPanel title="Notifiche" subtitle="Accedi per vedere le notifiche." />
              )
            ) : tab === 'impostazioni' ? (
              isOwner ? (
                <BusinessSettingsPanel
                  business={activeBusiness}
                  featureGate={businessPlanGate}
                  onUpdated={(next) => {
                    setBusinesses((prev) => prev.map((x) => (x.id === next.id ? next : x)))
                  }}
                />
              ) : (
                <OwnerOnlyPanel title="Impostazioni" subtitle="Solo l’owner può modificare il profilo attività." />
              )
            ) : tab === 'direzione' ? (
              <BusinessDirectorPanel businessId={activeBusiness.id} isOwner={isOwner} />
            ) : tab === 'servizi' ? (
              isOwner ? (
                <ServicesManager
                  businessId={activeBusiness.id}
                  services={services}
                  onChanged={setServices}
                  featureGate={businessPlanGate}
                  onNavigateSubscription={() => goToTab('abbonamento')}
                />
              ) : (
                <OwnerOnlyPanel title="Servizi" subtitle="Solo l’owner può gestire i servizi." />
              )
            ) : tab === 'orari' ? (
              isOwner ? (
                <ScheduleManager
                  businessId={activeBusiness.id}
                  windows={openingWindows}
                  closures={closures}
                  onWindowsChanged={setOpeningWindows}
                  onClosuresChanged={setClosures}
                />
              ) : (
                <OwnerOnlyPanel title="Orari e ferie" subtitle="Solo l’owner può modificare gli orari." />
              )
            ) : tab === 'staff' ? (
              <StaffManager
                businessId={activeBusiness.id}
                isOwner={isOwner}
                accessToken={accessToken}
                featureGate={businessPlanGate}
                onNavigateSubscription={() => goToTab('abbonamento')}
              />
            ) : tab === 'calendario' ? (
              <SmartAgenda
                businessId={activeBusiness.id}
                bookings={bookings}
                services={services}
                busy={interactionsLocked}
                onAction={async (action, bookingId) => {
                  setError(null)
                  if (action === 'check_in') {
                    await runBookingExclusive(async () => {
                      try {
                        const { data, error } = await supabase
                          .from('bookings')
                          .update({ checked_in_at: new Date().toISOString() })
                          .eq('id', bookingId)
                          .select()
                          .single()
                        if (error) throw error
                        setBookings(prev => prev.map(x => x.id === bookingId ? data as BookingRow : x))
                      } catch (e: unknown) {
                        setError(errorMessage(e, 'Errore check-in.'))
                      }
                    })
                  } else if (action === 'confirm') {
                    const rel = reliability[bookings.find(b => b.id === bookingId)?.customer_user_id ?? ''] || { score: 80, stars: 0, noShowCount: 0, lateCancelCount: 0 }
                    const eff = computeEffectiveReliability({ baseScore: rel.score, stars: rel.stars, noShowCount: rel.noShowCount, lateCancelCount: rel.lateCancelCount })
                    await runApprove(bookingId, eff.effectiveScore)
                  } else {
                    requestConfirm(action, bookingId)
                  }
                }}
                onMove={async (bookingId, newStart, newEnd, newStaffId) => {
                  await runBookingExclusive(async () => {
                    try {
                      const { data, error } = await supabase
                        .from('bookings')
                        .update({ start_at: newStart, end_at: newEnd, staff_id: newStaffId })
                        .eq('id', bookingId)
                        .select()
                        .single()
                      if (error) throw error
                      setBookings(prev => prev.map(x => x.id === bookingId ? data as BookingRow : x))
                    } catch (e: unknown) {
                      setError(errorMessage(e, 'Errore spostamento.'))
                    }
                  })
                }}
              />
            ) : tab === 'abbonamento' ? (
              isOwner ? (
                <BusinessSubscriptionPanel
                  business={activeBusiness}
                  isOwner={isOwner}
                  accessToken={accessToken}
                  onSubscriptionSynced={bumpBusinessPlanReload}
                />
              ) : (
                <OwnerOnlyPanel title="Abbonamento" subtitle="Solo l’owner può gestire i piani." />
              )
            ) : tab === 'panoramica' ? (
              <Card padded={false} className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="tb-kicker">PANORAMICA</div>
                    <div className="mt-1 text-base font-semibold text-white">Dashboard attività</div>
                    <div className="mt-1 text-xs text-white/60">Controlla lo stato di salute e gli avvisi importanti.</div>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  {bookingsTruncated && !loadingBookings ? (
                    <Alert tone="info">
                      {dashboardBookingKpis ? (
                        <>
                          Le liste (prenotazioni, clienti collegati) usano al massimo{' '}
                          {DASHBOARD_BOOKINGS_PAGE_SIZE * DASHBOARD_BOOKINGS_PARALLEL_PAGES} righe recenti. I numeri in evidenza nella
                          panoramica (oggi, in attesa, ultimi 30 giorni, prossimi 7 giorni) sono calcolati sul database ed sono{' '}
                          <span className="text-white">completi</span>.
                        </>
                      ) : (
                        <>
                          Panoramica e KPI storici si basano sulle ultime{' '}
                          {DASHBOARD_BOOKINGS_PAGE_SIZE * DASHBOARD_BOOKINGS_PARALLEL_PAGES} prenotazioni per data (ordinate dalla più
                          recente). Applica la migrazione KPI server o verifica la connessione: senza RPC gli aggregati possono essere
                          incompleti ad alto volume.
                        </>
                      )}
                    </Alert>
                  ) : null}

                  <BusinessHealthPanel
                    business={activeBusiness}
                    services={services}
                    openingWindows={openingWindows}
                    bookings={bookings}
                    reliability={reliability}
                    customerProfiles={customerProfiles}
                    metricsLoading={loadingBookings}
                    isOwner={isOwner}
                    serverBookingKpis={dashboardBookingKpis}
                    onGoToTab={(t) => goToTab(t as typeof tab)}
                  />

                  <BusinessAlertsPanel
                    business={activeBusiness}
                    services={services}
                    openingWindows={openingWindows}
                    bookings={bookings}
                    alertsLoading={loadingBookings}
                    isOwner={isOwner}
                    onGoToSettings={() => goToTab('impostazioni')}
                    onGoToServices={() => goToTab('servizi')}
                    onGoToHours={() => goToTab('orari')}
                    onGoToPending={() => {
                      goToTab('prenotazioni')
                      setBookingView('all')
                      setBookingFilter('pending')
                      setBookingQuery('')
                    }}
                    onGoToDeposits={() => {
                      goToTab('prenotazioni')
                      setBookingView('all')
                      setBookingFilter('deposit')
                      setBookingQuery('')
                    }}
                    {...(isOwner
                      ? {
                          onGoToPayments: () => {
                            window.location.assign('/pagamenti-attivita')
                          },
                        }
                      : {})}
                  />

                  <Suspense
                    fallback={
                      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-xs text-white/55">
                        Carico modulo suggerimenti…
                      </div>
                    }
                  >
                    <BusinessAiSuggestionsPanel
                      businessId={activeBusiness.id}
                      isOwner={isOwner}
                      businessCategory={activeBusiness.category}
                    />
                  </Suspense>
                </div>
              </Card>
            ) : (
              <Card padded={false} className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="tb-kicker">OPERATIVO</div>
                    <div className="mt-1 text-base font-semibold text-white">Prenotazioni</div>
                    <div className="mt-1 text-xs text-white/60">Conferme, esiti e no-show: tutto con stati tracciati.</div>
                    <div className="mt-1 text-[11px] leading-snug text-white/45">
                      «Oggi attivi» = slot ancora operativi (totale DB se la migrazione KPI è applicata). Tab{' '}
                      <span className="text-white/55">Oggi · calendario</span> = tutti gli appuntamenti di oggi nel campione caricato.
                    </div>
                  </div>
                  <div className="hidden items-center gap-2 text-xs text-white/70 md:flex">
                    <div
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 underline decoration-white/25 decoration-dotted underline-offset-2"
                      title={bookingSummary.todayTooltip}
                    >
                      Oggi attivi: <span className="text-white">{bookingSummary.today}</span>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      In attesa: <span className="text-white">{bookingSummary.pending}</span>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                      Caparre: <span className="text-white">{bookingSummary.deposit}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-white/70 md:hidden">
                  <div
                    className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-center underline decoration-white/25 decoration-dotted underline-offset-2"
                    title={bookingSummary.todayTooltip}
                  >
                    Oggi attivi: <span className="text-white">{bookingSummary.today}</span>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-center">
                    Attesa: <span className="text-white">{bookingSummary.pending}</span>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-2 py-2 text-center">
                    Caparre: <span className="text-white">{bookingSummary.deposit}</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <Tabs
                    value={bookingView}
                    onChange={(k) => {
                      if (k === 'today' || k === 'all') setBookingView(k)
                    }}
                    items={[
                      { key: 'today', label: 'Oggi' },
                      { key: 'all', label: 'Tutte' },
                    ]}
                  />

                  {bookingView === 'today' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setBookingView('all')
                        setBookingFilter('pending')
                        setBookingQuery('')
                      }}
                    >
                      Vai alla lista completa
                    </Button>
                  )}
                  {bookingView === 'all' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setShowAdvancedBookingTools((v) => !v)}
                    >
                      {showAdvancedBookingTools ? 'Nascondi strumenti avanzati' : 'Mostra strumenti avanzati'}
                    </Button>
                  )}
                </div>

                {flash && (
                  <div
                    className={cn(
                      'mt-4 rounded-2xl border px-4 py-3 text-sm',
                      flash.kind === 'success'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-50'
                        : 'border-white/10 bg-white/5 text-white/80',
                    )}
                  >
                    {flash.message}
                  </div>
                )}

                {bookingView === 'all' && (
                  <BookingFiltersBar
                    value={bookingFilter}
                    onChange={setBookingFilter}
                    query={bookingQuery}
                    onQueryChange={setBookingQuery}
                    sort={bookingSort}
                    onSortChange={setBookingSort}
                    onReset={() => {
                      setBookingFilter('all')
                      setBookingQuery('')
                      setBookingSort('upcoming')
                    }}
                    counts={bookingCounts}
                  />
                )}

                <Card padded={false} className={cn('mt-3 p-3', bookingView !== 'all' && 'mt-4')}>
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="-mx-1 overflow-x-auto px-1">
                      <Tabs
                        value={customerFilter}
                        onChange={(k) => setCustomerFilter(k as typeof customerFilter)}
                        items={[
                          { key: 'all', label: 'Tutti', badge: 0 },
                          { key: 'risk_high', label: 'Rischio alto', badge: customerFilterCounts.riskHigh },
                          { key: 'tag_ritardo', label: 'Tag: ritardo', badge: customerFilterCounts.tagRitardo },
                          { key: 'tag_no_show', label: 'Tag: no-show', badge: customerFilterCounts.tagNoShow },
                        ]}
                        className="min-w-0 sm:min-w-[520px]"
                      />
                    </div>

                    {customerFilter !== 'all' && (
                      <div className="text-xs text-white/60">
                        Filtrando: <span className="text-white">{customerFilteredBookings.length}</span>
                      </div>
                    )}
                  </div>
                </Card>

                {loadingBookings && bookingView !== 'today' && (
                  <div className="mt-4 space-y-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="h-4 w-48 animate-pulse rounded bg-white/10" />
                        <div className="mt-3 h-3 w-full animate-pulse rounded bg-white/10" />
                      </div>
                    ))}
                  </div>
                )}

                {loadingBookings && bookingView === 'today' && (
                  <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                    {[0, 1, 2].map((i) => (
                      <Card key={i} padded={false} className="flex h-[400px] flex-col border-white/5 bg-white/5 p-5">
                        <div className="h-3 w-24 animate-pulse rounded bg-white/10" />
                        <div className="mt-3 h-4 w-32 animate-pulse rounded bg-white/10" />
                        <div className="mt-2 h-3 w-48 animate-pulse rounded bg-white/5" />
                        <div className="mt-6 flex-1 space-y-3">
                          <div className="h-20 w-full animate-pulse rounded-2xl bg-white/5" />
                          <div className="h-20 w-full animate-pulse rounded-2xl bg-white/5" />
                          <div className="h-20 w-4/5 animate-pulse rounded-2xl bg-white/5" />
                        </div>
                      </Card>
                    ))}
                  </div>
                )}

                {bookingView === 'all' && !loadingBookings && bookings.length === 0 && (
                  <div className="mt-4">
                    <EmptyState title="Nessuna prenotazione ancora" description="Quando arrivano, le vedrai qui con filtri e ordinamento." />
                  </div>
                )}

                {bookingView === 'all' && !loadingBookings && bookings.length > 0 && visibleBookings.length === 0 && (
                  <div className="mt-4">
                    <EmptyState
                      title={debouncedBookingQuery.trim() ? `Nessun match per “${debouncedBookingQuery.trim()}”` : 'Nessun risultato'}
                      description="Prova a cambiare filtro o cancella la ricerca."
                      action={
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setBookingQuery('')
                            setBookingFilter('all')
                          }}
                        >
                          Pulisci filtri
                        </Button>
                      }
                    />
                  </div>
                )}

                {bookingView === 'today' && !loadingBookings && (
                  <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <Card padded={false} className="flex h-full flex-col border-white/5 bg-white/5 p-5">
                      <div>
                        <div className="tb-kicker">PRIORITÀ</div>
                        <div className="mt-1 text-base font-semibold text-white">In attesa</div>
                        <div className="mt-1 text-xs text-white/60">Richieste da gestire subito.</div>
                      </div>
                      <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
                        {todayBuckets.pending.length === 0 ? (
                          <EmptyState title="Nessuna richiesta" description="Niente in attesa per ora." className="p-4" />
                        ) : (
                          todayBuckets.pending.slice(0, 12).map((b) => {
                            const rel =
                              reliability[b.customer_user_id] ??
                              ({ score: 80, stars: 0, noShowCount: 0, lateCancelCount: 0 } as const)
                            const eff = computeEffectiveReliability({
                              baseScore: rel.score,
                              stars: rel.stars,
                              noShowCount: rel.noShowCount,
                              lateCancelCount: rel.lateCancelCount,
                            })
                            const risk = getRiskLevel(eff.effectiveScore)
                            const cp = customerProfiles[b.customer_user_id] ?? null
                            const customerName = cp
                              ? `${cp.first_name ?? ''} ${cp.last_name ?? ''}`.trim() || b.customer_user_id
                              : 'Cliente senza nome'
                            return (
                              <BookingQuickRow
                                key={b.id}
                                id={b.id}
                                startAt={b.start_at}
                                endAt={b.end_at}
                                customerName={customerName}
                                customerPhone={cp?.phone ?? null}
                                customerTags={customerTags[b.customer_user_id] ?? []}
                                riskLevel={risk}
                                effectiveScore={eff.effectiveScore}
                                stars={eff.stars}
                                status={b.status}
                                depositCents={b.deposit_amount_cents}
                                requiresDeposit={b.status === 'pending_deposit' || b.deposit_status === 'required'}
                                busy={interactionsLocked}
                                canApprove={b.status === 'requested' || b.status === 'pending_approval'}
                                canCancel={b.status === 'pending_approval' || b.status === 'pending_deposit' || b.status === 'confirmed'}
                                canClose={b.status === 'confirmed'}
                                onApprove={() => void runApprove(b.id, eff.effectiveScore)}
                                onReject={() => {
                                  setError(null)
                                  requestConfirm('reject', b.id)
                                }}
                                onCancel={() => {
                                  setError(null)
                                  requestConfirm('cancel', b.id)
                                }}
                                onNoShow={() => {
                                  setError(null)
                                  requestConfirm('no_show', b.id)
                                }}
                                onComplete={() => {
                                  setError(null)
                                  requestConfirm('complete', b.id)
                                }}
                                onChat={() => openInAll(b.id, true)}
                                onOpen={() => openInAll(b.id, false)}
                              />
                            )
                          })
                        )}
                      </div>
                    </Card>

                    <Card padded={false} className="flex h-full flex-col border-white/5 bg-white/5 p-5">
                      <div>
                        <div className="tb-kicker">OGGI</div>
                        <div className="mt-1 flex items-center justify-between">
                          <div className="text-base font-semibold text-white">Agenda</div>
                          {todayBuckets.requiresDeposit.length > 0 && (
                            <div className="rounded-xl border border-[#4F7CFF]/30 bg-[#4F7CFF]/10 px-2 py-1 text-[10px] font-bold text-[#4F7CFF]">
                              {todayBuckets.requiresDeposit.length} CAPARRE
                            </div>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-white/60">In corso e prossimi slot di oggi.</div>
                      </div>
                      <div className="mt-4 flex-1 space-y-4 overflow-y-auto">
                        {todayBuckets.inProgress.length === 0 &&
                        todayBuckets.soon.length === 0 &&
                        todayBuckets.later.length === 0 ? (
                          <EmptyState title="Nessuna prenotazione" description="Niente in programma oggi." className="p-4" />
                        ) : (
                          <>
                            {todayBuckets.inProgress.length > 0 && (
                              <div className="tb-kicker">IN CORSO</div>
                            )}
                            {todayBuckets.inProgress.map((b) => {
                            const rel =
                              reliability[b.customer_user_id] ??
                              ({ score: 80, stars: 0, noShowCount: 0, lateCancelCount: 0 } as const)
                            const eff = computeEffectiveReliability({
                              baseScore: rel.score,
                              stars: rel.stars,
                              noShowCount: rel.noShowCount,
                              lateCancelCount: rel.lateCancelCount,
                            })
                            const risk = getRiskLevel(eff.effectiveScore)
                            const cp = customerProfiles[b.customer_user_id] ?? null
                            const customerName = cp
                              ? `${cp.first_name ?? ''} ${cp.last_name ?? ''}`.trim() || b.customer_user_id
                              : 'Cliente senza nome'
                            return (
                              <BookingQuickRow
                                key={b.id}
                                id={b.id}
                                startAt={b.start_at}
                                endAt={b.end_at}
                                customerName={customerName}
                                customerPhone={cp?.phone ?? null}
                                customerTags={customerTags[b.customer_user_id] ?? []}
                                riskLevel={risk}
                                effectiveScore={eff.effectiveScore}
                                stars={eff.stars}
                                status={b.status}
                                depositCents={b.deposit_amount_cents}
                                requiresDeposit={b.status === 'pending_deposit' || b.deposit_status === 'required'}
                                timeHint="in_progress"
                                busy={interactionsLocked}
                                canApprove={b.status === 'requested' || b.status === 'pending_approval'}
                                canCancel={b.status === 'pending_approval' || b.status === 'pending_deposit' || b.status === 'confirmed'}
                                canClose={b.status === 'confirmed'}
                                onApprove={() => void runApprove(b.id, eff.effectiveScore)}
                                onReject={() => {
                                  setError(null)
                                  requestConfirm('reject', b.id)
                                }}
                                onCancel={() => {
                                  setError(null)
                                  requestConfirm('cancel', b.id)
                                }}
                                onNoShow={() => {
                                  setError(null)
                                  requestConfirm('no_show', b.id)
                                }}
                                onComplete={() => {
                                  setError(null)
                                  requestConfirm('complete', b.id)
                                }}
                                onChat={() => openInAll(b.id, true)}
                                onOpen={() => openInAll(b.id, false)}
                              />
                            )
                            })}

                            {todayBuckets.soon.length > 0 && (
                              <div className="tb-kicker">TRA POCO</div>
                            )}
                            {todayBuckets.soon.map((b) => {
                              const rel =
                                reliability[b.customer_user_id] ??
                                ({ score: 80, stars: 0, noShowCount: 0, lateCancelCount: 0 } as const)
                              const eff = computeEffectiveReliability({
                                baseScore: rel.score,
                                stars: rel.stars,
                                noShowCount: rel.noShowCount,
                                lateCancelCount: rel.lateCancelCount,
                              })
                              const risk = getRiskLevel(eff.effectiveScore)
                              const cp = customerProfiles[b.customer_user_id] ?? null
                              const customerName = cp
                                ? `${cp.first_name ?? ''} ${cp.last_name ?? ''}`.trim() || b.customer_user_id
                                : 'Cliente senza nome'
                              return (
                                <BookingQuickRow
                                  key={b.id}
                                  id={b.id}
                                  startAt={b.start_at}
                                  endAt={b.end_at}
                                  customerName={customerName}
                                  customerPhone={cp?.phone ?? null}
                                  customerTags={customerTags[b.customer_user_id] ?? []}
                                  riskLevel={risk}
                                  effectiveScore={eff.effectiveScore}
                                  stars={eff.stars}
                                  status={b.status}
                                  depositCents={b.deposit_amount_cents}
                                  requiresDeposit={b.status === 'pending_deposit' || b.deposit_status === 'required'}
                                  timeHint="soon"
                                  busy={interactionsLocked}
                                  canApprove={b.status === 'requested' || b.status === 'pending_approval'}
                                  canCancel={b.status === 'pending_approval' || b.status === 'pending_deposit' || b.status === 'confirmed'}
                                  canClose={b.status === 'confirmed'}
                                  onApprove={() => void runApprove(b.id, eff.effectiveScore)}
                                  onReject={() => {
                                    setError(null)
                                    requestConfirm('reject', b.id)
                                  }}
                                  onCancel={() => {
                                    setError(null)
                                    requestConfirm('cancel', b.id)
                                  }}
                                  onNoShow={() => {
                                    setError(null)
                                    requestConfirm('no_show', b.id)
                                  }}
                                  onComplete={() => {
                                    setError(null)
                                    requestConfirm('complete', b.id)
                                  }}
                                  onChat={() => openInAll(b.id, true)}
                                  onOpen={() => openInAll(b.id, false)}
                                />
                              )
                            })}

                            {todayBuckets.later.length > 0 && (
                              <div className="tb-kicker">PIÙ TARDI</div>
                            )}
                            {todayBuckets.later.map((b) => {
                              const rel =
                                reliability[b.customer_user_id] ??
                                ({ score: 80, stars: 0, noShowCount: 0, lateCancelCount: 0 } as const)
                              const eff = computeEffectiveReliability({
                                baseScore: rel.score,
                                stars: rel.stars,
                                noShowCount: rel.noShowCount,
                                lateCancelCount: rel.lateCancelCount,
                              })
                              const risk = getRiskLevel(eff.effectiveScore)
                              const cp = customerProfiles[b.customer_user_id] ?? null
                              const customerName = cp
                                ? `${cp.first_name ?? ''} ${cp.last_name ?? ''}`.trim() || b.customer_user_id
                                : 'Cliente senza nome'
                              return (
                                <BookingQuickRow
                                  key={b.id}
                                  id={b.id}
                                  startAt={b.start_at}
                                  endAt={b.end_at}
                                  customerName={customerName}
                                  customerPhone={cp?.phone ?? null}
                                  riskLevel={risk}
                                  effectiveScore={eff.effectiveScore}
                                  stars={eff.stars}
                                  status={b.status}
                                  depositCents={b.deposit_amount_cents}
                                  requiresDeposit={b.status === 'pending_deposit' || b.status === 'requires_deposit' || b.status === 'pending_payment_setup' || b.deposit_status === 'required'}
                                  timeHint="later"
                                  busy={interactionsLocked}
                                  canApprove={b.status === 'requested' || b.status === 'pending_approval'}
                                  canCancel={b.status === 'pending_approval' || b.status === 'pending_deposit' || b.status === 'requires_deposit' || b.status === 'pending_payment_setup' || b.status === 'confirmed'}
                                  canClose={b.status === 'confirmed'}
                                  onApprove={() => void runApprove(b.id, eff.effectiveScore)}
                                  onReject={() => {
                                    setError(null)
                                    requestConfirm('reject', b.id)
                                  }}
                                  onCancel={() => {
                                    setError(null)
                                    requestConfirm('cancel', b.id)
                                  }}
                                  onNoShow={() => {
                                    setError(null)
                                    requestConfirm('no_show', b.id)
                                  }}
                                  onComplete={() => {
                                    setError(null)
                                    requestConfirm('complete', b.id)
                                  }}
                                  onChat={() => openInAll(b.id, true)}
                                  onOpen={() => openInAll(b.id, false)}
                                />
                              )
                            })}
                          </>
                        )}
                      </div>
                    </Card>

                    <Card padded={false} className="flex h-full flex-col border-white/5 bg-white/5 p-5">
                      <div>
                        <div className="tb-kicker">PROSSIME</div>
                        <div className="mt-1 text-base font-semibold text-white">In arrivo</div>
                        <div className="mt-1 text-xs text-white/60">Agenda rapida per i prossimi giorni.</div>
                      </div>
                      <div className="mt-4 flex-1 space-y-3 overflow-y-auto">
                        {todayBuckets.upcoming.length === 0 ? (
                          <EmptyState title="Niente in arrivo" description="Nessuna prenotazione nei prossimi giorni." className="p-4" />
                        ) : (
                          todayBuckets.upcoming.map((b) => {
                            const rel =
                              reliability[b.customer_user_id] ??
                              ({ score: 80, stars: 0, noShowCount: 0, lateCancelCount: 0 } as const)
                            const eff = computeEffectiveReliability({
                              baseScore: rel.score,
                              stars: rel.stars,
                              noShowCount: rel.noShowCount,
                              lateCancelCount: rel.lateCancelCount,
                            })
                            const risk = getRiskLevel(eff.effectiveScore)
                            const cp = customerProfiles[b.customer_user_id] ?? null
                            const customerName = cp
                              ? `${cp.first_name ?? ''} ${cp.last_name ?? ''}`.trim() || b.customer_user_id
                              : 'Cliente senza nome'
                            return (
                              <BookingQuickRow
                                key={b.id}
                                id={b.id}
                                startAt={b.start_at}
                                endAt={b.end_at}
                                customerName={customerName}
                                customerPhone={cp?.phone ?? null}
                                customerTags={customerTags[b.customer_user_id] ?? []}
                                riskLevel={risk}
                                effectiveScore={eff.effectiveScore}
                                stars={eff.stars}
                                status={b.status}
                                depositCents={b.deposit_amount_cents}
                                requiresDeposit={b.status === 'pending_deposit' || b.status === 'requires_deposit' || b.status === 'pending_payment_setup' || b.deposit_status === 'required'}
                                timeHint="later"
                                busy={interactionsLocked}
                                canApprove={b.status === 'requested' || b.status === 'pending_approval'}
                                canCancel={b.status === 'pending_approval' || b.status === 'pending_deposit' || b.status === 'requires_deposit' || b.status === 'pending_payment_setup' || b.status === 'confirmed'}
                                canClose={false}
                                onApprove={() => void runApprove(b.id, eff.effectiveScore)}
                                onReject={() => {
                                  setError(null)
                                  requestConfirm('reject', b.id)
                                }}
                                onCancel={() => {
                                  setError(null)
                                  requestConfirm('cancel', b.id)
                                }}
                                onNoShow={() => {
                                  setError(null)
                                  requestConfirm('no_show', b.id)
                                }}
                                onComplete={() => {
                                  setError(null)
                                  requestConfirm('complete', b.id)
                                }}
                                onChat={() => openInAll(b.id, true)}
                                onOpen={() => openInAll(b.id, false)}
                              />
                            )
                          })
                        )}
                      </div>
                    </Card>
                  </div>
                )}

                <div className="mt-4 space-y-2">
                  {bookingView === 'all' &&
                    visibleBookings.map((b) => {
                    const rel =
                      reliability[b.customer_user_id] ??
                      ({ score: 80, stars: 0, noShowCount: 0, lateCancelCount: 0 } as const)
                    const eff = computeEffectiveReliability({
                      baseScore: rel.score,
                      stars: rel.stars,
                      noShowCount: rel.noShowCount,
                      lateCancelCount: rel.lateCancelCount,
                    })
                    const risk = getRiskLevel(eff.effectiveScore)
                    const cp = customerProfiles[b.customer_user_id] ?? null
                    const customerName = cp
                      ? `${cp.first_name ?? ''} ${cp.last_name ?? ''}`.trim() || b.customer_user_id
                      : 'Cliente senza nome'
                    const bizRev = businessReviewEligibility(b)
                    return (
                      <div
                        key={b.id}
                        id={`booking-${b.id}`}
                        className={cn(
                          'rounded-2xl border bg-white/5 p-4',
                          b.id === highlightBookingId ? 'border-[#4F7CFF]/60' : 'border-white/10',
                        )}
                      >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{formatDateTime(b.start_at)}</div>
                          <div className="mt-1 text-xs text-white/70">
                            Cliente: {customerName}
                            {cp?.phone ? ` · ${cp.phone}` : ''} · Eff {eff.effectiveScore}/100 · {eff.stars}★ ({tierFromStars(eff.stars)}) · Rischio {risk}
                          </div>
                          {(customerTags[b.customer_user_id] ?? []).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {(customerTags[b.customer_user_id] ?? []).slice(0, 3).map((t) => (
                                <span
                                  key={t}
                                  className={cn(
                                    'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                                    t === 'no_show'
                                      ? 'border-red-500/30 bg-red-500/10 text-red-100'
                                      : t === 'ritardo'
                                        ? 'border-amber-500/30 bg-amber-500/10 text-amber-50'
                                        : t.toLowerCase() === 'vip'
                                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-50'
                                          : 'border-white/10 bg-white/5 text-white/80',
                                  )}
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-white/70">Caparra: {formatMoneyEUR(b.deposit_amount_cents)}</div>
                          <div className="mt-1 text-xs text-white/60">{bookingStatusLabel(b.status)}</div>
                          {(b.status === 'pending_deposit' || b.deposit_status === 'required') && (
                            <div className="mt-2 inline-flex items-center rounded-full border border-[#4F7CFF]/40 bg-[#4F7CFF]/10 px-2 py-0.5 text-[11px] font-semibold text-white">
                              Richiede caparra
                            </div>
                          )}
                        </div>
                      </div>

                      {b.status === 'change_proposed' && b.proposed_start_at && b.proposed_end_at && b.proposed_by_role === 'cliente' && (
                        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="text-xs font-semibold tracking-wide text-white/60">RICHIESTA MODIFICA ORARIO</div>
                          <div className="mt-2 text-sm font-semibold text-white">
                            {formatDateTime(b.proposed_start_at)} → {formatDateTime(b.proposed_end_at)}
                          </div>
                          {b.proposal_message && <div className="mt-2 text-sm text-white/70">{b.proposal_message}</div>}

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={interactionsLocked}
                              onClick={() => {
                                setError(null)
                                void runBookingExclusive(async () => {
                                  try {
                                    const { data, error } = await supabase.rpc('accept_booking_time_proposal', {
                                      p_booking_id: b.id,
                                    })
                                    if (error) throw error
                                    const row = safeParseBookingRow(data)
                                    if (row) setBookings((prev) => prev.map((x) => (x.id === b.id ? row : x)))
                                  } catch (e: unknown) {
                                    setError(errorMessage(e, 'Errore accettazione richiesta.'))
                                  }
                                })
                              }}
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#4F7CFF] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#6A90FF] disabled:pointer-events-none disabled:opacity-40"
                            >
                              Accetta
                            </button>

                            <button
                              type="button"
                              disabled={interactionsLocked}
                              onClick={() => {
                                setError(null)
                                void runBookingExclusive(async () => {
                                  try {
                                    const { data, error } = await supabase.rpc('reject_booking_time_proposal', {
                                      p_booking_id: b.id,
                                    })
                                    if (error) throw error
                                    const row = safeParseBookingRow(data)
                                    if (row) setBookings((prev) => prev.map((x) => (x.id === b.id ? row : x)))
                                  } catch (e: unknown) {
                                    setError(errorMessage(e, 'Errore rifiuto richiesta.'))
                                  }
                                })
                              }}
                              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40"
                            >
                              Rifiuta
                            </button>
                          </div>
                        </div>
                      )}

                      {(b.status === 'requested' || b.status === 'pending_approval') && (
                        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                          <Button type="button" disabled={interactionsLocked} onClick={() => void runApprove(b.id, eff.effectiveScore)}>
                            Approva
                          </Button>

                          <Input
                            value={rejectReason[b.id] ?? ''}
                            onChange={(e) =>
                              setRejectReason((m) => ({
                                ...m,
                                [b.id]: e.target.value,
                              }))
                            }
                            placeholder="Motivo rifiuto (opz.)"
                          />

                          <Button
                            type="button"
                            variant="danger"
                            disabled={interactionsLocked}
                            onClick={() => {
                              setError(null)
                              requestConfirm('reject', b.id)
                            }}
                          >
                            Rifiuta
                          </Button>
                        </div>
                      )}

                      {(b.status === 'requested' || b.status === 'pending_approval') && showAdvancedBookingTools && (
                        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="tb-kicker">PROPONI ORARIO</div>
                          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                            <Input
                              type="datetime-local"
                              value={proposalDraft[b.id]?.start ?? ''}
                              onChange={(e) =>
                                setProposalDraft((m) => ({
                                  ...m,
                                  [b.id]: {
                                    start: e.target.value,
                                    end: m[b.id]?.end ?? '',
                                    message: m[b.id]?.message ?? '',
                                  },
                                }))
                              }
                            />
                            <Input
                              type="datetime-local"
                              value={proposalDraft[b.id]?.end ?? ''}
                              onChange={(e) =>
                                setProposalDraft((m) => ({
                                  ...m,
                                  [b.id]: {
                                    start: m[b.id]?.start ?? '',
                                    end: e.target.value,
                                    message: m[b.id]?.message ?? '',
                                  },
                                }))
                              }
                            />
                            <Input
                              value={proposalDraft[b.id]?.message ?? ''}
                              onChange={(e) =>
                                setProposalDraft((m) => ({
                                  ...m,
                                  [b.id]: {
                                    start: m[b.id]?.start ?? '',
                                    end: m[b.id]?.end ?? '',
                                    message: e.target.value,
                                  },
                                }))
                              }
                              placeholder="Messaggio (opz.)"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={interactionsLocked}
                            onClick={() => {
                              setError(null)
                              const startRaw = proposalDraft[b.id]?.start
                              const endRaw = proposalDraft[b.id]?.end
                              if (!startRaw || !endRaw) {
                                setError('Inserisci inizio e fine per la proposta.')
                                return
                              }
                              const start = new Date(startRaw)
                              const end = new Date(endRaw)
                              if (!(start.getTime() < end.getTime())) {
                                setError('Intervallo proposta non valido.')
                                return
                              }

                              void runBookingExclusive(async () => {
                                try {
                                  const { data, error } = await supabase.rpc('business_propose_booking_reschedule', {
                                    p_booking_id: b.id,
                                    p_new_start_at: start.toISOString(),
                                    p_new_end_at: end.toISOString(),
                                    p_message: (proposalDraft[b.id]?.message ?? '').trim() || null,
                                  })
                                  if (error) throw error
                                  const row = safeParseBookingRow(data)
                                  if (row) setBookings((prev) => prev.map((x) => (x.id === b.id ? row : x)))
                                } catch (e: unknown) {
                                  setError(errorMessage(e, 'Errore proposta.'))
                                }
                              })
                            }}
                            className="mt-3 w-full"
                          >
                            Invia proposta
                          </Button>
                        </div>
                      )}
                      {(b.status === 'requested' || b.status === 'pending_approval') && !showAdvancedBookingTools && (
                        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
                          Approva/Rifiuta sono sempre disponibili sopra. Attiva «Mostra strumenti avanzati» in alto solo per proporre un nuovo orario al cliente prima dell&apos;approvazione.
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setOpenChat((prev) => (prev === b.id ? null : b.id))}
                        >
                          {openChat === b.id ? 'Chiudi chat' : 'Chat'}
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => setOpenDetails((prev) => (prev === b.id ? null : b.id))}
                        >
                          {openDetails === b.id ? 'Chiudi dettagli' : 'Dettagli'}
                          {(bookingHasNote[b.id] || (customerTags[b.customer_user_id] ?? []).length > 0) && (
                            <span className="ml-1 inline-flex h-2 w-2 rounded-full bg-[#4F7CFF]" />
                          )}
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="success"
                          disabled={b.status !== 'confirmed' || interactionsLocked}
                          onClick={() => {
                            setError(null)
                            requestConfirm('complete', b.id)
                          }}
                          leftIcon={<CheckCircle2 className="h-4 w-4" />}
                        >
                          Completata
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={b.status !== 'confirmed' || interactionsLocked}
                          onClick={() => {
                            setError(null)
                            requestConfirm('no_show', b.id)
                          }}
                          leftIcon={<XCircle className="h-4 w-4" />}
                        >
                          No-show
                        </Button>

                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={
                            interactionsLocked ||
                            (b.status !== 'confirmed' && b.status !== 'pending_deposit' && b.status !== 'pending_approval')
                          }
                          onClick={() => {
                            setError(null)
                            requestConfirm('cancel', b.id)
                          }}
                        >
                          Annulla
                        </Button>
                      </div>

                      {openChat === b.id && openDetails !== b.id && (
                        <div className="mt-3">
                          <Suspense
                            fallback={
                              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-4 text-center text-[11px] text-white/45">
                                Carico chat…
                              </div>
                            }
                          >
                            <BookingChat bookingId={b.id} businessId={b.business_id} />
                          </Suspense>
                        </div>
                      )}

                      {openDetails === b.id && (
                        <Card padded={false} className="mt-3 p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="tb-kicker">DETTAGLIO PRENOTAZIONE</div>
                              <div className="mt-1 text-sm font-semibold text-white">Note, tag e timeline</div>
                              <div className="mt-1 text-xs text-white/60">Usa una sola azione primaria e gestisci il resto nei dettagli.</div>
                            </div>

                            <div>
                              {b.status === 'requested' || b.status === 'pending_approval' ? (
                                <Button type="button" size="sm" disabled={interactionsLocked} onClick={() => void runApprove(b.id, eff.effectiveScore)}>
                                  Approva
                                </Button>
                              ) : b.status === 'confirmed' ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="success"
                                  disabled={interactionsLocked}
                                  onClick={() => {
                                    setError(null)
                                    requestConfirm('complete', b.id)
                                  }}
                                  leftIcon={<CheckCircle2 className="h-4 w-4" />}
                                >
                                  Completata
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => setOpenChat((prev) => (prev === b.id ? null : b.id))}
                                >
                                  {openChat === b.id ? 'Chiudi chat' : 'Apri chat'}
                                </Button>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="tb-kicker">ANTI NO-SHOW</div>
                                <div className="mt-1 text-xs text-white/70">
                                  Affidabilità effettiva: <span className="text-white font-semibold">{eff.effectiveScore}/100</span>
                                  {rel.noShowCount > 0 ? ` · No-show: ${rel.noShowCount}` : ''}
                                  {rel.lateCancelCount > 0 ? ` · Cancellazioni tardive: ${rel.lateCancelCount}` : ''}
                                </div>
                                <div className="mt-1 text-xs text-white/60">
                                  Regole: blocco sotto {activeBusiness.block_reliability_threshold} oppure dopo {activeBusiness.auto_block_no_show_count} no-show.
                                </div>
                              </div>

                              <div className="flex items-center justify-end gap-2">
                                {blockedCustomers[b.customer_user_id] ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    disabled={!isOwner || interactionsLocked}
                                    onClick={() => {
                                      if (!isOwner) return
                                      requestBlockConfirm(b.id, b.customer_user_id, 'unblock')
                                    }}
                                  >
                                    Sblocca
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="danger"
                                    disabled={!isOwner || interactionsLocked}
                                    onClick={() => {
                                      if (!isOwner) return
                                      requestBlockConfirm(b.id, b.customer_user_id, 'block')
                                    }}
                                  >
                                    Blocca
                                  </Button>
                                )}
                              </div>
                            </div>

                            {blockedCustomers[b.customer_user_id] ? (
                              <div className="mt-2 text-xs text-white/70">
                                Cliente attualmente bloccato: non potrà creare nuove prenotazioni per questa attività.
                              </div>
                            ) : null}
                          </div>

                          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
                            <div className="lg:col-span-6 space-y-3">
                              <BookingInternalNote
                                bookingId={b.id}
                                isOwner={isOwner}
                                busy={interactionsLocked}
                                onSaved={(has) => setBookingHasNote((m) => ({ ...m, [b.id]: has }))}
                              />
                              <CustomerTags
                                businessId={b.business_id}
                                customerUserId={b.customer_user_id}
                                isOwner={isOwner}
                                busy={interactionsLocked}
                                onChanged={(tags) => setCustomerTags((m) => ({ ...m, [b.customer_user_id]: tags }))}
                              />
                            </div>
                            <div className="lg:col-span-6">
                              <BookingTimeline bookingId={b.id} busy={interactionsLocked} />
                            </div>
                          </div>

                          <div className="mt-4">
                            <div className="tb-kicker">CHAT</div>
                            <div className="mt-2">
                              {openChat === b.id ? (
                                <Suspense
                                  fallback={
                                    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-4 text-center text-[11px] text-white/45">
                                      Carico chat…
                                    </div>
                                  }
                                >
                                  <BookingChat bookingId={b.id} businessId={b.business_id} />
                                </Suspense>
                              ) : (
                                <EmptyState title="Chat chiusa" description="Apri la chat per scrivere al cliente." className="p-4" />
                              )}
                            </div>
                          </div>
                        </Card>
                      )}

                      {(b.status === 'completed' || b.status === 'no_show') && !reviewedBookings.has(b.id) && bizRev.ok && (
                        <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4">
                          <div className="tb-kicker">VALUTA IL CLIENTE</div>
                          <div className="mt-1 text-xs text-white/55">
                            {b.status === 'no_show'
                              ? `Valutazione comportamento dopo no-show registrato (finestra ${REVIEW_WINDOW_DAYS} giorni). Commento max ${REVIEW_COMMENT_MAX_LENGTH} caratteri.`
                              : `Valutazione dopo visita completata e slot terminato — coerente con affidabilità TrustBook. Commento max ${REVIEW_COMMENT_MAX_LENGTH} caratteri.`}
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
                            disabled={interactionsLocked}
                            onClick={() => {
                              setError(null)
                              const rating = Math.max(1, Math.min(5, reviewDraft[b.id]?.rating ?? 5))
                              const raw = (reviewDraft[b.id]?.comment ?? '').trim()
                              const comment = raw.slice(0, REVIEW_COMMENT_MAX_LENGTH) || null
                              const delta = (rating - 3) * 5

                              void runBookingExclusive(async () => {
                                try {
                                  const { error: insErr } = await supabase.from('reviews').insert({
                                    booking_id: b.id,
                                    business_id: b.business_id,
                                    author_user_id: userId,
                                    direction: 'business_to_customer',
                                    rating,
                                    comment,
                                  })
                                  if (insErr) throw insErr

                                  const { error: rpcErr } = await supabase.rpc(
                                    'apply_reliability_delta',
                                    {
                                      p_user_id: b.customer_user_id,
                                      p_booking_id: b.id,
                                      p_kind: 'business_review',
                                      p_delta: delta,
                                    },
                                  )
                                  if (rpcErr) throw rpcErr

                                  const { data: newRel } = await supabase
                                    .from('customer_reliability')
                                    .select('score')
                                    .eq('user_id', b.customer_user_id)
                                    .single()

                                  if (newRel?.score !== undefined) {
                                    setReliability((m) => ({
                                      ...m,
                                      [b.customer_user_id]: {
                                        ...(m[b.customer_user_id] ?? {
                                          score: 80,
                                          stars: 0,
                                          noShowCount: 0,
                                          lateCancelCount: 0,
                                        }),
                                        score: newRel.score,
                                      },
                                    }))
                                  }

                                  setReviewedBookings((prev) => new Set([...Array.from(prev), b.id]))
                                } catch (e: unknown) {
                                  setError(errorMessage(e, 'Errore recensione.'))
                                }
                              })
                            }}
                            className="mt-3 w-full"
                          >
                            Salva recensione
                          </Button>
                        </div>
                      )}
                      {(b.status === 'completed' || b.status === 'no_show') && !reviewedBookings.has(b.id) && bizRev.ok === false && (
                        <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/60">
                          {businessReviewBlockedMessage(bizRev.reason)}
                        </div>
                      )}
                    </div>
                  )
                })}
                </div>

                {error && (
                  <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {error}
                  </div>
                )}
              </Card>
            )
            }
            </Suspense>
          ) : (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-white">Dashboard attività</div>
                  <div className="mt-1 text-xs text-white/70">
                    Crea un profilo o chiedi all’owner di aggiungerti come staff.
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/70">
                  <ShieldAlert className="h-4 w-4" />
                  Nessuna attività
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm.open}
        title={confirm.open ? confirm.title : ''}
        description={confirm.open ? confirm.description : undefined}
        confirmText={confirm.open ? confirm.confirmText : undefined}
        tone={confirm.open ? confirm.tone : 'primary'}
        busy={actionBusy || isHeld()}
        onCancel={() => {
          if (actionBusy || isHeld()) return
          setConfirm({ open: false })
        }}
        onConfirm={() => {
          if (!confirm.open) return
          void runBookingExclusive(async () => {
            try {
              if (confirm.kind === 'reject') await doReject(confirm.bookingId)
              if (confirm.kind === 'cancel') await doCancel(confirm.bookingId)
              if (confirm.kind === 'no_show') await doNoShow(confirm.bookingId)
              if (confirm.kind === 'complete') await doComplete(confirm.bookingId)
              if (confirm.kind === 'block_customer') {
                if (!activeBusiness) throw new Error('Nessuna attività')
                if (!confirm.customerUserId) throw new Error('Cliente non valido')
                if (!isOwner) throw new Error('Permessi insufficienti')
                await doBlockCustomer(activeBusiness.id, confirm.customerUserId)
                pushFlash('success', 'Cliente bloccato.')
              }
              if (confirm.kind === 'unblock_customer') {
                if (!activeBusiness) throw new Error('Nessuna attività')
                if (!confirm.customerUserId) throw new Error('Cliente non valido')
                if (!isOwner) throw new Error('Permessi insufficienti')
                await doUnblockCustomer(activeBusiness.id, confirm.customerUserId)
                pushFlash('success', 'Cliente sbloccato.')
              }
              setConfirm({ open: false })
              if (confirm.kind !== 'block_customer' && confirm.kind !== 'unblock_customer') pushFlash('success', 'Aggiornato.')
            } catch (e: unknown) {
              setError(errorMessage(e, 'Errore aggiornamento.'))
              setConfirm({ open: false })
            }
          })
        }}
      />
    </AppShell>
  )
}
