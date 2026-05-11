import { ShieldCheck, ShieldAlert, Shield, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export type TrustTier = 'newcomer' | 'reliable' | 'verified' | 'champion' | 'at-risk' | 'blocked'

type Props = {
  score: number | null | undefined
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  /** Optional: number of completed bookings used to qualify "verified"/"champion" tiers. */
  completedBookings?: number | null
  /** Optional: number of no-shows; if > 0 we never show "champion". */
  noShowCount?: number | null
  className?: string
}

/**
 * Translates a reliability score (0..100) into a human-friendly tier badge.
 *
 * Why not just show the raw score: numbers without context create anxiety
 * and don't communicate progression. Tiers gamify positive behavior and
 * align with the anti-no-show engine thresholds (red/yellow/green).
 *
 *  - "newcomer"     : insufficient history (< 3 bookings)
 *  - "reliable"     : score >= 70 and no-shows <= 1
 *  - "verified"     : score >= 85 and bookings >= 5
 *  - "champion"     : score >= 95 and bookings >= 15 and no-shows == 0
 *  - "at-risk"      : score 50..69 or 1 recent no-show
 *  - "blocked"      : score < 50
 */
export function computeTrustTier(input: {
  score: number | null | undefined
  completedBookings?: number | null
  noShowCount?: number | null
}): { tier: TrustTier; label: string; description: string } {
  const s = typeof input.score === 'number' && Number.isFinite(input.score) ? input.score : null
  const bookings = typeof input.completedBookings === 'number' ? input.completedBookings : 0
  const noShows = typeof input.noShowCount === 'number' ? input.noShowCount : 0

  if (s === null || bookings < 3) {
    return {
      tier: 'newcomer',
      label: 'Nuovo',
      description: 'Costruisci la tua reputazione: presentati alle prime prenotazioni per sbloccare i tier.',
    }
  }
  if (s < 50) {
    return {
      tier: 'blocked',
      label: 'Bloccato',
      description: 'Affidabilità molto bassa: alcune attività potrebbero rifiutare la prenotazione.',
    }
  }
  if (s < 70) {
    return {
      tier: 'at-risk',
      label: 'A rischio',
      description: 'Mantieni gli appuntamenti per recuperare punteggio. Le caparre potrebbero essere richieste.',
    }
  }
  if (s >= 95 && bookings >= 15 && noShows === 0) {
    return {
      tier: 'champion',
      label: 'Campione',
      description: 'Reputazione massima. Niente caparre quando non richieste dalla policy del business.',
    }
  }
  if (s >= 85 && bookings >= 5) {
    return {
      tier: 'verified',
      label: 'Verificato',
      description: 'Storico solido. Le attività più severe ti accettano senza caparra extra.',
    }
  }
  return {
    tier: 'reliable',
    label: 'Affidabile',
    description: 'Buon punteggio. Continua così per accedere alle prossime soglie.',
  }
}

const TIER_STYLE: Record<TrustTier, { ring: string; bg: string; text: string; icon: React.ReactNode }> = {
  newcomer: {
    ring: 'ring-1 ring-white/15',
    bg: 'bg-white/[0.06]',
    text: 'text-white/85',
    icon: <Shield className="h-4 w-4" aria-hidden />,
  },
  reliable: {
    ring: 'ring-1 ring-sky-400/30',
    bg: 'bg-sky-400/15',
    text: 'text-sky-200',
    icon: <ShieldCheck className="h-4 w-4" aria-hidden />,
  },
  verified: {
    ring: 'ring-1 ring-emerald-400/35',
    bg: 'bg-emerald-400/15',
    text: 'text-emerald-200',
    icon: <ShieldCheck className="h-4 w-4" aria-hidden />,
  },
  champion: {
    ring: 'ring-1 ring-amber-300/35',
    bg: 'bg-amber-300/15',
    text: 'text-amber-200',
    icon: <Sparkles className="h-4 w-4" aria-hidden />,
  },
  'at-risk': {
    ring: 'ring-1 ring-amber-400/35',
    bg: 'bg-amber-400/15',
    text: 'text-amber-200',
    icon: <ShieldAlert className="h-4 w-4" aria-hidden />,
  },
  blocked: {
    ring: 'ring-1 ring-rose-400/40',
    bg: 'bg-rose-400/15',
    text: 'text-rose-200',
    icon: <ShieldAlert className="h-4 w-4" aria-hidden />,
  },
}

export default function TrustTierBadge({
  score,
  size = 'md',
  showLabel = true,
  completedBookings,
  noShowCount,
  className,
}: Props) {
  const { tier, label, description } = computeTrustTier({ score, completedBookings, noShowCount })
  const s = TIER_STYLE[tier]
  const sizeCls =
    size === 'sm' ? 'px-2 py-1 text-[11px]' : size === 'lg' ? 'px-3 py-2 text-sm' : 'px-2.5 py-1.5 text-xs'

  return (
    <span
      role="status"
      title={description}
      aria-label={`Reputazione: ${label}. ${description}`}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-semibold tracking-tight',
        sizeCls,
        s.ring,
        s.bg,
        s.text,
        className,
      )}
    >
      {s.icon}
      {showLabel ? <span>{label}</span> : null}
      {typeof score === 'number' && Number.isFinite(score) && tier !== 'newcomer' ? (
        <span className="opacity-70">· {Math.round(score)}</span>
      ) : null}
    </span>
  )
}
