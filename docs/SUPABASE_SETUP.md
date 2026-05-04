# Setup Supabase (TrustBook)

## Obiettivo

Creare un progetto Supabase dedicato a TrustBook (senza tabelle “miste” di altri progetti) e allineare l’app allo schema in `supabase/migrations`.

## 1) Crea un nuovo progetto Supabase

- Crea un nuovo progetto dal dashboard Supabase e chiamalo `trustbook`.
- Recupera:
  - Project URL
  - Anon key
  - Service role key

## 2) Configura le variabili d’ambiente

Copia `.env.example` in `.env.local` e valorizza:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Nota: il client (frontend) usa le variabili `VITE_*`. L’API server usa `SUPABASE_*`.

## 3) Collega l’integrazione Supabase dell’IDE al nuovo progetto

Collega l’integrazione Supabase (quella usata dalle migrazioni remote) al nuovo progetto `trustbook`.

## 4) Applica le migrazioni

Applica in ordine tutti i file dentro `supabase/migrations` (da `0001_...` in poi). Per gli ambienti che usano solo il bundle critico c’è anche `npm run db:apply-critical`.

## Email di conferma (contenuto professionale + recapito)

**Guida operativa unica e checklist di prova reale:** [`docs/AUTH_EMAIL_COMPLETE_IT.md`](./AUTH_EMAIL_COMPLETE_IT.md)  
(di seguito il riepilogo tecnico; per SMTP, redirect e comandi usa quel file.)

### Database

La migrazione `0060_remove_auth_auto_confirm_trigger.sql` rimuove il trigger che confermava automaticamente ogni nuovo utente su `auth.users` (introdotto in `0045_auto_confirm_users.sql`). Senza quel trigger, Supabase Auth può inviare davvero la mail di conferma quando **Confirm email** è attiva nel progetto.

### Progetto ospitato (Supabase Cloud)

1. **Authentication → URL configuration**
   - **Site URL**: URL pubblico dell’app (es. `https://…`), senza slash finale.
   - **Redirect URLs**: includi l’origine dell’app e la pagina di callback esatta usata dall’SDK, ad es. `https://TUO_DOMINIO/auth/callback` e `http://localhost:5173/auth/callback` per lo sviluppo.

   Setup consigliato “massimo livello” con due ambienti separati:
   - **PROD**: `https://trustbook.it`
     - Redirect:
       - `https://trustbook.it/auth/callback`
       - `https://trustbook.it/reset-password`
   - **STAGING**: `https://staging.trustbook.it`
     - Redirect:
       - `https://staging.trustbook.it/auth/callback`
       - `https://staging.trustbook.it/reset-password`

2. **Authentication → Providers → Email**
   - Lascia **Confirm email** attiva per il flusso con messaggio professionale.
   - Configura **SMTP personalizzato** (SendGrid, Postmark, SES, ecc.) con mittente coerente (`Sender email`, nome visualizzato). Senza SMTP affidabile molti messaggi finiscono in spam o non partono.

3. **Authentication → Email Templates**
   - Copia nel dashboard il contenuto dei file in `supabase/templates/` (HTML già in italiano, layout compatibile client mail):
     - **Confirm signup** ← `confirmation.html`
     - **Reset password** ← `recovery.html`
     - **Change email address** ← `email_change.html`
     - **Magic Link** ← `magic_link.html` (se usi accesso magic link)
     - Notifica **Password changed** ← `password_changed_notification.html`
   - Imposta gli **oggetti** come in `supabase/config.toml` (`subject = …`) oppure equivalenti nel form del dashboard.

Variabili Supabase nei template: `{{ .ConfirmationURL }}`, `{{ .Email }}`, `{{ .Token }}`, `{{ .SiteURL }}`, `{{ .NewEmail }}`, ecc. Non rimuovere questi segnaposto.

**Alternativa automatica — Management API**

1. Crea un token in [Account → Access Tokens](https://supabase.com/dashboard/account/tokens).
2. In `.env.local`: `SUPABASE_ACCESS_TOKEN=...` e assicurati che `SUPABASE_URL` (o `VITE_SUPABASE_URL`) sia `https://<ref>.supabase.co` **oppure** imposta `SUPABASE_PROJECT_REF=<ref>`.
3. Comandi:
   - `npm run auth:templates:dry-run` — solo lettura file locali (nessuna chiamata remota).
   - `npm run auth:templates:verify-remote` — GET della config Auth sul progetto Cloud (controlla che la conferma contenga TrustBook + `ConfirmationURL`).
   - `npm run auth:templates:push` — **PATCH** sul progetto Cloud: applica tutti i template da `supabase/templates/`.
   - `npm run auth:templates:sync` — come push + `--verify` immediato dopo il PATCH.

### Prova end-to-end con mail vera

1. Applica sul DB la migrazione `0060_remove_auth_auto_confirm_trigger.sql` (`npm run db:apply-critical` se usi quel bundle).
2. Dashboard Supabase: **Confirm email** ON, **SMTP** configurato, **Site URL** + **Redirect URLs** con `/auth/callback`.
3. `npm run auth:templates:push` (o incolla manualmente i template dal repo).
4. In `.env.local` **non** impostare `AUTH_DEV_SIGNUP_CONFIRMED` se vuoi ricevere la mail.
5. `VITE_APP_URL` / `APP_BASE_URL` coerenti con gli URL autorizzati (es. `http://localhost:5173` in locale).
6. `npm run dev` → registrazione con un indirizzo email reale → controlla inbox/spam → clic sul link → login.

Orchestrazione rapida (dry-run + verify se hai il token): `npm run auth:email:test-remote` (con API avviata anche il check `api:verify-auth-email`).

### Variabili TrustBook per il redirect nel messaggio

- `VITE_APP_URL` e/o `APP_BASE_URL`: devono puntare all’URL pubblico che gli utenti aprono nel browser (coerente con **Site URL** e redirect consentiti). Il client usa questa base per `emailRedirectTo` verso `/auth/callback`.

### Sviluppo locale (`supabase start`)

- `supabase/config.toml` punta già i template in `./templates/` e abilita `enable_confirmations = true`; le email di test sono visibili in **Inbucket** (porta indicata da `supabase status`, tipicamente 54324).

### Bypass solo sviluppo (senza mail)

- In `.env.local` puoi ancora usare `AUTH_DEV_SIGNUP_CONFIRMED=true` con `npm run dev`: crea utenti già confermati senza invio email (non per produzione).

## 5) Verifica rapida

- Dal dashboard Supabase controlla che in `public` esistano solo le tabelle di TrustBook.
- Avvia l’app e completa login/onboarding.
- Esegui il playbook di hardening owner-strict: `docs/OWNER_STRICT_RLS_VERIFICATION.md`.

## Pulizia del progetto “vecchio”

Se nel progetto Supabase precedente ci sono tabelle di due app diverse:

- Lascia il progetto vecchio come “legacy” (solo per recupero dati).
- Usa il nuovo progetto `trustbook` per TrustBook.
