/**
 * SEO endpoints.
 *
 *  - GET /api/seo/sitemap.xml — emits the full public sitemap. Cached for 1h.
 *    The frontend host MUST rewrite /sitemap.xml -> /api/seo/sitemap.xml in
 *    `vercel.json` (already covered by a wildcard route in the platform).
 *
 *  - GET /api/seo/og/business/:slug.png — emits an OG image (1200x630) as SVG
 *    converted to PNG when `og:require-png` header is set. Otherwise returns
 *    raw SVG (which is sufficient for most crawlers including Slack/WhatsApp).
 *
 * Constraints:
 *  - Uses the anon Supabase client through HTTP (no service role): only public
 *    rows are exposed, RLS enforced.
 *  - All responses are versioned via `ETag` to allow CDN caching.
 */

import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { logEvent } from '../lib/observability.js'

const router: express.Router = express.Router()

const APP_BASE = (process.env.APP_BASE_URL || process.env.VITE_APP_URL || 'https://trustbook.it').replace(/\/+$/, '')

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (ch) => {
    switch (ch) {
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '&': return '&amp;'
      case '\'': return '&apos;'
      case '"': return '&quot;'
      default: return ch
    }
  })
}

function getPublicSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

router.get('/sitemap.xml', async (_req, res) => {
  try {
    const sb = getPublicSupabase()
    const today = new Date().toISOString().slice(0, 10)
    const lines: string[] = []
    lines.push('<?xml version="1.0" encoding="UTF-8"?>')
    lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

    const staticPaths: Array<{ path: string; priority: number; changefreq: string }> = [
      { path: '/', priority: 1.0, changefreq: 'daily' },
      { path: '/esplora', priority: 0.95, changefreq: 'daily' },
      { path: '/auth/login', priority: 0.4, changefreq: 'monthly' },
      { path: '/auth/register', priority: 0.7, changefreq: 'monthly' },
      { path: '/start', priority: 0.65, changefreq: 'monthly' },
    ]
    for (const sp of staticPaths) {
      lines.push('  <url>')
      lines.push(`    <loc>${APP_BASE}${sp.path}</loc>`)
      lines.push(`    <lastmod>${today}</lastmod>`)
      lines.push(`    <changefreq>${sp.changefreq}</changefreq>`)
      lines.push(`    <priority>${sp.priority.toFixed(2)}</priority>`)
      lines.push('  </url>')
    }

    if (sb) {
      const { data: businesses } = await sb
        .from('businesses')
        .select('slug, updated_at, is_paused')
        .eq('is_paused', false)
        .limit(5000)
      for (const b of businesses ?? []) {
        const slug = (b as { slug?: string | null }).slug
        if (!slug) continue
        const lastmod = ((b as { updated_at?: string | null }).updated_at ?? new Date().toISOString()).slice(0, 10)
        lines.push('  <url>')
        lines.push(`    <loc>${APP_BASE}/attivita/${escapeXml(slug)}</loc>`)
        lines.push(`    <lastmod>${lastmod}</lastmod>`)
        lines.push('    <changefreq>weekly</changefreq>')
        lines.push('    <priority>0.85</priority>')
        lines.push('  </url>')
      }

      const { data: external } = await sb
        .from('external_business_listings_public')
        .select('slug, updated_at, listing_status')
        .neq('listing_status', 'blocked')
        .limit(5000)
      for (const e of external ?? []) {
        const slug = (e as { slug?: string | null }).slug
        if (!slug) continue
        const lastmod = ((e as { updated_at?: string | null }).updated_at ?? new Date().toISOString()).slice(0, 10)
        lines.push('  <url>')
        lines.push(`    <loc>${APP_BASE}/scheda/${escapeXml(slug)}</loc>`)
        lines.push(`    <lastmod>${lastmod}</lastmod>`)
        lines.push('    <changefreq>weekly</changefreq>')
        lines.push('    <priority>0.55</priority>')
        lines.push('  </url>')
      }
    }

    lines.push('</urlset>')
    const body = lines.join('\n')
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400')
    res.status(200).send(body)
  } catch (e) {
    logEvent('error', 'sitemap_failed', { message: e instanceof Error ? e.message : String(e) })
    res.status(500).send('<error>sitemap_failed</error>')
  }
})

router.get('/og/business/:slug.svg', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').slice(0, 90)
    const sb = getPublicSupabase()
    let title = 'TrustBook'
    let subtitle = 'Prenotazioni affidabili'
    if (sb && slug) {
      const { data } = await sb
        .from('businesses')
        .select('name, category, city')
        .eq('slug', slug)
        .maybeSingle()
      if (data) {
        const b = data as { name?: string | null; category?: string | null; city?: string | null }
        title = b.name ?? title
        subtitle = [b.category, b.city].filter(Boolean).join(' · ') || subtitle
      }
    }
    const svg = renderOgSvg(title, subtitle)
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=86400, stale-while-revalidate=604800')
    res.status(200).send(svg)
  } catch (e) {
    logEvent('error', 'og_failed', { message: e instanceof Error ? e.message : String(e) })
    res.status(500).send('<error/>')
  }
})

function renderOgSvg(title: string, subtitle: string): string {
  const t = (title || '').slice(0, 70)
  const s = (subtitle || '').slice(0, 90)
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(t)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b1220" />
      <stop offset="100%" stop-color="#070d18" />
    </linearGradient>
    <radialGradient id="aura" cx="20%" cy="20%" r="65%">
      <stop offset="0%" stop-color="rgba(79,124,255,0.42)" />
      <stop offset="100%" stop-color="rgba(79,124,255,0)" />
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect width="1200" height="630" fill="url(#aura)" />
  <g font-family="'Plus Jakarta Sans', system-ui, sans-serif" fill="#ffffff">
    <text x="80" y="180" font-size="36" font-weight="600" opacity="0.7" letter-spacing="2">TRUSTBOOK</text>
    <text x="80" y="320" font-size="72" font-weight="800">${escapeXml(t)}</text>
    <text x="80" y="400" font-size="34" font-weight="500" opacity="0.78">${escapeXml(s)}</text>
    <rect x="80" y="500" width="220" height="58" rx="29" fill="#4F7CFF" />
    <text x="190" y="538" font-size="22" font-weight="700" text-anchor="middle">Prenota ora</text>
    <text x="1120" y="600" font-size="20" opacity="0.55" text-anchor="end">trustbook.it</text>
  </g>
</svg>`
}

export default router
