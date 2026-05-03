---
name: "floor-plan-designer"
description: "Implementa e gestisce floor plan (planimetrie), risorse (tavoli) e selezione tavolo cliente TrustBook. Usa quando: si sviluppa feature planimetria, si implementa canvas editor, si integra availability risorsa nel booking, si crea tool AI per gestione sala."
---

# Floor Plan Designer

Skill per la gestione end-to-end di planimetrie e risorse TrustBook.

## Riferimenti Rapidi

- **SPEC**: [docs/SPEC_FLOOR_PLAN_TABLE_MANAGEMENT.md](file:///c:/Users/david/Documents/trae_projects/trustbook/docs/SPEC_FLOOR_PLAN_TABLE_MANAGEMENT.md)
- **Tasks**: [docs/tasks_floor_plan.md](file:///c:/Users/david/Documents/trae_projects/trustbook/docs/tasks_floor_plan.md)
- **Checklist**: [docs/checklist_floor_plan.md](file:///c:/Users/david/Documents/trae_projects/trustbook/docs/checklist_floor_plan.md)

## Schema layout_json

Ogni layout JSON DEVE avere questo formato:

```json
{
  "version": 1,
  "bounds": { "width_px": 800, "height_px": 600 },
  "nodes": [
    {
      "id": "node-uuid",
      "resource_id": "business_booking_resources.id",
      "type": "table",
      "x": 0.125, "y": 0.250,
      "width": 0.125, "height": 0.083,
      "rotation": 0,
      "zone": "sala",
      "shape": "rect",
      "label": "T3"
    }
  ]
}
```

Coordinate sono normalizzate 0-1. `version` è obbligatorio.

## Struttura Dati Esistente

```
businesses
  └── business_booking_ecosystem (booking_vertical, resource_management_enabled)
        ├── business_floor_plans (id, business_id, name, layout_json, is_active)
        │     └── business_booking_resources (id, floor_plan_id, kind, label, capacity_min/max, position_json, metadata, is_active)
        └── booking_resource_assignments (booking_id, primary_resource_id, party_size)
```

## RPC Esistenti (NON modificare firma)

| RPC | Permission | Uso |
|-----|-----------|-----|
| `set_booking_primary_resource(booking_id, resource_id)` | member | Assegna risorsa a booking |
| `business_upsert_blocked_slot(...)` | owner | Crea blocco availability |
| `business_delete_blocked_slot(blocked_slot_id)` | owner | Elimina blocco |
| `list_bookable_slots_for_booking(...)` | anon | Slot disponibili (NON filtra per risorsa) |
| `get_floor_plan_bundle(p_business_id, p_floor_plan_id)` | member | Lettura aggregata planimetria (DA CREARE) |
| `is_resource_available(resource_id, start, end, exclude_booking_id)` | member | Disponibilità risorsa (DA CREARE) |
| `list_available_resources_for_slot(...)` | anon | Risorse disponibili per slot (DA CREARE) |

## Regole Architetturali

### ASSOLUTAMENTE VIETATO

- Accesso diretto al DB con service role key
- SQL arbitrario inline nel codice
- Bypass delle RLS policies
- Chiamate RPC senza validazione server-side

### SEMPRE

- Usare RPC esistenti o crearne di nuove con `SECURITY DEFINER`
- Validare input lato server
- Loggare azioni automatiche in `ai_agent_execution_log`
- Verificare `is_business_owner` / `is_business_member` prima di operazioni

## Ordine di Implementazione

1. **DB migrations** (0063/0064 già esistono, verificare gap)
2. **RPC** nuove: `get_floor_plan_bundle`, `is_resource_available`, `list_available_resources_for_slot`, `upsert_floor_plan`, `upsert_booking_resource`, `delete_booking_resource`
3. **Dashboard UI**: FloorPlanEditor (canvas 2D), SalaSettingsPage
4. **Booking Flow**: integrazione availability risorsa
5. **Cliente UI**: step scelta tavolo nel BookingPanel
6. **AI Tools**: `ai_suggest_resource_for_booking`, log strutturato

## Canvas Editor Guidelines

- Usa HTML5 Canvas 2D nativo (NO librerie esterne)
- Coordinate normalizzate 0-1 nel layout_json
- Render: rect/circle/booth per tipo tavolo
- Zoom: mouse wheel + pan drag su area vuota
- Salvataggio automatico debounced 2s dopo ultima modifica

## Comandi Utili

```bash
# Verifica gate
npm run gate:release -- --strict-db

# Verifica DB
npm run db:verify-booking-integrity
npm run db:verify-booking-flow
npm run db:verify-owner-strict
npm run db:verify-rls-impersonation

# Apply migrations (se necessario)
npx supabase db push
```
