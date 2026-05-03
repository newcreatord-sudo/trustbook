import { Link } from 'react-router-dom'
import { MapPinned, Star, ChevronRight, ShieldCheck, Zap, Euro, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BusinessRow } from '@/domain/supabase'
import { computeDepositSummary } from '@/pages/home/homeLogic'
import { formatMoneyEUR } from '@/utils/time'

export default function BusinessResultCard(props: {
  business: BusinessRow
  active: boolean
  distanceKm: number | null
  avgRating: number | null
  reviewCount: number
  avgPrice?: number | null
  hasToday?: boolean
  userId: string | null
  isFav: boolean
  onSelect: () => void
  onToggleFavorite: () => void
}) {
  const b = props.business
  const depositSummary = computeDepositSummary(b)
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
          <Link to={`/attivita/${encodeURIComponent(b.id)}`} className="shrink-0">
            {b.logo_url ? (
              <div className="h-16 w-16 overflow-hidden rounded-2xl border border-white/10 bg-white/5 transition-transform duration-300 group-hover:scale-105 group-hover:shadow-lg">
                <img src={b.logo_url} alt={b.name} className="h-full w-full object-cover" />
              </div>
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 transition-transform duration-300 group-hover:scale-105 group-hover:shadow-lg">
                <span className="text-xl font-bold text-white/40">{b.name.charAt(0).toUpperCase()}</span>
              </div>
            )}
          </Link>
          <div className="flex min-w-0 flex-1 flex-col justify-center pt-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/attivita/${encodeURIComponent(b.id)}`}
                className="break-words text-lg font-bold tracking-tight text-white hover:text-[#4F7CFF] transition-colors"
              >
                {b.name}
              </Link>
              {b.is_paused && (
                <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-200">
                  In pausa
                </span>
              )}
            </div>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-sm text-white/60">
              <span className="max-w-full break-words font-medium text-white/80">{b.category}</span>
              <span>•</span>
              <span>{b.city ?? '—'}</span>
              {props.distanceKm !== null && (
                <>
                  <span>•</span>
                  <span>{props.distanceKm.toFixed(1)} km</span>
                </>
              )}
              {props.avgPrice !== null && props.avgPrice !== undefined && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-0.5"><Euro className="h-3 w-3" /> {formatMoneyEUR(props.avgPrice)}</span>
                </>
              )}
            </div>

            {/* Tags / Trust Indicators */}
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {props.hasToday && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  <CalendarClock className="h-3 w-3" /> Prenotabile oggi
                </span>
              )}
              {b.approval_mode === 'auto' && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] font-semibold text-blue-400">
                  <Zap className="h-3 w-3" /> Conferma imm.
                </span>
              )}
              {props.avgRating && props.avgRating >= 4.8 && props.reviewCount > 10 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                  <Star className="h-3 w-3 fill-amber-400" /> Alta affidabilità
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-row items-center justify-between sm:flex-col sm:items-end sm:gap-2 w-full sm:w-auto mt-2 sm:mt-0 pt-4 sm:pt-0 border-t border-white/5 sm:border-0">
          <div className="flex flex-col sm:items-end">
            <div className="flex items-center gap-1.5">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="font-bold text-white">
                {props.avgRating === null ? 'Nuovo' : props.avgRating.toFixed(1)}
              </span>
              <span className="text-xs text-white/50">
                ({props.reviewCount})
              </span>
            </div>
            {b.deposit_enabled && (
              <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-[#4F7CFF]/20 bg-[#4F7CFF]/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-[#7D9BFF]">
                <ShieldCheck className="h-3 w-3" />
                {depositSummary}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 sm:flex-nowrap">
        <div className="flex items-center gap-2">
          {props.userId && (
            <button
              type="button"
              onClick={props.onToggleFavorite}
              className={cn(
                'group/btn inline-flex h-9 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-all',
                props.isFav
                  ? 'border-transparent bg-[#4F7CFF]/15 text-[#7D9BFF] hover:bg-[#4F7CFF]/25'
                  : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10 hover:text-white',
              )}
            >
              <Star className={cn('h-4 w-4 transition-transform group-hover/btn:scale-110', props.isFav && 'fill-[#7D9BFF] text-[#7D9BFF]')} />
              <span className="hidden sm:inline">{props.isFav ? 'Salvato' : 'Salva'}</span>
            </button>
          )}
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
          to={`/attivita/${encodeURIComponent(b.id)}`}
          className={cn(
            'inline-flex h-9 flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold transition-all',
            b.is_paused 
              ? 'cursor-not-allowed bg-white/5 text-white/40 border border-white/5' 
              : 'bg-white text-black hover:bg-white/90 hover:scale-[1.02] shadow-lg shadow-white/10',
          )}
          aria-disabled={b.is_paused}
        >
          {b.is_paused ? 'In pausa' : 'Vedi disponibilità'}
          {!b.is_paused && <ChevronRight className="h-4 w-4 opacity-50" />}
        </Link>
      </div>
    </div>
  )
}

