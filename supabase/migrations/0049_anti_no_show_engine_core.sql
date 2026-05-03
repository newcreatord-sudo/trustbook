-- 0049_anti_no_show_engine_core.sql
-- Hardening and expanding the anti-no-show engine

alter table public.customer_reliability
  add column if not exists total_bookings int not null default 0,
  add column if not exists normal_cancel_count int not null default 0,
  add column if not exists rejected_requests_count int not null default 0,
  add column if not exists lost_deposits_count int not null default 0,
  add column if not exists refunded_deposits_count int not null default 0,
  add column if not exists average_arrival_reliability int not null default 100,
  add column if not exists last_no_show_at timestamptz,
  add column if not exists last_late_cancel_at timestamptz,
  add column if not exists risk_level text not null default 'green';

create or replace function public.calculate_risk_level(score int) returns text
language sql immutable as $$
  select case
    when score >= 80 then 'green'
    when score >= 50 then 'yellow'
    else 'red'
  end;
$$;

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
  next_score int;
begin
  if p_user_id is null or p_booking_id is null then
    raise exception 'invalid_input';
  end if;

  caller := auth.uid();
  is_service := auth.role() = 'service_role';

  if not is_service and caller is null then
    raise exception 'not_authenticated';
  end if;

  if p_kind not in ('completed', 'no_show', 'late_cancel', 'on_time_cancel', 'deposit_paid', 'business_review', 'rejected', 'deposit_lost', 'deposit_refunded') then
    raise exception 'invalid_kind';
  end if;

  if p_kind <> 'business_review' then
    expected_delta := case p_kind
      when 'completed' then 2
      when 'no_show' then -20
      when 'late_cancel' then -10
      when 'on_time_cancel' then 1
      when 'deposit_paid' then 1
      when 'rejected' then 0
      when 'deposit_lost' then 0
      when 'deposit_refunded' then 0
      else null
    end;
    if p_delta is distinct from expected_delta then
      raise exception 'invalid_delta';
    end if;
  else
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

  with ins as (
    insert into public.reliability_events(user_id, booking_id, kind, delta)
    values (p_user_id, p_booking_id, p_kind, p_delta)
    on conflict (user_id, booking_id, kind) do nothing
    returning 1
  )
  select count(*)::int into inserted_count from ins;

  if inserted_count = 0 then
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
    normal_cancel_count = normal_cancel_count + case when p_kind = 'on_time_cancel' then 1 else 0 end,
    rejected_requests_count = rejected_requests_count + case when p_kind = 'rejected' then 1 else 0 end,
    lost_deposits_count = lost_deposits_count + case when p_kind = 'deposit_lost' then 1 else 0 end,
    refunded_deposits_count = refunded_deposits_count + case when p_kind = 'deposit_refunded' then 1 else 0 end,
    last_no_show_at = case when p_kind = 'no_show' then now() else last_no_show_at end,
    last_late_cancel_at = case when p_kind = 'late_cancel' then now() else last_late_cancel_at end,
    score = public.clamp_int(score + p_delta, 0, 100),
    updated_at = now()
  where user_id = p_user_id
  returning score into next_score;

  update public.customer_reliability
  set risk_level = public.calculate_risk_level(next_score)
  where user_id = p_user_id;

  if next_score >= 100 then
    update public.customer_reliability
    set stars = stars + 1, score = 80, updated_at = now(), risk_level = 'green'
    where user_id = p_user_id;
  end if;
end;
$$;

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
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if not exists (
      select 1 from public.reliability_events e
      where e.user_id = new.customer_user_id and e.booking_id = new.id and e.kind = 'completed'
    ) then
      perform public.apply_reliability_delta(new.customer_user_id, new.id, 'completed', 2);
    end if;
  end if;

  if new.status = 'no_show' and old.status is distinct from 'no_show' then
    if not exists (
      select 1 from public.reliability_events e
      where e.user_id = new.customer_user_id and e.booking_id = new.id and e.kind = 'no_show'
    ) then
      perform public.apply_reliability_delta(new.customer_user_id, new.id, 'no_show', -20);
    end if;
  end if;

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

  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    if not exists (
      select 1 from public.reliability_events e
      where e.user_id = new.customer_user_id and e.booking_id = new.id and e.kind = 'rejected'
    ) then
      perform public.apply_reliability_delta(new.customer_user_id, new.id, 'rejected', 0);
    end if;
  end if;

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

create or replace function public.bookings_increment_total()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.customer_reliability(user_id, score, total_bookings)
  values (new.customer_user_id, 80, 1)
  on conflict (user_id) do update
  set total_bookings = customer_reliability.total_bookings + 1;
  return new;
end;
$$;

drop trigger if exists trg_bookings_increment_total on public.bookings;
create trigger trg_bookings_increment_total
after insert on public.bookings
for each row execute function public.bookings_increment_total();
