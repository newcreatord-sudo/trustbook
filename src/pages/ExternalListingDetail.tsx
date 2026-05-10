import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AppShell from '@/components/AppShell'
import Card from '@/shared/ui/Card'
import Button from '@/shared/ui/Button'
import Alert from '@/shared/ui/Alert'
import GoogleMapsEmbed from '@/components/GoogleMapsEmbed'
import EmptyState from '@/shared/ui/EmptyState'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { safeParseExternalBusinessListingRow } from '@/domain/parse'
import type { ExternalBusinessListingRow } from '@/domain/supabase'

function isFreshContact(iso: string | null, maxAgeDays: number): boolean {
  if (!iso) return false
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return false
  return Date.now() - t <= maxAgeDays * 24 * 60 * 60 * 1000
}

function formatCategoryLabel(raw: string): string {
  const s = String(raw ?? '').trim()
  if (!s) return '—'
  return s
    .split('_')
    .filter(Boolean)
    .map((x) => x.slice(0, 1).toUpperCase() + x.slice(1))
    .join(' ')
}

function formatSourceLabel(raw: string): string {
  const s = String(raw ?? '').trim().toLowerCase()
  if (!s) return 'Fonte pubblica/partner'
  if (s === 'openstreetmap') return 'OpenStreetMap'
  return raw
}

