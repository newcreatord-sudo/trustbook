/** Helpers to compose schema.org payloads (pure data, no DOM). */

export function buildLocalBusinessSchema(input: {
  baseUrl: string
  slug: string
  name: string
  description?: string | null
  image?: string | null
  category?: string | null
  phone?: string | null
  email?: string | null
  addressText?: string | null
  city?: string | null
  postalCode?: string | null
  region?: string | null
  lat?: number | null
  lng?: number | null
  ratingValue?: number | null
  ratingCount?: number | null
  priceRange?: string | null
}): object {
  const base = input.baseUrl.replace(/\/+$/, '')
  const node: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${base}/attivita/${input.slug}#business`,
    name: input.name,
    url: `${base}/attivita/${input.slug}`,
  }
  if (input.description) node.description = input.description
  if (input.image) node.image = input.image
  if (input.category) node.category = input.category
  if (input.phone) node.telephone = input.phone
  if (input.email) node.email = input.email
  if (input.priceRange) node.priceRange = input.priceRange
  if (input.addressText || input.city || input.postalCode || input.region) {
    node.address = {
      '@type': 'PostalAddress',
      streetAddress: input.addressText ?? undefined,
      addressLocality: input.city ?? undefined,
      postalCode: input.postalCode ?? undefined,
      addressRegion: input.region ?? undefined,
      addressCountry: 'IT',
    }
  }
  if (typeof input.lat === 'number' && typeof input.lng === 'number') {
    node.geo = { '@type': 'GeoCoordinates', latitude: input.lat, longitude: input.lng }
  }
  if (typeof input.ratingValue === 'number' && typeof input.ratingCount === 'number' && input.ratingCount > 0) {
    node.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: input.ratingValue,
      reviewCount: input.ratingCount,
      bestRating: 5,
      worstRating: 1,
    }
  }
  return node
}

export function buildBreadcrumbSchema(items: Array<{ name: string; url: string }>): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: it.name,
      item: it.url,
    })),
  }
}

export function buildWebsiteSchema(input: { baseUrl: string; name: string }): object {
  const base = input.baseUrl.replace(/\/+$/, '')
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: input.name,
    url: base,
    inLanguage: 'it-IT',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${base}/esplora?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  }
}
