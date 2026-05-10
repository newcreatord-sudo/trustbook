import type { BusinessRow } from '@/domain/supabase'
import { formatMoneyEUR } from '@/utils/time'

export type ReviewLite = { business_id: string; rating: number }

export type BusinessTextIndex = Pick<
  BusinessRow,
  'name' | 'description' | 'address_text' | 'postal_code' | 'city' | 'category'
>

export function matchBusiness(b: BusinessTextIndex, q: string): boolean {
  const s = q.trim().toLowerCase()
  if (!s) return true
  return (
    b.name.toLowerCase().includes(s) ||
    (b.description ?? '').toLowerCase().includes(s) ||
    (b.address_text ?? '').toLowerCase().includes(s) ||
    (b.postal_code ?? '').toLowerCase().includes(s) ||
    (b.city ?? '').toLowerCase().includes(s) ||
    b.category.toLowerCase().includes(s)
  )
}

/** Allinea ai giorni salvati in `business_opening_windows.weekday` (PostgreSQL EXTRACT(DOW): 0=domenica … 6=sabato). */
export function openingWindowWeekdayJs(d: Date): number {
  return d.getDay()
}

export function computeDepositSummary(b: BusinessRow): string {
  if (!b.deposit_enabled || b.deposit_rule === 'off') return 'Nessuna'
  if (b.deposit_fixed_cents !== null) return formatMoneyEUR(b.deposit_fixed_cents)
  if (b.deposit_percent !== null) {
    const parts: string[] = [`${b.deposit_percent}%`]
    if (b.deposit_min_cents !== null) parts.push(`min ${formatMoneyEUR(b.deposit_min_cents)}`)
    if (b.deposit_max_cents !== null) parts.push(`max ${formatMoneyEUR(b.deposit_max_cents)}`)
    return parts.join(' · ')
  }
  return 'Variabile'
}

export function computeAvgRating(rows: ReviewLite[], businessId: string): { avg: number | null; count: number } {
  const businessReviews = rows.filter((r) => r.business_id === businessId)
  if (!businessReviews.length) return { avg: null, count: 0 }
  const sum = businessReviews.reduce((a, r) => a + r.rating, 0)
  return { avg: sum / businessReviews.length, count: businessReviews.length }
}

export function topCategories(businesses: BusinessRow[], max: number): Array<{ category: string; count: number }> {
  const counts = new Map<string, number>()
  for (const b of businesses) {
    const k = String(b.category ?? '').trim()
    if (!k) continue
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category))
    .slice(0, Math.max(0, Math.min(12, Math.floor(max))))
}
