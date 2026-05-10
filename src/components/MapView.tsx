import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Button from '@/shared/ui/Button'
import { APIProvider, Map, AdvancedMarker, Pin, useMap, InfoWindow } from '@vis.gl/react-google-maps'
import { Star, ChevronRight, Euro, CalendarClock } from 'lucide-react'
import { formatMoneyEUR } from '@/utils/time'
import InlineErrorBoundary from '@/components/InlineErrorBoundary'
import GoogleMapsEmbed from '@/components/GoogleMapsEmbed'

export type MapBusiness = { 
  id: string; 
  lat: number; 
  lng: number; 
  name: string; 
  category: string; 
  ratingAvg?: number | null; 
  reviewCount?: number; 
  avgPrice?: number | null; 
  hasToday?: boolean;
  isPaused?: boolean;
  kind?: 'business' | 'external';
  path?: string;
}

function MapController({ businesses }: { businesses: MapBusiness[] }) {
  const map = useMap()
  
  useEffect(() => {
    if (!map || businesses.length === 0) return
    type LatLngBoundsLike = { extend: (p: { lat: number; lng: number }) => void }
    type GoogleMapsWindow = { google?: { maps?: { LatLngBounds?: new () => LatLngBoundsLike } } }
    const g = (window as unknown as GoogleMapsWindow).google
    if (!g?.maps?.LatLngBounds) return
    try {
      const bounds = new g.maps.LatLngBounds()
      businesses.forEach((b: MapBusiness) => bounds.extend({ lat: b.lat, lng: b.lng }))
      map.fitBounds(bounds, 50)
    } catch {
      void 0
    }
  }, [map, businesses])

  return null
}

