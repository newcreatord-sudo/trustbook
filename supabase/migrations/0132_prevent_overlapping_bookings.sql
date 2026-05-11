-- Renumbered from 0030_prevent_overlapping_bookings.sql (duplicate prefix audit).
-- Content unchanged; only file prefix moved to a unique monotonic position.
-- 0030_prevent_overlapping_bookings.sql

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
  no_show_cnt int := 0;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select id, approval_mode, required_reliability_min, is_paused, block_reliability_threshold, auto_block_no_show_count
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

  -- ANTI-OVERLAP CHECK
  if exists (
    select 1 from public.bookings
    where business_id = p_business_id
      and status in ('requested', 'pending_approval', 'pending_deposit', 'confirmed', 'completed', 'no_show', 'late_cancel')
      and start_at < p_end_at
      and end_at > p_start_at
  ) then
    raise exception 'slot_unavailable';
  end if;

  eff := public.effective_reliability_score(uid);
  select coalesce(no_show_count, 0) into no_show_cnt from public.customer_reliability where user_id = uid;

  if eff < public.clamp_int(b.block_reliability_threshold, 0, 100) then
    raise exception 'reliability_too_low';
  end if;

  if no_show_cnt >= greatest(0, coalesce(b.auto_block_no_show_count, 3)) then
    raise exception 'too_many_no_shows';
  end if;

  dep := public.compute_deposit_cents(p_business_id, p_service_id, eff);
  dep_status := case when dep > 0 then 'required' else 'not_required' end;

  requires_approval :=
    b.approval_mode = 'manual'
    or (b.approval_mode = 'risk_based' and eff < public.clamp_int(b.required_reliability_min, 0, 100))
    or no_show_cnt >= 2;

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
    'reasons', reasons,
    'block_reliability_threshold', b.block_reliability_threshold,
    'auto_block_no_show_count', b.auto_block_no_show_count,
    'customer_no_show_count', no_show_cnt
  ));

  return booking_row;
end;
$$;
