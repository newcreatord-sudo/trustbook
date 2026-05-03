create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('cliente', 'attivita');
  end if;
  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type booking_status as enum (
      'draft',
      'requested',
      'pending_approval',
      'pending_deposit',
      'confirmed',
      'rejected',
      'cancelled_by_customer',
      'cancelled_by_business',
      'completed',
      'no_show',
      'late_cancel'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'deposit_status') then
    create type deposit_status as enum ('not_required', 'required', 'paid', 'refunded', 'forfeited');
  end if;
  if not exists (select 1 from pg_type where typname = 'approval_mode') then
    create type approval_mode as enum ('auto', 'manual', 'risk_based');
  end if;
  if not exists (select 1 from pg_type where typname = 'review_direction') then
    create type review_direction as enum ('customer_to_business', 'business_to_customer');
  end if;
end
$$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  first_name text,
  last_name text,
  phone text,
  avatar_url text,
  city text,
  lat double precision,
  lng double precision,
  account_status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at
before update on profiles
for each row execute function set_updated_at();

create table if not exists businesses (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null,
  description text,
  address_text text,
  postal_code text,
  city text,
  phone text,
  email text,
  website text,
  lat double precision not null,
  lng double precision not null,
  approval_mode approval_mode not null default 'risk_based',
  required_reliability_min int not null default 0,
  cancellation_window_min int not null default 120,
  deposit_enabled boolean not null default false,
  deposit_fixed_cents int,
  deposit_percent int,
  deposit_min_cents int,
  deposit_max_cents int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists businesses_set_updated_at on businesses;
create trigger businesses_set_updated_at
before update on businesses
for each row execute function set_updated_at();

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  duration_min int not null,
  price_cents int,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists services_set_updated_at on services;
create trigger services_set_updated_at
before update on services
for each row execute function set_updated_at();

create table if not exists business_opening_windows (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time)
);

drop trigger if exists business_opening_windows_set_updated_at on business_opening_windows;
create trigger business_opening_windows_set_updated_at
before update on business_opening_windows
for each row execute function set_updated_at();

create table if not exists business_closures (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_at < end_at)
);

drop trigger if exists business_closures_set_updated_at on business_closures;
create trigger business_closures_set_updated_at
before update on business_closures
for each row execute function set_updated_at();

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references auth.users(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  service_id uuid not null references services(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status booking_status not null default 'requested',
  deposit_status deposit_status not null default 'not_required',
  deposit_amount_cents int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  no_show_at timestamptz,
  check (start_at < end_at)
);

drop trigger if exists bookings_set_updated_at on bookings;
create trigger bookings_set_updated_at
before update on bookings
for each row execute function set_updated_at();

create index if not exists bookings_business_time_idx on bookings (business_id, start_at);
create index if not exists bookings_customer_time_idx on bookings (customer_user_id, start_at);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  direction review_direction not null,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

create unique index if not exists reviews_unique_booking_direction_author
on reviews (booking_id, direction, author_user_id);

create table if not exists customer_reliability (
  user_id uuid primary key references auth.users(id) on delete cascade,
  score int not null default 80 check (score between 0 and 100),
  completed_count int not null default 0,
  late_cancel_count int not null default 0,
  no_show_count int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists reliability_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  booking_id uuid references bookings(id) on delete set null,
  kind text not null,
  delta int not null,
  created_at timestamptz not null default now()
);

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create or replace function is_business_owner(bid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from businesses b
    where b.id = bid and b.owner_user_id = auth.uid()
  );
$$;

alter table profiles enable row level security;
alter table businesses enable row level security;
alter table services enable row level security;
alter table business_opening_windows enable row level security;
alter table business_closures enable row level security;
alter table bookings enable row level security;
alter table reviews enable row level security;
alter table customer_reliability enable row level security;
alter table reliability_events enable row level security;
alter table team_members enable row level security;

drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles
for select to authenticated
using (id = auth.uid());

drop policy if exists profiles_insert_own on profiles;
create policy profiles_insert_own on profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists businesses_select_authed on businesses;
create policy businesses_select_authed on businesses
for select to authenticated
using (true);

drop policy if exists businesses_insert_owner on businesses;
create policy businesses_insert_owner on businesses
for insert to authenticated
with check (owner_user_id = auth.uid());

drop policy if exists businesses_update_owner on businesses;
create policy businesses_update_owner on businesses
for update to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists services_select_authed on services;
create policy services_select_authed on services
for select to authenticated
using (true);

drop policy if exists services_write_owner on services;
create policy services_write_owner on services
for all to authenticated
using (is_business_owner(business_id))
with check (is_business_owner(business_id));

drop policy if exists opening_windows_select_authed on business_opening_windows;
create policy opening_windows_select_authed on business_opening_windows
for select to authenticated
using (true);

drop policy if exists opening_windows_write_owner on business_opening_windows;
create policy opening_windows_write_owner on business_opening_windows
for all to authenticated
using (is_business_owner(business_id))
with check (is_business_owner(business_id));

drop policy if exists closures_select_authed on business_closures;
create policy closures_select_authed on business_closures
for select to authenticated
using (true);

drop policy if exists closures_write_owner on business_closures;
create policy closures_write_owner on business_closures
for all to authenticated
using (is_business_owner(business_id))
with check (is_business_owner(business_id));

drop policy if exists bookings_select_participant on bookings;
create policy bookings_select_participant on bookings
for select to authenticated
using (
  customer_user_id = auth.uid()
  or is_business_owner(business_id)
);

drop policy if exists bookings_insert_customer on bookings;
create policy bookings_insert_customer on bookings
for insert to authenticated
with check (customer_user_id = auth.uid());

drop policy if exists bookings_update_participant on bookings;
create policy bookings_update_participant on bookings
for update to authenticated
using (
  customer_user_id = auth.uid()
  or is_business_owner(business_id)
)
with check (
  customer_user_id = auth.uid()
  or is_business_owner(business_id)
);

drop policy if exists reviews_select_authed on reviews;
create policy reviews_select_authed on reviews
for select to authenticated
using (true);

drop policy if exists reviews_insert_author on reviews;
create policy reviews_insert_author on reviews
for insert to authenticated
with check (author_user_id = auth.uid());

drop policy if exists reliability_select_authed on customer_reliability;
create policy reliability_select_authed on customer_reliability
for select to authenticated
using (true);

drop policy if exists reliability_update_own on customer_reliability;
create policy reliability_update_own on customer_reliability
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists reliability_insert_own on customer_reliability;
create policy reliability_insert_own on customer_reliability
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists events_select_authed on reliability_events;
create policy events_select_authed on reliability_events
for select to authenticated
using (true);

drop policy if exists events_insert_authed on reliability_events;
create policy events_insert_authed on reliability_events
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists team_select_owner on team_members;
create policy team_select_owner on team_members
for select to authenticated
using (is_business_owner(business_id) or user_id = auth.uid());

drop policy if exists team_write_owner on team_members;
create policy team_write_owner on team_members
for all to authenticated
using (is_business_owner(business_id))
with check (is_business_owner(business_id));

