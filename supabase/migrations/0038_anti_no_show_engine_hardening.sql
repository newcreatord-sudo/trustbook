-- 0038_anti_no_show_engine_hardening.sql
-- Hardening anti-no-show reliability engine:
-- - prevent client-side score manipulation
-- - enforce state/permission guards
-- - make event application idempotent and atomic

drop policy if exists events_insert_authed on public.reliability_events;

drop policy if exists events_select_authed on public.reliability_events;
drop policy if exists events_select_self_or_business_member on public.reliability_events;
create policy events_select_self_or_business_member on public.reliability_events
for select to authenticated
using (
  user_id = auth.uid()
  or (
    booking_id is not null
    and exists (
      select 1
      from public.bookings b
      where b.id = reliability_events.booking_id
        and public.is_business_member(b.business_id)
    )
  )
);

create or replace function public.apply_reliability_delta(p_user_id uuid, p_booking_id uuid, p_kind text, p_delta int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid;
  is_service boolean;
  b public.bookings;
  expected_delta int;
  b_cancel_window int;
  is_late boolean;
  review_rating int;
  inserted_count int := 0;
begin
  if p_user_id is null or p_booking_id is null then
    raise exception 'invalid_input';
  end if;

  caller := auth.uid();
  is_service := auth.role() = 'service_role';

  if not is_service and caller is null then
    raise exception 'not_authenticated';
  end if;

  if p_kind not in ('completed', 'no_show', 'late_cancel', 'on_time_cancel', 'deposit_paid', 'business_review') then
    raise exception 'invalid_kind';
  end if;

  if p_kind <> 'business_review' then
    expected_delta := case p_kind
      when 'completed' then 2
      when 'no_show' then -20
      when 'late_cancel' then -10
      when 'on_time_cancel' then 1
      when 'deposit_paid' then 1
      else null
    end;
    if p_delta is distinct from expected_delta then
      raise exception 'invalid_delta';
    end if;
  else
    -- business review must stay in a bounded window
    if p_delta < -15 or p_delta > 15 then
      raise exception 'invalid_business_review_delta';
    end if;
  end if;

  select *
  into b
  from public.bookings
  where id = p_booking_id
  for update;

  if b is null then
    raise exception 'booking_not_found';
  end if;

  if b.customer_user_id <> p_user_id then
    raise exception 'user_booking_mismatch';
  end if;

  if p_kind = 'completed' and b.status <> 'completed' then
    raise exception 'invalid_booking_state';
  end if;
  if p_kind = 'no_show' and b.status <> 'no_show' then
    raise exception 'invalid_booking_state';
  end if;
  if p_kind in ('late_cancel', 'on_time_cancel') and b.status <> 'cancelled_by_customer' then
    raise exception 'invalid_booking_state';
  end if;
  if p_kind = 'deposit_paid' and b.deposit_status <> 'paid' then
    raise exception 'invalid_booking_state';
  end if;
  if p_kind = 'business_review' and b.status not in ('completed', 'no_show') then
    raise exception 'invalid_booking_state';
  end if;
  if p_kind in ('late_cancel', 'on_time_cancel') and b.cancelled_at is null then
    raise exception 'invalid_booking_state';
  end if;

  if p_kind in ('late_cancel', 'on_time_cancel') then
    select cancellation_window_min
    into b_cancel_window
    from public.businesses
    where id = b.business_id;
    is_late := (extract(epoch from (b.start_at - b.cancelled_at)) / 60) <= greatest(0, coalesce(b_cancel_window, 0));
    if (is_late and p_kind <> 'late_cancel') or ((not is_late) and p_kind <> 'on_time_cancel') then
      raise exception 'invalid_cancel_kind';
    end if;
  end if;

  if not is_service then
    if p_kind = 'business_review' then
      if not public.is_business_member(b.business_id) then
        raise exception 'not_authorized';
      end if;
      if not exists (
        select 1
        from public.reviews r
        where r.booking_id = b.id
          and r.direction = 'business_to_customer'
          and r.author_user_id = caller
      ) then
        raise exception 'business_review_missing';
      end if;
      select r.rating
      into review_rating
      from public.reviews r
      where r.booking_id = b.id
        and r.direction = 'business_to_customer'
        and r.author_user_id = caller
      order by r.created_at desc
      limit 1;
      expected_delta := (greatest(1, least(5, coalesce(review_rating, 3))) - 3) * 5;
      if p_delta is distinct from expected_delta then
        raise exception 'invalid_business_review_delta';
      end if;
    elsif p_kind in ('late_cancel', 'on_time_cancel') then
      if caller <> b.customer_user_id and not public.is_business_member(b.business_id) then
        raise exception 'not_authorized';
      end if;
    else
      if not public.is_business_member(b.business_id) then
        raise exception 'not_authorized';
      end if;
    end if;
  end if;

  with ins as (
    insert into public.reliability_events(user_id, booking_id, kind, delta)
    values (p_user_id, p_booking_id, p_kind, p_delta)
    on conflict (user_id, booking_id, kind) do nothing
    returning 1
  )
  select count(*)::int into inserted_count from ins;

  if inserted_count = 0 then
    -- Event already accounted for: idempotent no-op.
    return;
  end if;

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
