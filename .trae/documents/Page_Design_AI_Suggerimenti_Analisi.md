# Page Design — AI Suggerimenti (desktop-first)

## Global Styles (tutte le pagine)
- Layout: desktop-first con max-width 1200–1280px, griglia 12 colonne; sidebar opzionale a sinistra su desktop; su tablet/mobile sidebar collassa in drawer.
- Spaziatura: scala 4/8/12/16/24/32px.
- Tipografia: base 16px; H1 28–32px, H2 20–24px, body 14–16px, caption 12–13px.
- Colori: background neutro chiaro; card bianche; testo #111; secondario #555; accento (brand) per CTA; stati: success/warn/error.
- Componenti: Card con shadow lieve; badge priorità (HIGH/MEDIUM/LOW); pulsanti Primary/Secondary; skeleton loader per refresh.
- Interazioni: hover su righe tabella e card; focus ring visibile; transizioni 150–200ms.

## Pagina: Accesso (/login)
### Meta Information
- Title: "Accesso — Suggerimenti AI"
- Description: "Accedi per visualizzare analisi e suggerimenti AI su prenotazioni e incassi."
- Open Graph: titolo + descrizione coerenti; no anteprima dati sensibili.

### Layout
- Struttura centrata: contenitore 420–480px; sfondo neutro con brand header minimale.

### Sections & Components
1. Header minimale
   - Logo/nome prodotto.
2. Login Card
   - Campi: Email, Password.
   - CTA: “Accedi”.
   - Messaggi errore inline + banner.
3. Footer minimale
   - Link “Privacy/Termini” (se presenti nel prodotto principale).

## Pagina: Dashboard AI (/) — Home
### Meta Information
- Title: "Dashboard — Suggerimenti AI"
- Description: "KPI e suggerimenti AI basati su prenotazioni, clienti, orari e incassi."
- Open Graph: preview generica (no numeri sensibili).

### Layout
- Desktop: layout a 2 colonne.
  - Colonna principale (8/12): KPI + lista suggerimenti.
  - Colonna secondaria (4/12): filtri, range temporale, stato aggiornamento.
- Responsive: sotto 1024px passa a stacked sections; filtri diventano accordion.

### Page Structure
1. Top Bar
   - Titolo pagina.
   - Range selector (7/30/90 giorni) + pulsante “Aggiorna”.
   - Indicatore: “Ultimo aggiornamento: …” + stato (idle/loading/error).
2. KPI Row (card grid)
   - Card: Prenotazioni, Clienti unici, Occupazione, Incassi.
   - Ogni card: valore principale + delta vs periodo precedente.
3. Suggerimenti AI
   - Lista di card (1 per suggerimento):
     - Titolo + badge priorità.
     - 1–2 righe di spiegazione.
     - 1 evidenza chiave (es. “No‑show +12% vs media”).
     - CTA Primary “Applica” + link “Dettagli”.
4. Pannello Filtri/Preferenze (sidebar)
   - Toggle categorie suggerimenti (se previste).
   - Soglie base (slider/inputs) dove applicabile.

### Stati & Interazioni
- Loading: skeleton su KPI e lista suggerimenti.
- Empty state: testo “Nessun suggerimento rilevante nel periodo” + CTA “Aggiorna”.
- Apply one‑click: dialog di conferma con riepilogo azione; toast di esito.

## Pagina: Dettaglio Suggerimento (/suggestions/:id)
### Meta Information
- Title: "Suggerimento — Dettaglio"
- Description: "Motivazione, evidenze e applicazione rapida del suggerimento."

### Layout
- Desktop: contenuto centrale 2/3 + sidebar 1/3 per azione.

### Sections & Components
1. Breadcrumbs
   - “Dashboard / Suggerimento …”
2. Header suggerimento
   - Titolo + badge priorità.
   - Tag/contesto (es. area: orari/incassi/prenotazioni).
3. Sezione “Perché lo vedi” (Explanation)
   - Testo strutturato in paragrafi brevi.
4. Sezione “Evidenze”
   - Lista bullet + mini-tabella metriche principali.
5. Sezione “Azione” (sidebar)
   - Riepilogo azione proposta.
   - CTA Primary “Applica con un click”.
   - Nota su reversibilità (se applicabile) e impatto atteso.
6. Audit locale
   - Stato ultima applicazione (se già applicato): chi/quando/esito.

## Pagina: Impostazioni (/settings)
### Meta Information
- Title: "Impostazioni — Suggerimenti AI"
- Description: "Configura parametri di analisi e controlla lo storico azioni."

### Layout
- Desktop: tabs in alto (Parametri / Aggiornamento / Audit).

### Sections & Components
1. Tab Parametri Analisi
   - Range temporale default.
   - Soglie (occupazione, no‑show, ricavi) con helptext.
   - Pulsante “Salva”.
2. Tab Aggiornamento
   - Toggle: automatico/manuale.
   - Pulsante “Rigenera suggerimenti”.
   - Stato: ultimo refresh + errori recenti.
3. Tab Audit
   - Tabella: data/utente/titolo suggerimento/azione/esito.
   - Filtri rapidi (success/fail, data range).
