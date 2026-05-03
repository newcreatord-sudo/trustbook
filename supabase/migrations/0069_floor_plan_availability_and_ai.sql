-- TrustBook Floor Plan & Table Management — Phase C
-- Resource availability for booking slot + customer-facing table selection + auto-assignment.
-- These RPCs integrate resource availability into the booking flow.

-- list_available_resources_for_slot: ritorna risorse disponibili per uno slot
-- Accessibile ad anon per frontend pubblico (solo etichette/capienza/posizione — non sensibili)
create or replace function public.list_available_resources_for_slot(
  p_business_id uuid,
  p_service_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_party_size int default null
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
  v_tz text;
  v_duration int;
begin
  if not public.is_business_member(p_business_id) then
    raise exception 'member_only';
  end if;

  if p_start_at is null or p_end_at is null or p_start_at >= p_end_at then
    raise exception 'invalid_slot_range';
  end if;

  select coalesce(timezone, 'Europe/Rome')
  into v_tz
  from public.businesses
  where id = p_business_id;

  select greatest(0, coalesce(duration_min, 0))
  into v_duration
  from public.services
  where id = p_service_id and business_id = p_business_id;

  return query
  select
    br.id::uuid,
    br.label::text,
    br.kind::text,
    br.capacity_min::int,
    br.capacity_max::int,
    coalesce(nullif(br.metadata->>'zone', ''), 'default')::text as zone,
    br.position_json::jsonb,
    fp.name::text as floor_plan_name,
    br.floor_plan_id::uuid
  from public.business_booking_resources br
  join public.business_floor_plans fp on fp.id = br.floor_plan_id
  where br.business_id = p_business_id
    and br.is_active = true
    and fp.is_active = true
    and br.kind = 'table'
    and (p_party_size is null or (br.capacity_min <= p_party_size and br.capacity_max >= p_party_size))
    and public.is_resource_available(br.id, p_start_at, p_end_at, null)
  order by
    case when p_party_size is not null
         then abs((br.capacity_min + br.capacity_max) / 2 - p_party_size)
         else 0 end,
    br.label;
end;
$$;

revoke all on function public.list_available_resources_for_slot(uuid, uuid, timestamptz, timestamptz, int) from public;
grant execute on function public.list_available_resources_for_slot(uuid, uuid, timestamptz, timestamptz, int) to authenticated;
grant execute on function public.list_available_resources_for_slot(uuid, uuid, timestamptz, timestamptz, int) to anon;

-- auto_assign_resource_for_booking: assegna automaticamente primo tavolo disponibile
create or replace function public.auto_assign_resource_for_booking(p_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid;
  v_service uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_party_size int;
  v_vertical text;
  v_resource_id uuid;
  v_row_count int;
begin
  select business_id, service_id, start_at, end_at
  into v_business, v_service, v_start_at, v_end_at
  from public.bookings
  where id = p_booking_id;

  if v_business is null then
    raise exception 'booking_not_found';
  end if;

  if not public.is_business_member(v_business) then
    raise exception 'member_only';
  end if;

  if not exists (
    select 1 from public.business_booking_ecosystem
    where business_id = v_business
      and resource_management_enabled = true
  ) then
    raise exception 'resource_management_not_enabled';
  end if;

  select coalesce(booking_vertical, 'service')
  into v_vertical
  from public.business_booking_ecosystem
  where business_id = v_business;

  if v_vertical not in ('hospitality_table', 'seat_assignment') then
    raise exception 'vertical_does_not_support_table_assignment';
  end if;

  select coalesce((metadata->>'party_size')::int, 1)
  into v_party_size
  from public.booking_resource_assignments
  where booking_id = p_booking_id;

  if v_party_size is null then
    v_party_size := 2;
  end if;

  v_resource_id := null;

  select count(*) into v_row_count
  from public.list_available_resources_for_slot(v_business, v_service, v_start_at, v_end_at, v_party_size);

  if v_row_count = 0 then
    return null;
  end if;

  select resource_id into v_resource_id
  from public.list_available_resources_for_slot(v_business, v_service, v_start_at, v_end_at, v_party_size)
  order by label
  limit 1;

  if v_resource_id is not null then
    perform public.set_booking_primary_resource(p_booking_id, v_resource_id);
  end if;

  return v_resource_id;
end;
$$;

revoke all on function public.auto_assign_resource_for_booking(uuid) from public;
grant execute on function public.auto_assign_resource_for_booking(uuid) to authenticated;

-- assign_table_to_booking: assegna risorsa specifica (con validazione disponibilità)
create or replace function public.assign_table_to_booking(
  p_booking_id uuid,
  p_resource_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
begin
  select business_id, start_at, end_at
  into v_business, v_start_at, v_end_at
  from public.bookings
  where id = p_booking_id;

  if v_business is null then
    raise exception 'booking_not_found';
  end if;

  if not public.is_business_member(v_business) then
    raise exception 'member_only';
  end if;

  if not public.is_resource_available(p_resource_id, v_start_at, v_end_at, p_booking_id) then
    raise exception 'resource_not_available';
  end if;

  perform public.set_booking_primary_resource(p_booking_id, p_resource_id);
end;
$$;

revoke all on function public.assign_table_to_booking(uuid, uuid) from public;
grant execute on function public.assign_table_to_booking(uuid, uuid) to authenticated;

-- ai_suggest_resource_for_booking: suggerisce risorsa migliore per booking (scoring)
create or replace function public.ai_suggest_resource_for_booking(
  p_business_id uuid,
  p_booking_id uuid,
  p_criteria jsonb default '{}'
)
returns table (
  suggested_resource_id uuid,
  score numeric,
  reason text,
  label text,
  capacity_min int,
  capacity_max int,
  zone text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_business uuid;
  v_service uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_party_size int;
  v_prefer_zone text;
  v_available_resources record;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'owner_only';
  end if;

  select business_id, service_id, start_at, end_at
  into v_business, v_service, v_start_at, v_end_at
  from public.bookings
  where id = p_booking_id;

  if v_business is null then
    raise exception 'booking_not_found';
  end if;

  v_prefer_zone := coalesce(nullif(p_criteria->>'prefer_zone', ''), null);

  select coalesce((bra.metadata->>'party_size')::int, 2)
  into v_party_size
  from public.booking_resource_assignments bra
  where bra.booking_id = p_booking_id;

  for v_available_resources in
    select * from public.list_available_resources_for_slot(v_business, v_service, v_start_at, v_end_at, v_party_size)
  loop
    declare
      v_score numeric := 0;
      v_reason text := '';
    begin
      if v_prefer_zone is not null and v_available_resources.zone = v_prefer_zone then
        v_score := v_score + 10;
        v_reason := v_reason || 'zona preferita + ';
      end if;

      if v_available_resources.capacity_min <= v_party_size and v_available_resources.capacity_max >= v_party_size then
        if abs((v_available_resources.capacity_min + v_available_resources.capacity_max) / 2 - v_party_size) <= 1 then
          v_score := v_score + 5;
          v_reason := v_reason || 'capienza ottimale + ';
        else
          v_score := v_score + 2;
          v_reason := v_reason || 'capienza adeguata + ';
        end if;
      end if;

      if v_reason = '' then
        v_reason := 'tavolo disponibile';
      else
        v_reason := trim(trailing ' + ' from v_reason);
      end if;

      suggested_resource_id := v_available_resources.resource_id;
      score := v_score;
      reason := v_reason;
      label := v_available_resources.label;
      capacity_min := v_available_resources.capacity_min;
      capacity_max := v_available_resources.capacity_max;
      zone := v_available_resources.zone;

      return next;
    end;
  end loop;

  return;
end;
$$;

revoke all on function public.ai_suggest_resource_for_booking(uuid, uuid, jsonb) from public;
grant execute on function public.ai_suggest_resource_for_booking(uuid, uuid, jsonb) to authenticated;

-- ai_agent_execution_log: log strutturato per azioni automatiche AI
create table if not exists public.ai_agent_execution_log (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  agent_id text,
  tool_name text not null,
  parameters jsonb not null default '{}',
  result jsonb,
  error text,
  executed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.ai_agent_execution_log enable row level security;

drop policy if exists ai_agent_execution_log_member_read on public.ai_agent_execution_log;
create policy ai_agent_execution_log_member_read on public.ai_agent_execution_log
  for select to authenticated
  using (public.is_business_member(business_id));

drop policy if exists ai_agent_execution_log_owner_insert on public.ai_agent_execution_log;
create policy ai_agent_execution_log_owner_insert on public.ai_agent_execution_log
  for insert to authenticated
  with check (public.is_business_owner(business_id));

drop policy if exists ai_agent_execution_log_system_insert on public.ai_agent_execution_log;
create policy ai_agent_execution_log_system_insert on public.ai_agent_execution_log
  for insert to authenticated
  with check (
    executed_by is null
    and exists (
      select 1 from public.business_booking_ecosystem
      where business_id = ai_agent_execution_log.business_id
        and ai_execution_mode = 'auto_whitelisted'
    )
  );

grant select, insert on public.ai_agent_execution_log to authenticated;
revoke delete on public.ai_agent_execution_log from authenticated;

comment on table public.ai_agent_execution_log is
  'Audit log for AI agent actions. tool_name, parameters, result/error are recorded for every automated action.';
