create table if not exists public.business_customer_blocks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (business_id, customer_user_id)
);

create index if not exists idx_business_customer_blocks_business on public.business_customer_blocks (business_id);

alter table public.business_customer_blocks enable row level security;

drop policy if exists business_customer_blocks_select on public.business_customer_blocks;
create policy business_customer_blocks_select on public.business_customer_blocks
for select to authenticated
using (public.is_business_member(business_id));

drop policy if exists business_customer_blocks_write_owner on public.business_customer_blocks;
create policy business_customer_blocks_write_owner on public.business_customer_blocks
for all to authenticated
using (public.is_business_owner(business_id))
with check (public.is_business_owner(business_id));

revoke all on public.business_customer_blocks from anon;
grant all privileges on public.business_customer_blocks to authenticated;

create unique index if not exists reliability_events_unique_booking_kind
on public.reliability_events (user_id, booking_id, kind)
where booking_id is not null;

create or replace function public.effective_reliability_score(p_user_id uuid)
returns int
language sql
stable
as $$
  with r as (
    select score, stars, no_show_count, late_cancel_count
    from public.customer_reliability
    where user_id = p_user_id
  )
  select public.clamp_int(
    coalesce((select score from r), 80)
    + (
      case
        when coalesce((select stars from r), 0) >= 5 then 10
        when coalesce((select stars from r), 0) >= 2 then 6
        when coalesce((select stars from r), 0) >= 1 then 3
        else 0
      end
    )
    - (
      least(25, coalesce((select no_show_count from r), 0) * 12)
      + least(12, coalesce((select late_cancel_count from r), 0) * 4)
    )
  , 0, 100);
$$;

create or replace function public.compute_deposit_cents(
  p_business_id uuid,
  p_service_id uuid,
  p_customer_effective_score int
)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b record;
  s record;
  amount int := 0;
  threshold int;
begin
  select
    deposit_enabled,
    deposit_rule,
    deposit_risky_threshold,
    deposit_fixed_cents,
    deposit_percent,
    deposit_min_cents,
    deposit_max_cents
  into b
  from public.businesses
  where id = p_business_id;

  if b is null then
    raise exception 'business_not_found';
  end if;

  if not b.deposit_enabled then
    return 0;
  end if;

  if b.deposit_rule = 'off' then
    return 0;
  end if;

  if b.deposit_rule = 'risky_only' then
    threshold := public.clamp_int(coalesce(b.deposit_risky_threshold, 60), 0, 100);
    if p_customer_effective_score >= threshold then
      return 0;
    end if;
  end if;

  select price_cents into s
  from public.services
  where id = p_service_id and business_id = p_business_id;
  if s is null then
    raise exception 'service_not_found';
  end if;

  if b.deposit_fixed_cents is not null then
    amount := greatest(0, b.deposit_fixed_cents);
  elsif b.deposit_percent is not null and s.price_cents is not null then
    amount := round((s.price_cents * b.deposit_percent)::numeric / 100)::int;
  end if;

  if b.deposit_min_cents is not null then
    amount := greatest(amount, b.deposit_min_cents);
  end if;
  if b.deposit_max_cents is not null then
    amount := least(amount, b.deposit_max_cents);
  end if;

  return greatest(0, amount);
end;
$$;

create or replace function public.create_booking_v2(
  p_business_id uuid,
  p_service_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  b record;
  eff int;
  dep int;
  dep_status deposit_status;
  requires_approval boolean;
  next_status booking_status;
  booking_row public.bookings;
  reasons text[] := array[]::text[];
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select id, approval_mode, required_reliability_min, is_paused
  into b
  from public.businesses
  where id = p_business_id;
  if b is null then
    raise exception 'business_not_found';
  end if;
  if coalesce(b.is_paused, false) then
    raise exception 'business_paused';
  end if;

  if exists (
    select 1 from public.business_customer_blocks blk
    where blk.business_id = p_business_id and blk.customer_user_id = uid
  ) then
    raise exception 'blocked_by_business';
  end if;

  eff := public.effective_reliability_score(uid);
  if eff < 15 then
    raise exception 'reliability_too_low';
  end if;

  dep := public.compute_deposit_cents(p_business_id, p_service_id, eff);
  dep_status := case when dep > 0 then 'required' else 'not_required' end;

  requires_approval :=
    b.approval_mode = 'manual'
    or (b.approval_mode = 'risk_based' and eff < public.clamp_int(b.required_reliability_min, 0, 100))
    or (select coalesce(no_show_count, 0) from public.customer_reliability where user_id = uid) >= 2;

  if requires_approval then
    next_status := 'pending_approval';
    reasons := reasons || array['requires_approval'];
  elsif dep > 0 then
    next_status := 'pending_deposit';
    reasons := reasons || array['requires_deposit'];
  else
    next_status := 'confirmed';
  end if;

  insert into public.bookings (
    customer_user_id,
    business_id,
    service_id,
    start_at,
    end_at,
    status,
    deposit_status,
    deposit_amount_cents,
    confirmed_at
  ) values (
    uid,
    p_business_id,
    p_service_id,
    p_start_at,
    p_end_at,
    next_status,
    dep_status,
    dep,
    case when next_status = 'confirmed' then now() else null end
  )
  returning * into booking_row;

  perform public.insert_booking_event(booking_row.id, 'risk_policy_applied', 'all', uid, jsonb_build_object(
    'effective_score', eff,
    'required_reliability_min', b.required_reliability_min,
    'approval_mode', b.approval_mode,
    'deposit_cents', dep,
    'status', next_status,
    'reasons', reasons
  ));

  return booking_row;
end;
$$;

revoke all on function public.create_booking_v2(uuid, uuid, timestamptz, timestamptz) from public;
grant execute on function public.create_booking_v2(uuid, uuid, timestamptz, timestamptz) to authenticated;

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
  if new.status is distinct from old.status then
    if new.status = 'completed' then
      if not exists (
        select 1 from public.reliability_events e
        where e.user_id = new.customer_user_id and e.booking_id = new.id and e.kind = 'completed'
      ) then
        perform public.apply_reliability_delta(new.customer_user_id, new.id, 'completed', 2);
      end if;
    elsif new.status = 'no_show' then
      if not exists (
        select 1 from public.reliability_events e
        where e.user_id = new.customer_user_id and e.booking_id = new.id and e.kind = 'no_show'
      ) then
        perform public.apply_reliability_delta(new.customer_user_id, new.id, 'no_show', -12);
      end if;
    elsif new.status = 'cancelled' then
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
          perform public.apply_reliability_delta(new.customer_user_id, new.id, 'late_cancel', -4);
        end if;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bookings_apply_reliability_on_update on public.bookings;
create trigger trg_bookings_apply_reliability_on_update
after update on public.bookings
for each row execute function public.bookings_apply_reliability_on_update();

