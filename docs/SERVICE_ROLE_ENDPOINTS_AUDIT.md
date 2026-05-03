# Service role endpoints (audit operativo)

Questi endpoint usano `SUPABASE_SERVICE_ROLE_KEY` e quindi bypassano RLS. La sicurezza dipende da:
- gating forte (token segreto, signature Stripe, o check ownership + session validation),
- controlli IDOR (business_id/booking_id/customer_user_id devono essere verificati rispetto al caller),
- idempotenza/anti-duplicate per webhook e azioni di pagamento.

## Mappa endpoint

### Auth
- `POST /api/auth/admin-signup`
  - Gate: `X-Admin-Signup-Token` (timing-safe) + rate limit
  - Azione: crea user via Supabase Admin API
- `POST /api/auth/admin/confirm-email`
  - Gate: `X-Admin-Signup-Token` (timing-safe)
  - Azione: forza conferma email (admin)

### Cron / Notifiche
- `GET /api/cron/notifications/due`
- `GET /api/cron/notifications/email`
- `GET /api/cron/notifications/all`
  - Gate: `Authorization: Bearer CRON_SECRET` (timing-safe)
  - Azione: esegue RPC/dispatch email; limite controllato da query param

- `POST /api/notifications/dispatch`
- `POST /api/notifications/run-due`
  - Gate: `X-Dispatch-Token` (timing-safe) = `EMAIL_DISPATCH_TOKEN`
  - Azione: dispatch email / run scheduled jobs

### Stripe (depositi + webhook)
- `POST /api/stripe/deposit/checkout`
- `POST /api/stripe/deposit/verify`
- `POST /api/stripe/deposit/cancel`
- `POST /api/stripe/deposit/cancel-by-business`
- `POST /api/stripe/deposit/forfeit-by-business`
- `GET /api/stripe/business/payments`
- `POST /api/stripe/webhook`
  - Gate: signature webhook (Stripe) su raw body
  - Gate utente: session/JWT + ownership checks lato API per azioni business
  - Requisito: idempotenza su eventi e update booking/payment

### Subscriptions
- `POST /api/subscriptions/business/checkout-session`
- `POST /api/subscriptions/customer/checkout-session`
- `POST /api/subscriptions/stripe/confirm-session`
- `POST /api/subscriptions/business/request-change`
- `GET /api/subscriptions/business/change-requests`
  - Gate: session/JWT + ownership checks
  - Admin-only: `POST /api/subscriptions/business/resolve-change` (token timing-safe)

### Monetization (admin)
- `POST /api/monetization/admin/fee-override/upsert`
- `POST /api/monetization/admin/fee-override/delete`
  - Gate: `X-Admin-Signup-Token` (timing-safe)

### Ops review reports
- `POST /api/ops/review-reports/list`
  - Gate: `Bearer OPS_REVIEW_REPORTS_TOKEN` o `CRON_SECRET` (timing-safe)

### Team
- `POST /api/team/resolve-user`
  - Gate: bearer user session validata via `supabaseAdmin.auth.getUser(token)`
  - Requisito: ownership business prima di risolvere email->userId

## Checklist IDOR (da applicare endpoint-per-endpoint)
- Ogni `business_id` in input deve essere verificato contro `owner_user_id` o membership del caller.
- Ogni `booking_id` deve essere verificato come appartenente al `business_id` atteso e al caller (customer o member).
- Mai fidarsi di `customer_user_id` passato dal client senza prova (match su booking o ownership).
- Per azioni “admin token”: usare confronto timing-safe, rate limit, logging security events.
