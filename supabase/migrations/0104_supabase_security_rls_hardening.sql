-- 0104_supabase_security_rls_hardening.sql
-- Goal: close remaining RLS leaks and align helper membership checks with owner access.

-- 1) Treat owner as business member (used across many RLS policies).
create or replace function public.is_business_member(bid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = bid and b.owner_user_id = auth.uid()
  )
  or exists (
    select 1 from public.team_members tm
    where tm.business_id = bid and tm.user_id = auth.uid()
  );
$$;

-- 2) Smart Agenda enterprise tables: remove public SELECT leakage (availability is served via validated RPCs).
alter table public.recurring_rules enable row level security;
alter table public.staff_closures enable row level security;
alter table public.blocked_slots enable row level security;

drop policy if exists "Public read recurring_rules" on public.recurring_rules;
drop policy if exists "Public read staff_closures" on public.staff_closures;
drop policy if exists "Public read blocked_slots" on public.blocked_slots;

drop policy if exists recurring_rules_select_member on public.recurring_rules;
create policy recurring_rules_select_member on public.recurring_rules
for select to authenticated
using (public.is_business_member(business_id));

drop policy if exists staff_closures_select_member on public.staff_closures;
create policy staff_closures_select_member on public.staff_closures
for select to authenticated
using (public.is_business_member(business_id));

drop policy if exists blocked_slots_select_member on public.blocked_slots;
create policy blocked_slots_select_member on public.blocked_slots
for select to authenticated
using (public.is_business_member(business_id));

revoke all on public.recurring_rules from anon;
revoke all on public.staff_closures from anon;
revoke all on public.blocked_slots from anon;

grant select, insert, update, delete on public.recurring_rules to authenticated;
grant select, insert, update, delete on public.staff_closures to authenticated;
grant select, insert, update, delete on public.blocked_slots to authenticated;

-- 3) Business subscriptions: use unified member check (includes owner), not only team_members rows.
alter table public.business_subscriptions enable row level security;

drop policy if exists "Business subscriptions are viewable by owner/staff" on public.business_subscriptions;
drop policy if exists business_subscriptions_select_member on public.business_subscriptions;
create policy business_subscriptions_select_member on public.business_subscriptions
for select to authenticated
using (public.is_business_member(business_id));

