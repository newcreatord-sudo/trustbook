# Booking Flow Release Checks

## Obiettivo

Verificare in modo bloccante che il booking flow resti consistente in produzione dopo le migrazioni `0035` e `0036`.

## Migrazioni richieste

- `0035_booking_flow_guardrails.sql`
- `0036_booking_timezone_and_opening_hours_guard.sql`

## Assert DB automatiche

File SQL:

- `supabase/verification/booking_flow_assertions.sql`

Comando:

- `npm run db:verify-booking-flow`
- `npm run db:verify-booking-integrity`

Esito atteso:

- marker finale `booking_flow_assertions_passed`
- nessuna eccezione SQL

## Cosa blocca la release

- colonna `businesses.timezone` assente o non valida;
- constraint `businesses_timezone_valid` assente;
- `create_booking_v2` senza guard su opening-hours, lead-time, closure, timezone.
- trigger anti-overlap assente o dati booking attivi già in overlap.

## Gate CI

Il workflow `.github/workflows/ci.yml` esegue il gate in modalità strict (`npm run gate:release:strict`):

- il gate fallisce se mancano `DATABASE_URL`/`SUPABASE_DB_URL`;
- il gate fallisce se il check booking-flow non passa.
