# Import attività da OpenStreetMap (OSM) — sicuro, legale, scalabile

## Obiettivo
Popolare TrustBook con schede “informative” di attività in Italia partendo da OpenStreetMap (OSM) in modo:
- legale (licenza ODbL + attribution),
- sicuro (niente scraping di piattaforme con ToS restrittive),
- efficiente (import massivo a batch, dedupe per `source_ref`),
- coerente (categorie normalizzate TrustBook).

Le schede importate sono **Non verificate** e non devono includere foto/recensioni di terzi.

## Licenza e attribution (ODbL)
OSM è rilasciato sotto ODbL. Per l’uso in TrustBook:
- conservare provenance (`source`, `source_url`, `source_license`, `source_attribution`);
- mostrare attribution dove richiesto (UI/credits);
- valutare gli obblighi ODbL (in particolare share-alike su “Derivative Database”) prima di import massivo in produzione.

Impostazioni suggerite nei record:
- `source`: `openstreetmap`
- `source_license`: `ODbL 1.0`
- `source_attribution`: `© OpenStreetMap contributors`
- `source_url`: URL dell’elemento (node/way/relation)

## Regola contatti (massima sicurezza)
Anche se OSM può contenere `phone/email/website`, TrustBook deve trattarli come **non verificati**:
- importare i valori (facoltativo), ma non esporli al pubblico di default;
- `data_checked_at` deve rimanere `null` finché una pipeline di verifica “lecita e tracciata” non li conferma.

Nel DB è presente una vista pubblica che mostra i contatti **solo** se `data_checked_at` è recente e c’è licenza valorizzata.

## Categorie TrustBook (normalizzazione)
TrustBook usa categorie normalizzate (es. `parrucchiere`, `barbiere`, `ristorante`, `pizzeria`, `hotel_bnb`, `officina`, `consulente`, `professionista`, `centro_sportivo`, `altro`).
Lo script di export mappa i tag OSM più comuni (`amenity/shop/tourism/leisure/office/craft` + `cuisine`) sulle categorie TrustBook.

## Processo consigliato (Italia)
1) Genera export OSM per area (bbox) in NDJSON:
   - esegui più “tile” (bbox piccoli) per evitare timeouts Overpass.
2) Importa NDJSON in Supabase con service role:
   - `upsert` su `(source, source_ref)` per dedupe.
3) Le schede sono visibili su `/esplora` e hanno pagina `/scheda/:slug` con disclaimer + CTA claim.
4) Solo il titolare può “claimare” e completare.

## Script
- Export OSM → NDJSON:
  - `node ./scripts/osm-overpass-export.mjs --bbox=<minLat,minLng,maxLat,maxLng> --out=./artifacts/osm.ndjson`
- Import NDJSON:
  - `node ./scripts/import-external-business-listings-ndjson.mjs --env-file=.env.staging --input=./artifacts/osm.ndjson --source=openstreetmap`

## Note operative
- Overpass ha limiti: usare backoff e tile piccoli.
- Non usare provider commerciali “Places” per creare un database concorrente.

