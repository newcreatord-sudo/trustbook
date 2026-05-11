/**
 * Observability bootstrap (FE).
 *
 * Goals:
 *  - Initialize Sentry only when `VITE_SENTRY_DSN` is present (no-op otherwise).
 *  - Initialize PostHog only when `VITE_POSTHOG_KEY` is present (no-op otherwise).
 *  - Provide a uniform `captureException(err, context)` and `track(event, props)`
 *    surface that callers can use without knowing whether the providers are
 *    actually loaded. Dynamic imports keep the bundle lean when keys are absent.
 *
 * Privacy:
 *  - Sentry replay/session sampling intentionally low (0.05) and masks all text
 *    by default. Do NOT capture PII without explicit consent.
 *  - PostHog person profiles disabled by default; we send event-only telemetry.
 *
 * Why no static import: tree-shaking + bundle budget. If keys are missing in dev
 * we ship zero observability code.
 */

type SentryNS = typeof import('@sentry/react')
type PosthogNS = typeof import('posthog-js')

let sentryRef: SentryNS | null = null
let posthogRef: PosthogNS['default'] | null = null
let bootPromise: Promise<void> | null = null

function readEnv(key: string): string | null {
  try {
    const v = (import.meta.env as Record<string, string | undefined>)[key]
    return typeof v === 'string' && v.length > 0 ? v : null
  } catch {
    return null
  }
}

/** Best-effort: never throws. Resolves once providers have attempted load. */
export function initObservability(): Promise<void> {
  if (bootPromise) return bootPromise
  bootPromise = (async () => {
    const sentryDsn = readEnv('VITE_SENTRY_DSN')
    const posthogKey = readEnv('VITE_POSTHOG_KEY')
    const posthogHost = readEnv('VITE_POSTHOG_HOST') ?? 'https://eu.posthog.com'
    const release = readEnv('VITE_RELEASE_TAG') ?? undefined
    const environment = readEnv('VITE_RUNTIME_ENV') ?? (import.meta.env.PROD ? 'production' : 'development')

    if (sentryDsn) {
      try {
        const Sentry = (await import('@sentry/react')) as SentryNS
        Sentry.init({
          dsn: sentryDsn,
          environment,
          release,
          tracesSampleRate: import.meta.env.PROD ? 0.1 : 0,
          replaysSessionSampleRate: import.meta.env.PROD ? 0.05 : 0,
          replaysOnErrorSampleRate: 1.0,
          sendDefaultPii: false,
          integrations: [
            Sentry.browserTracingIntegration(),
            Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
          ],
          beforeSend(event) {
            if (event.user) {
              event.user = { id: event.user.id }
            }
            return event
          },
        })
        sentryRef = Sentry
      } catch (e) {
        if (!import.meta.env.PROD) console.warn('[observability] Sentry init failed', e)
      }
    }

    if (posthogKey) {
      try {
        const mod = (await import('posthog-js')) as PosthogNS
        const ph = mod.default
        ph.init(posthogKey, {
          api_host: posthogHost,
          person_profiles: 'identified_only',
          capture_pageview: true,
          autocapture: false,
          loaded: (instance) => {
            if (release) instance.register({ release })
          },
        })
        posthogRef = ph
      } catch (e) {
        if (!import.meta.env.PROD) console.warn('[observability] PostHog init failed', e)
      }
    }
  })()
  return bootPromise
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (sentryRef) {
    sentryRef.captureException(error, { extra: context })
  } else if (!import.meta.env.PROD) {
    console.error('[observability:captureException]', error, context)
  }
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, unknown>): void {
  if (sentryRef) {
    sentryRef.captureMessage(message, { level, extra: context })
  } else if (!import.meta.env.PROD) {
    console.log(`[observability:${level}]`, message, context)
  }
}

export function track(eventName: string, properties?: Record<string, unknown>): void {
  if (posthogRef) {
    posthogRef.capture(eventName, properties)
  } else if (!import.meta.env.PROD) {
    console.log('[observability:track]', eventName, properties)
  }
}

export function identifyUser(userId: string, traits?: Record<string, unknown>): void {
  if (sentryRef) sentryRef.setUser({ id: userId })
  if (posthogRef) posthogRef.identify(userId, traits)
}

export function resetUser(): void {
  if (sentryRef) sentryRef.setUser(null)
  if (posthogRef) posthogRef.reset()
}

export function setRequestContext(requestId: string, route?: string): void {
  if (sentryRef) sentryRef.setTag('request_id', requestId)
  if (route && sentryRef) sentryRef.setTag('route', route)
}