export default function ExternalListingDetail() {
  const { slug } = useParams() as { slug?: string }
  const nav = useNavigate()
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [listing, setListing] = useState<ExternalBusinessListingRow | null>(null)

  useEffect(() => {
    if (!slug) return
    let mounted = true
    setLoading(true)
    setErr(null)
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('external_business_listings_public')
          .select(
            'id,slug,name,category,description,address_text,postal_code,city,province,region,country_code,lat,lng,phone,email,website,listing_status,source,source_ref,source_url,source_license,source_attribution,data_checked_at,imported_at,updated_at,claimed_business_id,claimed_at,claimed_by_user_id',
          )
          .eq('slug', slug)
          .maybeSingle()
        if (error) throw error
        const parsed = safeParseExternalBusinessListingRow(data)
        if (!mounted) return
        setListing(parsed)
      } catch (e) {
        if (!mounted) return
        setErr(errorMessage(e))
        setListing(null)
      } finally {
        if (mounted) setLoading(false)
      }
    })()
    return () => {
      mounted = false
    }
  }, [slug])

  useEffect(() => {
    if (!listing?.claimed_business_id) return
    nav(`/attivita/${encodeURIComponent(listing.claimed_business_id)}`, { replace: true })
  }, [listing?.claimed_business_id, nav])

  useEffect(() => {
    if (!listing) return
    document.title = `${listing.name} · Scheda informativa | TrustBook`
  }, [listing])

  const showContact = useMemo(() => {
    if (!listing) return false
    const hasAny = Boolean(listing.phone?.trim() || listing.email?.trim() || listing.website?.trim())
    if (!hasAny) return false
    return isFreshContact(listing.data_checked_at, 180)
  }, [listing])

  const completeness = useMemo(() => {
    if (!listing) return { score: 0, label: 'Bassa', pct: 0 }
    const points = [
      Boolean(listing.address_text?.trim() || listing.postal_code?.trim()),
      Boolean(listing.city?.trim()),
      listing.lat !== null && listing.lng !== null,
      Boolean(listing.website?.trim()),
      Boolean(listing.phone?.trim() || listing.email?.trim()),
      Boolean(listing.description?.trim()),
    ]
    const score = points.filter(Boolean).length
    const pct = Math.round((score / points.length) * 100)
    const label = pct >= 85 ? 'Alta' : pct >= 55 ? 'Media' : 'Bassa'
    return { score, pct, label }
  }, [listing])

  if (loading) {
    return (
      <AppShell>
        <Card>
          <div className="text-white/70">Caricamento…</div>
        </Card>
      </AppShell>
    )
  }

  if (err || !listing) {
    return (
      <AppShell>
        <EmptyState
          title="Scheda non disponibile"
          description={err ?? 'Questa scheda non esiste o non è accessibile.'}
          action={
            <Link to="/esplora">
              <Button variant="secondary">Torna a Esplora</Button>
            </Link>
          }
        />
      </AppShell>
    )
  }

  const claimPath = `/onboarding-attivita?prefillListing=${encodeURIComponent(listing.slug)}`

  const sourceLabel = formatSourceLabel(listing.source)
  const categoryLabel = formatCategoryLabel(listing.category)
  const addressLine =
    listing.address_text?.trim() || listing.postal_code?.trim()
      ? `${listing.address_text ?? ''}${listing.postal_code ? `, ${listing.postal_code}` : ''}`.trim()
      : null

  return (
    <AppShell>
      <div className="space-y-4">
        <Alert tone="info">
          <div className="font-semibold">Scheda informativa (non verificata)</div>
          <div className="mt-1 text-sm">
            Questa scheda proviene da una fonte pubblica/partner e potrebbe contenere dati incompleti o non aggiornati. Non implica affiliazione a
            TrustBook.
          </div>
          <div className="mt-2 text-sm text-white/80">
            Prenotazioni e contatti pubblici diventano disponibili quando il titolare rivendica e completa la scheda.
          </div>
        </Alert>

        <Card>
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-white break-words">{listing.name}</h1>
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/70">
                  Non verificata
                </span>
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white/50">
                  Directory
                </span>
              </div>
              <div className="mt-1 text-sm text-white/70">
                <span className="font-semibold text-white/80">{categoryLabel}</span>
                <span className="mx-2">•</span>
                <span>{listing.city ?? '—'}</span>
              </div>
              {addressLine && <div className="mt-2 text-sm text-white/60">{addressLine}</div>}
              {listing.description?.trim() && <div className="mt-3 text-sm text-white/70">{listing.description.trim()}</div>}

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-white/60">Completezza scheda</div>
                  <div className="text-xs font-semibold text-white/70">
                    {completeness.label} · {completeness.pct}%
                  </div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-white/70" style={{ width: `${completeness.pct}%` }} />
                </div>
                <div className="mt-2 text-xs text-white/50">
                  La completezza aumenta quando il titolare verifica e aggiunge dati ufficiali (servizi, disponibilità, contatti, regole).
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-2">
              <Link to={claimPath}>
                <Button>Sei il titolare? Verifica e completa</Button>
              </Link>
              <Link to="/esplora">
                <Button variant="secondary">Torna a Esplora</Button>
              </Link>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-white/60">Contatti</div>
              {showContact ? (
                <div className="mt-2 space-y-2 text-sm text-white/80">
                  {listing.phone?.trim() && <div>Telefono: {listing.phone.trim()}</div>}
                  {listing.email?.trim() && <div>Email: {listing.email.trim()}</div>}
                  {listing.website?.trim() && (
                    <div>
                      Sito:{' '}
                      <a
                        href={listing.website.trim()}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#7D9BFF] hover:underline"
                      >
                        {listing.website.trim()}
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-2 text-sm text-white/60">
                  Per tutela degli utenti, i contatti sono mostrati solo quando sono stati verificati e aggiornati di recente. Se sei il titolare,
                  rivendica la scheda per completarli.
                </div>
              )}
              {listing.data_checked_at && (
                <div className="mt-3 text-xs text-white/50">Ultimo controllo contatti: {new Date(listing.data_checked_at).toLocaleDateString()}</div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-white/60">Fonte</div>
              <div className="mt-2 text-sm text-white/80">{sourceLabel}</div>
              {(listing.source_attribution?.trim() || listing.source_license?.trim()) && (
                <div className="mt-2 text-xs text-white/60">
                  {listing.source_attribution?.trim() ? <div>{listing.source_attribution.trim()}</div> : null}
                  {listing.source_license?.trim() ? <div>Licenza: {listing.source_license.trim()}</div> : null}
                </div>
              )}
              {listing.source_url?.trim() && (
                <div className="mt-2">
                  <a href={listing.source_url.trim()} target="_blank" rel="noreferrer" className="text-xs text-[#7D9BFF] hover:underline">
                    Fonte originale
                  </a>
                </div>
              )}
              <div className="mt-3 text-xs text-white/50">
                Importata: {new Date(listing.imported_at).toLocaleDateString()} · Aggiornata: {new Date(listing.updated_at).toLocaleDateString()}
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs font-bold uppercase tracking-wide text-white/60">Perché TrustBook è diverso</div>
            <div className="mt-2 text-sm text-white/70">
              TrustBook privilegia dati verificati e trasparenza: nessuna recensione importata da terzi, contatti pubblici solo dopo verifica e
              meccanismi anti no-show per proteggere attività e clienti.
            </div>
          </div>
        </Card>

        {listing.lat !== null && listing.lng !== null && (
          <Card>
            <div className="h-[320px] overflow-hidden rounded-2xl border border-white/10 bg-white/5">
              <GoogleMapsEmbed lat={listing.lat} lng={listing.lng} zoom={15} title="Mappa (scheda informativa)" />
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  )
}
