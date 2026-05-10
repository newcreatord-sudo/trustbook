# Directory listings (attività non verificate) — policy legale/tecnica

## Obiettivo
Popolare TrustBook con schede “informative” di attività in Italia **non verificate** e potenzialmente **non affiliate** a TrustBook, in modo che:
- l’utente possa scoprire l’attività;
- il titolare possa “rivendicare” (claim) la scheda e completarla/modificarla;
- TrustBook non mostri foto/recensioni o contenuti copiati da piattaforme terze non autorizzate;
- i contatti siano mostrati solo se **leciti, recenti e verificati**.

## Principi (da rispettare sempre)
- Non copiare dati da piattaforme con ToS restrittive o divieti di re-hosting (es. directory commerciali, marketplace, map provider con limitazioni).
- Usare solo fonti con licenza compatibile (open data, licenze esplicite, accordi/partner) e conservare provenance (source/licenza/attribution).
- Evitare foto e recensioni di terze parti: le schede directory non devono includerle.
- Mostrare un disclaimer chiaro: “scheda informativa non verificata, potrebbe non essere affiliata”.
- Mostrare contatti solo se:
  - la fonte li consente legalmente;
  - il dato è stato verificato/controllato (o certificato dalla fonte) e non è “stale” (soglia consigliata 180 giorni);
  - non si aggirano paywall, scraping aggressivo o clausole contrattuali.
- Default massimo-sicurezza: importare i contatti se presenti, ma tenerli nascosti finché non vengono marcati come verificati tramite `data_checked_at`.

## Fonti consigliate (tipicamente utilizzabili)
- OpenStreetMap (ODbL): nomi/POI/categorie, coordinate, indirizzi. Richiede attribution e rispetto ODbL (valutare obblighi share-alike sul database derivato).
- Open data di enti pubblici/Regioni/Comuni (licenze tipo CC-BY/CC0/IO): verificare licenza dataset e requisiti di attribuzione.
- Dati forniti direttamente dal titolare (signup/claim) o con consenso scritto.

## Fonti da evitare (tipicamente non ri-hostabili)
- Dati ottenuti tramite scraping da piattaforme/marketplace/directory commerciali con divieti contrattuali.
- Provider map/places con licenze che permettono solo “visualizzazione” e vietano la creazione di un database concorrente.

## Dati ammessi nella scheda “non verificata”
- Nome attività
- Categoria (normalizzata)
- Indirizzo (testo), città, CAP
- Coordinate (lat/lng)
- Contatti (telefono/email/sito) solo se `data_checked_at` recente e fonte/licenza lo consente
- Provenienza: `source`, `source_url` (quando disponibile), `source_license`, `source_attribution`, timestamp di import/check

## UX obbligatoria
- Badge “Non verificata” sempre visibile.
- Banner disclaimer in pagina scheda.
- CTA “Sei il titolare? Verifica e completa” che porta al flusso di onboarding con prefill.
- Nessuna possibilità di prenotazione fino a quando il titolare non rivendica e completa (le attività create via claim partono in pausa).

## Implementazione nel progetto
- Tabella: `public.external_business_listings` (RLS: select pubblico; scrittura via service role).
- Pagina scheda: `/scheda/:slug` (pagina informativa).
- Claim: onboarding con query param `prefillListing=<slug>` e creazione business via RPC `claim_external_business_listing`.
- Vista pubblica: `public.external_business_listings_public` (contatti mascherati finché non verificati).

## Nota legale
Questa policy è una guida tecnica-operativa: prima di import massivo, serve una revisione legale delle fonti/licenze e del testo disclaimer.
