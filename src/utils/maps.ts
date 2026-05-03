import type { BusinessRow } from '@/domain/supabase'

export function googleMapsUrl(b: Pick<BusinessRow, 'name' | 'address_text' | 'city'>): string {
  const q = encodeURIComponent(`${b.name} ${b.address_text ?? ''} ${b.city ?? ''}`.trim())
  return `https://www.google.com/maps/search/?api=1&query=${q}`
}

