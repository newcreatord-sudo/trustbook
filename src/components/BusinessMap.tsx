import { useState, useMemo } from 'react'
import type { BusinessRow } from '@/domain/supabase'
import Button from '@/shared/ui/Button'
import { APIProvider, Map, AdvancedMarker, Pin } from '@vis.gl/react-google-maps'

export default function BusinessMap(props: { business: Pick<BusinessRow, 'lat' | 'lng'> }) {
  const token = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined
  const mapIdEnv =
    typeof import.meta.env.VITE_GOOGLE_MAPS_MAP_ID === 'string' ? import.meta.env.VITE_GOOGLE_MAPS_MAP_ID.trim() : ''
  const mapId = mapIdEnv || (import.meta.env.DEV ? 'DEMO_MAP_ID_2' : '')
  const canUseMap = Boolean(token)
  const [mapFailed, setMapFailed] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)

  const center = useMemo(
    () => ({ lat: props.business.lat, lng: props.business.lng }),
    [props.business.lat, props.business.lng]
  )

  if (!canUseMap) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
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
      <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
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
      <div className="flex h-full items-center justify-center rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
        <div>
          <div className="text-sm font-semibold text-white">Mappa non disponibile</div>
          <div className="mt-1 text-xs text-white/70">{mapError ?? 'Controlla la API Key di Google Maps o blocchi di rete.'}</div>
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
    <div className="h-full w-full rounded-2xl overflow-hidden">
      <APIProvider 
        apiKey={token!} 
        onError={() => {
          setMapError('Errore caricamento script Google Maps')
          setMapFailed(true)
        }}
      >
        <Map
          defaultZoom={14}
          defaultCenter={center}
          center={center}
          disableDefaultUI={true}
          gestureHandling="none"
          mapId={mapId}
        >
          <AdvancedMarker position={center}>
            <Pin background="#4F7CFF" borderColor="#2E5BEB" glyphColor="#fff" />
          </AdvancedMarker>
        </Map>
      </APIProvider>
    </div>
  )
}
