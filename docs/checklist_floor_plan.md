# Checklist — Floor Plan & Table Management

## Fase A: Schema + RPC Base

- [ ] `0070_floor_plan_schema_version.sql` applicata
- [ ] `layout_json` con version validation
- [ ] `get_floor_plan_bundle` RPC funziona e ritorna dati aggregati
- [ ] `is_resource_available` RPC funziona e ritorna boolean corretto
- [ ] Test: risorsa occupata → `is_resource_available` = false
- [ ] Test: risorsa libera → `is_resource_available` = true

## Fase B: Dashboard Sala & Tavoli

- [ ] Pagina "Sala & Planimetria" accessibile da dashboard owner
- [ ] Tab Piani: CRUD piani funziona
- [ ] Editor canvas: aggiunta tavolo funziona
- [ ] Editor canvas: spostamento tavolo funziona
- [ ] Editor canvas: resize tavolo funziona
- [ ] Editor canvas: rotazione tavolo funziona
- [ ] Editor canvas: eliminazione tavolo funziona
- [ ] Editor canvas: salvataggio automatico funziona
- [ ] Tab Risorse: CRUD risorse sincronizzato con canvas
- [ ] Permessi: solo owner può modificare
- [ ] Staff/viewer può solo vedere

## Fase C: Availability nel Booking Flow

- [ ] `list_available_resources_for_slot` RPC funziona
- [ ] Filtro capienza funziona (party_size)
- [ ] `auto_assign_resource_for_booking` RPC funziona
- [ ] Assegnazione automatica post-conferma funziona
- [ ] Se hospitality_table + required: blocca booking se tavolo non disponibile
- [ ] Se hospitality_table + preferred: permette skip scelta

## Fase D: UX Cliente

- [ ] Step "Scegli tavolo" appare nel BookingPanel (se conditions soddisfatte)
- [ ] Mini canvas read-only mostra tavoli disponibili
- [ ] Cliente può selezionare tavolo
- [ ] Messaggio errore se required + nessun tavolo disponibile
- [ ] Bottone "Assegnazione automatica" funziona

## Fase E: AI Agent

- [ ] `ai_suggest_resource_for_booking` RPC funziona
- [ ] `ai_agent_execution_log` registra ogni azione
- [ ] Tool: ai_read_floor_plan
- [ ] Tool: ai_list_available_tables
- [ ] Tool: ai_suggest_table_assignment
- [ ] Tool: ai_assign_table
- [ ] Tool: ai_unassign_table
- [ ] Tool: ai_block_table
- [ ] Tool: ai_unblock_table

## Integrazione e Regressioni

- [ ] `verify:repo` passa
- [ ] `gate:release --strict-db` passa
- [ ] Booking flow esistente (no tavolo) non è rotto
- [ ] `set_booking_primary_resource` esistente non è rotto
- [ ] RLS policies non sono state indebolite

## Smoke Manuale

- [ ] Owner crea piano + aggiunge tavoli (canvas)
- [ ] Owner verifica che tavoli appaiono nella lista risorse
- [ ] Owner assegna tavolo a booking dalla dashboard
- [ ] Cliente vede step scelta tavolo (se enabled)
- [ ] Cliente seleziona tavolo e conferma
- [ ] Cliente sceglie "assegnazione automatica" e booking funziona
- [ ] AI legge planimetria e suggerisce tavolo
- [ ] AI assegna tavolo (se owner ha abilitato auto mode)
- [ ] Overlap tavolo: seconda prenotazione stesso tavolo stesso orario → errore DB coerente
