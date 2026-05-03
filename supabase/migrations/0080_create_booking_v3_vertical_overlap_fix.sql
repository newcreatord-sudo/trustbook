create or replace function public.create_booking_v3(
  p_business_id uuid,
  p_service_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_staff_id uuid default null
)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  b record;
  svc record;
  eff int;
  dep int;
  man_app boolean;
  dep_status deposit_status;
  requires_approval boolean;
  next_status booking_status;
  booking_row public.bookings;
  reasons text[] := array[]::text[];
  no_show_cnt int := 0;
  req_duration_min int := 0;
  local_start timestamp;
  local_end timestamp;
  local_weekday int;
  actual_start_at timestamptz;
  actual_end_at timestamptz;
  is_overbooked boolean := false;
  vip_no_deposit boolean := false;
  eco_vertical text := 'service';
  eco_resource_enabled boolean := false;
  skip_time_overlap boolean := false;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    raise exception 'invalid_booking_interval';
  end if;

  select
    id,
    approval_mode,
    required_reliability_min,
    is_paused,
    block_reliability_threshold,
    auto_block_no_show_count,
    booking_lead_time_min,
    timezone,
    allow_overbooking
  into b
  from public.businesses
  where id = p_business_id;

  if b is null then
    raise exception 'business_not_found';
  end if;
  if coalesce(b.is_paused, false) then
    raise exception 'business_paused';
  end if;

  select coalesce(e.booking_vertical, 'service'), coalesce(e.resource_management_enabled, false)
  into eco_vertical, eco_resource_enabled
  from public.business_booking_ecosystem e
  where e.business_id = p_business_id;

  skip_time_overlap := eco_resource_enabled = true and eco_vertical in ('hospitality_table', 'seat_assignment');

  req_duration_min := floor(extract(epoch from (p_end_at - p_start_at)) / 60);
  if req_duration_min <= 0 then
    raise exception 'invalid_duration';
  end if;

  select id, duration_min, is_active, buffer_before_min, buffer_after_min
  into svc
  from public.services
  where id = p_service_id
    and business_id = p_business_id;

  if svc is null then
    raise exception 'service_not_found';
  end if;
  if coalesce(svc.is_active, false) is not true then
    raise exception 'service_inactive';
  end if;
  if coalesce(svc.duration_min, 0) <= 0 or req_duration_min <> svc.duration_min then
    raise exception 'invalid_duration';
  end if;

  if p_start_at < now() + make_interval(mins => greatest(0, coalesce(b.booking_lead_time_min, 0))) then
    raise exception 'lead_time_not_respected';
  end if;

  local_start := p_start_at at time zone b.timezone;
  local_end := p_end_at at time zone b.timezone;
  local_weekday := extract(dow from local_start);

  if local_end::date <> local_start::date then
    raise exception 'outside_opening_hours';
  end if;

  if not exists (
    select 1
    from public.business_opening_windows w
    where w.business_id = p_business_id
      and w.weekday = local_weekday
      and w.start_time <= local_start::time
      and w.end_time >= local_end::time
  ) then
    raise exception 'outside_opening_hours';
  end if;

  if exists (
    select 1
    from public.business_closures c
    where c.business_id = p_business_id
      and c.start_at < p_end_at
      and c.end_at > p_start_at
  ) then
    raise exception 'business_closed';
  end if;

  if p_staff_id is not null then
    if not exists (
      select 1 from public.team_members
      where id = p_staff_id and business_id = p_business_id and is_bookable = true
    ) then
      raise exception 'staff_unavailable';
    end if;

    if exists (
      select 1 from public.staff_closures c
      where c.staff_id = p_staff_id
        and c.start_at < p_end_at
        and c.end_at > p_start_at
    ) then
      raise exception 'staff_unavailable';
    end if;
  end if;

  if exists (
    select 1 from public.business_customer_blocks blk
    where blk.business_id = p_business_id and blk.customer_user_id = uid
  ) then
    raise exception 'blocked_by_business';
  end if;

  actual_start_at := p_start_at - make_interval(mins => coalesce(svc.buffer_before_min, 0));
  actual_end_at := p_end_at + make_interval(mins => coalesce(svc.buffer_after_min, 0));

  if not skip_time_overlap then
    if exists (
      select 1 from public.bookings
      where business_id = p_business_id
        and status in ('requested', 'pending_approval', 'pending_deposit', 'requires_deposit', 'pending_payment_setup', 'confirmed', 'change_proposed', 'completed', 'no_show', 'late_cancel')
        and (p_staff_id is null or staff_id = p_staff_id)
        and start_at < actual_end_at
        and end_at > actual_start_at
    ) then
      if not coalesce(b.allow_overbooking, false) then
        raise exception 'slot_unavailable';
      else
        is_overbooked := true;
      end if;
    end if;
  end if;

  if exists (
    select 1 from public.blocked_slots
    where business_id = p_business_id
      and (staff_id is null or staff_id = p_staff_id)
      and start_at < actual_end_at
      and end_at > actual_start_at
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

  select deposit_amount_cents, requires_manual_approval into dep, man_app
  from public.compute_deposit_cents_v2(p_business_id, p_service_id, eff);

  vip_no_deposit := public.customer_subscription_no_deposit_bypass(uid);
  if vip_no_deposit then
    dep := 0;
  end if;

  dep_status := case when dep > 0 then 'required' else 'not_required' end;

  requires_approval :=
    b.approval_mode = 'manual'
    or (b.approval_mode = 'risk_based' and eff < public.clamp_int(b.required_reliability_min, 0, 100))
    or no_show_cnt >= 2
    or man_app;

  if requires_approval then
    next_status := 'pending_approval';
    reasons := reasons || array['requires_approval'];
  elsif dep > 0 then
    next_status := 'requires_deposit';
    reasons := reasons || array['requires_deposit'];
  else
    next_status := 'confirmed';
  end if;

  insert into public.bookings (
    customer_user_id,
    business_id,
    service_id,
    staff_id,
    start_at,
    end_at,
    status,
    deposit_status,
    deposit_amount_cents,
    confirmed_at,
    overbooked
  ) values (
    uid,
    p_business_id,
    p_service_id,
    p_staff_id,
    p_start_at,
    p_end_at,
    next_status,
    dep_status,
    dep,
    case when next_status = 'confirmed' then now() else null end,
    is_overbooked
  )
  returning * into booking_row;

  perform public.insert_booking_event(booking_row.id, 'risk_policy_applied', 'all', uid, jsonb_build_object(
    'effective_score', eff,
    'required_reliability_min', b.required_reliability_min,
    'approval_mode', b.approval_mode,
    'deposit_cents', dep,
    'customer_vip_no_deposit', vip_no_deposit,
    'status', next_status,
    'reasons', reasons,
    'block_reliability_threshold', b.block_reliability_threshold,
    'auto_block_no_show_count', b.auto_block_no_show_count,
    'customer_no_show_count', no_show_cnt,
    'timezone', b.timezone
  ));

  return booking_row;
end;
$$;

revoke all on function public.create_booking_v3(uuid, uuid, timestamptz, timestamptz, uuid) from public;
grant execute on function public.create_booking_v3(uuid, uuid, timestamptz, timestamptz, uuid) to authenticated;
