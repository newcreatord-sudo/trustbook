create table if not exists public.booking_internal_notes (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  body text not null default '',
  updated_by_user_id uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.booking_internal_notes enable row level security;

drop policy if exists booking_internal_notes_select_member on public.booking_internal_notes;
create policy booking_internal_notes_select_member on public.booking_internal_notes
for select to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and public.is_business_member(b.business_id)
  )
);

drop policy if exists booking_internal_notes_write_member on public.booking_internal_notes;
create policy booking_internal_notes_write_member on public.booking_internal_notes
for all to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and public.is_business_member(b.business_id)
  )
)
with check (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and public.is_business_member(b.business_id)
  )
);

grant select, insert, update, delete on public.booking_internal_notes to authenticated;

create table if not exists public.business_customer_tags (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  tag text not null check (char_length(tag) between 1 and 32),
  note text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, customer_user_id, tag)
);

alter table public.business_customer_tags enable row level security;

drop policy if exists business_customer_tags_select_member on public.business_customer_tags;
create policy business_customer_tags_select_member on public.business_customer_tags
for select to authenticated
using (public.is_business_member(business_id));

drop policy if exists business_customer_tags_write_member on public.business_customer_tags;
create policy business_customer_tags_write_member on public.business_customer_tags
for all to authenticated
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

grant select, insert, update, delete on public.business_customer_tags to authenticated;

create table if not exists public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  kind text not null,
  visibility text not null check (visibility in ('all', 'business_only')),
  actor_user_id uuid null references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists booking_events_booking_id_created_at_idx
on public.booking_events (booking_id, created_at desc);

alter table public.booking_events enable row level security;

drop policy if exists booking_events_select_participant on public.booking_events;
create policy booking_events_select_participant on public.booking_events
for select to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and (
        (visibility = 'all' and (b.customer_user_id = auth.uid() or public.is_business_member(b.business_id)))
        or (visibility = 'business_only' and public.is_business_member(b.business_id))
      )
  )
);

grant select on public.booking_events to authenticated;

create or replace function public.insert_booking_event(
  p_booking_id uuid,
  p_kind text,
  p_visibility text,
  p_actor_user_id uuid,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b_id uuid;
begin
  select business_id into b_id from public.bookings where id = p_booking_id;
  if b_id is null then
    return;
  end if;

  insert into public.booking_events (booking_id, business_id, kind, visibility, actor_user_id, payload)
  values (p_booking_id, b_id, p_kind, p_visibility, p_actor_user_id, coalesce(p_payload, '{}'::jsonb));
end;
$$;

create or replace function public.bookings_events_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.insert_booking_event(new.id, 'booking_created', 'all', new.customer_user_id, jsonb_build_object(
    'start_at', new.start_at,
    'end_at', new.end_at,
    'service_id', new.service_id
  ));
  return new;
end;
$$;

create or replace function public.bookings_events_on_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    perform public.insert_booking_event(new.id, 'status_changed', 'all', auth.uid(), jsonb_build_object(
      'from', old.status,
      'to', new.status
    ));
  end if;

  if new.deposit_status is distinct from old.deposit_status then
    perform public.insert_booking_event(new.id, 'deposit_status_changed', 'all', auth.uid(), jsonb_build_object(
      'from', old.deposit_status,
      'to', new.deposit_status
    ));
  end if;

  if new.proposed_start_at is not null and old.proposed_start_at is null then
    perform public.insert_booking_event(new.id, 'time_change_proposed', 'all', auth.uid(), jsonb_build_object(
      'proposed_start_at', new.proposed_start_at,
      'proposed_end_at', new.proposed_end_at,
      'message', new.proposal_message
    ));
  end if;

  if new.proposed_start_at is null and old.proposed_start_at is not null and (new.start_at is distinct from old.start_at) then
    perform public.insert_booking_event(new.id, 'time_changed', 'all', auth.uid(), jsonb_build_object(
      'from_start_at', old.start_at,
      'to_start_at', new.start_at,
      'from_end_at', old.end_at,
      'to_end_at', new.end_at
    ));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bookings_events_on_insert on public.bookings;
create trigger trg_bookings_events_on_insert
after insert on public.bookings
for each row execute function public.bookings_events_on_insert();

drop trigger if exists trg_bookings_events_on_update on public.bookings;
create trigger trg_bookings_events_on_update
after update on public.bookings
for each row execute function public.bookings_events_on_update();

create or replace function public.booking_internal_notes_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by_user_id := auth.uid();
  end if;

  perform public.insert_booking_event(new.booking_id, 'internal_note_updated', 'business_only', auth.uid(), jsonb_build_object(
    'len', char_length(new.body)
  ));

  return new;
end;
$$;

drop trigger if exists trg_booking_internal_notes_touch on public.booking_internal_notes;
create trigger trg_booking_internal_notes_touch
before insert or update on public.booking_internal_notes
for each row execute function public.booking_internal_notes_touch();

create or replace function public.business_customer_tags_touch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_business_customer_tags_touch on public.business_customer_tags;
create trigger trg_business_customer_tags_touch
before insert or update on public.business_customer_tags
for each row execute function public.business_customer_tags_touch();

