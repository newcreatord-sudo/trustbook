# Chiavi Stripe — dove compilare

## Passi veloci

1. Apri il file giusto **solo per incollare le chiave**:
   - **Staging:** `env/EDIT_STRIPE_STAGING.env`
   - **Produzione:** `env/EDIT_STRIPE_PRODUCTION.env`

   Oppure da terminale nella root del progetto:

   ```bash
   npm run env:stripe:open-staging
   npm run env:stripe:open-production
   ```

2. Compila le righe (pk_live…, sk_live…, whsec… dal webhook Stripe).

3. Copia i valori nei file **realmente usati dall’app** (stesso contenuto Stripe):

   ```bash
   npm run env:stripe:merge
   ```

   Questo aggiorna nella root del progetto:

   - `.env.staging`
   - `.env.production`

   (Se uno dei due non esiste, creane una copia da `.env.example` e rinominala prima.)

4. Verifica:

   ```bash
   npm run env:validate:payments:staging
   npm run env:validate:payments:production
   ```

## Google Maps (Map ID)

- In staging/produzione imposta anche `VITE_GOOGLE_MAPS_MAP_ID` (Map Management → Map ID del progetto) nei file `.env.staging` e `.env.production`.

## Sicurezza

- I file `env/EDIT_STRIPE_*.env` sono in `.gitignore` e vengono creati in locale a partire dai template `*.example`.
- Revoca sempre le chiavi se sono finite in chat o su Git pubblico.
- I file `.env.staging` e `.env.production` nella root sono in `.gitignore` e non vanno mai versionati.
