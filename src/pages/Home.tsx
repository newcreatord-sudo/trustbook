import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell'
const MapView = lazy(() => import('@/components/MapView'))
import type { BusinessRow } from '@/domain/supabase'
import { haversineKm } from '@/utils/geo'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/providers/authContext'
import { errorMessage } from '@/lib/errors'
import { useToast } from '@/shared/ui/toastContext'
import Alert from '@/shared/ui/Alert'
import Button from '@/shared/ui/Button'
import Card from '@/shared/ui/Card'
import EmptyState from '@/shared/ui/EmptyState'
import Skeleton from '@/shared/ui/Skeleton'
import { safeParseBusinessRow } from '@/domain/parse'
import BusinessResultCard from '@/pages/home/BusinessResultCard'
import HomeFilters from '@/pages/home/HomeFilters'
import HomeHero from '@/pages/home/HomeHero'
import HomeResultsSkeleton from '@/pages/home/HomeResultsSkeleton'
import TrustStrip from '@/pages/home/TrustStrip'
import HomeSuggestions from '@/pages/home/HomeSuggestions'
import { matchBusiness, openingWindowWeekdayJs, topCategories, type ReviewLite } from '@/pages/home/homeLogic'
import { FIXED_CATEGORIES } from '@/pages/home/homeFilterCategories'
import type { BusinessSortKey } from '@/pages/home/searchSort'
import { relevanceScore } from '@/pages/home/searchSort'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { getOrSetCachedAsync } from '@/lib/queryCache'
import { REVIEW_WINDOW_MS } from '@/lib/reviewEligibility'

