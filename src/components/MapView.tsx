import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import Button from '@/shared/ui/Button'
import { APIProvider, Map, AdvancedMarker, Pin, useMap, InfoWindow } from '@vis.gl/react-google-maps'
import { Star, ChevronRight, Euro, CalendarClock } from 'lucide-react'
import { formatMoneyEUR } from '@/utils/time'

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
}

function MapController({ businesses }: { businesses: MapBusiness[] }) {
  const map = useMap()
  
  useEffect(() => {
    if (!map || businesses.length === 0) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bounds = new (window as any).google.maps.LatLngBounds()
    businesses.forEach((b: MapBusiness) => bounds.extend({ lat: b.lat, lng: b.lng }))
    map.fitBounds(bounds, 50)
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
  const token = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  const mapIdEnv =
    typeof import.meta.env.VITE_GOOGLE_MAPS_MAP_ID === 'string' ? import.meta.env.VITE_GOOGLE_MAPS_MAP_ID.trim() : ''
  /** In dev si può usare la Map ID demo Google; in prod serve una Map ID del progetto (nessun fallback demo). */
  const mapId = mapIdEnv || (import.meta.env.DEV ? 'DEMO_MAP_ID_2' : '')
  const canUseMap = Boolean(token)
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
    return (
      <div className="flex h-[400px] md:h-full w-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
        <div>
          <div className="text-sm font-semibold text-white">Mappa non disponibile</div>
          <div className="mt-1 text-xs text-white/70">{mapError ?? 'Controlla la API Key di Google Maps.'}</div>
          <div className="mt-3 flex justify-center">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setMapFailed(false)
                setMapError(null)
              }}
            >
              Riprova
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-[400px] md:h-full w-full overflow-hidden">
      <APIProvider 
        apiKey={token!} 
        onError={() => {
          setMapError('Errore script Google Maps')
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
                background={props.selectedBusinessId === b.id ? "#fff" : "#4F7CFF"} 
                borderColor={props.selectedBusinessId === b.id ? "#fff" : "#2E5BEB"} 
                glyphColor={props.selectedBusinessId === b.id ? "#4F7CFF" : "#fff"} 
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
                      to={`/attivita/${encodeURIComponent(b.id)}`}
                      className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#4F7CFF] px-3 py-2 text-xs font-bold text-white transition-all hover:bg-[#4F7CFF]/90 shadow-sm"
                    >
                      {b.isPaused ? 'In pausa' : 'Prenota ora'}
                      {!b.isPaused && <ChevronRight className="h-3 w-3" />}
                    </Link>
                  </div>
                </InfoWindow>
              )}
            </AdvancedMarker>
          ))}
        </Map>
      </APIProvider>
    </div>
  )
}
