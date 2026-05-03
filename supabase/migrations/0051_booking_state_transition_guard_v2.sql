-- Migration 0051: Update Booking State Transition Guard for new Deposit Policy Engine
-- Allows transitions from requires_deposit and pending_payment_setup

create or replace function public.transition_booking_state(
  p_booking_id uuid,
  p_next_status public.booking_status default null,
  p_next_deposit_status public.deposit_status default null,
  p_require_current_status public.booking_status default null,
  p_touch_confirmed_at boolean default false,
  p_touch_cancelled_at boolean default false
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  v_status public.booking_status;
  v_deposit public.deposit_status;
begin
  select *
  into b
  from public.bookings
  where id = p_booking_id
  for update;

  if b is null then
    raise exception 'booking_not_found';
  end if;

  if p_require_current_status is not null and b.status <> p_require_current_status then
    raise exception 'invalid_transition_state';
  end if;

  if p_next_status is null and p_next_deposit_status is null then
    raise exception 'no_transition_requested';
  end if;

  v_status := coalesce(p_next_status, b.status);
  v_deposit := coalesce(p_next_deposit_status, b.deposit_status);

  -- Restrict critical status transitions.
  if p_next_status is not null and p_next_status <> b.status then
    if b.status in ('completed', 'no_show', 'rejected') then
      raise exception 'invalid_transition_from_terminal_status';
    end if;

    if b.status in ('pending_deposit', 'requires_deposit', 'pending_payment_setup') and p_next_status not in ('confirmed', 'cancelled_by_customer', 'cancelled_by_business') then
      raise exception 'invalid_transition_from_deposit_status';
    end if;

    if b.status = 'confirmed' and p_next_status not in ('cancelled_by_customer', 'cancelled_by_business', 'completed', 'no_show', 'change_proposed') then
      raise exception 'invalid_transition_from_confirmed';
    end if;

    if b.status = 'change_proposed' and p_next_status not in ('confirmed', 'cancelled_by_customer', 'cancelled_by_business') then
      raise exception 'invalid_transition_from_change_proposed';
    end if;
  end if;

  -- Guard deposit transitions.
  if p_next_deposit_status is not null and p_next_deposit_status <> b.deposit_status then
    if p_next_deposit_status = 'paid' and b.deposit_status not in ('required', 'paid') then
      raise exception 'invalid_deposit_transition_to_paid';
    end if;

    if p_next_deposit_status in ('refunded', 'forfeited') and b.deposit_status <> 'paid' then
      raise exception 'invalid_deposit_transition_from_unpaid';
    end if;
  end if;

  -- Confirm after deposit requires paid state.
  if b.status in ('pending_deposit', 'requires_deposit', 'pending_payment_setup') and v_status = 'confirmed' and v_deposit <> 'paid' then
    raise exception 'cannot_confirm_without_paid_deposit';
  end if;

  update public.bookings
  set
    status = v_status,
    deposit_status = v_deposit,
    confirmed_at = case
      when p_touch_confirmed_at then coalesce(confirmed_at, now())
      else confirmed_at
    end,
    cancelled_at = case
      when p_touch_cancelled_at then coalesce(cancelled_at, now())
      else cancelled_at
    end
  where id = p_booking_id
  returning * into b;

  return b;
end;
$$;

revoke all on function public.transition_booking_state(uuid, public.booking_status, public.deposit_status, public.booking_status, boolean, boolean) from public;
grant execute on function public.transition_booking_state(uuid, public.booking_status, public.deposit_status, public.booking_status, boolean, boolean) to authenticated;
