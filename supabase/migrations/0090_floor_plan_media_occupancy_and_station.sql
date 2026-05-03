insert into storage.buckets (id, name, public)
values ('business-private', 'business-private', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists business_private_member_read on storage.objects;
create policy business_private_member_read on storage.objects
for select
to authenticated
using (
  bucket_id = 'business-private'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.is_business_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists business_private_member_insert on storage.objects;
create policy business_private_member_insert on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'business-private'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.is_business_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists business_private_member_update on storage.objects;
create policy business_private_member_update on storage.objects
for update
to authenticated
using (
  bucket_id = 'business-private'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.is_business_member(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'business-private'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.is_business_member(((storage.foldername(name))[1])::uuid)
);

drop policy if exists business_private_member_delete on storage.objects;
create policy business_private_member_delete on storage.objects
for delete
to authenticated
using (
  bucket_id = 'business-private'
  and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  and public.is_business_member(((storage.foldername(name))[1])::uuid)
);

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
  v_visible boolean;
  v_paused boolean;
  v_member boolean;
  v_primary_kind text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  v_member := public.is_business_member(p_business_id);

  select
    coalesce(timezone, 'Europe/Rome'),
    coalesce(listing_visible, true),
    coalesce(is_paused, false)
  into v_tz, v_visible, v_paused
  from public.businesses
  where id = p_business_id;

  if not found then
    raise exception 'business_not_found';
  end if;

  if not v_member then
    if v_visible is not true then
      raise exception 'business_not_public';
    end if;
    if v_paused is true then
      raise exception 'business_paused';
    end if;
  end if;

  select
    e.booking_vertical::text,
    e.customer_table_choice::text,
    e.resource_management_enabled,
    nullif(e.settings->>'resource_primary_kind', '')::text
  into v_vertical, v_choice, v_res_mgmt, v_primary_kind
  from public.business_booking_ecosystem e
  where e.business_id = p_business_id;

  if not FOUND then
    v_vertical := 'service';
    v_choice := 'off';
    v_res_mgmt := false;
    v_primary_kind := null;
  else
    v_vertical := coalesce(v_vertical, 'service');
    v_choice := coalesce(v_choice, 'off');
    v_res_mgmt := coalesce(v_res_mgmt, false);
    v_primary_kind := nullif(v_primary_kind, '');
  end if;

  if v_primary_kind is not null and v_primary_kind not in ('table', 'seat', 'chair', 'station') then
    v_primary_kind := null;
  end if;

  if v_member then
    null;
  elsif not v_res_mgmt then
    raise exception 'resource_management_disabled';
  elsif v_vertical not in ('hospitality_table', 'seat_assignment', 'professional_slot') then
    raise exception 'vertical_does_not_support_table_selection';
  elsif v_choice = 'off' then
    raise exception 'customer_table_selection_not_available';
  else
    null;
  end if;

  if p_start_at is null or p_end_at is null or p_start_at >= p_end_at then
    raise exception 'invalid_slot_range';
  end if;

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
      case
        when v_primary_kind is not null then
          case
            when v_primary_kind = 'seat' then br.kind in ('seat', 'chair')
            when v_primary_kind = 'chair' then br.kind in ('seat', 'chair')
            else br.kind = v_primary_kind
          end
        else
          case v_vertical
            when 'hospitality_table' then br.kind = 'table'
            when 'seat_assignment' then br.kind in ('seat', 'chair')
            when 'professional_slot' then br.kind = 'station'
            else br.kind = 'table'
          end
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

  if v_vertical not in ('hospitality_table', 'seat_assignment', 'professional_slot') then
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

create or replace function public.get_resource_occupancy_at(
  p_business_id uuid,
  p_at timestamptz,
  p_floor_plan_id uuid default null
)
returns table (
  resource_id uuid,
  resource_label text,
  floor_plan_id uuid,
  booking_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  if not public.is_business_member(p_business_id) then
    raise exception 'member_only';
  end if;

  if p_at is null then
    raise exception 'invalid_at';
  end if;

  return query
  select
    br.id as resource_id,
    br.label as resource_label,
    br.floor_plan_id,
    bk.id as booking_id,
    bk.start_at,
    bk.end_at,
    bk.status::text as status
  from public.booking_resource_assignments bra
  join public.bookings bk on bk.id = bra.booking_id
  join public.business_booking_resources br on br.id = bra.primary_resource_id
  where br.business_id = p_business_id
    and br.is_active = true
    and (p_floor_plan_id is null or br.floor_plan_id = p_floor_plan_id)
    and bk.status in (
      'pending_deposit',
      'requires_deposit',
      'pending_payment_setup',
      'confirmed',
      'change_proposed',
      'completed',
      'no_show',
      'late_cancel'
    )
    and bk.start_at < p_at
    and bk.end_at > p_at;
end;
$$;

revoke all on function public.get_resource_occupancy_at(uuid, timestamptz, uuid) from public;
grant execute on function public.get_resource_occupancy_at(uuid, timestamptz, uuid) to authenticated;

