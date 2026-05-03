-- 0028_notifications_update.sql

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
  end if;

  return new;
end;
$$;
