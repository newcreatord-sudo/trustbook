create or replace function public.list_bookable_slots_for_booking(
  p_business_id uuid,
  p_service_id uuid,
  p_on date,
  p_staff_id uuid default null
)
returns table(start_at timestamptz, end_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b_tz text;
  b_lead int;
  b_allow_ob boolean;
  b_paused boolean;
  b_min_gap int;
  dur int;
  buf_bef int;
  buf_aft int;
  svc_active boolean;
  v_dow numeric;
  lead_cutoff timestamptz;
  slot_local timestamp;
  v_start timestamptz;
  v_end timestamptz;
  actual_start timestamptz;
  actual_end timestamptz;
  cur_min int;
  win_start_min int;
  win_end_min int;
  step_min int;
  overlap_booking boolean;
  w record;
  eco_vertical text := 'service';
  eco_resource_enabled boolean := false;
  use_resource_mode boolean := false;
  has_free_resource boolean := false;
begin
  select
    coalesce(timezone, 'Europe/Rome'),
    coalesce(booking_lead_time_min, 0),
    coalesce(allow_overbooking, false),
    coalesce(is_paused, false),
    greatest(0, coalesce(min_gap_min, 0))
  into b_tz, b_lead, b_allow_ob, b_paused, b_min_gap
  from public.businesses
  where id = p_business_id;

  if not found or b_paused then
    return;
  end if;

  select
    coalesce(s.duration_min, 0),
    coalesce(s.buffer_before_min, 0),
    coalesce(s.buffer_after_min, 0),
    coalesce(s.is_active, false)
  into dur, buf_bef, buf_aft, svc_active
  from public.services s
  where s.id = p_service_id
    and s.business_id = p_business_id;

  if dur <= 0 or not svc_active then
    return;
  end if;

  if p_staff_id is not null then
    if not exists (
      select 1
      from public.team_members tm
      where tm.id = p_staff_id
        and tm.business_id = p_business_id
        and coalesce(tm.is_bookable, true)
    ) then
      return;
    end if;
  end if;

  select coalesce(e.booking_vertical, 'service'), coalesce(e.resource_management_enabled, false)
  into eco_vertical, eco_resource_enabled
  from public.business_booking_ecosystem e
  where e.business_id = p_business_id;

  use_resource_mode := eco_resource_enabled = true and eco_vertical in ('hospitality_table', 'seat_assignment');

  lead_cutoff := now() + make_interval(mins => greatest(0, b_lead));
  v_dow := extract(dow from p_on);

  for w in
    select bow.start_time, bow.end_time
    from public.business_opening_windows bow
    where bow.business_id = p_business_id
      and bow.weekday = v_dow
    order by bow.start_time
  loop
    win_start_min :=
      extract(hour from w.start_time)::int * 60 + extract(minute from w.start_time)::int;
    win_end_min :=
      extract(hour from w.end_time)::int * 60 + extract(minute from w.end_time)::int;

    if win_end_min <= win_start_min then
      continue;
    end if;

    step_min := dur + b_min_gap;
    cur_min := win_start_min;

    while cur_min + dur <= win_end_min loop
      slot_local := p_on::timestamp + make_interval(mins => cur_min);
      v_start := slot_local at time zone b_tz;
      v_end := (p_on::timestamp + make_interval(mins => cur_min + dur)) at time zone b_tz;

      if v_start < lead_cutoff then
        cur_min := cur_min + step_min;
        continue;
      end if;

      if exists (
        select 1
        from public.business_closures c
        where c.business_id = p_business_id
          and c.start_at < v_end
          and c.end_at > v_start
      ) then
        cur_min := cur_min + step_min;
        continue;
      end if;

      if p_staff_id is not null then
        if exists (
          select 1
          from public.staff_closures sc
          where sc.staff_id = p_staff_id
            and sc.start_at < v_end
            and sc.end_at > v_start
        ) then
          cur_min := cur_min + step_min;
          continue;
        end if;
      end if;

      actual_start := v_start - make_interval(mins => buf_bef);
      actual_end := v_end + make_interval(mins => buf_aft);

      if use_resource_mode then
        select exists (
          select 1
          from public.business_booking_resources br
          join public.business_floor_plans fp on fp.id = br.floor_plan_id
          where br.business_id = p_business_id
            and br.is_active = true
            and fp.is_active = true
            and br.kind = 'table'
            and public.is_resource_available(br.id, v_start, v_end, null)
        )
        into has_free_resource;

        if not has_free_resource then
          cur_min := cur_min + step_min;
          continue;
        end if;
      else
        select exists (
          select 1
          from public.bookings bk
          where bk.business_id = p_business_id
            and bk.status in (
              'requested',
              'pending_approval',
              'pending_deposit',
              'requires_deposit',
              'pending_payment_setup',
              'confirmed',
              'change_proposed',
              'completed',
              'no_show',
              'late_cancel'
            )
            and (p_staff_id is null or bk.staff_id = p_staff_id)
            and bk.start_at < actual_end
            and bk.end_at > actual_start
        )
        into overlap_booking;

        if overlap_booking and not b_allow_ob then
          cur_min := cur_min + step_min;
          continue;
        end if;
      end if;

      if exists (
        select 1
        from public.blocked_slots bs
        where bs.business_id = p_business_id
          and (bs.staff_id is null or bs.staff_id = p_staff_id)
          and bs.start_at < actual_end
          and bs.end_at > actual_start
      ) then
        cur_min := cur_min + step_min;
        continue;
      end if;

      start_at := v_start;
      end_at := v_end;
      return next;

      cur_min := cur_min + step_min;
    end loop;
  end loop;

  return;
end;
$$;

revoke all on function public.list_bookable_slots_for_booking(uuid, uuid, date, uuid) from public;
grant execute on function public.list_bookable_slots_for_booking(uuid, uuid, date, uuid) to anon;
grant execute on function public.list_bookable_slots_for_booking(uuid, uuid, date, uuid) to authenticated;
