import { Globe, Mail, MapPin, Phone, ShieldAlert, Star } from 'lucide-react'
import { Suspense, lazy, useMemo, useState } from 'react'
import type { BusinessRow, ReviewPublicRow } from '@/domain/supabase'
import { REVIEW_WINDOW_DAYS } from '@/lib/reviewEligibility'
import Badge from '@/shared/ui/Badge'
import Button from '@/shared/ui/Button'
import {
  computeTrustBadges,
  formatMinutes,
  formatPercent01,
  type BusinessPublicReputation,
} from '@/lib/businessReputation'
import { formatDateTime, formatMoneyEUR } from '@/utils/time'
import { googleMapsUrl } from '@/utils/maps'

const BusinessMap = lazy(() => import('@/components/BusinessMap'))

export default function BusinessInfo(props: {
  business: BusinessRow
  reviews: ReviewPublicRow[]
  reputation?: BusinessPublicReputation | null
  /** Owner/staff dell’attività possono segnalare testi pubblici cliente→business. */
  reportCustomerReviewsEnabled?: boolean
  onReportCustomerReview?: (reviewId: string) => void
}) {
  const [showAllReviews, setShowAllReviews] = useState(false)
  const [showMap, setShowMap] = useState(false)
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

  return (
    <div className="rounded-[2rem] border border-white/5 bg-gradient-to-b from-white/[0.04] to-transparent p-6 shadow-2xl md:p-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-5">
          {props.business.logo_url ? (
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-lg">
              <img src={props.business.logo_url} alt="Logo" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 shadow-lg">
              <span className="text-3xl font-bold text-white/40">{props.business.name.charAt(0).toUpperCase()}</span>
            </div>
          )}
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
        </div>
      </div>

      {props.business.gallery_urls?.length ? (
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {props.business.gallery_urls.slice(0, 4).map((url) => (
            <div key={url} className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 aspect-square">
              <img src={url} alt="Foto" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
              <div className="absolute inset-0 bg-black/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-8">
        <div className="text-sm font-semibold tracking-wide text-white/90">INFORMAZIONI</div>
        <div className="mt-3 rounded-2xl border border-white/5 bg-white/[0.02] p-5 text-base leading-relaxed text-white/70">
          {props.business.description || 'Nessuna descrizione disponibile per questa attività.'}
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
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
      </div>

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
    </div>
  )
}
