type CacheEntry<T> = {
  expiresAt: number
  value: T
}

const cache = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

export function clearQueryCache(): void {
  cache.clear()
  inflight.clear()
}

export function getCached<T>(key: string): T | null {
  const e = cache.get(key)
  if (!e) return null
  if (Date.now() > e.expiresAt) {
    cache.delete(key)
    return null
  }
  return e.value as T
}

export function setCached<T>(key: string, value: T, ttlMs: number): void {
  cache.set(key, { value, expiresAt: Date.now() + Math.max(0, ttlMs) })
}

export async function getOrSetCachedAsync<T>(params: { key: string; ttlMs: number; fn: () => Promise<T> }): Promise<T> {
  const hit = getCached<T>(params.key)
  if (hit !== null) return hit

  const inFlight = inflight.get(params.key)
  if (inFlight) return (await inFlight) as T

  const p = (async () => {
    const v = await params.fn()
    setCached(params.key, v, params.ttlMs)
    return v
  })()

  inflight.set(params.key, p)
  try {
    return await p
  } finally {
    inflight.delete(params.key)
  }
}
