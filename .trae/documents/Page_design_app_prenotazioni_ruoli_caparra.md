# Page Design — Trustbook (desktop-first)

## Global Styles (desktop-first)
- Layout: griglia 12 colonne (max-width 1200px). Pagine “split” (mappa/lista) e dashboard con sidebar.
- Spacing: 8/12/16/24/32; radius 12–24 (card/section).
- Tipografia: base 16px; H1 28–32, H2 22–24, H3 18–20.
- Colori: background #0B1220, surface #111A2E, testo #E6EAF2; primary #4F7CFF; success #2ECC71; warning #F5A623; danger #FF4D4F.
- Componenti: card con border “white/10”; bottoni primary/secondary/ghost; hover +4% luminosità; focus ring visibile.
- Icone: lucide-react (outline) coerente su tutta l’app.

## Page: Start — Scelta ruolo (/start)
- Meta: title “Inizia — Trustbook”, description “Scegli come vuoi usare Trustbook: Cliente o Attività.”
- Layout: 2 colonne desktop (sinistra valore/brand, destra scelta ruolo). Sotto ~900px: stacked.
- Struttura:
  - Brand card: logo, payoff, microcopy su anti no-show.
  - Role picker: 2 card selezionabili (Cliente/Attività) con descrizione breve.
  - CTA: “Continua” (porta a /login?mode=register&role=…) e “Ho già un account”.
  - Stati: focus/selected chiaro; accessibilità (tab + aria-pressed).

## Page: Accesso (/login)
- Meta: title “Accedi — Trustbook”, description “Accedi o registrati per prenotare o gestire la tua attività.”
- Layout: 2 colonne desktop (sinistra benefit + demo, destra form). Mobile: stacked.
- Sezioni:
  - Toggle “Login / Registrati”.
  - Registrazione: scelta ruolo (se non arrivato da /start), nome/cognome, telefono opz., email/password.
  - Login: email/password + CTA.
  - Info box: “Caparra anti no-show” (testo informativo) + stati possibili.
  - Stati: errori inline, loading su CTA, redirect in base al ruolo.

## Page: Esplora (/) — Mappa + Ricerca
- Meta: title “Esplora — Trustbook”, description “Trova attività e disponibilità su mappa.”
- Layout: split-view desktop (mappa 60% / lista 40%); mobile: tab “Mappa/Lista”.
- Sezioni:
  - Top bar: search input (nome/città), filtri essenziali (categoria, distanza), CTA “Usa la mia posizione”.
  - Map canvas: marker; click apre preview (nome, rating, CTA).
  - Results list: card con nome, categoria, città, rating medio, CTA “Vedi e prenota”.
  - Role-aware nav: pulsante “Prenotazioni” (Cliente) o “Dashboard” (Attività).
  - Stati: empty (nessun risultato), loading skeleton.

## Page: Dettaglio Attività + Prenota (/attivita/:id)
- Meta: title dinamico “{Nome} — Prenota”, description “Servizi, disponibilità, caparra e recensioni.”
- Layout: 2 colonne desktop (contenuto 7/12, sidebar prenotazione 5/12); mobile: sidebar → bottom sheet.
- Struttura:
  - Header attività: nome, categoria, rating medio + conteggio, indirizzo.
  - Sezione Servizi: lista servizi (durata, prezzo opz.); selezione servizio.
  - Sezione Disponibilità: calendario/slot list; slot non selezionabili disabilitati.
  - Sidebar Prenotazione:
    - Riepilogo (servizio + orario).
    - Blocco “Approvazione e caparra”: microcopy chiaro su cosa succede dopo l’invio.
    - CTA “Invia richiesta prenotazione”.
  - Sezione Recensioni: lista; CTA “Scrivi recensione” solo se hai booking completed.

## Page: Le mie Prenotazioni — Cliente (/prenotazioni)
- Meta: title “Le mie prenotazioni — Trustbook”, description “Gestisci stati, caparra, chat, affidabilità e recensioni.”
- Layout: container centrale; header con riepilogo + filtri (Future/Passate) + cards.
- Header (riepilogo cliente):
  - Card “Affidabilità”: score + badge (es. Alto/Medio/Basso) + microcopy “come funziona”.
  - Link/accordion “Dettagli”: ultimi eventi (no-show/cancellazioni) in lista compatta.
