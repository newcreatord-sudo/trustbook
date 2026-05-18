export type TrustTier = 'newcomer' | 'reliable' | 'verified' | 'champion' | 'at-risk' | 'blocked'

/**
 * Translates a reliability score (0..100) into tier metadata for UI.
 */
export function computeTrustTier(input: {
  score: number | null | undefined
  completedBookings?: number | null
  noShowCount?: number | null
}): { tier: TrustTier; label: string; description: string } {
  const s = typeof input.score === 'number' && Number.isFinite(input.score) ? input.score : null
  const bookings = typeof input.completedBookings === 'number' ? input.completedBookings : 0
  const noShows = typeof input.noShowCount === 'number' ? input.noShowCount : 0

  if (s === null || bookings < 3) {
    return {
      tier: 'newcomer',
      label: 'Nuovo',
      description: 'Costruisci la tua reputazione: presentati alle prime prenotazioni per sbloccare i tier.',
    }
  }
  if (s < 50) {
    return {
      tier: 'blocked',
      label: 'Bloccato',
      description: 'Affidabilità molto bassa: alcune attività potrebbero rifiutare la prenotazione.',
    }
  }
  if (s < 70) {
    return {
      tier: 'at-risk',
      label: 'A rischio',
      description: 'Mantieni gli appuntamenti per recuperare punteggio. Le caparre potrebbero essere richieste.',
    }
  }
  if (s >= 95 && bookings >= 15 && noShows === 0) {
    return {
      tier: 'champion',
      label: 'Campione',
      description: 'Reputazione massima. Niente caparre quando non richieste dalla policy del business.',
    }
  }
  if (s >= 85 && bookings >= 5) {
    return {
      tier: 'verified',
      label: 'Verificato',
      description: 'Storico solido. Le attività più severe ti accettano senza caparra extra.',
    }
  }
  return {
    tier: 'reliable',
    label: 'Affidabile',
    description: 'Buon punteggio. Continua così per accedere alle prossime soglie.',
  }
}
