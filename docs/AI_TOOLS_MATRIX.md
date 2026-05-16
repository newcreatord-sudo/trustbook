# AI Tools Matrix

| Area | HTTP | RPC | Accesso | Flag ecosistema (business_booking_ecosystem) |
|---|---|---|---|---|
| Note operative | GET /api/ai-tools/notes | list_business_operational_notes | business member | ai_notes_enabled (solo se agentId presente) |
| Note operative | POST /api/ai-tools/notes/upsert | upsert_business_operational_note | business member | ai_notes_enabled |
| Note operative | POST /api/ai-tools/notes/delete | delete_business_operational_note | business member | ai_notes_enabled |
| Planimetria | GET /api/ai-tools/floor-plan/bundle | ai_get_floor_plan_bundle | business owner | ai_floor_plan_read_enabled |
| Tavoli disponibili | GET /api/ai-tools/tables/available | ai_list_available_tables_for_slot | business owner | ai_floor_plan_read_enabled |
| Booking list | GET /api/ai-tools/bookings/list | ai_list_business_bookings | business owner | ai_booking_operator_enabled |
| Booking detail | GET /api/ai-tools/bookings/detail | ai_get_business_booking | business owner | ai_booking_operator_enabled |
| Booking payments | GET /api/ai-tools/bookings/payments | ai_list_business_booking_payments | business member | ai_booking_operator_enabled |
| Day summary | GET /api/ai-tools/day-summary | ai_get_business_day_summary | business owner | ai_booking_operator_enabled |
| Slot bookable | GET /api/ai-tools/slots/bookable | ai_list_bookable_slots_for_service_day | business owner | ai_booking_operator_enabled |
| Booking approve | POST /api/ai-tools/bookings/approve | ai_approve_booking_request | business owner | ai_booking_operator_enabled (+ agentId richiesto) |
| Booking reject | POST /api/ai-tools/bookings/reject | ai_reject_booking_request | business owner | ai_booking_operator_enabled (+ agentId richiesto) |
| Booking reschedule apply | POST /api/ai-tools/bookings/reschedule-apply | ai_apply_booking_reschedule | business owner | ai_booking_operator_enabled (+ agentId richiesto) |
| Booking reschedule propose | POST /api/ai-tools/bookings/propose-reschedule | ai_propose_booking_reschedule | business owner | ai_booking_operator_enabled (+ agentId richiesto) |
| Booking accept proposal | POST /api/ai-tools/bookings/accept-time-proposal | ai_accept_booking_time_proposal | business owner | ai_booking_operator_enabled (+ agentId richiesto) |
| Booking reject proposal | POST /api/ai-tools/bookings/reject-time-proposal | ai_reject_booking_time_proposal | business owner | ai_booking_operator_enabled (+ agentId richiesto) |
| Booking completed | POST /api/ai-tools/bookings/mark-completed | ai_complete_booking | business owner | ai_booking_operator_enabled (+ agentId richiesto) |
| Booking no-show | POST /api/ai-tools/bookings/mark-no-show | ai_mark_booking_no_show | business owner | ai_booking_operator_enabled (+ agentId richiesto) |
| Booking cancel (business) | POST /api/ai-tools/bookings/cancel-by-business | (Stripe admin) | business owner | payments enabled |

