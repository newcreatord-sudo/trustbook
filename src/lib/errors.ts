export function errorMessage(error: unknown, fallback = 'Errore.') {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}

