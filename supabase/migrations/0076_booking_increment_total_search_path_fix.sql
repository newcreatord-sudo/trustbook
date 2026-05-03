-- Fix: bookings_increment_total trigger function must be deterministic and safe under SECURITY DEFINER.
-- Adds explicit search_path and schema-qualifies target table reference used in ON CONFLICT update clause.

create or replace function public.bookings_increment_total()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.customer_reliability(user_id, score, total_bookings)
  values (new.customer_user_id, 80, 1)
  on conflict (user_id) do update
  set total_bookings = public.customer_reliability.total_bookings + 1;

  return new;
end;
$$;

revoke all on function public.bookings_increment_total() from public;

