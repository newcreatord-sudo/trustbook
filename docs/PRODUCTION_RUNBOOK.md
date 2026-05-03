# Production runbook (massimo livello operativo)

## Preflight (env + sicurezza)
- Validazione env:
  - `npm run env:validate:production`
  - `npm run env:validate:payments:production` (se pagamenti attivi)
- TLS DB “strict”:
  - `npm run db:ssl:fetch-ca:production` (genera bundle CA in `artifacts/`)
  - Imposta in `.env.production`:
    - `DB_SSL_REJECT_UNAUTHORIZED=1`
    - `DB_SSL_CA_FILE=artifacts/db-ca-bundle.production.pem`

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

## Cose che non posso fare automaticamente dal repo
- Modifiche dashboard Supabase (Auth settings, Storage, Realtime, MFA, redirect URL).
- WAF / rate limiting a livello CDN (Vercel/Cloudflare).
- Pen-test esterno e report firmato.
