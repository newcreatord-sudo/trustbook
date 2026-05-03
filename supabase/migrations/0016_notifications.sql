create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid references public.businesses(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text,
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists notifications_dedupe on public.notifications (recipient_user_id, dedupe_key);
create index if not exists notifications_recipient_created on public.notifications (recipient_user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select to authenticated
using (recipient_user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
for update to authenticated
using (recipient_user_id = auth.uid())
with check (recipient_user_id = auth.uid());

drop policy if exists notifications_insert_none on public.notifications;
create policy notifications_insert_none on public.notifications
for insert to authenticated
with check (false);

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
begin
  insert into public.notifications (recipient_user_id, business_id, booking_id, kind, title, body, link, dedupe_key)
  values (recipient, business, booking, kind, title, body, link, dedupe_key)
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
declare
  owner_id uuid;
begin
  select owner_user_id into owner_id from public.businesses where id = business;
  if owner_id is not null then
    perform public.notify_user(owner_id, business, booking, kind, title, body, link, dedupe_key);
  end if;

  insert into public.notifications (recipient_user_id, business_id, booking_id, kind, title, body, link, dedupe_key)
  select tm.user_id, business, booking, kind, title, body, link, dedupe_key
  from public.team_members tm
  where tm.business_id = business
  on conflict (recipient_user_id, dedupe_key) do nothing;
end;
$$;

create or replace function public.handle_booking_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  bname text;
  link_business text;
  link_customer text;
begin
  select name into bname from public.businesses where id = new.business_id;
  link_business := '/dashboard-attivita';
  link_customer := '/prenotazioni';

  if (tg_op = 'INSERT') then
    perform public.notify_business_members(
      new.business_id,
      new.id,
      'booking_requested',
      'Nuova prenotazione',
      coalesce(bname, 'Attività') || ': nuova richiesta ricevuta.',
      link_business,
      new.id::text || ':booking_requested'
    );

    perform public.notify_user(
      new.customer_user_id,
      new.business_id,
      new.id,
      'booking_sent',
      'Richiesta inviata',
      'La tua richiesta è stata inviata. Ti aggiorniamo appena viene confermata.',
      link_customer,
      new.id::text || ':booking_sent'
    );
    return new;
  end if;

  if (tg_op = 'UPDATE') then
    if (old.status is distinct from new.status) then
      if (new.status = 'confirmed') then
        perform public.notify_user(new.customer_user_id, new.business_id, new.id, 'booking_confirmed', 'Prenotazione confermata', 'La tua prenotazione è confermata.', link_customer, new.id::text || ':booking_confirmed');
      elsif (new.status = 'rejected') then
        perform public.notify_user(new.customer_user_id, new.business_id, new.id, 'booking_rejected', 'Prenotazione rifiutata', coalesce(new.rejection_reason, 'La prenotazione è stata rifiutata.'), link_customer, new.id::text || ':booking_rejected');
      elsif (new.status = 'pending_deposit') then
        perform public.notify_user(new.customer_user_id, new.business_id, new.id, 'deposit_required', 'Caparra richiesta', 'Per confermare la prenotazione è richiesta una caparra.', link_customer, new.id::text || ':deposit_required');
      elsif (new.status = 'change_proposed') then
        perform public.notify_user(new.customer_user_id, new.business_id, new.id, 'time_change', 'Proposta nuovo orario', 'L’attività ha proposto un nuovo orario.', link_customer, new.id::text || ':time_change');
      elsif (new.status = 'cancelled_by_business') then
        perform public.notify_user(new.customer_user_id, new.business_id, new.id, 'cancelled', 'Prenotazione annullata', 'L’attività ha annullato la prenotazione.', link_customer, new.id::text || ':cancelled_by_business');
      end if;
    end if;

    if (old.deposit_status is distinct from new.deposit_status) then
      if (new.deposit_status = 'paid') then
        perform public.notify_business_members(
          new.business_id,
          new.id,
          'deposit_paid',
          'Caparra pagata',
          'La caparra è stata pagata. La prenotazione può essere confermata.',
          link_business,
          new.id::text || ':deposit_paid'
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists booking_notifications_trigger on public.bookings;
create trigger booking_notifications_trigger
after insert or update on public.bookings
for each row
execute function public.handle_booking_notifications();

grant select, update on public.notifications to authenticated;

