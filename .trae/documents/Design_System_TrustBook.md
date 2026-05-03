# TrustBook — Design System

## Obiettivo
Un set di token + componenti riutilizzabili che renda ogni nuova schermata coerente, premium e veloce da costruire.

## Token
### Colori
- Background: `--tb-bg` (`#0B1220`)
- Surface: `--tb-surface` (`bg-white/5`), `--tb-surface-2` (`bg-white/10`)
- Border: `--tb-border` (`border-white/10`)
- Primary: `--tb-primary` (`#4F7CFF`), hover `--tb-primary-hover` (`#6A90FF`)
- Semantic:
  - Success: emerald (`border-emerald-500/30`, `bg-emerald-500/10`)
  - Warning: amber (`border-amber-500/30`, `bg-amber-500/10`)
  - Danger: red (`border-red-500/30`, `bg-red-500/10`)

### Tipografia
- Titolo pagina/sezione: `text-sm font-semibold`
- Sottotitolo: `text-xs text-white/70`
- Corpo: `text-sm text-white/70`
- Microcopy: `text-xs text-white/60`

### Spaziature
- Base grid 4px: `gap-2/3/4/6`, `p-4/5/6/8`
- Page container: `.tb-page` (max width, centrato)

### Radius
- Card: `rounded-3xl`
- Button: `rounded-2xl` (default), `rounded-xl` (sm)
- Input: `rounded-xl`

### Ombre
- Modali/toast: `--tb-shadow` + `shadow-2xl`

## Classi UI (source of truth)
Definite in [index.css](file:///c:/Users/david/Documents/trae_projects/trustbook/src/index.css):
- `.tb-card`, `.tb-card-pad`
- `.tb-btn`, `.tb-btn-primary`, `.tb-btn-secondary`
- `.tb-input`, `.tb-label`
- `.tb-seg`, `.tb-seg-btn`, `.tb-seg-btn-active`, `.tb-seg-btn-inactive`
- `.tb-choice`, `.tb-choice-active`, `.tb-choice-idle`
- `.tb-alert`, `.tb-alert-danger`, `.tb-alert-info`

## Componenti React (riutilizzabili)
Tutti in `src/shared/ui/`:
- Button: `Button.tsx`
- Form: `Input.tsx`, `Select.tsx`, `Textarea.tsx`, `Checkbox.tsx`, `Radio.tsx`, `Switch.tsx`
- Layout: `Card.tsx`, `TopBar.tsx`, `Navbar.tsx`, `Sidebar.tsx`
- Feedback: `Alert.tsx`, `Badge.tsx`, `EmptyState.tsx`, `Skeleton.tsx`, `FullScreenLoader.tsx`
- Overlay: `Modal.tsx`, `ConfirmDialog.tsx`
- Toast: `ToastProvider.tsx` + hook `useToast` in `toastContext.ts`
- Data display: `Avatar.tsx`, `ListItem.tsx`

## Regole di utilizzo
1. Pagine: composizione + fetch + stato; UI primaria da `shared/ui/`.
2. Varianti: usa `variant` (es. `Button`) e `tone` (es. `Badge`, `Alert`) invece di classi hardcoded.
3. Stati: ogni azione ha `busy`, error = `Alert`, empty = `EmptyState`, loading = `Skeleton` o `FullScreenLoader`.

