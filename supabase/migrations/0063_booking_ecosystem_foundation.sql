-- TrustBook ecosystem foundation: vertical booking modes, resources (tables/seats/etc.),
-- optional no-show suite KPI baseline/target, assignments linked to bookings.
-- AI/actions MUST still use existing RPC (create_booking_v3, transition_booking_state); no bypass.

create table if not exists public.business_booking_ecosystem (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  booking_vertical text not null default 'service'
    check (booking_vertical in ('service','hospitality_table','seat_assignment','professional_slot')),
  resource_management_enabled boolean not null default false,
  no_show_suite_enabled boolean not null default false,
  baseline_no_show_rate_pct numeric(6,3),
  target_no_show_rate_pct numeric(6,3) not null default 1.000,
  ai_strict_confirmation_required boolean not null default true,
  ecosystem_notes text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists business_booking_ecosystem_set_updated_at on public.business_booking_ecosystem;
create trigger business_booking_ecosystem_set_updated_at
before update on public.business_booking_ecosystem
for each row execute function public.set_updated_at();

create table if not exists public.business_floor_plans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  layout_json jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists business_floor_plans_set_updated_at on public.business_floor_plans;
create trigger business_floor_plans_set_updated_at
before update on public.business_floor_plans
for each row execute function public.set_updated_at();

create index if not exists business_floor_plans_business_idx on public.business_floor_plans (business_id);

create table if not exists public.business_booking_resources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  floor_plan_id uuid references public.business_floor_plans(id) on delete set null,
  kind text not null check (kind in ('table','room','chair','station','equipment','seat')),
  label text not null,
  capacity_min int not null default 1 check (capacity_min >= 1),
  capacity_max int not null default 4 check (capacity_max >= capacity_min),
  position_json jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists business_booking_resources_set_updated_at on public.business_booking_resources;
create trigger business_booking_resources_set_updated_at
before update on public.business_booking_resources
for each row execute function public.set_updated_at();

create index if not exists business_booking_resources_business_idx on public.business_booking_resources (business_id);

create table if not exists public.booking_resource_assignments (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  primary_resource_id uuid references public.business_booking_resources(id) on delete set null,
  party_size int check (party_size is null or party_size >= 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.ensure_business_booking_ecosystem_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.business_booking_ecosystem (business_id) values (new.id)
  on conflict (business_id) do nothing;
  return new;
end;
$$;

drop trigger if exists businesses_booking_ecosystem_seed on public.businesses;
create trigger businesses_booking_ecosystem_seed
after insert on public.businesses
for each row execute function public.ensure_business_booking_ecosystem_row();

alter table public.user_preferences
  add column if not exists voice_commands_enabled boolean not null default false;

-- Backfill ecosystem rows for existing businesses
insert into public.business_booking_ecosystem (business_id)
select b.id from public.businesses b
where not exists (
  select 1 from public.business_booking_ecosystem e where e.business_id = b.id
);

alter table public.business_booking_ecosystem enable row level security;
alter table public.business_floor_plans enable row level security;
alter table public.business_booking_resources enable row level security;
alter table public.booking_resource_assignments enable row level security;

drop policy if exists business_booking_ecosystem_member_all on public.business_booking_ecosystem;
create policy business_booking_ecosystem_member_all on public.business_booking_ecosystem
for all to authenticated
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

drop policy if exists business_floor_plans_member_all on public.business_floor_plans;
create policy business_floor_plans_member_all on public.business_floor_plans
for all to authenticated
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

drop policy if exists business_booking_resources_member_all on public.business_booking_resources;
create policy business_booking_resources_member_all on public.business_booking_resources
for all to authenticated
using (public.is_business_member(business_id))
with check (public.is_business_member(business_id));

drop policy if exists booking_resource_assignments_select on public.booking_resource_assignments;
create policy booking_resource_assignments_select on public.booking_resource_assignments
for select to authenticated
using (
  exists (
    select 1 from public.bookings bk
    where bk.id = booking_id
      and (
        bk.customer_user_id = auth.uid()
        or public.is_business_member(bk.business_id)
      )
  )
);

drop policy if exists booking_resource_assignments_write on public.booking_resource_assignments;
create policy booking_resource_assignments_write on public.booking_resource_assignments
for all to authenticated
using (
  exists (
    select 1 from public.bookings bk
    where bk.id = booking_id
      and public.is_business_member(bk.business_id)
  )
)
with check (
  exists (
    select 1 from public.bookings bk
    where bk.id = booking_id
      and public.is_business_member(bk.business_id)
  )
);

revoke all on public.business_booking_ecosystem from anon;
revoke all on public.business_floor_plans from anon;
revoke all on public.business_booking_resources from anon;
revoke all on public.booking_resource_assignments from anon;

grant select, insert, update, delete on public.business_booking_ecosystem to authenticated;
grant select, insert, update, delete on public.business_floor_plans to authenticated;
grant select, insert, update, delete on public.business_booking_resources to authenticated;
grant select, insert, update, delete on public.booking_resource_assignments to authenticated;
