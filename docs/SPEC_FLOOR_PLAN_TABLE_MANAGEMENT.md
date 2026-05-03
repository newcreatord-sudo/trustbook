# TrustBook — Planimetria & Gestione Tavoli

## 1. Contesto e Obiettivo

TrustBook è una piattaforma SaaS multi-tenant per prenotazioni con verticalità configurabili (hospitality_table, service, professional_slot, seat_assignment).

Questa specifica copre l'introduzione di **planimetria business** (layout dei tavoli/risorse) e **selezione tavolo cliente**, con accesso AI-Agent tramite tool server-side — mai bypass RLS, mai SQL arbitrario.

---

## 2. Stato Attuale del Repository

### 2.1 Già Implementato

| Elemento | Migration | Descrizione |
|----------|-----------|-------------|
| `business_floor_plans` | 0063 | id, business_id, name, layout_json (jsonb), is_active |
| `business_booking_resources` | 0063 | id, business_id, floor_plan_id, kind (table/room/chair/station/equipment/seat), label, capacity_min/max, position_json, metadata, is_active |
| `booking_resource_assignments` | 0063 | booking_id, primary_resource_id, party_size, metadata |
| `set_booking_primary_resource` RPC | 0064 | Assegna risorsa a prenotazione; member-only (verifica business membership) |
| `business_upsert_blocked_slot` RPC | 0064 | Crea blocco slot; owner-only |
| `business_delete_blocked_slot` RPC | 0064 | Elimina blocco; owner-only |
| `auto_apply_whitelisted_ai_suggestions` RPC | 0064 | Batch per azioni AI whitelisted; owner-only |
| `list_bookable_slots_for_booking` RPC | 0058 | Slot disponibili per business/service/staff/date — NON include risorsa |
| `business_booking_ecosystem` | 0063 | Flag `resource_management_enabled`, `booking_vertical`, `ai_execution_mode`, `ai_auto_action_types` |
| RLS policies | 0063 | Member CRUD su floor_plans e resources; write su assignments via business membership |
| `booking_vertical` valori | 0063 | `'service'`, `'hospitality_table'`, `'seat_assignment'`, `'professional_slot'` |

### 2.2 Gap Identificati

| Gap | Impatto |
|-----|---------|
| Nessuno schema `layout_json` versionato | Editor e AI ingovernabili su cambio formato |
| Nessuna RPC per lettura aggregata planimetria+risorse | Client deve fare join manuali; AI legge JSON a mano |
| `list_bookable_slots_for_booking` non filtra per risorsa | Tavoli liberi/occupati non influenzano slot proposti |
| Nessuna UI planimetria (editor canvas) | Attività non può definire layout |
| Nessuna UI scelta tavolo lato cliente | Cliente non può scegliere preferenza |
| `booking_vertical='hospitality_table'` non ha logica dedicata | Verticalità è solo etichetta, senza effetto su availability |
| Agente AI non ha tool per leggere/modificare planimetria | AI non può consigliare assegnazione tavolo |

---

## 3. Schema layout_json Versionato

### 3.1 Formato

```jsonc
{
  "version": 1,  // obbligatorio; interpretato dal client
  "bounds": {
    "width_px": 800,   // larghezza canvas
    "height_px": 600   // altezza canvas
  },
  "grid": {
    "columns": 10,    // colonne guida (opzionale)
    "rows": 8        // righe guida (opzionale)
  },
  "nodes": [
    {
      "id": "node-uuid",
      "resource_id": "booking-resource-uuid",  // legame a business_booking_resources.id
      "type": "table",                         // sempre "table" per ora; estendibile
      "x": 0.125,      // normalizzato 0-1 (125px su 800px)
      "y": 0.250,       // normalizzato 0-1 (150px su 600px)
      "width": 0.125,   // larghezza normalizzata (100px)
      "height": 0.083,  // altezza normalizzata (50px)
      "rotation": 0,    // gradi; 0 = default
      "zone": "sala",   // zona/opzione per raggruppare (stringa libera)
      "shape": "rect",  // "rect" | "circle" | " booth"
      "label": "T3"     // etichetta sovrascrive resource.label
    }
  ],
  "walls": [],   // riservato per evoluzione; per ora array vuoto
  "annotations": []  // note testuali opzionali
}
```

### 3.2 Regole di Compatibilità

- `version` DEVE essere presente e maggiore di 0.
- Ogni `node.resource_id` DEVE corrispondere a un `business_booking_resources.id` attivo.
- Coordinate sono normalizzate 0–1: `x * bounds.width_px = pixel X`, `y * bounds.height_px = pixel Y`.
- Cambi di `version` sono forward-compatible: client più vecchi ignorano campi sconosciuti.

