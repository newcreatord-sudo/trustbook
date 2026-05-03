# Tasks — Floor Plan & Table Management

## Phase A: Contratto Dati Planimetria

- [ ] **0070_floor_plan_schema_version.sql**
  - Aggiungere `version int NOT NULL DEFAULT 0` a `business_floor_plans.layout_json`
  - Validazione che `version >= 0` e presente quando `nodes` presente
  - Commento sul formato versionato

- [ ] **RPC `get_floor_plan_bundle`** (0071)
  - `SECURITY DEFINER` con `is_business_member`
  - Ritorna floor plans + risorse aggregate (solo campi pubblici)
  - Join con `business_booking_resources`

## Phase B: Dashboard Attività — Sala & Tavoli

- [ ] **UI: FloorPlanEditor component**
  - Canvas 2D HTML5 (no libreria esterna per ora)
  - Drag & drop tavoli
  - Resize con handle ai 4 angoli
  - Rotazione con handle circolare
  - Zoom + pan
  - Griglia di supporto toggle
  - Salvataggio automatico debounced via `upsert_floor_plan`

- [ ] **UI: SalaSettingsPage**
  - Tab 1: Lista piani (CRUD)
  - Tab 2: Editor planimetria canvas
  - Tab 3: Tabella risorse (CRUD sincronizzato)
  - Permesso: solo owner

- [ ] **RPC `upsert_floor_plan`**
  - Validazione schema `layout_json`
  - Verifica `resource_id` referenziano risorse del business
  - Owner-only

- [ ] **RPC `upsert_booking_resource`**
  - CRUD risorse completo
  - Sync con canvas editor
  - Owner-only

- [ ] **RPC `delete_booking_resource`**
  - Check non abbia assegnazioni attive
  - Owner-only

## Phase C: Motore Prenotazioni — Risorsa come Vincolo

- [ ] **RPC `is_resource_available`**
  - Verifica risorsa attiva e non in overlap con altre assegnazioni
  - Parametro `exclude_booking_id` per update
  - Used inside booking flow

- [ ] **RPC `list_available_resources_for_slot`**
  - Filtra risorse per capienza e disponibilità nello slot
  - Accessibile ad anon (solo etichette/capienza/posizione)
  - usato dal BookingPanel cliente

- [ ] **RPC `auto_assign_resource_for_booking`**
  - Assegna primo tavolo disponibile capiente
  - Post-conferma booking

- [ ] **Integrazione availability in create_booking flow**
  - Se hospitality_table + customer_table_choice = required: verifica tavolo disponibile prima di confermare
  - Se preferred: proponi tavolo ma accetta anche "scegli dopo"

## Phase D: UX Cliente

- [ ] **BookingPanel step "Scegli tavolo"**
  - Solo se vertical = hospitality_table + resource_management_enabled + customer_table_choice != off
  - Mini canvas read-only con tavoli disponibili evidenziati
  - Bottone "Assegnazione automatica" se preferred
  - Chiamata a `list_available_resources_for_slot`

- [ ] **Estendere `business_booking_ecosystem`**
  - Colonna `customer_table_choice enum('off','preferred','required')` default 'preferred'
  - Colonna `default_table_assignment_mode enum('auto','customer_choice')` default 'auto'

## Phase E: Agente AI

- [ ] **RPC `ai_suggest_resource_for_booking`**
  - Scoring: zona preferita, capienza ottimale, posizione
  - Ritorna top 3 suggerimenti

- [ ] **Tabella `ai_agent_execution_log`**
  - Log strutturato per ogni azione automatica
  - tool_name, parameters, result, error, executed_by, created_at

- [ ] **Tool wrappers per AI layer**
  - ai_read_floor_plan
  - ai_list_available_tables
  - ai_suggest_table_assignment
  - ai_assign_table
  - ai_unassign_table
  - ai_block_table
  - ai_unblock_table
