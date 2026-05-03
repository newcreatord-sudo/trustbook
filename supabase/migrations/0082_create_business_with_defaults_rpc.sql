create or replace function public.create_business_with_defaults(
  p_input jsonb
)
returns public.businesses
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  u_role user_role;
  b_row public.businesses;
  v_services jsonb;
  v_schedule jsonb;
  kv record;
  day_ranges jsonb;
  r jsonb;
  wd int;
  st text;
  en text;
  svc jsonb;
  svc_name text;
  svc_duration int;
  svc_price int;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select p.role into u_role
  from public.profiles p
  where p.id = uid;

  if u_role is distinct from 'attivita' then
    raise exception 'role_not_allowed';
  end if;

  insert into public.businesses (
    owner_user_id,
    name,
    category,
    description,
    address_text,
    postal_code,
    city,
    phone,
    email,
    website,
    lat,
    lng,
    logo_url,
    gallery_urls,
    is_paused,
    min_gap_min,
    approval_mode,
    required_reliability_min,
    cancellation_window_min,
    deposit_mode,
    deposit_value_type,
    deposit_fixed_cents,
    deposit_percent,
    deposit_min_cents,
    deposit_max_cents,
    deposit_green_rule,
    deposit_yellow_rule,
    deposit_red_rule,
    manual_approval_for_high_risk,
    cancellation_free_until_hours,
    refund_policy,
    deposit_retained_on_no_show,
    deposit_retained_on_late_cancel
  ) values (
    uid,
    nullif(trim(coalesce(p_input->>'name', '')), ''),
    nullif(trim(coalesce(p_input->>'category', '')), ''),
    nullif(trim(coalesce(p_input->>'description', '')), ''),
    nullif(trim(coalesce(p_input->>'addressText', '')), ''),
    nullif(trim(coalesce(p_input->>'postalCode', '')), ''),
    nullif(trim(coalesce(p_input->>'city', '')), ''),
    nullif(trim(coalesce(p_input->>'phone', '')), ''),
    nullif(trim(coalesce(p_input->>'email', '')), ''),
    nullif(trim(coalesce(p_input->>'website', '')), ''),
    greatest(-90, least(90, coalesce((p_input->>'lat')::double precision, 0))),
    greatest(-180, least(180, coalesce((p_input->>'lng')::double precision, 0))),
    nullif(trim(coalesce(p_input->>'logoUrl', '')), ''),
    coalesce(
      (select array_agg(x) from jsonb_array_elements_text(coalesce(p_input->'galleryUrls', '[]'::jsonb)) as t(x)),
      array[]::text[]
    ),
    coalesce((p_input->>'isPaused')::boolean, false),
    greatest(0, coalesce((p_input->>'minGapMin')::int, 0)),
    coalesce((p_input->>'approvalMode')::approval_mode, 'risk_based'::approval_mode),
    greatest(0, least(100, coalesce((p_input->>'requiredReliabilityMin')::int, 0))),
    greatest(0, coalesce((p_input->>'cancellationWindowMin')::int, 0)),
    coalesce(p_input->>'depositMode', 'none'),
    coalesce(p_input->>'depositValueType', 'percentage'),
    greatest(0, coalesce((p_input->>'depositFixedCents')::int, 0)),
    greatest(0, least(100, coalesce((p_input->>'depositPercent')::int, 0))),
    nullif(greatest(0, coalesce((p_input->>'depositMinCents')::int, 0)), 0),
    nullif(greatest(0, coalesce((p_input->>'depositMaxCents')::int, 0)), 0),
    coalesce(p_input->'depositGreenRule', '{"type":"percentage","value":0}'::jsonb),
    coalesce(p_input->'depositYellowRule', '{"type":"percentage","value":20}'::jsonb),
    coalesce(p_input->'depositRedRule', '{"type":"percentage","value":50}'::jsonb),
    coalesce((p_input->>'manualApprovalForHighRisk')::boolean, true),
    greatest(0, coalesce((p_input->>'cancellationFreeUntilHours')::int, 24)),
    coalesce(p_input->>'refundPolicy', 'flexible'),
    coalesce((p_input->>'depositRetainedOnNoShow')::boolean, true),
    coalesce((p_input->>'depositRetainedOnLateCancel')::boolean, true)
  )
  returning * into b_row;

  v_services := p_input->'services';
  if jsonb_typeof(v_services) = 'array' and jsonb_array_length(v_services) > 0 then
    for svc in select * from jsonb_array_elements(v_services)
    loop
      svc_name := nullif(trim(coalesce(svc->>'name', '')), '');
      if svc_name is null then
        continue;
      end if;
      svc_duration := greatest(5, coalesce((svc->>'durationMin')::int, 45));
      svc_price := case when svc ? 'priceCents' and svc->>'priceCents' is not null then (svc->>'priceCents')::int else null end;
      insert into public.services (business_id, name, duration_min, price_cents)
      values (b_row.id, svc_name, svc_duration, svc_price);
    end loop;
  else
    insert into public.services (business_id, name, duration_min)
    values (b_row.id, 'Servizio base', 45);
  end if;

  v_schedule := p_input->'schedule';
  if jsonb_typeof(v_schedule) = 'object' then
    for kv in select key, value from jsonb_each(v_schedule)
    loop
      wd := nullif(trim(kv.key), '')::int;
      if wd < 0 or wd > 6 then
        continue;
      end if;
      day_ranges := kv.value;
      if jsonb_typeof(day_ranges) <> 'array' then
        continue;
      end if;
      for r in select * from jsonb_array_elements(day_ranges)
      loop
        st := nullif(trim(coalesce(r->>'start', '')), '');
        en := nullif(trim(coalesce(r->>'end', '')), '');
        if st is null or en is null then
          continue;
        end if;
        insert into public.business_opening_windows (business_id, weekday, start_time, end_time)
        values (b_row.id, wd, st::time, en::time);
      end loop;
    end loop;
  end if;

  return b_row;
end;
$$;

revoke all on function public.create_business_with_defaults(jsonb) from public;
grant execute on function public.create_business_with_defaults(jsonb) to authenticated;
