-- TrustBook planimetria: normalizzazione server-side layout_json + RPC eliminazione piano.
-- Obiettivi: integrità (risorse reali del business), limiti payload (DoS / JSON enormi),
-- coerenza con limiti client (MAX_LAYOUT_NODES, bounds canvas).

create or replace function public.normalize_floor_plan_layout_json(
  p_layout jsonb,
  p_business_id uuid,
  p_floor_plan_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_nodes jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_seen uuid[] := array[]::uuid[];
  v_rid uuid;
  v_x numeric;
  v_y numeric;
  v_w numeric;
  v_h numeric;
  v_rot numeric;
  v_id text;
  v_type text;
  v_shape text;
  v_zone text;
  v_label text;
  v_ver int;
  v_bw int;
  v_bh int;
  v_bg jsonb := null;
  v_grid jsonb := null;
  v_walls jsonb;
  v_ann jsonb;
  v_out jsonb;
  v_ncols numeric;
  v_nrows numeric;
  v_max_nodes int := 400;
  v_min_dim numeric := 0.02;
  v_max_px int := 4096;
  v_raw_len int;
  v_node_count int;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'owner_only';
  end if;

  if p_layout is null or jsonb_typeof(p_layout) = 'null' then
    raise exception 'layout_required';
  end if;

  v_raw_len := octet_length(p_layout::text);
  if v_raw_len > 1200000 then
    raise exception 'layout_json_too_large';
  end if;

  if not public.validate_layout_json(p_layout) then
    raise exception 'invalid_layout_json_version';
  end if;

  v_ver := greatest(0, coalesce((p_layout->>'version')::int, 1));

  if jsonb_typeof(p_layout->'bounds') = 'object' then
    if jsonb_typeof(p_layout->'bounds'->'width_px') = 'number' then
      v_bw := greatest(320, least(v_max_px, floor((p_layout->'bounds'->>'width_px')::numeric)::int));
    else
      v_bw := 800;
    end if;
    if jsonb_typeof(p_layout->'bounds'->'height_px') = 'number' then
      v_bh := greatest(240, least(v_max_px, floor((p_layout->'bounds'->>'height_px')::numeric)::int));
    else
      v_bh := 600;
    end if;
  else
    v_bw := 800;
    v_bh := 600;
  end if;

  if jsonb_typeof(p_layout->'background') = 'object' then
    if (p_layout->'background'->>'bucket') = 'business-private'
       and coalesce(trim(p_layout->'background'->>'path'), '') <> '' then
      v_bg := jsonb_build_object(
        'bucket', 'business-private',
        'path', left(trim(p_layout->'background'->>'path'), 512),
        'opacity', least(1::numeric, greatest(0::numeric,
          coalesce((p_layout->'background'->>'opacity')::numeric, 0.9))),
        'fit', case
          when coalesce(p_layout->'background'->>'fit', 'contain') = 'cover' then 'cover'
          else 'contain'
        end
      );
    end if;
  end if;

  if jsonb_typeof(p_layout->'grid') = 'object'
     and jsonb_typeof(p_layout->'grid'->'columns') = 'number'
     and jsonb_typeof(p_layout->'grid'->'rows') = 'number' then
    v_ncols := greatest(1, least(120, floor((p_layout->'grid'->>'columns')::numeric)));
    v_nrows := greatest(1, least(120, floor((p_layout->'grid'->>'rows')::numeric)));
    v_grid := jsonb_build_object('columns', v_ncols::int, 'rows', v_nrows::int);
  end if;

  if jsonb_typeof(coalesce(p_layout->'walls', '[]'::jsonb)) = 'array' then
    v_walls := coalesce(
      (
        select jsonb_agg(elem order by ord)
        from (
          select elem, ord
          from jsonb_array_elements(coalesce(p_layout->'walls', '[]'::jsonb)) with ordinality as t(elem, ord)
          where ord <= 2000
        ) sub
      ),
      '[]'::jsonb
    );
  else
    v_walls := '[]'::jsonb;
  end if;

  if jsonb_typeof(coalesce(p_layout->'annotations', '[]'::jsonb)) = 'array' then
    v_ann := coalesce(
      (
        select jsonb_agg(elem order by ord)
        from (
          select elem, ord
          from jsonb_array_elements(coalesce(p_layout->'annotations', '[]'::jsonb)) with ordinality as t(elem, ord)
          where ord <= 500
        ) sub
      ),
      '[]'::jsonb
    );
  else
    v_ann := '[]'::jsonb;
  end if;

  if jsonb_typeof(coalesce(p_layout->'nodes', '[]'::jsonb)) <> 'array' then
    raise exception 'layout_nodes_must_be_array';
  end if;

  v_node_count := jsonb_array_length(coalesce(p_layout->'nodes', '[]'::jsonb));
  if v_node_count > v_max_nodes then
    raise exception 'too_many_layout_nodes';
  end if;

  for v_elem in
    select value from jsonb_array_elements(coalesce(p_layout->'nodes', '[]'::jsonb))
  loop
    v_id := left(trim(coalesce(v_elem->>'id', '')), 128);
    if length(v_id) < 1 then
      raise exception 'layout_node_id_required';
    end if;

    begin
      v_rid := (v_elem->>'resource_id')::uuid;
    exception when invalid_text_representation then
      raise exception 'layout_invalid_resource_id';
    end;

    if v_rid = any(v_seen) then
      raise exception 'duplicate_layout_resource';
    end if;
    v_seen := array_append(v_seen, v_rid);

    if not exists (
      select 1 from public.business_booking_resources br
      where br.id = v_rid
        and br.business_id = p_business_id
        and (
          p_floor_plan_id is null
          or br.floor_plan_id is null
          or br.floor_plan_id = p_floor_plan_id
        )
    ) then
      raise exception 'invalid_layout_resource';
    end if;

    v_type := lower(trim(coalesce(v_elem->>'type', 'table')));
    if v_type not in ('table', 'station', 'seat') then
      v_type := 'table';
    end if;

    v_shape := lower(trim(coalesce(v_elem->>'shape', 'rect')));
    if v_shape not in ('rect', 'circle', 'booth') then
      v_shape := 'rect';
    end if;

    v_x := greatest(0::numeric, least(1::numeric, coalesce((v_elem->>'x')::numeric, 0)));
    v_y := greatest(0::numeric, least(1::numeric, coalesce((v_elem->>'y')::numeric, 0)));
    v_w := greatest(v_min_dim, least(1::numeric, coalesce((v_elem->>'width')::numeric, v_min_dim)));
    v_h := greatest(v_min_dim, least(1::numeric, coalesce((v_elem->>'height')::numeric, v_min_dim)));

    if v_x > 1 - v_w then v_x := 1 - v_w; end if;
    if v_y > 1 - v_h then v_y := 1 - v_h; end if;

    v_rot := coalesce((v_elem->>'rotation')::numeric, 0);
    if v_rot is null or v_rot <> v_rot then v_rot := 0; end if;
    v_rot := v_rot % 360;
    if v_rot > 180 then v_rot := v_rot - 360; end if;
    if v_rot <= -180 then v_rot := v_rot + 360; end if;

    v_zone := left(trim(coalesce(v_elem->>'zone', 'default')), 120);
    if length(v_zone) < 1 then v_zone := 'default'; end if;

    v_label := left(trim(coalesce(v_elem->>'label', 'T')), 80);

    v_nodes := v_nodes || jsonb_build_array(
      jsonb_build_object(
        'id', v_id,
        'resource_id', v_rid,
        'type', v_type,
        'x', v_x,
        'y', v_y,
        'width', v_w,
        'height', v_h,
        'rotation', v_rot,
        'zone', v_zone,
        'shape', v_shape,
        'label', v_label
      )
    );
  end loop;

  v_out := jsonb_build_object(
    'version', v_ver,
    'bounds', jsonb_build_object('width_px', v_bw, 'height_px', v_bh),
    'background', coalesce(v_bg, 'null'::jsonb),
    'nodes', v_nodes,
    'walls', v_walls,
    'annotations', v_ann
  );

  if v_grid is not null then
    v_out := v_out || jsonb_build_object('grid', v_grid);
  end if;

  return v_out;
end;
$$;

comment on function public.normalize_floor_plan_layout_json(jsonb, uuid, uuid) is
  'Sanifica layout_json piano: limiti nodi/dimensioni, risorse UUID reali del business, payload bounded.';

-- Non esporre ai client: solo `upsert_floor_plan` (SECURITY DEFINER) la invoca.
revoke all on function public.normalize_floor_plan_layout_json(jsonb, uuid, uuid) from public;

create or replace function public.delete_floor_plan(
  p_business_id uuid,
  p_floor_plan_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted uuid;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'owner_only';
  end if;

  delete from public.business_floor_plans
  where id = p_floor_plan_id and business_id = p_business_id
  returning id into v_deleted;

  if v_deleted is null then
    raise exception 'floor_plan_not_found';
  end if;
end;
$$;

comment on function public.delete_floor_plan(uuid, uuid) is
  'Elimina piano sala (owner): FK risorse → floor_plan_id viene messo a null.';

revoke all on function public.delete_floor_plan(uuid, uuid) from public;
grant execute on function public.delete_floor_plan(uuid, uuid) to authenticated;

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
    v_layout := public.normalize_floor_plan_layout_json(p_layout_json, p_business_id, p_floor_plan_id);
  else
    v_layout := '{"version":1,"bounds":{"width_px":800,"height_px":600},"nodes":[],"walls":[],"annotations":[]}'::jsonb;
  end if;

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
