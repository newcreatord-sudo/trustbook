export function errorMessage(error: unknown, fallback = 'Errore.') {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}

export type ApiFailureDisplay = {
  title: string
  probableCause: string
  nextStep: string
  requestId?: string | null
}

function errorText(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  const msg = (error as { message?: unknown })?.message
  return typeof msg === 'string' ? msg : ''
}

export function failureFromError(error: unknown, title = 'Operazione non completata'): ApiFailureDisplay {
  const raw = errorText(error)
  const msg = raw.toLowerCase()

  if (msg.includes('not_authenticated') || msg.includes('jwt') || msg.includes('unauthorized')) {
    return {
      title,
      probableCause: 'Sessione scaduta o non valida.',
      nextStep: 'Ricarica la pagina. Se persiste, esci e rientra.',
      requestId: null,
    }
  }

  if (msg.includes('member_only') || msg.includes('owner_only') || msg.includes('not_allowed') || msg.includes('forbidden')) {
    return {
      title,
      probableCause: 'Permessi insufficienti per completare l’azione.',
      nextStep: 'Verifica di essere owner/staff dell’attività o cambia profilo.',
      requestId: null,
    }
  }

  if (msg.includes('failed to fetch') || msg.includes('network') || msg.includes('timeout') || msg.includes('enotfound')) {
    return {
      title,
      probableCause: 'Problema di rete o servizio momentaneamente non raggiungibile.',
      nextStep: 'Controlla connessione e riprova. Se persiste, attendi 1–2 minuti e riprova.',
      requestId: null,
    }
  }

  return {
    title,
    probableCause: raw || 'Errore non classificato.',
    nextStep: 'Riprova. Se persiste, segnala l’orario e lo step esatto.',
    requestId: null,
  }
}
