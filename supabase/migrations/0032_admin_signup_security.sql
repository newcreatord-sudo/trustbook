-- 0032_admin_signup_security.sql
-- Security telemetry for admin signup endpoint.

create table if not exists public.admin_security_events (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null,
  ip text,
  user_agent text,
  email text,
  role text,
  success boolean not null default false,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists admin_security_events_created_idx
on public.admin_security_events (created_at desc);

create index if not exists admin_security_events_endpoint_created_idx
on public.admin_security_events (endpoint, created_at desc);

alter table public.admin_security_events enable row level security;

drop policy if exists admin_security_events_select_none on public.admin_security_events;
create policy admin_security_events_select_none on public.admin_security_events
for select to authenticated
using (false);

drop policy if exists admin_security_events_write_none on public.admin_security_events;
create policy admin_security_events_write_none on public.admin_security_events
for all to authenticated
using (false)
with check (false);

revoke all on public.admin_security_events from anon;
revoke all on public.admin_security_events from authenticated;