export default function MapView(props: {
  businesses: MapBusiness[]
  selectedBusinessId?: string | null
  onSelect: (businessId: string) => void
  center?: { lat: number; lng: number } | null
  centerZoom?: number
}) {
  const tokenRaw = useMemo(() => {
    const v = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
    return typeof v === 'string' ? v.trim() : ''
  }, [])
  const mapIdEnv =
    typeof import.meta.env.VITE_GOOGLE_MAPS_MAP_ID === 'string' ? import.meta.env.VITE_GOOGLE_MAPS_MAP_ID.trim() : ''
  /** In dev si può usare la Map ID demo Google; in prod serve una Map ID del progetto (nessun fallback demo). */
  const mapId = mapIdEnv || (import.meta.env.DEV ? 'DEMO_MAP_ID_2' : '')
  const canUseMap = tokenRaw.length > 0
  const [mapFailed, setMapFailed] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)
  const [infoWindowOpen, setInfoWindowOpen] = useState<string | null>(null)

  // Sync external selection with InfoWindow
  useEffect(() => {
    if (props.selectedBusinessId) {
      setInfoWindowOpen(props.selectedBusinessId)
    } else {
      setInfoWindowOpen(null)
    }
  }, [props.selectedBusinessId])

  if (!canUseMap) {
    return (
      <div className="flex h-[400px] md:h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
        <div>
          <div className="text-sm font-semibold text-white">Mappa disattivata</div>
          <div className="mt-1 text-xs text-white/70">
            Imposta <span className="font-mono">VITE_GOOGLE_MAPS_API_KEY</span> per vedere la mappa.
          </div>
        </div>
      </div>
    )
  }

  if (!mapId) {
    return (
      <div className="flex h-[400px] md:h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
        <div>
          <div className="text-sm font-semibold text-white">Map ID non configurato</div>
          <div className="mt-1 text-xs text-white/70">
            Per la mappa in produzione serve{' '}
            <span className="font-mono">VITE_GOOGLE_MAPS_MAP_ID</span> dalla Google Cloud Console (Map Management).
          </div>
        </div>
      </div>
    )
  }

  if (mapFailed) {
    const fallbackCenter = props.center ?? { lat: 41.9028, lng: 12.4964 }
    return (
      <div className="h-[400px] md:h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5">
        <GoogleMapsEmbed
          lat={fallbackCenter.lat}
          lng={fallbackCenter.lng}
          zoom={props.centerZoom ?? 10}
          title="Mappa (embed)"
        />
        <div className="border-t border-white/10 p-3 text-center">
          <div className="text-xs text-white/70">{mapError ?? 'Mappa interattiva non disponibile, modalità embed attiva.'}</div>
          <div className="mt-2 flex justify-center">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setMapFailed(false)
                setMapError(null)
              }}
            >
              Riprova interattiva
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[400px] md:h-full w-full overflow-hidden">
      <InlineErrorBoundary
        fallback={
          <div className="h-[400px] md:h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <GoogleMapsEmbed
              lat={(props.center ?? { lat: 41.9028, lng: 12.4964 }).lat}
              lng={(props.center ?? { lat: 41.9028, lng: 12.4964 }).lng}
              zoom={props.centerZoom ?? 10}
              title="Mappa (embed)"
            />
            <div className="border-t border-white/10 p-3 text-center">
              <div className="text-xs text-white/70">Mappa interattiva non disponibile, modalità embed attiva.</div>
            </div>
          </div>
        }
      >
        <APIProvider
          apiKey={tokenRaw}
          libraries={['marker']}
          onError={(e) => {
            const msg =
              e instanceof Error
                ? e.message
                : typeof e === 'string'
                  ? e
                  : 'Errore caricamento Google Maps'
            setMapError(msg)
            setMapFailed(true)
          }}
        >
          <Map
            defaultZoom={props.centerZoom ?? 5}
            defaultCenter={props.center ?? { lat: 41.9028, lng: 12.4964 }}
            mapId={mapId}
            disableDefaultUI={false}
            streetViewControl={false}
            mapTypeControl={false}
            clickableIcons={false}
          >
            <MapController businesses={props.businesses} />
            {props.businesses.map((b) => (
              <AdvancedMarker
                key={b.id}
                position={{ lat: b.lat, lng: b.lng }}
                onClick={() => {
                  props.onSelect(b.id)
                  setInfoWindowOpen(b.id)
                }}
              >
                <Pin
                  background={props.selectedBusinessId === b.id ? '#fff' : '#4F7CFF'}
                  borderColor={props.selectedBusinessId === b.id ? '#fff' : '#2E5BEB'}
                  glyphColor={props.selectedBusinessId === b.id ? '#4F7CFF' : '#fff'}
                />

                {infoWindowOpen === b.id && (
                  <InfoWindow
                    position={{ lat: b.lat, lng: b.lng }}
                    onCloseClick={() => {
                      setInfoWindowOpen(null)
                    }}
                    headerContent={<div className="font-bold text-[#0B1220]">{b.name}</div>}
                  >
                    <div className="flex flex-col gap-2 p-1 min-w-[200px] text-[#0B1220]">
                      <div className="text-xs text-slate-600 font-medium flex items-center justify-between">
                        <span>{b.category}</span>
                        <div className="flex items-center gap-1">
                          <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                          <span className="font-bold">{b.ratingAvg ? b.ratingAvg.toFixed(1) : 'Nuovo'}</span>
                          <span className="text-slate-400">({b.reviewCount || 0})</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-xs font-semibold mt-1">
                        {b.avgPrice !== null && b.avgPrice !== undefined && (
                          <span className="flex items-center gap-0.5 bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                            <Euro className="h-3 w-3" /> {formatMoneyEUR(b.avgPrice)}
                          </span>
                        )}
                        {b.hasToday && (
                          <span className="flex items-center gap-0.5 bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">
                            <CalendarClock className="h-3 w-3" /> Oggi
                          </span>
                        )}
                      </div>

                      <Link
                        to={b.path ?? `/attivita/${encodeURIComponent(b.id)}`}
                        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#4F7CFF] px-3 py-2 text-xs font-bold text-white transition-all hover:bg-[#4F7CFF]/90 shadow-sm"
                      >
                        {b.kind === 'external'
                          ? b.path?.startsWith('/attivita/')
                            ? 'Apri attività'
                            : 'Vedi scheda'
                          : b.isPaused
                            ? 'In pausa'
                            : 'Prenota ora'}
                        {b.kind !== 'external' && !b.isPaused && <ChevronRight className="h-3 w-3" />}
                      </Link>
                    </div>
                  </InfoWindow>
                )}
              </AdvancedMarker>
            ))}
          </Map>
        </APIProvider>
      </InlineErrorBoundary>
    </div>
  )
}
