/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Map ID Google Cloud (AdvancedMarker); in dev può restare vuoto se si usa fallback DEMO_MAP_ID_2 lato MapView */
  readonly VITE_GOOGLE_MAPS_MAP_ID?: string
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  readonly VITE_APP_URL?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string

  /** Observability: Sentry DSN (Frontend project). When absent observability init becomes a no-op. */
  readonly VITE_SENTRY_DSN?: string
  /** Product analytics: PostHog project API key. */
  readonly VITE_POSTHOG_KEY?: string
  /** PostHog ingestion host. EU recommended for GDPR. Defaults to https://eu.posthog.com. */
  readonly VITE_POSTHOG_HOST?: string
  /** Build identifier shown in observability dashboards (commit sha or semver). */
  readonly VITE_RELEASE_TAG?: string
  /** Runtime environment label (`production` | `staging` | `development`). */
  readonly VITE_RUNTIME_ENV?: string
  /** Web Push VAPID public key (base64url) used by the service worker to subscribe. */
  readonly VITE_WEB_PUSH_VAPID_PUBLIC_KEY?: string
}
