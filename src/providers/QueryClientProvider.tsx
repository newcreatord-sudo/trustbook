import { QueryClient, QueryClientProvider as RQProvider } from '@tanstack/react-query'
import { persistQueryClient } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { useMemo, type ReactNode } from 'react'
import { captureException } from '@/lib/observability'

/**
 * App-wide TanStack Query client.
 *
 * Design:
 *   - 1 min default stale time: most lists tolerate 60s of stale data and the
 *     realtime channels will invalidate proactively when payloads arrive.
 *   - retry: 2 with exponential backoff capped at 4s; retries are skipped for
 *     401/403 because they indicate auth issues that the AuthProvider handles.
 *   - Errors are forwarded to the observability layer so we have one place to
 *     monitor data fetching failures.
 *   - Persisted to `localStorage` so the app can render cached lists during
 *     the first paint even when offline. We refuse to persist sensitive
 *     queries by inspecting the cache `meta.persist === false`.
 *
 * The existing `queryCache.ts` is intentionally left in place; pages migrate to
 * react-query incrementally. No code or function is removed.
 */
export default function QueryClientProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => {
    const c = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 60_000,
          gcTime: 24 * 60 * 60_000,
          retry: (failureCount, error) => {
            const status = (error as { status?: number; statusCode?: number })?.status ?? (error as { statusCode?: number })?.statusCode
            if (status === 401 || status === 403 || status === 404) return false
            return failureCount < 2
          },
          retryDelay: (attempt) => Math.min(4000, 250 * 2 ** attempt),
          refetchOnWindowFocus: false,
          refetchOnReconnect: true,
        },
        mutations: {
          onError: (err) => captureException(err, { source: 'react-query-mutation' }),
        },
      },
    })

    if (typeof window !== 'undefined') {
      try {
        const persister = createSyncStoragePersister({ storage: window.localStorage, key: 'tb-query-cache-v1' })
        void persistQueryClient({
          queryClient: c,
          persister,
          maxAge: 24 * 60 * 60_000,
          dehydrateOptions: {
            shouldDehydrateQuery: (query) => {
              const persist = (query.meta as { persist?: boolean } | undefined)?.persist
              return persist !== false
            },
          },
        })
      } catch (e) {
        captureException(e, { source: 'query-cache-persist' })
      }
    }

    return c
  }, [])

  return <RQProvider client={client}>{children}</RQProvider>
}
