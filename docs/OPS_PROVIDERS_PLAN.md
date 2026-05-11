# TrustBook — Piano provider (A1–A17)

## A1 — Sentry (error tracking)

### Pronto in codice
- Frontend: bootstrap condizionale su `VITE_SENTRY_DSN` via `initObservability()` in `src/main.tsx`
- Backend: bootstrap condizionale su `SENTRY_DSN` via `initBackendObservability()` in `api/app.ts`

### Cosa serve da fare
- Creare progetto su Sentry (org + project)
- Impostare env
  - `VITE_SENTRY_DSN` (frontend)
  - `SENTRY_DSN` (backend)
  - `VITE_RELEASE_TAG` / `RELEASE_TAG` (opzionale ma consigliato)
- Decidere retention e sampling (baseline già impostata a livello codice)

### Upgrade opzionale (consigliato)
- Upload sourcemap (richiede token Sentry e configurazione build)

## A2 — Analytics (PostHog / Plausible)

### Pronto in codice
- PostHog: bootstrap condizionale su `VITE_POSTHOG_KEY` e `VITE_POSTHOG_HOST`

### Cosa serve da fare
- Scegliere provider e piano
- Impostare env PostHog:
  - `VITE_POSTHOG_KEY`
  - `VITE_POSTHOG_HOST` (default `https://eu.posthog.com`)

## A3 — Twilio (SMS)

### Stato
- Predisposto lato Supabase config (disabilitato) per `auth.sms.twilio`.

### Cosa serve da fare
- Account Twilio + KYC + numero / messaging service
- Impostare env:
  - `SUPABASE_AUTH_SMS_TWILIO_ACCOUNT_SID`
  - `SUPABASE_AUTH_SMS_TWILIO_MESSAGE_SERVICE_SID`
  - `SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN`
- Abilitare Twilio in Supabase Auth e definire la strategia OTP/rate limit

## A4 — Web Push (VAPID)

### Pronto in repo
- Script generazione chiavi:
  - `npm run vapid:generate`
  - opzionale: `npm run vapid:generate -- --subject=mailto:tuo@dominio.it`

### Cosa serve da fare
- Salvare in env:
  - `VAPID_SUBJECT`
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
- Implementare feature web push (service worker + subscribe UI + storage subscriptions + invio lato server)

## A5 — FatturaPA (Aruba / Acube / FattureInCloud)

### Cosa serve da fare
- Scelta provider + contratto/KYC fiscale
- Definizione flusso: emissione, conservazione, invio SDI, notifiche
- Integrazione tecnica dipendente dal provider scelto

## A6 — LLM provider (OpenAI / Anthropic)

### Cosa serve da fare
- Scelta provider + budget + rate limit
- Decidere casi d’uso (assistente, classificazione, supporto, ecc.)
- Integrazione server-side (mai chiave LLM nel client), logging con redazione PII

## A7 — pg_cron su Supabase

### Cosa serve da fare
- Verificare piano Supabase e abilitare estensione `pg_cron` (staging + prod)
- Mappare i job:
  - esecuzione `run_due_notification_jobs`
  - manutenzioni (cleanup, aggregazioni, ecc.)

## A8 — Migrazioni su staging e produzione

### Pronto in repo
- `npm run db:apply-all:staging`
- `npm run db:apply-all:production`
- `npm run deploy:preflight:staging`
- `npm run deploy:preflight:production`

### Cosa serve da fare
- Finestra di rilascio (soprattutto prod)
- Backup/rollback plan (minimo: snapshot DB, verifiche post-deploy)

## A9 — HSTS preload (trustbook.it)

### Stato
- Header HSTS `preload` già impostato lato API quando `NODE_ENV=production`.

### Cosa serve da fare
- Decisione strategica (preload è sostanzialmente irreversibile nel breve)
- Verifica che tutto il traffico web su `trustbook.it` e sottodomini supporti HTTPS stabile
- Submit su hstspreload.org e gestione eventuali sottodomini legacy

## A10 — Dominio admin (admin.trustbook.it)

### Cosa serve da fare
- Scelta UX e policy accesso (SSO, MFA, IP allowlist, ecc.)
- Config DNS + Vercel project/dominio

## A11 — DPA / audit fornitori

### Cosa serve da fare
- Review legale con DPO/consulente
- DPA per: Supabase, Vercel, Stripe, email provider, analytics, Twilio, Sentry, LLM, ecc.

## A12 — Icone PWA professionali

### Cosa serve da fare
- Asset design (192/512 + maskable + light/dark)
- Aggiornare manifest e test installazione su iOS/Android/Desktop

## A13 — Audit accessibilità (AgID/EAA)

### Cosa serve da fare
- Audit terzo + remediation
- Dichiarazione accessibilità e processi di mantenimento

## A14 — Modello no-show (ML)

### Cosa serve da fare
- Dataset reale + ML engineering + hosting modello (Modal/Replicate)
- Integrazione e metriche (precision/recall) + governance

## A15 — Stripe Connect + metodi pagamento extra

### Cosa serve da fare
- Attivazioni in Stripe Dashboard e/o contatto supporto
- Scelta metodi (SEPA, Bancontact, Klarna) e compliance

## A16 — Ridenominazione piani (Stripe products live)

### Cosa serve da fare
- Decisione commerciale (naming, prezzi, feature gate)
- Migrazione coerente su Stripe live + UI + comunicazioni

## A17 — Email transazionali (Resend/Postmark)

### Stato
- Email app già via SMTP generico (Nodemailer); Auth email via Supabase.

### Cosa serve da fare
- Scelta provider + dominio mittente verificato (SPF/DKIM/DMARC)
- Opzione A (zero-code): usare SMTP del provider impostando `SMTP_*`
- Opzione B (SDK): integrazione diretta via API key (da valutare)
