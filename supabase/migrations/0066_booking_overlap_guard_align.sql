-- Allinea il guard overlap alle stesse prenotazioni “occupanti” usate da create_booking_v3 / internal_validate_booking_slot_interval.
-- Prima: stati come requires_deposit / pending_payment_setup non attivavano il controllo sulla NUOVA riga → rischio sovrapposizione.

create or replace function public.ensure_booking_no_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conflict_id uuid;
  occupying_statuses booking_status[];
begin
  occupying_statuses := ARRAY[
    'requested',
    'pending_approval',
    'pending_deposit',
    'requires_deposit',
    'pending_payment_setup',
    'confirmed',
    'change_proposed',
    'completed',
    'no_show',
    'late_cancel'
  ]::booking_status[];

  if new.status is null or not (new.status = any (occupying_statuses)) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.business_id::text, 0));

  select b.id
  into conflict_id
  from public.bookings b
  where b.business_id = new.business_id
    and b.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and b.status = any (occupying_statuses)
    and tstzrange(b.start_at, b.end_at, '[)') && tstzrange(new.start_at, new.end_at, '[)')
  limit 1;

  if conflict_id is not null then
    raise exception 'booking_time_conflict'
      using errcode = '23514',
            detail = format('booking_id=%s', conflict_id),
            hint = 'Select a different time slot.';
  end if;

  return new;
end;
$$;
