# TrustBook — Setup Auth ed email di conferma (guida completa)

## Verifica tecnica sul codice (repo)

Su questo progetto risultano eseguiti con esito positivo:

`npm run lint` · `npm run check` · `npm run test` · `npm run build`

Non sostituiscono la configurazione del **tuo** progetto Supabase (SMTP, URL, chiavi): quella va fatta sul dashboard con i tuoi segreti — è il modo corretto di lavorare, non una pezza.

Per ripetere la stessa verifica in locale:

```bash
npm run verify:repo
```

Questo documento è la **fonte unica** per avere registrazione, conferma email, reset password e template **funzionanti** su Supabase Cloud e in locale.

## Cosa è già nel codice

| Componente | Ruolo |
|------------|--------|
| `/auth/callback` | Gestisce **PKCE `code`**, **`token_hash` + `type`** nella query o nell’hash, ripulisce l’URL dopo il consumo (`src/lib/authRedirectHandshake.ts`). |
| `/reset-password` | Stesso handshake per il link **recovery** dalla mail; poi cambio password. |
| Login → «Conferma account con codice» | `verifyOtp` signup con email + codice a 6 cifre se il link è stato mangato dall’antivirus. |
| `supabase/templates/*.html` | HTML italiano professionale per conferma, recovery, magic link, cambio email, notifica password. |
| Migrazione `0060_remove_auth_auto_confirm_trigger.sql` | Rimuove il trigger che confermava tutti gli utenti al DB (**senza questo Supabase non invia correttamente il flusso conferma**). |
| Script `scripts/push-auth-email-templates.mjs` | Carica i template sul progetto Cloud via Management API. |

## Setup automatico (dal terminale nel repo)

```bash
npm run setup:auth-complete
```

Fa:

1. `npm run db:apply-critical` — **solo se** esiste `DATABASE_URL` o `SUPABASE_DB_URL` (applica anche **0060**).
2. `npm run auth:templates:sync` — **solo se** hai `SUPABASE_ACCESS_TOKEN` e un URL progetto `https://xxxx.supabase.co` in `SUPABASE_URL` o `VITE_SUPABASE_URL`.

Con `--env-file=.env.staging` puoi puntare a un altro file env:

```bash
node scripts/setup-auth-complete.mjs --env-file=.env.staging
```

(Aggiungi lo script npm se ti serve spesso questa variante; `dotenv` è già gestito nello script.)

## Configurazione Supabase Dashboard (obbligatoria per mail vere)

1. **Authentication → Providers → Email**  
   - **Confirm email** = ON (per ricevere la mail di conferma).

2. **Authentication → URL configuration**  
   - **Site URL**: URL pubblico dell’app (es. produzione `https://tuodominio.it`, locale `http://localhost:5173`).  
   - **Redirect URLs**: includi **esattamente**  
     `http://localhost:5173/auth/callback`  
     `http://127.0.0.1:5173/auth/callback`  
     e gli equivalenti HTTPS in produzione + `/auth/callback`.

3. **SMTP personalizzato**  
   Senza SMTP serio molte mail non arrivano o finiscono in spam. Configura provider (SendGrid, Postmark, AWS SES, ecc.) nel progetto Supabase.

4. **Template sul Cloud**  
   Dopo modifiche ai file in `supabase/templates/`:

   ```bash
   npm run auth:templates:sync
   ```

   Oppure copia/incolla manualmente i file nel dashboard → Authentication → Email Templates.

## Variabili `.env.local` (app + API)

| Variabile | Scopo |
|-----------|--------|
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | URL progetto (Cloud o locale). |
| `VITE_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY` | Chiave anon. |
| `SUPABASE_SERVICE_ROLE_KEY` | Solo server/API (mai nel frontend). |
| `VITE_APP_URL` / `APP_BASE_URL` | Origine pubblica dell’app (**senza** `/` finale); usata per `emailRedirectTo` → `/auth/callback`. |
| `SUPABASE_ACCESS_TOKEN` | Token account Supabase per `auth:templates:push` / `sync`. |
| `SUPABASE_PROJECT_REF` | Solo se l’URL non è `*.supabase.co`. |

Per **non** bypassare la mail in sviluppo: **non** impostare `AUTH_DEV_SIGNUP_CONFIRMED=true`.

## Prova reale (checklist)

1. Applica migrazioni (inclusa **0060**) sul DB del progetto.  
2. Dashboard: conferma email ON, SMTP, Site URL + Redirect URLs.  
3. `npm run auth:templates:sync` (o paste template).  
4. `npm run dev`, registrazione con una casella vera.  
5. Controlla inbox/spam; apri il link **oppure** usa «Conferma account con codice» sul Login.  
6. Reset password: da Login «Password dimenticata» → mail → link → `/reset-password` → nuova password.

## Locale con Docker (`supabase start`)

Email di test in **Inbucket** (vedi `supabase status` per la porta UI).  
Template letti da `supabase/config.toml` → `./templates/*.html`.

---

Se qualcosa fallisce, conserva **solo** codice HTTP e messaggio (mai segreti) e confrontali con la [documentazione Auth Supabase](https://supabase.com/docs/guides/auth).
