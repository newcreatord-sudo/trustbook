grant select, insert, update, delete on public.recurring_rules to authenticated;
grant select, insert, update, delete on public.staff_closures to authenticated;
grant select, insert, update, delete on public.blocked_slots to authenticated;

revoke all on public.recurring_rules from anon;
revoke all on public.staff_closures from anon;
revoke all on public.blocked_slots from anon;
