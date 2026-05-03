# Page Design — Redesign Premium (desktop-first)

## Global Styles
- Layout: CSS Grid (pagina) + Flexbox (righe/CTA). Max-width 1120px, gutter 24px.
- Colori: base scura come attuale (bg #0B1020 / card white/5), accent #4F7CFF.
- Tipografia: Title 18/24 semibold; section label 12 uppercase; body 14/20.
- Stati: hover card +5% brightness; focus ring accent 2px; disabled opacity 60%.

---

## Pagina: Profilo (/profilo)
### Meta Information
- Title: “Profilo | TrustBook”
- Description: “Gestisci dati e reputazione per prenotare più velocemente.”

### Page Structure
- Griglia 12 colonne: contenuto principale (8) + sidebar (4). Su mobile: stack.

### Sections & Components
1. **Header Profilo (card)**
   - Avatar grande + badge ruolo.
   - KPI rapidi in pill: “Score effettivo”, “Tier”, “Rischio”.
   - CTA: “Salva modifiche” sticky in basso alla card quando dirty.

2. **Identità & Contatti (card form)**
   - Campi esistenti (nome, cognome, telefono, città, avatar).
   - UX premium: raggruppamento per “Identità” e “Contatto”, helper text minimo.

3. **Fiducia & Reputazione (card premium)**
   - Hero KPI: progress bar + label tier (nessuna/bronzo/argento/oro).
   - Breakdown: Base / Boost stelle / Penalità (no-show, cancellazioni) in 3 mini-cards.
   - “Come migliorare” (lista 3 suggerimenti basati su penalty).

4. **Timeline eventi reputazione (card)**
   - Lista compatta con delta colorato e timestamp.

5. **Recensioni ricevute (card)**
   - Lista con rating, attività, data; commento espandibile.

6. **Preferiti (card)**
   - Lista link come oggi, ma con layout a righe + categoria/città.

---

## Pagina: Impostazioni (/impostazioni)
### Meta Information
- Title: “Impostazioni | TrustBook”
- Description: “Privacy, notifiche e sicurezza del tuo account.”

### Page Structure
- Layout a due colonne: menu laterale (sinistra) + contenuto (destra).
- Navigazione interna a sezioni (anchor + highlight attivo).

### Sections & Components
1. **Sidebar sezioni**
   - Voci: Privacy, Notifiche, Sicurezza.

2. **Privacy (card)**
   - Toggle “Profilo pubblico” (private/public).
   - Radio “Condivisione posizione”: Off / Solo città / Precisa.
   - Note: spiegare impatto (es. “precisa” utile per suggerimenti vicini).

3. **Notifiche (card)**
   - Canali: In-app, Email.
   - Categorie: Prenotazioni, Caparra, Messaggi, Marketing.
   - Microcopy premium: esempi (“Ricevi alert quando…”).

4. **Sicurezza (card)**
   - Stato email verificata (da sessione auth) e CTA “Reimposta password”.
   - CTA “Logout” ben visibile.

---

## Pagina: Notifiche (/notifiche)
### Meta Information
- Title: “Notifiche | TrustBook”
- Description: “Aggiornamenti su prenotazioni, caparre e messaggi.”

### Page Structure
- Lista in card unica con toolbar.

### Sections & Components
- Header con contatore non lette + CTA “Segna tutto letto”.
- Item notifica: titolo, body, timestamp; stato unread evidenziato.
- Empty state e skeleton come oggi.
