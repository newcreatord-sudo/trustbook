import type { BusinessRow } from '@/domain/supabase'

export function businessPublicPath(b: Pick<BusinessRow, 'id' | 'slug'>): string {
  const slug = b.slug?.trim()
  if (slug) return `/b/${encodeURIComponent(slug)}`
  return `/attivita/${encodeURIComponent(b.id)}`
}

