-- 0041_fix_notifications_function_ambiguity.sql
-- Fix ambiguous parameter/column references in notification helper functions.

create or replace function public.notify_user(
  recipient uuid,
  business uuid,
  booking uuid,
  kind text,
  title text,
  body text,
  link text,
  dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
begin
  insert into public.notifications (
    recipient_user_id,
    business_id,
    booking_id,
    kind,
    title,
    body,
    link,
    dedupe_key
  )
  values (
    recipient,
    business,
    booking,
    kind,
    title,
    body,
    link,
    dedupe_key
  )
  on conflict (recipient_user_id, dedupe_key) do nothing;
end;
$$;

create or replace function public.notify_business_members(
  business uuid,
  booking uuid,
  kind text,
  title text,
  body text,
  link text,
  dedupe_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  v_owner_id uuid;
begin
  select b.owner_user_id
  into v_owner_id
  from public.businesses b
  where b.id = business;

  if v_owner_id is not null then
    perform public.notify_user(
      v_owner_id,
      business,
      booking,
      kind,
      title,
      body,
      link,
      dedupe_key
    );
  end if;

  insert into public.notifications (
    recipient_user_id,
    business_id,
    booking_id,
    kind,
    title,
    body,
    link,
    dedupe_key
  )
  select
    tm.user_id,
    business,
    booking,
    kind,
    title,
    body,
    link,
    dedupe_key
  from public.team_members tm
  where tm.business_id = business
  on conflict (recipient_user_id, dedupe_key) do nothing;
end;
$$;
