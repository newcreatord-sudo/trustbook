# TrustBook go-live checklist

## Domini e DNS (registrar)
- PROD: `trustbook.it` + `www.trustbook.it`
- STAGING: `staging.trustbook.it`
- Inserire i record DNS richiesti da Vercel e attendere propagazione.
- In Vercel → Project → Domains: tutti i domini devono risultare “Valid Configuration”.

## Supabase (Auth URL Configuration)
- Per ogni ambiente:
  - Site URL: `https://<dominio>` (senza slash finale)
  - Redirect URLs includere almeno:
    - `https://<dominio>/auth/callback`
    - `https://<dominio>/reset-password`

## Vercel (Environment Variables)
- Impostare per ogni ambiente (Production / Preview / Development secondo progetto):
  - `APP_BASE_URL=https://<dominio>`
  - `VITE_APP_URL=https://<dominio>`
  - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
  - `DATABASE_URL` e `SUPABASE_DB_URL` con `?sslmode=require` (o `verify-ca`/`verify-full`)
  - TLS DB:
    - `DB_SSL_REJECT_UNAUTHORIZED=1`
    - `DB_SSL_CA_PEM` (consigliato su Vercel) oppure `DB_SSL_CA_B64`
  - Google Maps:
    - `VITE_GOOGLE_MAPS_API_KEY`
    - `VITE_GOOGLE_MAPS_MAP_ID` (non DEMO in production)
  - Observability / analytics:
    - `VITE_SENTRY_DSN`, `SENTRY_DSN`
    - `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`
  - Web push:
    - `WEB_PUSH_VAPID_SUBJECT`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`
    - `VITE_WEB_PUSH_VAPID_PUBLIC_KEY`
  - Email transazionali:
    - `EMAIL_PROVIDER` (`smtp` o `resend`)
    - `EMAIL_FROM`
    - `RESEND_API_KEY` (se `EMAIL_PROVIDER=resend`) oppure `SMTP_*` (se `EMAIL_PROVIDER=smtp`)
  - Cron/ops:
    - `CRON_SECRET`
    - `OPS_REVIEW_REPORTS_TOKEN` (opzionale: in alternativa usa `CRON_SECRET`)

## Preflight (locale)
- Validazione env:
  - `npm run env:validate:production`
  - `npm run env:validate:staging`
- Suite completa (repo):
  - `npm test`
  - `npm run gate:release:production`
  - `npm run gate:release:staging`

## Smoke test live (HTTP)
- Core (health + auth dry-run + ops/cron se configurati):
  - `node scripts/smoke-live-core.mjs --base-url=https://<dominio>`
- E2E (creazione utenti test, business, booking, approve/complete, cancel, recensione, notifiche):
  - `node scripts/smoke-live-e2e.mjs --base-url=https://<dominio>`

## Smoke test live (manuale UI)
- Auth: signup + conferma email, login, logout.
- Reset password: richiesta link + atterraggio `/reset-password` + cambio password.
- Cliente: esplora → scheda attività → prenotazione → caparra (se payments abilitate) → cancellazione.
- Attività: dashboard → calendario → notifiche → staff → planimetria/resources → AI tools (se abilitati).
