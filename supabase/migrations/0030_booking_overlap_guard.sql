-- 0030_booking_overlap_guard.sql
-- Prevent concurrent overlapping bookings on the same business.

create or replace function public.ensure_booking_no_overlap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conflict_id uuid;
begin
  -- Only statuses that occupy an actual slot must be conflict-free.
  if new.status not in ('requested', 'pending_approval', 'pending_deposit', 'confirmed', 'change_proposed') then
    return new;
  end if;

  -- Serialize booking writes per business inside the current transaction.
  perform pg_advisory_xact_lock(hashtextextended(new.business_id::text, 0));

  select b.id
  into conflict_id
  from public.bookings b
  where b.business_id = new.business_id
    and b.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
    and b.status in ('requested', 'pending_approval', 'pending_deposit', 'confirmed', 'change_proposed')
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

drop trigger if exists bookings_no_overlap_guard on public.bookings;
create trigger bookings_no_overlap_guard
before insert or update of business_id, start_at, end_at, status
on public.bookings
for each row
execute function public.ensure_booking_no_overlap();
