-- 0107_security_team_roster_revoke_agenda_anon.sql
-- Defense in depth + operational correctness:
-- 1) Revoke anon SELECT on smart-agenda internals (slot discovery uses SECURITY DEFINER RPCs; RLS has no anon policies).
-- 2) Allow team roster SELECT for any member of the same business (owner included via is_business_member).
--    Replaces legacy policy that exposed only the caller's own team_members row — insufficient for Smart Agenda / staff UX.
-- 3) Normalize subscription change-request reads to is_business_member (equivalent to owner OR team row, single source of truth).

-- ---------------------------------------------------------------------------
-- 1) Anon grants (reverted from 0106): do not widen table privileges without RLS policies for anon.
revoke select on public.recurring_rules from anon;
revoke select on public.staff_closures from anon;
revoke select on public.blocked_slots from anon;

-- ---------------------------------------------------------------------------
-- 2) team_members: read roster inside assigned businesses; writes remain owner-only (team_write_owner).
drop policy if exists team_select_owner on public.team_members;
drop policy if exists team_members_select_member on public.team_members;
create policy team_members_select_member on public.team_members
for select to authenticated
using (public.is_business_member(business_id));

-- ---------------------------------------------------------------------------
-- 3) Subscription change requests: same visibility rule, simpler predicate.
drop policy if exists subscription_change_requests_select_owner_staff on public.subscription_change_requests;
drop policy if exists subscription_change_requests_select_member on public.subscription_change_requests;
create policy subscription_change_requests_select_member on public.subscription_change_requests
for select to authenticated
using (public.is_business_member(business_id));

drop policy if exists subscription_change_request_events_select_owner_staff on public.subscription_change_request_events;
drop policy if exists subscription_change_request_events_select_member on public.subscription_change_request_events;
create policy subscription_change_request_events_select_member on public.subscription_change_request_events
for select to authenticated
using (
  exists (
    select 1
    from public.subscription_change_requests r
    where r.id = subscription_change_request_events.request_id
      and public.is_business_member(r.business_id)
  )
);
