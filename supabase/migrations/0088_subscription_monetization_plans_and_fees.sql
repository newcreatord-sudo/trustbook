create table if not exists public.business_platform_fee_overrides (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  percent_min numeric(5,2) not null,
  percent_max numeric(5,2) not null,
  percent_default numeric(5,2) not null,
  fixed_cents int not null default 0,
  starts_at timestamptz null,
  ends_at timestamptz null,
  note text null,
  created_by_user_id uuid null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.business_platform_fee_overrides enable row level security;

drop policy if exists business_fee_overrides_select_member on public.business_platform_fee_overrides;
create policy business_fee_overrides_select_member on public.business_platform_fee_overrides
for select to authenticated
using (public.is_business_member(business_id));

create or replace function public.get_effective_platform_fee_policy(
  p_business_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_plan_id text;
  v_features jsonb;
  v_now timestamptz := now();
  v_override public.business_platform_fee_overrides;
  v_global record;
  pmin numeric(5,2);
  pmax numeric(5,2);
  pdef numeric(5,2);
  fixed int;
  source text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if not public.is_business_member(p_business_id) then
    raise exception 'forbidden';
  end if;

  select bs.plan_id
  into v_plan_id
  from public.business_subscriptions bs
  where bs.business_id = p_business_id
  limit 1;

  select sp.features
  into v_features
  from public.subscription_plans sp
  where sp.id = v_plan_id
  limit 1;

  select *
  into v_override
  from public.business_platform_fee_overrides o
  where o.business_id = p_business_id
    and (o.starts_at is null or o.starts_at <= v_now)
    and (o.ends_at is null or o.ends_at >= v_now);

  if found then
    pmin := v_override.percent_min;
    pmax := v_override.percent_max;
    pdef := v_override.percent_default;
    fixed := v_override.fixed_cents;
    source := 'override';
  elsif v_features is not null then
    pmin := greatest(0, coalesce((v_features->>'platform_fee_percent_min')::numeric, null));
    pmax := greatest(0, coalesce((v_features->>'platform_fee_percent_max')::numeric, null));
    pdef := greatest(0, coalesce((v_features->>'platform_fee_percent_default')::numeric, null));
    fixed := greatest(0, coalesce((v_features->>'platform_fee_fixed_cents')::int, 0));
    source := 'plan';
  end if;

  if pmin is null or pmax is null or pdef is null then
    select platform_fee_percent, platform_fee_fixed_cents
    into v_global
    from public.platform_settings
    limit 1;
    pmin := greatest(0, coalesce(v_global.platform_fee_percent, 0));
    pmax := greatest(0, coalesce(v_global.platform_fee_percent, 0));
    pdef := greatest(0, coalesce(v_global.platform_fee_percent, 0));
    fixed := greatest(0, coalesce(v_global.platform_fee_fixed_cents, 0));
    source := 'global';
  end if;

  if pmax < pmin then
    pmax := pmin;
  end if;
  if pdef < pmin then
    pdef := pmin;
  end if;
  if pdef > pmax then
    pdef := pmax;
  end if;

  return jsonb_build_object(
    'business_id', p_business_id,
    'source', source,
    'percent_min', pmin,
    'percent_max', pmax,
    'percent_default', pdef,
    'fixed_cents', fixed
  );
end;
$$;

revoke all on function public.get_effective_platform_fee_policy(uuid) from public;
grant execute on function public.get_effective_platform_fee_policy(uuid) to authenticated;

insert into public.subscription_plans (id, target_audience, name, description, price_cents, billing_interval, features, is_active)
values
  (
    'business_free',
    'business',
    'FREE',
    'Prenotazioni base, 1 staff, regole caparra base. Commissione piattaforma più alta.',
    0,
    'monthly',
    jsonb_build_object(
      'max_staff', 1,
      'max_services', 10,
      'anti_noshow', true,
      'no_show_suite', false,
      'custom_deposits', false,
      'resource_management', true,
      'platform_fee_percent_min', 3.00,
      'platform_fee_percent_max', 4.00,
      'platform_fee_percent_default', 4.00,
      'platform_fee_fixed_cents', 0
    ),
    true
  ),
  (
    'business_pro',
    'business',
    'PRO',
    'Staff multiplo, agenda avanzata, statistiche, caparra dinamica, notifiche avanzate. Commissione ridotta.',
    0,
    'monthly',
    jsonb_build_object(
      'max_staff', 10,
      'max_services', 50,
      'anti_noshow', true,
      'no_show_suite', true,
      'custom_deposits', true,
      'resource_management', true,
      'advanced_agenda', true,
      'stats', true,
      'dynamic_deposit', true,
      'advanced_notifications', true,
      'platform_fee_percent_min', 1.50,
      'platform_fee_percent_max', 2.00,
      'platform_fee_percent_default', 2.00,
      'platform_fee_fixed_cents', 0
    ),
    true
  ),
  (
    'business_ultra',
    'business',
    'ULTRA',
    'AI suggestions, automazioni avanzate, multi-sede, priorità discovery, report avanzati. Commissione minima.',
    0,
    'monthly',
    jsonb_build_object(
      'max_staff', 999,
      'max_services', 999,
      'anti_noshow', true,
      'no_show_suite', true,
      'custom_deposits', true,
      'resource_management', true,
      'advanced_agenda', true,
      'stats', true,
      'dynamic_deposit', true,
      'advanced_notifications', true,
      'ai_suggestions', true,
      'advanced_automations', true,
      'multi_location', true,
      'discovery_priority', true,
      'advanced_reports', true,
      'platform_fee_percent_min', 0.50,
      'platform_fee_percent_max', 1.00,
      'platform_fee_percent_default', 1.00,
      'platform_fee_fixed_cents', 0
    ),
    true
  ),
  (
    'customer_free',
    'customer',
    'FREE',
    'Prenotazione standard e storico affidabilità.',
    0,
    'monthly',
    jsonb_build_object(
      'priority_booking', false,
      'no_deposit_required', false,
      'advanced_reminders', false,
      'perks', false
    ),
    true
  ),
  (
    'customer_plus',
    'customer',
    'PLUS',
    'Prenota più velocemente, promemoria avanzati, vantaggi futuri e profilo affidabilità valorizzato.',
    0,
    'monthly',
    jsonb_build_object(
      'priority_booking', true,
      'no_deposit_required', false,
      'advanced_reminders', true,
      'perks', true,
      'reputation_boost', true
    ),
    true
  )
on conflict (id) do update
set
  target_audience = excluded.target_audience,
  name = excluded.name,
  description = excluded.description,
  price_cents = excluded.price_cents,
  billing_interval = excluded.billing_interval,
  features = excluded.features,
  is_active = excluded.is_active;

update public.subscription_plans
set is_active = false
where id in ('business_elite');
