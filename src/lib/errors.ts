export function errorMessage(error: unknown, fallback = 'Errore.') {
  if (error && typeof error === 'object') {
    const anyErr = error as { name?: unknown; message?: unknown }
    if (anyErr.name === 'AbortError') return ''
    if (typeof anyErr.message === 'string' && anyErr.message.length > 0) return anyErr.message
  }
  if (error instanceof Error) return error.message || fallback
  if (typeof error === 'string') return error || fallback
  return fallback
}

