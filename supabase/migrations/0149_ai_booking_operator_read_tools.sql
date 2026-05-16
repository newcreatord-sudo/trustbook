create or replace function public.ai_get_business_day_summary(
  p_business_id uuid,
  p_day date,
  p_agent_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_agent text;
  v_tz text;
  v_from timestamptz;
  v_to timestamptz;
  j jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_business_owner(p_business_id) then
    raise exception 'owner_only';
  end if;

  v_agent := nullif(trim(coalesce(p_agent_id, '')), '');
  if v_agent is not null then
    if not exists (
      select 1 from public.business_booking_ecosystem e
      where e.business_id = p_business_id and e.ai_booking_operator_enabled = true
    ) then
      raise exception 'ai_booking_operator_disabled';
    end if;
  end if;

  select coalesce(b.timezone, 'Europe/Rome')
  into v_tz
  from public.businesses b
  where b.id = p_business_id;

  v_from := (p_day::timestamp at time zone v_tz);
  v_to := ((p_day + 1)::timestamp at time zone v_tz);

  select jsonb_build_object(
    'business_id', p_business_id,
    'day', p_day,
    'timezone', v_tz,
    'from', v_from,
    'to', v_to,
    'counts', jsonb_build_object(
      'total', count(*),
      'requested', count(*) filter (where b.status = 'requested'),
      'pending_approval', count(*) filter (where b.status = 'pending_approval'),
      'requires_deposit', count(*) filter (where b.status = 'requires_deposit'),
      'confirmed', count(*) filter (where b.status = 'confirmed'),
      'completed', count(*) filter (where b.status = 'completed'),
      'no_show', count(*) filter (where b.status = 'no_show'),
      'cancelled', count(*) filter (where b.status = 'cancelled')
    ),
    'deposits', jsonb_build_object(
      'not_required_count', count(*) filter (where b.deposit_status = 'not_required'),
      'required_count', count(*) filter (where b.deposit_status = 'required'),
      'paid_count', count(*) filter (where b.deposit_status = 'paid'),
      'refunded_count', count(*) filter (where b.deposit_status = 'refunded'),
      'forfeited_count', count(*) filter (where b.deposit_status = 'forfeited'),
      'required_cents', coalesce(sum(b.deposit_amount_cents) filter (where b.deposit_status <> 'not_required'), 0),
      'paid_cents', coalesce(sum(b.deposit_amount_cents) filter (where b.deposit_status = 'paid'), 0),
      'forfeited_cents', coalesce(sum(b.deposit_amount_cents) filter (where b.deposit_status = 'forfeited'), 0)
    )
  )
  into j
  from public.bookings b
  where b.business_id = p_business_id
    and b.start_at >= v_from
    and b.start_at < v_to;

  begin
    insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
    values (
      p_business_id,
      v_agent,
      'ai_get_business_day_summary',
      jsonb_build_object('day', p_day),
      jsonb_build_object('status', 'ok'),
      auth.uid()
    );
  exception when others then
    null;
  end;

  return coalesce(j, '{}'::jsonb);
end;
$$;

revoke all on function public.ai_get_business_day_summary(uuid, date, text) from public;
grant execute on function public.ai_get_business_day_summary(uuid, date, text) to authenticated;

create or replace function public.ai_list_bookable_slots_for_service_day(
  p_business_id uuid,
  p_service_id uuid,
  p_on date,
  p_staff_id uuid default null,
  p_agent_id text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_agent text;
  j jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_business_owner(p_business_id) then
    raise exception 'owner_only';
  end if;

  v_agent := nullif(trim(coalesce(p_agent_id, '')), '');
  if v_agent is not null then
    if not exists (
      select 1 from public.business_booking_ecosystem e
      where e.business_id = p_business_id and e.ai_booking_operator_enabled = true
    ) then
      raise exception 'ai_booking_operator_disabled';
    end if;
  end if;

  select coalesce(
    jsonb_agg(jsonb_build_object('start_at', s.start_at, 'end_at', s.end_at) order by s.start_at asc),
    '[]'::jsonb
  )
  into j
  from public.list_bookable_slots_for_booking(p_business_id, p_service_id, p_on, p_staff_id) s;

  begin
    insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
    values (
      p_business_id,
      v_agent,
      'ai_list_bookable_slots_for_service_day',
      jsonb_build_object('service_id', p_service_id, 'on', p_on, 'staff_id', p_staff_id),
      jsonb_build_object('status', 'ok'),
      auth.uid()
    );
  exception when others then
    null;
  end;

  return coalesce(j, '[]'::jsonb);
end;
$$;

revoke all on function public.ai_list_bookable_slots_for_service_day(uuid, uuid, date, uuid, text) from public;
grant execute on function public.ai_list_bookable_slots_for_service_day(uuid, uuid, date, uuid, text) to authenticated;

