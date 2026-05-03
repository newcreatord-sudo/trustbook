# Stripe operativo (SaaS abbonamenti + caparra)

## Prerequisiti

- Stripe dashboard (test mode)
- Supabase raggiungibile (URL + anon key + service role key)
- API Express su HTTPS in staging/prod (webhook + redirect Checkout richiedono URL pubblici)

## Database

- Applica il bundle DB (include 0089):

  - `npm run db:apply-critical:staging`
  - `npm run db:apply-critical:production`

- Migrazione chiave: [0089_subscription_plan_psp_columns.sql](file:///c:/Users/david/Documents/trae_projects/trustbook/supabase/migrations/0089_subscription_plan_psp_columns.sql)
  - `subscription_plans.stripe_product_id`
  - `subscription_plans.stripe_price_id`
  - `subscription_plans.mollie_sku`

## Stripe dashboard (prodotti e prezzi)

- Crea un Product per ogni piano a pagamento (es. business PRO/ULTRA, customer PLUS)
- Crea un Price ricorrente (EUR, monthly) per ogni Product
- Copia i Price ID (`price_...`)

## Variabili d’ambiente (API)

- SaaS abbonamenti:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET` (alias accettato `STRIPE_WH_SECRET`)
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `APP_BASE_URL` (URL pubblico del frontend, senza slash finale)

- Caparra prenotazioni:
  - `PAYMENTS_ENABLED=1`
  - `VITE_STRIPE_PUBLISHABLE_KEY` (frontend)

Validazione consigliata:
- `npm run env:validate:saas:staging`
- `npm run env:validate:payments:staging`

## Webhook

- Stripe → Developers → Webhooks → Add endpoint
- URL: `https://TUO_DOMINIO/api/stripe/webhook`
- Eventi minimi:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Copia `whsec_...` in `STRIPE_WEBHOOK_SECRET`

### Sviluppo locale (Stripe CLI)

Opzione consigliata per test end-to-end senza esporre pubblicamente il server:

```bash
stripe listen --forward-to http://localhost:3000/api/stripe/webhook
```

- Usa il `whsec_...` stampato dalla CLI come `STRIPE_WEBHOOK_SECRET` nel tuo `.env.local`.
- Mantieni un solo endpoint webhook configurato in produzione: in locale ti basta la CLI.

## Collegare i piani del DB ai Price Stripe

Regola:
- `price_cents > 0` + `stripe_price_id` non vuoto → UI mostra Checkout e backend permette la sessione

### Opzione A (automatica): crea Product/Price su Stripe e scrive i campi nel DB

Prerequisiti:
- `STRIPE_SECRET_KEY` + `DATABASE_URL`/`SUPABASE_DB_URL` nell’env file
- migrazioni DB applicate (almeno fino a 0089)

Esempi:

```bash
npm run stripe:bootstrap:saas:staging -- --dry-run=1
```

```bash
npm run stripe:bootstrap:saas:staging
```

Filtri utili:
- `--audience=business|customer|all`
- `--plan=business_pro` (ripetibile più volte)
- `--force=1` (sovrascrive `stripe_product_id`/`stripe_price_id` anche se già presenti)

Helper script:

```bash
node ./scripts/stripe-set-plan-psp.mjs --env-file=.env.staging --plan=business_pro --price-cents=1990 --stripe-price=price_123
```

## CORS

In staging/prod l’API permette origini definite da:
- `ALLOWED_ORIGINS` (comma-separated)
- `APP_BASE_URL`
- `VITE_APP_URL`

Entry point: [app.ts](file:///c:/Users/david/Documents/trae_projects/trustbook/api/app.ts)

## Flusso di test (test mode)

Business:
- Dashboard attività → Abbonamento → Checkout Stripe (solo piani paid)
- Redirect su `APP_BASE_URL` con `subscriptionCheckout=success&session_id=...`
- La UI chiama `POST /api/subscriptions/stripe/confirm-session`
- Verifica `business_subscriptions` e log webhook 200 su Stripe dashboard
  - Nota: se il redirect/confirm fallisce, il webhook resta comunque la fonte di verità (può aggiornare lo stato con qualche secondo di ritardo).

Cliente:
- Pannello cliente → Checkout Stripe (solo piani paid)
- Verifica `customer_subscriptions`

## PAYMENTS_ENABLED (differenza SaaS vs caparra)

- SaaS abbonamenti: richiede `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (e `stripe_price_id` sui piani), indipendente da `PAYMENTS_ENABLED`.
- Caparra prenotazioni: le route `/api/stripe/deposit/*` rispondono `503` se `PAYMENTS_ENABLED=0`.
