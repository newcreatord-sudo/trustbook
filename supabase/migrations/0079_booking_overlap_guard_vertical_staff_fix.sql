create or replace function public.ensure_booking_no_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conflict_id uuid;
  occupying_statuses booking_status[];
  eco_vertical text;
  eco_resource_enabled boolean;
begin
  occupying_statuses := array[
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

  select coalesce(e.booking_vertical, 'service'), coalesce(e.resource_management_enabled, false)
  into eco_vertical, eco_resource_enabled
  from public.business_booking_ecosystem e
  where e.business_id = new.business_id;

  if eco_resource_enabled = true and eco_vertical in ('hospitality_table', 'seat_assignment') then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.business_id::text || ':' || coalesce(new.staff_id::text, '*'), 0)
  );

  select b.id
  into conflict_id
  from public.bookings b
  where b.business_id = new.business_id
    and b.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and b.status = any (occupying_statuses)
    and (new.staff_id is null or b.staff_id = new.staff_id)
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
