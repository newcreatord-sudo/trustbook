alter table public.user_preferences
  add column if not exists notif_reminders boolean not null default true,
  add column if not exists notif_owner_alerts boolean not null default true,
  add column if not exists channel_push boolean not null default false,
  add column if not exists channel_sms boolean not null default false;

create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid null references public.businesses(id) on delete cascade,
  booking_id uuid null references public.bookings(id) on delete cascade,
  link text null,
  title text not null,
  body text null,
  dedupe_key text not null,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'processing', 'sent', 'cancelled', 'failed')),
  attempt_count int not null default 0,
  last_error text null,
  sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (recipient_user_id, dedupe_key)
);

create index if not exists notification_jobs_due_idx
on public.notification_jobs (status, scheduled_at asc);

alter table public.notification_jobs enable row level security;

create or replace function public.notification_jobs_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_notification_jobs_set_updated_at on public.notification_jobs;
create trigger trg_notification_jobs_set_updated_at
before update on public.notification_jobs
for each row execute function public.notification_jobs_set_updated_at();

revoke all on public.notification_jobs from anon;
revoke all on public.notification_jobs from authenticated;

create or replace function public.compute_booking_reminder_jobs(p_booking_id uuid)
returns table (
  kind text,
  scheduled_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b record;
begin
  select id, business_id, customer_user_id, start_at, end_at, status
  into b
  from public.bookings
  where id = p_booking_id;

  if b is null then
    return;
  end if;

  if b.status <> 'confirmed' then
    return;
  end if;

  if b.start_at is null then
    return;
  end if;

  if (b.start_at - interval '24 hours') > now() then
    kind := 'reminder_24h';
    scheduled_at := (b.start_at - interval '24 hours');
    return next;
  end if;

  if (b.start_at - interval '2 hours') > now() then
    kind := 'reminder_2h';
    scheduled_at := (b.start_at - interval '2 hours');
    return next;
  end if;

  return;
end;
$$;

revoke all on function public.compute_booking_reminder_jobs(uuid) from public;

create or replace function public.upsert_booking_reminder_jobs(p_booking_id uuid)
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
    update public.notification_jobs
    set status = 'cancelled'
    where booking_id = p_booking_id
      and status in ('scheduled', 'processing')
      and kind in ('reminder_24h', 'reminder_2h');
    return;
  end if;

  epoch := extract(epoch from b.start_at)::bigint;

  for r in select * from public.compute_booking_reminder_jobs(p_booking_id)
  loop
    next_keys := array_append(next_keys, (p_booking_id::text || ':' || r.kind || ':' || epoch::text));

    insert into public.notification_jobs (
      kind,
      recipient_user_id,
      business_id,
      booking_id,
      link,
      title,
      body,
      dedupe_key,
      scheduled_at
    )
    values (
      r.kind,
      b.customer_user_id,
      b.business_id,
      b.id,
      link_customer,
      case when r.kind = 'reminder_24h' then 'Promemoria: prenotazione tra 24 ore' else 'Promemoria: prenotazione tra 2 ore' end,
      case when r.kind = 'reminder_24h' then 'Ti ricordiamo la tua prenotazione di domani.' else 'Ti ricordiamo la tua prenotazione a breve.' end,
      (p_booking_id::text || ':' || r.kind || ':' || epoch::text),
      r.scheduled_at
    )
    on conflict (recipient_user_id, dedupe_key) do update set
      scheduled_at = excluded.scheduled_at,
      status = case when public.notification_jobs.status = 'scheduled' then 'scheduled' else public.notification_jobs.status end,
      title = excluded.title,
      body = excluded.body,
      link = excluded.link;
  end loop;

  update public.notification_jobs
  set status = 'cancelled'
  where booking_id = p_booking_id
    and kind in ('reminder_24h', 'reminder_2h')
    and status = 'scheduled'
    and not (dedupe_key = any(next_keys));
end;
$$;

revoke all on function public.upsert_booking_reminder_jobs(uuid) from public;

create or replace function public.bookings_reminders_on_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    perform public.upsert_booking_reminder_jobs(new.id);
    return new;
  end if;

  if (tg_op = 'UPDATE') then
    if new.status is distinct from old.status
      or new.start_at is distinct from old.start_at
      or new.customer_user_id is distinct from old.customer_user_id then
      perform public.upsert_booking_reminder_jobs(new.id);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bookings_reminders_on_change on public.bookings;
create trigger trg_bookings_reminders_on_change
after insert or update on public.bookings
for each row execute function public.bookings_reminders_on_change();

create or replace function public.run_due_notification_jobs(
  p_limit int default 50,
  p_now timestamptz default now()
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  lim int;
  j record;
  processed int := 0;
begin
  lim := greatest(1, least(200, coalesce(p_limit, 50)));

  for j in
    select *
    from public.notification_jobs
    where status = 'scheduled'
      and scheduled_at <= coalesce(p_now, now())
    order by scheduled_at asc
    limit lim
    for update skip locked
  loop
    begin
      update public.notification_jobs
      set status = 'processing', attempt_count = attempt_count + 1
      where id = j.id;

      perform public.notify_user(
        j.recipient_user_id,
        j.business_id,
        j.booking_id,
        j.kind,
        j.title,
        j.body,
        j.link,
        j.dedupe_key
      );

      update public.notification_jobs
      set status = 'sent', sent_at = now(), last_error = null
      where id = j.id;

      processed := processed + 1;
    exception when others then
      update public.notification_jobs
      set status = 'failed', last_error = sqlerrm
      where id = j.id;
    end;
  end loop;

  return processed;
end;
$$;

revoke all on function public.run_due_notification_jobs(int, timestamptz) from public;
grant execute on function public.run_due_notification_jobs(int, timestamptz) to service_role;

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
  role_label text;
  staff_user uuid;
  risk text;
  epoch bigint;
begin
  select name into bname from public.businesses where id = new.business_id;
  link_business := '/dashboard-attivita';
  link_customer := '/prenotazioni';
  role_label := case when new.proposed_by_role is null then 'unknown' else new.proposed_by_role::text end;

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

    select risk_level into risk
    from public.customer_reliability
    where user_id = new.customer_user_id;

    if risk in ('yellow', 'red') then
      perform public.notify_business_members(
        new.business_id,
        new.id,
        'owner_risky_customer_warning',
        'Cliente a rischio no-show',
        'Affidabilità cliente: ' || risk || '. Consigliato chiedere conferma o caparra.',
        link_business,
        new.id::text || ':owner_risky_customer_warning:' || risk
      );
    end if;

    return new;
  end if;

  if (tg_op = 'UPDATE') then
    if (old.status is distinct from new.status) then
      if (new.status = 'pending_approval') then
        perform public.notify_user(new.customer_user_id, new.business_id, new.id, 'booking_pending_approval', 'In attesa di approvazione', 'La tua prenotazione è in attesa di approvazione.', link_customer, new.id::text || ':booking_pending_approval');
      elsif (new.status = 'confirmed') then
        perform public.notify_user(new.customer_user_id, new.business_id, new.id, 'booking_confirmed', 'Prenotazione confermata', 'La tua prenotazione è confermata.', link_customer, new.id::text || ':booking_confirmed');
      elsif (new.status = 'rejected') then
        perform public.notify_user(new.customer_user_id, new.business_id, new.id, 'booking_rejected', 'Prenotazione rifiutata', coalesce(new.rejection_reason, 'La prenotazione è stata rifiutata.'), link_customer, new.id::text || ':booking_rejected');
      elsif (new.status = 'pending_deposit') then
        perform public.notify_user(new.customer_user_id, new.business_id, new.id, 'deposit_required', 'Caparra richiesta', 'Per confermare la prenotazione è richiesta una caparra.', link_customer, new.id::text || ':deposit_required');
      elsif (new.status = 'change_proposed') then
        if (new.proposed_by_role = 'cliente') then
          perform public.notify_business_members(
            new.business_id,
            new.id,
            'time_change_request',
            'Richiesta modifica orario',
            'Il cliente ha richiesto un nuovo orario.',
            link_business,
            new.id::text || ':time_change_request:' || role_label
          );
        else
          perform public.notify_user(new.customer_user_id, new.business_id, new.id, 'time_change', 'Proposta nuovo orario', 'L’attività ha proposto un nuovo orario.', link_customer, new.id::text || ':time_change:' || role_label);
        end if;
      elsif (new.status = 'cancelled_by_business') then
        perform public.notify_user(new.customer_user_id, new.business_id, new.id, 'cancelled', 'Prenotazione annullata', 'L’attività ha annullato la prenotazione.', link_customer, new.id::text || ':cancelled_by_business');
      elsif (new.status = 'cancelled_by_customer') then
        perform public.notify_business_members(
          new.business_id,
          new.id,
          'cancelled',
          'Prenotazione annullata',
          'Il cliente ha annullato la prenotazione.',
          link_business,
          new.id::text || ':cancelled_by_customer'
        );
      elsif (new.status = 'no_show') then
        perform public.notify_user(new.customer_user_id, new.business_id, new.id, 'no_show', 'Mancata presenza', 'È stato segnalato un No-Show per la tua prenotazione.', link_customer, new.id::text || ':no_show');
      elsif (new.status = 'completed') then
        perform public.notify_user(new.customer_user_id, new.business_id, new.id, 'completed', 'Prenotazione completata', 'La tua prenotazione è stata completata.', link_customer, new.id::text || ':completed');
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

    if (new.start_at is distinct from old.start_at) then
      epoch := extract(epoch from new.start_at)::bigint;
      perform public.notify_user(
        new.customer_user_id,
        new.business_id,
        new.id,
        'booking_rescheduled',
        'Prenotazione riprogrammata',
        'Il giorno/orario della prenotazione è stato aggiornato.',
        link_customer,
        new.id::text || ':booking_rescheduled:' || epoch::text
      );

      perform public.notify_business_members(
        new.business_id,
        new.id,
        'booking_rescheduled',
        'Prenotazione riprogrammata',
        'Il giorno/orario della prenotazione è stato aggiornato.',
        link_business,
        new.id::text || ':booking_rescheduled:' || epoch::text
      );
    end if;

    if (old.staff_id is distinct from new.staff_id) and new.staff_id is not null then
      select user_id into staff_user
      from public.team_members
      where id = new.staff_id;

      if staff_user is not null then
        perform public.notify_user(
          staff_user,
          new.business_id,
          new.id,
          'staff_assigned',
          'Nuova assegnazione',
          'Ti è stata assegnata una prenotazione.',
          link_business,
          new.id::text || ':staff_assigned:' || new.staff_id::text
        );
      end if;
    end if;
  end if;

  return new;
end;
$$;
