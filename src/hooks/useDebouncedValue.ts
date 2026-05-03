import { useEffect, useState } from 'react'

export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState<T>(value)

  useEffect(() => {
    const t = globalThis.setTimeout(() => setDebounced(value), Math.max(0, delayMs))
    return () => globalThis.clearTimeout(t)
  }, [delayMs, value])

  return debounced
}

