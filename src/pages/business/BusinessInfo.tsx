import { Globe, Mail, MapPin, Phone, ShieldAlert, Star, LayoutGrid } from 'lucide-react'
import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import type { BusinessClosureRow, BusinessOpeningWindowRow, BusinessRow, ReviewPublicRow, ServiceRow } from '@/domain/supabase'
import { REVIEW_WINDOW_DAYS } from '@/lib/reviewEligibility'
import Badge from '@/shared/ui/Badge'
import Button from '@/shared/ui/Button'
import MediaThumb from '@/shared/ui/MediaThumb'
import Alert from '@/shared/ui/Alert'
import Modal from '@/shared/ui/Modal'
import {
  computeTrustBadges,
  formatMinutes,
  formatPercent01,
  type BusinessPublicReputation,
} from '@/lib/businessReputation'
import { formatDateTime, formatMoneyEUR } from '@/utils/time'
import { googleMapsUrl } from '@/utils/maps'
import FloorPlanEditor from '@/components/FloorPlanEditor'
import { getPublicFloorPlanBundle, type PublicFloorPlanBundle } from '@/lib/floorPlanApi'
import { errorMessage } from '@/lib/errors'
import { resolvePublicProfileSettings } from '@/lib/publicProfileSettings'

const BusinessMap = lazy(() => import('@/components/BusinessMap'))

