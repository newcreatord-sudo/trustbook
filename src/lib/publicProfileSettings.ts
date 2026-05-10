/**
 * Preferenze cosa mostrare sulla pagina pubblica `/attivita/:id` o `/b/:slug`.
 * Persistite in `businesses.public_profile_settings` (jsonb).
 * Valori assenti = default «mostra tutto» (retrocompatibilità).
 */
export type BusinessPublicProfileSettings = {
  show_gallery: boolean
  show_description: boolean
  show_services: boolean
  /** Sezione planimetria (lettura); i dati restano comunque filtrati da RPC + ecosistema. */
  show_floor_plan_section: boolean
  /** Card indirizzo + link Maps */
  show_location: boolean
  /** Blocco mappa interattiva (caricamento on-demand) */
  show_interactive_map: boolean
  show_contact: boolean
  show_opening_hours: boolean
  /** Cancellazione, caparra, approvazione */
  show_policy_block: boolean
  show_reviews: boolean
  /** Badge reputazione + mini KPI in testata */
  show_trust_metrics: boolean
}

export const DEFAULT_PUBLIC_PROFILE_SETTINGS: BusinessPublicProfileSettings = {
  show_gallery: true,
  show_description: true,
  show_services: true,
  show_floor_plan_section: true,
  show_location: true,
  show_interactive_map: true,
  show_contact: true,
  show_opening_hours: true,
  show_policy_block: true,
  show_reviews: true,
  show_trust_metrics: true,
}

function readBool(raw: Record<string, unknown>, key: keyof BusinessPublicProfileSettings, fallback: boolean): boolean {
  const v = raw[key]
  if (typeof v === 'boolean') return v
  return fallback
}

export function resolvePublicProfileSettings(raw: Record<string, unknown> | undefined | null): BusinessPublicProfileSettings {
  const r = raw && typeof raw === 'object' ? raw : {}
  const d = DEFAULT_PUBLIC_PROFILE_SETTINGS
  return {
    show_gallery: readBool(r, 'show_gallery', d.show_gallery),
    show_description: readBool(r, 'show_description', d.show_description),
    show_services: readBool(r, 'show_services', d.show_services),
    show_floor_plan_section: readBool(r, 'show_floor_plan_section', d.show_floor_plan_section),
    show_location: readBool(r, 'show_location', d.show_location),
    show_interactive_map: readBool(r, 'show_interactive_map', d.show_interactive_map),
    show_contact: readBool(r, 'show_contact', d.show_contact),
    show_opening_hours: readBool(r, 'show_opening_hours', d.show_opening_hours),
    show_policy_block: readBool(r, 'show_policy_block', d.show_policy_block),
    show_reviews: readBool(r, 'show_reviews', d.show_reviews),
    show_trust_metrics: readBool(r, 'show_trust_metrics', d.show_trust_metrics),
  }
}

/** Voci pannello Impostazioni (ordine di lettura). */
export const PUBLIC_PROFILE_SECTIONS: ReadonlyArray<{
  key: keyof BusinessPublicProfileSettings
  label: string
  hint: string
}> = [
  { key: 'show_gallery', label: 'Galleria foto', hint: 'Miniature, lightbox e anteprima in elenco Esplora.' },
  { key: 'show_description', label: 'Descrizione', hint: 'Blocco testo descrittivo sul profilo.' },
  { key: 'show_services', label: 'Elenco servizi', hint: 'Prezzi e durate visibili (non sostituisce il flusso prenotazione).' },
  { key: 'show_floor_plan_section', label: 'Sezione planimetria', hint: 'Layout tavoli/postazioni in sola lettura se abilitata anche in Ecosistema.' },
  { key: 'show_location', label: 'Posizione e indirizzo', hint: 'Card con indirizzo e link Google Maps.' },
  { key: 'show_interactive_map', label: 'Mappa interattiva', hint: 'Mappa incorporata (caricamento su richiesta).' },
  { key: 'show_contact', label: 'Contatti', hint: 'Telefono, email, sito.' },
  { key: 'show_opening_hours', label: 'Orari settimanali', hint: 'Griglia fasce + prossime chiusure.' },
  { key: 'show_policy_block', label: 'Regole prenotazione', hint: 'Cancellazione, caparra, approvazione.' },
  { key: 'show_trust_metrics', label: 'Metriche affidabilità', hint: 'Badge e KPI TrustBook accanto al voto.' },
  { key: 'show_reviews', label: 'Recensioni', hint: 'Recensioni cliente→attività sul profilo.' },
]
