import { useEffect, useMemo, useRef, useState } from 'react'
import { Clock, CreditCard, Star, ShieldCheck, CheckCircle2, AlertCircle, User } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import type { BookableStaffOptionRow, BookingRow, BusinessRow, CreateBookingPayload, ServiceRow } from '@/domain/supabase'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/errors'
import { listAvailableResourcesForSlot, getFloorPlanPreviewForCustomerBooking, type AvailableResource, type LayoutJson } from '@/lib/floorPlanApi'
import FloorPlanEditor from '@/components/FloorPlanEditor'
import { createBusinessPrivateSignedUrl } from '@/lib/storage'
import { listNextDaysInTimeZone } from '@/utils/availability'
import { formatDateTime, formatMoneyEUR } from '@/utils/time'
import { calculateRequiredDeposit, type UserRiskLevel } from '@/domain/depositEngine'
import { getRiskLevel } from '@/domain/antiNoShowEngine'
import { withCustomerNoDepositWaive } from '@/lib/bookingRules'
import { computeEffectiveReliability } from '@/utils/reliability'
import Button from '@/shared/ui/Button'
import Alert from '@/shared/ui/Alert'
import Skeleton from '@/shared/ui/Skeleton'
import Input from '@/shared/ui/Input'

/** Policy da `business_booking_ecosystem` per verticalità sala/posti (solo cliente autenticato). */
export type BookingTableSelectionPolicy = {
  customerChoice: 'preferred' | 'required'
  defaultAssignmentMode: 'auto' | 'customer_choice'
  resourceLabel: string
}

