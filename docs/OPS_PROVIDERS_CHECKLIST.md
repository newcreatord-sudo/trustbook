# Ops providers — checklist eseguibile (A1–A17)

Questa checklist separa:
- ciò che è già pronto nel repo e va solo “acceso” via env/config
- ciò che richiede account/KYC/decisioni e non può essere completato solo via codice

## A1 — Sentry (error tracking)

### Step
- Creare org + project (consigliato: 2 progetti separati `trustbook-web` e `trustbook-api`)
- Impostare su Vercel:
  - `VITE_SENTRY_DSN` (frontend)
  - `SENTRY_DSN` (backend)
  - `VITE_RELEASE_TAG` / `RELEASE_TAG` (consigliato)
- Sourcemap upload (opzionale ma “pro”):
  - `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` (solo build)
  - `SENTRY_RELEASE` (opzionale; fallback su `VITE_RELEASE_TAG`/`RELEASE_TAG`)

### Verifica
- Forzare un errore controllato in staging (es. route non esistente o throw lato API) e verificare evento in Sentry con environment corretto.

## A2 — Analytics (PostHog)

### Step
- Creare project PostHog e recuperare Project API Key
- Impostare su Vercel:
  - `VITE_POSTHOG_KEY`
  - `VITE_POSTHOG_HOST` (default `https://eu.posthog.com`)

### Verifica
- Aprire il sito in incognito, navigare 2–3 pagine e verificare eventi in PostHog.

## A3 — Twilio (SMS)

### Ambiti distinti
- Supabase Auth OTP SMS (login/verify phone): `SUPABASE_AUTH_SMS_TWILIO_*`
- SMS notifiche TrustBook (reminder/outbound): `TWILIO_*` usati dal dispatcher server

### Step (Supabase Auth)
- Creare Twilio account + billing + KYC, configurare Messaging Service + sender IT
- Inserire in env Supabase/Vercel (in base a come sincronizzi config Supabase):
  - `SUPABASE_AUTH_SMS_TWILIO_ACCOUNT_SID`
  - `SUPABASE_AUTH_SMS_TWILIO_MESSAGE_SERVICE_SID`
  - `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN`

### Step (notifiche app)
- Impostare su Vercel:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_FROM` (E.164)

## A4 — Web Push (VAPID)

### Step
- Generare chiavi:
  - `npm run vapid:generate -- --subject=mailto:support@trustbook.it`
- Impostare su Vercel:
  - `WEB_PUSH_VAPID_SUBJECT`
  - `WEB_PUSH_VAPID_PUBLIC_KEY`
  - `WEB_PUSH_VAPID_PRIVATE_KEY`
  - `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` (uguale alla public key server)

### Verifica
- UI: la sezione notifiche push deve risultare configurata e permettere subscribe/unsubscribe.
- DB: `push_subscriptions` deve popolarsi dopo subscribe.

## A5 — FatturaPA (Aruba / Acube / FattureInCloud)

### Serve
- Contratto/KYC fiscale + scelta provider
- Scelta modello: emissione per abbonamenti (B2C/B2B), conservazione, gestione notifiche SDI

## A6 — LLM provider (OpenAI / Anthropic)

### Serve
- Provider + budget + rate limit
- Politica PII: niente dati sensibili nei prompt e redazione log

## A7 — pg_cron su Supabase (staging + prod)

### Step
- Abilitare estensione `pg_cron` su entrambi gli ambienti
- Definire job minimi:
  - `run_due_notification_jobs` (promemoria)
  - manutenzioni eventuali (cleanup log, aggregazioni)

### Verifica
- Eseguire `scripts/db-check-pg-cron.mjs` contro gli ambienti e verificare che i job girino.

## A8 — Applicare migrazioni (staging + produzione)

### Step
- Staging:
  - `npm run deploy:preflight:staging`
  - `npm run db:apply-all:staging`
- Produzione (in finestra):
  - `npm run deploy:preflight:production`
  - `npm run db:apply-all:production`

## A9 — HSTS preload (trustbook.it)

### Stato tecnico
- `trustbook.it` e `www.trustbook.it` servono `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
- Submission su hstspreload.org effettuata (stato: pending inclusion)

### Step
- Verificare periodicamente lo stato su hstspreload.org finché non risulta incluso.

## A10 — Dominio admin (admin.trustbook.it)

### Opzioni
- Opzione 1: stesso progetto Vercel + dominio alias `admin.trustbook.it` e landing su `/admin`
- Opzione 2: progetto Vercel separato solo per admin (surface minima, policy diverse)

## A11 — DPA / audit fornitori

Serve audit/firma DPA con: Supabase, Vercel, Stripe, Sentry, PostHog, Resend, Twilio, provider LLM, ecc.

## A12 — Icone PWA professionali

Serve set completo (192/512 + maskable + light/dark) e aggiornamento assets in `public/icons/`.

## A13 — Validazione AgID/EAA accessibilità (audit terzo)

Serve audit esterno + remediation + dichiarazione accessibilità.

## A14 — Modello no-show (ML su Modal/Replicate)

Serve dataset reale + pipeline training + hosting + monitoraggio drift.

## A15 — Stripe Connect + metodi pagamento extra

Serve pratica con Stripe (Connect + abilitazioni metodi) + compliance.

## A16 — Ridenominazione piani prezzo (Stripe Products live)

Serve strategia commerciale + migrazione coerente (Stripe + UI + comunicazioni).

## A17 — Email transazionali (Resend)

### Step
- Verificare dominio mittente su Resend (SPF/DKIM/DMARC)
- Impostare su Vercel:
  - `EMAIL_PROVIDER=resend`
  - `RESEND_API_KEY`
  - `EMAIL_FROM` (es. `TrustBook <noreply@trustbook.it>`)
  - `EMAIL_DISPATCH_TOKEN` (protezione endpoint dispatch)

### Verifica
- Eseguire un invio transazionale in staging (reset password o notifica) e controllare deliverability e link.
