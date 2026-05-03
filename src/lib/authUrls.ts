function normalizeBaseUrl(raw: string): string {
  const v = raw.trim().replace(/\/+$/, '')
  return v
}

export function appBaseUrlFromEnvOrWindow(): string {
  const env = typeof import.meta.env.VITE_APP_URL === 'string' ? import.meta.env.VITE_APP_URL.trim() : ''
  if (env) return normalizeBaseUrl(env)
  return normalizeBaseUrl(window.location.origin)
}

export function authCallbackUrl(): string {
  return `${appBaseUrlFromEnvOrWindow()}/auth/callback`
}

