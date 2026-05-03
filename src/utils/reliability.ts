export type StarTier = 'nessuna' | 'bronzo' | 'argento' | 'oro'

export function clampScore(v: number): number {
  if (Number.isNaN(v)) return 0
  return Math.max(0, Math.min(100, Math.round(v)))
}

export function tierFromStars(stars: number): StarTier {
  const s = Math.max(0, Math.floor(stars))
  if (s >= 5) return 'oro'
  if (s >= 2) return 'argento'
  if (s >= 1) return 'bronzo'
  return 'nessuna'
}

export function starBoostPoints(stars: number): number {
  const tier = tierFromStars(stars)
  if (tier === 'oro') return 10
  if (tier === 'argento') return 6
  if (tier === 'bronzo') return 3
  return 0
}

export function antiNoShowPenaltyPoints(params: { noShowCount?: number | null; lateCancelCount?: number | null }): number {
  const noShow = Math.max(0, Math.floor(params.noShowCount ?? 0))
  const late = Math.max(0, Math.floor(params.lateCancelCount ?? 0))
  const noShowPenalty = Math.min(25, noShow * 12)
  const latePenalty = Math.min(12, late * 4)
  return noShowPenalty + latePenalty
}

export function computeEffectiveReliability(params: {
  baseScore: number | null
  stars?: number | null
  noShowCount?: number | null
  lateCancelCount?: number | null
}): {
  baseScore: number
  effectiveScore: number
  stars: number
  tier: StarTier
  boost: number
  penalty: number
} {
  const base = clampScore(params.baseScore ?? 80)
  const stars = Math.max(0, Math.floor(params.stars ?? 0))
  const boost = starBoostPoints(stars)
  const penalty = antiNoShowPenaltyPoints({
    noShowCount: params.noShowCount,
    lateCancelCount: params.lateCancelCount,
  })
  const effective = clampScore(base + boost - penalty)
  return {
    baseScore: base,
    effectiveScore: effective,
    stars,
    tier: tierFromStars(stars),
    boost,
    penalty,
  }
}



