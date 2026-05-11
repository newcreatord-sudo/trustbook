import { useEffect } from 'react'

type Props = {
  /**
   * Either a single JSON-LD object or an array of @graph nodes. Each is
   * stringified independently and rendered as <script type="application/ld+json">.
   */
  data: object | object[]
  /** Optional DOM id used so repeated renders replace the previous tag instead of stacking. */
  id?: string
}

/**
 * Injects a JSON-LD script into <head>. Removed on unmount.
 *
 * Why not just render `<script>` inside a React tree: most React renderers
 * silently strip <script> elements inside body for security, breaking
 * structured data. Mounting to <head> via a side effect is the supported pattern.
 */
export default function JsonLd({ data, id }: Props) {
  useEffect(() => {
    const items = Array.isArray(data) ? data : [data]
    const elements: HTMLScriptElement[] = []
    items.forEach((item, idx) => {
      const el = document.createElement('script')
      el.type = 'application/ld+json'
      el.dataset.tbJsonLd = id ?? `auto-${idx}`
      el.textContent = JSON.stringify(item, null, 2)
      document.head.appendChild(el)
      elements.push(el)
    })
    return () => {
      for (const el of elements) {
        if (el.parentNode) el.parentNode.removeChild(el)
      }
    }
  }, [data, id])
  return null
}

/** Common helpers to compose schema.org payloads. */
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