---

## 4. Architettura Dati

### 4.1 Entità Principali

```
businesses
  └── business_booking_ecosystem (1:1)   ← booking_vertical, resource_management_enabled
        ├── business_floor_plans (1:N)
        │     └── business_booking_resources (1:N per floor_plan_id)
        └── booking_resource_assignments (1:1 per booking)
              └── bookings
```

### 4.2 Colonne da Aggiungere

**`businesses`** (già esiste):
- Nessuna nuova colonna.

**`business_floor_plans`** (già esiste):
- Nessuna modifica strutturale; validazione su `layout_json` gestita via RPC.

**`business_booking_resources`** (già esiste):
- `metadata` extender con: `{ "shape": "rect", "zone": "sala", "turn_time_min": 90 }` — retrocompatibile.

**`business_booking_ecosystem`** (estendere con):
- `customer_table_choice` — enum: `'off' | 'preferred' | 'required'`
- `default_table_assignment_mode` — enum: `'auto' | 'customer_choice'` (default `'auto'`)

---

## 5. RPC Server-Side

### 5.1 Lettura Aggregata — `get_floor_plan_bundle`

```sql
CREATE OR REPLACE FUNCTION public.get_floor_plan_bundle(
  p_business_id uuid,
  p_floor_plan_id uuid DEFAULT NULL  -- NULL = tutti i piani
)
RETURNS TABLE (
  floor_plan_id uuid,
  floor_plan_name text,
  layout_json jsonb,
  resources_json jsonb,   -- array aggregato di risorse
  resource_count int
)
```

Regole:
- `SECURITY DEFINER` con `is_business_member(business_id)` — lettura consentita a qualsiasi membro autenticato.
- Non espone dati sensibili beyond `layout_json` + risorse base.
- Output `resources_json` contiene solo: `{id, label, kind, capacity_min, capacity_max, is_active, position_json}`.

### 5.2 Validazione Risorsa Disponibile — `is_resource_available`

```sql
CREATE OR REPLACE FUNCTION public.is_resource_available(
  p_resource_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_exclude_booking_id uuid DEFAULT NULL  -- per update/riassegnazione
)
RETURNS boolean
```

Regole:
- Verifica risorsa esiste, è attiva, appartiene al business della prenotazione (se `p_exclude_booking_id` fornito).
- Verifica assenza di overlap con altre `booking_resource_assignments` confermate.
- Uso: dentro `create_booking_*` o passo successivo atomico.

### 5.3 Upsert Floor Plan — `upsert_floor_plan`

```sql
CREATE OR REPLACE FUNCTION public.upsert_floor_plan(
  p_business_id uuid,
  p_floor_plan_id uuid DEFAULT NULL,  -- NULL = insert
  p_name text,
  p_layout_json jsonb,
  p_is_active boolean DEFAULT true
)
RETURNS uuid
```

Regole:
- `SECURITY DEFINER` + `is_business_owner` — solo owner può creare/modificare planimetrie.
- Valida schema `layout_json` (presenza di `version`, `nodes[].resource_id` referenziano risorse esistenti nel business).

### 5.4 Upsert Risorsa — `upsert_booking_resource`

```sql
CREATE OR REPLACE FUNCTION public.upsert_booking_resource(
  p_business_id uuid,
  p_resource_id uuid DEFAULT NULL,
  p_floor_plan_id uuid DEFAULT NULL,
  p_kind text,
  p_label text,
  p_capacity_min int DEFAULT 1,
  p_capacity_max int DEFAULT 4,
  p_position_json jsonb DEFAULT '{}',
  p_metadata jsonb DEFAULT '{}',
  p_is_active boolean DEFAULT true
)
RETURNS uuid
```

Regole:
- `SECURITY DEFINER` + `is_business_owner`.
- Valida `kind IN ('table','room','chair','station','equipment','seat')`.

### 5.5 Elimina Risorsa — `delete_booking_resource`

```sql
CREATE OR REPLACE FUNCTION public.delete_booking_resource(
  p_resource_id uuid
)
RETURNS void
```

Regole:
- `SECURITY DEFINER` + owner.
- Se risorsa ha assegnazioni attive (booking confermato future), fallisce con errore.

### 5.6 Disponibilità Risorse per Slot — `list_available_resources_for_slot`

```sql
CREATE OR REPLACE FUNCTION public.list_available_resources_for_slot(
  p_business_id uuid,
  p_service_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_party_size int DEFAULT NULL  -- filtra per capienza
)
RETURNS TABLE (
  resource_id uuid,
  label text,
  kind text,
  capacity_min int,
  capacity_max int,
  zone text,
  position_json jsonb
)
```

