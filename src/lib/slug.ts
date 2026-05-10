export function toBusinessSlug(raw: string): string {
  const s = raw
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return s
}

export function isValidBusinessSlug(slug: string): boolean {
  if (!slug) return false
  if (slug.length < 3 || slug.length > 90) return false
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
}

