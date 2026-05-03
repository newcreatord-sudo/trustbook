alter table public.business_booking_ecosystem
  add column if not exists ai_floor_plan_read_enabled boolean not null default false;

alter table public.business_booking_ecosystem
  add column if not exists ai_table_assignment_enabled boolean not null default false;

alter table public.business_booking_ecosystem
  add column if not exists ai_blocked_slots_enabled boolean not null default false;

create or replace function public.ai_get_floor_plan_bundle(
  p_business_id uuid,
  p_floor_plan_id uuid default null,
  p_agent_id text default null
)
returns table (
  floor_plan_id uuid,
  floor_plan_name text,
  floor_plan_is_active boolean,
  layout_json jsonb,
  resources_json jsonb,
  resource_count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_agent text;
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
      where e.business_id = p_business_id and e.ai_floor_plan_read_enabled = true
    ) then
      raise exception 'ai_floor_plan_read_disabled';
    end if;
  end if;

  return query
  select * from public.get_floor_plan_bundle(p_business_id, p_floor_plan_id);
end;
$$;

revoke all on function public.ai_get_floor_plan_bundle(uuid, uuid, text) from public;
grant execute on function public.ai_get_floor_plan_bundle(uuid, uuid, text) to authenticated;

create or replace function public.ai_list_available_tables_for_slot(
  p_business_id uuid,
  p_service_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_party_size int default null,
  p_agent_id text default null
)
returns table (
  resource_id uuid,
  label text,
  kind text,
  capacity_min int,
  capacity_max int,
  zone text,
  position_json jsonb,
  floor_plan_name text,
  floor_plan_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_agent text;
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
      where e.business_id = p_business_id and e.ai_floor_plan_read_enabled = true
    ) then
      raise exception 'ai_floor_plan_read_disabled';
    end if;
  end if;

  return query
  select * from public.list_available_resources_for_slot(p_business_id, p_service_id, p_start_at, p_end_at, p_party_size);
end;
$$;

revoke all on function public.ai_list_available_tables_for_slot(uuid, uuid, timestamptz, timestamptz, int, text) from public;
grant execute on function public.ai_list_available_tables_for_slot(uuid, uuid, timestamptz, timestamptz, int, text) to authenticated;

create or replace function public.ai_assign_table_to_booking(
  p_business_id uuid,
  p_booking_id uuid,
  p_resource_id uuid,
  p_party_size_hint int default null,
  p_agent_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent text;
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
      where e.business_id = p_business_id and e.ai_table_assignment_enabled = true
    ) then
      raise exception 'ai_table_assignment_disabled';
    end if;
  end if;

  perform public.assign_table_to_booking(p_booking_id, p_resource_id, p_party_size_hint);

  if v_agent is not null then
    begin
      insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
      values (
        p_business_id,
        v_agent,
        'ai_assign_table_to_booking',
        jsonb_build_object(
          'booking_id', p_booking_id,
          'resource_id', p_resource_id,
          'party_size_hint', p_party_size_hint
        ),
        jsonb_build_object('status', 'ok'),
        auth.uid()
      );
    exception when others then
      null;
    end;
  end if;
end;
$$;

revoke all on function public.ai_assign_table_to_booking(uuid, uuid, uuid, int, text) from public;
grant execute on function public.ai_assign_table_to_booking(uuid, uuid, uuid, int, text) to authenticated;

create or replace function public.ai_auto_assign_table_for_booking(
  p_business_id uuid,
  p_booking_id uuid,
  p_party_size_hint int default null,
  p_agent_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent text;
  v_resource uuid;
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
      where e.business_id = p_business_id and e.ai_table_assignment_enabled = true
    ) then
      raise exception 'ai_table_assignment_disabled';
    end if;
  end if;

  v_resource := public.auto_assign_resource_for_booking(p_booking_id, p_party_size_hint);

  if v_agent is not null then
    begin
      insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
      values (
        p_business_id,
        v_agent,
        'ai_auto_assign_table_for_booking',
        jsonb_build_object(
          'booking_id', p_booking_id,
          'party_size_hint', p_party_size_hint
        ),
        jsonb_build_object('status', 'ok', 'resource_id', v_resource),
        auth.uid()
      );
    exception when others then
      null;
    end;
  end if;

  return v_resource;
end;
$$;

revoke all on function public.ai_auto_assign_table_for_booking(uuid, uuid, int, text) from public;
grant execute on function public.ai_auto_assign_table_for_booking(uuid, uuid, int, text) to authenticated;

create or replace function public.ai_upsert_blocked_slot(
  p_business_id uuid,
  p_staff_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_reason text,
  p_agent_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent text;
  v_id uuid;
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
      where e.business_id = p_business_id and e.ai_blocked_slots_enabled = true
    ) then
      raise exception 'ai_blocked_slots_disabled';
    end if;
  end if;

  v_id := public.business_upsert_blocked_slot(p_business_id, p_staff_id, p_start_at, p_end_at, p_reason);

  if v_agent is not null then
    begin
      insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
      values (
        p_business_id,
        v_agent,
        'ai_upsert_blocked_slot',
        jsonb_build_object(
          'blocked_slot_id', v_id,
          'staff_id', p_staff_id,
          'start_at', p_start_at,
          'end_at', p_end_at,
          'reason', p_reason
        ),
        jsonb_build_object('status', 'ok'),
        auth.uid()
      );
    exception when others then
      null;
    end;
  end if;

  return v_id;
end;
$$;

revoke all on function public.ai_upsert_blocked_slot(uuid, uuid, timestamptz, timestamptz, text, text) from public;
grant execute on function public.ai_upsert_blocked_slot(uuid, uuid, timestamptz, timestamptz, text, text) to authenticated;

create or replace function public.ai_delete_blocked_slot(
  p_business_id uuid,
  p_blocked_slot_id uuid,
  p_agent_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent text;
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
      where e.business_id = p_business_id and e.ai_blocked_slots_enabled = true
    ) then
      raise exception 'ai_blocked_slots_disabled';
    end if;
  end if;

  perform public.business_delete_blocked_slot(p_blocked_slot_id);

  if v_agent is not null then
    begin
      insert into public.ai_agent_execution_log (business_id, agent_id, tool_name, parameters, result, executed_by)
      values (
        p_business_id,
        v_agent,
        'ai_delete_blocked_slot',
        jsonb_build_object('blocked_slot_id', p_blocked_slot_id),
        jsonb_build_object('status', 'ok'),
        auth.uid()
      );
    exception when others then
      null;
    end;
  end if;
end;
$$;

revoke all on function public.ai_delete_blocked_slot(uuid, uuid, text) from public;
grant execute on function public.ai_delete_blocked_slot(uuid, uuid, text) to authenticated;