- Struttura card prenotazione:
  - Titolo attività, data/ora, badge stato (requested/pending_approval/change_proposed/pending_deposit/confirmed/…).
  - Riga “Caparra”: importo + stato (required/paid/refunded/forfeited).
  - Azioni contestuali:
    - “Chat” (toggle accordion) → componente chat realtime.
    - “Paga caparra” solo per pending_deposit.
    - “Cancella” solo se permesso da cancellation_window_min (con microcopy su conseguenze).
    - “Accetta/Rifiuta proposta” solo per change_proposed.
  - Post-servizio:
    - Box “Valuta l’attività” (rating select + commento opz.) solo per completed e non già recensita.
  - Stati: error banner, empty state.

## Page: Dashboard Attività (/dashboard-attivita)
- Meta: title “Dashboard Attività — Trustbook”, description “Onboarding, prenotazioni, chat, no-show, staff e impostazioni.”
- Layout: desktop con sidebar sinistra (profilo + switch attività + tab) e pannello contenuti.
- Navigazione/Tab (desktop): Prenotazioni, Impostazioni, Servizi, Orari/Ferie, Staff.

### Sezione: Onboarding (stato “nessuna attività”)
- Pattern: pagina vuota guidata (“setup minimo”) con form creazione attività.
- Campi minimi: nome, categoria, città, indirizzo, lat/lng; regole: caparra e finestra cancellazione.
- CTA primaria: “Crea profilo”.

### Tab: Prenotazioni (approvazione + esiti + chat)
- Layout: lista card o tabella.
- Contenuti per riga:
  - Data/ora, cliente (id o display), affidabilità (score + rischio), stato prenotazione, caparra.
- Azioni contestuali:
  - Approva: calcola caparra e passa a confirmed o pending_deposit.
  - Rifiuta: campo motivo (opz.) + conferma.
  - Proponi orario alternativo: start/end + messaggio.
  - Esiti servizio: “Completata” e “No-show” (con conferma modale).
  - “Annulla” (con esito caparra coerente).
  - “Chat” (accordion) → stesso componente chat.

### Tab: Servizi
- Pattern: CRUD in card list.
- Componenti: lista servizi, form inline (nome, durata, prezzo opz.), toggle attivo.

### Tab: Orari/Ferie
- Pattern: due pannelli:
  - “Orari settimanali” (weekday + start/end) in tabella modificabile.
  - “Chiusure” (start_at/end_at + reason) in lista.

### Tab: Impostazioni
- Obiettivo: permettere all’Attività di aggiornare le policy che impattano il flusso prenotazione.
- Componenti:
  - Sezione “Policy cancellazione”: campo `cancellation_window_min` con help text e preview “entro quando puoi cancellare”.
  - Sezione “Caparra”: toggle “Caparra attiva” + importo (cents → UI in €); microcopy su quando viene richiesta.
  - Sezione “Dati attività essenziali”: categoria/città/indirizzo + posizione (lat/lng) con mini-mappa.
  - CTA “Salva modifiche” con toast di conferma; warning se campi obbligatori mancanti.

### Tab: Staff (Team)
- Pattern: lista membri + azioni.
- Componenti:
  - Tabella: utente (email/id), ruolo (owner/staff), data aggiunta.
  - CTA “Aggiungi staff”: modal con input identificatore utente (email o user_id) + ruolo.
  - Azioni riga: “Rimuovi” (con conferma).
- Regole UI: mostra chiaramente che solo Owner può gestire staff e impostazioni sensibili.

## Linee guida responsive/interaction
- Desktop-first: le viste split e dashboard restano la priorità; su mobile la dashboard diventa stacked con tab orizzontali.
- Chat: scroll auto a ultimo messaggio; stato “letto” aggiornato al focus/apertura.
- Azioni distruttive: sempre conferma modale (rifiuta, annulla, no-show, rimuovi staff).