Regole:
- `SECURITY DEFINER` + membership check.
- Filtra risorse attive del business con `kind = 'table'` (o vertical-specific).
- Esegue `is_resource_available()` per ogni risorsa candidate.
- Se `p_party_size` fornito, filtra `capacity_min <= party_size <= capacity_max`.
- Accessibile anche ad `anon` per frontend pubblico (solo etichette/capienza/posizione — dati non sensibili).

---

## 6. UI — Dashboard Attività: Sala & Tavoli

### 6.1 Percorso Navigazione

```
BusinessDashboard
  └── Impostazioni / Ecosistema
        └── "Sala & Planimetria" (tab o sezione)
```

### 6.2 Sezioni

**Tab 1 — Piani**
- Lista piani (nome, stato attivo/inattivo).
- Pulsante "Nuovo piano" → form inline (nome).
- Toggle attivo/inattivo.
- Elimina piano (solo se nessuna risorsa assegnata o riassegnabile).

**Tab 2 — Editor Planimetria (canvas 2D)**

Tecnologia: HTML5 Canvas con eventi mouse/touch.

Features:
- Griglia di supporto (toggle).
- Aggiungi tavolo: click su toolbar → click su canvas → dialog rapido (label, capienza min/max, forma, zona).
- Seleziona e sposta tavolo (drag).
- Ridimensiona tavolo (handle ai 4 angoli + rotazione via handle circolare superiore).
- Elimina tavolo (tasto destro o tasto Delete).
- Zoom + pan (mouse wheel + drag su area vuota).
- Salvataggio automatico debounced (2s dopo ultima modifica) via `upsert_floor_plan`.

Elementi canvas renderizzati:
- Rettangoli/cerchi/booth con etichetta al centro.
- Codice colore: verde = attivo, grigio = inattivo.
- Overlap警告 (due tavoli che si sovrappongono) in rosso.

**Tab 3 — Risorse (lista tabellare)**
- Tabella: Label, Tipo, Capienza, Piano, Zona, Stato.
- Edit inline o modal.
- Sincronizzazione bidirezionale con canvas: modifiche su uno riflettono sull'altro.

### 6.3 Permessi UI

- Solo `is_business_owner()` può vedere/usare questa sezione.
- Membri staff/viewer vedono sola lettura (visualizzazione planimetria).

---

## 7. UI — Booking Panel (Cliente)

### 7.1 Step Aggiuntivo dopo Selezione Slot

Solo se:
- `business_booking_ecosystem.booking_vertical = 'hospitality_table'`
- `business_booking_ecosystem.resource_management_enabled = true`
- `business_booking_ecosystem.customer_table_choice != 'off'`

**Passo "Scegli il tuo tavolo" (solo se `preferred` o `required`):**

1. Chiamare `list_available_resources_for_slot(business_id, service_id, start, end, party_size)`.
2. Renderizzare mini-planimetria (canvas read-only) con tavoli disponibili evidenziati.
3. Se `customer_table_choice = 'required'` e nessun tavolo disponibile → messaggio "Nessun tavolo disponibile per questa fascia. Riprova con un altro orario."
4. Se `customer_table_choice = 'preferred'` → bottone "Scegli più tardi / Assegnazione automatica".
5. Cliente seleziona tavolo → `set_booking_primary_resource` chiamato DOPO conferma booking (non prima).

### 7.2 Assegnazione Automatica

Se `customer_table_choice = 'off'` o cliente non sceglie:
- `set_booking_primary_resource` viene chiamato dall'attività via dashboard, oppure
- RPC `auto_assign_resource_for_booking` (da creare) che assegna primo tavolo disponibile compatibile.

---

## 8. Logica Availability — Integrazione Booking Flow

### 8.1 Modifica `create_booking_v3` o Step Post-Creazione

Quando `booking_vertical = 'hospitality_table'`:

1. Se `customer_table_choice IN ('preferred', 'required')` E cliente ha selezionato risorsa:
   - Chiamare `is_resource_available(resource_id, start, end)` prima di inserire.
   - Se `false` → errore "Tavolo non più disponibile, scegli un altro".

2. Se `customer_table_choice = 'off'` E `default_table_assignment_mode = 'auto'`:
   - Dopo conferma, chiamare `auto_assign_resource_for_booking(booking_id)`.

### 8.2 Modifica `list_bookable_slots_for_booking`

Per `booking_vertical = 'hospitality_table'`:
- Accettare parametro opzionale `p_resource_id`.
- Se `p_resource_id` fornito, verificare `is_resource_available` per quello slot.
- Se non disponibile, escludere lo slot.

