# Specifiche Page Design — Piano UI/UX Premium (desktop-first)

## Global Styles (coerenti col design system)
- Token (già esistenti): `--tb-bg/#0B1220`, `--tb-surface`, `--tb-border`, `--tb-primary/#4F7CFF`, `--tb-ring`, radius `xl/2xl/3xl`.
- Tipografia: usare sempre `tb-kicker` → `tb-title` → `tb-subtitle`; body `text-sm text-white/70`; microcopy `text-xs text-white/60`.
- Spaziature: base 4px; page `max-w-6xl px-4`; card `tb-card` + `tb-card-pad` (p-6 md:p-8).
- Stati:
  - Focus: `:focus-visible` (ring visibile) + evitare “focus invisibile” su elementi cliccabili.
  - Hover: usare variazioni `surface` (bg white/5→/10) + transizioni 150–200ms.
  - Active/Pressed: leggera compressione (scale 0.99) o darken surface; mai cambiare layout.
  - Disabled: `opacity-60` + `cursor-not-allowed` + microcopy di motivo se blocco importante.

## Responsive rules
- Desktop-first: toolbar in riga, griglie 2–3 colonne quando utile.
- <1024px: ridurre colonne, wrap toolbar.
- <768px: stack verticale, CTA full-width, target touch ≥44px, testo non sotto `text-xs` se contenuto principale.

## Meta (pattern)
- Title: "TrustBook — {Pagina}"; Description: 1 riga orientata al task; OG: titolo + breve value.

---

## Header / App Shell
- Layout: header sticky con nav desktop (`md:flex`) e azioni a destra; spacing fisso `px-4 py-3`.
- Componenti: link nav = pill `rounded-xl`, stati active/hover/focus coerenti; menu notifiche con card elevata + separatori.

## Pagina: Start
- Struttura: hero in card centrale, 1 CTA primaria + 1 secondaria.
- Microcopy: promessa chiara (“Prenotazioni anti no‑show”) + 1 riga di come funziona.

## Pagina: Login
- Struttura: form in card, campi con label + helper; errori con `Alert tone=danger`.
- Stati: input invalid con border/tone coerente; submit con busy/disabled.

## Pagina: Reset password
- Struttura: come Login; conferma invio con `Alert tone=success`.
- Microcopy: esplicitare tempo/step successivo (“Controlla la mail per il link”).

## Pagina: Esplora (/esplora)
- Layout: 2 colonne desktop (lista + mappa), stack su tablet/mobile.
- Filtri: barra “sticky-in-page” opzionale; controlli compatti (segmented/chips) con wrap.
- Risultati: card cliccabili con hover surface + bordo; empty state con CTA “Rimuovi filtri”.

## Pagina: Dettaglio attività (/attivita/:id)
- Struttura: sezione info + disponibilità + regole/caparra + affidabilità; CTA primaria “Prenota” evidente.
- Microcopy: testi di caparra/approvazione in frasi brevi, senza tecnicismi.

## Pagina: Prenotazioni (/prenotazioni)
- Layout: lista prenotazioni con filtri rapidi + dettagli a pannello (desktop) / navigazione a stack (mobile).
- Stati: badge consistenti per status; timeline leggibile; chat con separatori e timestamp micro.

## Pagina: Dashboard Cliente (/dashboard-cliente)
- Struttura: “oggi/prossimi” + azioni rapide; card KPI con numeri allineati.
- Microcopy: evidenziare cosa richiede azione (“Caparra da pagare”, “Proposta da confermare”).

## Pagina: Dashboard Attività (/dashboard-attivita)
- Layout: griglia card 2–3 colonne (desktop), stack (mobile); sezioni “Priorità” in alto.
- Stati: quick actions (approva/rifiuta/proponi) con confirm + busy + toast.

## Pagina: Onboarding Attività (/onboarding-attivita)
- Struttura: stepper + card contenuto; footer con Back/Next; validazione inline.
- Stati: progress chiaro; errori specifici per campo (microcopy breve).

## Pagina: Pagamenti Attività (/pagamenti-attivita)
- Struttura: tab/segmented per periodi; tabella/card con righe zebra leggere.
- Microcopy: spiegare “commissioni/caparra” in note brevi; empty state con suggerimento.

## Pagina: Profilo (/profilo)
- Struttura: sezioni (dati account, affidabilità/ruolo se visibile) con card e descrizioni.
- Stati: azioni sensibili con confirm; feedback tramite toast.

## Pagina: Impostazioni (/impostazioni)
- Struttura: elenco impostazioni in card; switch/select con descrizione sotto label.
- Stati: focus/hover chiari; disabled con motivo (se dipende dal ruolo).

## Pagina: Notifiche (/notifiche)
- Struttura: lista con raggruppamento “oggi/precedenti”; azione “segna letto” evidente.
- Stati: item hover + stato letto/non letto; empty state “Niente di nuovo”.