export default function BusinessInfo(props: {
  business: BusinessRow
  reviews: ReviewPublicRow[]
  services?: ServiceRow[]
  openingWindows?: BusinessOpeningWindowRow[]
  closures?: BusinessClosureRow[]
  reputation?: BusinessPublicReputation | null
  /** Owner/staff dell’attività possono segnalare testi pubblici cliente→business. */
  reportCustomerReviewsEnabled?: boolean
  onReportCustomerReview?: (reviewId: string) => void
}) {
  const [showAllReviews, setShowAllReviews] = useState(false)
  const [showMap, setShowMap] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryIndex, setGalleryIndex] = useState(0)
  const [showFloorPlans, setShowFloorPlans] = useState(false)
  const [floorPlansLoading, setFloorPlansLoading] = useState(false)
  const [floorPlansError, setFloorPlansError] = useState<string | null>(null)
  const [floorPlans, setFloorPlans] = useState<PublicFloorPlanBundle[]>([])
  const [selectedFloorPlanId, setSelectedFloorPlanId] = useState<string | null>(null)
  const avgRating = props.reviews.length
    ? props.reviews.reduce((a, r) => a + r.rating, 0) / props.reviews.length
    : null
  const repBadges = useMemo(() => computeTrustBadges(props.reputation ?? null), [props.reputation])
  const confirmPct = useMemo(() => formatPercent01(props.reputation?.confirmed_rate ?? null), [props.reputation?.confirmed_rate])
  const cancelPct = useMemo(
    () => formatPercent01(props.reputation?.cancelled_by_business_rate ?? null),
    [props.reputation?.cancelled_by_business_rate],
  )
  const onTimePct = useMemo(() => formatPercent01(props.reputation?.on_time_rate ?? null), [props.reputation?.on_time_rate])
  const responseTime = useMemo(
    () => formatMinutes(props.reputation?.response_time_avg_minutes ?? null),
    [props.reputation?.response_time_avg_minutes],
  )

  const visibleReviews = useMemo(() => {
    return showAllReviews ? props.reviews : props.reviews.slice(0, 4)
  }, [props.reviews, showAllReviews])

  const pub = useMemo(
    () => resolvePublicProfileSettings(props.business.public_profile_settings),
    [props.business.public_profile_settings],
  )

  const depositSummary = useMemo(() => {
    const b = props.business
    if (!b.deposit_enabled || b.deposit_rule === 'off') return 'Nessuna'
    if (b.deposit_fixed_cents !== null) return formatMoneyEUR(b.deposit_fixed_cents)
    if (b.deposit_percent !== null) {
      const parts: string[] = [`${b.deposit_percent}%`]
      if (b.deposit_min_cents !== null) parts.push(`min ${formatMoneyEUR(b.deposit_min_cents)}`)
      if (b.deposit_max_cents !== null) parts.push(`max ${formatMoneyEUR(b.deposit_max_cents)}`)
      return parts.join(' · ')
    }
    return 'Variabile'
  }, [props.business])

  const approvalSummary = useMemo(() => {
    const b = props.business
    if (b.approval_mode === 'auto') return 'Auto'
    if (b.approval_mode === 'manual') return 'Manuale'
    return `In base al rischio (min ${b.required_reliability_min}/100)`
  }, [props.business])

  useEffect(() => {
    if (!showFloorPlans) return
    if (floorPlansLoading) return
    if (floorPlans.length > 0) return
    setFloorPlansLoading(true)
    setFloorPlansError(null)
    ;(async () => {
      try {
        const data = await getPublicFloorPlanBundle(props.business.id)
        setFloorPlans(data)
        setSelectedFloorPlanId((prev) => prev ?? data[0]?.floor_plan_id ?? null)
      } catch (e: unknown) {
        setFloorPlans([])
        setSelectedFloorPlanId(null)
        setFloorPlansError(errorMessage(e, 'Planimetria non disponibile.'))
      } finally {
        setFloorPlansLoading(false)
      }
    })()
  }, [floorPlans.length, floorPlansLoading, props.business.id, showFloorPlans])

  const selectedFloorPlan = useMemo(() => {
    if (!selectedFloorPlanId) return floorPlans[0] ?? null
    return floorPlans.find((p) => p.floor_plan_id === selectedFloorPlanId) ?? floorPlans[0] ?? null
  }, [floorPlans, selectedFloorPlanId])

  const floorPlanResources = useMemo(() => {
    const rows = selectedFloorPlan?.resources_json ?? []
    return rows.map((r) => ({ id: r.id, is_active: true, label: r.label }))
  }, [selectedFloorPlan?.resources_json])

  const weekdayLabels: Record<number, string> = useMemo(
    () => ({
      0: 'Dom',
      1: 'Lun',
      2: 'Mar',
      3: 'Mer',
      4: 'Gio',
      5: 'Ven',
      6: 'Sab',
    }),
    [],
  )

  const weeklyWindows = useMemo(() => {
    const rows = props.openingWindows ?? []
    const map = new Map<number, BusinessOpeningWindowRow[]>()
    for (const r of rows) {
      const wd = typeof r.weekday === 'number' ? r.weekday : -1
      if (wd < 0 || wd > 6) continue
      const arr = map.get(wd) ?? []
      arr.push(r)
      map.set(wd, arr)
    }
    for (const [k, arr] of map) {
      arr.sort((a, b) => a.start_time.localeCompare(b.start_time))
      map.set(k, arr)
    }
    return map
  }, [props.openingWindows])

  const nextClosure = useMemo(() => {
    const rows = props.closures ?? []
    const now = Date.now()
    const future = rows
      .map((c) => ({ ...c, startMs: new Date(c.start_at).getTime() }))
      .filter((c) => Number.isFinite(c.startMs) && c.startMs >= now)
      .sort((a, b) => a.startMs - b.startMs)
    return future[0] ?? null
  }, [props.closures])

  return (
    <div className="rounded-[2rem] border border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent p-6 shadow-2xl md:p-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-5">
          <MediaThumb
            src={props.business.logo_url}
            alt={`Logo ${props.business.name}`}
            fallbackLabel={props.business.name}
            containerClassName="h-20 w-20 shrink-0 text-3xl"
          />
          <div className="flex flex-col justify-center pt-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-white">{props.business.name}</h1>
              {props.business.is_paused && (
                <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-200">
                  In pausa
                </span>
              )}
            </div>
            <div className="mt-2 text-base font-medium text-white/70">{props.business.category}</div>
          </div>
        </div>
        <div className="flex flex-row items-center justify-between md:flex-col md:items-end rounded-2xl border border-white/5 bg-white/[0.02] p-4 md:p-0 md:border-none md:bg-transparent">
          <div className="flex items-center gap-1.5 text-lg font-bold text-white">
            <span className="text-amber-400">★</span> 
            {avgRating === null ? 'Nuovo' : avgRating.toFixed(1)}
          </div>
          <div className="mt-1 text-sm font-medium text-white/50">
            {props.reviews.length} {props.reviews.length === 1 ? 'recensione' : 'recensioni'}
          </div>
          {pub.show_trust_metrics ? (
            <>
              {repBadges.length ? (
                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  {repBadges.map((b) => (
                    <Badge key={b.key} tone={b.tone} className="px-2.5 py-1 text-[11px]">
                      {b.label}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {props.reputation ? (
                <div className="mt-3 grid max-w-[16rem] grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-medium text-white/55">
                  {responseTime ? (
                    <>
                      <div>Risposta</div>
                      <div className="text-right text-white/75">{responseTime}</div>
                    </>
                  ) : null}
                  {confirmPct ? (
                    <>
                      <div>Conferme</div>
                      <div className="text-right text-white/75">{confirmPct}</div>
                    </>
                  ) : null}
                  {cancelPct ? (
                    <>
                      <div>Cancel att.</div>
                      <div className="text-right text-white/75">{cancelPct}</div>
                    </>
                  ) : null}
                  {onTimePct ? (
                    <>
                      <div>Puntualità</div>
                      <div className="text-right text-white/75">{onTimePct}</div>
                    </>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-1 max-w-[14rem] text-right text-[10px] font-medium uppercase tracking-wide text-emerald-400/85 md:text-right">
                Solo dopo visite completate · max {REVIEW_WINDOW_DAYS}g
              </div>
            </>
          ) : null}
        </div>
      </div>

      {pub.show_gallery && props.business.gallery_urls?.length ? (
        <div className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold tracking-wide text-white/90">FOTO</div>
            <button
              type="button"
              onClick={() => {
                setGalleryIndex(0)
                setGalleryOpen(true)
              }}
              className="text-xs font-bold text-[#7D9BFF] hover:text-white transition-colors"
            >
              Vedi tutte ({props.business.gallery_urls.length})
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {props.business.gallery_urls.slice(0, 4).map((url, idx) => (
              <button
                key={url}
                type="button"
                onClick={() => {
                  setGalleryIndex(idx)
                  setGalleryOpen(true)
                }}
                className="group relative aspect-square overflow-hidden rounded-2xl bg-white/[0.04]"
              >
                <MediaThumb
                  src={url}
                  alt={`${props.business.name} — foto`}
                  fallbackLabel={props.business.name}
                  fill
                  zoom={false}
                  hoverScale
                  roundedClassName="!rounded-2xl"
                  containerClassName="absolute inset-0 h-full min-h-0 w-full"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/15 opacity-90 transition-opacity duration-300 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {pub.show_description ? (
        <div className="mt-8">
          <div className="text-sm font-semibold tracking-wide text-white/90">INFORMAZIONI</div>
          <div className="mt-3 rounded-2xl border border-white/5 bg-white/[0.02] p-5 text-base leading-relaxed text-white/70">
            {props.business.description || 'Nessuna descrizione disponibile per questa attività.'}
          </div>
        </div>
      ) : null}

      {pub.show_services && props.services && props.services.length > 0 ? (
        <div className="mt-8">
          <div className="text-sm font-semibold tracking-wide text-white/90">SERVIZI</div>
          <div className="mt-3 space-y-2">
            {props.services.map((s) => (
              <div key={s.id} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white/90 break-words">{s.name}</div>
                    <div className="mt-1 text-xs text-white/55">
                      {formatMinutes(s.duration_min)}
                      {typeof s.price_cents === 'number' ? ` · ${formatMoneyEUR(s.price_cents)}` : ''}
                    </div>
                  </div>
                </div>
                {s.description ? <div className="mt-2 text-sm text-white/70 leading-relaxed">{s.description}</div> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {pub.show_floor_plan_section ? (
        <div className="mt-8">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold tracking-wide text-white/90">PLANIMETRIA</div>
            <button
              type="button"
              onClick={() => setShowFloorPlans((v) => !v)}
              className="text-xs font-bold text-[#7D9BFF] hover:text-white transition-colors inline-flex items-center gap-2"
            >
              <LayoutGrid className="h-4 w-4" />
              {showFloorPlans ? 'Nascondi' : 'Mostra'}
            </button>
          </div>
          <div className="mt-3 rounded-2xl border border-white/5 bg-white/[0.02] p-5">
            {!showFloorPlans ? (
              <div className="text-sm text-white/60">
                Se disponibile, mostra la disposizione di tavoli/postazioni (solo lettura). La disponibilità si seleziona nel pannello prenotazione.
              </div>
            ) : floorPlansLoading ? (
              <div className="text-sm text-white/60">Caricamento planimetria…</div>
            ) : floorPlansError ? (
              <Alert tone="info">{floorPlansError}</Alert>
            ) : floorPlans.length === 0 ? (
              <div className="text-sm text-white/60">Nessuna planimetria pubblica disponibile.</div>
            ) : (
              <div className="space-y-3">
                {floorPlans.length > 1 ? (
                  <div className="flex flex-wrap gap-2">
                    {floorPlans.map((p) => {
                      const active = p.floor_plan_id === selectedFloorPlan?.floor_plan_id
                      return (
                        <button
                          key={p.floor_plan_id}
                          type="button"
                          onClick={() => setSelectedFloorPlanId(p.floor_plan_id)}
                          className={
                            active
                              ? 'rounded-xl border border-[#4F7CFF]/40 bg-[#4F7CFF]/10 px-3 py-1.5 text-xs font-semibold text-white'
                              : 'rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white'
                          }
                        >
                          {p.floor_plan_name}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
                {selectedFloorPlan ? (
                  <FloorPlanEditor
                    layoutJson={selectedFloorPlan.layout_json}
                    resources={floorPlanResources}
                    focusedResourceId={null}
                    occupiedResourceIds={[]}
                    backgroundUrl={null}
                    readOnly
                    onChange={() => {}}
                  />
                ) : null}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {(pub.show_location || pub.show_policy_block || pub.show_contact) && (
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {pub.show_location ? (
            <div className="flex flex-col rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-colors hover:bg-white/[0.04]">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#7D9BFF]">
                <MapPin className="h-4 w-4" />
                Posizione
              </div>
              <div className="mt-3 flex-1">
                <div className="text-base font-medium text-white">{props.business.address_text ?? 'Indirizzo non inserito'}</div>
                <div className="mt-1 text-sm text-white/60">{props.business.city ?? ''}</div>
              </div>
              <a
                href={googleMapsUrl(props.business)}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex w-max items-center rounded-xl bg-[#4F7CFF]/10 px-3 py-1.5 text-xs font-semibold text-[#7D9BFF] transition-colors hover:bg-[#4F7CFF]/20"
              >
                Apri in Maps
              </a>
            </div>
          ) : null}

          {pub.show_policy_block ? (
            <div className="flex flex-col rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-colors hover:bg-white/[0.04]">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                <ShieldAlert className="h-4 w-4" />
                Regole & policy
              </div>
              <div className="mt-3 flex-1 space-y-2.5 text-sm text-white/80">
                <div className="flex justify-between gap-2 border-b border-white/5 pb-2">
                  <span className="text-white/50">Cancellazione</span>
                  <span className="font-medium text-white">{props.business.cancellation_window_min} min prima</span>
                </div>
                <div className="flex justify-between gap-2 border-b border-white/5 pb-2">
                  <span className="text-white/50">Caparra</span>
                  <span className="font-medium text-white text-right">{depositSummary}</span>
                </div>
                <div className="flex justify-between gap-2 pb-1">
                  <span className="text-white/50">Approvazione</span>
                  <span className="font-medium text-white text-right">{approvalSummary}</span>
                </div>
              </div>
              {props.business.deposit_enabled && props.business.deposit_rule === 'risky_only' && (
                <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5 text-[11px] leading-relaxed text-amber-200/80">
                  Caparra richiesta solo per clienti con affidabilità inferiore a {props.business.deposit_risky_threshold}/100
                </div>
              )}
            </div>
          ) : null}

          {pub.show_contact ? (
            <div className="flex flex-col rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-colors hover:bg-white/[0.04]">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/50">
                Contatti
              </div>
              <div className="mt-3 flex-1 space-y-4">
                {props.business.phone && (
                  <a href={`tel:${props.business.phone}`} className="group flex items-center gap-3 text-sm text-white/80 transition-colors hover:text-white">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
                      <Phone className="h-4 w-4" />
                    </div>
                    {props.business.phone}
                  </a>
                )}
                {props.business.email && (
                  <a href={`mailto:${props.business.email}`} className="group flex items-center gap-3 text-sm text-white/80 transition-colors hover:text-white">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
                      <Mail className="h-4 w-4" />
                    </div>
                    {props.business.email}
                  </a>
                )}
                {props.business.website && (
                  <a href={props.business.website} target="_blank" rel="noreferrer" className="group flex items-center gap-3 text-sm text-white/80 transition-colors hover:text-white">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 group-hover:bg-white/10 transition-colors">
                      <Globe className="h-4 w-4" />
                    </div>
                    Sito web
                  </a>
                )}
                {!props.business.phone && !props.business.email && !props.business.website && (
                  <div className="text-sm text-white/50 italic">Nessun contatto disponibile</div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

      {pub.show_opening_hours ? (
      <div className="mt-8 rounded-2xl border border-white/5 bg-white/[0.02] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-white/60">Orari</div>
            <div className="mt-1 text-xs text-white/50">Gli orari sono indicativi: verifica eventuali chiusure straordinarie.</div>
          </div>
          {nextClosure ? (
            <div className="text-right text-xs text-amber-200/90">
              <div className="font-semibold">Chiusura</div>
              <div className="text-[11px] text-white/60">{formatDateTime(nextClosure.start_at)} → {formatDateTime(nextClosure.end_at)}</div>
            </div>
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-7">
          {Object.keys(weekdayLabels)
            .map((k) => Number(k))
            .map((wd) => {
              const ranges = weeklyWindows.get(wd) ?? []
              return (
                <div key={wd} className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <div className="text-xs font-semibold text-white/70">{weekdayLabels[wd]}</div>
                  {ranges.length === 0 ? (
                    <div className="mt-1 text-[11px] text-white/40">—</div>
                  ) : (
                    <div className="mt-1 space-y-1">
                      {ranges.map((w) => (
                        <div key={w.id} className="text-[11px] font-medium text-white/70">
                          {w.start_time.slice(0, 5)}–{w.end_time.slice(0, 5)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </div>
      ) : null}

      {pub.show_gallery ? (
      <Modal
        open={galleryOpen}
        title="Foto"
        description={props.business.name}
        onClose={() => setGalleryOpen(false)}
        className="max-w-5xl"
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/30">
              <MediaThumb
                src={props.business.gallery_urls[galleryIndex] ?? null}
                alt={`${props.business.name} — foto`}
                fallbackLabel={props.business.name}
                fill
                zoom
                roundedClassName="!rounded-2xl"
                containerClassName="absolute inset-0 h-full min-h-0 w-full"
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={galleryIndex <= 0}
                onClick={() => setGalleryIndex((i) => Math.max(0, i - 1))}
              >
                Precedente
              </Button>
              <div className="text-xs text-white/60">
                {Math.min(props.business.gallery_urls.length, galleryIndex + 1)} / {props.business.gallery_urls.length}
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={galleryIndex >= props.business.gallery_urls.length - 1}
                onClick={() => setGalleryIndex((i) => Math.min(props.business.gallery_urls.length - 1, i + 1))}
              >
                Successiva
              </Button>
            </div>
          </div>
          <div className="lg:col-span-4">
            <div className="grid max-h-[420px] grid-cols-3 gap-2 overflow-auto rounded-2xl border border-white/10 bg-black/10 p-2">
              {props.business.gallery_urls.map((url, idx) => {
                const active = idx === galleryIndex
                return (
                  <button
                    key={`${url}_${idx}`}
                    type="button"
                    onClick={() => setGalleryIndex(idx)}
                    className={
                      active
                        ? 'relative aspect-square overflow-hidden rounded-xl border border-[#4F7CFF]/40 bg-[#4F7CFF]/10'
                        : 'relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/5 hover:bg-white/10'
                    }
                  >
                    <MediaThumb
                      src={url}
                      alt={`${props.business.name} — miniatura`}
                      fallbackLabel={props.business.name}
                      fill
                      zoom={false}
                      roundedClassName="!rounded-xl"
                      containerClassName="absolute inset-0 h-full min-h-0 w-full"
                    />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </Modal>
      ) : null}

      {pub.show_interactive_map ? (
      <div className="mt-8 overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/5">
        {!showMap ? (
          <div className="flex h-[240px] items-center justify-center p-6 text-center bg-gradient-to-br from-white/5 to-transparent">
            <div className="max-w-sm">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#4F7CFF]/10">
                <MapPin className="h-6 w-6 text-[#7D9BFF]" />
              </div>
              <div className="text-base font-semibold text-white">Mappa interattiva</div>
              <div className="mt-1.5 text-sm text-white/60">
                Carica la mappa solo se ne hai bisogno, per navigare più velocemente.
              </div>
              <button
                type="button"
                onClick={() => setShowMap(true)}
                className="mt-5 inline-flex items-center justify-center rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20"
              >
                Carica mappa
              </button>
            </div>
          </div>
        ) : (
          <div className="h-[300px]">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-sm font-medium text-white/50">
                  Caricamento mappa...
                </div>
              }
            >
              <BusinessMap business={props.business} />
            </Suspense>
          </div>
        )}
      </div>
      ) : null}

      {pub.show_reviews ? (
      <div className="mt-10">
        <div className="flex flex-col gap-1 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold tracking-wide text-white/90">RECENSIONI DEI CLIENTI</div>
            <div className="mt-1 text-[11px] font-medium text-white/45">
              Solo cliente→attività dopo visita verificata · media sul periodo degli ultimi {REVIEW_WINDOW_DAYS} giorni
            </div>
          </div>
          {props.reviews.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAllReviews((v) => !v)}
              className="text-xs font-bold text-[#7D9BFF] hover:text-white transition-colors"
            >
              {showAllReviews ? 'Mostra meno' : 'Vedi tutte'}
            </button>
          )}
        </div>
        
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {visibleReviews.map((r) => (
            <div
              key={r.id}
              className="rounded-2xl border border-white/5 bg-white/[0.02] p-5 transition-colors hover:bg-white/[0.04]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-sm font-bold text-white">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  {r.rating}.0
                </div>
                <div className="text-xs font-medium text-white/40">{formatDateTime(r.created_at)}</div>
              </div>
              {r.comment && <div className="mt-3 text-sm leading-relaxed text-white/80">{r.comment}</div>}
              {props.reportCustomerReviewsEnabled && props.onReportCustomerReview ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={() => props.onReportCustomerReview?.(r.id)}
                >
                  Segnala contenuto
                </Button>
              ) : null}
            </div>
          ))}
          {props.reviews.length === 0 && (
            <div className="sm:col-span-2 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm font-medium text-white/50">
              Nessuna recensione ancora per questa attività.
            </div>
          )}
        </div>
      </div>
      ) : null}
    </div>
  )
}
