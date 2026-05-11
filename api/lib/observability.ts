/**
 * Backend observability shim.
 *
 *  - Wraps optional `@sentry/node` initialization (DSN read from SENTRY_DSN).
 *  - Exposes `logEvent(level, message, fields)` as structured JSON line on
 *    stdout. This is intentionally dependency-free so it works even when
 *    no APM is configured.
 *  - `captureBackendException` mirrors the client surface.
 */

type SentryNS = typeof import('@sentry/node')

let sentryRef: SentryNS | null = null
let initPromise: Promise<void> | null = null

function readEnvVar(key: string): string | null {
  const v = process.env[key]
  return typeof v === 'string' && v.length > 0 ? v : null
}

export function initBackendObservability(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    const dsn = readEnvVar('SENTRY_DSN')
    if (!dsn) return
    try {
      const Sentry = (await import('@sentry/node')) as SentryNS
      Sentry.init({
        dsn,
        environment: readEnvVar('NODE_ENV') ?? 'production',
        release: readEnvVar('RELEASE_TAG') ?? undefined,
        tracesSampleRate: 0.1,
        sendDefaultPii: false,
      })
      sentryRef = Sentry
    } catch (e) {
      process.stderr.write(`[observability] Sentry backend init failed: ${e instanceof Error ? e.message : String(e)}\n`)
    }
  })()
  return initPromise
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export function logEvent(level: LogLevel, message: string, fields: Record<string, unknown> = {}): void {
  const line = {
    ts: new Date().toISOString(),
    level,
    message,
    ...fields,
  }
  const target = level === 'error' ? process.stderr : process.stdout
  try {
    target.write(JSON.stringify(line) + '\n')
  } catch {
    target.write(`[log] ${level} ${message}\n`)
  }
}

export function captureBackendException(error: unknown, context: Record<string, unknown> = {}): void {
  logEvent('error', error instanceof Error ? error.message : String(error), {
    ...context,
    stack: error instanceof Error ? error.stack : undefined,
  })
  if (sentryRef) {
    sentryRef.captureException(error, { extra: context })
  }
}