---

## 9. Agente AI — Tool Server-Side

### 9.1 Principi Architetturali

- **Nessun LLM con accesso diretto al DB o service role key**.
- Ogni operazione AI passa per RPC/whitelisted.
- Ogni azione automatica genera log strutturato in `ai_agent_execution_log`.

### 9.2 Tool Proposti

| Tool | RPC | Parametri | Permesso |
|------|-----|-----------|----------|
| `ai_read_floor_plan` | `get_floor_plan_bundle` | business_id, floor_plan_id | member |
| `ai_list_available_tables` | `list_available_resources_for_slot` | business_id, service_id, start, end, party_size | member |
| `ai_suggest_table_assignment` | Nuovo: `ai_suggest_resource_for_booking` | booking_id, criteria_json | owner |
| `ai_assign_table` | `set_booking_primary_resource` | booking_id, resource_id | owner |
| `ai_unassign_table` | `set_booking_primary_resource(booking_id, NULL)` | booking_id | owner |
| `ai_block_table` | `business_upsert_blocked_slot` | business_id, resource_id, start, end, reason | owner |
| `ai_unblock_table` | `business_delete_blocked_slot` | blocked_slot_id | owner |

### 9.3 Nuova RPC — `ai_suggest_resource_for_booking`

```sql
CREATE OR REPLACE FUNCTION public.ai_suggest_resource_for_booking(
  p_business_id uuid,
  p_booking_id uuid,
  p_criteria jsonb DEFAULT '{}'  -- {"prefer_zone": "finestra", "min_capacity": 2}
)
RETURNS TABLE (
  suggested_resource_id uuid,
  score numeric,
  reason text
)
```

Logica:
- Legge risorse disponibili per lo slot della prenotazione.
- Applica scoring: zona preferita +1, capienza ottimale +1, posizione ottimale per party_size +1.
- Ritorna top 3 suggerimenti ordinati per score.

### 9.4 Log Strutturato — `ai_agent_execution_log`

```sql
CREATE TABLE IF NOT EXISTS public.ai_agent_execution_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  agent_id text,        -- identificativo agente (es. "trustbook-floor-ai")
  tool_name text not null,
  parameters jsonb not null,
  result jsonb,
  error text,
  executed_by uuid references auth.users(id),  -- NULL se system-initiated
  created_at timestamptz not null default now()
);
```

---

## 10. Decisioni Prodotto — Da Confermare

| Decisione | Opzione Raccomandata | Note |
|-----------|---------------------|------|
| Fonte geometrica | Solo TrustBook editor | Integrazione CAD/Renova è progetto separato |
| Scelta tavolo cliente | `preferred` (default) | `required` solo per verticalità specifiche |
| Overbooking sala | Lista d'attesa | Non si sovrascrive mai; si accoda |
| Chi modifica piano | Solo owner | Staff può solo vedere |
| Assegnazione automatica | `auto_assign_resource_for_booking` RPC | Policy: primo tavolo disponibile capiente |

---

## 11. Dipendenze e Ordine di Implementazione

```
Fase 1: DB (migration + RPC)
  ├── 0070_floor_plan_schema_version.sql        ← version field + constraints
  ├── 0071_rpc_get_floor_plan_bundle.sql       ← lettura aggregata
  ├── 0072_rpc_is_resource_available.sql       ← disponibilità risorsa
  ├── 0073_rpc_list_available_resources.sql    ← per slot
  ├── 0074_rpc_auto_assign_resource.sql         ← assegnazione automatica
  └── 0075_ai_agent_execution_log.sql           ← audit log

Fase 2: Dashboard UI
  ├── Componente FloorPlanEditor (canvas 2D)
  ├── SalaSettingsPage (tabs: piani, editor, risorse)
  └── Sincronizzazione con RPC esistenti

Fase 3: Booking Flow Integration
  ├── Integrazione availability per risorsa
  ├── Step scelta tavolo cliente
  └── Auto-assignment post-conferma

Fase 4: AI Agent Tools
  ├── ai_suggest_resource_for_booking RPC
  ├── Log execution
  └── Tool wrappers per AI orchestration layer
```

---

## 12. Retrocompatibilità

- Tutte le nuove colonne hanno `DEFAULT` — nessuna rottura su DB esistenti.
- `layout_json` esistenti senza `version` sono trattate come versione 0 (legacy).
- RPC esistenti (`set_booking_primary_resource`, `business_upsert_blocked_slot`) non cambiano firma.
- Client esistenti che non usano hospitality_table non vedono cambiamenti.
