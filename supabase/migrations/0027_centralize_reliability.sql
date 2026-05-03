-- 0027_centralize_reliability.sql

-- Drop the old trigger
drop trigger if exists trg_bookings_apply_reliability_on_update on public.bookings;

-- Recreate the function to handle all state changes and deposit changes
create or replace function public.bookings_apply_reliability_on_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  b_cancel_window int;
  is_late boolean;
begin
  -- 1) Completed
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if not exists (
      select 1 from public.reliability_events e
      where e.user_id = new.customer_user_id and e.booking_id = new.id and e.kind = 'completed'
    ) then
      perform public.apply_reliability_delta(new.customer_user_id, new.id, 'completed', 2);
    end if;
  end if;

  -- 2) No-Show
  if new.status = 'no_show' and old.status is distinct from 'no_show' then
    if not exists (
      select 1 from public.reliability_events e
      where e.user_id = new.customer_user_id and e.booking_id = new.id and e.kind = 'no_show'
    ) then
      perform public.apply_reliability_delta(new.customer_user_id, new.id, 'no_show', -20);
    end if;
  end if;

  -- 3) Cancelled by Customer (Late or On-time)
  if new.status = 'cancelled_by_customer' and old.status is distinct from 'cancelled_by_customer' then
    select cancellation_window_min into b_cancel_window
    from public.businesses where id = new.business_id;
    
    is_late := false;
    if new.cancelled_at is not null then
      is_late := (extract(epoch from (new.start_at - new.cancelled_at)) / 60) <= greatest(0, coalesce(b_cancel_window, 0));
    end if;

    if is_late then
      if not exists (
        select 1 from public.reliability_events e
        where e.user_id = new.customer_user_id and e.booking_id = new.id and e.kind = 'late_cancel'
      ) then
        perform public.apply_reliability_delta(new.customer_user_id, new.id, 'late_cancel', -10);
      end if;
    else
      if not exists (
        select 1 from public.reliability_events e
        where e.user_id = new.customer_user_id and e.booking_id = new.id and e.kind = 'on_time_cancel'
      ) then
        perform public.apply_reliability_delta(new.customer_user_id, new.id, 'on_time_cancel', 1);
      end if;
    end if;
  end if;

  -- 4) Deposit Paid
  if new.deposit_status = 'paid' and old.deposit_status is distinct from 'paid' then
    if not exists (
      select 1 from public.reliability_events e
      where e.user_id = new.customer_user_id and e.booking_id = new.id and e.kind = 'deposit_paid'
    ) then
      perform public.apply_reliability_delta(new.customer_user_id, new.id, 'deposit_paid', 1);
    end if;
  end if;

  return new;
end;
$$;

create trigger trg_bookings_apply_reliability_on_update
after update on public.bookings
for each row execute function public.bookings_apply_reliability_on_update();

