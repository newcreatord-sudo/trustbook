# Page Design — Redesign Ricerca/Filtri/Ordinamento/Scoperta

## Global (coerenza Design System)
### Layout
- Desktop-first: griglia 12 colonne (Tailwind) con due aree: contenuto principale + pannello filtri (sticky) quando utile.
- Mobile: filtri in drawer/modal full-height; toolbar sticky in alto per accesso rapido.

### Meta Information (pattern)
- Title: "{Nome pagina} | TrustBook"
- Description: 1 riga con beneficio (es. “Trova attività affidabili vicino a te”).
- Open Graph: titolo + descrizione + url pagina.

### Global Styles
- Token: usare `--tb-bg`, `--tb-surface`, `--tb-border`, `--tb-primary`.
- Tipografia: titoli `text-sm font-semibold`, microcopy `text-xs text-white/60`.
- Componenti base: `Card`, `Input`, `Select`, `Tabs`, `Button`, `EmptyState`, `Skeleton`.

---

## 1) Pagina: Esplora attività (/esplora)
### Page Structure
- Sezione Hero.
- Card “Search & Filters”.
- (Opzionale) Card “Suggerimenti”.
- Layout split: Mappa (sx) + Risultati (dx) su desktop.

### Sections & Components
1. **Search & Sort Toolbar (nuovo pattern compositivo)**
   - Riga 1: Titolo + descrizione breve + azione “Reset filtri”.
   - Riga 2 (grid):
     - Search input con icon leading + clear button (visibile solo quando `q !== ''`).
     - Select categoria.
     - Bottone “Posizione” (secondary) + stato:
       - Default: attivo
       - Busy: spinner/label “Attivo…”
       - Success: microcopy “Posizione attiva”
       - Error: `Alert tone="danger"`
     - Select distanza disabilitato senza posizione (opacity + tooltip/microcopy “Attiva posizione”).
     - (Nuovo) Select ordinamento: Distanza (se posizione), Valutazione, Novità.
2. **Applied Filters Row (chip)**
   - Mostrare chip per: categoria, distanza, ordinamento (quando diverso dal default).
   - Ogni chip ha “x” per rimuovere singolo filtro; a destra link “Reset”.
3. **Risultati Header**
   - “Risultati (N)” + stato di ricerca:
     - Idle: nessun indicatore
     - Typing/debounce: mini loader inline (“Aggiorno…”) senza bloccare UI
4. **Lista risultati**
   - Card list: `BusinessResultCard`.
   - Stato active sincronizzato con mappa.
   - Pagination/Mostra altri quando N è alto (evitare scroll infinito dentro card se non necessario).
5. **Mappa**
   - Skeleton full-area durante loading.
   - Se `filtered.length === 0`: mostra mappa “vuota” + hint testuale (non errore).

### Stati (loading/empty)
- Loading iniziale: skeleton lista + skeleton mappa.
- Empty “nessuna attività ancora”: `EmptyState` con CTA coerente (già presente).
- Empty “nessun risultato”: `EmptyState` con CTA reset.

### Performance (UX)
- Debounce input ricerca 250–350ms.
- Evitare `.select('*')`; caricare solo campi card.
- Paginare (range) oltre una soglia (es. > 50 risultati).
- Memoizzare card e marker (ridurre re-render durante typing).

---

## 2) Pagina: Dashboard attività — Prenotazioni (sezione esistente)
### Page Structure
- Header pagina.
- Barra filtri (Tabs + search) + (nuovo) ordinamento.
- Lista prenotazioni.

### Sections & Components
1. **Booking Filters Bar (estendere pattern)**
   - Tabs con conteggi (già presenti).
   - Input ricerca “Cerca cliente…” con clear.
   - (Nuovo) Select ordinamento: “Prossime”, “Più recenti”, “In attesa prima”.
2. **Applied Filters Summary**
   - Se query non vuota o tab != “Tutte”: mostra riga compatta “Stai vedendo: …” + Reset.
3. **Lista**
   - Loading: skeleton righe (coerenti dimensioni con BookingQuickRow).
   - Empty:
     - Per tab specifico: messaggio contestuale (es. “Nessuna prenotazione in attesa”).
     - Per ricerca: “Nessun match per ‘…’” + CTA clear.

### Performance (UX)
- Filtri e sort devono essere “instantanei” su dataset medio; se cresce, passare a query server-side con paginazione.

---

## 3) Pattern riutilizzabile: “List Toolbar” (per pagine gestione)
### Obiettivo
Standardizzare UX di liste (servizi/staff/orari/tag) senza creare varianti incoerenti.

### Componenti (composizione)
- Card toolbar:
  - Search input
  - Bottone “Filtri” (apre drawer) + badge numero filtri attivi
  - Sort select
  - CTA primaria contestuale (es. “Aggiungi”)
- Drawer filtri:
  - Sezioni (accordion) con checkbox/radio/select
  - Footer con “Applica” + “Reset”

### Stati
- Loading: skeleton lista, toolbar sempre visibile.
- Empty (no data): `EmptyState` con CTA primaria.
- Empty (no match): `EmptyState` con CTA “Rimuovi filtri / Cancella ricerca”.

### Accessibilità
- Focus order consistente; ESC chiude drawer; label/aria per input e pulsanti; annunci live per aggiornamento risultati.
