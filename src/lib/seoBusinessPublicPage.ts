import type { BusinessRow } from '@/domain/supabase'
import { sanitizePublicHttpUrl } from '@/lib/publicImageUrl'
import { businessPublicPath } from '@/lib/businessPublicPath'
import { resolvePublicProfileSettings } from '@/lib/publicProfileSettings'

export const DEFAULT_SITE_META_DESCRIPTION =
  'TrustBook — prenotazioni affidabili con attività locali, caparra opzionale e profili verificabili.'

const META_DESCRIPTION_ID = 'tb-meta-description'

function setPrimaryMetaDescription(content: string) {
  let el = document.getElementById(META_DESCRIPTION_ID) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.id = META_DESCRIPTION_ID
    el.setAttribute('name', 'description')
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

const MARKER = 'data-tb-business-seo'

function baseSiteUrl(): string {
  const env = typeof import.meta.env.VITE_APP_URL === 'string' ? import.meta.env.VITE_APP_URL.trim() : ''
  if (env) {
    try {
      return new URL(env).origin
    } catch {
      /* fallthrough */
    }
  }
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}

function publicPageUrl(business: BusinessRow): string {
  const origin = baseSiteUrl()
  const path = businessPublicPath(business)
  if (!origin) return path
  return `${origin.replace(/\/$/, '')}${path}`
}

/** Testo per meta description: una riga, senza HTML, max ~155 caratteri. */
export function truncateMetaDescription(raw: string | null | undefined, max = 155): string {
  const s = (raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
  const lastSpace = s.lastIndexOf(' ')
  if (lastSpace > 40 && s.length === max) return s.slice(0, lastSpace) + '…'
  return s.length === max && !s.endsWith('…') ? `${s}…` : s
}

export function buildLocalBusinessJsonLd(business: BusinessRow): Record<string, unknown> | null {
  const pub = resolvePublicProfileSettings(business.public_profile_settings)
  const url = publicPageUrl(business)
  const obj: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: business.name,
    url,
  }

  const logo = sanitizePublicHttpUrl(business.logo_url)
  if (logo) obj.image = [logo]

  if (pub.show_description) {
    const d = (business.description ?? '').trim()
    if (d) obj.description = truncateMetaDescription(d, 300)
  }

  if (pub.show_location) {
    const parts = [business.address_text, business.postal_code, business.city].filter(Boolean)
    if (parts.length) {
      obj.address = {
        '@type': 'PostalAddress',
        streetAddress: business.address_text ?? undefined,
        postalCode: business.postal_code ?? undefined,
        addressLocality: business.city ?? undefined,
        addressCountry: 'IT',
      }
    }
    if (Number.isFinite(business.lat) && Number.isFinite(business.lng)) {
      obj.geo = {
        '@type': 'GeoCoordinates',
        latitude: business.lat,
        longitude: business.lng,
      }
    }
  }

  if (pub.show_contact) {
    if (business.phone?.trim()) obj.telephone = business.phone.trim()
    if (business.email?.trim()) obj.email = business.email.trim()
  }

  const web = business.website?.trim()
  if (pub.show_contact && web && sanitizePublicHttpUrl(web)) {
    obj.sameAs = [sanitizePublicHttpUrl(web)!]
  }

  return obj
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  const sel = `meta[${attr}="${CSS.escape(key)}"]`
  let el = document.querySelector(sel) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    el.setAttribute(MARKER, '1')
    document.head.appendChild(el)
  } else if (!el.getAttribute(MARKER)) {
    el.setAttribute(MARKER, '1')
  }
  el.setAttribute('content', content)
}

function upsertLinkRel(rel: string, href: string) {
  const sel = `link[rel="${CSS.escape(rel)}"]`
  let el = document.querySelector(sel) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    el.setAttribute(MARKER, '1')
    document.head.appendChild(el)
  } else if (!el.getAttribute(MARKER)) {
    el.setAttribute(MARKER, '1')
  }
  el.setAttribute('href', href)
}

export function clearBusinessPublicSeo() {
  const titleDefault = 'TrustBook — Prenotazioni'
  document.title = titleDefault
  setPrimaryMetaDescription(DEFAULT_SITE_META_DESCRIPTION)
  document.querySelectorAll(`[${MARKER}="1"]`).forEach((n) => n.remove())
  const ld = document.getElementById('tb-ldjson-business-public')
  if (ld) ld.remove()
}

/**
 * Titolo + meta Open/Twitter + canonical + JSON-LD coerenti con cosa l’attività espone al pubblico.
 * Restituisce cleanup da chiamare su unmount / cambio route.
 */
export function applyBusinessPublicSeo(business: BusinessRow): () => void {
  clearBusinessPublicSeo()
  const pub = resolvePublicProfileSettings(business.public_profile_settings)
  const pageUrl = publicPageUrl(business)
  const title = `${business.name} · Prenota | TrustBook`
  document.title = title

  upsertLinkRel('canonical', pageUrl)

  const descSource =
    pub.show_description && business.description?.trim()
      ? business.description
      : `${business.name} — ${business.category.replace(/_/g, ' ')}${business.city ? ` a ${business.city}` : ''}. Prenota su TrustBook.`
  const desc = truncateMetaDescription(descSource, 155)

  setPrimaryMetaDescription(desc)
  upsertMeta('property', 'og:type', 'website')
  upsertMeta('property', 'og:title', title)
  upsertMeta('property', 'og:description', desc)
  upsertMeta('property', 'og:url', pageUrl)
  upsertMeta('property', 'og:site_name', 'TrustBook')
  upsertMeta('property', 'og:locale', 'it_IT')

  const logo = sanitizePublicHttpUrl(business.logo_url)
  if (logo) {
    upsertMeta('property', 'og:image', logo)
    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:image', logo)
  } else {
    upsertMeta('name', 'twitter:card', 'summary')
  }
  upsertMeta('name', 'twitter:title', title)
  upsertMeta('name', 'twitter:description', desc)

  const existingLd = document.getElementById('tb-ldjson-business-public')
  if (existingLd) existingLd.remove()

  const jsonLd = buildLocalBusinessJsonLd(business)
  if (jsonLd) {
    const s = document.createElement('script')
    s.type = 'application/ld+json'
    s.id = 'tb-ldjson-business-public'
    s.setAttribute(MARKER, '1')
    s.textContent = JSON.stringify(jsonLd)
    document.head.appendChild(s)
  }

  return () => clearBusinessPublicSeo()
}
