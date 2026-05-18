import { ShieldCheck, ShieldAlert, Shield, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { computeTrustTier, type TrustTier } from '@/components/trust/trustTier.logic'

export type { TrustTier } from '@/components/trust/trustTier.logic'

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
