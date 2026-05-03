# CI Strict Bootstrap (5 minuti)

## Obiettivo

Attivare una pipeline fail-closed: nessun merge/deploy senza check applicativi + check DB.

## 1) Prerequisiti

- Migrazioni applicate fino a `0042`.
- Database raggiungibile da GitHub Actions (IP/network policy compatibile).
- Utente DB con permessi di lettura su metadati e funzioni usate nelle assertion.

## 2) Secret GitHub obbligatori

Nel repository GitHub: **Settings → Secrets and variables → Actions**.

Aggiungi almeno uno dei due:

- `DATABASE_URL` (consigliato)
- `SUPABASE_DB_URL`

Formato atteso: connection string Postgres completa.

## 3) Prima esecuzione locale (facoltativa ma consigliata)

PowerShell:

```powershell
$env:DATABASE_URL="postgresql://..."
npm run db:verify-owner-strict
npm run db:verify-booking-flow
npm run db:verify-booking-integrity
npm run db:verify-rls-impersonation
npm run check:tests:integrity
npm run check:business-dashboard:bootstrap
npm run test:business-dashboard:perf
npm run test:onboarding-policy-guard
npm run test:qa:flows
npm run test:critical-owner-onboarding
npm run gate:release:strict
```

Esito atteso:

- check owner-strict: OK
- check booking-flow: OK
- check booking-integrity: OK
- check rls-impersonation: OK
- check tests-integrity: OK
- check business-dashboard-bootstrap: OK
- test business-dashboard runtime perf: OK
- test onboarding-policy-guard: OK
- test product-qa-flows: OK
- check critical owner onboarding: OK
- release gate strict: ALL GREEN

Alternativa persistente:

- aggiungi `DATABASE_URL` (o `SUPABASE_DB_URL`) in `.env.local`;
- gli script strict la caricano automaticamente.

Comando one-shot consigliato:

- `npm run release:hardened`

Comando locale consigliato prima di push/PR:

- `npm run verify:local:strict`

Questo comando:

1. applica le migrazioni critiche DB (`0033`..`0042`);
2. esegue il gate strict completo;
3. fallisce in modo bloccante al primo errore.

## 4) Prima esecuzione CI (obbligatoria)

Apri una PR minima (anche docs-only) e verifica workflow `CI`:

- job `local-strict-mirror` deve passare completamente;
- job `release-gate` deve passare completamente;
- non devono esserci step “skipped” sui check DB;
- eventuali failure DB bloccano la PR.

## 5) Criterio di accettazione

Configurazione accettata solo se:

- `gate:release:strict` passa in CI con secret reali;
- i quattro check DB passano;
- i test critici owner-onboarding passano;
- nessun bypass manuale del workflow.

## 6) Playbook incidenti

Se il workflow fallisce:

1. **Errore connessione DB**  
   Verifica secret, hostname, SSL, firewall/IP allowlist.

2. **Errore assertion owner-strict**  
   Riesegui migrazioni `0033` e `0034`, poi ripeti check.

3. **Errore assertion booking-flow**  
   Riesegui migrazioni `0035` e `0036`, poi ripeti check.

4. **Errore assertion booking-integrity / anti-no-show / chat/notifiche / impersonation**  
   Riesegui migrazioni `0037`, `0038`, `0039`, `0040`, `0041` e `0042`, poi ripeti check.

5. **Errore budget Google Maps**  
   Riduci chunk mappa o riallinea budget con decisione esplicita e tracciata.

6. **Errore applicativo (lint/test/build)**  
   Blocca merge, correggi, riesegui gate completo.

7. **Errore business-dashboard bootstrap budget**  
   Hai introdotto regressione nel caricamento owner dashboard (query/stage/latency budget). Riduci query nel bootstrap o ripristina parallelismo a stage.

8. **Errore business-dashboard runtime perf test**  
   Il bootstrap dashboard è diventato troppo lento a runtime (regressione reale). Verifica catena query, parallelismo e side effect iniziali.

9. **Errore onboarding-policy-guard**  
   Hai introdotto incoerenze nelle regole critiche onboarding (es. caparra attiva con regola Off o risk-based senza soglia minima). Correggi validazione e submit guard.

10. **Errore product-qa-flows**  
    Regressione su flow prodotto critici (signup customer, ricerca attività, routing owner, calendario, booking payment/cancel policy). Correggi prima del merge.

## 7) Budget performance mappa (Google Maps, bloccante)

Il gate include anche `npm run check:bundle:google-maps` subito dopo la build.

- Soglie default:
  - `GOOGLE_MAPS_BUNDLE_MAX_BYTES=1900000`
  - `GOOGLE_MAPS_BUNDLE_MAX_GZIP_BYTES=550000`
  - `GOOGLE_MAPS_BUNDLE_TOTAL_MAX_BYTES=1900000`
  - `GOOGLE_MAPS_BUNDLE_TOTAL_MAX_GZIP_BYTES=550000`
- Se il bundle JS mappa supera la soglia, la release fallisce (fail-closed).

## 8) Budget bootstrap BusinessDashboard (bloccante)

Il gate include `npm run check:business-dashboard:bootstrap`.

- Vincoli default:
  - stage paralleli massimi: `BUSINESS_DASHBOARD_BOOTSTRAP_MAX_STAGES=2`
  - query max stage 1: `BUSINESS_DASHBOARD_BOOTSTRAP_STAGE1_MAX_QUERIES=5`
  - query max stage 2: `BUSINESS_DASHBOARD_BOOTSTRAP_STAGE2_MAX_QUERIES=4`
  - query totali max: `BUSINESS_DASHBOARD_BOOTSTRAP_TOTAL_MAX_QUERIES=9`
  - budget per stage: `BUSINESS_DASHBOARD_BOOTSTRAP_STAGE_BUDGET_MS=450`
- Se il bootstrap introduce `await supabase...` sequenziali o supera i budget, la release fallisce (fail-closed).
- Il gate include anche `npm run test:business-dashboard:perf`: se il tempo runtime supera la soglia o perde parallelismo effettivo, la release fallisce.
