import { Link } from 'react-router-dom'
import { MapPinned, ChevronRight, Phone, Mail, Globe } from 'lucide-react'
import { cn } from '@/lib/utils'
import MediaThumb from '@/shared/ui/MediaThumb'
import type { ExternalBusinessListingRow } from '@/domain/supabase'

function isFreshContact(iso: string | null, maxAgeDays: number): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return false
  return Date.now() - t <= maxAgeDays * 24 * 60 * 60 * 1000
}

function formatCategoryLabel(raw: string): string {
  const s = String(raw ?? '').trim()
  if (!s) return '—'
  return s
    .split('_')
    .filter(Boolean)
    .map((x) => x.slice(0, 1).toUpperCase() + x.slice(1))
    .join(' ')
}

function formatSourceLabel(raw: string): string {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return 'Fonte pubblica/partner'
  if (s === 'openstreetmap') return 'OpenStreetMap'
  return raw
}

export default function ExternalListingResultCard(props: {
  listing: ExternalBusinessListingRow
  active: boolean
  distanceKm: number | null
  onSelect: () => void
}) {
  const l = props.listing
  const isClaimed = Boolean(l.claimed_business_id)
  const hasFreshContact = isFreshContact(l.data_checked_at, 180)
  const hasAnyContact = Boolean(l.phone?.trim() || l.email?.trim() || l.website?.trim())
  const showContact = hasFreshContact && hasAnyContact
  const path = isClaimed ? `/attivita/${encodeURIComponent(l.claimed_business_id as string)}` : `/scheda/${encodeURIComponent(l.slug)}`
  const sourceLabel = formatSourceLabel(l.source)
  const categoryLabel = formatCategoryLabel(l.category)

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-3xl border p-5 transition-all duration-300',
        props.active
          ? 'border-[#4F7CFF]/50 bg-gradient-to-br from-[#4F7CFF]/10 to-transparent shadow-[0_0_30px_-10px_rgba(79,124,255,0.3)]'
          : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04] shadow-lg',
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between min-w-0">
        <div className="flex min-w-0 items-start gap-4">
          <Link to={path} className="shrink-0">
            <MediaThumb
              src={null}
              alt={l.name}
              fallbackLabel={l.name}
              containerClassName="h-16 w-16 text-xl"
              interactiveLift
            />
          </Link>
          <div className="flex min-w-0 flex-1 flex-col justify-center pt-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={path} className="break-words text-lg font-bold tracking-tight text-white hover:text-[#4F7CFF] transition-colors">
                {l.name}
              </Link>
              {isClaimed ? (
                <>
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/70">
                    Gestita dal titolare
                  </span>
                  <span className="inline-flex items-center rounded-full border border-[#4F7CFF]/30 bg-[#4F7CFF]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/80">
                    TrustBook
                  </span>
                </>
              ) : (
                <>
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/70">
                    Non verificata
                  </span>
                  <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/50">
                    Directory
                  </span>
                </>
              )}
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-sm text-white/60">
              <span className="max-w-full break-words font-medium text-white/80">{categoryLabel}</span>
              <span>•</span>
              <span>{l.city ?? '—'}</span>
              {props.distanceKm !== null && (
                <>
                  <span>•</span>
                  <span>{props.distanceKm.toFixed(1)} km</span>
                </>
              )}
            </div>

            {showContact ? (
              <div className="mt-2.5 flex flex-wrap gap-2 text-xs text-white/70">
                {l.phone?.trim() && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1">
                    <Phone className="h-3 w-3" />
                    {l.phone.trim()}
                  </span>
                )}
                {l.email?.trim() && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1">
                    <Mail className="h-3 w-3" />
                    {l.email.trim()}
                  </span>
                )}
                {l.website?.trim() && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1">
                    <Globe className="h-3 w-3" />
                    {l.website.trim()}
                  </span>
                )}
              </div>
            ) : (
              <div className="mt-2.5 space-y-1 text-xs text-white/50">
                <div>{isClaimed ? 'Profilo gestito su TrustBook.' : `Fonte: ${sourceLabel}`}</div>
                <div>Contatti mostrati solo quando verificati e aggiornati di recente.</div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 sm:flex-nowrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={props.onSelect}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-white/70 transition-all hover:border-white/20 hover:bg-white/10 hover:text-white"
          >
            <MapPinned className="h-4 w-4" />
            <span className="hidden sm:inline">Mappa</span>
          </button>
        </div>

        <Link
          to={path}
          className="inline-flex h-9 flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl bg-white text-black hover:bg-white/90 hover:scale-[1.02] px-4 text-xs font-bold transition-all shadow-lg shadow-white/10"
        >
          {isClaimed ? 'Apri attività' : 'Vedi scheda'}
          <ChevronRight className="h-4 w-4 opacity-50" />
        </Link>
      </div>
    </div>
  )
}
