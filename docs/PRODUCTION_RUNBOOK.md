# Production runbook (massimo livello operativo)

## Preflight (env + sicurezza)
- Validazione env:
  - `npm run env:validate:production`
  - `npm run env:validate:payments:production` (se pagamenti attivi)
- TLS DB “strict”:
  - `npm run db:ssl:fetch-ca:production` (genera bundle CA in `artifacts/`)
  - Local/dev: usa `DB_SSL_CA_FILE=artifacts/db-ca-bundle.production.pem`
  - Vercel (consigliato): usa `DB_SSL_CA_PEM` (contenuto PEM completo) e lascia `DB_SSL_CA_FILE` vuoto
  - In tutti i casi:
    - `DB_SSL_REJECT_UNAUTHORIZED=1`
    - `DATABASE_URL` e `SUPABASE_DB_URL` devono includere `sslmode=require` (o `verify-ca` / `verify-full`)
 - Rotazione segreti (ultimo step prima di rendere pubblico il dominio):
   - Ruota e aggiorna in Vercel/Supabase/Stripe i secret che sono mai stati condivisi fuori dal tuo PC.
   - Non puntare DNS pubblico su produzione finché non hai completato questa rotazione.

## DB (migrazioni + audit RLS)
- Applicare bundle migrazioni critiche (idempotente):
  - `npm run db:apply-critical:production`
- Audit effettivo su DB remoto (policy/ruoli/estensioni):
  - `npm run db:audit:rls:production > artifacts/db-audit-rls.production.json`
- Verifiche DB runtime (fail-closed in production):
  - `npm run db:verify-owner-strict`
  - `npm run db:verify-booking-flow`
  - `npm run db:verify-booking-integrity`
  - `npm run db:verify-rls-impersonation`

## Gate release (repo + build + DB)
- Gate “production”:
  - `npm run gate:release:production`

## Hardened pipeline (one-shot)
- Sequenza completa consigliata:
  - `npm run deploy:payments:hardened:production`

## Domini (setup professionale)
- Produzione:
  - App: `https://trustbook.it`
  - Vercel: assegna `trustbook.it` al progetto PROD
  - App env (Vercel): `APP_BASE_URL=https://trustbook.it` e `VITE_APP_URL=https://trustbook.it`
- Staging:
  - App: `https://staging.trustbook.it`
  - Vercel: assegna `staging.trustbook.it` al progetto STAGING
  - App env (Vercel): `APP_BASE_URL=https://staging.trustbook.it` e `VITE_APP_URL=https://staging.trustbook.it`

## Cose che non posso fare automaticamente dal repo
- Modifiche dashboard Supabase (Auth settings, Storage, Realtime, MFA, redirect URL).
- WAF / rate limiting a livello CDN (Vercel/Cloudflare).
- Pen-test esterno e report firmato.
