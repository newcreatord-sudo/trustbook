-- 0105_smart_agenda_privileges_fix.sql
-- Fix grants for enterprise agenda tables when switching roles to 'authenticated' (RLS still enforces access).

grant select, insert, update, delete on public.recurring_rules to authenticated;
grant select, insert, update, delete on public.staff_closures to authenticated;
grant select, insert, update, delete on public.blocked_slots to authenticated;

