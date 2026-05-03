-- Fix: notify_user/notify_business_members were rewritten with `#variable_conflict use_variable`,
-- which breaks `ON CONFLICT (recipient_user_id, dedupe_key)` because those identifiers get
-- resolved as PL/pgSQL variables instead of table columns (SQLSTATE 42P10).
--
-- Solution: promote the existing unique index to a named UNIQUE constraint and use
-- `ON CONFLICT ON CONSTRAINT ...` to avoid variable/column ambiguity entirely.

create unique index if not exists notifications_dedupe
on public.notifications (recipient_user_id, dedupe_key);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conrelid = 'public.notifications'::regclass
      and conname = 'notifications_dedupe'
  ) then
    alter table public.notifications
      add constraint notifications_dedupe unique using index notifications_dedupe;
  end if;
end;
$$;

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
  on conflict on constraint notifications_dedupe do nothing;
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
  on conflict on constraint notifications_dedupe do nothing;
end;
$$;

