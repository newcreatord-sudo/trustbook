import type { BookingVertical } from '@/lib/businessEcosystem'

/** Archetipi operativi: guidano modalità ecosistema, non sostituiscono policy legali/depositi. */
export type VerticalArchetypeId =
  | 'salon_beauty'
  | 'restaurant_hospitality'
  | 'tattoo_bodyart'
  | 'medical_wellness'
  | 'fitness_classes'
  | 'consulting_professional'
  | 'automotive_workshop'
  | 'generic_service'

export type VerticalPlaybook = {
  id: VerticalArchetypeId
  label: string
  shortLabel: string
  bookingVertical: BookingVertical
  /** Suggerimento gestione risorse (tavoli/postazioni): dipende dal piano. */
  resourceManagementRecommended: boolean
  summary: string
  checklist: string[]
  /** Trasparenza commerciale: cosa è garantito dal software vs dall’operatore. */
  guaranteeScope: string
}

export const VERTICAL_PLAYBOOKS: Record<VerticalArchetypeId, VerticalPlaybook> = {
  salon_beauty: {
    id: 'salon_beauty',
    label: 'Parrucchiere, barbiere, estetista',
    shortLabel: 'Salon / beauty',
    bookingVertical: 'service',
    resourceManagementRecommended: false,
    summary:
      'Turni per operatore/sedia lavoro: una prenotazione = uno slot tempo servizio. Buffer e caparra riducono buchi e no-show.',
    checklist: [
      'Servizi con durata reale + buffer tecnico (lavaggio/setup).',
      'Caparra su clienti nuovi o fascia alta rischio (policy deposit engine).',
      'Finestra cancellazione coerente con il tempo di rivendita dello slot.',
    ],
    guaranteeScope:
      'TrustBook garantisce validazione server degli slot (sovrapposizioni, aperture, chiusure, staff). Non garantisce riempimento calendario o margini: dipende da prezzi, qualità servizio e mercato.',
  },
  restaurant_hospitality: {
    id: 'restaurant_hospitality',
    label: 'Ristorante, pizzeria, hospitality',
    shortLabel: 'Sala / tavoli',
    bookingVertical: 'hospitality_table',
    resourceManagementRecommended: true,
    summary:
      'Verticalità “tavoli/sala”: risorse e planimetria JSON in TrustBook; assegnazione tavolo tramite RPC dedicate. Turni e pacing cucina restano operativi.',
    checklist: [
      'Abilita gestione risorse se il piano lo consente; popola tavoli/capienza.',
      'Allinea durata slot al tempo medio coperto + Politica caparra/eventi.',
      'Blocchi slot (ferie sala, eventi privati) tramite RPC blocked_slots.',
    ],
    guaranteeScope:
      'Garantiamo integrità dati e regole di scheduling lato server. Non garantiamo occupazione sala né sincronizzazione con POS esterni senza integrazione dedicata.',
  },
  tattoo_bodyart: {
    id: 'tattoo_bodyart',
    label: 'Tatuatore, piercing, body art',
    shortLabel: 'Tattoo',
    bookingVertical: 'service',
    resourceManagementRecommended: false,
    summary:
      'Sessioni lunghe e incertezza cliente: combinare caparra, approval risk-based e messaggistica pre-appuntamento.',
    checklist: [
      'Durate conservative + buffer tra sessioni per sanificazione/documentazione.',
      'Caparra proporzionata al valore seduta; approval manuale per profili sconosciuti.',
      'Reminder e chat per confermare disegno/consensi il giorno prima.',
    ],
    guaranteeScope:
      'Il motore impedisce double-booking sullo stesso staff/slot validato. Il rispetto delle norme sanitarie e contrattuali è responsabilità dell’attività.',
  },
  medical_wellness: {
    id: 'medical_wellness',
    label: 'Studio medico, massaggiatore, clinica leggera',
    shortLabel: 'Wellness / studio',
    bookingVertical: 'professional_slot',
    resourceManagementRecommended: false,
    summary:
      'Slot professionali: puntualità e conferme critiche; ridurre walk-in impliciti senza overload agenda.',
    checklist: [
      'Lead time adeguato per documentazione/consensi.',
      'Politiche cancellazione più strette se lo slot è scarsamente sostituibile.',
      'Staff separati per paralleli reali (team_members bookable).',
    ],
    guaranteeScope:
      'TrustBook applica le stesse validazioni deterministiche degli altri verticali. Conformità GDPR, cartelle cliniche e responsabilità professionale restano fuori prodotto.',
  },
  fitness_classes: {
    id: 'fitness_classes',
    label: 'Personal trainer, centro sportivo, corsi',
    shortLabel: 'Fitness',
    bookingVertical: 'seat_assignment',
    resourceManagementRecommended: true,
    summary:
      'Posti limitati per classe o macchina: verticalità postazioni quando gestisci capacità numerica.',
    checklist: [
      'Capienza massima = risorse “seat” o regole servizio duplicate per corsi.',
      'Blocchi manutenzione/spazio tramite blocked_slots.',
      'No-show: caparra leggera o lista affidabilità.',
    ],
    guaranteeScope:
      'Supportiamo vincoli di calendario e risorse codificati. Non misuriamo performance atletiche né sostituiamo gestione accessi fisici.',
  },
  consulting_professional: {
    id: 'consulting_professional',
    label: 'Consulente, professionista, coach',
    shortLabel: 'Consulenze',
    bookingVertical: 'professional_slot',
    resourceManagementRecommended: false,
    summary:
      'Slot netti, videocall o in presenza: min gap per preparazione e follow-up.',
    checklist: [
      'Durata slot = durata contrattuale fatturata.',
      'Approval per clienti fuori lista; depositi su prima sessione.',
      'Fuso orario business allineato a clienti remoti.',
    ],
    guaranteeScope:
      'Calendario e pagamenti caparra seguono le regole configurate. Risultati economici/consulenziali non sono “garantiti” dal software.',
  },
  automotive_workshop: {
    id: 'automotive_workshop',
    label: 'Officina, carrozzeria',
    shortLabel: 'Officina',
    bookingVertical: 'service',
    resourceManagementRecommended: false,
    summary:
      'Tempi variabili per intervento: usare servizi distinti o buffer ampi; blocchi per carro attrezzi indisponibile.',
    checklist: [
      'Servizi per tipologia intervento (tagliando vs diagnosi).',
      'Staff / box: se un solo operatore parallelizza, evitare sovrapposizioni manuali.',
      'Chiusure e indisponibilità con staff_closures / blocked_slots.',
    ],
    guaranteeScope:
      'Stesse garanzie tecniche su conflitti slot. Tempi di riparazione reali sono stima operativa, non promessa del sistema.',
  },
  generic_service: {
    id: 'generic_service',
    label: 'Altro servizio a tempo',
    shortLabel: 'Generico',
    bookingVertical: 'service',
    resourceManagementRecommended: false,
    summary:
      'Preset neutro: affina categorie servizio, caparre e approval in base al rischio cliente.',
    checklist: [
      'Un servizio = una durata certa; evitare slot “fantasma”.',
      'Definisci deposit_mode in linea con il rischio no-show del settore.',
      'Monitora KPI dashboard e ajusta.',
    ],
    guaranteeScope:
      'Il prodotto garantisce tracciabilità RPC, audit dove previsto e regole anti-doppio slot coerenti col motore. Obiettivi di business dipendono dall’uso corretto delle impostazioni.',
  },
}

const CATEGORY_TO_ARCHETYPE: Record<string, VerticalArchetypeId> = {
  barbiere: 'salon_beauty',
  parrucchiere: 'salon_beauty',
  estetista: 'salon_beauty',
  tatuatore: 'tattoo_bodyart',
  massaggiatore: 'medical_wellness',
  studio_medico: 'medical_wellness',
  personal_trainer: 'fitness_classes',
  centro_sportivo: 'fitness_classes',
  ristorante: 'restaurant_hospitality',
  pizzeria: 'restaurant_hospitality',
  hotel_bnb: 'restaurant_hospitality',
  officina: 'automotive_workshop',
  consulente: 'consulting_professional',
  professionista: 'consulting_professional',
  altro: 'generic_service',
}

export function suggestedArchetypeFromCategory(category: string): VerticalArchetypeId {
  const k = category.trim().toLowerCase()
  return CATEGORY_TO_ARCHETYPE[k] ?? 'generic_service'
}

export function playbookList(): VerticalPlaybook[] {
  return Object.values(VERTICAL_PLAYBOOKS)
}
