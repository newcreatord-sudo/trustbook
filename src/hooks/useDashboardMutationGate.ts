import { useCallback, useRef, useState } from 'react'

/**
 * Gate per mutation dashboard: il ref blocca immediatamente i doppi tap prima che React
 * aggiorni lo stato; `busy` pilota spinner/disabled nell’UI (dialog incluso).
 */
export function useDashboardMutationGate() {
  const heldRef = useRef(false)
  const [busy, setBusy] = useState(false)

  const begin = useCallback((): boolean => {
    if (heldRef.current) return false
    heldRef.current = true
    setBusy(true)
    return true
  }, [])

  const end = useCallback(() => {
    heldRef.current = false
    setBusy(false)
  }, [])

  /** Utile nei guard sincroni quando `busy` non è ancora committato dal batch React */
  const isHeld = useCallback(() => heldRef.current, [])

  const runExclusive = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      if (!begin()) return undefined
      try {
        return await fn()
      } finally {
        end()
      }
    },
    [begin, end],
  )

  return { busy, begin, end, isHeld, runExclusive }
}
