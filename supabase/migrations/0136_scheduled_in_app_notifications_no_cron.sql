alter table public.notifications
  add column if not exists deliver_at timestamptz;

create index if not exists notifications_recipient_due_unread_created_idx
on public.notifications (recipient_user_id, deliver_at, created_at desc)
where read_at is null;

create or replace function public.trg_notifications_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_service boolean;
begin
  is_service := auth.role() = 'service_role';
  if is_service then
    return new;
  end if;

  if new.recipient_user_id is distinct from old.recipient_user_id
    or new.business_id is distinct from old.business_id
    or new.booking_id is distinct from old.booking_id
    or new.kind is distinct from old.kind
    or new.title is distinct from old.title
    or new.body is distinct from old.body
    or new.link is distinct from old.link
    or new.dedupe_key is distinct from old.dedupe_key
    or new.created_at is distinct from old.created_at
    or new.email_sent_at is distinct from old.email_sent_at
    or new.deliver_at is distinct from old.deliver_at
  then
    raise exception 'unauthorized_notification_mutation';
  end if;

  return new;
end;
$$;

create or replace function public.notify_user_at(
  recipient uuid,
  business uuid,
  booking uuid,
  kind text,
  title text,
  body text,
  link text,
  dedupe_key text,
  deliver_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (recipient_user_id, business_id, booking_id, kind, title, body, link, dedupe_key, deliver_at)
  values (recipient, business, booking, kind, title, body, link, dedupe_key, deliver_at)
  on conflict on constraint notifications_recipient_dedupe_key_key do nothing;
end;
$$;

revoke all on function public.notify_user_at(uuid, uuid, uuid, text, text, text, text, text, timestamptz) from public;

create or replace function public.upsert_booking_in_app_reminders(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  r record;
  epoch bigint;
  next_keys text[] := '{}';
  link_customer text := '/prenotazioni';
begin
  select id, business_id, customer_user_id, start_at, status
  into b
  from public.bookings
  where id = p_booking_id;

  if b is null then
    return;
  end if;

  if b.status <> 'confirmed' then
    delete from public.notifications
    where booking_id = p_booking_id
      and kind in ('reminder_24h', 'reminder_2h')
      and deliver_at is not null
      and deliver_at > now();
    return;
  end if;

  epoch := extract(epoch from b.start_at)::bigint;

  for r in select * from public.compute_booking_reminder_jobs(p_booking_id)
  loop
    next_keys := array_append(next_keys, (p_booking_id::text || ':' || r.kind || ':' || epoch::text));
    perform public.notify_user_at(
      b.customer_user_id,
      b.business_id,
      b.id,
      r.kind,
      case when r.kind = 'reminder_24h' then 'Promemoria: prenotazione tra 24 ore' else 'Promemoria: prenotazione tra 2 ore' end,
      case when r.kind = 'reminder_24h' then 'Ti ricordiamo la tua prenotazione di domani.' else 'Ti ricordiamo la tua prenotazione a breve.' end,
      link_customer,
      (p_booking_id::text || ':' || r.kind || ':' || epoch::text),
      r.scheduled_at
    );
  end loop;

  delete from public.notifications
  where booking_id = p_booking_id
    and kind in ('reminder_24h', 'reminder_2h')
    and deliver_at is not null
    and deliver_at > now()
    and not (dedupe_key = any(next_keys));
end;
$$;

revoke all on function public.upsert_booking_in_app_reminders(uuid) from public;

create or replace function public.bookings_in_app_reminders_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    perform public.upsert_booking_in_app_reminders(new.id);
    return new;
  end if;

  if (tg_op = 'UPDATE') then
    if new.status is distinct from old.status
      or new.start_at is distinct from old.start_at
      or new.customer_user_id is distinct from old.customer_user_id then
      perform public.upsert_booking_in_app_reminders(new.id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bookings_in_app_reminders_on_change on public.bookings;
create trigger trg_bookings_in_app_reminders_on_change
after insert or update on public.bookings
for each row execute function public.bookings_in_app_reminders_on_change();

