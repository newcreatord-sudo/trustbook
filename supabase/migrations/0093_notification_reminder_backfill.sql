create or replace function public.backfill_booking_reminder_jobs(
  p_horizon_hours int default 48,
  p_limit int default 200
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  hh int;
  lim int;
  processed int := 0;
  r record;
begin
  hh := greatest(1, least(168, coalesce(p_horizon_hours, 48)));
  lim := greatest(1, least(2000, coalesce(p_limit, 200)));

  for r in
    select id
    from public.bookings
    where status = 'confirmed'
      and start_at > now()
      and start_at <= now() + (hh * interval '1 hour')
    order by start_at asc
    limit lim
  loop
    perform public.upsert_booking_reminder_jobs(r.id);
    processed := processed + 1;
  end loop;

  return processed;
end;
$$;

revoke all on function public.backfill_booking_reminder_jobs(int, int) from public;
grant execute on function public.backfill_booking_reminder_jobs(int, int) to service_role;

