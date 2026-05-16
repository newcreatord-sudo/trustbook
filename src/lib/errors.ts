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

export type ApiFailureDisplay = {
  title: string
  probableCause: string
  nextStep: string
  requestId: string | null
}

function apiNextStep(status: number): string {
  if (status === 401) return 'Accedi di nuovo e ripeti l’operazione.'
  if (status === 403) return 'Non hai i permessi per questa azione. Se dovrebbe essere consentita, contatta il supporto.'
  if (status === 404) return 'Aggiorna la pagina e verifica che l’elemento esista ancora.'
  if (status === 409) return 'Aggiorna i dati e riprova: qualcosa è cambiato mentre stavi operando.'
  if (status === 422) return 'Controlla i dati inseriti e riprova.'
  if (status === 429) return 'Attendi qualche secondo prima di riprovare.'
  if (status >= 500) return 'Riprova tra poco. Se il problema continua, invia l’ID richiesta al supporto.'
  return 'Riprova tra poco. Se il problema continua, invia l’ID richiesta al supporto.'
}

export function failureFromError(error: unknown, title = 'Operazione non completata'): ApiFailureDisplay {
  return {
    title,
    probableCause: errorMessage(error, 'Errore non specificato.'),
    nextStep: 'Riprova tra poco. Se il problema continua, contatta il supporto.',
    requestId: null,
  }
}

export async function parseApiFailure(
  response: Response,
  fallbackTitle = 'Operazione non completata',
  payloadArg?: { error?: unknown; message?: unknown } | null,
): Promise<ApiFailureDisplay> {
  const payload =
    payloadArg ??
    ((await response.json().catch(() => null)) as
      | null
      | { error?: unknown; message?: unknown })
  const detail =
    (typeof payload?.error === 'string' && payload.error.trim()) ||
    (typeof payload?.message === 'string' && payload.message.trim()) ||
    response.statusText ||
    'Errore non specificato.'

  const requestId = response.headers.get('X-Request-Id') || response.headers.get('x-request-id')

  return {
    title: fallbackTitle,
    probableCause: detail,
    nextStep: apiNextStep(response.status),
    requestId: requestId?.trim() || null,
  }
}
