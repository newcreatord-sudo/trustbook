-- Public read-only floor plan bundle for business profile (no background, no occupancy).
create or replace function public.get_public_floor_plan_bundle(
  p_business_id uuid
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
  v_visible boolean;
  v_enabled boolean;
begin
  select b.listing_visible into v_visible
  from public.businesses b
  where b.id = p_business_id;

  if v_visible is distinct from true then
    return;
  end if;

  select (
    eco.resource_management_enabled
    and coalesce((eco.settings->>'public_floor_plan_enabled')::boolean, false)
  )
  into v_enabled
  from public.business_booking_ecosystem eco
  where eco.business_id = p_business_id;

  if v_enabled is distinct from true then
    return;
  end if;

  return query
  select
    fp.id::uuid,
    fp.name::text,
    fp.is_active::boolean,
    (coalesce(fp.layout_json, '{}'::jsonb) - 'background')::jsonb as layout_json,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', br.id,
          'label', br.label,
          'kind', br.kind,
          'capacity_min', br.capacity_min,
          'capacity_max', br.capacity_max
        )
        order by br.label
      ) filter (where br.id is not null),
      '[]'::jsonb
    )::jsonb as resources_json,
    count(br.id)::int as resource_count
  from public.business_floor_plans fp
  left join public.business_booking_resources br
    on br.floor_plan_id = fp.id
    and br.is_active = true
  where fp.business_id = p_business_id
    and fp.is_active = true
  group by fp.id, fp.name, fp.is_active, fp.layout_json
  order by fp.name;
end;
$$;

revoke all on function public.get_public_floor_plan_bundle(uuid) from public;
grant execute on function public.get_public_floor_plan_bundle(uuid) to anon;
grant execute on function public.get_public_floor_plan_bundle(uuid) to authenticated;

