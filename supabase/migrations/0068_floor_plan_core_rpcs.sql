-- TrustBook Floor Plan & Table Management — Phase A
-- Schema version for layout_json + core RPCs for floor plan and resource management.
-- These RPCs are the ONLY interface for floor plan operations — no direct SQL from client/AI.

alter table public.business_booking_ecosystem
  add column if not exists customer_table_choice text not null default 'preferred'
    check (customer_table_choice in ('off', 'preferred', 'required'));

alter table public.business_booking_ecosystem
  add column if not exists default_table_assignment_mode text not null default 'auto'
    check (default_table_assignment_mode in ('auto', 'customer_choice'));

comment on column public.business_booking_ecosystem.customer_table_choice is
  'off: no table choice; preferred: customer can choose but not required; required: must choose table';
comment on column public.business_booking_ecosystem.default_table_assignment_mode is
  'auto: system assigns table if customer does not choose; customer_choice: waits for customer selection';

-- Validazione layout_json versionato
create or replace function public.validate_layout_json(p_layout jsonb)
returns boolean
language plpgsql
immutable
as $$
begin
  if p_layout is null then
    return true;
  end if;

  if jsonb_typeof(p_layout) = 'null' then
    return true;
  end if;

  if not (p_layout ? 'version') then
    return false;
  end if;

  if jsonb_typeof(p_layout->'version') <> 'number' then
    return false;
  end if;

  if (p_layout->>'version')::int < 0 then
    return false;
  end if;

  return true;
end;
$$;

comment on function public.validate_layout_json is
  'Validates that layout_json has a version field (version 0 = legacy/no version stored as null)';

-- get_floor_plan_bundle: lettura aggregata floor plan + risorse per business
-- SECURITY DEFINER con is_business_member
create or replace function public.get_floor_plan_bundle(
  p_business_id uuid,
  p_floor_plan_id uuid default null
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
begin
  if not public.is_business_member(p_business_id) then
    raise exception 'member_only';
  end if;

  return query
  select
    fp.id::uuid,
    fp.name::text,
    fp.is_active::boolean,
    fp.layout_json::jsonb,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'id', br.id,
        'label', br.label,
        'kind', br.kind,
        'capacity_min', br.capacity_min,
        'capacity_max', br.capacity_max,
        'is_active', br.is_active,
        'position_json', br.position_json,
        'floor_plan_id', br.floor_plan_id,
        'metadata', br.metadata
      ) order by br.label
    ), '[]'::jsonb)::jsonb as resources_json,
    count(br.id)::int as resource_count
  from public.business_floor_plans fp
  left join public.business_booking_resources br on br.floor_plan_id = fp.id
  where fp.business_id = p_business_id
    and (p_floor_plan_id is null or fp.id = p_floor_plan_id)
  group by fp.id, fp.name, fp.is_active, fp.layout_json
  order by fp.name;
end;
$$;

revoke all on function public.get_floor_plan_bundle(uuid, uuid) from public;
grant execute on function public.get_floor_plan_bundle(uuid, uuid) to authenticated;

