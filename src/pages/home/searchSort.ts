import type { BusinessRow } from '@/domain/supabase'

export type BusinessSortKey = 'relevance' | 'distance' | 'rating' | 'newest'

export function relevanceScore(b: BusinessRow, q: string): number {
  const s = q.trim().toLowerCase()
  if (!s) return 0
  const name = b.name.toLowerCase()
  const cat = b.category.toLowerCase()
  const city = (b.city ?? '').toLowerCase()
  const addr = (b.address_text ?? '').toLowerCase()

  let score = 0
  if (name.startsWith(s)) score += 6
  if (name.includes(s)) score += 3
  if (cat.includes(s)) score += 2
  if (city.includes(s)) score += 1
  if (addr.includes(s)) score += 1
  return score
}