export default function BookingPanel(props: {
  business: BusinessRow
  services: ServiceRow[]
  /** Staff prenotabile dal cliente (RPC); vuoto → comportamento precedente (`staff_id` null). */
  bookableStaff?: BookableStaffOptionRow[]
  customerScore: number | null
  customerStars: number | null
  customerEffectiveScore: number | null
  reliabilityPenalty: number | null
  noShowCount?: number | null
  lateCancelCount?: number | null
  isPaused: boolean
  canBook: boolean
  isAuthenticated?: boolean
  /** Bump dopo creazione prenotazione / errore server per rifetch slot dalla RPC. */
  slotRefreshEpoch?: number
  onCreateBooking: (params: CreateBookingPayload) => Promise<{ ok: true; booking: BookingRow } | { ok: false; error: string }>
  onPayDeposit: (bookingId: string) => Promise<void>
  fetchAvailabilitySlots: (params: {
    serviceId: string
    day: Date
    staffId?: string | null
  }) => Promise<Array<{ startAt: string; endAt: string }>>
  /** Messaggio se l’utente è loggato ma non può prenotare (es. ruolo attività). */
  bookingDeniedReason?: string | null
  /** Piano cliente con esenzione caparra (VIP): preview allineata al waiver server-side. */
  customerNoDepositBypass?: boolean
  /** Scelta tavolo/postazione per hospitality / seat_assignment se attività lo consente. */
  tableSelection?: BookingTableSelectionPolicy | null | undefined
}) {
  const location = useLocation()
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [dayIdx, setDayIdx] = useState(0)
  const [slotKey, setSlotKey] = useState<string | null>(null)
  const [created, setCreated] = useState<BookingRow | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [depositBusy, setDepositBusy] = useState(false)
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1)
  const submitSeqRef = useRef(0)
  /** Blocco sincrono: evita due RPC create_booking prima che React aggiorni `submitting`. */
  const bookingConfirmHeldRef = useRef(false)
  const depositHeldRef = useRef(false)
  const singleServicePrimedRef = useRef(false)
  const slotsFetchSeqRef = useRef(0)
  const [availabilitySlots, setAvailabilitySlots] = useState<Array<{ startAt: string; endAt: string }>>([])
  const [slotsFetchLoading, setSlotsFetchLoading] = useState(false)
  const [slotsFetchError, setSlotsFetchError] = useState<string | null>(null)

  const [partySize, setPartySize] = useState(2)
  const [tableOptions, setTableOptions] = useState<AvailableResource[]>([])
  const [tablesLoading, setTablesLoading] = useState(false)
  const [tablesError, setTablesError] = useState<string | null>(null)
  const [selectedTableResourceId, setSelectedTableResourceId] = useState<string | null>(null)

  const [floorPreviewOpen, setFloorPreviewOpen] = useState(false)
  const [floorPreviewLayout, setFloorPreviewLayout] = useState<LayoutJson | null>(null)
  const [floorPreviewResources, setFloorPreviewResources] = useState<Array<{ id: string; is_active: boolean; label: string }>>([])
  const [floorPreviewBusy, setFloorPreviewBusy] = useState(false)
  const [floorPreviewError, setFloorPreviewError] = useState<string | null>(null)
  const [floorPreviewBgUrl, setFloorPreviewBgUrl] = useState<string | null>(null)

  const staffOptions = useMemo(() => props.bookableStaff ?? [], [props.bookableStaff])
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)

  const tz = props.business.timezone ?? 'Europe/Rome'
  const days = useMemo(() => listNextDaysInTimeZone(7, tz), [tz])
  const day = days[dayIdx] ?? days[0]
  const draftStorageKey = useMemo(() => `booking_draft_${props.business.id}`, [props.business.id])
  const resourceLabel = props.tableSelection?.resourceLabel || 'tavolo'
  const resourceLabelCap = resourceLabel.charAt(0).toUpperCase() + resourceLabel.slice(1)

  useEffect(() => {
    if (!serviceId && props.services[0]?.id) {
      setServiceId(props.services[0].id)
    }
  }, [props.services, serviceId])

  useEffect(() => {
    if (singleServicePrimedRef.current || props.services.length !== 1 || !props.services[0]?.id) return
    singleServicePrimedRef.current = true
    setServiceId(props.services[0].id)
    setSlotKey(null)
    setActiveStep(2)
  }, [props.services])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.sessionStorage.getItem(draftStorageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        serviceId?: string
        dayIdx?: number
        slotKey?: string | null
        step?: number
        staffId?: string | null
      }
      if (parsed.serviceId && props.services.some((s) => s.id === parsed.serviceId)) {
        setServiceId(parsed.serviceId)
      }
      if (Number.isInteger(parsed.dayIdx) && Number(parsed.dayIdx) >= 0 && Number(parsed.dayIdx) < days.length) {
        setDayIdx(Number(parsed.dayIdx))
      }
      if (typeof parsed.slotKey === 'string' || parsed.slotKey === null) {
        setSlotKey(parsed.slotKey ?? null)
      }
      if (parsed.step === 2 || parsed.step === 3) {
        setActiveStep(parsed.step)
      }
      if (typeof parsed.staffId === 'string' && staffOptions.some((s) => s.id === parsed.staffId)) {
        setSelectedStaffId(parsed.staffId)
      }
    } catch {
      // Ignore invalid draft payload.
    }
  }, [days.length, draftStorageKey, props.services, staffOptions])

  useEffect(() => {
    const ids = staffOptions.map((s) => s.id)
    if (ids.length === 0) {
      setSelectedStaffId(null)
      return
    }
    setSelectedStaffId((prev) => (prev && ids.includes(prev) ? prev : ids[0]))
  }, [staffOptions])

  useEffect(() => {
    setSlotKey(null)
    setError(null)
  }, [selectedStaffId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.sessionStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          serviceId,
          dayIdx,
          slotKey,
          step: activeStep,
          staffId: selectedStaffId,
        }),
      )
    } catch {
      // Ignore quota/storage errors.
    }
  }, [dayIdx, draftStorageKey, serviceId, slotKey, activeStep, selectedStaffId])

  const selectedStaffMember = useMemo(
    () => (selectedStaffId ? staffOptions.find((s) => s.id === selectedStaffId) ?? null : null),
    [selectedStaffId, staffOptions],
  )

  const service: ServiceRow | null = useMemo(() => {
    return props.services.find((s) => s.id === serviceId) ?? null
  }, [props.services, serviceId])

  const fetchSlots = props.fetchAvailabilitySlots
  const slotEpoch = props.slotRefreshEpoch ?? 0

  useEffect(() => {
    if (!service) {
      setAvailabilitySlots([])
      return
    }
    const seq = ++slotsFetchSeqRef.current
    setSlotsFetchLoading(true)
    setSlotsFetchError(null)
    fetchSlots({
      serviceId: service.id,
      day,
      staffId: selectedStaffId ?? null,
    })
      .then((rows) => {
        if (seq !== slotsFetchSeqRef.current) return
        setAvailabilitySlots(rows)
      })
      .catch(() => {
        if (seq !== slotsFetchSeqRef.current) return
        setAvailabilitySlots([])
        setSlotsFetchError('Impossibile caricare gli slot. Riprova.')
      })
      .finally(() => {
        if (seq !== slotsFetchSeqRef.current) return
        setSlotsFetchLoading(false)
      })
  }, [service, day, selectedStaffId, slotEpoch, fetchSlots])

  useEffect(() => {
    if (!slotKey) return
    const exists = availabilitySlots.some((s) => `${s.startAt}_${s.endAt}` === slotKey)
    if (!exists) setSlotKey(null)
  }, [availabilitySlots, slotKey])

  const rel = useMemo(() => {
    if (props.customerScore === null) return null
    return computeEffectiveReliability({
      baseScore: props.customerScore,
      stars: props.customerStars ?? 0,
      noShowCount: props.noShowCount ?? 0,
      lateCancelCount: props.lateCancelCount ?? 0,
    })
  }, [props.customerScore, props.customerStars, props.lateCancelCount, props.noShowCount])

  const effectiveScore = props.customerScore === null ? null : (props.customerEffectiveScore ?? rel?.effectiveScore ?? props.customerScore)

  const cancellationHours = props.business.cancellation_free_until_hours ?? 24

  const depositPolicyExplainer = useMemo(() => {
    return `La caparra conferma lo slot e riduce i no-show. Cancellazione gratuita fino a ${cancellationHours} ore prima dell’appuntamento (salvo policy diversa dell’attività).`
  }, [cancellationHours])

  const depositInfo = useMemo(() => {
    const score = props.customerEffectiveScore ?? props.customerScore
    let riskLevel: UserRiskLevel = 'unknown'
    if (score !== null) {
      riskLevel = getRiskLevel(score)
    }

    return calculateRequiredDeposit({
      businessPolicy: props.business,
      servicePriceCents: service?.price_cents ?? 0,
      userReliabilityScore: score,
      userRiskLevel: riskLevel,
    })
  }, [props.business, props.customerEffectiveScore, props.customerScore, service])

  const depositPreview = useMemo(
    () => withCustomerNoDepositWaive(depositInfo, Boolean(props.customerNoDepositBypass)),
    [depositInfo, props.customerNoDepositBypass],
  )

  const policyBlockReason = useMemo(() => {
    if (effectiveScore === null) return null
    const blockScore = typeof props.business.block_reliability_threshold === 'number' ? props.business.block_reliability_threshold : 15
    const blockNoShow = typeof props.business.auto_block_no_show_count === 'number' ? props.business.auto_block_no_show_count : 3
    if ((props.noShowCount ?? 0) >= blockNoShow) return 'Storico assenze oltre soglia definita dall’attività.'
    if (effectiveScore < blockScore) return 'Sotto la soglia di affidabilità richiesta dall’attività.'
    return null
  }, [effectiveScore, props.business.auto_block_no_show_count, props.business.block_reliability_threshold, props.noShowCount])

  const selectedSlot = slotKey
    ? availabilitySlots.find((s) => `${s.startAt}_${s.endAt}` === slotKey) ?? null
    : null

  useEffect(() => {
    setSelectedTableResourceId(null)
  }, [partySize, slotKey, props.tableSelection?.customerChoice])

  useEffect(() => {
    const ts = props.tableSelection
    if (!ts || !selectedSlot || !service || !props.canBook || activeStep !== 3) {
      setTableOptions([])
      setTablesError(null)
      setTablesLoading(false)
      return
    }
    let cancelled = false
    setTablesLoading(true)
    setTablesError(null)
    const ps = Math.max(1, Math.min(50, Math.floor(Number(partySize)) || 1))
    void listAvailableResourcesForSlot(
      props.business.id,
      service.id,
      selectedSlot.startAt,
      selectedSlot.endAt,
      ps,
    )
      .then((rows) => {
        if (!cancelled) setTableOptions(rows)
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setTableOptions([])
          setTablesError(errorMessage(e, 'Impossibile caricare risorse disponibili.'))
        }
      })
      .finally(() => {
        if (!cancelled) setTablesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [props.tableSelection, selectedSlot, service, props.canBook, partySize, activeStep, props.business.id])

  const tablePickBlocked = useMemo(() => {
    const ts = props.tableSelection
    if (!ts || !props.canBook) return false
    if (tablesLoading) return true
    if (ts.customerChoice !== 'required') return false
    if (tableOptions.length === 0) return true
    return !selectedTableResourceId
  }, [props.tableSelection, props.canBook, tablesLoading, tableOptions.length, selectedTableResourceId])

  const tableFloorPlanPreviewId = useMemo(() => {
    const ids = tableOptions.map((t) => t.floor_plan_id).filter((id): id is string => Boolean(id))
    if (ids.length === 0) return null
    const first = ids[0]
    return ids.every((id) => id === first) ? first : null
  }, [tableOptions])

  const tableFloorPlanMixed = useMemo(() => {
    const ids = tableOptions.map((t) => t.floor_plan_id).filter((id): id is string => Boolean(id))
    if (ids.length <= 1) return false
    const first = ids[0]
    return !ids.every((id) => id === first)
  }, [tableOptions])

  useEffect(() => {
    setFloorPreviewOpen(false)
    setFloorPreviewLayout(null)
    setFloorPreviewError(null)
    setFloorPreviewResources([])
    setFloorPreviewBgUrl(null)
  }, [slotKey, serviceId, tableFloorPlanPreviewId])

  useEffect(() => {
    if (!floorPreviewOpen || !tableFloorPlanPreviewId || activeStep !== 3) return
    if (props.isAuthenticated === false) {
      setFloorPreviewBusy(false)
      setFloorPreviewError('Accedi per visualizzare la planimetria sala.')
      setFloorPreviewLayout(null)
      setFloorPreviewResources([])
      setFloorPreviewBgUrl(null)
      return
    }
    let cancelled = false
    setFloorPreviewBusy(true)
    setFloorPreviewError(null)
    setFloorPreviewBgUrl(null)
    void getFloorPlanPreviewForCustomerBooking(props.business.id, tableFloorPlanPreviewId)
      .then(async (row) => {
        if (cancelled || !row) {
          if (!cancelled && !row) {
            setFloorPreviewLayout(null)
            setFloorPreviewResources([])
            setFloorPreviewError('Planimetria non disponibile.')
          }
          return
        }
        let bgUrl: string | null = null
        const bg = row.layout_json.background
        if (bg?.bucket === 'business-private' && bg.path) {
          try {
            bgUrl = await createBusinessPrivateSignedUrl({ path: bg.path, expiresIn: 900 })
          } catch {
            bgUrl = null
          }
        }
        if (cancelled) return
        setFloorPreviewLayout(row.layout_json)
        setFloorPreviewResources(
          row.resources_json.map((r) => ({ id: r.id, label: r.label, is_active: Boolean(r.is_active) })),
        )
        setFloorPreviewBgUrl(bgUrl)
      })
      .catch(() => {
        if (!cancelled) {
          setFloorPreviewLayout(null)
          setFloorPreviewResources([])
          setFloorPreviewBgUrl(null)
          setFloorPreviewError('Impossibile caricare la planimetria.')
        }
      })
      .finally(() => {
        if (!cancelled) setFloorPreviewBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    floorPreviewOpen,
    tableFloorPlanPreviewId,
    props.business.id,
    activeStep,
    props.isAuthenticated,
  ])

  const createdService = created
    ? props.services.find((s) => s.id === created.service_id) ?? null
    : null

  const handleConfirm = () => {
    if (!selectedSlot || !service) return
    if (submitting || bookingConfirmHeldRef.current) return
    if (!Number.isFinite(service.duration_min) || service.duration_min <= 0) {
      setError('Durata servizio non valida.')
      return
    }
    const startMs = new Date(selectedSlot.startAt).getTime()
    const endMs = new Date(selectedSlot.endAt).getTime()
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
      setError('Slot non valido. Aggiorna disponibilità e riprova.')
      return
    }
    const ts = props.tableSelection
    if (ts?.customerChoice === 'required') {
      if (!tablesLoading && tableOptions.length === 0 && !tablesError) {
        setError(`Nessun ${resourceLabel} disponibile per questo slot con le persone indicate.`)
        return
      }
      if (tableOptions.length > 0 && !selectedTableResourceId) {
        setError(`Seleziona un ${resourceLabel} disponibile.`)
        return
      }
    }
    bookingConfirmHeldRef.current = true
    const reqId = ++submitSeqRef.current
    setError(null)
    setSubmitting(true)
    const ps = Math.max(1, Math.min(50, Math.floor(Number(partySize)) || 1))
    let resourceAssignment: CreateBookingPayload['resourceAssignment']
    if (ts && props.canBook) {
      if (selectedTableResourceId) {
        resourceAssignment = { kind: 'explicit', resourceId: selectedTableResourceId, partySize: ps }
      } else if (ts.customerChoice === 'preferred' && ts.defaultAssignmentMode === 'auto') {
        resourceAssignment = { kind: 'auto', partySize: ps }
      }
    }

    props
      .onCreateBooking({
        serviceId: service.id,
        startAt: selectedSlot.startAt,
        endAt: selectedSlot.endAt,
        staffId: selectedStaffId ?? null,
        resourceAssignment,
      })
      .then((res) => {
        if (reqId !== submitSeqRef.current) return
        if (res.ok === false) return setError(res.error)
        setCreated(res.booking)
        setSlotKey(null)
        if (typeof window !== 'undefined') {
          window.sessionStorage.removeItem(draftStorageKey)
        }
      })
      .catch(() => {
        if (reqId !== submitSeqRef.current) return
        setError('Errore prenotazione. Riprova.')
      })
      .finally(() => {
        bookingConfirmHeldRef.current = false
        if (reqId !== submitSeqRef.current) return
        setSubmitting(false)
      })
  }

  // --- Render Created State ---
  if (created) {
    const confirmedStaff = created.staff_id ? staffOptions.find((s) => s.id === created.staff_id) ?? null : null
    return (
      <div className="sticky top-[calc(env(safe-area-inset-top,0px)+72px)] md:top-[88px] flex flex-col overflow-hidden rounded-[2rem] border border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent p-4 shadow-2xl sm:p-6 md:p-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-col items-center text-center gap-4 py-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 mb-2">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Prenotazione Creata</h2>
          <div className="mt-3 space-y-1 text-center text-sm text-white/75">
            <p className="font-semibold text-white">{createdService?.name ?? 'Servizio'}</p>
            <p>{formatDateTime(created.start_at)}</p>
            {confirmedStaff ? (
              <p className="flex items-center justify-center gap-2 text-white/65">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: confirmedStaff.color }} />
                Operatore: <span className="font-medium text-white/90">{confirmedStaff.display_name}</span>
              </p>
            ) : null}
          </div>
        </div>

        {created.status === 'pending_deposit' || created.status === 'requires_deposit' || created.status === 'pending_payment_setup' ? (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3 border border-white/5">
              <div className="flex items-center gap-3 text-sm font-medium text-white/80">
                <CreditCard className="h-5 w-5 text-[#7D9BFF]" />
                Caparra conferma lo slot
              </div>
              <div className="text-lg font-bold text-white">
                {formatMoneyEUR(created.deposit_amount_cents)}
              </div>
            </div>
            <div className="text-xs text-white/60 leading-relaxed text-center space-y-2">
              <p>{depositPolicyExplainer}</p>
              <p className="text-white/45">
                Pagamento sicuro; riceverai conferma dopo il checkout. Se chiudi questa pagina, riparti da «Le mie prenotazioni».
              </p>
            </div>
            <Button
              type="button"
              disabled={depositBusy}
              onClick={() => {
                if (depositBusy || depositHeldRef.current) return
                depositHeldRef.current = true
                setDepositBusy(true)
                void props
                  .onPayDeposit(created.id)
                  .catch(() => {
                    setError('Errore avvio pagamento caparra.')
                  })
                  .finally(() => {
                    depositHeldRef.current = false
                    setDepositBusy(false)
                  })
              }}
              className="w-full py-3.5 text-base font-bold shadow-lg shadow-[#4F7CFF]/20"
              variant="primary"
            >
              {depositBusy ? 'Apertura checkout…' : 'Paga caparra ora'}
            </Button>
            {error && <Alert tone="danger">{error}</Alert>}
          </div>
        ) : created.status === 'pending_approval' ? (
          <Alert className="mt-6" tone="info">
            Richiesta inviata. In attesa di approvazione dell’attività.
          </Alert>
        ) : (
          <Alert className="mt-6" tone="success">
            La tua prenotazione è confermata. Ti aspettiamo!
          </Alert>
        )}

        <div className="mt-8">
          <Link
            to="/prenotazioni"
            className="flex w-full items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-3.5 text-sm font-bold text-white transition-colors hover:bg-white/10"
          >
            Vai alle mie prenotazioni
          </Link>
        </div>
      </div>
    )
  }

  // --- Render Wizard State ---
  return (
    <div className="sticky top-[calc(env(safe-area-inset-top,0px)+72px)] md:top-[88px] flex flex-col overflow-hidden rounded-[2rem] border border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent p-4 shadow-2xl sm:p-6 md:p-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      
      {/* Header & Trust Score */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <h2 className="text-xl font-bold tracking-tight text-white">Prenota ora</h2>
        {props.customerScore !== null && (
          <div className="inline-flex items-center gap-3 rounded-2xl border border-[#7D9BFF]/20 bg-[#7D9BFF]/5 px-3 py-2 backdrop-blur-sm shadow-sm">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-[#7D9BFF]" />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Trust Score</span>
                <span className="text-sm font-bold leading-none text-white">{props.customerEffectiveScore ?? props.customerScore}<span className="text-[10px] font-medium text-white/40">/100</span></span>
              </div>
            </div>
            <div className="h-6 w-px bg-white/10" />
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={cn(
                    'h-3.5 w-3.5',
                    i < (props.customerStars ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-white/20'
                  )}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {props.isPaused && (
        <Alert tone="warning" className="mb-6">
          Questa attività è momentaneamente in pausa e non accetta nuove prenotazioni.
        </Alert>
      )}

      <div className="flex flex-col gap-4">
        
        {/* STEP 1: Servizio */}
        <div className={cn(
          "rounded-[1.5rem] border transition-all duration-300",
          activeStep === 1 ? "border-[#4F7CFF]/50 bg-white/5 p-5 shadow-lg" : "border-white/5 bg-transparent p-4",
          activeStep > 1 && "hover:bg-white/[0.02] cursor-pointer"
        )} onClick={() => activeStep > 1 && setActiveStep(1)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold", activeStep === 1 ? "bg-[#4F7CFF] text-white shadow-md shadow-[#4F7CFF]/20" : activeStep > 1 ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/50")}>
                {activeStep > 1 ? <CheckCircle2 className="h-5 w-5" /> : "1"}
              </div>
              <h3 className={cn("font-bold tracking-wide", activeStep === 1 ? "text-white" : "text-white/70")}>Scegli servizio</h3>
            </div>
            {activeStep > 1 && service && (
              <button
                type="button"
                className="text-xs font-semibold text-[#7D9BFF] hover:text-white transition-colors min-h-[44px] min-w-[44px] px-2 inline-flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveStep(1)
                  setError(null)
                }}
              >
                Modifica
              </button>
            )}
          </div>

          {activeStep === 1 ? (
            <div className="mt-5 grid grid-cols-1 gap-3">
              {props.services.map((s) => {
                const active = serviceId === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={props.isPaused}
                    onClick={(e) => {
                      e.stopPropagation()
                      setServiceId(s.id)
                      setSlotKey(null)
                      setError(null)
                      setActiveStep(2)
                    }}
                    className={cn(
                      'rounded-2xl border px-4 py-3.5 text-left transition-all hover:scale-[1.01]',
                      active
                        ? 'border-[#4F7CFF] bg-[#4F7CFF]/10 shadow-md shadow-[#4F7CFF]/10'
                        : 'border-white/10 bg-white/[0.02] hover:bg-white/10',
                      props.isPaused && "opacity-50 cursor-not-allowed hover:scale-100"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold text-white">{s.name}</div>
                      <div className="flex items-center gap-2 text-xs font-medium text-white/60">
                        <Clock className="h-3.5 w-3.5" />
                        {s.duration_min} min
                      </div>
                    </div>
                    {s.price_cents !== null && (
                      <div className="mt-1.5 text-xs font-semibold text-emerald-400">{formatMoneyEUR(s.price_cents)}</div>
                    )}
                  </button>
                )
              })}
            </div>
          ) : (
            service && (
              <div className="mt-3 ml-11 text-sm font-medium text-white/80">
                {service.name} <span className="text-white/40 font-normal">({service.duration_min} min)</span>
              </div>
            )
          )}
        </div>

        {/* STEP 2: Data e Ora */}
        <div className={cn(
          "rounded-[1.5rem] border transition-all duration-300",
          activeStep === 2 ? "border-[#4F7CFF]/50 bg-white/5 p-5 shadow-lg" : "border-white/5 bg-transparent p-4",
          activeStep > 2 && "hover:bg-white/[0.02] cursor-pointer",
          activeStep < 2 && "opacity-50 pointer-events-none"
        )} onClick={() => activeStep > 2 && setActiveStep(2)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold", activeStep === 2 ? "bg-[#4F7CFF] text-white shadow-md shadow-[#4F7CFF]/20" : activeStep > 2 ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/50")}>
                {activeStep > 2 ? <CheckCircle2 className="h-5 w-5" /> : "2"}
              </div>
              <h3 className={cn("font-bold tracking-wide", activeStep === 2 ? "text-white" : "text-white/70")}>Data e Orario</h3>
            </div>
            {activeStep > 2 && selectedSlot && (
              <button
                type="button"
                className="text-xs font-semibold text-[#7D9BFF] hover:text-white transition-colors min-h-[44px] min-w-[44px] px-2 inline-flex items-center justify-center"
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveStep(2)
                  setError(null)
                }}
              >
                Modifica
              </button>
            )}
          </div>

          {activeStep === 2 ? (
            <div className="mt-5">
              {staffOptions.length > 1 && (
                <div className="mb-4">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/50">
                    <User className="h-3.5 w-3.5" />
                    Operatore
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                    {staffOptions.map((s) => {
                      const active = selectedStaffId === s.id
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={props.isPaused}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedStaffId(s.id)
                          }}
                          className={cn(
                            'shrink-0 rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition-all min-h-[48px] min-w-[120px]',
                            active
                              ? 'border-[#4F7CFF] bg-[#4F7CFF]/15 text-white shadow-sm shadow-[#4F7CFF]/10'
                              : 'border-white/10 bg-white/5 text-white/75 hover:bg-white/10 hover:text-white',
                            props.isPaused && 'opacity-50 cursor-not-allowed',
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                            {s.display_name}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              {staffOptions.length === 1 && (
                <div className="mb-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-white/70">
                  <User className="h-4 w-4 shrink-0 text-white/50" />
                  <span>
                    Operatore: <strong className="text-white">{staffOptions[0].display_name}</strong>
                  </span>
                </div>
              )}
              {(props.business.booking_lead_time_min ?? 0) > 0 && (
                <div className="mb-3 text-[11px] text-white/50 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Prenotabile con almeno {props.business.booking_lead_time_min} min di anticipo.
                </div>
              )}
              <div className="flex gap-2 overflow-auto pb-2 scrollbar-hide">
                {days.map((d, idx) => {
                  const active = idx === dayIdx
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={props.isPaused}
                      onClick={(e) => {
                        e.stopPropagation()
                        setDayIdx(idx)
                        setSlotKey(null)
                        setError(null)
                      }}
                      className={cn(
                        'whitespace-nowrap rounded-xl border px-4 py-2.5 text-sm font-medium transition-all min-h-[48px] inline-flex flex-col items-center justify-center gap-0.5',
                        active
                          ? 'border-[#4F7CFF] bg-[#4F7CFF]/10 text-white shadow-sm shadow-[#4F7CFF]/10'
                          : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white',
                        props.isPaused && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <span className="uppercase text-[10px] tracking-wider opacity-70">{new Intl.DateTimeFormat('it-IT', { weekday: 'short', timeZone: tz }).format(d)}</span>
                      <span>{new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: 'short', timeZone: tz }).format(d)}</span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 min-[380px]:grid-cols-3 sm:grid-cols-4 lg:grid-cols-3">
                {slotsFetchLoading ? (
                  Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-[48px] rounded-xl" />)
                ) : (
                  availabilitySlots.slice(0, 18).map((s) => {
                  const key = `${s.startAt}_${s.endAt}`
                  const active = key === slotKey
                  const label = new Intl.DateTimeFormat('it-IT', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: tz,
                  }).format(new Date(s.startAt))
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={props.isPaused}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSlotKey(key)
                        setError(null)
                        setActiveStep(3)
                      }}
                      className={cn(
                        'min-h-[48px] rounded-xl border px-3 py-2 text-sm font-bold transition-all inline-flex items-center justify-center',
                        active
                          ? 'border-[#4F7CFF] bg-[#4F7CFF]/10 text-white shadow-sm shadow-[#4F7CFF]/10 scale-105'
                          : 'border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white hover:scale-[1.02]',
                        props.isPaused && "opacity-50 cursor-not-allowed hover:scale-100"
                      )}
                    >
                      {label}
                    </button>
                  )
                })
                )}
              </div>

              {!slotsFetchLoading && availabilitySlots.length === 0 && (
                <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-4 text-center">
                  <div className="text-sm font-medium text-white/70">Nessuno slot disponibile</div>
                  <div className="text-xs text-white/50 mt-1">Prova a selezionare un altro giorno.</div>
                </div>
              )}
            </div>
          ) : (
            activeStep > 2 && selectedSlot && (
              <div className="mt-3 ml-11 space-y-1 text-sm font-medium text-white/80">
                <div>
                  {new Intl.DateTimeFormat('it-IT', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: tz,
                  }).format(new Date(selectedSlot.startAt))}
                </div>
                {selectedStaffMember ? (
                  <div className="flex items-center gap-2 text-xs font-normal text-white/55">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: selectedStaffMember.color }} />
                    {selectedStaffMember.display_name}
                  </div>
                ) : null}
              </div>
            )
          )}
        </div>

        {/* STEP 3: Conferma */}
        <div className={cn(
          "rounded-[1.5rem] border transition-all duration-300",
          activeStep === 3 ? "border-[#4F7CFF]/50 bg-white/5 p-5 shadow-lg" : "border-white/5 bg-transparent p-4",
          activeStep < 3 && "opacity-50 pointer-events-none"
        )}>
          <div className="flex items-center gap-3">
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold", activeStep === 3 ? "bg-[#4F7CFF] text-white shadow-md shadow-[#4F7CFF]/20" : "bg-white/10 text-white/50")}>
              3
            </div>
            <h3 className={cn("font-bold tracking-wide", activeStep === 3 ? "text-white" : "text-white/70")}>Conferma</h3>
          </div>

          {activeStep === 3 && (
            <div className="mt-5 space-y-5">
              {/* Riepilogo Costi e Caparra */}
              <div className="rounded-2xl bg-white/[0.03] p-4 border border-white/5">
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/50 mb-3">Riepilogo</h4>
                <div className="space-y-2">
                  <div className="flex justify-between gap-3 items-start text-sm">
                    <span className="text-white/70 shrink-0">Attività</span>
                    <span className="font-semibold text-white text-right">{props.business.name}</span>
                  </div>
                  <div className="flex justify-between gap-3 items-start text-sm">
                    <span className="text-white/70 shrink-0">Servizio</span>
                    <span className="font-semibold text-white text-right">{service?.name ?? '—'}</span>
                  </div>
                  {selectedSlot && (
                    <div className="flex justify-between gap-3 items-start text-sm">
                      <span className="text-white/70 shrink-0">Quando</span>
                      <span className="font-semibold text-white text-right">
                        {new Intl.DateTimeFormat('it-IT', {
                          weekday: 'short',
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                          timeZone: tz,
                        }).format(new Date(selectedSlot.startAt))}
                      </span>
                    </div>
                  )}
                  {selectedStaffMember ? (
                    <div className="flex justify-between gap-3 items-start text-sm">
                      <span className="text-white/70 shrink-0">Operatore</span>
                      <span className="inline-flex items-center gap-2 font-semibold text-white text-right">
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: selectedStaffMember.color }} />
                        {selectedStaffMember.display_name}
                      </span>
                    </div>
                  ) : null}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-white/70">Prezzo servizio</span>
                    <span className="font-bold text-white">{service?.price_cents ? formatMoneyEUR(service.price_cents) : 'Gratis'}</span>
                  </div>

                  <div className="my-3 border-t border-white/5" />

                  {depositPreview.depositRequired ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-semibold text-white/90">Caparra da versare ora</span>
                        <span className="font-bold text-[#7D9BFF] text-base">{formatMoneyEUR(depositPreview.depositAmountCents)}</span>
                      </div>
                      <p className="text-[11px] text-white/50 mt-1.5 leading-relaxed">{depositPreview.customerMessage}</p>
                      <p className="text-[11px] text-white/40 leading-relaxed">{depositPolicyExplainer}</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start gap-2.5">
                        <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                        <div className="flex flex-col">
                          <span className="text-sm font-bold text-emerald-400">Nessuna caparra richiesta</span>
                          <p className="text-[11px] text-white/50 leading-relaxed mt-1">
                            {props.isAuthenticated
                              ? "Il tuo profilo cliente è affidabile, puoi prenotare senza versare alcun anticipo."
                              : "Per questo servizio non è richiesto alcun anticipo."}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {depositPreview.requiresManualApproval && !policyBlockReason && (
                    <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200/90 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>
                        Richiesta inviata all’attività per conferma manuale (profilo da verificare). Non è un errore: riceverai aggiornamenti su «Le mie prenotazioni».
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {props.tableSelection ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/50">{resourceLabelCap} / persone</h4>
                  <p className="text-xs text-white/55 leading-relaxed">
                    Se l’attività gestisce risorse (tavoli, postazioni, posti), puoi indicare persone e — se disponibile — la posizione. Il motore verifica la
                    disponibilità sullo slot scelto.
                  </p>
                  <div>
                    <label className="tb-label text-xs">Numero persone</label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={50}
                      value={String(partySize)}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10)
                        setPartySize(Number.isFinite(n) ? Math.min(50, Math.max(1, n)) : 1)
                      }}
                      className="mt-1 max-w-[120px]"
                    />
                  </div>
                  {tablesLoading ? (
                    <Skeleton className="h-10 w-full rounded-xl" />
                  ) : tablesError ? (
                    <Alert tone="warning">{tablesError}</Alert>
                  ) : tableOptions.length > 0 ? (
                    <div>
                      <label className="tb-label text-xs">
                        {props.tableSelection.customerChoice === 'required'
                          ? `${resourceLabelCap} (obbligatorio)`
                          : `Preferenza ${resourceLabel}`}
                      </label>
                      <select
                        value={selectedTableResourceId ?? ''}
                        onChange={(e) => setSelectedTableResourceId(e.target.value || null)}
                        className="mt-1 flex h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white outline-none focus:border-[#4F7CFF]/50"
                      >
                        {(props.tableSelection.customerChoice === 'preferred' ||
                          props.tableSelection.defaultAssignmentMode === 'auto') && (
                          <option value="">
                            {props.tableSelection.defaultAssignmentMode === 'auto'
                              ? 'Automatico (consigliato)'
                              : 'Nessuna preferenza ora'}
                          </option>
                        )}
                        {tableOptions.map((t) => (
                          <option key={t.resource_id} value={t.resource_id}>
                            {t.label} · fino a {t.capacity_max} · {t.zone}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <p className="text-xs text-white/45">
                      Nessuna risorsa libera per questo slot con le persone indicate: prova un altro orario o riduci il numero persone.
                    </p>
                  )}
                  {tableOptions.length > 0 && tableFloorPlanMixed ? (
                    <p className="text-[11px] text-white/45 leading-relaxed mt-2">
                      Anteprima mappa non disponibile: le risorse disponibili sono associate a piani sala diversi.
                    </p>
                  ) : null}
                  {tableOptions.length > 0 && tableFloorPlanPreviewId ? (
                    <div className="mt-3 space-y-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-[#7D9BFF] underline-offset-2 hover:underline"
                        onClick={() => setFloorPreviewOpen((o) => !o)}
                      >
                        {floorPreviewOpen ? 'Nascondi planimetria sala' : 'Mostra planimetria sala'}
                      </button>
                      {floorPreviewOpen ? (
                        <>
                          <p className="text-[11px] text-white/45 leading-relaxed">
                            Il verde evidenzia la {resourceLabel} selezionata nel menu sopra (solo lettura).
                          </p>
                          {floorPreviewBusy ? (
                            <Skeleton className="h-[280px] w-full rounded-xl" />
                          ) : floorPreviewError ? (
                            <Alert tone="warning">{floorPreviewError}</Alert>
                          ) : floorPreviewLayout ? (
                            <FloorPlanEditor
                              layoutJson={floorPreviewLayout}
                              resources={floorPreviewResources}
                              focusedResourceId={selectedTableResourceId}
                              occupiedResourceIds={[]}
                              backgroundUrl={floorPreviewBgUrl}
                              readOnly
                              onChange={() => {}}
                            />
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Error and warnings */}
              {error && <Alert tone="danger">{error}</Alert>}
              {slotsFetchError && <Alert tone="warning">{slotsFetchError}</Alert>}

              {policyBlockReason && props.canBook && !props.isPaused && (
                <Alert tone="danger">
                  Prenotazione non disponibile: {policyBlockReason} Contatta l’attività per sbloccare.
                </Alert>
              )}

              {/* Azioni */}
              {props.isAuthenticated && props.bookingDeniedReason ? (
                <Alert tone="warning">{props.bookingDeniedReason}</Alert>
              ) : null}

              {props.isAuthenticated ? (
                <Button
                  type="button"
                  className="w-full py-4 text-base font-bold shadow-lg shadow-[#4F7CFF]/20 transition-all active:scale-[0.99] md:hover:scale-[1.02] md:hover:shadow-[#4F7CFF]/30 min-h-[52px]"
                  disabled={
                    !selectedSlot ||
                    !props.canBook ||
                    props.isPaused ||
                    slotsFetchLoading ||
                    Boolean(policyBlockReason) ||
                    submitting ||
                    Boolean(props.bookingDeniedReason) ||
                    tablePickBlocked
                  }
                  onClick={handleConfirm}
                >
                  {submitting ? 'Invio in corso…' : 'Conferma e invia richiesta'}
                </Button>
              ) : (
                <Link
                  to={`/login?returnTo=${encodeURIComponent(location.pathname)}`}
                  className="flex w-full items-center justify-center rounded-2xl bg-[#4F7CFF] px-4 py-4 text-base font-bold text-white shadow-lg shadow-[#4F7CFF]/20 transition-all active:scale-[0.99] md:hover:scale-[1.02] md:hover:shadow-[#4F7CFF]/30 hover:bg-[#4F7CFF]/90 min-h-[52px]"
                >
                  Accedi per continuare
                </Link>
              )}

              <div className="text-center text-[10px] text-white/40 font-medium px-1">
                Con la conferma accetti termini di servizio e le condizioni di cancellazione dell’attività ({cancellationHours}h anticipo dove applicabile).
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
