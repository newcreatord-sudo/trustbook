create table if not exists public.user_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  event_type text not null check (event_type in ('login','logout','password_changed')),
  source text not null default 'app' check (source in ('app','recovery')),

  device text null,
  user_agent text null,
  ip text null,

  created_at timestamptz not null default now()
);

create index if not exists idx_user_security_events_user_id_created_at on public.user_security_events (user_id, created_at desc);

alter table public.user_security_events enable row level security;

drop policy if exists user_security_events_select_own on public.user_security_events;
create policy user_security_events_select_own on public.user_security_events
for select to authenticated
using (user_id = auth.uid());

drop policy if exists user_security_events_insert_own on public.user_security_events;
create policy user_security_events_insert_own on public.user_security_events
for insert to authenticated
with check (user_id = auth.uid());

revoke all on public.user_security_events from anon;
grant all privileges on public.user_security_events to authenticated;

