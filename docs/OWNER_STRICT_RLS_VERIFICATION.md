# Verifica owner-strict (RLS + RPC)

## Scopo

Validare in modo ripetibile che le migrazioni `0033_owner_strict_sensitive_non_financial.sql` e `0034_ai_suggestions_owner_strict_rpc.sql` siano realmente efficaci.

## Perimetro sensibile

- `public.booking_internal_notes`
- `public.business_customer_tags`
- `public.ai_suggestions`
- `public.ai_suggestion_audit`
- `public.generate_ai_suggestions(uuid, int)`
- `public.apply_ai_suggestion(uuid)`

## 1) Verifica strutturale policy (deve risultare owner-only)

Esegui in SQL Editor:

```sql
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'booking_internal_notes',
    'business_customer_tags',
    'ai_suggestions',
    'ai_suggestion_audit'
  )
order by tablename, policyname;
```

Controlli obbligatori:

- Non devono comparire policy `*_member` su queste tabelle.
- Le policy attive devono usare `public.is_business_owner(...)`.

## 2) Verifica comportamentale RLS (owner vs staff)

Sostituisci:

- `<OWNER_USER_ID>`
- `<STAFF_USER_ID>`
- `<BUSINESS_ID>`

Test owner (deve passare senza errori):

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '<OWNER_USER_ID>', true);

select count(*) as owner_notes
from public.booking_internal_notes n
join public.bookings b on b.id = n.booking_id
where b.business_id = '<BUSINESS_ID>'::uuid;

select count(*) as owner_tags
from public.business_customer_tags
where business_id = '<BUSINESS_ID>'::uuid;

select count(*) as owner_ai
from public.ai_suggestions
where business_id = '<BUSINESS_ID>'::uuid;

rollback;
```

Test staff (deve restituire 0 righe visibili):

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '<STAFF_USER_ID>', true);

select count(*) as staff_notes
from public.booking_internal_notes n
join public.bookings b on b.id = n.booking_id
where b.business_id = '<BUSINESS_ID>'::uuid;

select count(*) as staff_tags
from public.business_customer_tags
where business_id = '<BUSINESS_ID>'::uuid;

select count(*) as staff_ai
from public.ai_suggestions
where business_id = '<BUSINESS_ID>'::uuid;

rollback;
```

## 3) Verifica RPC owner-strict

Test owner: `generate_ai_suggestions` deve funzionare.

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '<OWNER_USER_ID>', true);

select count(*)
from public.generate_ai_suggestions('<BUSINESS_ID>'::uuid, 30);

rollback;
```

Test staff: la RPC deve fallire con `owner_only`.

```sql
begin;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '<STAFF_USER_ID>', true);

select count(*)
from public.generate_ai_suggestions('<BUSINESS_ID>'::uuid, 30);

rollback;
```

Test `apply_ai_suggestion`:

- owner: esecuzione consentita su suggerimento attivo;
- staff: errore `owner_only` anche con ID valido.

## 4) Criterio di accettazione release

Release bloccata se una sola condizione fallisce:

- presenza di policy `*_member` sulle 4 entità sensibili;
- staff che legge righe sensibili;
- staff che invoca con successo `generate_ai_suggestions` o `apply_ai_suggestion`.

## 5) Assert automatico fail-fast

Per evitare verifiche manuali ambigue, esegui anche:

- `supabase/verification/owner_strict_assertions.sql`

Esito atteso:

- query finale con `owner_strict_assertions_passed`;
- nessuna eccezione nei blocchi `do $$ ... $$`.

## 6) Esecuzione automatica da repository

Comando locale/CI:

- `npm run db:verify-owner-strict`
- `npm run db:verify-booking-flow`

Variabili richieste:

- `DATABASE_URL` (preferita) oppure `SUPABASE_DB_URL`
- opzionale `DB_SSL_DISABLE=1` per ambienti locali senza SSL

Nota:

- `npm run gate:release` include i check DB solo se trova variabili DB;
- `npm run gate:release:strict` fallisce immediatamente se le variabili DB mancano (modalità consigliata per CI).

## 7) Integrazione CI (GitHub Actions)

Workflow: `.github/workflows/ci.yml`

- job `release-gate` esegue `npm run gate:release:strict` su ogni PR/push;
- il job usa i secret `DATABASE_URL` o `SUPABASE_DB_URL`;
- se i secret DB mancano, il job fallisce (fail-closed);
- se un check DB non passa, il job fallisce.
