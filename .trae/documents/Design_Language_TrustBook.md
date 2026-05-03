# TrustBook — Design System (operativo)

## Identità
- Fiducia: colori freddi, contrasto alto, testo chiaro, messaggi trasparenti.
- Ordine: layout a griglia, card consistenti, gerarchia tipografica corta.
- Controllo: stati sempre visibili (in attesa, caparra, confermata), azioni con conferma.

## Design tokens (UI)
- Background: `#0B1220`
- Surface: `bg-white/5`, `bg-white/10`
- Border: `border-white/10`
- Primary: `#4F7CFF` (hover `#6A90FF`)
- Semantic:
  - Success: emerald
  - Warning: amber
  - Danger: red
- Text: `text-white`, muted `text-white/70`, `text-white/60`
- Radius standard: `rounded-3xl` (card), `rounded-2xl` (button), `rounded-xl` (input)

## Tipografia
- Titolo sezione: `text-sm font-semibold`
- Sottotitolo: `text-xs text-white/70`
- Corpo: `text-sm text-white/70`

## Spaziature
- Base grid 4px: `gap-2/3/4/6`, padding `p-4/5/6/8`
- Layout page: `.tb-page` (`max-w-5xl`, `mx-auto`)

## Component classes (source of truth)
- Card: `.tb-card` + `.tb-card-pad`
- Button: `.tb-btn` + `.tb-btn-primary` / `.tb-btn-secondary`
- Input: `.tb-input` + `.tb-label`
- Segment control: `.tb-seg` + `.tb-seg-btn` + `.tb-seg-btn-active` / `.tb-seg-btn-inactive`
- Choice card: `.tb-choice` + `.tb-choice-active` / `.tb-choice-idle`
- Alerts: `.tb-alert` + `.tb-alert-danger` / `.tb-alert-info`

## Componenti React (source of truth)
- `src/shared/ui/Button.tsx`
- `src/shared/ui/Input.tsx`, `Select.tsx`, `Textarea.tsx`
- `src/shared/ui/Badge.tsx`, `Avatar.tsx`, `ListItem.tsx`
- `src/shared/ui/Modal.tsx`, `ConfirmDialog.tsx`
- `src/shared/ui/EmptyState.tsx`, `Skeleton.tsx`, `FullScreenLoader.tsx`
- Toast: `src/shared/ui/toast.tsx` (provider + hook)

## Pattern UX (regole)
- Ogni pagina deve avere: `loading` → `error` → `empty` gestiti esplicitamente.
- Azioni irreversibili: sempre conferma (`ConfirmDialog`) e busy state.
- Microcopy: frasi corte, orientate a outcome (“Caparra richiesta”, “Prenotazione confermata”).
- Navigazione: una CTA primaria per sezione, secondary solo se necessario.

## Come creare nuove schermate
1. Layout base: container `.tb-page` + card `.tb-card`.
2. Titoli: kicker breve (`.tb-kicker`) → titolo (`.tb-title`) → sottotitolo (`.tb-subtitle`).
3. Form: label `.tb-label`, input `.tb-input`, error `.tb-alert-danger`.
4. Stati: skeleton o placeholder coerenti con card.