export default function Home() {
  const { session, profile, refreshProfile } = useAuth()
  const { push } = useToast()
  const userId = session?.user?.id ?? null
  const [businesses, setBusinesses] = useState<BusinessRow[]>([])
  const [reviews, setReviews] = useState<ReviewLite[]>([])
  const [services, setServices] = useState<Array<{ business_id: string; name: string; price_cents: number | null }>>([])
  const [openingWindows, setOpeningWindows] = useState<Array<{ business_id: string; weekday: number }>>([])
  const [loading, setLoading] = useState(true)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [myScore, setMyScore] = useState<number | null>(null)
  const [myStars, setMyStars] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query, 300)
  const [category, setCategory] = useState<string>('')
  const [availabilityFilter, setAvailabilityFilter] = useState<string>('') // 'today', 'tomorrow', ''
  const [priceFilter, setPriceFilter] = useState<string>('') // 'low', 'medium', 'high', ''
  const [sort, setSort] = useState<BusinessSortKey>('newest')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoBusy, setGeoBusy] = useState(false)
  const [maxDistanceKm, setMaxDistanceKm] = useState<number | null>(null)
  const [visibleCount, setVisibleCount] = useState(12)
  const [mapEnabled, setMapEnabled] = useState(false)
  const [showMap, setShowMap] = useState(false)

  useEffect(() => {
    document.title = 'Esplora attività | TrustBook'
  }, [])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    ;(async () => {
      try {
        const [parsedBusinesses, parsedReviews, fetchedServices, fetchedWindows] = await Promise.all([
          getOrSetCachedAsync({
            key: 'esplora_businesses_v3_visible_only',
            ttlMs: 60_000,
            fn: async () => {
              const bRes = await supabase
                .from('businesses')
                .select(
                  'id,owner_user_id,name,category,description,address_text,city,postal_code,logo_url,is_paused,listing_visible,lat,lng,deposit_enabled,deposit_rule,deposit_fixed_cents,deposit_percent,deposit_min_cents,deposit_max_cents,created_at,updated_at,approval_mode',
                )
                .eq('is_paused', false)
                .eq('listing_visible', true)
                .order('created_at', { ascending: false })
                .limit(1000)
              if (bRes.error) throw bRes.error
              return (((bRes.data as unknown[]) ?? []) as unknown[])
                .map((x) => safeParseBusinessRow(x))
                .filter(Boolean) as BusinessRow[]
            },
          }),
          getOrSetCachedAsync({
            key: 'esplora_reviews_v2_customer_only',
            ttlMs: 60_000,
            fn: async () => {
              const cutoffIso = new Date(Date.now() - REVIEW_WINDOW_MS).toISOString()
              const rRes = await supabase
                .from('reviews')
                .select('business_id,rating')
                .eq('direction', 'customer_to_business')
                .gte('created_at', cutoffIso)
              if (rRes.error) throw rRes.error
              const out: ReviewLite[] = []
              for (const r of ((rRes.data as unknown[]) ?? []) as unknown[]) {
                if (typeof r !== 'object' || r === null) continue
                const rec = r as Record<string, unknown>
                const bid = typeof rec.business_id === 'string' ? rec.business_id : null
                const rating = typeof rec.rating === 'number' ? rec.rating : null
                if (!bid || rating === null) continue
                out.push({ business_id: bid, rating })
              }
              return out
            },
          }),
          getOrSetCachedAsync({
            key: 'esplora_services_v1',
            ttlMs: 60_000,
            fn: async () => {
              const sRes = await supabase.from('services').select('business_id, name, price_cents').eq('is_active', true)
              if (sRes.error) throw sRes.error
              return (sRes.data ?? []) as Array<{ business_id: string; name: string; price_cents: number | null }>
            }
          }),
          getOrSetCachedAsync({
            key: 'esplora_windows_v1',
            ttlMs: 60_000,
            fn: async () => {
              const wRes = await supabase.from('business_opening_windows').select('business_id, weekday')
              if (wRes.error) throw wRes.error
              return (wRes.data ?? []) as Array<{ business_id: string; weekday: number }>
            }
          })
        ])

        if (!mounted) return
        setBusinesses(parsedBusinesses)
        setReviews(parsedReviews)
        setServices(fetchedServices)
        setOpeningWindows(fetchedWindows)
      } catch (e: unknown) {
        if (!mounted) return
        setSeedError(errorMessage(e, 'Errore caricamento attività.'))
      } finally {
        if (mounted) setLoading(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    try {
      const stored = localStorage.getItem('tb_map_enabled')
      if (stored === '1') {
        setMapEnabled(true)
        return
      }
      if (stored === '0') {
        setMapEnabled(false)
        return
      }
    } catch {
      // ignore
    }
    const mapKey =
      typeof import.meta.env.VITE_GOOGLE_MAPS_API_KEY === 'string'
        ? import.meta.env.VITE_GOOGLE_MAPS_API_KEY.trim()
        : ''
    setMapEnabled(Boolean(mapKey))
  }, [])

  useEffect(() => {
    if (!mapEnabled) {
      setShowMap(false)
      return
    }
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
      cancelIdleCallback?: (id: number) => void
    }
    const id = w.requestIdleCallback
      ? w.requestIdleCallback(() => setShowMap(true), { timeout: 1200 })
      : window.setTimeout(() => setShowMap(true), 450)
    return () => {
      try {
        if (w.requestIdleCallback) {
          w.cancelIdleCallback?.(id as number)
          return
        }
        window.clearTimeout(id as unknown as number)
      } catch {
        return
      }
    }
  }, [mapEnabled])

  useEffect(() => {
    if (!userId) return
    if (profile) return
    void refreshProfile()
  }, [profile, refreshProfile, userId])

  useEffect(() => {
    if (!userId) return
    let mounted = true

    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('favorite_businesses')
          .select('business_id')
          .eq('user_id', userId)
        if (!mounted) return
        if (error) throw error
        const set = new Set<string>()
        for (const r of (data as Array<{ business_id: string }>) ?? []) set.add(r.business_id)
        setFavorites(set)
      } catch {
        if (!mounted) return
        setFavorites(new Set())
      }
    })()

    return () => {
      mounted = false
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    let mounted = true
    setMyScore(80)
    setMyStars(0)
    ;(async () => {
      try {
        if (profile?.role === 'attivita') {
          if (!mounted) return
          setMyScore(null)
          setMyStars(null)
          return
        }
        const { data, error } = await supabase
          .from('customer_reliability')
          .select('score,stars')
          .eq('user_id', userId)
          .maybeSingle()
        if (!mounted) return
        if (error) throw error
        setMyScore(((data as { score: number } | null)?.score ?? 80) as number)
        setMyStars(((data as { stars: number } | null)?.stars ?? 0) as number)
      } catch {
        if (!mounted) return
        setMyScore(80)
        setMyStars(0)
      }
    })()
    return () => {
      mounted = false
    }
  }, [profile?.role, userId])

  const categories = useMemo(() => {
    return Array.from(new Set(businesses.map((b) => b.category))).sort()
  }, [businesses])

  /** Select coerente: categorie playbook + stringhe effettive nel tenant */
  const categorySelectOptions = useMemo(() => {
    const set = new Set<string>([...FIXED_CATEGORIES])
    for (const b of businesses) {
      const c = String(b.category ?? '').trim()
      if (c) set.add(c)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'it'))
  }, [businesses])

  const suggestedCategories = useMemo(() => {
    return topCategories(businesses, 4).map((x) => x.category)
  }, [businesses])

  const ratingMap = useMemo(() => {
    const sums = new Map<string, { sum: number; count: number }>()
    for (const r of reviews) {
      const cur = sums.get(r.business_id)
      if (!cur) sums.set(r.business_id, { sum: r.rating, count: 1 })
      else sums.set(r.business_id, { sum: cur.sum + r.rating, count: cur.count + 1 })
    }
    const out = new Map<string, { avg: number; count: number }>()
    for (const [k, v] of sums.entries()) out.set(k, { avg: v.sum / v.count, count: v.count })
    return out
  }, [reviews])

  const servicesByBusinessId = useMemo(() => {
    const m = new Map<string, typeof services>()
    for (const s of services) {
      const arr = m.get(s.business_id)
      if (arr) arr.push(s)
      else m.set(s.business_id, [s])
    }
    return m
  }, [services])

  const weekdaysOpenByBusinessId = useMemo(() => {
    const m = new Map<string, Set<number>>()
    for (const w of openingWindows) {
      let set = m.get(w.business_id)
      if (!set) {
        set = new Set<number>()
        m.set(w.business_id, set)
      }
      set.add(w.weekday)
    }
    return m
  }, [openingWindows])

  const effectiveSort: BusinessSortKey = sort === 'distance' && !userLoc ? 'newest' : sort

  const filteredAll = useMemo(() => {
    const q = debouncedQuery
    const qLower = q.trim().toLowerCase()

    const today = new Date()
    const todayDay = openingWindowWeekdayJs(today)
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    const tomorrowDay = openingWindowWeekdayJs(tomorrow)

    const base = businesses
      .filter((b) => {
        if (!Number.isFinite(b.lat) || !Number.isFinite(b.lng)) return false
        if (category && b.category !== category) return false
        if (qLower) {
          const bServices = servicesByBusinessId.get(b.id) ?? []
          const matchesServices = bServices.some((s) => s.name.toLowerCase().includes(qLower))
          if (!matchBusiness(b, q) && !matchesServices) return false
        }
        if (userLoc && maxDistanceKm !== null) {
          const d = haversineKm(userLoc, { lat: b.lat, lng: b.lng })
          if (d > maxDistanceKm) return false
        }

        const bizWeekdays = weekdaysOpenByBusinessId.get(b.id)
        if (availabilityFilter === 'today') {
          const hasToday = bizWeekdays?.has(todayDay) ?? false
          if (!hasToday) return false
        } else if (availabilityFilter === 'tomorrow') {
          const hasTomorrow = bizWeekdays?.has(tomorrowDay) ?? false
          if (!hasTomorrow) return false
        }

        const bServices = servicesByBusinessId.get(b.id) ?? []
        if (priceFilter) {
          if (bServices.length === 0) return false
          const avgPrice = bServices.reduce((acc, s) => acc + (s.price_cents || 0), 0) / bServices.length
          if (priceFilter === 'low' && avgPrice > 2500) return false // < 25€
          if (priceFilter === 'medium' && (avgPrice <= 2500 || avgPrice > 6000)) return false // 25€ - 60€
          if (priceFilter === 'high' && avgPrice <= 6000) return false // > 60€
        }

        return true
      })
      .map((b) => {
        const distanceKm = userLoc ? haversineKm(userLoc, { lat: b.lat, lng: b.lng }) : null
        const stats = ratingMap.get(b.id) ?? null
        const bServices = servicesByBusinessId.get(b.id) ?? []
        const avgPrice =
          bServices.length > 0 ? bServices.reduce((acc, s) => acc + (s.price_cents || 0), 0) / bServices.length : null

        return {
          business: b,
          distanceKm,
          ratingAvg: stats?.avg ?? null,
          ratingCount: stats?.count ?? 0,
          avgPrice,
          hasToday: weekdaysOpenByBusinessId.get(b.id)?.has(todayDay) ?? false,
        }
      })

    return base.sort((a, b) => {
      if (effectiveSort === 'distance') {
        if (a.distanceKm === null || b.distanceKm === null) return 0
        return a.distanceKm - b.distanceKm
      }
      if (effectiveSort === 'rating') {
        const av = a.ratingAvg ?? -1
        const bv = b.ratingAvg ?? -1
        if (bv !== av) return bv - av
        if (b.ratingCount !== a.ratingCount) return b.ratingCount - a.ratingCount
        return b.business.created_at.localeCompare(a.business.created_at)
      }
      if (effectiveSort === 'relevance') {
        const ar = relevanceScore(a.business, qLower)
        const br = relevanceScore(b.business, qLower)
        if (br !== ar) return br - ar
        const av = a.ratingAvg ?? -1
        const bv = b.ratingAvg ?? -1
        if (bv !== av) return bv - av
        if (a.distanceKm !== null && b.distanceKm !== null && a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm
        return b.business.created_at.localeCompare(a.business.created_at)
      }
      return b.business.created_at.localeCompare(a.business.created_at)
    })
  }, [
    businesses,
    category,
    debouncedQuery,
    effectiveSort,
    maxDistanceKm,
    ratingMap,
    userLoc,
    availabilityFilter,
    priceFilter,
    servicesByBusinessId,
    weekdaysOpenByBusinessId,
  ])

  const isQueryUpdating = query.trim() !== debouncedQuery.trim()

  useEffect(() => {
    setVisibleCount(12)
  }, [category, debouncedQuery, effectiveSort, maxDistanceKm, userLoc, availabilityFilter, priceFilter])

  const filteredVisible = useMemo(() => {
    return filteredAll.slice(0, Math.max(0, visibleCount))
  }, [filteredAll, visibleCount])

  const featuredFavorite = useMemo(() => {
    if (!favorites.size) return null
    for (const x of filteredAll) {
      if (favorites.has(x.business.id)) return x.business
    }
    return null
  }, [favorites, filteredAll])

  const featuredTop = useMemo(() => {
    let best: { b: BusinessRow; avg: number; count: number } | null = null
    for (const x of filteredAll) {
      const stats = ratingMap.get(x.business.id) ?? null
      const avg = stats?.avg ?? null
      const count = stats?.count ?? 0
      if (avg === null || count < 3) continue
      if (!best || avg > best.avg) best = { b: x.business, avg, count }
    }
    return best?.b ?? null
  }, [filteredAll, ratingMap])

  const requestLocation = () => {
    setGeoError(null)
    setGeoBusy(true)
    if (!('geolocation' in navigator)) {
      setGeoError('Geolocalizzazione non supportata dal browser.')
      setGeoBusy(false)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setGeoError(null)
        setGeoBusy(false)
      },
      () => {
        setGeoError('Permesso posizione negato o non disponibile.')
        setGeoBusy(false)
      },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  const resetFilters = () => {
    setQuery('')
    setCategory('')
    setAvailabilityFilter('')
    setPriceFilter('')
    setSelectedId(null)
    setMaxDistanceKm(null)
    setSort('newest')
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <HomeHero role={profile?.role ?? null} myScore={myScore} myStars={myStars} />

        <HomeFilters
          query={query}
          onQueryChange={setQuery}
          queryDirty={isQueryUpdating}
          categoryOptions={categorySelectOptions}
          category={category}
          onCategoryChange={setCategory}
          availabilityFilter={availabilityFilter}
          onAvailabilityFilterChange={setAvailabilityFilter}
          priceFilter={priceFilter}
          onPriceFilterChange={setPriceFilter}
          userLoc={userLoc}
          geoError={geoError}
          onRequestLocation={requestLocation}
          geoBusy={geoBusy}
          maxDistanceKm={maxDistanceKm}
          onMaxDistanceKmChange={setMaxDistanceKm}
          sort={effectiveSort}
          onSortChange={(next) => {
            if (next === 'distance' && !userLoc) return
            setSort(next)
          }}
          onReset={resetFilters}
        />

        {(query.trim() ||
          category ||
          maxDistanceKm !== null ||
          effectiveSort !== 'newest' ||
          availabilityFilter ||
          priceFilter) && (
          <Card padded={false} className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              {query.trim() ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => setQuery('')}>
                  Ricerca: “{query.trim()}”
                </Button>
              ) : null}
              {category ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => setCategory('')}>
                  Categoria: {category}
                </Button>
              ) : null}
              {availabilityFilter ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => setAvailabilityFilter('')}>
                  Disponibilità: {availabilityFilter === 'today' ? 'oggi' : 'domani'}
                </Button>
              ) : null}
              {priceFilter ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => setPriceFilter('')}>
                  Prezzo:{' '}
                  {priceFilter === 'low' ? 'fino a 25€' : priceFilter === 'medium' ? '25–60€' : 'oltre 60€'}
                </Button>
              ) : null}
              {maxDistanceKm !== null ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => setMaxDistanceKm(null)}>
                  Distanza: {maxDistanceKm} km
                </Button>
              ) : null}
              {effectiveSort !== 'newest' ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => setSort('newest')}>
                  Ordine: {effectiveSort}
                </Button>
              ) : null}
              <div className="ml-auto">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-xs font-semibold text-white/60 hover:text-white"
                >
                  Reset
                </button>
              </div>
            </div>
          </Card>
        )}

        <TrustStrip />

        {!loading && filteredAll.length >= 12 ? (
          <HomeSuggestions
            totalBusinesses={businesses.length}
            totalCategories={categories.length}
            favoriteCount={favorites.size}
            topCategories={suggestedCategories}
            onPickCategory={(c) => {
              setCategory(c)
              setSelectedId(null)
            }}
            onUseLocation={() => {
              requestLocation()
              setMaxDistanceKm(5)
            }}
            onReset={resetFilters}
            featuredFavoriteName={featuredFavorite?.name ?? null}
            onOpenFavorite={() => {
              if (!featuredFavorite) return
              setSelectedId(featuredFavorite.id)
              window.setTimeout(() => {
                document.getElementById('tb-results-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }, 50)
            }}
            featuredTopName={featuredTop?.name ?? null}
            onOpenTop={() => {
              if (!featuredTop) return
              setSelectedId(featuredTop.id)
              window.setTimeout(() => {
                document.getElementById('tb-results-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }, 50)
            }}
          />
        ) : null}

        {seedError ? <Alert tone="danger">{seedError}</Alert> : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Card padded={false} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-white">Mappa</div>
                    {!mapEnabled ? (
                      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-100">
                        Modalità performance
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-xs text-white/60">Clicca un risultato per evidenziare</div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const next = !mapEnabled
                    setMapEnabled(next)
                    try {
                      localStorage.setItem('tb_map_enabled', next ? '1' : '0')
                    } catch {
                      // ignore
                    }
                  }}
                >
                  {mapEnabled ? 'Nascondi' : 'Mostra'}
                </Button>
              </div>
              <div className="h-[420px] md:h-[520px]">
                {loading ? (
                  <Skeleton className="h-full w-full rounded-none" />
                ) : !mapEnabled ? (
                  <div className="flex h-full w-full items-center justify-center">
                    <div className="max-w-sm px-6 text-center">
                      <div className="text-sm font-semibold text-white">Mappa disattivata</div>
                      <div className="mt-1 text-xs text-white/70">
                        Attivala quando ti serve: la lista risultati resta completa e più veloce.
                      </div>
                      <div className="mt-2 text-[11px] text-white/50">
                        Impostazione predefinita ottimizzata per tempi di caricamento più rapidi.
                      </div>
                      <div className="mt-4 flex justify-center">
                        <Button
                          type="button"
                          variant="primary"
                          onClick={() => {
                            setMapEnabled(true)
                            try {
                              localStorage.setItem('tb_map_enabled', '1')
                            } catch {
                              // ignore
                            }
                          }}
                        >
                          Mostra mappa
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : !showMap ? (
                  <Skeleton className="h-full w-full rounded-none" />
                ) : (
                  <Suspense fallback={<Skeleton className="h-full w-full rounded-none" />}>
                    <MapView
                      businesses={filteredAll.map((x) => ({
                        id: x.business.id,
                        lat: x.business.lat,
                        lng: x.business.lng,
                        name: x.business.name,
                        category: x.business.category,
                        ratingAvg: x.ratingAvg,
                        reviewCount: x.ratingCount,
                        avgPrice: x.avgPrice,
                        hasToday: x.hasToday,
                        isPaused: x.business.is_paused
                      }))}
                      selectedBusinessId={selectedId}
                      onSelect={(id) => setSelectedId(id)}
                      center={userLoc}
                      centerZoom={12}
                    />
                  </Suspense>
                )}
              </div>
            </Card>
          </div>

          <div className="lg:col-span-5">
            <Card padded={false}>
              <div
                id="tb-results-top"
                className="sticky top-[64px] z-10 flex items-center justify-between border-b border-white/10 bg-[#0B1220]/85 px-4 py-3 backdrop-blur md:static md:bg-transparent"
              >
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-white">Risultati ({filteredAll.length})</div>
                  {isQueryUpdating ? <div className="text-xs text-white/60">Aggiorno…</div> : null}
                </div>
                <button type="button" onClick={resetFilters} className="text-xs font-semibold text-white/60 hover:text-white">
                  Reset
                </button>
              </div>

              <div className="p-2 md:max-h-[520px] md:overflow-auto">
                {loading ? (
                  <HomeResultsSkeleton rows={6} />
                ) : businesses.length === 0 ? (
                  <EmptyState
                    title="Nessuna attività ancora"
                    description="Per vedere risultati, crea almeno un profilo attività."
                    action={
                      <div className="flex w-full flex-col gap-2">
                        {import.meta.env.DEV && profile?.role === 'cliente' && userId ? (
                          <Button
                            type="button"
                            onClick={() => {
                              setSeedError(null)
                              ;(async () => {
                                try {
                                  const { error } = await supabase
                                    .from('profiles')
                                    .update({ role: 'attivita' })
                                    .eq('id', userId)
                                  if (error) throw error
                                  await refreshProfile()
                                  window.location.href = '/dashboard-attivita'
                                } catch (e: unknown) {
                                  setSeedError(errorMessage(e, 'Errore passaggio ad Attività.'))
                                }
                              })()
                            }}
                            className="w-full"
                          >
                            Passa ad Attività
                          </Button>
                        ) : null}
                        <Link to="/dashboard-attivita" className="w-full">
                          <Button variant="secondary" className="w-full" type="button">
                            Vai alla dashboard attività
                          </Button>
                        </Link>
                      </div>
                    }
                  />
                ) : filteredAll.length === 0 ? (
                  <EmptyState
                    title="Nessun risultato"
                    description="Prova a cambiare filtri o ricerca."
                    action={
                      <Button type="button" variant="secondary" onClick={resetFilters}>
                        Reset filtri
                      </Button>
                    }
                  />
                ) : (
                  <div className="space-y-2">
                    {filteredVisible.map(({ business: b, distanceKm, ratingAvg, ratingCount, avgPrice, hasToday }) => {
                      const active = selectedId === b.id
                      const isFav = favorites.has(b.id)
                      return (
                        <BusinessResultCard
                          key={b.id}
                          business={b}
                          active={active}
                          distanceKm={distanceKm}
                          avgRating={ratingAvg}
                          reviewCount={ratingCount}
                          avgPrice={avgPrice}
                          hasToday={hasToday}
                          userId={userId}
                          isFav={isFav}
                          onSelect={() => setSelectedId(b.id)}
                          onToggleFavorite={() => {
                            if (!userId) return
                            setSeedError(null)
                            setFavorites((prev) => {
                              const next = new Set(prev)
                              if (next.has(b.id)) next.delete(b.id)
                              else next.add(b.id)
                              return next
                            })

                            ;(async () => {
                              try {
                                if (isFav) {
                                  const { error } = await supabase
                                    .from('favorite_businesses')
                                    .delete()
                                    .eq('user_id', userId)
                                    .eq('business_id', b.id)
                                  if (error) throw error
                                } else {
                                  const { error } = await supabase
                                    .from('favorite_businesses')
                                    .insert({ user_id: userId, business_id: b.id })
                                  if (error) throw error
                                }

                                push({
                                  tone: 'success',
                                  title: isFav ? 'Rimosso dai preferiti' : 'Aggiunto ai preferiti',
                                  description: b.name,
                                })
                              } catch (e: unknown) {
                                setSeedError(errorMessage(e, 'Errore preferiti.'))
                                push({ tone: 'danger', title: 'Errore preferiti', description: 'Riprova tra poco.' })
                                setFavorites((prev) => {
                                  const next = new Set(prev)
                                  if (isFav) next.add(b.id)
                                  else next.delete(b.id)
                                  return next
                                })
                              }
                            })()
                          }}
                        />
                      )
                    })}

                    {filteredAll.length > filteredVisible.length ? (
                      <div className="pt-2">
                        <Button type="button" variant="secondary" className="w-full" onClick={() => setVisibleCount((v) => v + 12)}>
                          Mostra altri ({filteredAll.length - filteredVisible.length})
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
