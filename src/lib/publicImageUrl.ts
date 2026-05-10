/**
 * Normalizza URL pubblici sicuri per logo/galleria/anteprima (solo http/https).
 * Blocca javascript:, data:, file:, ecc.
 */
export function sanitizePublicHttpUrl(input: string | null | undefined): string | null {
  const s = typeof input === 'string' ? input.trim() : ''
  if (!s) return null
  let url: URL
  try {
    url = new URL(s)
  } catch {
    return null
  }
  const proto = url.protocol.toLowerCase()
  if (proto !== 'http:' && proto !== 'https:') return null
  return url.href
}
