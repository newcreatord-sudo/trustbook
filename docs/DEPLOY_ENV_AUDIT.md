# Deploy Env Audit (Staging + Production)

Obiettivo: impedire deploy con configurazioni incoerenti o fake.

## Regole hard applicate

- Nessuna chiave obbligatoria mancante.
- Nessun placeholder (`<...>`, `YOUR_*`, `project-ref`, ecc.).
- Modalita pagamenti esplicita:
  - `PAYMENTS_ENABLED=0` -> validazione core (Stripe non bloccante).
  - `PAYMENTS_ENABLED=1` oppure `--require-payments` -> chiavi Stripe obbligatorie.
- URL validi:
  - `VITE_SUPABASE_URL`, `SUPABASE_URL`, `APP_BASE_URL` devono essere `https`.
  - `DATABASE_URL`, `SUPABASE_DB_URL` devono essere `postgres://` o `postgresql://`.
- Coerenza frontend/backend:
  - `VITE_SUPABASE_URL` e `SUPABASE_URL` devono puntare allo stesso host.
  - `VITE_SUPABASE_ANON_KEY` e `SUPABASE_ANON_KEY` devono coincidere.
- Safety deploy:
  - `APP_BASE_URL` non deve finire con `/`.
  - produzione non può usare host `staging` o `localhost`.
  - staging non può usare `localhost`.
  - `DATABASE_URL` e `SUPABASE_DB_URL` devono essere distinti (direct vs pooler).

## Comandi operativi

- Validazione ambiente:
  - `npm run env:validate:staging`
  - `npm run env:validate:production`
  - `npm run env:validate:payments:staging`
  - `npm run env:validate:payments:production`

- Preflight completo (incluso health + gate):
  - `npm run deploy:preflight:staging`
  - `npm run deploy:preflight:production`
  - `npm run deploy:payments:preflight:staging`
  - `npm run deploy:payments:preflight:production`

- Hardened release (migrazioni + gate strict):
  - `npm run deploy:hardened:staging`
  - `npm run deploy:hardened:production`
  - `npm run deploy:payments:hardened:staging`
  - `npm run deploy:payments:hardened:production`

## Fonti valori (no guess)

- Supabase dashboard:
  - Project URL -> `VITE_SUPABASE_URL`, `SUPABASE_URL`
  - Anon key -> `VITE_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY`
  - Service role key -> `SUPABASE_SERVICE_ROLE_KEY`
  - Database connection string:
    - direct -> `DATABASE_URL`
    - pooler -> `SUPABASE_DB_URL`
- Stripe dashboard:
  - Publishable key -> `VITE_STRIPE_PUBLISHABLE_KEY`
  - Secret key -> `STRIPE_SECRET_KEY`
  - Webhook secret -> `STRIPE_WEBHOOK_SECRET`
- Google Cloud:
  - Maps JavaScript API key -> `VITE_GOOGLE_MAPS_API_KEY`
- App domain reale:
  - `APP_BASE_URL`

## Criterio di passaggio

Ambiente pronto solo se:

1. `env:validate:*` PASS
2. `api:verify-auth-email:*` PASS
3. `deploy:hardened:*` PASS

Per attivare pagamenti reali:

4. `PAYMENTS_ENABLED=1`
5. `env:validate:payments:*` PASS
6. `deploy:payments:hardened:*` PASS

Se uno fallisce, ambiente NON pronto.
