export type BusinessPublicReputation = {
  business_id: string
  window_days: number
  avg_rating: number
  review_count: number
  confirmed_rate: number | null
  cancelled_by_business_rate: number | null
  response_time_avg_minutes: number | null
  on_time_rate: number | null
  computed_at: string
}

export type TrustBadge = {
  key: string
  label: string
  tone: 'neutral' | 'info' | 'success' | 'warning'
}

export function parseBusinessPublicReputationRpcRow(raw: unknown): BusinessPublicReputation | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const business_id = typeof r.business_id === 'string' ? r.business_id : null
  const window_days = typeof r.window_days === 'number' ? r.window_days : null
  const avg_rating = typeof r.avg_rating === 'number' ? r.avg_rating : null
  const review_count = typeof r.review_count === 'number' ? r.review_count : null
  const confirmed_rate = typeof r.confirmed_rate === 'number' ? r.confirmed_rate : null
  const cancelled_by_business_rate = typeof r.cancelled_by_business_rate === 'number' ? r.cancelled_by_business_rate : null
  const response_time_avg_minutes = typeof r.response_time_avg_minutes === 'number' ? r.response_time_avg_minutes : null
  const on_time_rate = typeof r.on_time_rate === 'number' ? r.on_time_rate : null
  const computed_at = typeof r.computed_at === 'string' ? r.computed_at : null

  if (!business_id || window_days === null || avg_rating === null || review_count === null || !computed_at) return null
  return {
    business_id,
    window_days,
    avg_rating,
    review_count,
    confirmed_rate,
    cancelled_by_business_rate,
    response_time_avg_minutes,
    on_time_rate,
    computed_at,
  }
}

export function formatPercent01(v: number | null): string | null {
  if (v === null || !Number.isFinite(v)) return null
  const pct = Math.max(0, Math.min(1, v)) * 100
  return `${Math.round(pct)}%`
}

export function formatMinutes(v: number | null): string | null {
  if (v === null || !Number.isFinite(v) || v < 0) return null
  if (v < 1) return '<1 min'
  if (v < 60) return `${Math.round(v)} min`
  const h = Math.floor(v / 60)
  const m = Math.round(v % 60)
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

export function computeTrustBadges(rep: BusinessPublicReputation | null): TrustBadge[] {
  if (!rep) return []
  const badges: TrustBadge[] = []

  if (rep.review_count >= 10 && rep.avg_rating >= 4.6) {
    badges.push({ key: 'top_rated', label: 'Top rated', tone: 'success' })
  } else if (rep.review_count >= 3 && rep.avg_rating >= 4.2) {
    badges.push({ key: 'great_reviews', label: 'Ottime recensioni', tone: 'success' })
  } else if (rep.review_count < 3) {
    badges.push({ key: 'new', label: 'Nuova su TrustBook', tone: 'neutral' })
  }

  if (rep.response_time_avg_minutes !== null && rep.response_time_avg_minutes <= 60) {
    badges.push({ key: 'fast_response', label: 'Risposta veloce', tone: 'info' })
  }

  if (rep.confirmed_rate !== null && rep.confirmed_rate >= 0.85) {
    badges.push({ key: 'high_confirm', label: 'Alta conferma', tone: 'success' })
  }

  if (rep.cancelled_by_business_rate !== null && rep.cancelled_by_business_rate <= 0.05) {
    badges.push({ key: 'low_cancels', label: 'Basse cancellazioni', tone: 'success' })
  }

  if (rep.on_time_rate !== null && rep.on_time_rate >= 0.8) {
    badges.push({ key: 'on_time', label: 'Puntuale', tone: 'success' })
  }

  return badges.slice(0, 5)
}

