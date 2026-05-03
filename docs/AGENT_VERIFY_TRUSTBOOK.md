# Verifica progetto TrustBook (senza chiavi)

## Link repository

- Repo: [trustbook](file:///c:/Users/david/Documents/trae_projects/trustbook)
- Migrazioni Supabase: [supabase/migrations](file:///c:/Users/david/Documents/trae_projects/trustbook/supabase/migrations)
- Guida setup: [SUPABASE_SETUP.md](file:///c:/Users/david/Documents/trae_projects/trustbook/docs/SUPABASE_SETUP.md)
- Verifica owner-strict: [OWNER_STRICT_RLS_VERIFICATION.md](file:///c:/Users/david/Documents/trae_projects/trustbook/docs/OWNER_STRICT_RLS_VERIFICATION.md)
- Verifica booking flow: [BOOKING_FLOW_RELEASE_CHECKS.md](file:///c:/Users/david/Documents/trae_projects/trustbook/docs/BOOKING_FLOW_RELEASE_CHECKS.md)
- Bootstrap CI strict: [CI_STRICT_BOOTSTRAP.md](file:///c:/Users/david/Documents/trae_projects/trustbook/docs/CI_STRICT_BOOTSTRAP.md)

## Cosa verificare (checklist)

1) **Schema**
   - Tutte le migrazioni `0001_...` → `0036_...` applicate sul progetto Supabase `trustbook`.
   - Nessuna tabella “estranea” in `public` oltre a quelle create dalle migrazioni TrustBook.

2) **RLS e policies**
   - Tabelle principali con RLS attivo.
   - Policies coerenti (select/insert/update) per `profiles`, `businesses`, `bookings`, ecc.
   - Entità sensibili non-finanziarie in owner-only:
     - `booking_internal_notes`
     - `business_customer_tags`
     - `ai_suggestions`
     - `ai_suggestion_audit`

3) **RPC / funzioni**
   - Funzioni come `is_business_member` presenti e funzionanti.
   - `generate_ai_suggestions` e `apply_ai_suggestion` owner-only (no esecuzione staff).
   - `create_booking_v2` con guard-rail completi (lead-time, opening-hours, closure, timezone).

4) **Storage**
   - Bucket `business-media` presente.
   - Policies su `storage.objects` che consentono upload ai membri attività.

## Come verificare senza vedere chiavi

- L’agente deve usare solo:
  - Dashboard Supabase (con un account autorizzato).
  - Query “read-only” (es. ispezione schema, policies, funzioni).
- Nessuna chiave API va incollata o condivisa.
- In CI, usare il workflow `.github/workflows/ci.yml` con secret DB dedicati per abilitare i controlli owner-strict bloccanti.
- In CI, usare `npm run gate:release:strict` (fail-closed): senza secret DB la pipeline deve fallire.
