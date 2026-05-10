import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import AppShell from '@/components/AppShell'
const MapView = lazy(() => import('@/components/MapView'))
import type { BusinessRow, ExternalBusinessListingRow } from '@/domain/supabase'
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
import { safeParseBusinessRow, safeParseExternalBusinessListingRow } from '@/domain/parse'
import BusinessResultCard from '@/pages/home/BusinessResultCard'
import ExternalListingResultCard from '@/pages/home/ExternalListingResultCard'
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
import { businessPublicPath } from '@/lib/businessPublicPath'

export default function Home() {
  const { session, profile, refreshProfile } = useAuth()
  const { push } = useToast()
  const userId = session?.user?.id ?? null
  const [businesses, setBusinesses] = useState<BusinessRow[]>([])
  const [externalListings, setExternalListings] = useState<ExternalBusinessListingRow[]>([])
  const [externalPage, setExternalPage] = useState(0)
  const [externalHasMore, setExternalHasMore] = useState(false)
  const [externalBusy, setExternalBusy] = useState(false)
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

  const externalFilterKey = useMemo(() => {
    if (availabilityFilter || priceFilter) return 'disabled'
    const q = debouncedQuery.trim()
    const qClean = q.split(',').join(' ').slice(0, 60)
    return `q=${qClean.toLowerCase()}:cat=${category || '-'}`
  }, [availabilityFilter, priceFilter, debouncedQuery, category])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    ;(async () => {
      try {
        const [parsedBusinesses, parsedReviews, fetchedServices, fetchedWindows] = await Promise.all([
          getOrSetCachedAsync({
            key: 'esplora_businesses_v4_public_profile',
            ttlMs: 60_000,
            fn: async () => {
              const bRes = await supabase
                .from('businesses')
                .select(
                  'id,owner_user_id,name,slug,category,description,address_text,city,postal_code,logo_url,gallery_urls,public_profile_settings,is_paused,listing_visible,lat,lng,deposit_enabled,deposit_rule,deposit_fixed_cents,deposit_percent,deposit_min_cents,deposit_max_cents,created_at,updated_at,approval_mode',
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
    let mounted = true
    ;(async () => {
      try {
        if (externalFilterKey === 'disabled') {
          if (mounted) {
            setExternalListings([])
            setExternalPage(0)
            setExternalHasMore(false)
            setExternalBusy(false)
          }
          return
        }

        const q = debouncedQuery.trim()
        const qClean = q.split(',').join(' ').slice(0, 60)
        const pageSize = 260
        const from = 0
        const to = from + pageSize
        const cacheKey = `esplora_external_business_listings_v3:${externalFilterKey}:p=0`

        if (mounted) {
          setExternalListings([])
          setExternalPage(0)
          setExternalHasMore(false)
          setExternalBusy(true)
        }

        const parsedExternalListings = await getOrSetCachedAsync({
          key: cacheKey,
          ttlMs: 45_000,
          fn: async () => {
            try {
              let query = supabase
                .from('external_business_listings_public')
                .select(
                  'id,slug,name,category,description,address_text,city,postal_code,province,region,country_code,lat,lng,phone,email,website,listing_status,source,data_checked_at,imported_at,claimed_business_id',
                )
                .order('imported_at', { ascending: false })
                .range(from, to)

              if (category) query = query.eq('category', category)
              if (qClean) {
                const like = `%${qClean}%`
                query = query.ilike('search_text', like)
              }

              const res = await query
              if (res.error) throw res.error
              const parsed = (((res.data as unknown[]) ?? []) as unknown[])
                .map((x) => safeParseExternalBusinessListingRow(x))
                .filter(Boolean) as ExternalBusinessListingRow[]
              const hasMore = parsed.length > pageSize
              const rows = hasMore ? parsed.slice(0, pageSize) : parsed
              return { rows, hasMore }
            } catch (e) {
              const msg = errorMessage(e).toLowerCase()
              if (
                msg.includes('external_business_listings') ||
                msg.includes('does not exist') ||
                msg.includes('relation') ||
                msg.includes('cannot read') ||
                msg.includes('is not a function')
              ) {
                return { rows: [] as ExternalBusinessListingRow[], hasMore: false }
              }
              throw e
            }
          },
        })

        if (!mounted) return
        setExternalListings(parsedExternalListings.rows)
        setExternalHasMore(parsedExternalListings.hasMore)
        setExternalPage(1)
      } catch {
        if (!mounted) return
        setExternalListings([])
        setExternalHasMore(false)
        setExternalPage(0)
      } finally {
        if (mounted) setExternalBusy(false)
      }
    })()

    return () => {
      mounted = false
    }
  }, [externalFilterKey, availabilityFilter, priceFilter, debouncedQuery, category])

  const loadMoreExternal = async () => {
    if (externalBusy) return
    if (!externalHasMore) return
    if (availabilityFilter || priceFilter) return

    const q = debouncedQuery.trim()
    const qClean = q.split(',').join(' ').slice(0, 60)
    const pageSize = 260
    const page = externalPage
    const from = page * pageSize
    const to = from + pageSize
    const cacheKey = `esplora_external_business_listings_v3:${externalFilterKey}:p=${page}`

    setExternalBusy(true)
    try {
      const next = await getOrSetCachedAsync({
        key: cacheKey,
        ttlMs: 45_000,
        fn: async () => {
          let query = supabase
            .from('external_business_listings_public')
            .select(
              'id,slug,name,category,description,address_text,city,postal_code,province,region,country_code,lat,lng,phone,email,website,listing_status,source,data_checked_at,imported_at,claimed_business_id',
            )
            .order('imported_at', { ascending: false })
            .range(from, to)

          if (category) query = query.eq('category', category)
          if (qClean) {
            const like = `%${qClean}%`
            query = query.or(`name.ilike.${like},city.ilike.${like},address_text.ilike.${like}`)
          }

          const res = await query
          if (res.error) throw res.error
          const parsed = (((res.data as unknown[]) ?? []) as unknown[])
            .map((x) => safeParseExternalBusinessListingRow(x))
            .filter(Boolean) as ExternalBusinessListingRow[]
          const hasMore = parsed.length > pageSize
          const rows = hasMore ? parsed.slice(0, pageSize) : parsed
          return { rows, hasMore }
        },
      })

      setExternalListings((prev) => {
        const byId = new Map<string, ExternalBusinessListingRow>()
        for (const x of prev) byId.set(x.id, x)
        for (const x of next.rows) byId.set(x.id, x)
        return Array.from(byId.values())
      })
      setExternalHasMore(next.hasMore)
      setExternalPage((p) => p + 1)
    } catch {
      setExternalHasMore(false)
    } finally {
      setExternalBusy(false)
    }
  }

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

  type ExploreBusinessItem = {
    kind: 'business'
    id: string
    business: BusinessRow
    createdAt: string
    distanceKm: number | null
    ratingAvg: number | null
    ratingCount: number
    avgPrice: number | null
    hasToday: boolean
  }

  type ExploreExternalItem = {
    kind: 'external'
    id: string
    listing: ExternalBusinessListingRow
    createdAt: string
    distanceKm: number | null
  }

  type ExploreItem = ExploreBusinessItem | ExploreExternalItem

  const filteredAll = useMemo(() => {
    const q = debouncedQuery
    const qLower = q.trim().toLowerCase()

    const today = new Date()
    const todayDay = openingWindowWeekdayJs(today)
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    const tomorrowDay = openingWindowWeekdayJs(tomorrow)

    const businessItems: ExploreBusinessItem[] = businesses
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
          kind: 'business',
          id: `b:${b.id}`,
          business: b,
          createdAt: b.created_at,
          distanceKm,
          ratingAvg: stats?.avg ?? null,
          ratingCount: stats?.count ?? 0,
          avgPrice,
          hasToday: weekdaysOpenByBusinessId.get(b.id)?.has(todayDay) ?? false,
        }
      })

    const externalItems: ExploreExternalItem[] = externalListings
      .filter((l) => {
        if (availabilityFilter || priceFilter) return false
        if (l.listing_status === 'blocked') return false
        if (l.lat === null || l.lng === null) return false
        if (!Number.isFinite(l.lat) || !Number.isFinite(l.lng)) return false
        if (category && l.category !== category) return false
        if (qLower && !matchBusiness(l, q)) return false
        if (userLoc && maxDistanceKm !== null) {
          const d = haversineKm(userLoc, { lat: l.lat, lng: l.lng })
          if (d > maxDistanceKm) return false
        }
        return true
      })
      .map((l) => {
        const distanceKm = userLoc ? haversineKm(userLoc, { lat: l.lat as number, lng: l.lng as number }) : null
        return {
          kind: 'external',
          id: `l:${l.id}`,
          listing: l,
          createdAt: l.imported_at,
          distanceKm,
        }
      })

    const items: ExploreItem[] = [...businessItems, ...externalItems]

    return items.sort((a, b) => {
      if (effectiveSort === 'distance') {
        if (a.distanceKm === null || b.distanceKm === null) return 0
        return a.distanceKm - b.distanceKm
      }
      if (effectiveSort === 'rating') {
        const av = a.kind === 'business' ? (a.ratingAvg ?? -1) : -1
        const bv = b.kind === 'business' ? (b.ratingAvg ?? -1) : -1
        if (bv !== av) return bv - av
        const ac = a.kind === 'business' ? a.ratingCount : 0
        const bc = b.kind === 'business' ? b.ratingCount : 0
        if (bc !== ac) return bc - ac
        return b.createdAt.localeCompare(a.createdAt)
      }
      if (effectiveSort === 'relevance') {
        const ar = a.kind === 'business' ? relevanceScore(a.business, qLower) : relevanceScore(a.listing, qLower)
        const br = b.kind === 'business' ? relevanceScore(b.business, qLower) : relevanceScore(b.listing, qLower)
        if (br !== ar) return br - ar
        const av = a.kind === 'business' ? (a.ratingAvg ?? -1) : -1
        const bv = b.kind === 'business' ? (b.ratingAvg ?? -1) : -1
        if (bv !== av) return bv - av
        if (a.distanceKm !== null && b.distanceKm !== null && a.distanceKm !== b.distanceKm) return a.distanceKm - b.distanceKm
        return b.createdAt.localeCompare(a.createdAt)
      }
      return b.createdAt.localeCompare(a.createdAt)
    })
  }, [
    businesses,
    externalListings,
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
      if (x.kind !== 'business') continue
      if (favorites.has(x.business.id)) return x.business
    }
    return null
  }, [favorites, filteredAll])

  const featuredTop = useMemo(() => {
    let best: { b: BusinessRow; avg: number; count: number } | null = null
    for (const x of filteredAll) {
      if (x.kind !== 'business') continue
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
              setSelectedId(`b:${featuredFavorite.id}`)
              window.setTimeout(() => {
                document.getElementById('tb-results-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }, 50)
            }}
            featuredTopName={featuredTop?.name ?? null}
            onOpenTop={() => {
              if (!featuredTop) return
              setSelectedId(`b:${featuredTop.id}`)
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
                      businesses={filteredAll.map((x) =>
                        x.kind === 'business'
                          ? {
                              id: x.id,
                              lat: x.business.lat,
                              lng: x.business.lng,
                              name: x.business.name,
                              category: x.business.category,
                              ratingAvg: x.ratingAvg,
                              reviewCount: x.ratingCount,
                              avgPrice: x.avgPrice,
                              hasToday: x.hasToday,
                              isPaused: x.business.is_paused,
                              kind: 'business',
                              path: businessPublicPath(x.business),
                            }
                          : {
                              id: x.id,
                              lat: x.listing.lat as number,
                              lng: x.listing.lng as number,
                              name: x.listing.name,
                              category: x.listing.category,
                              isPaused: true,
                              kind: 'external',
                              path: x.listing.claimed_business_id
                                ? `/attivita/${encodeURIComponent(x.listing.claimed_business_id)}`
                                : `/scheda/${encodeURIComponent(x.listing.slug)}`,
                            },
                      )}
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
                ) : businesses.length === 0 && externalListings.length === 0 ? (
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
                    {filteredVisible.map((x) => {
                      if (x.kind === 'business') {
                        const b = x.business
                        const active = selectedId === x.id
                        const isFav = favorites.has(b.id)
                        return (
                          <BusinessResultCard
                            key={x.id}
                            business={b}
                            active={active}
                            distanceKm={x.distanceKm}
                            avgRating={x.ratingAvg}
                            reviewCount={x.ratingCount}
                            avgPrice={x.avgPrice}
                            hasToday={x.hasToday}
                            userId={userId}
                            isFav={isFav}
                            onSelect={() => setSelectedId(x.id)}
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
                      }

                      return (
                        <ExternalListingResultCard
                          key={x.id}
                          listing={x.listing}
                          active={selectedId === x.id}
                          distanceKm={x.distanceKm}
                          onSelect={() => setSelectedId(x.id)}
                        />
                      )
                    })}

                    {filteredAll.length > filteredVisible.length ? (
                      <div className="pt-2">
                        <Button type="button" variant="secondary" className="w-full" onClick={() => setVisibleCount((v) => v + 12)}>
                          Mostra altri ({filteredAll.length - filteredVisible.length})
                        </Button>
                      </div>
                    ) : externalHasMore && !availabilityFilter && !priceFilter ? (
                      <div className="pt-2">
                        <Button
                          type="button"
                          variant="secondary"
                          className="w-full"
                          disabled={externalBusy}
                          onClick={async () => {
                            await loadMoreExternal()
                            setVisibleCount((v) => v + 12)
                          }}
                        >
                          {externalBusy ? 'Caricamento risultati…' : 'Carica altri risultati'}
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
