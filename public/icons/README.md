# PWA Icons — sostituire prima del go-live

Questa cartella contiene un master SVG placeholder. Per andare in produzione
servono asset PNG generati dal brand reale.

## File richiesti

- `icon-192.png` — 192×192, fondo solido, padding 8%, purpose `any`.
- `icon-512.png` — 512×512, fondo solido, padding 8%, purpose `any`.
- `icon-maskable-192.png` — 192×192, safe-area centrale 80% (40% radius), purpose `maskable`.
- `icon-maskable-512.png` — 512×512, safe-area centrale 80% (40% radius), purpose `maskable`.
- `apple-touch-icon.png` — 180×180, fondo solido (richiesto da iOS).

## Generazione veloce da SVG (non per produzione finale)

```bash
# Tooling consigliato: sharp via CLI o pwa-asset-generator
npx pwa-asset-generator public/icons/icon-source.svg public/icons \
  --opaque true --background "#0b1220" --padding "calc(10% + 0px)" \
  --icon-only --type png --quality 100
```

> Le PNG vanno create con un graphic designer reale: il logo SVG attuale è
> ottimizzato 32×32, non scala bene a 512×512. Senza icone vere la PWA verrà
> rifiutata dagli store privati (Microsoft Store, Play Asset Delivery).
