# TrustBook — Home Premium (Esplora) — Page Design

## Obiettivo pagina
Rendere “Esplora” più premium e orientata alla fiducia: ricerca più chiara, priorità alle azioni principali (posizione, filtri, prenotazioni), e stati di caricamento/empty coerenti col design system.

---

## 1) Analisi della home attuale (src/pages/Home.tsx)
- È funzionale ma “tool-like”: manca un hero che spieghi valore e guidi l’azione.
- Barra filtri densa e poco gerarchica (molti controlli allo stesso livello, ripetizione affidabilità).
- Loading/empty sono testo in box: non sfruttano `Skeleton`/`EmptyState` del design system.
- Trust/garanzie (caparra, reputazione, chat, stati) non sono raccontate nella pagina di esplorazione.

---

## 2) Meta information
- Title: `Esplora attività | TrustBook`
- Description: `Trova attività affidabili, filtra per categoria e distanza, e prenota con regole chiare.`
- Open Graph:
  - og:title = Title
  - og:description = Description
  - og:type = website

---

## 3) Global styles (coerenza design system)
- Background: `--tb-bg` (#0B1220)
- Superfici: `bg-white/5` + `border-white/10` (usare `.tb-card`)
- Primary CTA: `--tb-primary` (#4F7CFF) (usare `Button variant="primary"` / `.tb-btn-primary`)
- Secondary CTA: `Button variant="secondary"` / `.tb-btn-secondary`
- Tipografia:
  - kicker: `.tb-kicker`
  - titoli sezione: `text-lg font-semibold text-white`
  - corpo: `text-sm text-white/70`
- Radius:
  - card: `rounded-3xl`
  - controlli: `rounded-2xl` / `rounded-xl`

---

## 4) Layout (desktop-first)
- Wrapper: `AppShell` + container `max-w-6xl px-4` (come ora).
- Griglia principale:
  - Desktop (≥1024): `grid-cols-12` con split **7/5** (mappa / risultati)
  - Tablet: stack verticale con mappa sopra e lista sotto
  - Mobile: stack; risultati con header sticky interno
- Spaziatura: usare pattern `space-y-4` e `gap-4`.

---

## 5) Struttura pagina (Home Premium)

### 5.1 Hero “Esplora con fiducia” (nuova sezione, sopra mappa/lista)
**Layout:** card `.tb-card` con padding `p-4 md:p-6`; contenuto in due colonne su desktop.

**Colonna sinistra (messaggio + trust):**
- Kicker: “ESPLORA” (`.tb-kicker`)
- H1: “Trova attività affidabili vicino a te” (2 righe max)
- Subtitle: breve spiegazione (regole chiare, caparra quando serve, reputazione)
- Chip affidabilità (solo `cliente`): mostra `score/100` + stelle (riusare lo stile già presente in Home/AppShell, ma **una sola volta**)

**Colonna destra (Quick Actions / CTA):**
- CTA primaria (cliente): `Vai alle prenotazioni` → `/prenotazioni`
- CTA secondaria: `Come funziona l’affidabilità` → `/prenotazioni` (anchor o sezione informativa già esistente)
- Nota compatta (microcopy): “La caparra può essere richiesta solo quando necessario.”

### 5.2 Barra ricerca & filtri (re-impaginata, stessa funzionalità)
**Obiettivo:** rendere i controlli “scan-friendly” e con gerarchia.

**Componenti (stessa logica attuale):**
- Search input (icona + placeholder attuale)
- Select categoria
- Button: “Usa la mia posizione”
- Select distanza (disabled se `!userLoc`)
- Link/button “Reset”

**Layout consigliato:**
- Desktop: riga unica con grouping visivo:
  1) Search (più largo, 2–3x)
  2) Categoria
  3) Posizione + Distanza (affiancati)
  4) Reset (testo)
- Mobile: 2 righe (Search full; poi Categoria/Posizione/Distanza)

**Stati:**
- Errore geolocalizzazione: `Alert tone="danger"` sotto la barra
- `userLoc` attivo: label “Posizione attiva · filtri distanza disponibili” (come ora)

### 5.3 “Trust strip” (nuova sezione, subito sotto i filtri)
Tre card piccole (grid 3 su desktop, stack su mobile), solo contenuto informativo:
1) “Regole chiare” — stati prenotazione spiegati in 1 riga
2) “Caparra intelligente” — fissa/percentuale/min/max (senza dettagli tecnici)
3) “Chat per prenotazione” — contesto unico, meno caos

Componenti: `.tb-card` + testo `text-sm text-white/70`.

### 5.4 Area contenuti: Mappa + Risultati (come ora, ma più premium)

#### A) Card Mappa
- Header card: titolo “Mappa” + hint “Clicca un risultato per evidenziare”
- Body: `MapView` in container `h-[420px] md:h-[520px]` (più “premium” su desktop)

**Loading:**
- Mostrare `Skeleton` full-size al posto di `MapView` finché `loading === true`.

#### B) Card Risultati
- Header: “Risultati (N)” + azione “Reset”
- Body: lista scrollabile (come ora) ma con:
  - Stato selezionato più evidente (già presente)
  - Distanza (se disponibile)
  - Recensioni (avg + count) come ora
  - Caparra summary come ora
  - CTA riga: “Vedi disponibilità” (disabilitata se `is_paused`)

**Preferiti:**
- Mantenere toggle “Preferiti” per riga; microfeedback via toast (come ora).

---

## 6) Empty states (coerenti con design system)
Usare `EmptyState` (src/shared/ui/EmptyState.tsx) al posto di box testuali.

1) **Nessuna attività ancora** (`businesses.length === 0`)
- Title: “Nessuna attività ancora”
- Description: “Per vedere risultati, crea almeno un profilo attività.”
- Action:
  - se `cliente`: pulsante primario “Passa ad Attività” (comportamento attuale)
  - sempre: pulsante secondario “Vai alla dashboard attività”

2) **Nessun risultato** (`filtered.length === 0`)
- Title: “Nessun risultato”
- Description: “Prova a cambiare filtri o ricerca.”
- Action: “Reset filtri”

3) **Geo non disponibile / permesso negato**
- Mostrare `Alert tone="danger"` nel blocco filtri + CTA secondaria “Riprova” (riusa bottone posizione).

---

## 7) Loading states (premium)
- Loading iniziale:
  - Hero e filtri visibili ma disabilitati con `opacity-60` (opzionale)
  - Mappa: `Skeleton` grande
  - Lista: 6 skeleton items (card `rounded-2xl border bg-white/5`)
- Loading preferiti (ottimistico già presente): mantenere toast su successo/errore.

---

## 8) Micro-interazioni
- Hover card risultati: `hover:bg-white/10`
- Stato selezionato: `bg-[#4F7CFF]/10` + `border-[#4F7CFF]/50` (come ora)
- Focus input: ring `--tb-ring` (già in index.css)

---

## 9) Accessibilità & contenuto
- Pulsanti con label chiara (“Usa la mia posizione”, “Reset filtri”, “Vedi disponibilità”).
- Stati disabilitati: usare `disabled` + `aria-disabled` dove applicabile.
- Immagini logo: `alt` con nome attività (se disponibile) invece di “Logo”.
