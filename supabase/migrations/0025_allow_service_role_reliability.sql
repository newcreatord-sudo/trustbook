drop function if exists public.apply_reliability_delta(uuid, uuid, text, int);

create or replace function public.apply_reliability_delta(p_user_id uuid, p_booking_id uuid, p_kind text, p_delta int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bid uuid;
  caller uuid;
  is_service boolean;
begin
  caller := auth.uid();
  is_service := auth.role() = 'service_role';

  if not is_service and caller is null then
    raise exception 'not_authenticated';
  end if;

  if not is_service and caller != p_user_id then
    select business_id into bid from public.bookings where id = p_booking_id;
    if bid is null or not public.is_business_member(bid) then
      raise exception 'not_authorized';
    end if;
  end if;

  insert into public.reliability_events(user_id, booking_id, kind, delta)
  values (p_user_id, p_booking_id, p_kind, p_delta);

  insert into public.customer_reliability(user_id, score)
  values (p_user_id, 80)
  on conflict (user_id) do nothing;

  update public.customer_reliability
  set
    completed_count = completed_count + case when p_kind = 'completed' then 1 else 0 end,
    late_cancel_count = late_cancel_count + case when p_kind = 'late_cancel' then 1 else 0 end,
    no_show_count = no_show_count + case when p_kind = 'no_show' then 1 else 0 end,
    score = public.clamp_int(score + p_delta, 0, 100),
    updated_at = now()
  where user_id = p_user_id;

  if (select score from public.customer_reliability where user_id = p_user_id) >= 100 then
    update public.customer_reliability
    set stars = stars + 1, score = 80, updated_at = now()
    where user_id = p_user_id;
  end if;
end;
$$;
