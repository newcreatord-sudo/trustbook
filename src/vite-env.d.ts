/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Map ID Google Cloud (AdvancedMarker); in dev può restare vuoto se si usa fallback DEMO_MAP_ID_2 lato MapView */
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string
}
