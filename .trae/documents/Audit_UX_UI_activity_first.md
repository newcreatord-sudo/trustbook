# TrustBook — Audit & Piano (UX/UI 10/10, activity‑first)

## Stato attuale (riassunto)
- Stack: React + TypeScript + Vite + Tailwind; Supabase (DB + Auth); chat per prenotazione.
- Flussi già presenti: scelta ruolo, login/register, esplora con mappa+lista, scheda attività con prenota, prenotazioni cliente, dashboard attività.
- Anti no‑show: punteggio affidabilità cliente, caparra intelligente, approvazione risk‑based, regole no‑show/late cancel.

## Punti forti
- Struttura funzionale end‑to‑end: prenotazione → stati → caparra → chat → review.
- Regole anti no‑show già “concrete”: deposit rule, risk threshold, approval mode, penalità e stelle.
- UI già coerente (dark, card layout) e routing protetto.

## Problemi principali (product/UX)
1) Activity‑first incompleto
- La dashboard attività mischia onboarding, impostazioni e gestione operativa: troppa densità in una pagina.
- Manca un onboarding guidato a step con “setup minimo” e indicazione di completamento.

2) Stati e feedback non uniformi
- Loading/error/empty non sempre coerenti; in alcune viste i dati dipendono da timing di profile/session.

3) Duplicazioni e logiche replicate
- Fetch e normalizzazioni ripetute in più pagine (reliability/favorites/booking counts).
- Creazione attività e default (servizio base + finestre orarie) duplicata e difficile da evolvere.

4) Esperienza attività: azioni rapide e priorità
- Mancano “quick actions” operative: approva/rifiuta con conferma, filtro “oggi”, “in attesa”, indicatori di rischio.
- Mancano alert di setup: es. “orari non impostati”, “nessun servizio attivo”, “attività in pausa”.

## Obiettivo fase (questa iterazione)
- Onboarding attività guidato a step (pulito, veloce, con validazioni).
- Dashboard attività più ordinata (empty state e CTA onboarding, stati coerenti).
- Riduzione duplicazioni con utilità condivise.
- Zero regressioni: stesso DB, stessi endpoint, stessi stati prenotazione.

## Piano operativo (incrementale)
1) Onboarding attività a step
- Step 1: Identità (nome, categoria, descrizione)
- Step 2: Contatti & indirizzo (telefono, email, sito, indirizzo, città, CAP)
- Step 3: Posizione (lat/lng + helper “usa posizione”)
- Step 4: Regole anti no‑show (approvazione, finestra cancellazione, buffer)
- Step 5: Caparra (on/off, fixed/percent, min/max, risky‑only)
- Step 6: Review & crea attività (con default sensati)

2) Dashboard attività
- Se nessuna attività: CTA primaria “Configura attività” → onboarding.
- Se in pausa: badge e CTA “riattiva”.
- Prenotazioni: filtri rapidi (oggi, in attesa, prossime) e indicatori rischio.

3) Code quality
- Estrarre una funzione unica per “create business + defaults”.
- Normalizzare relazioni Supabase che ritornano array/oggetto.

## Limiti noti (da affrontare dopo)
- Upload immagini su Supabase Storage (ora: URL manuale).
- Vista calendario week/day (ora: lista slot + schedule windows).
- Notifiche push/email/SMS: solo in‑app per ora.