-- upsert_floor_plan: crea o aggiorna un piano
-- Owner-only; valida schema layout_json
create or replace function public.upsert_floor_plan(
  p_business_id uuid,
  p_floor_plan_id uuid default null,
  p_name text default null,
  p_layout_json jsonb default '{}',
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_layout jsonb;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'owner_only';
  end if;

  if p_name is null or trim(p_name) = '' then
    raise exception 'name_required';
  end if;

  if p_layout_json is not null and p_layout_json <> 'null'::jsonb then
    if not public.validate_layout_json(p_layout_json) then
      raise exception 'invalid_layout_json_version';
    end if;
  end if;

  v_layout := coalesce(nullif(p_layout_json, 'null'::jsonb), '{}'::jsonb);

  if p_floor_plan_id is null then
    insert into public.business_floor_plans (business_id, name, layout_json, is_active)
    values (p_business_id, trim(p_name), v_layout, p_is_active)
    returning id into v_id;
  else
    update public.business_floor_plans
    set name = trim(p_name),
        layout_json = v_layout,
        is_active = p_is_active,
        updated_at = now()
    where id = p_floor_plan_id and business_id = p_business_id
    returning id into v_id;

    if v_id is null then
      raise exception 'floor_plan_not_found';
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.upsert_floor_plan(uuid, uuid, text, jsonb, boolean) from public;
grant execute on function public.upsert_floor_plan(uuid, uuid, text, jsonb, boolean) to authenticated;

-- upsert_booking_resource: crea o aggiorna risorsa (tavolo/etc)
-- Owner-only
create or replace function public.upsert_booking_resource(
  p_business_id uuid,
  p_resource_id uuid default null,
  p_floor_plan_id uuid default null,
  p_kind text default 'table',
  p_label text default null,
  p_capacity_min int default 1,
  p_capacity_max int default 4,
  p_position_json jsonb default '{}',
  p_metadata jsonb default '{}',
  p_is_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_label text;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'owner_only';
  end if;

  if p_kind not in ('table', 'room', 'chair', 'station', 'equipment', 'seat') then
    raise exception 'invalid_resource_kind';
  end if;

  if p_capacity_min < 1 then
    raise exception 'capacity_min_must_be_positive';
  end if;

  if p_capacity_max < p_capacity_min then
    raise exception 'capacity_max_must_be_at_least_capacity_min';
  end if;

  v_label := coalesce(nullif(trim(p_label), ''), 'Tavolo ' || coalesce(p_resource_id::text, 'nuovo'));

  if p_floor_plan_id is not null then
    if not exists (
      select 1 from public.business_floor_plans
      where id = p_floor_plan_id and business_id = p_business_id
    ) then
      raise exception 'floor_plan_not_found';
    end if;
  end if;

  if p_resource_id is null then
    insert into public.business_booking_resources
      (business_id, floor_plan_id, kind, label, capacity_min, capacity_max, position_json, metadata, is_active)
    values
      (p_business_id, p_floor_plan_id, p_kind, v_label, p_capacity_min, p_capacity_max,
       coalesce(nullif(p_position_json, 'null'::jsonb), '{}'::jsonb),
       coalesce(nullif(p_metadata, 'null'::jsonb), '{}'::jsonb),
       p_is_active)
    returning id into v_id;
  else
    update public.business_booking_resources
    set floor_plan_id = p_floor_plan_id,
        kind = p_kind,
        label = v_label,
        capacity_min = p_capacity_min,
        capacity_max = p_capacity_max,
        position_json = coalesce(nullif(p_position_json, 'null'::jsonb), position_json),
        metadata = coalesce(nullif(p_metadata, 'null'::jsonb), metadata),
        is_active = p_is_active,
        updated_at = now()
    where id = p_resource_id and business_id = p_business_id
    returning id into v_id;

    if v_id is null then
      raise exception 'resource_not_found';
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.upsert_booking_resource(uuid, uuid, uuid, text, text, int, int, jsonb, jsonb, boolean) from public;
grant execute on function public.upsert_booking_resource(uuid, uuid, uuid, text, text, int, int, jsonb, jsonb, boolean) to authenticated;

-- delete_booking_resource: elimina risorsa (solo se non ha assegnazioni future)
-- Owner-only
create or replace function public.delete_booking_resource(p_resource_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid;
  v_has_future_assignments boolean;
begin
  select business_id into v_business
  from public.business_booking_resources
  where id = p_resource_id;

  if v_business is null then
    raise exception 'resource_not_found';
  end if;

  if not public.is_business_owner(v_business) then
    raise exception 'owner_only';
  end if;

  if exists (
    select 1
    from public.booking_resource_assignments bra
    join public.bookings bk on bk.id = bra.booking_id
    where bra.primary_resource_id = p_resource_id
      and bk.status in ('requested', 'pending_approval', 'pending_deposit', 'requires_deposit',
                       'confirmed', 'change_proposed')
      and bk.start_at > now()
  ) then
    raise exception 'resource_has_future_bookings';
  end if;

  delete from public.business_booking_resources where id = p_resource_id;
end;
$$;

revoke all on function public.delete_booking_resource(uuid) from public;
grant execute on function public.delete_booking_resource(uuid) to authenticated;

-- upsert_floor_plan_resource_link: collega risorsa a un piano
create or replace function public.upsert_floor_plan_resource_link(
  p_resource_id uuid,
  p_floor_plan_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid;
begin
  select business_id into v_business
  from public.business_booking_resources
  where id = p_resource_id;

  if v_business is null then
    raise exception 'resource_not_found';
  end if;

  if not public.is_business_owner(v_business) then
    raise exception 'owner_only';
  end if;

  if p_floor_plan_id is not null then
    if not exists (
      select 1 from public.business_floor_plans
      where id = p_floor_plan_id and business_id = v_business
    ) then
      raise exception 'floor_plan_not_found';
    end if;
  end if;

  update public.business_booking_resources
  set floor_plan_id = p_floor_plan_id, updated_at = now()
  where id = p_resource_id;
end;
$$;

revoke all on function public.upsert_floor_plan_resource_link(uuid, uuid) from public;
grant execute on function public.upsert_floor_plan_resource_link(uuid, uuid) to authenticated;

-- is_resource_available: verifica se risorsa è disponibile per uno slot
-- SECURITY DEFINER con membership check
create or replace function public.is_resource_available(
  p_resource_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_exclude_booking_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_resource record;
  v_business uuid;
  v_has_overlap boolean;
begin
  select br.business_id, br.is_active, br.kind, br.floor_plan_id
  into v_resource
  from public.business_booking_resources br
  where br.id = p_resource_id;

  if v_resource is null then
    return false;
  end if;

  if not v_resource.is_active then
    return false;
  end if;

  v_business := v_resource.business_id;

  if p_start_at is null or p_end_at is null or p_start_at >= p_end_at then
    raise exception 'invalid_slot_range';
  end if;

  select exists (
    select 1
    from public.booking_resource_assignments bra
    join public.bookings bk on bk.id = bra.booking_id
    join public.services svc on svc.id = bk.service_id
    where bra.primary_resource_id = p_resource_id
      and bk.business_id = v_business
      and bk.status in (
        'requested', 'pending_approval', 'pending_deposit', 'requires_deposit',
        'confirmed', 'change_proposed', 'completed', 'no_show', 'late_cancel'
      )
      and (p_exclude_booking_id is null or bk.id <> p_exclude_booking_id)
      and bk.start_at < p_end_at + make_interval(mins => coalesce(svc.buffer_after_min, 0))
      and bk.end_at > p_start_at - make_interval(mins => coalesce(svc.buffer_before_min, 0))
  ) into v_has_overlap;

  if v_has_overlap then
    return false;
  end if;

  if exists (
    select 1
    from public.blocked_slots bs
    where bs.business_id = v_business
      and (bs.staff_id is null)
      and bs.start_at < p_end_at
      and bs.end_at > p_start_at
  ) then
    return false;
  end if;

  return true;
end;
$$;

revoke all on function public.is_resource_available(uuid, timestamptz, timestamptz, uuid) from public;
grant execute on function public.is_resource_available(uuid, timestamptz, timestamptz, uuid) to authenticated;
