-- Fix floor-plan RPC authorization: customers could not list or assign tables while anon was granted (dead path).
-- Aligns server behavior with TrustBook UI (authenticated cliente + ecosystem flags).

create or replace function public._apply_booking_resource_assignment(
  p_booking_id uuid,
  p_resource_id uuid,
  p_party_size int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b_business uuid;
  r_business uuid;
  ps int;
begin
  select business_id into b_business from public.bookings where id = p_booking_id;
  if b_business is null then
    raise exception 'booking_not_found';
  end if;

  select business_id into r_business from public.business_booking_resources where id = p_resource_id;
  if r_business is null then
    raise exception 'resource_not_found';
  end if;
  if r_business <> b_business then
    raise exception 'resource_business_mismatch';
  end if;

  ps := case
    when p_party_size is not null and p_party_size >= 1 then p_party_size
    else null
  end;

  insert into public.booking_resource_assignments (booking_id, primary_resource_id, party_size)
  values (p_booking_id, p_resource_id, ps)
  on conflict (booking_id) do update set
    primary_resource_id = excluded.primary_resource_id,
    party_size = coalesce(excluded.party_size, public.booking_resource_assignments.party_size),
    metadata = public.booking_resource_assignments.metadata;
end;
$$;

revoke all on function public._apply_booking_resource_assignment(uuid, uuid, int) from public;

create or replace function public.set_booking_primary_resource(
  p_booking_id uuid,
  p_resource_id uuid,
  p_party_size int default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  b_business uuid;
begin
  select business_id into b_business from public.bookings where id = p_booking_id;
  if b_business is null then
    raise exception 'booking_not_found';
  end if;

  if not public.is_business_member(b_business) then
    raise exception 'member_only';
  end if;

  perform public._apply_booking_resource_assignment(p_booking_id, p_resource_id, p_party_size);
end;
$$;

revoke all on function public.set_booking_primary_resource(uuid, uuid, int) from public;
grant execute on function public.set_booking_primary_resource(uuid, uuid, int) to authenticated;

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
  v_vertical text;
  v_choice text;
  v_res_mgmt boolean;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (select 1 from public.businesses where id = p_business_id) then
    raise exception 'business_not_found';
  end if;

  select
    e.booking_vertical::text,
    e.customer_table_choice::text,
    e.resource_management_enabled
  into v_vertical, v_choice, v_res_mgmt
  from public.business_booking_ecosystem e
  where e.business_id = p_business_id;

  if not FOUND then
    v_vertical := 'service';
    v_choice := 'off';
    v_res_mgmt := false;
  else
    v_vertical := coalesce(v_vertical, 'service');
    v_choice := coalesce(v_choice, 'off');
    v_res_mgmt := coalesce(v_res_mgmt, false);
  end if;

  if public.is_business_member(p_business_id) then
    null;
  elsif not v_res_mgmt then
    raise exception 'resource_management_disabled';
  elsif v_vertical not in ('hospitality_table', 'seat_assignment') then
    raise exception 'vertical_does_not_support_table_selection';
  elsif v_choice = 'off' then
    raise exception 'customer_table_selection_not_available';
  else
    null;
  end if;

  if p_start_at is null or p_end_at is null or p_start_at >= p_end_at then
    raise exception 'invalid_slot_range';
  end if;

  select coalesce(timezone, 'Europe/Rome')
  into v_tz
  from public.businesses
  where id = p_business_id;

  if not exists (
    select 1 from public.services where id = p_service_id and business_id = p_business_id
  ) then
    raise exception 'service_not_found';
  end if;

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
    and (
      case v_vertical
        when 'hospitality_table' then br.kind = 'table'
        when 'seat_assignment' then br.kind in ('seat', 'chair')
        else br.kind = 'table'
      end
    )
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

create or replace function public.auto_assign_resource_for_booking(
  p_booking_id uuid,
  p_party_size_hint int default null
)
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
  v_customer uuid;
  v_mode text;
begin
  select business_id, service_id, start_at, end_at, customer_user_id
  into v_business, v_service, v_start_at, v_end_at, v_customer
  from public.bookings
  where id = p_booking_id;

  if v_business is null then
    raise exception 'booking_not_found';
  end if;

  if public.is_business_member(v_business) then
    null;
  elsif auth.uid() is not null and auth.uid() = v_customer then
    select coalesce(default_table_assignment_mode::text, 'auto')
    into v_mode
    from public.business_booking_ecosystem
    where business_id = v_business;
    if v_mode is null or v_mode <> 'auto' then
      raise exception 'auto_assignment_not_allowed_for_customer';
    end if;
  else
    raise exception 'member_only';
  end if;

  if not exists (
    select 1 from public.business_booking_ecosystem
    where business_id = v_business
      and resource_management_enabled = true
  ) then
    raise exception 'resource_management_not_enabled';
  end if;

  select coalesce(booking_vertical::text, 'service')
  into v_vertical
  from public.business_booking_ecosystem
  where business_id = v_business;

  if v_vertical not in ('hospitality_table', 'seat_assignment') then
    raise exception 'vertical_does_not_support_table_assignment';
  end if;

  select bra.party_size
  into v_party_size
  from public.booking_resource_assignments bra
  where bra.booking_id = p_booking_id;

  v_party_size := coalesce(p_party_size_hint, v_party_size, 2);

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
    perform public._apply_booking_resource_assignment(p_booking_id, v_resource_id, v_party_size);
  end if;

  return v_resource_id;
end;
$$;

revoke all on function public.auto_assign_resource_for_booking(uuid, int) from public;
grant execute on function public.auto_assign_resource_for_booking(uuid, int) to authenticated;

create or replace function public.assign_table_to_booking(
  p_booking_id uuid,
  p_resource_id uuid,
  p_party_size int default null
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
  v_customer uuid;
  v_choice text;
  v_status text;
begin
  select business_id, start_at, end_at, customer_user_id, status::text
  into v_business, v_start_at, v_end_at, v_customer, v_status
  from public.bookings
  where id = p_booking_id;

  if v_business is null then
    raise exception 'booking_not_found';
  end if;

  if v_status in (
    'cancelled_by_customer', 'cancelled_by_business', 'completed', 'no_show', 'late_cancel'
  ) then
    raise exception 'booking_not_editable';
  end if;

  if public.is_business_member(v_business) then
    null;
  elsif auth.uid() is not null and auth.uid() = v_customer then
    select coalesce(customer_table_choice::text, 'off')
    into v_choice
    from public.business_booking_ecosystem
    where business_id = v_business;
    if v_choice not in ('preferred', 'required') then
      raise exception 'customer_table_selection_not_available';
    end if;
  else
    raise exception 'member_only';
  end if;

  if not public.is_resource_available(p_resource_id, v_start_at, v_end_at, p_booking_id) then
    raise exception 'resource_not_available';
  end if;

  perform public._apply_booking_resource_assignment(p_booking_id, p_resource_id, p_party_size);
end;
$$;

revoke all on function public.assign_table_to_booking(uuid, uuid, int) from public;
grant execute on function public.assign_table_to_booking(uuid, uuid, int) to authenticated;

create or replace function public.auto_assign_resource_for_booking(p_booking_id uuid)
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.auto_assign_resource_for_booking(p_booking_id, null::int);
$$;

revoke all on function public.auto_assign_resource_for_booking(uuid) from public;
grant execute on function public.auto_assign_resource_for_booking(uuid) to authenticated;
