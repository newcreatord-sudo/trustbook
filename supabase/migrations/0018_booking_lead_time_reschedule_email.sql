alter table public.businesses
add column if not exists booking_lead_time_min int not null default 0;

alter table public.bookings
add column if not exists proposed_by_role public.user_role;

alter table public.notifications
add column if not exists email_sent_at timestamptz;

create or replace function public.enforce_booking_lead_time()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_min int;
  threshold timestamptz;
begin
  select booking_lead_time_min into lead_min from public.businesses where id = new.business_id;
  lead_min := coalesce(lead_min, 0);

  if lead_min <= 0 then
    return new;
  end if;

  threshold := now() + (lead_min * interval '1 minute');

  if auth.uid() = new.customer_user_id then
    if tg_op = 'INSERT' then
      if new.start_at < threshold then
        raise exception 'booking lead time not satisfied' using errcode = '22023';
      end if;
    elsif tg_op = 'UPDATE' then
      if new.start_at is distinct from old.start_at and new.start_at < threshold then
        raise exception 'booking lead time not satisfied' using errcode = '22023';
      end if;

      if new.proposed_start_at is distinct from old.proposed_start_at and new.proposed_start_at is not null and new.proposed_start_at < threshold then
        raise exception 'booking lead time not satisfied' using errcode = '22023';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_lead_time_trigger on public.bookings;
create trigger bookings_lead_time_trigger
before insert or update on public.bookings
for each row
execute function public.enforce_booking_lead_time();

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

