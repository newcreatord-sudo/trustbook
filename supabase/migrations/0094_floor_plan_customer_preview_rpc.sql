-- Anteprima planimetria per cliente in prenotazione: senza membership business (get_floor_plan_bundle è member_only).
-- Espone solo piano attivo + risorse aggregate come nel bundle interno; richiede gestione risorse attiva.

create or replace function public.get_floor_plan_preview_for_customer_booking(
  p_business_id uuid,
  p_floor_plan_id uuid
)
returns table (
  layout_json jsonb,
  resources_json jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;

  if not exists (
    select 1 from public.business_booking_ecosystem e
    where e.business_id = p_business_id
      and e.resource_management_enabled = true
  ) then
    raise exception 'resource_management_disabled';
  end if;

  if not exists (
    select 1 from public.business_floor_plans fp
    where fp.id = p_floor_plan_id
      and fp.business_id = p_business_id
      and fp.is_active = true
  ) then
    raise exception 'floor_plan_not_found';
  end if;

  return query
  select
    fp.layout_json,
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
    ), '[]'::jsonb)::jsonb as resources_json
  from public.business_floor_plans fp
  left join public.business_booking_resources br on br.floor_plan_id = fp.id
  where fp.id = p_floor_plan_id
    and fp.business_id = p_business_id
  group by fp.id, fp.layout_json;
end;
$$;

comment on function public.get_floor_plan_preview_for_customer_booking(uuid, uuid) is
  'Cliente autenticato: layout + risorse per un piano attivo (solo se resource_management_enabled).';

revoke all on function public.get_floor_plan_preview_for_customer_booking(uuid, uuid) from public;
grant execute on function public.get_floor_plan_preview_for_customer_booking(uuid, uuid) to authenticated;
