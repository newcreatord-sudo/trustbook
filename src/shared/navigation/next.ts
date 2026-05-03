export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null
  const v = String(next).trim()
  if (!v) return null
  if (!v.startsWith('/')) return null
  if (v.startsWith('//')) return null
  if (v.includes('://')) return null
  return v
}

export function encodeNext(next: string | null): string {
  return next ? encodeURIComponent(next) : ''
}

