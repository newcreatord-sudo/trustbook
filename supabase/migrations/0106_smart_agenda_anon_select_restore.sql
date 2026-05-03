-- 0106_smart_agenda_anon_select_restore.sql
-- Some environments rely on shared base grants through the anon role even for authenticated sessions.
-- RLS policies still prevent anon reads (no select policy to anon for these tables).

grant select on public.recurring_rules to anon;
grant select on public.staff_closures to anon;
grant select on public.blocked_slots to anon;

